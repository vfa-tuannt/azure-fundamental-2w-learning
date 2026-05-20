import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { User } from './users/user.entity';
import { Challenge } from './challenges/challenge.entity';
import { Enrollment } from './enrollments/enrollment.entity';
import { Submission } from './submissions/submission.entity';
import { ActivityEvent } from './activity/activity-event.entity';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

export default new DataSource({
  type: 'postgres',
  url: databaseUrl,
  entities: [User, Challenge, Enrollment, Submission, ActivityEvent],
  migrations: ['src/migrations/*.ts'],
  migrationsTableName: 'migrations',
});
