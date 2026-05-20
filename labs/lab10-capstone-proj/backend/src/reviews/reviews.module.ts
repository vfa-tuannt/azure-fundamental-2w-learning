import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';
import { Challenge } from '../challenges/challenge.entity';
import { Enrollment } from '../enrollments/enrollment.entity';
import { Submission } from '../submissions/submission.entity';
import { SubmissionsModule } from '../submissions/submissions.module';
import { User } from '../users/user.entity';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Submission, Enrollment, Challenge, User]),
    AuthModule,
    SubmissionsModule,
    ActivityModule,
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
