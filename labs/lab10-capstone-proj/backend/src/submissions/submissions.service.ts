import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ActivityEventType } from '../activity/activity-event-type.enum';
import { ActivityService } from '../activity/activity.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import { Challenge } from '../challenges/challenge.entity';
import { EnrollmentStatus } from '../enrollments/enrollment-status.enum';
import { Enrollment } from '../enrollments/enrollment.entity';
import { AzureBlobStorageService } from './azure-blob-storage.service';
import { Submission } from './submission.entity';
import { SubmissionDto } from './dto/submission.dto';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const ALLOWED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/zip',
  'text/markdown',
] as const;

type AllowedMime = (typeof ALLOWED_MIME)[number];

interface SubmissionContext {
  submission: Submission;
  enrollment: Enrollment;
  challenge: Challenge;
}

const MAGIC_BYTES: Record<Exclude<AllowedMime, 'text/markdown'>, number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
  'image/png': [[0x89, 0x50, 0x4e, 0x47]], // \x89PNG
  'image/jpeg': [[0xff, 0xd8, 0xff]], // JPEG SOI
  'application/zip': [
    [0x50, 0x4b, 0x03, 0x04],
    [0x50, 0x4b, 0x05, 0x06], // empty archive
    [0x50, 0x4b, 0x07, 0x08], // spanned
  ],
};

@Injectable()
export class SubmissionsService {
  private readonly logger = new Logger(SubmissionsService.name);

  constructor(
    @InjectRepository(Submission)
    private readonly submissions: Repository<Submission>,
    @InjectRepository(Enrollment)
    private readonly enrollments: Repository<Enrollment>,
    @InjectRepository(Challenge)
    private readonly challenges: Repository<Challenge>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly blobStorage: AzureBlobStorageService,
    private readonly activity: ActivityService,
    private readonly telemetry: TelemetryService,
  ) {}

  validateFile(file: Express.Multer.File): void {
    if (!ALLOWED_MIME.includes(file.mimetype as AllowedMime)) {
      throw new UnprocessableEntityException({
        message: `File type ${file.mimetype} is not allowed`,
        allowed: ALLOWED_MIME,
      });
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new UnprocessableEntityException({
        message: `File size ${file.size} exceeds the ${MAX_FILE_BYTES}-byte limit`,
        allowed: ALLOWED_MIME,
      });
    }
    if (file.mimetype !== 'text/markdown') {
      const expected =
        MAGIC_BYTES[file.mimetype as Exclude<AllowedMime, 'text/markdown'>];
      const ok = expected.some((sig) => this.matchesMagic(file.buffer, sig));
      if (!ok) {
        throw new UnprocessableEntityException({
          message: `File contents do not match declared type ${file.mimetype}`,
          allowed: ALLOWED_MIME,
        });
      }
    }
  }

  async createFromFile(
    enrollmentId: string,
    userId: string,
    file: Express.Multer.File,
    notes: string | undefined,
  ): Promise<SubmissionDto> {
    this.validateFile(file);

    const { enrollment, challenge } =
      await this.loadEnrollmentWithChallenge(enrollmentId);
    if (enrollment.userId !== userId) {
      throw new ForbiddenException();
    }
    if (enrollment.status !== EnrollmentStatus.IN_PROGRESS) {
      throw new ConflictException(
        'Submissions can only be created for enrollments that are in progress',
      );
    }

    const objectKey = this.blobStorage.buildObjectKey(
      userId,
      enrollmentId,
      file.originalname,
    );
    const { blobUrl } = await this.blobStorage.upload(
      file.buffer,
      file.mimetype,
      objectKey,
    );

    let saved: SubmissionDto;
    try {
      saved = await this.insertSubmissionAndFlipStatus(enrollmentId, {
        blobUrl,
        externalUrl: null,
        notes: notes ?? '',
      });
    } catch (err) {
      this.logger.error(
        `Orphan blob created during failed submission: ${objectKey}`,
      );
      throw err;
    }

    await this.activity.record({
      userId,
      type: ActivityEventType.SUBMITTED,
      payload: {
        submissionId: saved.id,
        enrollmentId,
        challengeId: challenge.id,
        challengeTitle: challenge.title,
        kind: 'file',
      },
    });
    this.telemetry.trackEvent('submission.created', {
      userId,
      submissionId: saved.id,
      enrollmentId,
      challengeId: challenge.id,
      challengeTitle: challenge.title,
      kind: 'file',
    });
    return saved;
  }

  async createFromUrl(
    enrollmentId: string,
    userId: string,
    externalUrl: string,
    notes: string | undefined,
  ): Promise<SubmissionDto> {
    if (!externalUrl) {
      throw new BadRequestException('externalUrl is required');
    }

    const { enrollment, challenge } =
      await this.loadEnrollmentWithChallenge(enrollmentId);
    if (enrollment.userId !== userId) {
      throw new ForbiddenException();
    }
    if (enrollment.status !== EnrollmentStatus.IN_PROGRESS) {
      throw new ConflictException(
        'Submissions can only be created for enrollments that are in progress',
      );
    }

    const saved = await this.insertSubmissionAndFlipStatus(enrollmentId, {
      blobUrl: null,
      externalUrl,
      notes: notes ?? '',
    });
    await this.activity.record({
      userId,
      type: ActivityEventType.SUBMITTED,
      payload: {
        submissionId: saved.id,
        enrollmentId,
        challengeId: challenge.id,
        challengeTitle: challenge.title,
        kind: 'url',
      },
    });
    this.telemetry.trackEvent('submission.created', {
      userId,
      submissionId: saved.id,
      enrollmentId,
      challengeId: challenge.id,
      challengeTitle: challenge.title,
      kind: 'url',
    });
    return saved;
  }

  async listForEnrollment(
    enrollmentId: string,
    callerUserId: string,
  ): Promise<SubmissionDto[]> {
    const { enrollment, challenge } =
      await this.loadEnrollmentWithChallenge(enrollmentId);
    this.assertEnrollmentReadable(enrollment, challenge, callerUserId);

    const rows = await this.submissions.find({
      where: { enrollmentId },
      order: { submittedAt: 'DESC' },
    });
    return rows.map((row) => this.toDto(row));
  }

  async findById(
    submissionId: string,
    callerUserId: string,
  ): Promise<SubmissionDto> {
    const { submission, enrollment, challenge } =
      await this.getSubmissionContext(submissionId);
    this.assertEnrollmentReadable(enrollment, challenge, callerUserId);
    return this.toDto(submission);
  }

  async getSubmissionContext(submissionId: string): Promise<SubmissionContext> {
    const submission = await this.submissions.findOne({
      where: { id: submissionId },
    });
    if (!submission) {
      throw new NotFoundException();
    }
    const { enrollment, challenge } = await this.loadEnrollmentWithChallenge(
      submission.enrollmentId,
    );
    return { submission, enrollment, challenge };
  }

  private async loadEnrollmentWithChallenge(
    enrollmentId: string,
  ): Promise<{ enrollment: Enrollment; challenge: Challenge }> {
    const enrollment = await this.enrollments.findOne({
      where: { id: enrollmentId },
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
    return { enrollment, challenge };
  }

  private assertEnrollmentReadable(
    enrollment: Enrollment,
    challenge: Challenge,
    callerUserId: string,
  ): void {
    if (
      enrollment.userId !== callerUserId &&
      challenge.ownerId !== callerUserId
    ) {
      throw new ForbiddenException();
    }
  }

  private async insertSubmissionAndFlipStatus(
    enrollmentId: string,
    data: { blobUrl: string | null; externalUrl: string | null; notes: string },
  ): Promise<SubmissionDto> {
    return this.dataSource.transaction(async (manager) => {
      const enrollments = manager.getRepository(Enrollment);
      const submissions = manager.getRepository(Submission);

      const locked = await enrollments
        .createQueryBuilder('e')
        .setLock('pessimistic_write')
        .where('e.id = :id', { id: enrollmentId })
        .getOne();
      if (!locked) {
        throw new NotFoundException();
      }
      if (locked.status !== EnrollmentStatus.IN_PROGRESS) {
        throw new ConflictException(
          'Submissions can only be created for enrollments that are in progress',
        );
      }

      const entity = submissions.create({
        enrollmentId,
        blobUrl: data.blobUrl,
        externalUrl: data.externalUrl,
        notes: data.notes,
      });
      const saved = await submissions.save(entity);

      locked.status = EnrollmentStatus.SUBMITTED;
      await enrollments.save(locked);

      return this.toDto(saved);
    });
  }

  toDto(entity: Submission): SubmissionDto {
    return {
      id: entity.id,
      enrollmentId: entity.enrollmentId,
      blobUrl: entity.blobUrl,
      externalUrl: entity.externalUrl,
      notes: entity.notes,
      submittedAt: entity.submittedAt.toISOString(),
      rejectionReason: entity.rejectionReason,
      reviewedAt: entity.reviewedAt ? entity.reviewedAt.toISOString() : null,
    };
  }

  private matchesMagic(buffer: Buffer, signature: number[]): boolean {
    if (buffer.length < signature.length) return false;
    for (let i = 0; i < signature.length; i++) {
      if (buffer[i] !== signature[i]) return false;
    }
    return true;
  }
}
