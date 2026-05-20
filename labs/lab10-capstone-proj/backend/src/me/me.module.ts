import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Challenge } from '../challenges/challenge.entity';
import { Enrollment } from '../enrollments/enrollment.entity';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { MeController } from './me.controller';
import { MeService } from './me.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Challenge, Enrollment]),
    EnrollmentsModule,
    AuthModule,
  ],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
