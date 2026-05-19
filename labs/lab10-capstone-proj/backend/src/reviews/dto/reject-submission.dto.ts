import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectSubmissionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
