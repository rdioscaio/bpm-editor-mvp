import React, { useEffect, useState } from 'react';
import { aiApi } from '../services/api';

interface StatusMessage {
  type: 'success' | 'error';
  text: string;
}

interface AiDraftPanelProps {
  processName: string;
  onApplyXml: (xml: string, draftProcessName: string) => void;
  onStatus: (message: StatusMessage) => void;
}

const splitMultiline = (value: string): string[] =>
  value
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

export const AiDraftPanel: React.FC<AiDraftPanelProps> = ({
  processName,
  onApplyXml,
  onStatus,
}) => {
  const [draftProcessName, setDraftProcessName] = useState(processName);
  const [objective, setObjective] = useState('');
  const [trigger, setTrigger] = useState('');
  const [actorsText, setActorsText] = useState('Solicitante\nAprovador');
  const [systemsText, setSystemsText] = useState('');
  const [keyStepsText, setKeyStepsText] = useState('Receber solicitação\nValidar dados\nAprovar pedido');
  const [businessRulesText, setBusinessRulesText] = useState('');
  const [exceptionsText, setExceptionsText] = useState('');
  const [observations, setObservations] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setDraftProcessName(processName);
  }, [processName]);

  const handleGenerateDraft = async (event: React.FormEvent) => {
    event.preventDefault();

    const actors = splitMultiline(actorsText);
    const keySteps = splitMultiline(keyStepsText);

    if (!objective.trim()) {
      setLocalError('Preencha o objetivo do processo.');
      return;
    }

    if (!trigger.trim()) {
      setLocalError('Preencha o gatilho de início.');
      return;
    }

    if (actors.length < 1) {
      setLocalError('Informe pelo menos 1 ator.');
      return;
    }

    if (keySteps.length < 2) {
      setLocalError('Informe pelo menos 2 etapas principais.');
      return;
    }

    setLocalError(null);
    setSubmitting(true);

    try {
      const response = await aiApi.draftBpmn({
        intent: 'draft_bpmn',
        language: 'pt-BR',
        context: {
          processName: draftProcessName.trim() || processName,
          objective: objective.trim(),
          trigger: trigger.trim(),
          actors,
          systems: splitMultiline(systemsText),
          keySteps,
          businessRules: splitMultiline(businessRulesText),
          exceptions: splitMultiline(exceptionsText),
          observations: observations.trim(),
        },
      });

      onApplyXml(response.data.bpmnXml, response.data.draft.processName);
      onStatus({
        type: 'success',
        text: `Rascunho IA gerado: ${response.data.draft.nodes.length} nós e ${response.data.draft.flows.length} fluxos.`,
      });
    } catch (error: any) {
      const errorMessage =
        error?.response?.data?.message || 'Falha ao gerar rascunho IA. Verifique os dados e tente novamente.';
      setLocalError(typeof errorMessage === 'string' ? errorMessage : 'Falha ao gerar rascunho IA.');
      onStatus({
        type: 'error',
        text: 'Falha ao gerar rascunho BPMN com IA.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="panel mb-4">
      <h2 className="section-title">IA Draft BPMN (formulário guiado)</h2>
      <p className="page-subtitle mb-4">
        Sem prompt livre. Preencha dados estruturados para gerar um XML BPMN importável.
      </p>

      {localError && <div className="message message-error mb-4">{localError}</div>}

      <form onSubmit={handleGenerateDraft} className="form-stack">
        <div className="form-grid">
          <div>
            <label className="field-label">Nome do processo</label>
            <input
              type="text"
              value={draftProcessName}
              onChange={(event) => setDraftProcessName(event.target.value)}
              className="input-field"
              maxLength={120}
              required
            />
          </div>
          <div>
            <label className="field-label">Gatilho de início</label>
            <input
              type="text"
              value={trigger}
              onChange={(event) => setTrigger(event.target.value)}
              className="input-field"
              placeholder="Ex: Pedido recebido no portal"
              maxLength={240}
              required
            />
          </div>
        </div>

        <div>
          <label className="field-label">Objetivo do processo</label>
          <textarea
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
            className="input-field"
            placeholder="Ex: Aprovar pedidos com validação de orçamento"
            rows={3}
            maxLength={400}
            required
          />
        </div>

        <div className="form-grid">
          <div>
            <label className="field-label">Atores (1 por linha)</label>
            <textarea
              value={actorsText}
              onChange={(event) => setActorsText(event.target.value)}
              className="input-field"
              rows={4}
              placeholder={'Solicitante\nAprovador'}
              required
            />
          </div>
          <div>
            <label className="field-label">Sistemas envolvidos (opcional, 1 por linha)</label>
            <textarea
              value={systemsText}
              onChange={(event) => setSystemsText(event.target.value)}
              className="input-field"
              rows={4}
              placeholder={'ERP\nPortal de compras'}
            />
          </div>
        </div>

        <div>
          <label className="field-label">Etapas principais (1 por linha)</label>
          <textarea
            value={keyStepsText}
            onChange={(event) => setKeyStepsText(event.target.value)}
            className="input-field"
            rows={5}
            placeholder={'Receber solicitação\nValidar dados\nAprovar pedido'}
            required
          />
        </div>

        <div className="form-grid">
          <div>
            <label className="field-label">Regras de negócio (opcional, 1 por linha)</label>
            <textarea
              value={businessRulesText}
              onChange={(event) => setBusinessRulesText(event.target.value)}
              className="input-field"
              rows={3}
              placeholder={'Acima de R$10.000 precisa diretoria'}
            />
          </div>
          <div>
            <label className="field-label">Exceções (opcional, 1 por linha)</label>
            <textarea
              value={exceptionsText}
              onChange={(event) => setExceptionsText(event.target.value)}
              className="input-field"
              rows={3}
              placeholder={'Dados incompletos -> devolver ao solicitante'}
            />
          </div>
        </div>

        <div>
          <label className="field-label">Observações estruturadas (opcional)</label>
          <textarea
            value={observations}
            onChange={(event) => setObservations(event.target.value)}
            className="input-field"
            rows={3}
            maxLength={500}
            placeholder="Ex: prioridade de SLA 24h para aprovação"
          />
        </div>

        <div className="header-actions">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Gerando rascunho...' : 'Gerar rascunho BPMN'}
          </button>
        </div>
      </form>
    </section>
  );
};
