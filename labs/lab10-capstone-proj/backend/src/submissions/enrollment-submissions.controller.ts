import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User } from '../users/user.entity';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { SubmissionDto } from './dto/submission.dto';
import { MulterPayloadTooLargeFilter } from './multer-error.filter';
import { MAX_FILE_BYTES, SubmissionsService } from './submissions.service';

@Controller('enrollments/:id/submissions')
export class EnrollmentSubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseFilters(MulterPayloadTooLargeFilter)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } }),
  )
  async create(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: CreateSubmissionDto,
  ): Promise<SubmissionDto> {
    const hasFile = !!file;
    const hasUrl = !!body.externalUrl;
    if (hasFile && hasUrl) {
      throw new BadRequestException(
        'Provide either a file or an externalUrl, not both',
      );
    }
    if (!hasFile && !hasUrl) {
      throw new BadRequestException('A file or an externalUrl is required');
    }
    if (hasFile) {
      return this.submissions.createFromFile(id, user.id, file, body.notes);
    }
    return this.submissions.createFromUrl(
      id,
      user.id,
      body.externalUrl!,
      body.notes,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  list(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: User,
  ): Promise<SubmissionDto[]> {
    return this.submissions.listForEnrollment(id, user.id);
  }
}
