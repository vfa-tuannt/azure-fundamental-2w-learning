import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User } from '../users/user.entity';
import { ActivityController } from './activity.controller';
import { ActivityEventType } from './activity-event-type.enum';
import { ActivityService } from './activity.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';

const mockUser: User = {
  id: USER_ID,
  email: 'alice@vitalify.asia',
  name: 'Alice',
  avatarUrl: null,
  createdAt: new Date(),
};

describe('ActivityController (e2e)', () => {
  let app: import('@nestjs/common').INestApplication;
  let allowAuth = false;
  const service = {
    listRecent: jest.fn(),
    listForUser: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ActivityController],
      providers: [{ provide: ActivityService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: import('@nestjs/common').ExecutionContext) => {
          if (!allowAuth) return false;
          const req = ctx.switchToHttp().getRequest<{ user: User }>();
          req.user = mockUser;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    allowAuth = false;
    jest.clearAllMocks();
  });

  describe('GET /activity/recent', () => {
    it('is public and returns 200 with array', async () => {
      service.listRecent.mockResolvedValue([]);
      const res = await request(app.getHttpServer())
        .get('/activity/recent')
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it('returns events ordered newest-first', async () => {
      service.listRecent.mockResolvedValue([
        {
          id: 'a',
          type: ActivityEventType.CHALLENGE_CREATED,
          payload: { challengeId: 'c', challengeTitle: 'X' },
          createdAt: '2026-01-02T00:00:00.000Z',
          user: { id: USER_ID, name: 'Alice', avatarUrl: null },
        },
        {
          id: 'b',
          type: ActivityEventType.ENROLLED,
          payload: { challengeId: 'c', challengeTitle: 'X', enrollmentId: 'e' },
          createdAt: '2026-01-01T00:00:00.000Z',
          user: { id: USER_ID, name: 'Alice', avatarUrl: null },
        },
      ]);
      const res = await request(app.getHttpServer())
        .get('/activity/recent')
        .expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].id).toBe('a');
      expect(res.body[0].user.email).toBeUndefined();
    });

    it('empty database returns empty array, not 404', async () => {
      service.listRecent.mockResolvedValue([]);
      const res = await request(app.getHttpServer())
        .get('/activity/recent')
        .expect(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /activity/me', () => {
    it('returns 401/403 without JWT', async () => {
      const res = await request(app.getHttpServer()).get('/activity/me');
      expect([401, 403]).toContain(res.status);
    });

    it('returns events scoped to caller with valid JWT', async () => {
      allowAuth = true;
      service.listForUser.mockResolvedValue([
        {
          id: 'a',
          type: ActivityEventType.CHALLENGE_CREATED,
          payload: { challengeId: 'c', challengeTitle: 'X' },
          createdAt: '2026-01-02T00:00:00.000Z',
          user: { id: USER_ID, name: 'Alice', avatarUrl: null },
        },
      ]);
      const res = await request(app.getHttpServer())
        .get('/activity/me')
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(service.listForUser).toHaveBeenCalledWith(USER_ID);
    });
  });
});
