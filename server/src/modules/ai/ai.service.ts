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

type RenderNodeType =
  | 'start'
  | 'end'
  | 'gateway_exclusive'
  | 'task'
  | 'user_task'
  | 'service_task'
  | 'business_rule_task'
  | 'subprocess';

interface RenderNode {
  id: string;
  type: RenderNodeType;
  label: string;
  lane?: string;
  loopMarker?: boolean;
  children?: {
    nodes: Array<{ id: string; type: RenderNodeType; label: string }>;
    flows: DraftBpmnFlow[];
  };
}

interface RenderGraph {
  processName: string;
  nodes: RenderNode[];
  flows: DraftBpmnFlow[];
}

interface LaneSpec {
  id: string;
  name: string;
}

const LANE_SPECS: LaneSpec[] = [
  { id: 'Lane_Operacao', name: 'Operação (Humano)' },
  { id: 'Lane_Automacao_IA', name: 'Automação/IA' },
  { id: 'Lane_Gestao', name: 'Gestão' },
  { id: 'Lane_Diretoria', name: 'Diretoria' },
];

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
    const graph = this.buildRenderGraph(schema);
    const processId = 'Process_1';
    const definitionsId = 'Definitions_1';
    const diagramId = 'BPMNDiagram_1';
    const planeId = 'BPMNPlane_1';
    const collaborationId = 'Collaboration_1';
    const participantId = 'Participant_1';

    const nodeLayouts = new Map<string, LayoutInfo>();
    const laneByName = new Map(LANE_SPECS.map((lane) => [lane.name, lane]));
    const laneHeight = 170;
    const participantX = 80;
    const participantY = 80;
    const laneHeaderWidth = 48;
    const baseX = participantX + laneHeaderWidth + 70;
    const orderedNodeIds = this.getMainFlowOrder(graph.nodes, graph.flows);
    const rowCount = orderedNodeIds.length > 10 ? 3 : orderedNodeIds.length > 5 ? 2 : 1;
    const columnsPerRow = Math.ceil(orderedNodeIds.length / rowCount);
    const horizontalGap = 210;

    orderedNodeIds.forEach((nodeId, index) => {
      const node = graph.nodes.find((item) => item.id === nodeId);
      if (!node) {
        throw new BadRequestException(`Nó ${nodeId} não encontrado`);
      }

      const visual = this.getNodeVisualDefinition(node.type);

      const row = Math.floor(index / columnsPerRow);
      const rowStart = row * columnsPerRow;
      const rowEnd = Math.min(rowStart + columnsPerRow, orderedNodeIds.length);
      const rowSize = rowEnd - rowStart;
      const colInRow = index - rowStart;
      const serpentineCol = row % 2 === 0 ? colInRow : rowSize - 1 - colInRow;

      const x = baseX + serpentineCol * horizontalGap;
      const laneName = node.lane || LANE_SPECS[0].name;
      const laneSpec = laneByName.get(laneName) || LANE_SPECS[0];
      const laneIndex = LANE_SPECS.findIndex((lane) => lane.id === laneSpec.id);
      const laneTop = participantY + laneIndex * laneHeight;
      const centerY = laneTop + laneHeight / 2;
      const y = centerY - visual.height / 2;

      nodeLayouts.set(nodeId, {
        bpmnId: `${visual.bpmnPrefix}_${index + 1}`,
        tagName: visual.tagName,
        x,
        y,
        width: visual.width,
        height: visual.height,
      });
    });

    const flowMap = graph.flows.map((flow, index) => ({
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

    const nodeElements = graph.nodes
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

        if (node.type === 'subprocess') {
          const childXml = this.buildSubprocessChildrenXml(node);
          const loopXml = node.loopMarker ? '      <bpmn:standardLoopCharacteristics />' : '';

          return [
            `    <${layout.tagName} id="${layout.bpmnId}" name="${this.escapeXml(node.label)}">`,
            sections,
            loopXml,
            childXml,
            `    </${layout.tagName}>`,
          ]
            .filter((line) => line.length > 0)
            .join('\n');
        }

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

    const laneSetXml = this.buildLaneSetXml(graph.nodes, nodeLayouts);
    const participantName = `${graph.processName} - BPO + IA`;

    const shapeElements = graph.nodes
      .map((node) => {
        const layout = nodeLayouts.get(node.id);
        if (!layout) {
          throw new BadRequestException(`Nó ${node.id} sem shape BPMNDI`);
        }

        const expandedAttribute = node.type === 'subprocess' ? ' isExpanded="false"' : '';

        return [
          `    <bpmndi:BPMNShape id="${layout.bpmnId}_di" bpmnElement="${layout.bpmnId}"${expandedAttribute}>`,
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

    const maxNodeRight = Math.max(...Array.from(nodeLayouts.values()).map((layout) => layout.x + layout.width), 900);
    const minPoolWidth = 980;
    const participantWidth = Math.max(minPoolWidth, maxNodeRight - participantX + 120);
    const participantHeight = LANE_SPECS.length * laneHeight;
    const laneShapes = LANE_SPECS
      .map((lane, laneIndex) => {
        const laneY = participantY + laneIndex * laneHeight;
        return [
          `    <bpmndi:BPMNShape id="${lane.id}_di" bpmnElement="${lane.id}" isHorizontal="true">`,
          `      <dc:Bounds x="${participantX}" y="${laneY}" width="${participantWidth}" height="${laneHeight}" />`,
          '    </bpmndi:BPMNShape>',
        ].join('\n');
      })
      .join('\n');

    const participantShape = [
      `    <bpmndi:BPMNShape id="${participantId}_di" bpmnElement="${participantId}" isHorizontal="true">`,
      `      <dc:Bounds x="${participantX}" y="${participantY}" width="${participantWidth}" height="${participantHeight}" />`,
      '    </bpmndi:BPMNShape>',
    ].join('\n');

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="${definitionsId}" targetNamespace="http://bpmn.io/schema/bpmn" exporter="tottal-bpm-ai" exporterVersion="1.0.0">`,
      `  <bpmn:process id="${processId}" name="${this.escapeXml(graph.processName)}" isExecutable="false">`,
      laneSetXml,
      nodeElements,
      flowElements,
      '  </bpmn:process>',
      `  <bpmn:collaboration id="${collaborationId}">`,
      `    <bpmn:participant id="${participantId}" name="${this.escapeXml(participantName)}" processRef="${processId}" />`,
      '  </bpmn:collaboration>',
      `  <bpmndi:BPMNDiagram id="${diagramId}">`,
      `    <bpmndi:BPMNPlane id="${planeId}" bpmnElement="${collaborationId}">`,
      participantShape,
      laneShapes,
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
    const toRight = target.x >= source.x;
    const sourceAnchorX = toRight ? source.x + source.width : source.x;
    const targetAnchorX = toRight ? target.x : target.x + target.width;

    if (Math.abs(sourceCenterY - targetCenterY) <= 4) {
      return [
        { x: sourceAnchorX, y: sourceCenterY },
        { x: targetAnchorX, y: targetCenterY },
      ];
    }

    if (Math.abs(sourceAnchorX - targetAnchorX) <= 4) {
      return [
        { x: sourceAnchorX, y: sourceCenterY },
        { x: sourceAnchorX, y: targetCenterY },
        { x: targetAnchorX, y: targetCenterY },
      ];
    }

    const middleX = Math.round((sourceAnchorX + targetAnchorX) / 2);

    return [
      { x: sourceAnchorX, y: sourceCenterY },
      { x: middleX, y: sourceCenterY },
      { x: middleX, y: targetCenterY },
      { x: targetAnchorX, y: targetCenterY },
    ];
  }

  private buildSubprocessChildrenXml(node: RenderNode): string {
    if (!node.children) {
      return '';
    }

    const childIdMap = new Map<string, string>();
    node.children.nodes.forEach((child, index) => {
      const visual = this.getNodeVisualDefinition(child.type);
      childIdMap.set(child.id, `${node.id}_${visual.bpmnPrefix}_${index + 1}`);
    });

    const incomingByNode = new Map<string, string[]>();
    const outgoingByNode = new Map<string, string[]>();

    node.children.flows.forEach((flow, index) => {
      const flowId = `${node.id}_Flow_${index + 1}`;
      const outgoing = outgoingByNode.get(flow.source) || [];
      outgoing.push(flowId);
      outgoingByNode.set(flow.source, outgoing);

      const incoming = incomingByNode.get(flow.target) || [];
      incoming.push(flowId);
      incomingByNode.set(flow.target, incoming);
    });

    const nodeXml = node.children.nodes
      .map((child) => {
        const bpmnId = childIdMap.get(child.id);
        if (!bpmnId) {
          throw new BadRequestException(`Nó interno ${child.id} sem mapeamento BPMN`);
        }

        const visual = this.getNodeVisualDefinition(child.type);
        const tagName = visual.tagName;

        const incomingXml = (incomingByNode.get(child.id) || [])
          .map((flowId) => `      <bpmn:incoming>${flowId}</bpmn:incoming>`)
          .join('\n');
        const outgoingXml = (outgoingByNode.get(child.id) || [])
          .map((flowId) => `      <bpmn:outgoing>${flowId}</bpmn:outgoing>`)
          .join('\n');

        return [
          `      <${tagName} id="${bpmnId}" name="${this.escapeXml(child.label)}">`,
          incomingXml,
          outgoingXml,
          `      </${tagName}>`,
        ]
          .filter((line) => line.length > 0)
          .join('\n');
      })
      .join('\n');

    const flowXml = node.children.flows
      .map((flow, index) => {
        const flowId = `${node.id}_Flow_${index + 1}`;
        const sourceRef = childIdMap.get(flow.source);
        const targetRef = childIdMap.get(flow.target);

        if (!sourceRef || !targetRef) {
          throw new BadRequestException(`Fluxo interno ${flow.id} com source/target inválido`);
        }

        const labelAttr = flow.label ? ` name="${this.escapeXml(flow.label)}"` : '';
        return `      <bpmn:sequenceFlow id="${flowId}" sourceRef="${sourceRef}" targetRef="${targetRef}"${labelAttr} />`;
      })
      .join('\n');

    return [nodeXml, flowXml].filter((line) => line.length > 0).join('\n');
  }

  private buildLaneSetXml(nodes: RenderNode[], layouts: Map<string, LayoutInfo>): string {
    const laneXml = LANE_SPECS.map((lane) => {
      const flowNodeRefs = nodes
        .filter((node) => (node.lane || LANE_SPECS[0].name) === lane.name)
        .map((node) => layouts.get(node.id)?.bpmnId)
        .filter((value): value is string => Boolean(value))
        .map((flowNodeRef) => `        <bpmn:flowNodeRef>${flowNodeRef}</bpmn:flowNodeRef>`)
        .join('\n');

      return [
        `      <bpmn:lane id="${lane.id}" name="${this.escapeXml(lane.name)}">`,
        flowNodeRefs,
        '      </bpmn:lane>',
      ]
        .filter((line) => line.length > 0)
        .join('\n');
    }).join('\n');

    return [
      '    <bpmn:laneSet id="LaneSet_1">',
      laneXml,
      '    </bpmn:laneSet>',
    ].join('\n');
  }

  private getNodeVisualDefinition(type: RenderNodeType): {
    width: number;
    height: number;
    tagName: string;
    bpmnPrefix: string;
  } {
    if (type === 'start') {
      return { width: 36, height: 36, tagName: 'bpmn:StartEvent', bpmnPrefix: 'StartEvent' };
    }
    if (type === 'end') {
      return { width: 36, height: 36, tagName: 'bpmn:EndEvent', bpmnPrefix: 'EndEvent' };
    }
    if (type === 'gateway_exclusive') {
      return { width: 50, height: 50, tagName: 'bpmn:ExclusiveGateway', bpmnPrefix: 'Gateway' };
    }
    if (type === 'subprocess') {
      return { width: 190, height: 110, tagName: 'bpmn:SubProcess', bpmnPrefix: 'SubProcess' };
    }
    if (type === 'user_task') {
      return { width: 130, height: 88, tagName: 'bpmn:UserTask', bpmnPrefix: 'UserTask' };
    }
    if (type === 'service_task') {
      return { width: 130, height: 88, tagName: 'bpmn:ServiceTask', bpmnPrefix: 'ServiceTask' };
    }
    if (type === 'business_rule_task') {
      return { width: 130, height: 88, tagName: 'bpmn:BusinessRuleTask', bpmnPrefix: 'BusinessRuleTask' };
    }

    return { width: 120, height: 80, tagName: 'bpmn:Task', bpmnPrefix: 'Task' };
  }

  private buildRenderGraph(schema: DraftBpmnSchema): RenderGraph {
    const initialGraph: RenderGraph = {
      processName: schema.processName,
      nodes: schema.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        label: node.label,
      })),
      flows: [...schema.flows],
    };
    const pdcaGraph = this.applyPdcaSubprocess(initialGraph);
    return this.assignOperationalMetadata(pdcaGraph);
  }

  private applyPdcaSubprocess(graph: RenderGraph): RenderGraph {
    const labelByNodeId = new Map(graph.nodes.map((node) => [node.id, this.normalizeLabel(node.label)]));
    const findNodeId = (pattern: RegExp) =>
      graph.nodes.find((node) => pattern.test(labelByNodeId.get(node.id) || ''))?.id;

    const planejarId = findNodeId(/\bplanejar\b/);
    const executarId = findNodeId(/\bexecutar\b/);
    const checarId = findNodeId(/\bchecar\b|\bverificar\b/);
    const agirId = findNodeId(/\bagir\b|\bcorrigir\b|\bajustar\b/);

    if (!planejarId || !executarId || !checarId || !agirId) {
      return graph;
    }

    const pdcaNodeIds = new Set([planejarId, executarId, checarId, agirId]);
    const externalIncoming = graph.flows.filter(
      (flow) => pdcaNodeIds.has(flow.target) && !pdcaNodeIds.has(flow.source),
    );
    const externalOutgoing = graph.flows.filter(
      (flow) => pdcaNodeIds.has(flow.source) && !pdcaNodeIds.has(flow.target),
    );

    if (externalIncoming.length === 0 || externalOutgoing.length === 0) {
      return graph;
    }

    const remainingNodes = graph.nodes.filter((node) => !pdcaNodeIds.has(node.id));
    const remainingFlows = graph.flows.filter(
      (flow) => !pdcaNodeIds.has(flow.source) && !pdcaNodeIds.has(flow.target),
    );

    const subprocessId = this.createUniqueNodeId('ciclo_pdca_loop', remainingNodes);
    const usedFlowIds = new Set(remainingFlows.map((flow) => flow.id));

    const subprocessNode: RenderNode = {
      id: subprocessId,
      type: 'subprocess',
      label: 'Ciclo PDCA (loop)',
      loopMarker: true,
      children: {
        nodes: [
          { id: 'pdca_start', type: 'start', label: 'Início PDCA' },
          { id: 'pdca_planejar', type: 'task', label: 'Planejar' },
          { id: 'pdca_executar', type: 'task', label: 'Executar' },
          { id: 'pdca_checar', type: 'task', label: 'Checar' },
          { id: 'pdca_gateway', type: 'gateway_exclusive', label: 'Meta atingida?' },
          { id: 'pdca_agir', type: 'task', label: 'Agir' },
          { id: 'pdca_end', type: 'end', label: 'PDCA concluído' },
        ],
        flows: [
          { id: 'pdca_f1', source: 'pdca_start', target: 'pdca_planejar' },
          { id: 'pdca_f2', source: 'pdca_planejar', target: 'pdca_executar' },
          { id: 'pdca_f3', source: 'pdca_executar', target: 'pdca_checar' },
          { id: 'pdca_f4', source: 'pdca_checar', target: 'pdca_gateway' },
          { id: 'pdca_f5', source: 'pdca_gateway', target: 'pdca_end', label: 'Sim' },
          { id: 'pdca_f6', source: 'pdca_gateway', target: 'pdca_agir', label: 'Não' },
          { id: 'pdca_f7', source: 'pdca_agir', target: 'pdca_planejar', label: 'metaAtingida == false' },
        ],
      },
    };

    externalIncoming.forEach((flow) => {
      remainingFlows.push({
        id: this.createUniqueFlowId(`${flow.id}_pdca_in`, usedFlowIds),
        source: flow.source,
        target: subprocessId,
      });
    });

    const padronizarTarget = externalOutgoing.find((flow) =>
      /padronizar|comunicar/.test(labelByNodeId.get(flow.target) || ''),
    );

    if (padronizarTarget) {
      remainingFlows.push({
        id: this.createUniqueFlowId('pdca_macro_true', usedFlowIds),
        source: subprocessId,
        target: padronizarTarget.target,
        label: 'Sim',
      });
    } else {
      externalOutgoing.forEach((flow) => {
        remainingFlows.push({
          id: this.createUniqueFlowId(`${flow.id}_pdca_out`, usedFlowIds),
          source: subprocessId,
          target: flow.target,
          label: flow.label,
        });
      });
    }

    return {
      processName: graph.processName,
      nodes: [...remainingNodes, subprocessNode],
      flows: remainingFlows,
    };
  }

  private assignOperationalMetadata(graph: RenderGraph): RenderGraph {
    const typedNodes = graph.nodes.map((node) => {
      if (node.type === 'task') {
        const classification = this.classifyTask(node.label);
        return {
          ...node,
          type: classification.type,
          lane: classification.lane,
        };
      }

      if (node.type === 'subprocess') {
        const children = node.children
          ? {
              ...node.children,
              nodes: node.children.nodes.map((child) => {
                if (child.type === 'task') {
                  return {
                    ...child,
                    type: 'user_task' as RenderNodeType,
                  };
                }
                return child;
              }),
            }
          : undefined;

        return {
          ...node,
          lane: 'Gestão',
          children,
        };
      }

      return {
        ...node,
        lane: 'Operação (Humano)',
      };
    });

    const nodeById = new Map(typedNodes.map((node) => [node.id, node]));
    const outgoingByNode = new Map<string, string[]>();
    const incomingByNode = new Map<string, string[]>();

    graph.flows.forEach((flow) => {
      const outgoing = outgoingByNode.get(flow.source) || [];
      outgoing.push(flow.target);
      outgoingByNode.set(flow.source, outgoing);

      const incoming = incomingByNode.get(flow.target) || [];
      incoming.push(flow.source);
      incomingByNode.set(flow.target, incoming);
    });

    const inferLaneFromNeighbors = (nodeId: string): string => {
      const neighborIds = [
        ...(outgoingByNode.get(nodeId) || []),
        ...(incomingByNode.get(nodeId) || []),
      ];

      for (const neighborId of neighborIds) {
        const neighbor = nodeById.get(neighborId);
        if (neighbor?.lane) {
          return neighbor.lane;
        }
      }

      return 'Operação (Humano)';
    };

    const finalNodes = typedNodes.map((node) => {
      if (node.type === 'start' || node.type === 'end' || node.type === 'gateway_exclusive') {
        return {
          ...node,
          lane: inferLaneFromNeighbors(node.id),
        };
      }

      return node;
    });

    return {
      processName: graph.processName,
      nodes: finalNodes,
      flows: graph.flows,
    };
  }

  private classifyTask(label: string): { type: RenderNodeType; lane: string } {
    const normalized = this.normalizeLabel(label);

    if (/diretoria|escalar/.test(normalized)) {
      return { type: 'user_task', lane: 'Diretoria' };
    }

    if (/regra|score|criterio|critério|policy|compliance/.test(normalized)) {
      return { type: 'business_rule_task', lane: 'Automação/IA' };
    }

    if (/ia|automac|bot|sistema|api|gemini|modelo|classific|enriquec/.test(normalized)) {
      return { type: 'service_task', lane: 'Automação/IA' };
    }

    if (/gestor|gerent|gerencia|aprova|valida|analisa|padroniza|comunica|meta/.test(normalized)) {
      return { type: 'user_task', lane: 'Gestão' };
    }

    return { type: 'user_task', lane: 'Operação (Humano)' };
  }

  private createUniqueNodeId(base: string, nodes: RenderNode[]): string {
    const used = new Set(nodes.map((node) => node.id));
    let candidate = base;
    let index = 1;
    while (used.has(candidate)) {
      candidate = `${base}_${index}`;
      index += 1;
    }
    return candidate;
  }

  private createUniqueFlowId(base: string, used: Set<string>): string {
    let candidate = base;
    let index = 1;
    while (used.has(candidate)) {
      candidate = `${base}_${index}`;
      index += 1;
    }
    used.add(candidate);
    return candidate;
  }

  private normalizeLabel(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private getMainFlowOrder(nodes: Array<{ id: string; type: string }>, flows: DraftBpmnFlow[]): string[] {
    const outgoingByNode = new Map<string, DraftBpmnFlow[]>();
    flows.forEach((flow) => {
      const list = outgoingByNode.get(flow.source) || [];
      list.push(flow);
      outgoingByNode.set(flow.source, list);
    });

    const startNode = nodes.find((node) => node.type === 'start') || nodes[0];
    if (!startNode) {
      return [];
    }

    const order: string[] = [];
    const visited = new Set<string>();

    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) {
        return;
      }

      visited.add(nodeId);
      order.push(nodeId);

      const outgoing = (outgoingByNode.get(nodeId) || [])
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id));

      outgoing.forEach((flow) => visit(flow.target));
    };

    visit(startNode.id);

    nodes
      .filter((node) => !visited.has(node.id))
      .sort((a, b) => a.id.localeCompare(b.id))
      .forEach((node) => order.push(node.id));

    return order;
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
