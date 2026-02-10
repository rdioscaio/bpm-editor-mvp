import React, { useState, useEffect } from 'react';
import { processApi, Process } from '../services/api';
import { BrandLogo } from '../components/BrandLogo';

interface ProcessLibraryProps {
  onSelectProcess?: (process: Process) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const ProcessLibrary: React.FC<ProcessLibraryProps> = ({ onSelectProcess, theme, onToggleTheme }) => {
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

  const handleGoHome = () => {
    setShowForm(false);
    setError(null);
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <div className="page-header-left">
          <BrandLogo onClick={handleGoHome} className="h-8 w-auto" />
          <div>
            <h1 className="page-title">Biblioteca de Processos</h1>
            <p className="page-subtitle">Modele, conecte e versione fluxos BPMN em minutos.</p>
          </div>
        </div>
        <div className="header-actions">
          <button type="button" onClick={onToggleTheme} className="btn btn-ghost" title="Alternar tema dia/noite">
            {theme === 'light' ? 'Modo noite' : 'Modo dia'}
          </button>
          <button type="button" onClick={() => setShowForm(!showForm)} className="btn btn-primary">
            {showForm ? 'Cancelar' : 'Novo processo'}
          </button>
        </div>
      </header>

      {error && <div className="message message-error">{error}</div>}

      {showForm && (
        <section className="panel mb-6">
          <h2 className="section-title">Criar Novo Processo</h2>
          <form onSubmit={handleCreateProcess} className="form-stack">
            <div>
              <label className="field-label">Nome *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="Ex: Aprovação de Pedido"
                className="input-field"
              />
            </div>

            <div>
              <label className="field-label">Descrição</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descrição do processo"
                className="input-field"
                rows={3}
              />
            </div>

            <div className="form-grid">
              <div>
                <label className="field-label">Responsável</label>
                <input
                  type="text"
                  value={formData.responsible}
                  onChange={(e) => setFormData({ ...formData, responsible: e.target.value })}
                  placeholder="Nome do responsável"
                  className="input-field"
                />
              </div>

              <div>
                <label className="field-label">Tags (separadas por vírgula)</label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="Ex: vendas, aprovação"
                  className="input-field"
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary btn-full">
              Criar processo
            </button>
          </form>
        </section>
      )}

      {loading ? (
        <div className="empty-state">
          <p>Carregando processos...</p>
        </div>
      ) : processes.length === 0 ? (
        <div className="empty-state">
          <p>Nenhum processo criado ainda.</p>
          <button onClick={() => setShowForm(true)} className="btn btn-primary mt-4">
            Criar primeiro processo
          </button>
        </div>
      ) : (
        <div className="process-grid">
          {processes.map((process) => (
            <article key={process.id} className="process-card">
              <h3 className="process-card-title">{process.name}</h3>
              {process.description && <p className="process-card-description">{process.description}</p>}
              {process.responsible && <p className="process-card-meta">Responsável: {process.responsible}</p>}
              {process.tags && process.tags.length > 0 && (
                <div className="tag-list">
                  {process.tags.map((tag) => (
                    <span key={tag} className="tag-chip">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="card-actions">
                <button
                  onClick={() => onSelectProcess?.(process)}
                  className="btn btn-primary btn-small btn-grow"
                  title="Abrir processo no editor"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDeleteProcess(process.id)}
                  className="btn btn-danger btn-small"
                  title="Excluir processo"
                >
                  Excluir
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
