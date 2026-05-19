import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { User } from '../users/user.entity';
import { OAuthExceptionFilter } from './oauth-exception.filter';

interface AuthenticatedRequest {
  user: User;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin(): void {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @UseFilters(OAuthExceptionFilter)
  googleCallback(@Req() req: AuthenticatedRequest, @Res() res: Response): void {
    if (!req.user) {
      throw new ForbiddenException('Authentication failed');
    }
    const token = this.authService.signToken(req.user);
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: AuthenticatedRequest): {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
  } {
    const { id, email, name, avatarUrl } = req.user;
    return { id, email, name, avatarUrl };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(): { success: true } {
    return { success: true };
  }
}
