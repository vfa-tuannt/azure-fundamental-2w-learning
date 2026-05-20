import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChallengeStatus } from '../challenges/challenge.entity';
import { EnrollmentStatus } from '../enrollments/enrollment-status.enum';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { User } from '../users/user.entity';
import { MeController } from './me.controller';
import { MeService } from './me.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const CHALLENGE_ID = '22222222-2222-2222-2222-222222222222';
const ENROLLMENT_ID = '33333333-3333-3333-3333-333333333333';

const mockUser: User = {
  id: USER_ID,
  email: 'alice@vitalify.asia',
  name: 'Alice',
  avatarUrl: null,
  createdAt: new Date(),
};

describe('MeController (e2e)', () => {
  let app: import('@nestjs/common').INestApplication;
  let allowAuth = false;
  const service = {
    listMine: jest.fn(),
  };
  const meService = {
    getStats: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [MeController],
      providers: [
        { provide: EnrollmentsService, useValue: service },
        { provide: MeService, useValue: meService },
      ],
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

  it('GET /me/enrollments returns 401/403 without JWT', async () => {
    const res = await request(app.getHttpServer()).get('/me/enrollments');
    expect([401, 403]).toContain(res.status);
  });

  it('GET /me/enrollments returns the embedded list with valid JWT', async () => {
    allowAuth = true;
    service.listMine.mockResolvedValue([
      {
        id: ENROLLMENT_ID,
        challengeId: CHALLENGE_ID,
        userId: USER_ID,
        status: EnrollmentStatus.IN_PROGRESS,
        enrolledAt: '2024-01-02T00:00:00.000Z',
        challenge: {
          id: CHALLENGE_ID,
          title: 'Learn ARM',
          deadline: '2099-01-01T00:00:00.000Z',
          status: ChallengeStatus.OPEN,
          requiredSkills: ['azure'],
        },
      },
    ]);
    const res = await request(app.getHttpServer())
      .get('/me/enrollments')
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].challenge.title).toBe('Learn ARM');
    expect(service.listMine).toHaveBeenCalledWith(USER_ID);
  });

  it('GET /me/stats returns 401/403 without JWT', async () => {
    const res = await request(app.getHttpServer()).get('/me/stats');
    expect([401, 403]).toContain(res.status);
  });

  it('GET /me/stats returns three integer counts with valid JWT', async () => {
    allowAuth = true;
    meService.getStats.mockResolvedValue({
      challengesCreated: 3,
      enrollmentsActive: 1,
      enrollmentsApproved: 2,
    });
    const res = await request(app.getHttpServer()).get('/me/stats').expect(200);
    expect(res.body).toEqual({
      challengesCreated: 3,
      enrollmentsActive: 1,
      enrollmentsApproved: 2,
    });
    expect(meService.getStats).toHaveBeenCalledWith(USER_ID);
  });
});
