import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ActivityEventType } from '../activity/activity-event-type.enum';
import { ActivityService } from '../activity/activity.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import { Challenge, ChallengeStatus } from '../challenges/challenge.entity';
import { EnrollmentStatus } from '../enrollments/enrollment-status.enum';
import { Enrollment } from '../enrollments/enrollment.entity';
import { Submission } from '../submissions/submission.entity';
import { SubmissionsService } from '../submissions/submissions.service';
import { User } from '../users/user.entity';
import { ReviewsService } from './reviews.service';

const OWNER_ID = '00000000-0000-0000-0000-000000000001';
const ENROLLEE_ID = '00000000-0000-0000-0000-000000000002';
const STRANGER_ID = '00000000-0000-0000-0000-00000000000c';
const CHALLENGE_ID = '00000000-0000-0000-0000-0000000000aa';
const ENROLLMENT_ID = '00000000-0000-0000-0000-0000000000bb';
const SUBMISSION_ID = '00000000-0000-0000-0000-0000000000cc';

function buildChallenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: CHALLENGE_ID,
    ownerId: OWNER_ID,
    owner: undefined as never,
    title: 'T',
    description: 'D',
    requiredSkills: [],
    deadline: new Date('2099-01-01T00:00:00Z'),
    maxEnrollments: null,
    status: ChallengeStatus.OPEN,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

function buildEnrollment(overrides: Partial<Enrollment> = {}): Enrollment {
  return {
    id: ENROLLMENT_ID,
    challengeId: CHALLENGE_ID,
    challenge: undefined as never,
    userId: ENROLLEE_ID,
    user: undefined as never,
    status: EnrollmentStatus.SUBMITTED,
    enrolledAt: new Date('2024-01-02T00:00:00Z'),
    ...overrides,
  };
}

function buildSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: SUBMISSION_ID,
    enrollmentId: ENROLLMENT_ID,
    enrollment: undefined as never,
    blobUrl: null,
    externalUrl: 'https://github.com/u/r',
    notes: '',
    submittedAt: new Date('2024-01-03T00:00:00Z'),
    rejectionReason: null,
    reviewedAt: null,
    ...overrides,
  };
}

interface TxRepos {
  enrollments: jest.Mocked<Repository<Enrollment>> & {
    createQueryBuilder: jest.Mock;
  };
  submissions: jest.Mocked<Repository<Submission>>;
  qb: { setLock: jest.Mock; where: jest.Mock; getOne: jest.Mock };
}

function buildTxRepos(): TxRepos {
  const qb = {
    setLock: jest.fn(),
    where: jest.fn(),
    getOne: jest.fn(),
  };
  qb.setLock.mockReturnValue(qb);
  qb.where.mockReturnValue(qb);
  const enrollments: Partial<jest.Mocked<Repository<Enrollment>>> & {
    createQueryBuilder?: jest.Mock;
  } = {
    save: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  };
  const submissions: Partial<jest.Mocked<Repository<Submission>>> = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  return {
    enrollments: enrollments as TxRepos['enrollments'],
    submissions: submissions as TxRepos['submissions'],
    qb,
  };
}

function buildDataSource(tx: TxRepos): DataSource {
  return {
    transaction: jest
      .fn()
      .mockImplementation(async (_levelOrFn: unknown, maybeFn?: unknown) => {
        const fn = (
          typeof _levelOrFn === 'function' ? _levelOrFn : maybeFn
        ) as (manager: unknown) => Promise<unknown>;
        const manager = {
          getRepository(target: unknown) {
            if (target === Enrollment) return tx.enrollments;
            if (target === Submission) return tx.submissions;
            throw new Error('unexpected repo');
          },
        };
        return fn(manager);
      }),
  } as unknown as DataSource;
}

describe('ReviewsService', () => {
  let service: ReviewsService;
  let submissionsRepo: jest.Mocked<Repository<Submission>>;
  let enrollmentsRepo: jest.Mocked<Repository<Enrollment>>;
  let challengesRepo: jest.Mocked<Repository<Challenge>>;
  let tx: TxRepos;
  let activityRecord: jest.Mock;

  beforeEach(async () => {
    tx = buildTxRepos();
    activityRecord = jest.fn().mockResolvedValue(undefined);
    const submissionsRepoMock: Partial<jest.Mocked<Repository<Submission>>> = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    const enrollmentsRepoMock: Partial<jest.Mocked<Repository<Enrollment>>> = {
      findOne: jest.fn(),
    };
    const challengesRepoMock: Partial<jest.Mocked<Repository<Challenge>>> = {
      findOne: jest.fn(),
    };
    const usersRepoMock: Partial<jest.Mocked<Repository<User>>> = {
      findOne: jest.fn(),
    };

    const submissionsServiceMock = {
      toDto: (s: Submission) => ({
        id: s.id,
        enrollmentId: s.enrollmentId,
        blobUrl: s.blobUrl,
        externalUrl: s.externalUrl,
        notes: s.notes,
        submittedAt: s.submittedAt.toISOString(),
        rejectionReason: s.rejectionReason,
        reviewedAt: s.reviewedAt ? s.reviewedAt.toISOString() : null,
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        {
          provide: getRepositoryToken(Submission),
          useValue: submissionsRepoMock,
        },
        {
          provide: getRepositoryToken(Enrollment),
          useValue: enrollmentsRepoMock,
        },
        {
          provide: getRepositoryToken(Challenge),
          useValue: challengesRepoMock,
        },
        { provide: getRepositoryToken(User), useValue: usersRepoMock },
        { provide: getDataSourceToken(), useValue: buildDataSource(tx) },
        { provide: SubmissionsService, useValue: submissionsServiceMock },
        { provide: ActivityService, useValue: { record: activityRecord } },
        { provide: TelemetryService, useValue: { trackEvent: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(ReviewsService);
    submissionsRepo = moduleRef.get(getRepositoryToken(Submission));
    enrollmentsRepo = moduleRef.get(getRepositoryToken(Enrollment));
    challengesRepo = moduleRef.get(getRepositoryToken(Challenge));
  });

  describe('approve', () => {
    function primeTransaction(
      enrollment: Enrollment,
      submission: Submission,
    ): void {
      tx.qb.getOne.mockResolvedValue(enrollment);
      tx.submissions.findOne.mockResolvedValue(submission);
      tx.submissions.save.mockImplementation((s) =>
        Promise.resolve(s as Submission),
      );
      tx.enrollments.save.mockResolvedValue(undefined as never);
    }

    it('flips enrollment status to approved and stamps reviewed_at', async () => {
      submissionsRepo.findOne.mockResolvedValue(buildSubmission());
      enrollmentsRepo.findOne.mockResolvedValue(buildEnrollment());
      challengesRepo.findOne.mockResolvedValue(buildChallenge());
      primeTransaction(buildEnrollment(), buildSubmission());

      const result = await service.approve(SUBMISSION_ID, OWNER_ID);

      expect(tx.submissions.save).toHaveBeenCalledTimes(1);
      expect(tx.enrollments.save).toHaveBeenCalledTimes(1);
      const savedEnrollment = tx.enrollments.save.mock
        .calls[0][0] as Enrollment;
      expect(savedEnrollment.status).toBe(EnrollmentStatus.APPROVED);
      const savedSubmission = tx.submissions.save.mock
        .calls[0][0] as Submission;
      expect(savedSubmission.reviewedAt).toBeInstanceOf(Date);
      expect(savedSubmission.rejectionReason).toBeNull();
      expect(result.reviewedAt).not.toBeNull();
      expect(result.rejectionReason).toBeNull();
      expect(activityRecord).toHaveBeenCalledTimes(1);
      expect(activityRecord).toHaveBeenCalledWith({
        userId: ENROLLEE_ID,
        type: ActivityEventType.APPROVED,
        payload: {
          submissionId: SUBMISSION_ID,
          enrollmentId: ENROLLMENT_ID,
          challengeId: CHALLENGE_ID,
          challengeTitle: 'T',
          reviewerId: OWNER_ID,
        },
      });
    });

    it('throws ForbiddenException when caller is not the challenge owner', async () => {
      submissionsRepo.findOne.mockResolvedValue(buildSubmission());
      enrollmentsRepo.findOne.mockResolvedValue(buildEnrollment());
      challengesRepo.findOne.mockResolvedValue(buildChallenge());

      await expect(
        service.approve(SUBMISSION_ID, STRANGER_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.submissions.save).not.toHaveBeenCalled();
    });

    it('also forbids the enrollee (submitter) from self-approving', async () => {
      submissionsRepo.findOne.mockResolvedValue(buildSubmission());
      enrollmentsRepo.findOne.mockResolvedValue(buildEnrollment());
      challengesRepo.findOne.mockResolvedValue(buildChallenge());

      await expect(
        service.approve(SUBMISSION_ID, ENROLLEE_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFoundException when submission does not exist', async () => {
      submissionsRepo.findOne.mockResolvedValue(null);
      await expect(
        service.approve(SUBMISSION_ID, OWNER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when enrollment status is in_progress', async () => {
      submissionsRepo.findOne.mockResolvedValue(buildSubmission());
      enrollmentsRepo.findOne.mockResolvedValue(buildEnrollment());
      challengesRepo.findOne.mockResolvedValue(buildChallenge());
      primeTransaction(
        buildEnrollment({ status: EnrollmentStatus.IN_PROGRESS }),
        buildSubmission(),
      );

      await expect(
        service.approve(SUBMISSION_ID, OWNER_ID),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException when enrollment status is approved', async () => {
      submissionsRepo.findOne.mockResolvedValue(buildSubmission());
      enrollmentsRepo.findOne.mockResolvedValue(buildEnrollment());
      challengesRepo.findOne.mockResolvedValue(buildChallenge());
      primeTransaction(
        buildEnrollment({ status: EnrollmentStatus.APPROVED }),
        buildSubmission(),
      );

      await expect(
        service.approve(SUBMISSION_ID, OWNER_ID),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException when enrollment status is rejected', async () => {
      submissionsRepo.findOne.mockResolvedValue(buildSubmission());
      enrollmentsRepo.findOne.mockResolvedValue(buildEnrollment());
      challengesRepo.findOne.mockResolvedValue(buildChallenge());
      primeTransaction(
        buildEnrollment({ status: EnrollmentStatus.REJECTED }),
        buildSubmission(),
      );

      await expect(
        service.approve(SUBMISSION_ID, OWNER_ID),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('reject', () => {
    function primeTransaction(): void {
      tx.qb.getOne.mockResolvedValue(buildEnrollment());
      tx.submissions.findOne.mockResolvedValue(buildSubmission());
      tx.submissions.save.mockImplementation((s) =>
        Promise.resolve(s as Submission),
      );
      tx.enrollments.save.mockResolvedValue(undefined as never);
    }

    it('flips status to rejected and stores trimmed reason', async () => {
      submissionsRepo.findOne.mockResolvedValue(buildSubmission());
      enrollmentsRepo.findOne.mockResolvedValue(buildEnrollment());
      challengesRepo.findOne.mockResolvedValue(buildChallenge());
      primeTransaction();

      const result = await service.reject(
        SUBMISSION_ID,
        OWNER_ID,
        '  Output is missing tests  ',
      );

      const savedEnrollment = tx.enrollments.save.mock
        .calls[0][0] as Enrollment;
      expect(savedEnrollment.status).toBe(EnrollmentStatus.REJECTED);
      const savedSubmission = tx.submissions.save.mock
        .calls[0][0] as Submission;
      expect(savedSubmission.rejectionReason).toBe('Output is missing tests');
      expect(savedSubmission.reviewedAt).toBeInstanceOf(Date);
      expect(result.rejectionReason).toBe('Output is missing tests');
      expect(result.reviewedAt).not.toBeNull();
      expect(activityRecord).toHaveBeenCalledTimes(1);
      expect(activityRecord).toHaveBeenCalledWith({
        userId: ENROLLEE_ID,
        type: ActivityEventType.REJECTED,
        payload: expect.objectContaining({
          reviewerId: OWNER_ID,
          rejectionReason: 'Output is missing tests',
        }),
      });
    });

    it('stores NULL when reason is undefined', async () => {
      submissionsRepo.findOne.mockResolvedValue(buildSubmission());
      enrollmentsRepo.findOne.mockResolvedValue(buildEnrollment());
      challengesRepo.findOne.mockResolvedValue(buildChallenge());
      primeTransaction();

      const result = await service.reject(SUBMISSION_ID, OWNER_ID);

      const saved = tx.submissions.save.mock.calls[0][0] as Submission;
      expect(saved.rejectionReason).toBeNull();
      expect(result.rejectionReason).toBeNull();
      expect(activityRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ActivityEventType.REJECTED,
          payload: expect.objectContaining({ rejectionReason: null }),
        }),
      );
    });

    it('stores NULL when reason is empty string', async () => {
      submissionsRepo.findOne.mockResolvedValue(buildSubmission());
      enrollmentsRepo.findOne.mockResolvedValue(buildEnrollment());
      challengesRepo.findOne.mockResolvedValue(buildChallenge());
      primeTransaction();

      const result = await service.reject(SUBMISSION_ID, OWNER_ID, '');

      expect(result.rejectionReason).toBeNull();
    });

    it('stores NULL when reason is whitespace-only', async () => {
      submissionsRepo.findOne.mockResolvedValue(buildSubmission());
      enrollmentsRepo.findOne.mockResolvedValue(buildEnrollment());
      challengesRepo.findOne.mockResolvedValue(buildChallenge());
      primeTransaction();

      const result = await service.reject(SUBMISSION_ID, OWNER_ID, '   \t\n  ');

      expect(result.rejectionReason).toBeNull();
    });

    it('throws ForbiddenException for non-owner caller', async () => {
      submissionsRepo.findOne.mockResolvedValue(buildSubmission());
      enrollmentsRepo.findOne.mockResolvedValue(buildEnrollment());
      challengesRepo.findOne.mockResolvedValue(buildChallenge());

      await expect(
        service.reject(SUBMISSION_ID, STRANGER_ID, 'no'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFoundException when submission does not exist', async () => {
      submissionsRepo.findOne.mockResolvedValue(null);
      await expect(
        service.reject(SUBMISSION_ID, OWNER_ID, 'r'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException for in_progress status', async () => {
      submissionsRepo.findOne.mockResolvedValue(buildSubmission());
      enrollmentsRepo.findOne.mockResolvedValue(buildEnrollment());
      challengesRepo.findOne.mockResolvedValue(buildChallenge());
      tx.qb.getOne.mockResolvedValue(
        buildEnrollment({ status: EnrollmentStatus.IN_PROGRESS }),
      );

      await expect(
        service.reject(SUBMISSION_ID, OWNER_ID, 'r'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException for approved status', async () => {
      submissionsRepo.findOne.mockResolvedValue(buildSubmission());
      enrollmentsRepo.findOne.mockResolvedValue(buildEnrollment());
      challengesRepo.findOne.mockResolvedValue(buildChallenge());
      tx.qb.getOne.mockResolvedValue(
        buildEnrollment({ status: EnrollmentStatus.APPROVED }),
      );

      await expect(
        service.reject(SUBMISSION_ID, OWNER_ID, 'r'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException for rejected status', async () => {
      submissionsRepo.findOne.mockResolvedValue(buildSubmission());
      enrollmentsRepo.findOne.mockResolvedValue(buildEnrollment());
      challengesRepo.findOne.mockResolvedValue(buildChallenge());
      tx.qb.getOne.mockResolvedValue(
        buildEnrollment({ status: EnrollmentStatus.REJECTED }),
      );

      await expect(
        service.reject(SUBMISSION_ID, OWNER_ID, 'r'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('listForChallenge', () => {
    interface SubmissionsQB {
      innerJoin: jest.Mock;
      where: jest.Mock;
      orderBy: jest.Mock;
      select: jest.Mock;
      addSelect: jest.Mock;
      getRawAndEntities: jest.Mock;
    }

    function buildQB(returnValue: {
      entities: Submission[];
      raw: Array<Record<string, unknown>>;
    }): SubmissionsQB {
      const qb: SubmissionsQB = {
        innerJoin: jest.fn(),
        where: jest.fn(),
        orderBy: jest.fn(),
        select: jest.fn(),
        addSelect: jest.fn(),
        getRawAndEntities: jest.fn().mockResolvedValue(returnValue),
      };
      qb.innerJoin.mockReturnValue(qb);
      qb.where.mockReturnValue(qb);
      qb.orderBy.mockReturnValue(qb);
      qb.select.mockReturnValue(qb);
      qb.addSelect.mockReturnValue(qb);
      return qb;
    }

    it('returns rows with embedded enrollment and submitter for the challenge owner', async () => {
      challengesRepo.findOne.mockResolvedValue(buildChallenge());
      const qb = buildQB({
        entities: [buildSubmission()],
        raw: [
          {
            e_id: ENROLLMENT_ID,
            e_user_id: ENROLLEE_ID,
            e_status: EnrollmentStatus.SUBMITTED,
            u_id: ENROLLEE_ID,
            u_name: 'Bob',
            u_email: 'bob@vitalify.asia',
            u_avatar_url: null,
          },
        ],
      });
      (
        submissionsRepo.createQueryBuilder as unknown as jest.Mock
      ).mockReturnValue(qb);

      const result = await service.listForChallenge(CHALLENGE_ID, OWNER_ID);

      expect(result).toHaveLength(1);
      expect(result[0].enrollment).toEqual({
        id: ENROLLMENT_ID,
        userId: ENROLLEE_ID,
        status: EnrollmentStatus.SUBMITTED,
      });
      expect(result[0].submitter).toEqual({
        id: ENROLLEE_ID,
        name: 'Bob',
        email: 'bob@vitalify.asia',
        avatarUrl: null,
      });
    });

    it('returns an empty array when no submissions exist', async () => {
      challengesRepo.findOne.mockResolvedValue(buildChallenge());
      const qb = buildQB({ entities: [], raw: [] });
      (
        submissionsRepo.createQueryBuilder as unknown as jest.Mock
      ).mockReturnValue(qb);

      const result = await service.listForChallenge(CHALLENGE_ID, OWNER_ID);
      expect(result).toEqual([]);
    });

    it('throws ForbiddenException for non-owner caller', async () => {
      challengesRepo.findOne.mockResolvedValue(buildChallenge());
      await expect(
        service.listForChallenge(CHALLENGE_ID, STRANGER_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFoundException when challenge does not exist', async () => {
      challengesRepo.findOne.mockResolvedValue(null);
      await expect(
        service.listForChallenge(CHALLENGE_ID, OWNER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when challenge is soft-deleted (filtered by IsNull)', async () => {
      // Repository.findOne with `deletedAt: IsNull()` returns null for soft-deleted rows
      challengesRepo.findOne.mockResolvedValue(null);
      await expect(
        service.listForChallenge(CHALLENGE_ID, OWNER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
