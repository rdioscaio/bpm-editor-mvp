import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcessModule } from './modules/process/process.module';
import { getDatabaseConfig } from './database.config';
import { HealthController } from './health.controller';

@Module({
  imports: [
    TypeOrmModule.forRoot(getDatabaseConfig()),
    ProcessModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
