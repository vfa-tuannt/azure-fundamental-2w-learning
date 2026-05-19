import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Challenge, ChallengeStatus } from './challenge.entity';
import { ChallengesService } from './challenges.service';
import { CreateChallengeDto } from './dto/create-challenge.dto';

const OWNER_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_ID = '00000000-0000-0000-0000-000000000002';
const CHALLENGE_ID = '00000000-0000-0000-0000-0000000000aa';

function buildEntity(overrides: Partial<Challenge> = {}): Challenge {
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

interface MockQb {
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  getManyAndCount: jest.Mock;
}

function buildQb(entities: Challenge[], total: number): MockQb {
  const qb: MockQb = {
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
    getManyAndCount: jest.fn().mockResolvedValue([entities, total]),
  };
  qb.where.mockReturnValue(qb);
  qb.andWhere.mockReturnValue(qb);
  qb.orderBy.mockReturnValue(qb);
  qb.skip.mockReturnValue(qb);
  qb.take.mockReturnValue(qb);
  return qb;
}

describe('ChallengesService', () => {
  let service: ChallengesService;
  let repo: jest.Mocked<Repository<Challenge>>;

  beforeEach(async () => {
    const repoMock: Partial<jest.Mocked<Repository<Challenge>>> = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      softRemove: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ChallengesService,
        { provide: getRepositoryToken(Challenge), useValue: repoMock },
      ],
    }).compile();

    service = moduleRef.get(ChallengesService);
    repo = moduleRef.get(getRepositoryToken(Challenge));
  });

  describe('create', () => {
    it('persists a challenge owned by the supplied user and returns DTO with enrollmentsCount: 0', async () => {
      const dto: CreateChallengeDto = {
        title: 'Learn ARM',
        description: 'Pick up ARM templates',
        requiredSkills: ['Azure'],
        deadline: new Date('2099-12-31T00:00:00Z'),
        maxEnrollments: 5,
      };
      const created = buildEntity({
        title: dto.title,
        description: dto.description,
        requiredSkills: dto.requiredSkills,
        deadline: dto.deadline,
        maxEnrollments: 5,
      });
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      const result = await service.create(OWNER_ID, dto);

      expect(repo.create).toHaveBeenCalledWith({
        ownerId: OWNER_ID,
        title: dto.title,
        description: dto.description,
        requiredSkills: dto.requiredSkills,
        deadline: dto.deadline,
        maxEnrollments: 5,
        status: ChallengeStatus.OPEN,
      });
      expect(result.enrollmentsCount).toBe(0);
      expect(result.ownerId).toBe(OWNER_ID);
      expect(result.status).toBe(ChallengeStatus.OPEN);
    });
  });

  describe('update', () => {
    it('throws ForbiddenException when caller is not the owner', async () => {
      repo.findOne.mockResolvedValue(buildEntity());
      await expect(
        service.update(CHALLENGE_ID, OTHER_ID, { title: 'New' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('saves when caller is the owner', async () => {
      const entity = buildEntity();
      repo.findOne.mockResolvedValue(entity);
      repo.save.mockImplementation((e) => Promise.resolve(e as Challenge));

      const result = await service.update(CHALLENGE_ID, OWNER_ID, {
        title: 'New title',
      });

      expect(repo.save).toHaveBeenCalled();
      expect(result.title).toBe('New title');
    });

    it('throws NotFoundException when row missing (already soft-deleted)', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.update(CHALLENGE_ID, OWNER_ID, { title: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('calls softRemove for the owner', async () => {
      const entity = buildEntity();
      repo.findOne.mockResolvedValue(entity);
      repo.softRemove.mockResolvedValue(entity);
      await service.remove(CHALLENGE_ID, OWNER_ID);
      expect(repo.softRemove).toHaveBeenCalledWith(entity);
    });

    it('throws ForbiddenException for non-owner', async () => {
      repo.findOne.mockResolvedValue(buildEntity());
      await expect(
        service.remove(CHALLENGE_ID, OTHER_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.softRemove).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when row missing', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.remove(CHALLENGE_ID, OWNER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('returns paginated result with defaults', async () => {
      const qb = buildQb([buildEntity()], 1);
      repo.createQueryBuilder.mockReturnValue(
        qb as unknown as ReturnType<
          Repository<Challenge>['createQueryBuilder']
        >,
      );
      const result = await service.findAll({});
      expect(qb.where).toHaveBeenCalledWith('c.deleted_at IS NULL');
      expect(qb.orderBy).toHaveBeenCalledWith('c.created_at', 'DESC');
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(20);
      expect(result).toEqual({
        items: expect.any(Array),
        page: 1,
        limit: 20,
        total: 1,
      });
    });

    it('applies status filter', async () => {
      const qb = buildQb([], 0);
      repo.createQueryBuilder.mockReturnValue(
        qb as unknown as ReturnType<
          Repository<Challenge>['createQueryBuilder']
        >,
      );
      await service.findAll({ status: ChallengeStatus.CLOSED });
      expect(qb.andWhere).toHaveBeenCalledWith('c.status = :status', {
        status: ChallengeStatus.CLOSED,
      });
    });

    it('applies case-insensitive skill substring filter', async () => {
      const qb = buildQb([], 0);
      repo.createQueryBuilder.mockReturnValue(
        qb as unknown as ReturnType<
          Repository<Challenge>['createQueryBuilder']
        >,
      );
      await service.findAll({ skill: 'Azure' });
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE :skill'),
        { skill: '%Azure%' },
      );
    });

    it('respects page and limit', async () => {
      const qb = buildQb([], 0);
      repo.createQueryBuilder.mockReturnValue(
        qb as unknown as ReturnType<
          Repository<Challenge>['createQueryBuilder']
        >,
      );
      await service.findAll({ page: 3, limit: 5 });
      expect(qb.skip).toHaveBeenCalledWith(10);
      expect(qb.take).toHaveBeenCalledWith(5);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when row is missing', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findOne(CHALLENGE_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
