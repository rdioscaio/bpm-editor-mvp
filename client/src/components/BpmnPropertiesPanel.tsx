import React, { useState, useEffect } from 'react';

interface BpmnPropertiesPanelProps {
  element: any;
  modeler: any;
  onUpdate?: () => void;
}

export const BpmnPropertiesPanel: React.FC<BpmnPropertiesPanelProps> = ({ element, modeler, onUpdate }) => {
  const [name, setName] = useState(element?.businessObject?.name || '');
  const [documentation, setDocumentation] = useState('');
  const [responsible, setResponsible] = useState('');
  const [sla, setSla] = useState('');

  useEffect(() => {
    setName(element?.businessObject?.name || '');
  }, [element]);

  const handleNameChange = (newName: string) => {
    setName(newName);
    if (element && modeler) {
      modeler.get('modeling').updateProperties(element, { name: newName });
    }
  };

  if (!element || element.type === 'label') {
    return (
      <div className="properties-panel">
        <p className="muted-text">Selecione um elemento para editar propriedades.</p>
      </div>
    );
  }

  return (
    <div className="properties-panel">
      <h3 className="section-title">Propriedades</h3>

      <div className="mb-4">
        <label className="field-label">Tipo</label>
        <input
          type="text"
          value={element.type || ''}
          disabled
          className="input-field"
        />
      </div>

      <div className="mb-4">
        <label className="field-label">ID</label>
        <input
          type="text"
          value={element.id || ''}
          disabled
          className="input-field"
        />
      </div>

      <div className="mb-4">
        <label className="field-label">Nome *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Nome do elemento"
          className="input-field"
        />
      </div>

      <div className="mb-4">
        <label className="field-label">Documentação</label>
        <textarea
          value={documentation}
          onChange={(e) => setDocumentation(e.target.value)}
          placeholder="Descrição ou documentação"
          className="input-field"
          rows={3}
        />
      </div>

      <div className="mb-4">
        <label className="field-label">Responsável</label>
        <input
          type="text"
          value={responsible}
          onChange={(e) => setResponsible(e.target.value)}
          placeholder="Nome do responsável"
          className="input-field"
        />
      </div>

      <div className="mb-4">
        <label className="field-label">SLA</label>
        <input
          type="text"
          value={sla}
          onChange={(e) => setSla(e.target.value)}
          placeholder="Ex: 24 horas"
          className="input-field"
        />
      </div>

      <div className="muted-text" style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
        <p>* Campo obrigatório</p>
      </div>
    </div>
  );
};
