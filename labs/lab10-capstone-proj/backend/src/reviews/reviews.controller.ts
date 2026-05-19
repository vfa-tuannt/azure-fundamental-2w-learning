import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SubmissionDto } from '../submissions/dto/submission.dto';
import { User } from '../users/user.entity';
import { ChallengeSubmissionDto } from './dto/challenge-submission.dto';
import { RejectSubmissionDto } from './dto/reject-submission.dto';
import { ReviewsService } from './reviews.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post('submissions/:id/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: User,
  ): Promise<SubmissionDto> {
    return this.reviews.approve(id, user.id);
  }

  @Post('submissions/:id/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: User,
    @Body() body: RejectSubmissionDto,
  ): Promise<SubmissionDto> {
    return this.reviews.reject(id, user.id, body.reason);
  }

  @Get('challenges/:id/submissions')
  listForChallenge(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: User,
  ): Promise<ChallengeSubmissionDto[]> {
    return this.reviews.listForChallenge(id, user.id);
  }
}
