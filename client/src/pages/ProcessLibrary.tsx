import React, { useState, useEffect } from 'react';
import { processApi, Process } from '../services/api';

interface ProcessLibraryProps {
  onSelectProcess?: (process: Process) => void;
}

export const ProcessLibrary: React.FC<ProcessLibraryProps> = ({ onSelectProcess }) => {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    responsible: '',
    tags: '',
  });

  useEffect(() => {
    loadProcesses();
  }, []);

  const loadProcesses = async () => {
    setLoading(true);
    try {
      const response = await processApi.getAllProcesses();
      setProcesses(response.data);
      setError(null);
    } catch (err: any) {
      setError('Erro ao carregar processos');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProcess = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newProcess = await processApi.createProcess({
        name: formData.name,
        description: formData.description,
        responsible: formData.responsible,
        tags: formData.tags ? formData.tags.split(',').map((t) => t.trim()) : [],
      });
      setProcesses([newProcess.data, ...processes]);
      setFormData({ name: '', description: '', responsible: '', tags: '' });
      setShowForm(false);
      setError(null);
    } catch (err: any) {
      setError('Erro ao criar processo');
      console.error(err);
    }
  };

  const handleDeleteProcess = async (id: string) => {
    if (!confirm('Tem certeza que deseja deletar este processo?')) return;

    try {
      await processApi.deleteProcess(id);
      setProcesses(processes.filter((p) => p.id !== id));
      setError(null);
    } catch (err: any) {
      setError('Erro ao deletar processo');
      console.error(err);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">📚 Biblioteca de Processos</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded font-semibold"
        >
          {showForm ? '✕ Cancelar' : '+ Novo Processo'}
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {showForm && (
        <div className="bg-white border border-gray-300 rounded p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Criar Novo Processo</h2>
          <form onSubmit={handleCreateProcess} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-1">Nome *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="Ex: Aprovação de Pedido"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">Descrição</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descrição do processo"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-1">Responsável</label>
                <input
                  type="text"
                  value={formData.responsible}
                  onChange={(e) => setFormData({ ...formData, responsible: e.target.value })}
                  placeholder="Nome do responsável"
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Tags (separadas por vírgula)</label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="Ex: vendas, aprovação"
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded font-semibold"
            >
              ✓ Criar Processo
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Carregando processos...</p>
        </div>
      ) : processes.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded border border-gray-200">
          <p className="text-gray-500 mb-4">Nenhum processo criado ainda</p>
          <button
            onClick={() => setShowForm(true)}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
          >
            Criar primeiro processo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {processes.map((process) => (
            <div key={process.id} className="bg-white border border-gray-300 rounded p-4 hover:shadow-lg transition">
              <h3 className="text-lg font-bold mb-2">{process.name}</h3>
              {process.description && <p className="text-gray-600 text-sm mb-2">{process.description}</p>}
              {process.responsible && <p className="text-gray-500 text-xs mb-2">👤 {process.responsible}</p>}
              {process.tags && process.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {process.tags.map((tag) => (
                    <span key={tag} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => onSelectProcess?.(process)}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded text-sm font-semibold"
                >
                  ✎ Editar
                </button>
                <button
                  onClick={() => handleDeleteProcess(process.id)}
                  className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded text-sm font-semibold"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
