import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EnrollmentStatus } from '../enrollments/enrollment-status.enum';
import { User } from '../users/user.entity';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const CHALLENGE_ID = '22222222-2222-2222-2222-222222222222';
const ENROLLMENT_ID = '44444444-4444-4444-4444-444444444444';
const SUBMISSION_ID = '33333333-3333-3333-3333-333333333333';

const mockUser: User = {
  id: USER_ID,
  email: 'owner@vitalify.asia',
  name: 'Owner',
  avatarUrl: null,
  createdAt: new Date(),
};

function buildSubmissionDto(overrides: Record<string, unknown> = {}) {
  return {
    id: SUBMISSION_ID,
    enrollmentId: ENROLLMENT_ID,
    blobUrl: null,
    externalUrl: 'https://github.com/u/r',
    notes: '',
    submittedAt: '2024-01-03T00:00:00.000Z',
    rejectionReason: null,
    reviewedAt: null,
    ...overrides,
  };
}

function buildChallengeSubmissionDto() {
  return {
    ...buildSubmissionDto(),
    enrollment: {
      id: ENROLLMENT_ID,
      userId: '99999999-9999-9999-9999-999999999999',
      status: EnrollmentStatus.SUBMITTED,
    },
    submitter: {
      id: '99999999-9999-9999-9999-999999999999',
      name: 'Bob',
      email: 'bob@vitalify.asia',
      avatarUrl: null,
    },
  };
}

describe('ReviewsController (e2e)', () => {
  let app: import('@nestjs/common').INestApplication;
  let allowAuth = false;
  const service = {
    approve: jest.fn(),
    reject: jest.fn(),
    listForChallenge: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ReviewsController],
      providers: [{ provide: ReviewsService, useValue: service }],
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

  describe('POST /submissions/:id/approve', () => {
    it('returns 401/403 without JWT', async () => {
      const res = await request(app.getHttpServer()).post(
        `/submissions/${SUBMISSION_ID}/approve`,
      );
      expect([401, 403]).toContain(res.status);
    });

    it('returns 200 on success with the updated submission DTO', async () => {
      allowAuth = true;
      service.approve.mockResolvedValue(
        buildSubmissionDto({ reviewedAt: '2024-02-01T00:00:00.000Z' }),
      );
      const res = await request(app.getHttpServer())
        .post(`/submissions/${SUBMISSION_ID}/approve`)
        .expect(200);
      expect(res.body.id).toBe(SUBMISSION_ID);
      expect(res.body.reviewedAt).toBe('2024-02-01T00:00:00.000Z');
      expect(res.body.rejectionReason).toBeNull();
      expect(service.approve).toHaveBeenCalledWith(SUBMISSION_ID, USER_ID);
    });

    it('returns 403 when service throws ForbiddenException', async () => {
      allowAuth = true;
      service.approve.mockRejectedValue(new ForbiddenException());
      await request(app.getHttpServer())
        .post(`/submissions/${SUBMISSION_ID}/approve`)
        .expect(403);
    });

    it('returns 404 when service throws NotFoundException', async () => {
      allowAuth = true;
      service.approve.mockRejectedValue(new NotFoundException());
      await request(app.getHttpServer())
        .post(`/submissions/${SUBMISSION_ID}/approve`)
        .expect(404);
    });

    it('returns 409 when service throws ConflictException', async () => {
      allowAuth = true;
      service.approve.mockRejectedValue(new ConflictException());
      await request(app.getHttpServer())
        .post(`/submissions/${SUBMISSION_ID}/approve`)
        .expect(409);
    });
  });

  describe('POST /submissions/:id/reject', () => {
    it('returns 401/403 without JWT', async () => {
      const res = await request(app.getHttpServer()).post(
        `/submissions/${SUBMISSION_ID}/reject`,
      );
      expect([401, 403]).toContain(res.status);
    });

    it('returns 200 with a reason', async () => {
      allowAuth = true;
      service.reject.mockResolvedValue(
        buildSubmissionDto({
          reviewedAt: '2024-02-01T00:00:00.000Z',
          rejectionReason: 'No tests',
        }),
      );
      const res = await request(app.getHttpServer())
        .post(`/submissions/${SUBMISSION_ID}/reject`)
        .send({ reason: 'No tests' })
        .expect(200);
      expect(res.body.rejectionReason).toBe('No tests');
      expect(service.reject).toHaveBeenCalledWith(
        SUBMISSION_ID,
        USER_ID,
        'No tests',
      );
    });

    it('returns 200 with no reason (empty body)', async () => {
      allowAuth = true;
      service.reject.mockResolvedValue(
        buildSubmissionDto({
          reviewedAt: '2024-02-01T00:00:00.000Z',
          rejectionReason: null,
        }),
      );
      const res = await request(app.getHttpServer())
        .post(`/submissions/${SUBMISSION_ID}/reject`)
        .send({})
        .expect(200);
      expect(res.body.rejectionReason).toBeNull();
      expect(service.reject).toHaveBeenCalledWith(
        SUBMISSION_ID,
        USER_ID,
        undefined,
      );
    });

    it('returns 400 when reason exceeds 1000 chars', async () => {
      allowAuth = true;
      const tooLong = 'a'.repeat(1001);
      await request(app.getHttpServer())
        .post(`/submissions/${SUBMISSION_ID}/reject`)
        .send({ reason: tooLong })
        .expect(400);
      expect(service.reject).not.toHaveBeenCalled();
    });

    it('returns 400 when reason is not a string', async () => {
      allowAuth = true;
      await request(app.getHttpServer())
        .post(`/submissions/${SUBMISSION_ID}/reject`)
        .send({ reason: 123 })
        .expect(400);
      expect(service.reject).not.toHaveBeenCalled();
    });

    it('returns 403 when service throws ForbiddenException', async () => {
      allowAuth = true;
      service.reject.mockRejectedValue(new ForbiddenException());
      await request(app.getHttpServer())
        .post(`/submissions/${SUBMISSION_ID}/reject`)
        .send({})
        .expect(403);
    });

    it('returns 404 when service throws NotFoundException', async () => {
      allowAuth = true;
      service.reject.mockRejectedValue(new NotFoundException());
      await request(app.getHttpServer())
        .post(`/submissions/${SUBMISSION_ID}/reject`)
        .send({})
        .expect(404);
    });

    it('returns 409 when service throws ConflictException', async () => {
      allowAuth = true;
      service.reject.mockRejectedValue(new ConflictException());
      await request(app.getHttpServer())
        .post(`/submissions/${SUBMISSION_ID}/reject`)
        .send({})
        .expect(409);
    });
  });

  describe('GET /challenges/:id/submissions', () => {
    it('returns 401/403 without JWT', async () => {
      const res = await request(app.getHttpServer()).get(
        `/challenges/${CHALLENGE_ID}/submissions`,
      );
      expect([401, 403]).toContain(res.status);
    });

    it('returns 200 with the embedded shape', async () => {
      allowAuth = true;
      service.listForChallenge.mockResolvedValue([
        buildChallengeSubmissionDto(),
      ]);
      const res = await request(app.getHttpServer())
        .get(`/challenges/${CHALLENGE_ID}/submissions`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].submitter.name).toBe('Bob');
      expect(res.body[0].enrollment.status).toBe('submitted');
      expect(service.listForChallenge).toHaveBeenCalledWith(
        CHALLENGE_ID,
        USER_ID,
      );
    });

    it('returns 403 when service throws ForbiddenException', async () => {
      allowAuth = true;
      service.listForChallenge.mockRejectedValue(new ForbiddenException());
      await request(app.getHttpServer())
        .get(`/challenges/${CHALLENGE_ID}/submissions`)
        .expect(403);
    });

    it('returns 404 when service throws NotFoundException', async () => {
      allowAuth = true;
      service.listForChallenge.mockRejectedValue(new NotFoundException());
      await request(app.getHttpServer())
        .get(`/challenges/${CHALLENGE_ID}/submissions`)
        .expect(404);
    });
  });
});
