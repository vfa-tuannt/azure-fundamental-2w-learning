import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { User } from './users/user.entity';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

export default new DataSource({
  type: 'postgres',
  url: databaseUrl,
  entities: [User],
  migrations: ['src/migrations/*.ts'],
  migrationsTableName: 'migrations',
});
