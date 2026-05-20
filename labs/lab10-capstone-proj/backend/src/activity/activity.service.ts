import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { ActivityEvent } from './activity-event.entity';
import { ActivityEventType } from './activity-event-type.enum';
import {
  ActivityActor,
  ActivityEventDto,
  ActivityPayload,
} from './dto/activity-event.dto';
import { RecordEventInput } from './dto/record-event.dto';

interface RawActivityRow {
  e_id: string;
  e_event_type: ActivityEventType;
  e_payload: ActivityPayload;
  e_created_at: Date;
  u_id: string | null;
  u_name: string | null;
  u_avatar_url: string | null;
}

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(
    @InjectRepository(ActivityEvent)
    private readonly events: Repository<ActivityEvent>,
  ) {}

  async record(input: RecordEventInput): Promise<void> {
    try {
      const entity = this.events.create({
        userId: input.userId,
        type: input.type,
        payload: input.payload as unknown as Record<string, unknown>,
      });
      await this.events.save(entity);
    } catch (err) {
      this.logger.error(
        `Failed to record activity event userId=${input.userId} type=${input.type}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  async listRecent(): Promise<ActivityEventDto[]> {
    const rows = await this.buildBaseQuery()
      .limit(50)
      .getRawMany<RawActivityRow>();
    return rows.map((row) => this.toDto(row));
  }

  async listForUser(userId: string): Promise<ActivityEventDto[]> {
    const rows = await this.buildBaseQuery()
      .where('e.user_id = :userId', { userId })
      .limit(50)
      .getRawMany<RawActivityRow>();
    return rows.map((row) => this.toDto(row));
  }

  private buildBaseQuery() {
    return this.events
      .createQueryBuilder('e')
      .leftJoin(User, 'u', 'u.id = e.user_id')
      .select('e.id', 'e_id')
      .addSelect('e.event_type', 'e_event_type')
      .addSelect('e.payload', 'e_payload')
      .addSelect('e.created_at', 'e_created_at')
      .addSelect('u.id', 'u_id')
      .addSelect('u.name', 'u_name')
      .addSelect('u.avatar_url', 'u_avatar_url')
      .orderBy('e.created_at', 'DESC');
  }

  private toDto(row: RawActivityRow): ActivityEventDto {
    const actor: ActivityActor =
      row.u_id !== null
        ? {
            id: row.u_id,
            name: row.u_name ?? '',
            avatarUrl: row.u_avatar_url,
          }
        : { id: '', name: '', avatarUrl: null };
    return {
      id: row.e_id,
      type: row.e_event_type,
      payload: row.e_payload,
      createdAt: new Date(row.e_created_at).toISOString(),
      user: actor,
    };
  }
}
