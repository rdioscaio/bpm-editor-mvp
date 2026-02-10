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
  connectMode?: boolean;
}

const EMPTY_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn" exporter="bpmn-js" exporterVersion="14.2.0">
  <bpmn:process id="Process_1" isExecutable="false" />
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1" />
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const ONBOARDING_STORAGE_KEY = 'tottal_bpm_editor_onboarding_v1';

const EXACT_TOOLTIP_TRANSLATIONS: Record<string, string> = {
  'Activate the hand tool': 'Ativar ferramenta de mão',
  'Activate the lasso tool': 'Ativar ferramenta de seleção livre',
  'Activate the create/remove space tool': 'Ativar ferramenta de criar/remover espaço',
  'Activate the global connect tool': 'Ativar ferramenta de conexão global',
  'Create StartEvent': 'Criar evento inicial',
  'Create Intermediate/Boundary Event': 'Criar evento intermediário/de borda',
  'Create EndEvent': 'Criar evento final',
  'Create Gateway': 'Criar gateway',
  'Create Task': 'Criar tarefa',
  'Create DataObjectReference': 'Criar referência de dados',
  'Append Task': 'Adicionar tarefa',
  'Append EndEvent': 'Adicionar evento final',
  'Append Gateway': 'Adicionar gateway',
  'Append Intermediate/Boundary Event': 'Adicionar evento intermediário/de borda',
  'Append text annotation': 'Adicionar anotação de texto',
  'Connect using Sequence/MessageFlow': 'Conectar usando fluxo de sequência/mensagem',
  Remove: 'Remover',
  Delete: 'Excluir',
  'Delete selected elements': 'Excluir elementos selecionados',
  'Change type': 'Alterar tipo',
  'Change element type': 'Alterar tipo do elemento',
  'Open minimap': 'Abrir minimapa',
  'Close minimap': 'Fechar minimapa',
};

const BPMN_TERM_TRANSLATIONS: Record<string, string> = {
  StartEvent: 'evento inicial',
  EndEvent: 'evento final',
  Task: 'tarefa',
  Gateway: 'gateway',
  DataObjectReference: 'referência de dados',
  SequenceFlow: 'fluxo de sequência',
  MessageFlow: 'fluxo de mensagem',
  Intermediate: 'intermediário',
  Boundary: 'de borda',
  Event: 'evento',
  Exclusive: 'exclusivo',
  Parallel: 'paralelo',
  User: 'do usuário',
};

const translateBpmnTerms = (value: string): string => {
  let translated = value;

  Object.entries(BPMN_TERM_TRANSLATIONS).forEach(([source, target]) => {
    const termRegex = new RegExp(source, 'g');
    translated = translated.replace(termRegex, target);
  });

  return translated;
};

const translateTooltip = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return value;

  if (EXACT_TOOLTIP_TRANSLATIONS[trimmed]) {
    return EXACT_TOOLTIP_TRANSLATIONS[trimmed];
  }

  if (/^Create\s+/i.test(trimmed)) {
    return `Criar ${translateBpmnTerms(trimmed.replace(/^Create\s+/i, ''))}`.trim();
  }

  if (/^Append\s+/i.test(trimmed)) {
    return `Adicionar ${translateBpmnTerms(trimmed.replace(/^Append\s+/i, ''))}`.trim();
  }

  if (/^Connect using\s+/i.test(trimmed)) {
    return `Conectar usando ${translateBpmnTerms(trimmed.replace(/^Connect using\s+/i, '').replace('/', ' / '))}`.trim();
  }

  if (/^Replace with\s+/i.test(trimmed)) {
    return `Substituir por ${translateBpmnTerms(trimmed.replace(/^Replace with\s+/i, ''))}`.trim();
  }

  return translateBpmnTerms(trimmed);
};

export const BpmnEditor: React.FC<BpmnEditorProps> = ({
  bpmnXml,
  onSave,
  readOnly = false,
  connectMode = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<BpmnModeler | null>(null);
  const connectModeRef = useRef(connectMode);
  const tooltipObserverRef = useRef<MutationObserver | null>(null);
  const tooltipRafRef = useRef<number | null>(null);
  const [selectedElement, setSelectedElement] = useState<any>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [modelerReady, setModelerReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const applyPortugueseTooltips = useCallback(() => {
    if (!containerRef.current) return;

    const nodes = containerRef.current.querySelectorAll<HTMLElement>('[title], [aria-label]');

    nodes.forEach((node) => {
      const translateAttribute = (attribute: 'title' | 'aria-label') => {
        const sourceAttr = `data-original-${attribute}`;
        const currentValue = node.getAttribute(attribute);
        if (!currentValue || !currentValue.trim()) return;

        if (!node.hasAttribute(sourceAttr)) {
          node.setAttribute(sourceAttr, currentValue);
        }

        const originalValue = node.getAttribute(sourceAttr) || currentValue;
        const translatedValue = translateTooltip(originalValue);

        if (translatedValue && translatedValue !== currentValue) {
          node.setAttribute(attribute, translatedValue);
        }
      };

      translateAttribute('title');
      translateAttribute('aria-label');
    });
  }, []);

  const scheduleTooltipTranslation = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (tooltipRafRef.current !== null) return;

    tooltipRafRef.current = window.requestAnimationFrame(() => {
      tooltipRafRef.current = null;
      applyPortugueseTooltips();
    });
  }, [applyPortugueseTooltips]);

  const importDiagram = useCallback(async (xml: string) => {
    const modeler = modelerRef.current;
    if (!modeler) return;

    try {
      await modeler.importXML(xml);
      const canvas = modeler.get('canvas') as { zoom: (level: 'fit-viewport') => void };
      canvas.zoom('fit-viewport');
      scheduleTooltipTranslation();
      setErrors([]);
    } catch (err: any) {
      console.error('Erro ao importar BPMN:', err);
      setErrors(['Erro ao carregar diagrama BPMN']);
    }
  }, [scheduleTooltipTranslation]);

  useEffect(() => {
    connectModeRef.current = connectMode;
  }, [connectMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hasSeenOnboarding = window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'seen';
    if (!hasSeenOnboarding) {
      setShowOnboarding(true);
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
    const handleToolUpdate = () => scheduleTooltipTranslation();
    const keepConnectModeActive = () => {
      if (!connectModeRef.current) return;

      const globalConnect = modeler.get('globalConnect') as {
        isActive: () => boolean;
        toggle: () => void;
      };

      if (!globalConnect.isActive()) {
        setTimeout(() => {
          if (connectModeRef.current && !globalConnect.isActive()) {
            globalConnect.toggle();
          }
        }, 0);
      }
    };

    eventBus.on('element.click', handleElementClick);
    eventBus.on('canvas.click', handleCanvasClick);
    eventBus.on('tool-manager.update', handleToolUpdate);
    eventBus.on('connect.ended', keepConnectModeActive);
    eventBus.on('connect.canceled', keepConnectModeActive);

    tooltipObserverRef.current = new MutationObserver(() => {
      scheduleTooltipTranslation();
    });

    tooltipObserverRef.current.observe(containerRef.current, {
      childList: true,
      subtree: true,
    });

    scheduleTooltipTranslation();
    setModelerReady(true);

    return () => {
      eventBus.off('element.click', handleElementClick);
      eventBus.off('canvas.click', handleCanvasClick);
      eventBus.off('tool-manager.update', handleToolUpdate);
      eventBus.off('connect.ended', keepConnectModeActive);
      eventBus.off('connect.canceled', keepConnectModeActive);
      tooltipObserverRef.current?.disconnect();
      tooltipObserverRef.current = null;
      if (tooltipRafRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(tooltipRafRef.current);
        tooltipRafRef.current = null;
      }
      setModelerReady(false);
      modeler.destroy();
      modelerRef.current = null;
    };
  }, [scheduleTooltipTranslation]);

  useEffect(() => {
    if (!modelerRef.current) return;
    const xmlToImport = bpmnXml && bpmnXml.trim().length > 0 ? bpmnXml : EMPTY_DIAGRAM;
    void importDiagram(xmlToImport);
  }, [bpmnXml, importDiagram]);

  useEffect(() => {
    if (!modelerReady || !modelerRef.current) return;

    const globalConnect = modelerRef.current.get('globalConnect') as {
      isActive: () => boolean;
      toggle: () => void;
    };

    if (connectMode && !globalConnect.isActive()) {
      globalConnect.toggle();
    }

    if (!connectMode && globalConnect.isActive()) {
      globalConnect.toggle();
    }
  }, [connectMode, modelerReady]);

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

  const dismissOnboarding = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, 'seen');
    }
    setShowOnboarding(false);
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
        {showOnboarding && (
          <div className="bg-cyan-50 border border-cyan-200 text-cyan-900 px-4 py-3 rounded mb-4">
            <p className="font-semibold mb-2">Primeiros passos</p>
            <ol className="list-decimal pl-5 text-sm space-y-1">
              <li>Arraste elementos da paleta para o canvas.</li>
              <li>Use “Conectar etapas” para ligar origem e destino.</li>
              <li>Clique em “Salvar” e depois exporte XML/SVG.</li>
            </ol>
            <div className="mt-3">
              <button
                type="button"
                onClick={dismissOnboarding}
                className="bg-cyan-600 hover:bg-cyan-700 text-white px-3 py-1.5 rounded text-sm"
              >
                Entendi
              </button>
            </div>
          </div>
        )}

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
            title="Salvar a versão atual do processo"
            aria-label="Salvar a versão atual do processo"
            data-tooltip="Salvar a versão atual do processo"
            className="tooltip-trigger bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Salvar
          </button>
          <button
            onClick={handleExportXml}
            title="Exportar BPMN em XML"
            aria-label="Exportar BPMN em XML"
            data-tooltip="Exportar BPMN em XML"
            className="tooltip-trigger bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded"
          >
            Exportar XML
          </button>
          <button
            onClick={handleExportSvg}
            title="Exportar diagrama em SVG"
            aria-label="Exportar diagrama em SVG"
            data-tooltip="Exportar diagrama em SVG"
            className="tooltip-trigger bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded"
          >
            Exportar SVG
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
