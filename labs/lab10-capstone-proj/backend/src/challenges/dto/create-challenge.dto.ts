import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDate,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinDate,
} from 'class-validator';

export class CreateChallengeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  requiredSkills!: string[];

  @Type(() => Date)
  @IsDate()
  @MinDate(() => new Date(), {
    message: 'deadline must be a date in the future',
  })
  deadline!: Date;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxEnrollments?: number;
}
