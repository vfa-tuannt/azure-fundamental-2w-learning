import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ChallengesModule } from './challenges/challenges.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { MeModule } from './me/me.module';
import { User } from './users/user.entity';
import { Challenge } from './challenges/challenge.entity';
import { Enrollment } from './enrollments/enrollment.entity';
import { Submission } from './submissions/submission.entity';
import { SubmissionsModule } from './submissions/submissions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        entities: [User, Challenge, Enrollment, Submission],
        synchronize: false,
      }),
    }),
    UsersModule,
    AuthModule,
    ChallengesModule,
    EnrollmentsModule,
    MeModule,
    SubmissionsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
