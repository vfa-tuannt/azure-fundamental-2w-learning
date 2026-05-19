import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { MeController } from './me.controller';

@Module({
  imports: [EnrollmentsModule, AuthModule],
  controllers: [MeController],
})
export class MeModule {}
