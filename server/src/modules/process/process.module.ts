import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Process } from './entities/process.entity';
import { ProcessVersion } from './entities/process-version.entity';
import { ProcessService } from './process.service';
import { ProcessController } from './process.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Process, ProcessVersion])],
  providers: [ProcessService],
  controllers: [ProcessController],
})
export class ProcessModule {}
