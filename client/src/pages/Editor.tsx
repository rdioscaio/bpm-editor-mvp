import React, { useState, useEffect } from 'react';
import { BpmnEditor } from '../components/BpmnEditor';
import { processApi, Process } from '../services/api';

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

  useEffect(() => {
    loadVersions();
  }, [process.id]);

  const loadVersions = async () => {
    try {
      const response = await processApi.getVersions(process.id);
      setVersions(response.data);
    } catch (err) {
      console.error('Erro ao carregar versões:', err);
    }
  };

  const handleSave = async (bpmnContent: Record<string, any>, svgContent: string) => {
    setSaving(true);
    try {
      await processApi.saveVersion(process.id, {
        bpmnContent,
        svgContent,
        description: `Versão ${versions.length + 1}`,
      });
      await loadVersions();
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
      // Aqui você carregaria a versão no editor
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
            <button
              onClick={onBack}
              className="text-blue-500 hover:text-blue-700 font-semibold mb-2 inline-block"
            >
              ← Voltar
            </button>
            <h1 className="text-2xl font-bold">{currentProcess.name}</h1>
            {currentProcess.description && <p className="text-gray-600 text-sm">{currentProcess.description}</p>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowVersions(!showVersions)}
              className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded"
            >
              📋 Versões ({versions.length})
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
          <BpmnEditor onSave={handleSave} />
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
                  <div key={version.id} className="bg-white border border-gray-300 rounded p-2">
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
