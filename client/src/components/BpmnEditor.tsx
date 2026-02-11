import React, { useCallback, useEffect, useRef, useState } from 'react';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import { is } from 'bpmn-js/lib/util/ModelUtil';
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
const LABEL_FONT_MIN = 10;
const LABEL_FONT_MAX = 16;
const LABEL_LINE_HEIGHT = 1.24;
const LABEL_SIDE_PADDING = 14;
const LABEL_TOP_PADDING = 12;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 2.8;
const ZOOM_STEP = 0.15;

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

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const readCssVariable = (variableName: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback;
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  return value || fallback;
};

const shouldAutoFitElementLabel = (element: any): boolean => {
  const businessObject = element?.businessObject;
  if (!businessObject) return false;

  if (
    is(businessObject, 'bpmn:Task') ||
    is(businessObject, 'bpmn:SubProcess') ||
    is(businessObject, 'bpmn:CallActivity') ||
    is(businessObject, 'bpmn:ExclusiveGateway') ||
    is(businessObject, 'bpmn:StartEvent') ||
    is(businessObject, 'bpmn:EndEvent')
  ) {
    return true;
  }

  if (
    element.type === 'label' &&
    element.labelTarget?.businessObject &&
    is(element.labelTarget.businessObject, 'bpmn:SequenceFlow')
  ) {
    return true;
  }

  return false;
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
  const themeObserverRef = useRef<MutationObserver | null>(null);
  const tooltipRafRef = useRef<number | null>(null);
  const visualsRafRef = useRef<number | null>(null);
  const measureContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [selectedElement, setSelectedElement] = useState<any>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [modelerReady, setModelerReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const getMeasureContext = useCallback(() => {
    if (measureContextRef.current) {
      return measureContextRef.current;
    }

    if (typeof document === 'undefined') {
      return null;
    }

    const canvas = document.createElement('canvas');
    measureContextRef.current = canvas.getContext('2d');
    return measureContextRef.current;
  }, []);

  const measureTextWidth = useCallback((text: string, fontSize: number) => {
    const context = getMeasureContext();
    if (!context) {
      return text.length * fontSize * 0.58;
    }
    context.font = `${fontSize}px "${getComputedStyle(document.body).fontFamily}"`;
    return context.measureText(text).width;
  }, [getMeasureContext]);

  const breakToken = useCallback((token: string, maxWidth: number, fontSize: number) => {
    const chunks: string[] = [];
    let current = '';

    Array.from(token).forEach((char) => {
      const candidate = current + char;
      if (measureTextWidth(candidate, fontSize) <= maxWidth) {
        current = candidate;
        return;
      }

      if (current) {
        chunks.push(current);
      }
      current = char;
    });

    if (current) {
      chunks.push(current);
    }

    return chunks.length > 0 ? chunks : [token];
  }, [measureTextWidth]);

  const ellipsize = useCallback((text: string, maxWidth: number, fontSize: number) => {
    const ellipsis = '...';
    if (measureTextWidth(text, fontSize) <= maxWidth) {
      return text;
    }

    let next = text.trim();
    while (next.length > 0 && measureTextWidth(`${next}${ellipsis}`, fontSize) > maxWidth) {
      next = next.slice(0, -1);
    }

    return next.length > 0 ? `${next}${ellipsis}` : ellipsis;
  }, [measureTextWidth]);

  const wrapText = useCallback((
    rawText: string,
    maxWidth: number,
    maxLines: number,
    fontSize: number,
  ) => {
    const words = rawText.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return [''];
    }

    const wrapped: string[] = [];
    let currentLine = '';

    words.forEach((word) => {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (measureTextWidth(candidate, fontSize) <= maxWidth) {
        currentLine = candidate;
        return;
      }

      if (currentLine) {
        wrapped.push(currentLine);
        currentLine = '';
      }

      if (measureTextWidth(word, fontSize) <= maxWidth) {
        currentLine = word;
        return;
      }

      const pieces = breakToken(word, maxWidth, fontSize);
      wrapped.push(...pieces.slice(0, -1));
      currentLine = pieces[pieces.length - 1];
    });

    if (currentLine) {
      wrapped.push(currentLine);
    }

    if (wrapped.length <= maxLines) {
      return wrapped;
    }

    const trimmed = wrapped.slice(0, Math.max(maxLines, 1));
    trimmed[trimmed.length - 1] = ellipsize(trimmed[trimmed.length - 1], maxWidth, fontSize);
    return trimmed;
  }, [breakToken, ellipsize, measureTextWidth]);

  const getTextNodeForElement = useCallback((element: any, elementRegistry: any) => {
    const gfx = elementRegistry.getGraphics(element) as SVGGElement | null;
    if (!gfx) return null;

    const selector = element.type === 'label' ? '.djs-label text, .djs-visual text' : '.djs-visual text, .djs-label text';
    const textNode = gfx.querySelector<SVGTextElement>(selector);
    if (!textNode) return null;

    return { gfx, textNode };
  }, []);

  const getElementText = useCallback((element: any) => {
    if (typeof element?.businessObject?.name === 'string') {
      return element.businessObject.name.trim();
    }

    if (typeof element?.labelTarget?.businessObject?.name === 'string') {
      return element.labelTarget.businessObject.name.trim();
    }

    return '';
  }, []);

  const getLabelBox = useCallback((element: any) => {
    const width = Math.max((element?.width || 120) - LABEL_SIDE_PADDING, 24);
    const height = Math.max((element?.height || 54) - LABEL_TOP_PADDING, 18);
    const centerX = (element?.width || 120) / 2;
    const centerY = (element?.height || 54) / 2;

    if (element.type === 'label') {
      return {
        width: Math.max(element.width || 120, 36),
        height: Math.max(element.height || 36, 18),
        centerX: (element.width || 120) / 2,
        centerY: (element.height || 36) / 2,
      };
    }

    const bo = element?.businessObject;
    if (bo && (is(bo, 'bpmn:StartEvent') || is(bo, 'bpmn:EndEvent'))) {
      return {
        width: Math.max((element.width || 36) * 0.7, 20),
        height: Math.max((element.height || 36) * 0.7, 20),
        centerX,
        centerY,
      };
    }

    if (bo && is(bo, 'bpmn:ExclusiveGateway')) {
      return {
        width: Math.max((element.width || 50) * 0.64, 24),
        height: Math.max((element.height || 50) * 0.64, 24),
        centerX,
        centerY,
      };
    }

    return { width, height, centerX, centerY };
  }, []);

  const applyAutoFitLabel = useCallback((element: any, elementRegistry: any) => {
    if (!shouldAutoFitElementLabel(element)) return;

    const textValue = getElementText(element);
    if (!textValue) return;

    const labelTarget = getTextNodeForElement(element, elementRegistry);
    if (!labelTarget) return;

    const { textNode, gfx } = labelTarget;
    const labelBox = getLabelBox(element);
    const availableWidth = Math.max(labelBox.width, 24);

    let selectedFontSize = LABEL_FONT_MIN;
    let selectedLines = [textValue];
    let selectedLineHeight = LABEL_FONT_MIN * LABEL_LINE_HEIGHT;

    for (let fontSize = LABEL_FONT_MAX; fontSize >= LABEL_FONT_MIN; fontSize -= 1) {
      const lineHeight = fontSize * LABEL_LINE_HEIGHT;
      const maxLines = Math.max(1, Math.floor(labelBox.height / lineHeight));
      const lines = wrapText(textValue, availableWidth, maxLines, fontSize);
      const requiresTruncation = lines.some((line) => line.includes('...'));

      if (!requiresTruncation || fontSize === LABEL_FONT_MIN) {
        selectedFontSize = fontSize;
        selectedLines = lines;
        selectedLineHeight = lineHeight;
        if (!requiresTruncation) {
          break;
        }
      }
    }

    while (textNode.firstChild) {
      textNode.removeChild(textNode.firstChild);
    }

    textNode.classList.add('is-bpmn-fitted-text');
    textNode.setAttribute('font-size', `${selectedFontSize}`);
    textNode.setAttribute('text-anchor', 'middle');
    textNode.setAttribute('x', `${labelBox.centerX}`);
    textNode.setAttribute('y', `${labelBox.centerY}`);

    const firstLineOffset = -((selectedLines.length - 1) * selectedLineHeight) / 2;
    selectedLines.forEach((line, lineIndex) => {
      const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      tspan.textContent = line;
      tspan.setAttribute('x', `${labelBox.centerX}`);
      tspan.setAttribute('dy', `${lineIndex === 0 ? firstLineOffset : selectedLineHeight}`);
      textNode.appendChild(tspan);
    });

    if (element.type === 'label') {
      gfx.classList.add('is-sequenceflow-label');
    }
  }, [getElementText, getLabelBox, getTextNodeForElement, wrapText]);

  const applyLaneStriping = useCallback((elementRegistry: any) => {
    const lanes = elementRegistry
      .filter((element: any) => element?.businessObject && is(element.businessObject, 'bpmn:Lane'))
      .sort((a: any, b: any) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));

    const laneAltA = readCssVariable('--color-lane-alt-a', '#eaf6ff');
    const laneAltB = readCssVariable('--color-lane-alt-b', '#ffffff');

    lanes.forEach((lane: any, index: number) => {
      const gfx = elementRegistry.getGraphics(lane) as SVGGElement | null;
      const laneRect = gfx?.querySelector<SVGRectElement>('.djs-visual > rect');
      if (!laneRect) return;

      laneRect.setAttribute('fill', index % 2 === 0 ? laneAltA : laneAltB);
      laneRect.setAttribute('stroke', readCssVariable('--color-border', '#d0deea'));
      laneRect.setAttribute('stroke-width', '1.25');
      laneRect.setAttribute('fill-opacity', '1');
      gfx?.classList.add('lane-striped');
    });
  }, []);

  const refreshDiagramVisuals = useCallback(() => {
    const modeler = modelerRef.current;
    if (!modeler) return;

    const elementRegistry = modeler.get('elementRegistry') as {
      filter: (matcher: (element: any) => boolean) => any[];
      getGraphics: (element: any) => SVGGElement | null;
    };

    applyLaneStriping(elementRegistry);

    elementRegistry
      .filter((element: any) => shouldAutoFitElementLabel(element))
      .forEach((element: any) => applyAutoFitLabel(element, elementRegistry));
  }, [applyAutoFitLabel, applyLaneStriping]);

  const scheduleVisualRefresh = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (visualsRafRef.current !== null) return;

    visualsRafRef.current = window.requestAnimationFrame(() => {
      visualsRafRef.current = null;
      refreshDiagramVisuals();
    });
  }, [refreshDiagramVisuals]);

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
      const canvas = modeler.get('canvas') as {
        zoom: (level?: number | 'fit-viewport', position?: 'auto') => number | void;
      };
      canvas.zoom('fit-viewport', 'auto');
      scheduleVisualRefresh();
      scheduleTooltipTranslation();
      setErrors([]);
    } catch (err: any) {
      console.error('Erro ao importar BPMN:', err);
      setErrors(['Erro ao carregar diagrama BPMN']);
    }
  }, [scheduleTooltipTranslation, scheduleVisualRefresh]);

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

  const activateGlobalConnectTool = useCallback(() => {
    const modeler = modelerRef.current;
    if (!modeler) return;

    const paletteEntry = containerRef.current?.querySelector<HTMLElement>(
      '.djs-palette .entry[data-action=\"global-connect-tool\"]',
    );

    if (paletteEntry) {
      paletteEntry.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return;
    }

    const globalConnect = modeler.get('globalConnect') as {
      isActive: () => boolean;
      toggle: () => void;
    };

    if (!globalConnect.isActive()) {
      globalConnect.toggle();
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const modeler = new BpmnModeler({
      container: containerRef.current,
      keyboard: { bindTo: document },
      snapping: { active: true },
    });

    modelerRef.current = modeler;

    const eventBus = modeler.get('eventBus') as {
      on: (event: string, listener: (event: any) => void) => void;
      off: (event: string, listener: (event: any) => void) => void;
    };
    const handleElementClick = ({ element }: any) => setSelectedElement(element);
    const handleCanvasClick = () => setSelectedElement(null);
    const handleToolUpdate = () => scheduleTooltipTranslation();
    const handleDiagramUpdate = () => scheduleVisualRefresh();
    const keepConnectModeActive = () => {
      if (!connectModeRef.current) return;

      const globalConnect = modeler.get('globalConnect') as {
        isActive: () => boolean;
        toggle: () => void;
      };

      if (!globalConnect.isActive()) {
        setTimeout(() => {
          if (connectModeRef.current && !globalConnect.isActive()) {
            activateGlobalConnectTool();
          }
        }, 0);
      }
    };

    eventBus.on('element.click', handleElementClick);
    eventBus.on('canvas.click', handleCanvasClick);
    eventBus.on('tool-manager.update', handleToolUpdate);
    eventBus.on('shape.added', handleDiagramUpdate);
    eventBus.on('shape.changed', handleDiagramUpdate);
    eventBus.on('shape.removed', handleDiagramUpdate);
    eventBus.on('connection.added', handleDiagramUpdate);
    eventBus.on('connection.changed', handleDiagramUpdate);
    eventBus.on('connection.removed', handleDiagramUpdate);
    eventBus.on('element.changed', handleDiagramUpdate);
    eventBus.on('commandStack.changed', handleDiagramUpdate);
    eventBus.on('directEditing.complete', handleDiagramUpdate);
    eventBus.on('import.done', handleDiagramUpdate);
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
    scheduleVisualRefresh();
    setModelerReady(true);

    if (typeof document !== 'undefined') {
      themeObserverRef.current = new MutationObserver(() => {
        scheduleVisualRefresh();
      });

      themeObserverRef.current.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
      });
    }

    return () => {
      eventBus.off('element.click', handleElementClick);
      eventBus.off('canvas.click', handleCanvasClick);
      eventBus.off('tool-manager.update', handleToolUpdate);
      eventBus.off('shape.added', handleDiagramUpdate);
      eventBus.off('shape.changed', handleDiagramUpdate);
      eventBus.off('shape.removed', handleDiagramUpdate);
      eventBus.off('connection.added', handleDiagramUpdate);
      eventBus.off('connection.changed', handleDiagramUpdate);
      eventBus.off('connection.removed', handleDiagramUpdate);
      eventBus.off('element.changed', handleDiagramUpdate);
      eventBus.off('commandStack.changed', handleDiagramUpdate);
      eventBus.off('directEditing.complete', handleDiagramUpdate);
      eventBus.off('import.done', handleDiagramUpdate);
      eventBus.off('connect.ended', keepConnectModeActive);
      eventBus.off('connect.canceled', keepConnectModeActive);
      tooltipObserverRef.current?.disconnect();
      tooltipObserverRef.current = null;
      themeObserverRef.current?.disconnect();
      themeObserverRef.current = null;
      if (tooltipRafRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(tooltipRafRef.current);
        tooltipRafRef.current = null;
      }
      if (visualsRafRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(visualsRafRef.current);
        visualsRafRef.current = null;
      }
      setModelerReady(false);
      modeler.destroy();
      modelerRef.current = null;
    };
  }, [activateGlobalConnectTool, scheduleTooltipTranslation, scheduleVisualRefresh]);

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
    const toolManager = modelerRef.current.get('toolManager') as {
      setActive: (tool: string | null) => void;
    };

    if (connectMode && !globalConnect.isActive()) {
      activateGlobalConnectTool();
    }

    if (!connectMode && globalConnect.isActive()) {
      toolManager.setActive(null);
      globalConnect.toggle();
    }
  }, [activateGlobalConnectTool, connectMode, modelerReady]);

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

  const getCanvasApi = () => {
    const modeler = getActiveModeler();
    return modeler.get('canvas') as {
      zoom: (value?: number | 'fit-viewport', center?: 'auto') => number | void;
    };
  };

  const handleFitViewport = () => {
    try {
      const canvas = getCanvasApi();
      canvas.zoom('fit-viewport', 'auto');
      scheduleVisualRefresh();
    } catch (err: any) {
      setErrors([`Erro ao ajustar à tela: ${err.message}`]);
    }
  };

  const handleZoomBy = (direction: 1 | -1) => {
    try {
      const canvas = getCanvasApi();
      const currentZoom = canvas.zoom();
      const current = typeof currentZoom === 'number' ? currentZoom : 1;
      const next = clamp(current + (ZOOM_STEP * direction), ZOOM_MIN, ZOOM_MAX);
      canvas.zoom(next, 'auto');
    } catch (err: any) {
      setErrors([`Erro ao aplicar zoom: ${err.message}`]);
    }
  };

  const handleCenterViewport = () => {
    try {
      const canvas = getCanvasApi();
      const currentZoom = canvas.zoom();
      const current = typeof currentZoom === 'number' ? currentZoom : 1;
      canvas.zoom(current, 'auto');
    } catch (err: any) {
      setErrors([`Erro ao centralizar: ${err.message}`]);
    }
  };

  return (
    <div className="bpmn-editor-layout flex h-full min-h-0 min-w-0 gap-4">
      <div className="bpmn-editor-main flex-1 flex flex-col min-h-0 min-w-0">
        {showOnboarding && (
          <div className="message message-info mb-4">
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
                className="btn btn-primary btn-small"
              >
                Entendi
              </button>
            </div>
          </div>
        )}

        {errors.length > 0 && (
          <div className="message message-error mb-4">
            {errors.map((err, i) => (
              <div key={i}>{err}</div>
            ))}
          </div>
        )}

        <div className="bpmn-editor-actions flex gap-2 mb-4">
          <button
            type="button"
            onClick={handleFitViewport}
            title="Ajustar diagrama à área visível"
            aria-label="Ajustar diagrama à área visível"
            data-tooltip="Ajustar diagrama à área visível"
            className="tooltip-trigger btn btn-secondary"
          >
            Ajustar à tela
          </button>
          <button
            type="button"
            onClick={() => handleZoomBy(1)}
            title="Aumentar zoom do diagrama"
            aria-label="Aumentar zoom do diagrama"
            data-tooltip="Aumentar zoom do diagrama"
            className="tooltip-trigger btn btn-ghost"
          >
            Zoom +
          </button>
          <button
            type="button"
            onClick={() => handleZoomBy(-1)}
            title="Reduzir zoom do diagrama"
            aria-label="Reduzir zoom do diagrama"
            data-tooltip="Reduzir zoom do diagrama"
            className="tooltip-trigger btn btn-ghost"
          >
            Zoom -
          </button>
          <button
            type="button"
            onClick={handleCenterViewport}
            title="Centralizar diagrama na viewport"
            aria-label="Centralizar diagrama na viewport"
            data-tooltip="Centralizar diagrama na viewport"
            className="tooltip-trigger btn btn-secondary"
          >
            Centralizar
          </button>
          <button
            onClick={handleSave}
            disabled={readOnly}
            title="Salvar a versão atual do processo"
            aria-label="Salvar a versão atual do processo"
            data-tooltip="Salvar a versão atual do processo"
            className="tooltip-trigger btn btn-primary"
          >
            Salvar
          </button>
          <button
            onClick={handleExportXml}
            title="Exportar BPMN em XML"
            aria-label="Exportar BPMN em XML"
            data-tooltip="Exportar BPMN em XML"
            className="tooltip-trigger btn btn-secondary"
          >
            Exportar XML
          </button>
          <button
            onClick={handleExportSvg}
            title="Exportar diagrama em SVG"
            aria-label="Exportar diagrama em SVG"
            data-tooltip="Exportar diagrama em SVG"
            className="tooltip-trigger btn btn-ghost"
          >
            Exportar SVG
          </button>
        </div>

        <div
          ref={containerRef}
          className="bpmn-container flex-1 min-h-0 min-w-0 w-full h-full overflow-hidden border border-gray-300 rounded bg-white"
        />
      </div>

      {selectedElement && (
        <aside className="properties-panel-shell">
          <BpmnPropertiesPanel
            element={selectedElement}
            modeler={modelerRef.current}
            onUpdate={() => setSelectedElement(null)}
          />
        </aside>
      )}
    </div>
  );
};
