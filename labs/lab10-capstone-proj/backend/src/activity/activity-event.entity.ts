import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import {
  ACTIVITY_EVENT_TYPE_ENUM,
  ActivityEventType,
} from './activity-event-type.enum';

@Entity({ name: 'activity_events' })
@Index('IDX_activity_events_created_at', ['createdAt'])
@Index('IDX_activity_events_user_id_created_at', ['userId', 'createdAt'])
export class ActivityEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({
    name: 'event_type',
    type: 'enum',
    enum: ActivityEventType,
    enumName: ACTIVITY_EVENT_TYPE_ENUM,
  })
  type!: ActivityEventType;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  payload!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
