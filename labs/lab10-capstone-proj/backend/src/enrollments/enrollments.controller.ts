import {
  Controller,
  Delete,
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
import { User } from '../users/user.entity';
import { EnrollmentsService } from './enrollments.service';
import { EnrollmentDto } from './dto/enrollment.dto';

@Controller('challenges/:id')
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  @Post('enroll')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  enroll(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: User,
  ): Promise<EnrollmentDto> {
    return this.enrollments.enroll(id, user.id);
  }

  @Delete('enroll')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  withdraw(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    return this.enrollments.withdraw(id, user.id);
  }

  @Get('enrollment')
  @UseGuards(JwtAuthGuard)
  myEnrollment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: User,
  ): Promise<EnrollmentDto> {
    return this.enrollments.findMyEnrollment(id, user.id);
  }
}
