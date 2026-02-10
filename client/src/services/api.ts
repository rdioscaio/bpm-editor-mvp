import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

export interface Process {
  id: string;
  name: string;
  description?: string;
  responsible?: string;
  tags?: string[];
  currentVersionId?: string;
  createdAt: string;
  updatedAt: string;
  versions?: ProcessVersion[];
}

export interface ProcessVersion {
  id: string;
  processId: string;
  versionNumber: number;
  bpmnContent: Record<string, any>;
  svgContent?: string;
  description?: string;
  createdAt: string;
}

export interface AiDraftContext {
  processName: string;
  objective: string;
  trigger: string;
  actors: string[];
  systems?: string[];
  keySteps: string[];
  businessRules?: string[];
  exceptions?: string[];
  observations?: string;
}

export interface AiDraftRequest {
  intent: 'draft_bpmn';
  policyVersion?: string;
  language?: 'pt-BR';
  context: AiDraftContext;
  limits?: {
    maxNodes?: number;
    maxFlows?: number;
    maxResponseBytes?: number;
  };
}

export interface AiDraftNode {
  id: string;
  type: 'start' | 'task' | 'gateway_exclusive' | 'end';
  label: string;
}

export interface AiDraftFlow {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface AiDraftResponse {
  policyVersion: string;
  provider: 'gemini';
  model: string;
  createdAt: string;
  draft: {
    processName: string;
    nodes: AiDraftNode[];
    flows: AiDraftFlow[];
  };
  bpmnXml: string;
}

export const processApi = {
  getAllProcesses: () => api.get<Process[]>('/processes'),
  getProcess: (id: string) => api.get<Process>(`/processes/${id}`),
  createProcess: (data: { name: string; description?: string; responsible?: string; tags?: string[] }) =>
    api.post<Process>('/processes', data),
  updateProcess: (id: string, data: Partial<Process>) =>
    api.put<Process>(`/processes/${id}`, data),
  deleteProcess: (id: string) => api.delete(`/processes/${id}`),

  validateBpmn: (id: string, bpmnContent: Record<string, any>) =>
    api.post<{ valid: boolean; errors: string[] }>(`/processes/${id}/validate`, { bpmnContent }),

  saveVersion: (id: string, data: { bpmnContent: Record<string, any>; svgContent?: string; description?: string }) =>
    api.post<ProcessVersion>(`/processes/${id}/versions`, data),
  getVersions: (id: string) => api.get<ProcessVersion[]>(`/processes/${id}/versions`),
  getVersion: (id: string, versionId: string) =>
    api.get<ProcessVersion>(`/processes/${id}/versions/${versionId}`),
};

export const aiApi = {
  draftBpmn: (data: AiDraftRequest) => api.post<AiDraftResponse>('/ai/draft-bpmn', data),
};

export default api;
