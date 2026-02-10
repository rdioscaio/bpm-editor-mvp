import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiAuditService } from './ai-audit.service';

@Module({
  controllers: [AiController],
  providers: [AiService, AiAuditService],
  exports: [AiService],
})
export class AiModule {}
