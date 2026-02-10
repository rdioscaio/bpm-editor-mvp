export type DraftNodeType = 'start' | 'task' | 'gateway_exclusive' | 'end';

export interface DraftBpmnNode {
  id: string;
  type: DraftNodeType;
  label: string;
}

export interface DraftBpmnFlow {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface DraftBpmnSchema {
  processName: string;
  nodes: DraftBpmnNode[];
  flows: DraftBpmnFlow[];
}

export interface DraftBpmnResult {
  policyVersion: string;
  provider: 'gemini';
  model: string;
  createdAt: string;
  draft: DraftBpmnSchema;
  bpmnXml: string;
}

export interface DraftBpmnAuditRecord {
  id: string;
  timestamp: string;
  route: '/api/ai/draft-bpmn';
  visibility: 'admin-only';
  policyVersion: string;
  status: 'success' | 'rejected' | 'error';
  reason?: string;
  actor: {
    ip?: string;
    userAgent?: string;
  };
  request: unknown;
  response: unknown;
}

export interface RequestMetadata {
  ip?: string;
  userAgent?: string;
}
