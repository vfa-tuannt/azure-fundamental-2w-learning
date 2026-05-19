import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional } from 'class-validator';
import { ChallengeStatus } from '../challenge.entity';
import { CreateChallengeDto } from './create-challenge.dto';

export class UpdateChallengeDto extends PartialType(CreateChallengeDto) {
  @IsOptional()
  @IsEnum(ChallengeStatus)
  status?: ChallengeStatus;
}
