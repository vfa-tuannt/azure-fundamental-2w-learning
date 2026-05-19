import {
  ConflictException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User } from '../users/user.entity';
import { EnrollmentStatus } from './enrollment-status.enum';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';

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

function buildEnrollmentDto() {
  return {
    id: ENROLLMENT_ID,
    challengeId: CHALLENGE_ID,
    userId: USER_ID,
    status: EnrollmentStatus.IN_PROGRESS,
    enrolledAt: '2024-01-02T00:00:00.000Z',
  };
}

describe('EnrollmentsController (e2e)', () => {
  let app: import('@nestjs/common').INestApplication;
  let allowAuth = false;
  const service = {
    enroll: jest.fn(),
    withdraw: jest.fn(),
    findMyEnrollment: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [EnrollmentsController],
      providers: [{ provide: EnrollmentsService, useValue: service }],
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

  describe('POST /challenges/:id/enroll', () => {
    it('returns 401/403 without JWT', async () => {
      const res = await request(app.getHttpServer()).post(
        `/challenges/${CHALLENGE_ID}/enroll`,
      );
      expect([401, 403]).toContain(res.status);
    });

    it('returns 201 with valid JWT', async () => {
      allowAuth = true;
      service.enroll.mockResolvedValue(buildEnrollmentDto());
      const res = await request(app.getHttpServer())
        .post(`/challenges/${CHALLENGE_ID}/enroll`)
        .expect(201);
      expect(service.enroll).toHaveBeenCalledWith(CHALLENGE_ID, USER_ID);
      expect(res.body.id).toBe(ENROLLMENT_ID);
      expect(res.body.status).toBe(EnrollmentStatus.IN_PROGRESS);
    });

    it('returns 409 when service throws ConflictException', async () => {
      allowAuth = true;
      service.enroll.mockRejectedValue(new ConflictException());
      await request(app.getHttpServer())
        .post(`/challenges/${CHALLENGE_ID}/enroll`)
        .expect(409);
    });
  });

  describe('DELETE /challenges/:id/enroll', () => {
    it('returns 204 on in_progress withdraw', async () => {
      allowAuth = true;
      service.withdraw.mockResolvedValue(undefined);
      await request(app.getHttpServer())
        .delete(`/challenges/${CHALLENGE_ID}/enroll`)
        .expect(204);
    });

    it('returns 409 when status is not in_progress', async () => {
      allowAuth = true;
      service.withdraw.mockRejectedValue(new ConflictException());
      await request(app.getHttpServer())
        .delete(`/challenges/${CHALLENGE_ID}/enroll`)
        .expect(409);
    });

    it('returns 404 when not enrolled', async () => {
      allowAuth = true;
      service.withdraw.mockRejectedValue(new NotFoundException());
      await request(app.getHttpServer())
        .delete(`/challenges/${CHALLENGE_ID}/enroll`)
        .expect(404);
    });
  });

  describe('GET /challenges/:id/enrollment', () => {
    it('returns 200 with the enrollment', async () => {
      allowAuth = true;
      service.findMyEnrollment.mockResolvedValue(buildEnrollmentDto());
      const res = await request(app.getHttpServer())
        .get(`/challenges/${CHALLENGE_ID}/enrollment`)
        .expect(200);
      expect(res.body.id).toBe(ENROLLMENT_ID);
    });

    it('returns 404 when not enrolled', async () => {
      allowAuth = true;
      service.findMyEnrollment.mockRejectedValue(new NotFoundException());
      await request(app.getHttpServer())
        .get(`/challenges/${CHALLENGE_ID}/enrollment`)
        .expect(404);
    });
  });
});
