import React, { useEffect, useRef, useState } from 'react';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import { BpmnPropertiesPanel } from './BpmnPropertiesPanel';

interface BpmnEditorProps {
  bpmnXml?: string;
  onSave?: (bpmnContent: Record<string, any>, svgContent: string) => void;
  readOnly?: boolean;
}

export const BpmnEditor: React.FC<BpmnEditorProps> = ({ bpmnXml, onSave, readOnly = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<BpmnModeler | null>(null);
  const [selectedElement, setSelectedElement] = useState<any>(null);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Inicializar modeler
    const modeler = new BpmnModeler({
      container: containerRef.current,
      keyboard: { bindTo: document },
    });

    modelerRef.current = modeler;

    // Listeners
    const eventBus = modeler.get('eventBus');
    eventBus.on('element.click', ({ element }: any) => {
      setSelectedElement(element);
    });

    // Carregar diagrama
    if (bpmnXml) {
      modeler.importXML(bpmnXml).catch((err: any) => {
        console.error('Erro ao importar BPMN:', err);
        setErrors(['Erro ao carregar diagrama BPMN']);
      });
    } else {
      // Criar diagrama vazio
      const emptyDiagram = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn" exporter="bpmn-js" exporterVersion="14.2.0">
  <bpmn:process id="Process_1" isExecutable="false" />
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1" />
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
      modeler.importXML(emptyDiagram);
    }

    return () => {
      modeler.destroy();
    };
  }, []);

  const handleSave = async () => {
    if (!modelerRef.current) return;

    try {
      const { xml } = await modelerRef.current.saveXML({ format: true });
      const canvas = modelerRef.current.get('canvas');
      const svg = await modelerRef.current.saveSVG();

      // Converter XML para estrutura simples
      const bpmnContent = {
        xml,
        elements: [],
        flows: [],
      };

      onSave?.(bpmnContent, svg);
      setErrors([]);
    } catch (err: any) {
      setErrors([`Erro ao salvar: ${err.message}`]);
    }
  };

  const handleExportSvg = async () => {
    if (!modelerRef.current) return;

    try {
      const svg = await modelerRef.current.saveSVG();
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'diagram.svg';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setErrors([`Erro ao exportar SVG: ${err.message}`]);
    }
  };

  const handleExportXml = async () => {
    if (!modelerRef.current) return;

    try {
      const { xml } = await modelerRef.current.saveXML({ format: true });
      const blob = new Blob([xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'diagram.bpmn';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setErrors([`Erro ao exportar XML: ${err.message}`]);
    }
  };

  return (
    <div className="flex h-full gap-4">
      <div className="flex-1 flex flex-col">
        {errors.length > 0 && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-4">
            {errors.map((err, i) => (
              <div key={i}>{err}</div>
            ))}
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <button onClick={handleSave} className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded">
            💾 Salvar
          </button>
          <button onClick={handleExportXml} className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded">
            📥 Export XML
          </button>
          <button onClick={handleExportSvg} className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded">
            🖼️ Export SVG
          </button>
        </div>

        <div ref={containerRef} className="flex-1 border border-gray-300 rounded bg-white" />
      </div>

      {selectedElement && (
        <BpmnPropertiesPanel
          element={selectedElement}
          modeler={modelerRef.current}
          onUpdate={() => setSelectedElement(null)}
        />
      )}
    </div>
  );
};
