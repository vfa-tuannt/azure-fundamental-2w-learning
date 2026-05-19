import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User } from '../users/user.entity';
import { EnrollmentSubmissionsController } from './enrollment-submissions.controller';
import { SubmissionsService } from './submissions.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const ENROLLMENT_ID = '22222222-2222-2222-2222-222222222222';
const SUBMISSION_ID = '33333333-3333-3333-3333-333333333333';

const mockUser: User = {
  id: USER_ID,
  email: 'alice@vitalify.asia',
  name: 'Alice',
  avatarUrl: null,
  createdAt: new Date(),
};

const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

function buildSubmissionDto() {
  return {
    id: SUBMISSION_ID,
    enrollmentId: ENROLLMENT_ID,
    blobUrl: 'https://example/devstoreaccount1/submissions/x/y/uuid-r.pdf',
    externalUrl: null,
    notes: '',
    submittedAt: '2024-01-03T00:00:00.000Z',
  };
}

describe('EnrollmentSubmissionsController (e2e)', () => {
  let app: import('@nestjs/common').INestApplication;
  let allowAuth = false;
  const service = {
    createFromFile: jest.fn(),
    createFromUrl: jest.fn(),
    listForEnrollment: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [EnrollmentSubmissionsController],
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

  describe('POST /enrollments/:id/submissions', () => {
    it('returns 401/403 without JWT', async () => {
      const res = await request(app.getHttpServer()).post(
        `/enrollments/${ENROLLMENT_ID}/submissions`,
      );
      expect([401, 403]).toContain(res.status);
    });

    it('returns 201 for valid file upload (multipart)', async () => {
      allowAuth = true;
      service.createFromFile.mockResolvedValue(buildSubmissionDto());
      const res = await request(app.getHttpServer())
        .post(`/enrollments/${ENROLLMENT_ID}/submissions`)
        .attach('file', PDF_MAGIC, {
          filename: 'r.pdf',
          contentType: 'application/pdf',
        })
        .field('notes', 'some note')
        .expect(201);
      expect(service.createFromFile).toHaveBeenCalledWith(
        ENROLLMENT_ID,
        USER_ID,
        expect.objectContaining({ originalname: 'r.pdf' }),
        'some note',
      );
      expect(res.body.id).toBe(SUBMISSION_ID);
    });

    it('returns 201 for valid URL submission (JSON)', async () => {
      allowAuth = true;
      service.createFromUrl.mockResolvedValue(buildSubmissionDto());
      const res = await request(app.getHttpServer())
        .post(`/enrollments/${ENROLLMENT_ID}/submissions`)
        .send({ externalUrl: 'https://github.com/u/r', notes: 'see' })
        .expect(201);
      expect(service.createFromUrl).toHaveBeenCalledWith(
        ENROLLMENT_ID,
        USER_ID,
        'https://github.com/u/r',
        'see',
      );
      expect(res.body.id).toBe(SUBMISSION_ID);
    });

    it('returns 400 when both file and externalUrl are provided', async () => {
      allowAuth = true;
      await request(app.getHttpServer())
        .post(`/enrollments/${ENROLLMENT_ID}/submissions`)
        .attach('file', PDF_MAGIC, {
          filename: 'r.pdf',
          contentType: 'application/pdf',
        })
        .field('externalUrl', 'https://example.com')
        .expect(400);
      expect(service.createFromFile).not.toHaveBeenCalled();
      expect(service.createFromUrl).not.toHaveBeenCalled();
    });

    it('returns 400 when neither file nor externalUrl is provided', async () => {
      allowAuth = true;
      await request(app.getHttpServer())
        .post(`/enrollments/${ENROLLMENT_ID}/submissions`)
        .send({})
        .expect(400);
    });

    it('returns 400 when externalUrl is not a valid URL', async () => {
      allowAuth = true;
      await request(app.getHttpServer())
        .post(`/enrollments/${ENROLLMENT_ID}/submissions`)
        .send({ externalUrl: 'not a url' })
        .expect(400);
    });

    it('returns 422 when service rejects MIME type', async () => {
      allowAuth = true;
      service.createFromFile.mockRejectedValue(
        new UnprocessableEntityException({
          message: 'File type application/octet-stream is not allowed',
          allowed: [],
        }),
      );
      await request(app.getHttpServer())
        .post(`/enrollments/${ENROLLMENT_ID}/submissions`)
        .attach('file', Buffer.from('x'), {
          filename: 'a.bin',
          contentType: 'application/octet-stream',
        })
        .expect(422);
    });

    it('returns 403 when service throws ForbiddenException', async () => {
      allowAuth = true;
      service.createFromUrl.mockRejectedValue(new ForbiddenException());
      await request(app.getHttpServer())
        .post(`/enrollments/${ENROLLMENT_ID}/submissions`)
        .send({ externalUrl: 'https://example.com' })
        .expect(403);
    });

    it('returns 409 when service throws ConflictException', async () => {
      allowAuth = true;
      service.createFromUrl.mockRejectedValue(new ConflictException());
      await request(app.getHttpServer())
        .post(`/enrollments/${ENROLLMENT_ID}/submissions`)
        .send({ externalUrl: 'https://example.com' })
        .expect(409);
    });

    it('returns 404 when enrollment missing', async () => {
      allowAuth = true;
      service.createFromUrl.mockRejectedValue(new NotFoundException());
      await request(app.getHttpServer())
        .post(`/enrollments/${ENROLLMENT_ID}/submissions`)
        .send({ externalUrl: 'https://example.com' })
        .expect(404);
    });
  });

  describe('GET /enrollments/:id/submissions', () => {
    it('returns 401/403 without JWT', async () => {
      const res = await request(app.getHttpServer()).get(
        `/enrollments/${ENROLLMENT_ID}/submissions`,
      );
      expect([401, 403]).toContain(res.status);
    });

    it('returns 200 with submission array', async () => {
      allowAuth = true;
      service.listForEnrollment.mockResolvedValue([buildSubmissionDto()]);
      const res = await request(app.getHttpServer())
        .get(`/enrollments/${ENROLLMENT_ID}/submissions`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(service.listForEnrollment).toHaveBeenCalledWith(
        ENROLLMENT_ID,
        USER_ID,
      );
    });

    it('returns 403 when service throws ForbiddenException', async () => {
      allowAuth = true;
      service.listForEnrollment.mockRejectedValue(new ForbiddenException());
      await request(app.getHttpServer())
        .get(`/enrollments/${ENROLLMENT_ID}/submissions`)
        .expect(403);
    });

    it('returns 404 when enrollment missing', async () => {
      allowAuth = true;
      service.listForEnrollment.mockRejectedValue(new NotFoundException());
      await request(app.getHttpServer())
        .get(`/enrollments/${ENROLLMENT_ID}/submissions`)
        .expect(404);
    });
  });
});
