import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export enum ChallengeStatus {
  OPEN = 'open',
  CLOSED = 'closed',
}

export const CHALLENGE_STATUS_ENUM = 'challenge_status';

@Entity({ name: 'challenges' })
@Index('IDX_challenges_status_deleted_created', [
  'status',
  'deletedAt',
  'createdAt',
])
export class Challenge {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'owner_id' })
  owner!: User;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({
    name: 'required_skills',
    type: 'text',
    array: true,
    default: () => "'{}'",
  })
  requiredSkills!: string[];

  @Column({ type: 'timestamptz' })
  deadline!: Date;

  @Column({ name: 'max_enrollments', type: 'int', nullable: true })
  maxEnrollments!: number | null;

  @Column({
    type: 'enum',
    enum: ChallengeStatus,
    enumName: CHALLENGE_STATUS_ENUM,
    default: ChallengeStatus.OPEN,
  })
  status!: ChallengeStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
