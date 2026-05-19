import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Challenge } from '../challenges/challenge.entity';
import { User } from '../users/user.entity';
import {
  ENROLLMENT_STATUS_ENUM,
  EnrollmentStatus,
} from './enrollment-status.enum';

@Entity({ name: 'enrollments' })
@Unique('UQ_enrollments_challenge_user', ['challengeId', 'userId'])
@Index('IDX_enrollments_user_enrolled', ['userId', 'enrolledAt'])
@Index('IDX_enrollments_challenge', ['challengeId'])
export class Enrollment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'challenge_id', type: 'uuid' })
  challengeId!: string;

  @ManyToOne(() => Challenge, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'challenge_id' })
  challenge!: Challenge;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({
    type: 'enum',
    enum: EnrollmentStatus,
    enumName: ENROLLMENT_STATUS_ENUM,
    default: EnrollmentStatus.IN_PROGRESS,
  })
  status!: EnrollmentStatus;

  @CreateDateColumn({ name: 'enrolled_at', type: 'timestamptz' })
  enrolledAt!: Date;
}
