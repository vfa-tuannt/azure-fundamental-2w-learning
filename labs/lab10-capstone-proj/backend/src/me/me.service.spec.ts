import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Challenge } from '../challenges/challenge.entity';
import { EnrollmentStatus } from '../enrollments/enrollment-status.enum';
import { Enrollment } from '../enrollments/enrollment.entity';
import { MeService } from './me.service';

const USER_ID = '00000000-0000-0000-0000-000000000001';

describe('MeService', () => {
  let service: MeService;
  let challenges: jest.Mocked<Repository<Challenge>>;
  let enrollments: jest.Mocked<Repository<Enrollment>>;
  let activeQbGetCount: jest.Mock;

  beforeEach(async () => {
    activeQbGetCount = jest.fn().mockResolvedValue(0);
    const activeQb = {
      where: jest.fn(),
      andWhere: jest.fn(),
      getCount: activeQbGetCount,
    };
    activeQb.where.mockReturnValue(activeQb);
    activeQb.andWhere.mockReturnValue(activeQb);

    const challengesMock: Partial<jest.Mocked<Repository<Challenge>>> = {
      count: jest.fn().mockResolvedValue(0),
    };
    const enrollmentsMock: Partial<jest.Mocked<Repository<Enrollment>>> = {
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn().mockReturnValue(activeQb),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        MeService,
        { provide: getRepositoryToken(Challenge), useValue: challengesMock },
        {
          provide: getRepositoryToken(Enrollment),
          useValue: enrollmentsMock,
        },
      ],
    }).compile();
    service = moduleRef.get(MeService);
    challenges = moduleRef.get(getRepositoryToken(Challenge));
    enrollments = moduleRef.get(getRepositoryToken(Enrollment));
  });

  it('returns zero counts for a user with no domain rows', async () => {
    const result = await service.getStats(USER_ID);
    expect(result).toEqual({
      challengesCreated: 0,
      enrollmentsActive: 0,
      enrollmentsApproved: 0,
    });
  });

  it('challengesCreated excludes soft-deleted challenges via deletedAt IS NULL', async () => {
    (challenges.count as jest.Mock).mockResolvedValue(2);
    const result = await service.getStats(USER_ID);
    expect(challenges.count).toHaveBeenCalledWith({
      where: { ownerId: USER_ID, deletedAt: IsNull() },
    });
    expect(result.challengesCreated).toBe(2);
  });

  it('enrollmentsActive counts in_progress + submitted via query builder', async () => {
    activeQbGetCount.mockResolvedValue(2);
    const result = await service.getStats(USER_ID);
    expect(result.enrollmentsActive).toBe(2);
  });

  it('enrollmentsApproved filters status=approved and ignores others', async () => {
    (enrollments.count as jest.Mock).mockResolvedValue(1);
    const result = await service.getStats(USER_ID);
    expect(enrollments.count).toHaveBeenCalledWith({
      where: { userId: USER_ID, status: EnrollmentStatus.APPROVED },
    });
    expect(result.enrollmentsApproved).toBe(1);
  });
});
