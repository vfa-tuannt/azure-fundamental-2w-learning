import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User } from '../users/user.entity';
import { ChallengesService } from './challenges.service';
import { ChallengeDto, ChallengeListResponse } from './dto/challenge.dto';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import { ListChallengesQueryDto } from './dto/list-challenges.query.dto';
import { UpdateChallengeDto } from './dto/update-challenge.dto';

@Controller('challenges')
export class ChallengesController {
  constructor(private readonly challenges: ChallengesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() user: User,
    @Body() dto: CreateChallengeDto,
  ): Promise<ChallengeDto> {
    return this.challenges.create(user.id, dto);
  }

  @Get()
  list(@Query() query: ListChallengesQueryDto): Promise<ChallengeListResponse> {
    return this.challenges.findAll(query);
  }

  @Get(':id')
  detail(@Param('id', new ParseUUIDPipe()) id: string): Promise<ChallengeDto> {
    return this.challenges.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateChallengeDto,
  ): Promise<ChallengeDto> {
    return this.challenges.update(id, user.id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    return this.challenges.remove(id, user.id);
  }
}
