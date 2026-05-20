import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { ActivityEventType } from '../activity/activity-event-type.enum';
import { ActivityService } from '../activity/activity.service';
import { Challenge } from '../challenges/challenge.entity';
import { EnrollmentStatus } from '../enrollments/enrollment-status.enum';
import { Enrollment } from '../enrollments/enrollment.entity';
import { SubmissionDto } from '../submissions/dto/submission.dto';
import { Submission } from '../submissions/submission.entity';
import { SubmissionsService } from '../submissions/submissions.service';
import { User } from '../users/user.entity';
import {
  ChallengeSubmissionDto,
  ChallengeSubmissionEnrollment,
  ChallengeSubmissionSubmitter,
} from './dto/challenge-submission.dto';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Submission)
    private readonly submissions: Repository<Submission>,
    @InjectRepository(Enrollment)
    private readonly enrollments: Repository<Enrollment>,
    @InjectRepository(Challenge)
    private readonly challenges: Repository<Challenge>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly submissionsService: SubmissionsService,
    private readonly activity: ActivityService,
  ) {}

  async approve(
    submissionId: string,
    callerUserId: string,
  ): Promise<SubmissionDto> {
    return this.applyReview(submissionId, callerUserId, {
      nextStatus: EnrollmentStatus.APPROVED,
      rejectionReason: null,
    });
  }

  async reject(
    submissionId: string,
    callerUserId: string,
    reason?: string,
  ): Promise<SubmissionDto> {
    const trimmed = reason?.trim() ?? '';
    return this.applyReview(submissionId, callerUserId, {
      nextStatus: EnrollmentStatus.REJECTED,
      rejectionReason: trimmed.length > 0 ? trimmed : null,
    });
  }

  async listForChallenge(
    challengeId: string,
    callerUserId: string,
  ): Promise<ChallengeSubmissionDto[]> {
    const challenge = await this.challenges.findOne({
      where: { id: challengeId, deletedAt: IsNull() },
    });
    if (!challenge) {
      throw new NotFoundException();
    }
    if (challenge.ownerId !== callerUserId) {
      throw new ForbiddenException();
    }

    const rows = await this.submissions
      .createQueryBuilder('s')
      .innerJoin(Enrollment, 'e', 'e.id = s.enrollment_id')
      .innerJoin(User, 'u', 'u.id = e.user_id')
      .where('e.challenge_id = :challengeId', { challengeId })
      .orderBy('s.submitted_at', 'DESC')
      .select('s')
      .addSelect('e.id', 'e_id')
      .addSelect('e.user_id', 'e_user_id')
      .addSelect('e.status', 'e_status')
      .addSelect('u.id', 'u_id')
      .addSelect('u.name', 'u_name')
      .addSelect('u.email', 'u_email')
      .addSelect('u.avatar_url', 'u_avatar_url')
      .getRawAndEntities();

    return rows.entities.map((entity, idx) => {
      const raw = rows.raw[idx] as {
        e_id: string;
        e_user_id: string;
        e_status: EnrollmentStatus;
        u_id: string;
        u_name: string;
        u_email: string;
        u_avatar_url: string | null;
      };
      const enrollment: ChallengeSubmissionEnrollment = {
        id: raw.e_id,
        userId: raw.e_user_id,
        status: raw.e_status,
      };
      const submitter: ChallengeSubmissionSubmitter = {
        id: raw.u_id,
        name: raw.u_name,
        email: raw.u_email,
        avatarUrl: raw.u_avatar_url,
      };
      return this.toChallengeSubmissionDto(entity, enrollment, submitter);
    });
  }

  toChallengeSubmissionDto(
    submission: Submission,
    enrollment: ChallengeSubmissionEnrollment,
    submitter: ChallengeSubmissionSubmitter,
  ): ChallengeSubmissionDto {
    return {
      ...this.submissionsService.toDto(submission),
      enrollment,
      submitter,
    };
  }

  private async applyReview(
    submissionId: string,
    callerUserId: string,
    decision: {
      nextStatus: EnrollmentStatus.APPROVED | EnrollmentStatus.REJECTED;
      rejectionReason: string | null;
    },
  ): Promise<SubmissionDto> {
    const submission = await this.submissions.findOne({
      where: { id: submissionId },
    });
    if (!submission) {
      throw new NotFoundException();
    }

    const enrollment = await this.enrollments.findOne({
      where: { id: submission.enrollmentId },
    });
    if (!enrollment) {
      throw new NotFoundException();
    }

    const challenge = await this.challenges.findOne({
      where: { id: enrollment.challengeId },
    });
    if (!challenge) {
      throw new NotFoundException();
    }

    if (challenge.ownerId !== callerUserId) {
      throw new ForbiddenException();
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const enrollments = manager.getRepository(Enrollment);
      const submissions = manager.getRepository(Submission);

      const locked = await enrollments
        .createQueryBuilder('e')
        .setLock('pessimistic_write')
        .where('e.id = :id', { id: submission.enrollmentId })
        .getOne();
      if (!locked) {
        throw new NotFoundException();
      }
      if (locked.status !== EnrollmentStatus.SUBMITTED) {
        throw new ConflictException(
          'Submissions can only be reviewed while the enrollment is in submitted state',
        );
      }

      const lockedSubmission = await submissions.findOne({
        where: { id: submissionId },
      });
      if (!lockedSubmission) {
        throw new NotFoundException();
      }

      lockedSubmission.reviewedAt = new Date();
      lockedSubmission.rejectionReason = decision.rejectionReason;
      const saved = await submissions.save(lockedSubmission);

      locked.status = decision.nextStatus;
      await enrollments.save(locked);

      return this.submissionsService.toDto(saved);
    });

    if (decision.nextStatus === EnrollmentStatus.APPROVED) {
      await this.activity.record({
        userId: enrollment.userId,
        type: ActivityEventType.APPROVED,
        payload: {
          submissionId: result.id,
          enrollmentId: enrollment.id,
          challengeId: challenge.id,
          challengeTitle: challenge.title,
          reviewerId: callerUserId,
        },
      });
    } else {
      await this.activity.record({
        userId: enrollment.userId,
        type: ActivityEventType.REJECTED,
        payload: {
          submissionId: result.id,
          enrollmentId: enrollment.id,
          challengeId: challenge.id,
          challengeTitle: challenge.title,
          reviewerId: callerUserId,
          rejectionReason: result.rejectionReason,
        },
      });
    }
    return result;
  }
}
