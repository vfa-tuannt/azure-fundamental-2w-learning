import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { MyEnrollmentDto } from '../enrollments/dto/my-enrollment.dto';
import { User } from '../users/user.entity';

@Controller('me')
export class MeController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  @Get('enrollments')
  @UseGuards(JwtAuthGuard)
  myEnrollments(@CurrentUser() user: User): Promise<MyEnrollmentDto[]> {
    return this.enrollments.listMine(user.id);
  }
}
