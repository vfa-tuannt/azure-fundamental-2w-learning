import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleStrategy } from './google.strategy';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OAuthExceptionFilter } from './oauth-exception.filter';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        privateKey: config
          .getOrThrow<string>('JWT_PRIVATE_KEY')
          .replace(/\\n/g, '\n'),
        publicKey: config
          .getOrThrow<string>('JWT_PUBLIC_KEY')
          .replace(/\\n/g, '\n'),
        signOptions: { algorithm: 'RS256', expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    GoogleStrategy,
    JwtStrategy,
    JwtAuthGuard,
    OAuthExceptionFilter,
  ],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
