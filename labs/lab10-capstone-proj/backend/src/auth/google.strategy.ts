import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly allowedDomains: string[];

  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      clientID: config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: config.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
    });
    this.allowedDomains = (
      config.get<string>('AUTH_ALLOWED_DOMAINS') ?? 'vitalify.asia'
    )
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    try {
      const email = profile.emails?.[0]?.value;
      const domainAllowed =
        !!email && this.allowedDomains.some((d) => email.endsWith('@' + d));
      if (!domainAllowed) {
        throw new ForbiddenException(
          `Only ${this.allowedDomains.map((d) => '@' + d).join(', ')} accounts are allowed`,
        );
      }
      const name = profile.displayName || email.split('@')[0];
      const avatarUrl = profile.photos?.[0]?.value ?? null;
      const user: User = await this.usersService.upsertFromGoogleProfile({
        email,
        name,
        avatarUrl,
      });
      done(null, user);
    } catch (err) {
      done(err as Error);
    }
  }
}