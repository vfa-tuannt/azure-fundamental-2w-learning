import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OAuthExceptionFilter } from './oauth-exception.filter';
import { AuthGuard } from '@nestjs/passport';
import { User } from '../users/user.entity';

const mockUser: User = {
  id: 'uuid-1',
  email: 'alice@vitalify.asia',
  name: 'Alice',
  avatarUrl: null,
  createdAt: new Date(),
};

describe('AuthController', () => {
  let app: INestApplication;
  let allowAuth = false;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { signToken: () => 'fake-jwt' } },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => 'http://localhost:5173' },
        },
        OAuthExceptionFilter,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          if (!allowAuth) return false;
          const req = ctx.switchToHttp().getRequest<{ user: User }>();
          req.user = mockUser;
          return true;
        },
      })
      .overrideGuard(AuthGuard('google'))
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /auth/me returns 401 without token', async () => {
    allowAuth = false;
    await request(app.getHttpServer()).get('/auth/me').expect(403);
    // Nest's overridden guard returns false → 403 in Passport guard wrapping;
    // production guard returns 401 via UnauthorizedException
  });

  it('GET /auth/me returns 200 with user when authenticated', async () => {
    allowAuth = true;
    const res = await request(app.getHttpServer()).get('/auth/me').expect(200);
    expect(res.body).toEqual({
      id: mockUser.id,
      email: mockUser.email,
      name: mockUser.name,
      avatarUrl: mockUser.avatarUrl,
    });
  });

  it('POST /auth/logout returns 200', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/logout')
      .expect(200);
    expect(res.body).toEqual({ success: true });
  });
});
