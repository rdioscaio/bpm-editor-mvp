import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  Query,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { DraftBpmnRequestDto } from './dto/draft-bpmn.dto';
import { AiService } from './ai.service';

const REQUEST_VALIDATION_PIPE = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

@Controller('api/ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('draft-bpmn')
  @UsePipes(REQUEST_VALIDATION_PIPE)
  async draftBpmn(
    @Body() dto: DraftBpmnRequestDto,
    @Req()
    request: {
      ip?: string;
      headers: Record<string, string | string[] | undefined>;
    },
  ) {
    const forwardedFor = request.headers['x-forwarded-for'];
    const firstForwardedIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : typeof forwardedFor === 'string'
        ? forwardedFor.split(',')[0]
        : undefined;

    const ip = (firstForwardedIp || request.ip || '').trim() || undefined;
    const userAgentHeader = request.headers['user-agent'];
    const userAgent = Array.isArray(userAgentHeader)
      ? userAgentHeader[0]?.trim() || undefined
      : userAgentHeader?.trim() || undefined;

    return this.aiService.draftBpmn(dto, {
      ip,
      userAgent,
    });
  }

  @Get('draft-bpmn/logs')
  async getDraftLogs(
    @Headers('x-admin-token') adminToken: string | undefined,
    @Query('limit') limitRaw?: string,
  ) {
    const expectedAdminToken = (process.env.AI_ADMIN_TOKEN || '').trim();

    if (!expectedAdminToken || adminToken !== expectedAdminToken) {
      throw new ForbiddenException('Acesso admin-only');
    }

    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 50;

    if (!Number.isFinite(limit) || limit < 1) {
      throw new BadRequestException('Parâmetro limit inválido');
    }

    const logs = await this.aiService.getAuditLogs(limit);

    return {
      visibility: 'admin-only',
      policyVersion: process.env.AI_DRAFT_POLICY_VERSION || 'draft-bpmn-policy-v1',
      count: logs.length,
      logs,
    };
  }
}
