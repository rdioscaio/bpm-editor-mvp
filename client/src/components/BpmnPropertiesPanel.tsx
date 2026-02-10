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
      <div className="w-80 bg-gray-50 border-l border-gray-300 p-4">
        <p className="text-gray-500 text-sm">Selecione um elemento para editar propriedades</p>
      </div>
    );
  }

  return (
    <div className="w-80 bg-gray-50 border-l border-gray-300 p-4 overflow-y-auto">
      <h3 className="font-bold text-lg mb-4">Propriedades</h3>

      <div className="mb-4">
        <label className="block text-sm font-semibold text-gray-700 mb-1">Tipo</label>
        <input
          type="text"
          value={element.type || ''}
          disabled
          className="w-full px-3 py-2 border border-gray-300 rounded bg-gray-100 text-gray-600 text-sm"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-semibold text-gray-700 mb-1">ID</label>
        <input
          type="text"
          value={element.id || ''}
          disabled
          className="w-full px-3 py-2 border border-gray-300 rounded bg-gray-100 text-gray-600 text-sm"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-semibold text-gray-700 mb-1">Nome *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Nome do elemento"
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-semibold text-gray-700 mb-1">Documentação</label>
        <textarea
          value={documentation}
          onChange={(e) => setDocumentation(e.target.value)}
          placeholder="Descrição ou documentação"
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          rows={3}
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-semibold text-gray-700 mb-1">Responsável</label>
        <input
          type="text"
          value={responsible}
          onChange={(e) => setResponsible(e.target.value)}
          placeholder="Nome do responsável"
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-semibold text-gray-700 mb-1">SLA</label>
        <input
          type="text"
          value={sla}
          onChange={(e) => setSla(e.target.value)}
          placeholder="Ex: 24 horas"
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="text-xs text-gray-500 mt-6 pt-4 border-t border-gray-200">
        <p>* Campo obrigatório</p>
      </div>
    </div>
  );
};
