import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcessModule } from './modules/process/process.module';
import { getDatabaseConfig } from './database.config';

@Module({
  imports: [
    TypeOrmModule.forRoot(getDatabaseConfig()),
    ProcessModule,
  ],
})
export class AppModule {}
