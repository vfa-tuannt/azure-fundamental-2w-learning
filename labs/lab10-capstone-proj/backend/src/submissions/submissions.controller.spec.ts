import {
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User } from '../users/user.entity';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const SUBMISSION_ID = '33333333-3333-3333-3333-333333333333';

const mockUser: User = {
  id: USER_ID,
  email: 'alice@vitalify.asia',
  name: 'Alice',
  avatarUrl: null,
  createdAt: new Date(),
};

describe('SubmissionsController (e2e)', () => {
  let app: import('@nestjs/common').INestApplication;
  let allowAuth = false;
  const service = { findById: jest.fn() };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SubmissionsController],
      providers: [{ provide: SubmissionsService, useValue: service }],
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
      new ValidationPipe({ whitelist: true, transform: true }),
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

  it('GET /submissions/:id returns 401/403 without JWT', async () => {
    const res = await request(app.getHttpServer()).get(
      `/submissions/${SUBMISSION_ID}`,
    );
    expect([401, 403]).toContain(res.status);
  });

  it('GET /submissions/:id returns 200', async () => {
    allowAuth = true;
    service.findById.mockResolvedValue({
      id: SUBMISSION_ID,
      enrollmentId: 'e',
      blobUrl: null,
      externalUrl: 'https://github.com/u/r',
      notes: '',
      submittedAt: '2024-01-03T00:00:00.000Z',
      rejectionReason: null,
      reviewedAt: null,
    });
    const res = await request(app.getHttpServer())
      .get(`/submissions/${SUBMISSION_ID}`)
      .expect(200);
    expect(res.body.id).toBe(SUBMISSION_ID);
    expect(service.findById).toHaveBeenCalledWith(SUBMISSION_ID, USER_ID);
  });

  it('GET /submissions/:id returns 403 when service throws ForbiddenException', async () => {
    allowAuth = true;
    service.findById.mockRejectedValue(new ForbiddenException());
    await request(app.getHttpServer())
      .get(`/submissions/${SUBMISSION_ID}`)
      .expect(403);
  });

  it('GET /submissions/:id returns 404 when missing', async () => {
    allowAuth = true;
    service.findById.mockRejectedValue(new NotFoundException());
    await request(app.getHttpServer())
      .get(`/submissions/${SUBMISSION_ID}`)
      .expect(404);
  });
});
