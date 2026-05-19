import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Challenge } from '../challenges/challenge.entity';
import { Enrollment } from '../enrollments/enrollment.entity';
import { AzureBlobStorageService } from './azure-blob-storage.service';
import { EnrollmentSubmissionsController } from './enrollment-submissions.controller';
import { Submission } from './submission.entity';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Submission, Enrollment, Challenge]),
    AuthModule,
  ],
  controllers: [EnrollmentSubmissionsController, SubmissionsController],
  providers: [SubmissionsService, AzureBlobStorageService],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
