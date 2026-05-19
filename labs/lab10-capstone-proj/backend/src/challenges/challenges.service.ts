import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Challenge, ChallengeStatus } from './challenge.entity';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import { UpdateChallengeDto } from './dto/update-challenge.dto';
import { ListChallengesQueryDto } from './dto/list-challenges.query.dto';
import { ChallengeDto, ChallengeListResponse } from './dto/challenge.dto';

@Injectable()
export class ChallengesService {
  constructor(
    @InjectRepository(Challenge)
    private readonly challenges: Repository<Challenge>,
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
    return this.toDto(saved);
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

    const [entities, total] = await qb
      .orderBy('c.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items: entities.map((e) => this.toDto(e)),
      page,
      limit,
      total,
    };
  }

  async findOne(id: string): Promise<ChallengeDto> {
    const entity = await this.loadById(id);
    return this.toDto(entity);
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
    return this.toDto(saved);
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

  private toDto(entity: Challenge): ChallengeDto {
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
      enrollmentsCount: 0,
    };
  }
}
