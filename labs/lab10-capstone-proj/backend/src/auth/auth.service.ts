import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '../users/user.entity';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  signToken(user: User): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      picture: user.avatarUrl,
    };
    return this.jwt.sign(payload);
  }
}
