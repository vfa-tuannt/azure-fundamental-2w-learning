import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityEventType } from '../activity/activity-event-type.enum';
import { ActivityService } from '../activity/activity.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import { Challenge, ChallengeStatus } from './challenge.entity';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import { UpdateChallengeDto } from './dto/update-challenge.dto';
import { ListChallengesQueryDto } from './dto/list-challenges.query.dto';
import { ChallengeDto, ChallengeListResponse } from './dto/challenge.dto';

interface RawChallengeRow extends Record<string, unknown> {
  enrollments_count?: string | number;
}

@Injectable()
export class ChallengesService {
  constructor(
    @InjectRepository(Challenge)
    private readonly challenges: Repository<Challenge>,
    private readonly activity: ActivityService,
    private readonly telemetry: TelemetryService,
  ) {}

  async create(
    ownerId: string,
    dto: CreateChallengeDto,
  ): Promise<ChallengeDto> {
    const entity = this.challenges.create({
      ownerId,
      title: dto.title,
      description: dto.description,
      requiredSkills: dto.requiredSkills,
      deadline: dto.deadline,
      maxEnrollments: dto.maxEnrollments ?? null,
      status: ChallengeStatus.OPEN,
    });
    const saved = await this.challenges.save(entity);
    await this.activity.record({
      userId: ownerId,
      type: ActivityEventType.CHALLENGE_CREATED,
      payload: { challengeId: saved.id, challengeTitle: saved.title },
    });
    this.telemetry.trackEvent('challenge.created', {
      userId: ownerId,
      challengeId: saved.id,
      challengeTitle: saved.title,
    });
    return this.toDto(saved, 0);
  }

  async findAll(query: ListChallengesQueryDto): Promise<ChallengeListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.challenges
      .createQueryBuilder('c')
      .where('c.deleted_at IS NULL');

    if (query.status) {
      qb.andWhere('c.status = :status', { status: query.status });
    }
    if (query.skill) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM unnest(c.required_skills) AS s WHERE s ILIKE :skill)`,
        { skill: `%${query.skill}%` },
      );
    }

    const total = await qb.getCount();

    const { entities, raw } = await qb
      .clone()
      .addSelect(
        `(SELECT COUNT(*) FROM enrollments e WHERE e.challenge_id = c.id AND e.status != 'rejected')`,
        'enrollments_count',
      )
      .orderBy('c.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getRawAndEntities();

    const items = entities.map((entity, idx) => {
      const raw_row = raw[idx] as RawChallengeRow;
      const rawCount = raw_row?.enrollments_count;
      const count =
        typeof rawCount === 'string'
          ? Number(rawCount)
          : typeof rawCount === 'number'
            ? rawCount
            : 0;
      return this.toDto(entity, count);
    });

    return { items, page, limit, total };
  }

  async findOne(id: string): Promise<ChallengeDto> {
    const entity = await this.loadById(id);
    const count = await this.countEnrollments(id);
    return this.toDto(entity, count);
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateChallengeDto,
  ): Promise<ChallengeDto> {
    const entity = await this.loadById(id);
    if (entity.ownerId !== userId) {
      throw new ForbiddenException();
    }
    if (dto.title !== undefined) entity.title = dto.title;
    if (dto.description !== undefined) entity.description = dto.description;
    if (dto.requiredSkills !== undefined)
      entity.requiredSkills = dto.requiredSkills;
    if (dto.deadline !== undefined) entity.deadline = dto.deadline;
    if (dto.maxEnrollments !== undefined)
      entity.maxEnrollments = dto.maxEnrollments;
    if (dto.status !== undefined) entity.status = dto.status;
    const saved = await this.challenges.save(entity);
    const count = await this.countEnrollments(saved.id);
    return this.toDto(saved, count);
  }

  async remove(id: string, userId: string): Promise<void> {
    const entity = await this.loadById(id);
    if (entity.ownerId !== userId) {
      throw new ForbiddenException();
    }
    await this.challenges.softRemove(entity);
  }

  private async loadById(id: string): Promise<Challenge> {
    const entity = await this.challenges.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException();
    }
    return entity;
  }

  private async countEnrollments(challengeId: string): Promise<number> {
    const result = await this.challenges.manager
      .createQueryBuilder()
      .select('COUNT(*)', 'count')
      .from('enrollments', 'e')
      .where('e.challenge_id = :challengeId', { challengeId })
      .andWhere(`e.status != 'rejected'`)
      .getRawOne<{ count: string }>();
    return result ? Number(result.count) : 0;
  }

  private toDto(entity: Challenge, enrollmentsCount: number): ChallengeDto {
    return {
      id: entity.id,
      ownerId: entity.ownerId,
      title: entity.title,
      description: entity.description,
      requiredSkills: entity.requiredSkills,
      deadline: entity.deadline.toISOString(),
      maxEnrollments: entity.maxEnrollments,
      status: entity.status,
      createdAt: entity.createdAt.toISOString(),
      enrollmentsCount,
    };
  }
}
