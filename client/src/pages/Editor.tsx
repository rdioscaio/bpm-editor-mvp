import React, { useState, useEffect } from 'react';
import { BpmnEditor } from '../components/BpmnEditor';
import { processApi, Process } from '../services/api';
import { BrandLogo } from '../components/BrandLogo';
import { AiDraftPanel } from '../components/AiDraftPanel';

interface EditorProps {
  process: Process;
  onBack?: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const Editor: React.FC<EditorProps> = ({ process, onBack, theme, onToggleTheme }) => {
  const [currentProcess, setCurrentProcess] = useState(process);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [activeBpmnXml, setActiveBpmnXml] = useState<string | undefined>(undefined);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [showAiDraft, setShowAiDraft] = useState(false);

  useEffect(() => {
    setCurrentProcess(process);
    setActiveBpmnXml(undefined);
    setActiveVersionId(null);
    setShowAiDraft(false);
    void loadVersions(process.id, process.currentVersionId);
  }, [process]);

  const getXmlFromVersion = (version: any): string | undefined => {
    const xml = version?.bpmnContent?.xml;
    if (typeof xml === 'string' && xml.trim().length > 0) {
      return xml;
    }
    return undefined;
  };

  const loadVersions = async (processId: string, preferredVersionId?: string) => {
    try {
      const response = await processApi.getVersions(processId);
      const nextVersions = response.data;
      setVersions(nextVersions);

      if (nextVersions.length === 0) {
        setActiveVersionId(null);
        setActiveBpmnXml(undefined);
        return;
      }

      const preferredVersion = preferredVersionId
        ? nextVersions.find((version) => version.id === preferredVersionId) || nextVersions[0]
        : nextVersions[0];

      const xml = getXmlFromVersion(preferredVersion);
      if (xml) {
        setActiveVersionId(preferredVersion.id);
        setActiveBpmnXml(xml);
      } else {
        setActiveVersionId(null);
        setActiveBpmnXml(undefined);
      }
    } catch (err) {
      console.error('Erro ao carregar versões:', err);
    }
  };

  const handleSave = async (bpmnContent: Record<string, any>, svgContent: string) => {
    setSaving(true);
    try {
      const savedVersion = await processApi.saveVersion(process.id, {
        bpmnContent,
        svgContent,
        description: `Versão ${versions.length + 1}`,
      });

      const updatedProcess = await processApi.getProcess(process.id);
      setCurrentProcess(updatedProcess.data);
      await loadVersions(process.id, savedVersion.data.id);

      setMessage({ type: 'success', text: 'Processo salvo com sucesso!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Erro ao salvar' });
    } finally {
      setSaving(false);
    }
  };

  const handleLoadVersion = async (versionId: string) => {
    try {
      const response = await processApi.getVersion(process.id, versionId);

      const xml = getXmlFromVersion(response.data);
      if (!xml) {
        setMessage({ type: 'error', text: 'Versão sem XML válido para importação' });
        setTimeout(() => setMessage(null), 3000);
        return;
      }

      setActiveVersionId(versionId);
      setActiveBpmnXml(xml);
      setMessage({ type: 'success', text: `Versão carregada: v${response.data.versionNumber}` });
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage({ type: 'error', text: 'Erro ao carregar versão' });
    }
  };

  const handleAiApplyXml = (xml: string, draftProcessName: string) => {
    setActiveVersionId(null);
    setActiveBpmnXml(xml);
    setCurrentProcess((current) => ({
      ...current,
      name: draftProcessName || current.name,
    }));
    setMessage({
      type: 'success',
      text: 'Rascunho IA aplicado no editor. Revise, conecte ajustes e salve.',
    });
    setTimeout(() => setMessage(null), 3500);
  };

  const handleAiStatus = (nextMessage: { type: 'success' | 'error'; text: string }) => {
    setMessage(nextMessage);
    setTimeout(() => setMessage(null), 3500);
  };

  return (
    <div className="editor-shell">
      <header className="app-header">
        <div className="editor-header-row">
          <div className="editor-header-main">
            <div className="editor-header-brand-row">
              <BrandLogo onClick={onBack} title="Ir para a Biblioteca" className="h-8 w-auto" />
              <button
                onClick={onBack}
                className="btn btn-link"
                title="Voltar para a Biblioteca"
              >
                ← Biblioteca
              </button>
            </div>
            <h1 className="page-title">{currentProcess.name}</h1>
            {currentProcess.description && <p className="page-subtitle">{currentProcess.description}</p>}
          </div>
          <div className="header-actions">
            <button type="button" onClick={onToggleTheme} className="btn btn-ghost" title="Alternar tema dia/noite">
              {theme === 'light' ? 'Modo noite' : 'Modo dia'}
            </button>
            <button
              onClick={() => setShowVersions(!showVersions)}
              className="btn btn-secondary"
              title="Mostrar ou ocultar versões salvas"
            >
              Versões ({versions.length}) {saving ? '· salvando...' : ''}
            </button>
            <button
              type="button"
              onClick={() => setShowAiDraft((current) => !current)}
              className="btn btn-secondary"
              title="Abrir formulário guiado para gerar draft BPMN com IA"
            >
              {showAiDraft ? 'Ocultar IA Draft' : 'IA Draft BPMN'}
            </button>
            <button
              type="button"
              onClick={() => setConnectMode((current) => !current)}
              title="Ativar modo para conectar etapas"
              aria-label="Ativar modo para conectar etapas"
              data-tooltip="Ativar modo para conectar etapas"
              className={`tooltip-trigger btn ${
                connectMode ? 'btn-toggle-active' : 'btn-toggle-inactive'
              }`}
            >
              {connectMode ? 'Conectar etapas: ligado' : 'Conectar etapas: desligado'}
            </button>
          </div>
        </div>

        {connectMode && (
          <div className="message message-info mb-3">
            Clique na origem e depois no destino.
          </div>
        )}

        {message && (
          <div className={message.type === 'success' ? 'message message-success' : 'message message-error'}>
            {message.text}
          </div>
        )}
      </header>

      <div className="editor-layout">
        <div className="editor-main">
          {showAiDraft && (
            <AiDraftPanel
              processName={currentProcess.name}
              onApplyXml={handleAiApplyXml}
              onStatus={handleAiStatus}
            />
          )}
          <div className="editor-canvas-slot">
            <BpmnEditor bpmnXml={activeBpmnXml} onSave={handleSave} connectMode={connectMode} />
          </div>
        </div>

        {showVersions && (
          <aside className="versions-sidebar">
            <h2 className="section-title">Versões</h2>
            {versions.length === 0 ? (
              <p className="muted-text">Nenhuma versão salva</p>
            ) : (
              <div className="versions-list">
                {versions.map((version) => (
                  <div
                    key={version.id}
                    className={`version-item ${
                      activeVersionId === version.id ? 'version-item-active' : 'version-item-idle'
                    }`}
                  >
                    <p className="version-title">v{version.versionNumber}</p>
                    <p className="version-date">{new Date(version.createdAt).toLocaleString()}</p>
                    <button
                      onClick={() => handleLoadVersion(version.id)}
                      className="btn btn-primary btn-small btn-full"
                    >
                      Carregar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
};
