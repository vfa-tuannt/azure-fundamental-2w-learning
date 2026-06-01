import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { ActivityEventType } from '../activity/activity-event-type.enum';
import { ActivityService } from '../activity/activity.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import { Challenge, ChallengeStatus } from '../challenges/challenge.entity';
import { EnrollmentStatus } from './enrollment-status.enum';
import { Enrollment } from './enrollment.entity';
import { EnrollmentDto } from './dto/enrollment.dto';
import { MyEnrollmentDto } from './dto/my-enrollment.dto';

const UNIQUE_VIOLATION = '23505';

@Injectable()
export class EnrollmentsService {
  constructor(
    @InjectRepository(Enrollment)
    private readonly enrollments: Repository<Enrollment>,
    @InjectRepository(Challenge)
    private readonly challenges: Repository<Challenge>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly activity: ActivityService,
    private readonly telemetry: TelemetryService,
  ) {}

  async enroll(challengeId: string, userId: string): Promise<EnrollmentDto> {
    const { dto, challengeTitle } = await this.dataSource.transaction(
      'SERIALIZABLE',
      async (manager) => {
        const challenges = manager.getRepository(Challenge);
        const enrollments = manager.getRepository(Enrollment);

        const challenge = await challenges.findOne({
          where: { id: challengeId },
        });
        if (!challenge) {
          throw new NotFoundException();
        }
        if (challenge.status === ChallengeStatus.CLOSED) {
          throw new BadRequestException(
            'This challenge is no longer accepting enrollments',
          );
        }
        if (challenge.ownerId === userId) {
          throw new BadRequestException(
            'You cannot enroll in your own challenge',
          );
        }

        const existing = await enrollments.findOne({
          where: { challengeId, userId },
        });
        if (existing) {
          throw new ConflictException(
            'You are already enrolled in this challenge',
          );
        }

        if (challenge.maxEnrollments !== null) {
          const activeCount = await enrollments
            .createQueryBuilder('e')
            .where('e.challenge_id = :challengeId', { challengeId })
            .andWhere('e.status != :rejected', {
              rejected: EnrollmentStatus.REJECTED,
            })
            .getCount();
          if (activeCount >= challenge.maxEnrollments) {
            throw new ConflictException(
              'This challenge has reached its enrollment cap',
            );
          }
        }

        const entity = enrollments.create({
          challengeId,
          userId,
          status: EnrollmentStatus.IN_PROGRESS,
        });

        try {
          const saved = await enrollments.save(entity);
          return { dto: this.toDto(saved), challengeTitle: challenge.title };
        } catch (err) {
          if (
            err instanceof QueryFailedError &&
            (err.driverError as { code?: string })?.code === UNIQUE_VIOLATION
          ) {
            throw new ConflictException(
              'You are already enrolled in this challenge',
            );
          }
          throw err;
        }
      },
    );

    await this.activity.record({
      userId,
      type: ActivityEventType.ENROLLED,
      payload: {
        challengeId,
        challengeTitle,
        enrollmentId: dto.id,
      },
    });
    this.telemetry.trackEvent('enrollment.created', {
      userId,
      challengeId,
      challengeTitle,
      enrollmentId: dto.id,
    });
    return dto;
  }

  async withdraw(challengeId: string, userId: string): Promise<void> {
    const entity = await this.enrollments.findOne({
      where: { challengeId, userId },
    });
    if (!entity) {
      throw new NotFoundException();
    }
    if (entity.status !== EnrollmentStatus.IN_PROGRESS) {
      throw new ConflictException(
        'You cannot withdraw after submitting; contact the challenge owner',
      );
    }
    await this.enrollments.remove(entity);
  }

  async findMyEnrollment(
    challengeId: string,
    userId: string,
  ): Promise<EnrollmentDto> {
    const entity = await this.enrollments.findOne({
      where: { challengeId, userId },
    });
    if (!entity) {
      throw new NotFoundException();
    }
    return this.toDto(entity);
  }

  async listMine(userId: string): Promise<MyEnrollmentDto[]> {
    const rows = await this.enrollments
      .createQueryBuilder('e')
      .innerJoinAndSelect('e.challenge', 'c')
      .where('e.user_id = :userId', { userId })
      .andWhere('c.deleted_at IS NULL')
      .orderBy('e.enrolled_at', 'DESC')
      .getMany();

    return rows.map((e) => ({
      ...this.toDto(e),
      challenge: {
        id: e.challenge.id,
        title: e.challenge.title,
        deadline: e.challenge.deadline.toISOString(),
        status: e.challenge.status,
        requiredSkills: e.challenge.requiredSkills,
      },
    }));
  }

  async countActiveForChallenge(challengeId: string): Promise<number> {
    return this.enrollments
      .createQueryBuilder('e')
      .where('e.challenge_id = :challengeId', { challengeId })
      .andWhere('e.status != :rejected', {
        rejected: EnrollmentStatus.REJECTED,
      })
      .getCount();
  }

  private toDto(entity: Enrollment): EnrollmentDto {
    return {
      id: entity.id,
      challengeId: entity.challengeId,
      userId: entity.userId,
      status: entity.status,
      enrolledAt: entity.enrolledAt.toISOString(),
    };
  }
}
