import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityEvent } from './activity-event.entity';
import { ActivityEventType } from './activity-event-type.enum';
import { ActivityService } from './activity.service';

const USER_ID = '00000000-0000-0000-0000-000000000001';
const CHALLENGE_ID = '00000000-0000-0000-0000-0000000000aa';

interface RawRow {
  e_id: string;
  e_event_type: ActivityEventType;
  e_payload: Record<string, unknown>;
  e_created_at: Date;
  u_id: string | null;
  u_name: string | null;
  u_avatar_url: string | null;
}

function buildRaw(overrides: Partial<RawRow> = {}): RawRow {
  return {
    e_id: '00000000-0000-0000-0000-0000000000ee',
    e_event_type: ActivityEventType.CHALLENGE_CREATED,
    e_payload: { challengeId: CHALLENGE_ID, challengeTitle: 'Test' },
    e_created_at: new Date('2024-05-01T00:00:00Z'),
    u_id: USER_ID,
    u_name: 'Alice',
    u_avatar_url: null,
    ...overrides,
  };
}

interface MockQb {
  leftJoin: jest.Mock;
  select: jest.Mock;
  addSelect: jest.Mock;
  orderBy: jest.Mock;
  where: jest.Mock;
  limit: jest.Mock;
  getRawMany: jest.Mock;
}

function buildQb(rows: RawRow[]): MockQb {
  const qb: MockQb = {
    leftJoin: jest.fn(),
    select: jest.fn(),
    addSelect: jest.fn(),
    orderBy: jest.fn(),
    where: jest.fn(),
    limit: jest.fn(),
    getRawMany: jest.fn().mockResolvedValue(rows),
  };
  qb.leftJoin.mockReturnValue(qb);
  qb.select.mockReturnValue(qb);
  qb.addSelect.mockReturnValue(qb);
  qb.orderBy.mockReturnValue(qb);
  qb.where.mockReturnValue(qb);
  qb.limit.mockReturnValue(qb);
  return qb;
}

describe('ActivityService', () => {
  let service: ActivityService;
  let repo: jest.Mocked<Repository<ActivityEvent>>;

  beforeEach(async () => {
    const repoMock: Partial<jest.Mocked<Repository<ActivityEvent>>> = {
      create: jest.fn().mockImplementation((d) => d as ActivityEvent),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityService,
        { provide: getRepositoryToken(ActivityEvent), useValue: repoMock },
      ],
    }).compile();
    service = moduleRef.get(ActivityService);
    repo = moduleRef.get(getRepositoryToken(ActivityEvent));
  });

  describe('record', () => {
    it('inserts one row on success', async () => {
      repo.save.mockResolvedValue({} as ActivityEvent);
      await service.record({
        userId: USER_ID,
        type: ActivityEventType.CHALLENGE_CREATED,
        payload: { challengeId: CHALLENGE_ID, challengeTitle: 'Test' },
      });
      expect(repo.save).toHaveBeenCalledTimes(1);
      const arg = repo.save.mock.calls[0][0] as ActivityEvent;
      expect(arg.userId).toBe(USER_ID);
      expect(arg.type).toBe(ActivityEventType.CHALLENGE_CREATED);
      expect(arg.payload).toEqual({
        challengeId: CHALLENGE_ID,
        challengeTitle: 'Test',
      });
    });

    it('swallows DB errors and logs at error level', async () => {
      const err = new Error('DB down');
      repo.save.mockRejectedValue(err);
      const logSpy = jest
        .spyOn(
          (service as unknown as { logger: { error: jest.Mock } }).logger,
          'error',
        )
        .mockImplementation(() => undefined);

      await expect(
        service.record({
          userId: USER_ID,
          type: ActivityEventType.ENROLLED,
          payload: {
            challengeId: CHALLENGE_ID,
            challengeTitle: 'X',
            enrollmentId: 'e',
          },
        }),
      ).resolves.toBeUndefined();
      expect(logSpy).toHaveBeenCalled();
      const message = String(logSpy.mock.calls[0][0]);
      expect(message).toContain(USER_ID);
      expect(message).toContain('enrolled');
    });
  });

  describe('listRecent', () => {
    it('returns up to 50 rows ordered DESC', async () => {
      const qb = buildQb([buildRaw(), buildRaw({ e_id: 'second' })]);
      (repo.createQueryBuilder as unknown as jest.Mock).mockReturnValue(qb);
      const result = await service.listRecent();
      expect(qb.orderBy).toHaveBeenCalledWith('e.created_at', 'DESC');
      expect(qb.limit).toHaveBeenCalledWith(50);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('00000000-0000-0000-0000-0000000000ee');
    });

    it('DTO user object excludes email', async () => {
      const qb = buildQb([buildRaw()]);
      (repo.createQueryBuilder as unknown as jest.Mock).mockReturnValue(qb);
      const result = await service.listRecent();
      expect(Object.keys(result[0].user).sort()).toEqual(
        ['avatarUrl', 'id', 'name'].sort(),
      );
    });

    it('createdAt is an ISO string', async () => {
      const qb = buildQb([buildRaw()]);
      (repo.createQueryBuilder as unknown as jest.Mock).mockReturnValue(qb);
      const result = await service.listRecent();
      expect(result[0].createdAt).toBe('2024-05-01T00:00:00.000Z');
    });
  });

  describe('listForUser', () => {
    it('filters by user id', async () => {
      const qb = buildQb([buildRaw()]);
      (repo.createQueryBuilder as unknown as jest.Mock).mockReturnValue(qb);
      await service.listForUser(USER_ID);
      expect(qb.where).toHaveBeenCalledWith('e.user_id = :userId', {
        userId: USER_ID,
      });
      expect(qb.limit).toHaveBeenCalledWith(50);
    });
  });
});
