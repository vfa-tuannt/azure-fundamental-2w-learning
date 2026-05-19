import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateSubmissionDto {
  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false })
  externalUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
