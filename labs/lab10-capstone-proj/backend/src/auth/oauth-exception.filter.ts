import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

@Catch(ForbiddenException)
export class OAuthExceptionFilter implements ExceptionFilter {
  constructor(private readonly config: ConfigService) {}

  catch(_exception: ForbiddenException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    res.redirect(`${frontendUrl}/login?error=domain`);
  }
}
