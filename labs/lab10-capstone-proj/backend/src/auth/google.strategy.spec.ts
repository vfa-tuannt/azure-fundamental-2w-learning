import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { Profile } from 'passport-google-oauth20';
import { GoogleStrategy } from './google.strategy';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';

function buildProfile(email: string): Profile {
  return {
    id: 'g-123',
    displayName: 'Test User',
    emails: [{ value: email, verified: true }],
    photos: [{ value: 'https://example.com/avatar.png' }],
  } as unknown as Profile;
}

describe('GoogleStrategy', () => {
  const config = {
    getOrThrow: (key: string) => {
      switch (key) {
        case 'GOOGLE_CLIENT_ID':
          return 'client-id';
        case 'GOOGLE_CLIENT_SECRET':
          return 'client-secret';
        case 'GOOGLE_CALLBACK_URL':
          return 'http://localhost:3000/auth/google/callback';
        default:
          throw new Error(`unexpected key ${key}`);
      }
    },
  } as unknown as ConfigService;

  it('rejects non-@vitalify.asia email with ForbiddenException', async () => {
    const users = {
      upsertFromGoogleProfile: jest.fn(),
    } as unknown as UsersService;
    const strategy = new GoogleStrategy(config, users);

    const done = jest.fn();
    await strategy.validate(
      'access',
      'refresh',
      buildProfile('hacker@gmail.com'),
      done,
    );

    expect(done).toHaveBeenCalledTimes(1);
    expect(done.mock.calls[0][0]).toBeInstanceOf(ForbiddenException);
    expect(users.upsertFromGoogleProfile).not.toHaveBeenCalled();
  });

  it('upserts user and returns it for @vitalify.asia email', async () => {
    const upserted: User = {
      id: 'uuid-1',
      email: 'alice@vitalify.asia',
      name: 'Alice',
      avatarUrl: 'https://example.com/avatar.png',
      createdAt: new Date(),
    };
    const users = {
      upsertFromGoogleProfile: jest.fn().mockResolvedValue(upserted),
    } as unknown as UsersService;
    const strategy = new GoogleStrategy(config, users);

    const done = jest.fn();
    await strategy.validate(
      'access',
      'refresh',
      buildProfile('alice@vitalify.asia'),
      done,
    );

    expect(users.upsertFromGoogleProfile).toHaveBeenCalledWith({
      email: 'alice@vitalify.asia',
      name: 'Test User',
      avatarUrl: 'https://example.com/avatar.png',
    });
    expect(done).toHaveBeenCalledWith(null, upserted);
  });
});
