import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DraftBpmnRequestDto } from './dto/draft-bpmn.dto';
import {
  DraftBpmnFlow,
  DraftBpmnNode,
  DraftBpmnResult,
  DraftBpmnSchema,
  RequestMetadata,
} from './ai.types';
import { AiAuditService } from './ai-audit.service';

interface GeminiPart {
  text?: string;
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiPart[];
  };
}

interface GeminiGenerateResponse {
  candidates?: GeminiCandidate[];
}

interface EffectiveLimits {
  maxNodes: number;
  maxFlows: number;
  maxResponseBytes: number;
}

interface LayoutInfo {
  bpmnId: string;
  tagName: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_POLICY_VERSION = 'draft-bpmn-policy-v1';
const DEFAULT_MAX_NODES = 24;
const DEFAULT_MAX_FLOWS = 40;
const DEFAULT_MAX_RESPONSE_BYTES = 30000;

@Injectable()
export class AiService {
  private readonly model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

  constructor(private readonly auditService: AiAuditService) {}

  async draftBpmn(dto: DraftBpmnRequestDto, metadata: RequestMetadata): Promise<DraftBpmnResult> {
    const policyVersion = (dto.policyVersion || process.env.AI_DRAFT_POLICY_VERSION || DEFAULT_POLICY_VERSION).trim();
    const limits = this.getLimits(dto);

    if (dto.intent !== 'draft_bpmn') {
      await this.auditService.log({
        route: '/api/ai/draft-bpmn',
        visibility: 'admin-only',
        policyVersion,
        status: 'rejected',
        reason: 'intent_not_allowed',
        actor: metadata,
        request: dto,
        response: {
          error: 'Somente intent=draft_bpmn é permitida neste endpoint',
        },
      });

      throw new BadRequestException('Somente intent=draft_bpmn é permitida neste endpoint');
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException('GEMINI_API_KEY/GOOGLE_API_KEY não configurada no servidor');
    }

    try {
      const prompt = this.buildPrompt(dto, limits);
      const rawOutput = await this.callGemini(prompt, apiKey, limits.maxResponseBytes);
      const parsedOutput = this.parseJsonOutput(rawOutput);
      const draft = this.validateDraftOutput(parsedOutput, limits);
      const bpmnXml = this.buildBpmnXml(draft);

      const result: DraftBpmnResult = {
        policyVersion,
        provider: 'gemini',
        model: this.model,
        createdAt: new Date().toISOString(),
        draft,
        bpmnXml,
      };

      await this.auditService.log({
        route: '/api/ai/draft-bpmn',
        visibility: 'admin-only',
        policyVersion,
        status: 'success',
        actor: metadata,
        request: dto,
        response: {
          provider: result.provider,
          model: result.model,
          createdAt: result.createdAt,
          nodeCount: draft.nodes.length,
          flowCount: draft.flows.length,
          bpmnXmlBytes: Buffer.byteLength(result.bpmnXml, 'utf8'),
          draft,
        },
      });

      return result;
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : 'erro desconhecido';

      await this.auditService.log({
        route: '/api/ai/draft-bpmn',
        visibility: 'admin-only',
        policyVersion,
        status: 'error',
        reason,
        actor: metadata,
        request: dto,
        response: {
          error: reason,
        },
      });

      throw error;
    }
  }

  async getAuditLogs(limit: number): Promise<unknown[]> {
    return this.auditService.readRecent(limit);
  }

  private getLimits(dto: DraftBpmnRequestDto): EffectiveLimits {
    const envMaxNodes = Number.parseInt(process.env.AI_DRAFT_MAX_NODES || '', 10);
    const envMaxFlows = Number.parseInt(process.env.AI_DRAFT_MAX_FLOWS || '', 10);
    const envMaxBytes = Number.parseInt(process.env.AI_DRAFT_MAX_RESPONSE_BYTES || '', 10);

    return {
      maxNodes: dto.limits?.maxNodes ?? (Number.isFinite(envMaxNodes) ? envMaxNodes : DEFAULT_MAX_NODES),
      maxFlows: dto.limits?.maxFlows ?? (Number.isFinite(envMaxFlows) ? envMaxFlows : DEFAULT_MAX_FLOWS),
      maxResponseBytes:
        dto.limits?.maxResponseBytes ??
        (Number.isFinite(envMaxBytes) ? envMaxBytes : DEFAULT_MAX_RESPONSE_BYTES),
    };
  }

  private buildPrompt(dto: DraftBpmnRequestDto, limits: EffectiveLimits): string {
    const normalizedContext = {
      processName: dto.context.processName.trim(),
      objective: dto.context.objective.trim(),
      trigger: dto.context.trigger.trim(),
      actors: this.normalizeList(dto.context.actors),
      systems: this.normalizeList(dto.context.systems),
      keySteps: this.normalizeList(dto.context.keySteps),
      businessRules: this.normalizeList(dto.context.businessRules),
      exceptions: this.normalizeList(dto.context.exceptions),
      observations: (dto.context.observations || '').trim(),
    };

    const schemaDescription = {
      processName: 'string (3..120)',
      nodes: [
        {
          id: 'string único (somente letras, números, _ e -)',
          type: 'start | task | gateway_exclusive | end',
          label: 'string (1..120)',
        },
      ],
      flows: [
        {
          id: 'string único (somente letras, números, _ e -)',
          source: 'id do nó origem',
          target: 'id do nó destino',
          label: 'string opcional (0..80)',
        },
      ],
    };

    return [
      'Você gera rascunho BPMN em JSON para importação técnica.',
      'Responda SOMENTE JSON puro, sem markdown e sem texto adicional.',
      'Nunca inclua chaves fora do schema definido.',
      `Use no máximo ${limits.maxNodes} nós e ${limits.maxFlows} fluxos.`,
      'Regras obrigatórias:',
      '- Exatamente 1 nó start e pelo menos 1 nó end.',
      '- Todos os fluxos devem referenciar nós existentes.',
      '- Processo coerente com as etapas fornecidas.',
      '- Labels em PT-BR claros e curtos.',
      '',
      `Schema esperado: ${JSON.stringify(schemaDescription)}`,
      '',
      `Dados de entrada (estruturados, sem prompt livre): ${JSON.stringify(normalizedContext)}`,
    ].join('\n');
  }

  private normalizeList(values?: string[]): string[] {
    if (!Array.isArray(values)) {
      return [];
    }

    return values
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, 30);
  }

  private async callGemini(prompt: string, apiKey: string, maxResponseBytes: number): Promise<string> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      this.model,
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new BadGatewayException(`Falha ao chamar Gemini: ${response.status} ${errorBody.slice(0, 300)}`);
    }

    const body = (await response.json()) as GeminiGenerateResponse;
    const text = this.extractGeminiText(body);

    if (!text) {
      throw new BadGatewayException('Gemini não retornou conteúdo textual válido');
    }

    if (Buffer.byteLength(text, 'utf8') > maxResponseBytes) {
      throw new BadRequestException('Resposta da IA excede o limite de bytes permitido');
    }

    return text;
  }

  private extractGeminiText(body: GeminiGenerateResponse): string | null {
    const candidates = Array.isArray(body.candidates) ? body.candidates : [];
    for (const candidate of candidates) {
      const parts = candidate.content?.parts;
      if (!Array.isArray(parts)) {
        continue;
      }

      for (const part of parts) {
        if (typeof part.text === 'string' && part.text.trim().length > 0) {
          return part.text.trim();
        }
      }
    }

    return null;
  }

  private parseJsonOutput(rawOutput: string): unknown {
    const cleanedOutput = rawOutput
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      return JSON.parse(cleanedOutput);
    } catch {
      throw new BadRequestException('Gemini retornou JSON inválido para draft BPMN');
    }
  }

  private validateDraftOutput(payload: unknown, limits: EffectiveLimits): DraftBpmnSchema {
    const root = this.requireObject(payload, 'payload');
    const processName = this.normalizeText(this.requireString(root.processName, 'processName'), 120);

    const rawNodes = this.requireArray(root.nodes, 'nodes');
    const rawFlows = this.requireArray(root.flows, 'flows');

    if (rawNodes.length < 3) {
      throw new BadRequestException('Schema inválido: nodes precisa ter ao menos 3 itens');
    }

    if (rawNodes.length > limits.maxNodes) {
      throw new BadRequestException(`Schema inválido: nodes excede limite (${limits.maxNodes})`);
    }

    if (rawFlows.length < 2) {
      throw new BadRequestException('Schema inválido: flows precisa ter ao menos 2 itens');
    }

    if (rawFlows.length > limits.maxFlows) {
      throw new BadRequestException(`Schema inválido: flows excede limite (${limits.maxFlows})`);
    }

    const nodes: DraftBpmnNode[] = [];
    const usedNodeIds = new Set<string>();

    rawNodes.forEach((item, index) => {
      const nodeObject = this.requireObject(item, `nodes[${index}]`);
      const nodeType = this.requireString(nodeObject.type, `nodes[${index}].type`);

      if (!['start', 'task', 'gateway_exclusive', 'end'].includes(nodeType)) {
        throw new BadRequestException(`Schema inválido: tipo de nó não suportado (${nodeType})`);
      }

      const rawId = this.requireString(nodeObject.id, `nodes[${index}].id`);
      const normalizedId = this.makeSafeId(rawId, `node_${index + 1}`);
      const id = this.ensureUniqueId(normalizedId, usedNodeIds);

      const label = this.normalizeText(
        this.requireString(nodeObject.label, `nodes[${index}].label`),
        120,
      );

      nodes.push({
        id,
        type: nodeType as DraftBpmnNode['type'],
        label,
      });
    });

    const nodeIdSet = new Set(nodes.map((node) => node.id));
    const flows: DraftBpmnFlow[] = [];
    const usedFlowIds = new Set<string>();

    rawFlows.forEach((item, index) => {
      const flowObject = this.requireObject(item, `flows[${index}]`);
      const rawId = this.requireString(flowObject.id, `flows[${index}].id`);
      const normalizedId = this.makeSafeId(rawId, `flow_${index + 1}`);
      const id = this.ensureUniqueId(normalizedId, usedFlowIds);

      const source = this.makeSafeId(
        this.requireString(flowObject.source, `flows[${index}].source`),
        '',
      );
      const target = this.makeSafeId(
        this.requireString(flowObject.target, `flows[${index}].target`),
        '',
      );

      if (!nodeIdSet.has(source)) {
        throw new BadRequestException(`Schema inválido: flow ${id} source inexistente (${source})`);
      }

      if (!nodeIdSet.has(target)) {
        throw new BadRequestException(`Schema inválido: flow ${id} target inexistente (${target})`);
      }

      if (source === target) {
        throw new BadRequestException(`Schema inválido: flow ${id} não pode ligar nó nele mesmo`);
      }

      const labelValue = flowObject.label;
      const label =
        typeof labelValue === 'string' && labelValue.trim().length > 0
          ? this.normalizeText(labelValue, 80)
          : undefined;

      flows.push({
        id,
        source,
        target,
        label,
      });
    });

    const startNodes = nodes.filter((node) => node.type === 'start');
    if (startNodes.length !== 1) {
      throw new BadRequestException('Schema inválido: deve haver exatamente 1 nó start');
    }

    const endNodes = nodes.filter((node) => node.type === 'end');
    if (endNodes.length < 1) {
      throw new BadRequestException('Schema inválido: deve haver ao menos 1 nó end');
    }

    const outgoingCount = new Map<string, number>();
    const incomingCount = new Map<string, number>();

    for (const flow of flows) {
      outgoingCount.set(flow.source, (outgoingCount.get(flow.source) || 0) + 1);
      incomingCount.set(flow.target, (incomingCount.get(flow.target) || 0) + 1);
    }

    if ((outgoingCount.get(startNodes[0].id) || 0) === 0) {
      throw new BadRequestException('Schema inválido: nó start deve ter ao menos um fluxo de saída');
    }

    const hasEndWithIncoming = endNodes.some((node) => (incomingCount.get(node.id) || 0) > 0);
    if (!hasEndWithIncoming) {
      throw new BadRequestException('Schema inválido: nó end deve receber ao menos um fluxo');
    }

    return {
      processName,
      nodes,
      flows,
    };
  }

  private requireObject(value: unknown, path: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException(`Schema inválido: ${path} deve ser objeto`);
    }

    return value as Record<string, unknown>;
  }

  private requireArray(value: unknown, path: string): unknown[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`Schema inválido: ${path} deve ser array`);
    }

    return value;
  }

  private requireString(value: unknown, path: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(`Schema inválido: ${path} deve ser string`);
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException(`Schema inválido: ${path} não pode ser vazio`);
    }

    return trimmed;
  }

  private normalizeText(value: string, maxLength: number): string {
    return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
  }

  private makeSafeId(value: string, fallback: string): string {
    const normalized = value
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40);

    return normalized || fallback;
  }

  private ensureUniqueId(candidate: string, usedIds: Set<string>): string {
    let next = candidate;
    let suffix = 1;

    while (usedIds.has(next)) {
      next = `${candidate}_${suffix}`;
      suffix += 1;
    }

    usedIds.add(next);
    return next;
  }

  private buildBpmnXml(schema: DraftBpmnSchema): string {
    const processId = 'Process_1';
    const definitionsId = 'Definitions_1';
    const diagramId = 'BPMNDiagram_1';
    const planeId = 'BPMNPlane_1';

    const nodeLayouts = new Map<string, LayoutInfo>();

    schema.nodes.forEach((node, index) => {
      const x = 140 + index * 180;

      let width = 120;
      let height = 80;
      let tagName = 'bpmn:Task';
      let bpmnPrefix = 'Task';

      if (node.type === 'start') {
        width = 36;
        height = 36;
        tagName = 'bpmn:StartEvent';
        bpmnPrefix = 'StartEvent';
      } else if (node.type === 'end') {
        width = 36;
        height = 36;
        tagName = 'bpmn:EndEvent';
        bpmnPrefix = 'EndEvent';
      } else if (node.type === 'gateway_exclusive') {
        width = 50;
        height = 50;
        tagName = 'bpmn:ExclusiveGateway';
        bpmnPrefix = 'Gateway';
      }

      const y = 240 - height / 2;

      nodeLayouts.set(node.id, {
        bpmnId: `${bpmnPrefix}_${index + 1}`,
        tagName,
        x,
        y,
        width,
        height,
      });
    });

    const flowMap = schema.flows.map((flow, index) => ({
      flow,
      bpmnId: `Flow_${index + 1}`,
    }));

    const outgoingByNode = new Map<string, string[]>();
    const incomingByNode = new Map<string, string[]>();

    for (const item of flowMap) {
      const source = outgoingByNode.get(item.flow.source) || [];
      source.push(item.bpmnId);
      outgoingByNode.set(item.flow.source, source);

      const target = incomingByNode.get(item.flow.target) || [];
      target.push(item.bpmnId);
      incomingByNode.set(item.flow.target, target);
    }

    const nodeElements = schema.nodes
      .map((node) => {
        const layout = nodeLayouts.get(node.id);
        if (!layout) {
          throw new BadRequestException(`Nó ${node.id} não encontrado no layout BPMN`);
        }

        const incomingXml = (incomingByNode.get(node.id) || [])
          .map((flowId) => `      <bpmn:incoming>${flowId}</bpmn:incoming>`)
          .join('\n');

        const outgoingXml = (outgoingByNode.get(node.id) || [])
          .map((flowId) => `      <bpmn:outgoing>${flowId}</bpmn:outgoing>`)
          .join('\n');

        const sections = [incomingXml, outgoingXml].filter((part) => part.length > 0).join('\n');

        return [
          `    <${layout.tagName} id="${layout.bpmnId}" name="${this.escapeXml(node.label)}">`,
          sections,
          `    </${layout.tagName}>`,
        ]
          .filter((line) => line.length > 0)
          .join('\n');
      })
      .join('\n');

    const flowElements = flowMap
      .map(({ flow, bpmnId }) => {
        const sourceLayout = nodeLayouts.get(flow.source);
        const targetLayout = nodeLayouts.get(flow.target);

        if (!sourceLayout || !targetLayout) {
          throw new BadRequestException(`Fluxo ${flow.id} referencia nós inexistentes`);
        }

        const nameAttribute = flow.label ? ` name="${this.escapeXml(flow.label)}"` : '';

        return `    <bpmn:sequenceFlow id="${bpmnId}" sourceRef="${sourceLayout.bpmnId}" targetRef="${targetLayout.bpmnId}"${nameAttribute} />`;
      })
      .join('\n');

    const shapeElements = schema.nodes
      .map((node) => {
        const layout = nodeLayouts.get(node.id);
        if (!layout) {
          throw new BadRequestException(`Nó ${node.id} sem shape BPMNDI`);
        }

        return [
          `    <bpmndi:BPMNShape id="${layout.bpmnId}_di" bpmnElement="${layout.bpmnId}">`,
          `      <dc:Bounds x="${layout.x}" y="${layout.y}" width="${layout.width}" height="${layout.height}" />`,
          '    </bpmndi:BPMNShape>',
        ].join('\n');
      })
      .join('\n');

    const edgeElements = flowMap
      .map(({ flow, bpmnId }) => {
        const sourceLayout = nodeLayouts.get(flow.source);
        const targetLayout = nodeLayouts.get(flow.target);

        if (!sourceLayout || !targetLayout) {
          throw new BadRequestException(`Fluxo ${flow.id} sem edge BPMNDI`);
        }

        const waypoints = this.getWaypoints(sourceLayout, targetLayout)
          .map((point) => `      <di:waypoint x="${point.x}" y="${point.y}" />`)
          .join('\n');

        return [
          `    <bpmndi:BPMNEdge id="${bpmnId}_di" bpmnElement="${bpmnId}">`,
          waypoints,
          '    </bpmndi:BPMNEdge>',
        ].join('\n');
      })
      .join('\n');

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="${definitionsId}" targetNamespace="http://bpmn.io/schema/bpmn" exporter="tottal-bpm-ai" exporterVersion="1.0.0">`,
      `  <bpmn:process id="${processId}" name="${this.escapeXml(schema.processName)}" isExecutable="false">`,
      nodeElements,
      flowElements,
      '  </bpmn:process>',
      `  <bpmndi:BPMNDiagram id="${diagramId}">`,
      `    <bpmndi:BPMNPlane id="${planeId}" bpmnElement="${processId}">`,
      shapeElements,
      edgeElements,
      '    </bpmndi:BPMNPlane>',
      '  </bpmndi:BPMNDiagram>',
      '</bpmn:definitions>',
    ].join('\n');

    return xml;
  }

  private getWaypoints(source: LayoutInfo, target: LayoutInfo): Array<{ x: number; y: number }> {
    const sourceCenterY = source.y + source.height / 2;
    const targetCenterY = target.y + target.height / 2;

    if (source.x + source.width <= target.x) {
      return [
        { x: source.x + source.width, y: sourceCenterY },
        { x: target.x, y: targetCenterY },
      ];
    }

    if (target.x + target.width <= source.x) {
      return [
        { x: source.x, y: sourceCenterY },
        { x: target.x + target.width, y: targetCenterY },
      ];
    }

    const middleX = Math.round((source.x + source.width + target.x) / 2);

    return [
      { x: source.x + source.width, y: sourceCenterY },
      { x: middleX, y: sourceCenterY },
      { x: middleX, y: targetCenterY },
      { x: target.x, y: targetCenterY },
    ];
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
