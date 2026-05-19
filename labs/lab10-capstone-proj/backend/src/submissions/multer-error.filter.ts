import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ALLOWED_MIME, MAX_FILE_BYTES } from './submissions.service';

@Catch(PayloadTooLargeException)
export class MulterPayloadTooLargeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      message: `File size exceeds the ${MAX_FILE_BYTES}-byte limit`,
      allowed: ALLOWED_MIME,
    });
  }
}
