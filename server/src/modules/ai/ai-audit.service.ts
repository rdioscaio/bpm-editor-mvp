import { Injectable, Logger } from '@nestjs/common';
import { mkdir, readFile, appendFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { randomUUID } from 'crypto';
import { DraftBpmnAuditRecord } from './ai.types';

const DEFAULT_AUDIT_FILE = 'logs/ai-draft-audit.jsonl';

@Injectable()
export class AiAuditService {
  private readonly logger = new Logger(AiAuditService.name);
  private readonly filePath = resolve(process.cwd(), process.env.AI_AUDIT_LOG_PATH || DEFAULT_AUDIT_FILE);

  async log(record: Omit<DraftBpmnAuditRecord, 'id' | 'timestamp'>): Promise<DraftBpmnAuditRecord> {
    const entry: DraftBpmnAuditRecord = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...record,
    };

    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(entry)}\n`, 'utf8');

    return entry;
  }

  async readRecent(limit: number): Promise<DraftBpmnAuditRecord[]> {
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50;

    try {
      const raw = await readFile(this.filePath, 'utf8');
      const lines = raw
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      return lines
        .slice(-safeLimit)
        .map((line) => {
          try {
            return JSON.parse(line) as DraftBpmnAuditRecord;
          } catch {
            return null;
          }
        })
        .filter((line): line is DraftBpmnAuditRecord => line !== null)
        .reverse();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'erro desconhecido';
      this.logger.warn(`Arquivo de auditoria indisponível: ${message}`);
      return [];
    }
  }
}
