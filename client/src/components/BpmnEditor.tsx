import React, { useCallback, useEffect, useRef, useState } from 'react';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';
import { BpmnPropertiesPanel } from './BpmnPropertiesPanel';

interface BpmnEditorProps {
  bpmnXml?: string;
  onSave?: (bpmnContent: Record<string, any>, svgContent: string) => void;
  readOnly?: boolean;
}

const EMPTY_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn" exporter="bpmn-js" exporterVersion="14.2.0">
  <bpmn:process id="Process_1" isExecutable="false" />
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1" />
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

export const BpmnEditor: React.FC<BpmnEditorProps> = ({ bpmnXml, onSave, readOnly = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<BpmnModeler | null>(null);
  const [selectedElement, setSelectedElement] = useState<any>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const importDiagram = useCallback(async (xml: string) => {
    const modeler = modelerRef.current;
    if (!modeler) return;

    try {
      await modeler.importXML(xml);
      const canvas = modeler.get('canvas') as { zoom: (level: 'fit-viewport') => void };
      canvas.zoom('fit-viewport');
      setErrors([]);
    } catch (err: any) {
      console.error('Erro ao importar BPMN:', err);
      setErrors(['Erro ao carregar diagrama BPMN']);
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const modeler = new BpmnModeler({
      container: containerRef.current,
      keyboard: { bindTo: document },
    });

    modelerRef.current = modeler;

    const eventBus = modeler.get('eventBus') as {
      on: (event: string, listener: (event: any) => void) => void;
      off: (event: string, listener: (event: any) => void) => void;
    };
    const handleElementClick = ({ element }: any) => setSelectedElement(element);
    const handleCanvasClick = () => setSelectedElement(null);
    eventBus.on('element.click', handleElementClick);
    eventBus.on('canvas.click', handleCanvasClick);

    return () => {
      eventBus.off('element.click', handleElementClick);
      eventBus.off('canvas.click', handleCanvasClick);
      modeler.destroy();
      modelerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!modelerRef.current) return;
    const xmlToImport = bpmnXml && bpmnXml.trim().length > 0 ? bpmnXml : EMPTY_DIAGRAM;
    void importDiagram(xmlToImport);
  }, [bpmnXml, importDiagram]);

  const getActiveModeler = () => {
    if (!modelerRef.current) {
      throw new Error('Editor BPMN ainda não inicializado');
    }
    return modelerRef.current;
  };

  const handleSave = async () => {
    if (readOnly) return;

    try {
      const modeler = getActiveModeler();
      const { xml } = await modeler.saveXML({ format: true });
      const { svg } = await modeler.saveSVG();

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

  const downloadFile = (content: string, type: string, fileName: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportSvg = async () => {
    try {
      const modeler = getActiveModeler();
      const { svg } = await modeler.saveSVG();
      downloadFile(svg, 'image/svg+xml', 'diagram.svg');
    } catch (err: any) {
      setErrors([`Erro ao exportar SVG: ${err.message}`]);
    }
  };

  const handleExportXml = async () => {
    try {
      const modeler = getActiveModeler();
      const { xml } = await modeler.saveXML({ format: true });
      downloadFile(xml, 'application/xml', 'diagram.bpmn');
    } catch (err: any) {
      setErrors([`Erro ao exportar XML: ${err.message}`]);
    }
  };

  return (
    <div className="flex h-full min-h-0 gap-4">
      <div className="flex-1 flex flex-col min-h-0">
        {errors.length > 0 && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-4">
            {errors.map((err, i) => (
              <div key={i}>{err}</div>
            ))}
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <button
            onClick={handleSave}
            disabled={readOnly}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            💾 Salvar
          </button>
          <button onClick={handleExportXml} className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded">
            📥 Export XML
          </button>
          <button onClick={handleExportSvg} className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded">
            🖼️ Export SVG
          </button>
        </div>

        <div ref={containerRef} className="bpmn-container flex-1 border border-gray-300 rounded bg-white min-h-[420px]" />
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
