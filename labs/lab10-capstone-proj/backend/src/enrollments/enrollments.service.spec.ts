import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { Challenge, ChallengeStatus } from '../challenges/challenge.entity';
import { EnrollmentStatus } from './enrollment-status.enum';
import { Enrollment } from './enrollment.entity';
import { EnrollmentsService } from './enrollments.service';

const OWNER_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';
const CHALLENGE_ID = '00000000-0000-0000-0000-0000000000aa';
const ENROLLMENT_ID = '00000000-0000-0000-0000-0000000000bb';

function buildChallenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: CHALLENGE_ID,
    ownerId: OWNER_ID,
    owner: undefined as never,
    title: 'Test',
    description: 'Body',
    requiredSkills: ['azure'],
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
    challenge: buildChallenge(),
    userId: USER_ID,
    user: undefined as never,
    status: EnrollmentStatus.IN_PROGRESS,
    enrolledAt: new Date('2024-01-02T00:00:00Z'),
    ...overrides,
  };
}

interface TxRepos {
  challenges: jest.Mocked<Repository<Challenge>>;
  enrollments: jest.Mocked<Repository<Enrollment>> & {
    createQueryBuilder: jest.Mock;
  };
  enrollmentQb: {
    where: jest.Mock;
    andWhere: jest.Mock;
    getCount: jest.Mock;
  };
}

function buildTxRepos(): TxRepos {
  const enrollmentQb = {
    where: jest.fn(),
    andWhere: jest.fn(),
    getCount: jest.fn().mockResolvedValue(0),
  };
  enrollmentQb.where.mockReturnValue(enrollmentQb);
  enrollmentQb.andWhere.mockReturnValue(enrollmentQb);

  const challenges: Partial<jest.Mocked<Repository<Challenge>>> = {
    findOne: jest.fn(),
  };
  const enrollments: Partial<jest.Mocked<Repository<Enrollment>>> & {
    createQueryBuilder?: jest.Mock;
  } = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(enrollmentQb),
  };
  return {
    challenges: challenges as TxRepos['challenges'],
    enrollments: enrollments as TxRepos['enrollments'],
    enrollmentQb,
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
            if (target === Challenge) return tx.challenges;
            if (target === Enrollment) return tx.enrollments;
            throw new Error('unexpected repo');
          },
        };
        return fn(manager);
      }),
  } as unknown as DataSource;
}

describe('EnrollmentsService', () => {
  let service: EnrollmentsService;
  let enrollmentsRepo: jest.Mocked<Repository<Enrollment>>;
  let tx: TxRepos;

  beforeEach(async () => {
    tx = buildTxRepos();
    const enrollmentsRepoMock: Partial<jest.Mocked<Repository<Enrollment>>> = {
      findOne: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    const challengesRepoMock: Partial<jest.Mocked<Repository<Challenge>>> = {
      findOne: jest.fn(),
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        EnrollmentsService,
        {
          provide: getRepositoryToken(Enrollment),
          useValue: enrollmentsRepoMock,
        },
        {
          provide: getRepositoryToken(Challenge),
          useValue: challengesRepoMock,
        },
        { provide: getDataSourceToken(), useValue: buildDataSource(tx) },
      ],
    }).compile();

    service = moduleRef.get(EnrollmentsService);
    enrollmentsRepo = moduleRef.get(getRepositoryToken(Enrollment));
  });

  describe('enroll', () => {
    it('succeeds and returns DTO with in_progress when challenge is open and user is eligible', async () => {
      tx.challenges.findOne.mockResolvedValue(buildChallenge());
      tx.enrollments.findOne.mockResolvedValue(null);
      const created = buildEnrollment();
      tx.enrollments.create.mockReturnValue(created);
      tx.enrollments.save.mockResolvedValue(created);

      const result = await service.enroll(CHALLENGE_ID, USER_ID);

      expect(result.status).toBe(EnrollmentStatus.IN_PROGRESS);
      expect(result.challengeId).toBe(CHALLENGE_ID);
      expect(result.userId).toBe(USER_ID);
    });

    it('throws NotFoundException when challenge is missing', async () => {
      tx.challenges.findOne.mockResolvedValue(null);
      await expect(
        service.enroll(CHALLENGE_ID, USER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when challenge is closed', async () => {
      tx.challenges.findOne.mockResolvedValue(
        buildChallenge({ status: ChallengeStatus.CLOSED }),
      );
      await expect(
        service.enroll(CHALLENGE_ID, USER_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when caller is the owner', async () => {
      tx.challenges.findOne.mockResolvedValue(buildChallenge());
      await expect(
        service.enroll(CHALLENGE_ID, OWNER_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ConflictException when caller is already enrolled', async () => {
      tx.challenges.findOne.mockResolvedValue(buildChallenge());
      tx.enrollments.findOne.mockResolvedValue(buildEnrollment());
      await expect(
        service.enroll(CHALLENGE_ID, USER_ID),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException when maxEnrollments cap is reached', async () => {
      tx.challenges.findOne.mockResolvedValue(
        buildChallenge({ maxEnrollments: 2 }),
      );
      tx.enrollments.findOne.mockResolvedValue(null);
      tx.enrollmentQb.getCount.mockResolvedValue(2);
      await expect(
        service.enroll(CHALLENGE_ID, USER_ID),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('succeeds when cap is reached only counting non-rejected (rejected does not count)', async () => {
      tx.challenges.findOne.mockResolvedValue(
        buildChallenge({ maxEnrollments: 2 }),
      );
      tx.enrollments.findOne.mockResolvedValue(null);
      tx.enrollmentQb.getCount.mockResolvedValue(1);
      const created = buildEnrollment();
      tx.enrollments.create.mockReturnValue(created);
      tx.enrollments.save.mockResolvedValue(created);

      const result = await service.enroll(CHALLENGE_ID, USER_ID);
      expect(result.status).toBe(EnrollmentStatus.IN_PROGRESS);
    });

    it('translates Postgres unique-violation into ConflictException', async () => {
      tx.challenges.findOne.mockResolvedValue(buildChallenge());
      tx.enrollments.findOne.mockResolvedValue(null);
      tx.enrollments.create.mockReturnValue(buildEnrollment());
      const violation = new QueryFailedError(
        'INSERT',
        [],
        new Error('duplicate'),
      );
      (violation as unknown as { driverError: { code: string } }).driverError =
        { code: '23505' };
      tx.enrollments.save.mockRejectedValue(violation);
      await expect(
        service.enroll(CHALLENGE_ID, USER_ID),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('withdraw', () => {
    it('hard-deletes when status is in_progress', async () => {
      const entity = buildEnrollment();
      enrollmentsRepo.findOne.mockResolvedValue(entity);
      await service.withdraw(CHALLENGE_ID, USER_ID);
      expect(enrollmentsRepo.remove).toHaveBeenCalledWith(entity);
    });

    it('throws ConflictException when status is submitted', async () => {
      enrollmentsRepo.findOne.mockResolvedValue(
        buildEnrollment({ status: EnrollmentStatus.SUBMITTED }),
      );
      await expect(
        service.withdraw(CHALLENGE_ID, USER_ID),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(enrollmentsRepo.remove).not.toHaveBeenCalled();
    });

    it('throws ConflictException when status is approved', async () => {
      enrollmentsRepo.findOne.mockResolvedValue(
        buildEnrollment({ status: EnrollmentStatus.APPROVED }),
      );
      await expect(
        service.withdraw(CHALLENGE_ID, USER_ID),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException when status is rejected', async () => {
      enrollmentsRepo.findOne.mockResolvedValue(
        buildEnrollment({ status: EnrollmentStatus.REJECTED }),
      );
      await expect(
        service.withdraw(CHALLENGE_ID, USER_ID),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws NotFoundException when no enrollment exists', async () => {
      enrollmentsRepo.findOne.mockResolvedValue(null);
      await expect(
        service.withdraw(CHALLENGE_ID, USER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listMine', () => {
    it('returns rows ordered newest-first with embedded challenge summary', async () => {
      const row = buildEnrollment();
      const qb = {
        innerJoinAndSelect: jest.fn(),
        where: jest.fn(),
        andWhere: jest.fn(),
        orderBy: jest.fn(),
        getMany: jest.fn().mockResolvedValue([row]),
      };
      qb.innerJoinAndSelect.mockReturnValue(qb);
      qb.where.mockReturnValue(qb);
      qb.andWhere.mockReturnValue(qb);
      qb.orderBy.mockReturnValue(qb);
      (
        enrollmentsRepo as unknown as {
          createQueryBuilder: jest.Mock;
        }
      ).createQueryBuilder.mockReturnValue(qb);

      const result = await service.listMine(USER_ID);
      expect(qb.andWhere).toHaveBeenCalledWith('c.deleted_at IS NULL');
      expect(qb.orderBy).toHaveBeenCalledWith('e.enrolled_at', 'DESC');
      expect(result).toHaveLength(1);
      expect(result[0].challenge.id).toBe(CHALLENGE_ID);
      expect(result[0].challenge.title).toBe('Test');
    });
  });

  describe('findMyEnrollment', () => {
    it('returns the bare DTO when an enrollment exists', async () => {
      enrollmentsRepo.findOne.mockResolvedValue(buildEnrollment());
      const result = await service.findMyEnrollment(CHALLENGE_ID, USER_ID);
      expect(result.id).toBe(ENROLLMENT_ID);
    });

    it('throws NotFoundException when no enrollment exists', async () => {
      enrollmentsRepo.findOne.mockResolvedValue(null);
      await expect(
        service.findMyEnrollment(CHALLENGE_ID, USER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
