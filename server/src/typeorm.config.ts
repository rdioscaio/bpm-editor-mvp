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
  // Em produção, usar migrations compiladas em dist/migrations
  // Em desenvolvimento, usar migrations em src/migrations
  migrations:
    process.env.NODE_ENV === 'production'
      ? ['dist/migrations/*.js']
      : ['src/migrations/*.ts'],
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});
