import React, { useState, useEffect } from 'react';
import { BpmnEditor } from '../components/BpmnEditor';
import { processApi, Process } from '../services/api';
import { BrandLogo } from '../components/BrandLogo';

interface EditorProps {
  process: Process;
  onBack?: () => void;
}

export const Editor: React.FC<EditorProps> = ({ process, onBack }) => {
  const [currentProcess, setCurrentProcess] = useState(process);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [activeBpmnXml, setActiveBpmnXml] = useState<string | undefined>(undefined);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);

  useEffect(() => {
    setCurrentProcess(process);
    setActiveBpmnXml(undefined);
    setActiveVersionId(null);
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

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="bg-gray-100 border-b border-gray-300 p-4">
        <div className="flex justify-between items-center mb-3">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <BrandLogo onClick={onBack} title="Ir para a Biblioteca" />
              <button
                onClick={onBack}
                className="text-blue-500 hover:text-blue-700 font-semibold inline-block"
                title="Voltar para a Biblioteca"
              >
                ← Biblioteca
              </button>
            </div>
            <h1 className="text-2xl font-bold">{currentProcess.name}</h1>
            {currentProcess.description && <p className="text-gray-600 text-sm">{currentProcess.description}</p>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowVersions(!showVersions)}
              className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded"
            >
              📋 Versões ({versions.length}) {saving ? '· salvando...' : ''}
            </button>
          </div>
        </div>

        {message && (
          <div
            className={`px-4 py-2 rounded ${
              message.type === 'success'
                ? 'bg-green-100 text-green-800 border border-green-400'
                : 'bg-red-100 text-red-800 border border-red-400'
            }`}
          >
            {message.text}
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor */}
        <div className="flex-1 overflow-hidden">
          <BpmnEditor bpmnXml={activeBpmnXml} onSave={handleSave} />
        </div>

        {/* Versions Sidebar */}
        {showVersions && (
          <div className="w-64 bg-gray-50 border-l border-gray-300 p-4 overflow-y-auto">
            <h2 className="font-bold text-lg mb-4">Versões</h2>
            {versions.length === 0 ? (
              <p className="text-gray-500 text-sm">Nenhuma versão salva</p>
            ) : (
              <div className="space-y-2">
                {versions.map((version) => (
                  <div
                    key={version.id}
                    className={`bg-white border rounded p-2 ${
                      activeVersionId === version.id ? 'border-blue-500 ring-1 ring-blue-200' : 'border-gray-300'
                    }`}
                  >
                    <p className="font-semibold text-sm">v{version.versionNumber}</p>
                    <p className="text-xs text-gray-500 mb-2">{new Date(version.createdAt).toLocaleString()}</p>
                    <button
                      onClick={() => handleLoadVersion(version.id)}
                      className="w-full bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs"
                    >
                      Carregar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
