import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { ChallengesController } from './challenges.controller';
import { ChallengesService } from './challenges.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChallengeStatus } from './challenge.entity';
import { ChallengeDto } from './dto/challenge.dto';
import { User } from '../users/user.entity';

const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const CHALLENGE_ID = '22222222-2222-2222-2222-222222222222';

const mockOwner: User = {
  id: OWNER_ID,
  email: 'alice@vitalify.asia',
  name: 'Alice',
  avatarUrl: null,
  createdAt: new Date(),
};

function buildDto(): ChallengeDto {
  return {
    id: CHALLENGE_ID,
    ownerId: OWNER_ID,
    title: 'Test',
    description: 'Body',
    requiredSkills: ['azure'],
    deadline: '2099-01-01T00:00:00.000Z',
    maxEnrollments: null,
    status: ChallengeStatus.OPEN,
    createdAt: '2024-01-01T00:00:00.000Z',
    enrollmentsCount: 0,
  };
}

describe('ChallengesController (e2e)', () => {
  let app: import('@nestjs/common').INestApplication;
  let allowAuth = false;
  const service = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ChallengesController],
      providers: [{ provide: ChallengesService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: import('@nestjs/common').ExecutionContext) => {
          if (!allowAuth) return false;
          const req = ctx.switchToHttp().getRequest<{ user: User }>();
          req.user = mockOwner;
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

  it('GET /challenges is public and returns paginated list', async () => {
    service.findAll.mockResolvedValue({
      items: [buildDto()],
      page: 1,
      limit: 20,
      total: 1,
    });
    const res = await request(app.getHttpServer())
      .get('/challenges')
      .expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].enrollmentsCount).toBe(0);
  });

  it('GET /challenges?limit=999 returns 400', async () => {
    await request(app.getHttpServer()).get('/challenges?limit=999').expect(400);
  });

  it('GET /challenges?status=archived returns 400', async () => {
    await request(app.getHttpServer())
      .get('/challenges?status=archived')
      .expect(400);
  });

  it('POST /challenges without JWT returns 401/403', async () => {
    allowAuth = false;
    const res = await request(app.getHttpServer()).post('/challenges').send({
      title: 'x',
      description: 'y',
      requiredSkills: [],
      deadline: '2099-01-01T00:00:00Z',
    });
    expect([401, 403]).toContain(res.status);
  });

  it('POST /challenges with invalid body returns 400', async () => {
    allowAuth = true;
    await request(app.getHttpServer())
      .post('/challenges')
      .send({ description: 'no title', requiredSkills: [] })
      .expect(400);
  });

  it('POST /challenges with past deadline returns 400', async () => {
    allowAuth = true;
    await request(app.getHttpServer())
      .post('/challenges')
      .send({
        title: 't',
        description: 'd',
        requiredSkills: [],
        deadline: '2000-01-01T00:00:00Z',
      })
      .expect(400);
  });

  it('POST /challenges with unknown field returns 400', async () => {
    allowAuth = true;
    await request(app.getHttpServer())
      .post('/challenges')
      .send({
        title: 't',
        description: 'd',
        requiredSkills: [],
        deadline: '2099-01-01T00:00:00Z',
        status: 'closed',
      })
      .expect(400);
  });

  it('POST /challenges with valid body returns 201', async () => {
    allowAuth = true;
    service.create.mockResolvedValue(buildDto());
    const res = await request(app.getHttpServer())
      .post('/challenges')
      .send({
        title: 'Test',
        description: 'Body',
        requiredSkills: ['azure'],
        deadline: '2099-01-01T00:00:00Z',
      })
      .expect(201);
    expect(service.create).toHaveBeenCalledWith(OWNER_ID, expect.any(Object));
    expect(res.body.id).toBe(CHALLENGE_ID);
  });

  it('DELETE /challenges/:id returns 204 for owner', async () => {
    allowAuth = true;
    service.remove.mockResolvedValue(undefined);
    await request(app.getHttpServer())
      .delete(`/challenges/${CHALLENGE_ID}`)
      .expect(204);
  });
});
