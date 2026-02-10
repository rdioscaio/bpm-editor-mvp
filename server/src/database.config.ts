import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Process } from './modules/process/entities/process.entity';
import { ProcessVersion } from './modules/process/entities/process-version.entity';

export const getDatabaseConfig = (): TypeOrmModuleOptions => {
  const isProduction = process.env.NODE_ENV === 'production';
  // Produção deve usar migrations; synchronize só liga explicitamente.
  const synchronizeEnv = process.env.TYPEORM_SYNCHRONIZE;
  const synchronize =
    synchronizeEnv !== undefined
      ? synchronizeEnv === 'true'
      : !isProduction;

  return {
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'bpm_editor',
    entities: [Process, ProcessVersion],
    synchronize: synchronize,
    logging: !isProduction,
    ssl: isProduction ? { rejectUnauthorized: false } : false,
    extra: {
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    },
  };
};
