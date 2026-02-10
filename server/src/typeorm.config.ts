import { DataSource } from 'typeorm';
import { Process } from './modules/process/entities/process.entity';
import { ProcessVersion } from './modules/process/entities/process-version.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'bpm_editor',
  entities: [Process, ProcessVersion],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  logging: false,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});
