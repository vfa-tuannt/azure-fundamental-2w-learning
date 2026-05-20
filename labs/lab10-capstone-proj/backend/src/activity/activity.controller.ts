import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User } from '../users/user.entity';
import { ActivityService } from './activity.service';
import { ActivityEventDto } from './dto/activity-event.dto';

@Controller('activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get('recent')
  listRecent(): Promise<ActivityEventDto[]> {
    return this.activity.listRecent();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  listMine(@CurrentUser() user: User): Promise<ActivityEventDto[]> {
    return this.activity.listForUser(user.id);
  }
}
