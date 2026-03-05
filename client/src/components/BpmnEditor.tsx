import React, { useCallback, useEffect, useRef, useState } from 'react';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import ELK from 'elkjs/lib/elk.bundled.js';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';
import { BpmnPropertiesPanel } from './BpmnPropertiesPanel';

interface BpmnEditorProps {
  bpmnXml?: string;
  onSave?: (bpmnContent: Record<string, any>, svgContent: string) => void;
  readOnly?: boolean;
  connectMode?: boolean;
  onFocusModeChange?: (enabled: boolean) => void;
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
const QUALITY_THRESHOLD = 80;
const AUTO_LAYOUT_MIN_COLUMN_GAP = 170;
const AUTO_LAYOUT_MAX_COLUMN_GAP = 250;
const AUTO_LAYOUT_ROW_GAP = 130;
const AUTO_LAYOUT_LANE_VERTICAL_PADDING = 50;

interface BoundsBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface QualityMetrics {
  shapeOverlaps: number;
  labelOverlaps: number;
  labelShapeOverlaps: number;
  edgeShapeCrossings: number;
  edgeEdgeCrossings: number;
  emptyLanes: number;
}

interface QualityReport {
  score: number;
  threshold: number;
  metrics: QualityMetrics;
  emptyLaneElementIds: string[];
  issues: string[];
  warnings: string[];
}

interface PngExportOptions {
  width: number;
  height: number;
  qualityScale: number;
  fileName: string;
}

const toBoundsBox = (element: { x: number; y: number; width: number; height: number }): BoundsBox => ({
  left: element.x,
  top: element.y,
  right: element.x + element.width,
  bottom: element.y + element.height,
});

const boundsOverlap = (a: BoundsBox, b: BoundsBox, gap = 0): boolean =>
  !(a.right <= b.left + gap || b.right <= a.left + gap || a.bottom <= b.top + gap || b.bottom <= a.top + gap);

const pointInBounds = (point: { x: number; y: number }, bounds: BoundsBox): boolean =>
  point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;

const orientation = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) =>
  (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);

const isOnSegment = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) =>
  Math.min(a.x, c.x) <= b.x &&
  b.x <= Math.max(a.x, c.x) &&
  Math.min(a.y, c.y) <= b.y &&
  b.y <= Math.max(a.y, c.y);

const segmentsIntersect = (
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
) => {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);

  if (o1 === 0 && isOnSegment(a1, b1, a2)) return true;
  if (o2 === 0 && isOnSegment(a1, b2, a2)) return true;
  if (o3 === 0 && isOnSegment(b1, a1, b2)) return true;
  if (o4 === 0 && isOnSegment(b1, a2, b2)) return true;

  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
};

const segmentIntersectsBounds = (
  start: { x: number; y: number },
  end: { x: number; y: number },
  bounds: BoundsBox,
) => {
  if (pointInBounds(start, bounds) || pointInBounds(end, bounds)) {
    return true;
  }

  const topLeft = { x: bounds.left, y: bounds.top };
  const topRight = { x: bounds.right, y: bounds.top };
  const bottomRight = { x: bounds.right, y: bounds.bottom };
  const bottomLeft = { x: bounds.left, y: bounds.bottom };

  return (
    segmentsIntersect(start, end, topLeft, topRight) ||
    segmentsIntersect(start, end, topRight, bottomRight) ||
    segmentsIntersect(start, end, bottomRight, bottomLeft) ||
    segmentsIntersect(start, end, bottomLeft, topLeft)
  );
};

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
  onFocusModeChange,
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
  const [qualityReport, setQualityReport] = useState<QualityReport | null>(null);
  const [qualityDetailsOpen, setQualityDetailsOpen] = useState(false);
  const [laneCleanupUndoSteps, setLaneCleanupUndoSteps] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const [focusPropertiesOpen, setFocusPropertiesOpen] = useState(false);

  useEffect(() => {
    onFocusModeChange?.(focusMode);
  }, [focusMode, onFocusModeChange]);

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
    const textNodes = Array.from(gfx.querySelectorAll<SVGTextElement>(selector));
    if (textNodes.length === 0) return null;

    const [textNode, ...duplicates] = textNodes;
    duplicates.forEach((duplicateNode) => {
      duplicateNode.parentNode?.removeChild(duplicateNode);
    });

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

    if (
      bo &&
      (is(bo, 'bpmn:UserTask') || is(bo, 'bpmn:ServiceTask') || is(bo, 'bpmn:BusinessRuleTask'))
    ) {
      return {
        width: Math.max((element.width || 130) - 18, 24),
        height: Math.max((element.height || 88) - 30, 28),
        centerX,
        centerY: centerY + 4,
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
      // Lane label styling is handled purely via CSS (`.lane-striped` class)
      // Do NOT manipulate text nodes here — bpmn-js re-renders them on
      // zoom/import/resize and any DOM patches get lost or cause overlap.
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

  useEffect(() => {
    if (!modelerReady || !modelerRef.current) return;

    if (focusMode) {
      const canvas = modelerRef.current.get('canvas') as {
        zoom: (value?: number | 'fit-viewport', center?: 'auto') => number | void;
      };
      canvas.zoom('fit-viewport', 'auto');
      scheduleVisualRefresh();
    }
  }, [focusMode, modelerReady, scheduleVisualRefresh]);

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

  const rerouteAiDraftConnections = useCallback(() => {
    const modeler = modelerRef.current;
    if (!modeler) return;

    const elementRegistry = modeler.get('elementRegistry') as {
      filter: (matcher: (element: any) => boolean) => any[];
    };
    const layouter = modeler.get('layouter') as {
      layoutConnection: (connection: any, hints?: Record<string, any>) => Array<{ x: number; y: number }>;
    };
    const modeling = modeler.get('modeling') as {
      updateWaypoints: (connection: any, waypoints: Array<{ x: number; y: number }>) => void;
    };

    const sequenceConnections = elementRegistry.filter(
      (element: any) =>
        element?.waypoints &&
        element?.businessObject &&
        is(element.businessObject, 'bpmn:SequenceFlow'),
    );

    // Sort connections: short/same-lane first, long/cross-lane last.
    // This gives the bpmn-js layouter better results since shorter paths
    // are laid out first and won't be displaced by longer ones.
    const sorted = [...sequenceConnections].sort((a: any, b: any) => {
      const aDist = Math.abs((a.target?.x ?? 0) - (a.source?.x ?? 0)) +
                    Math.abs((a.target?.y ?? 0) - (a.source?.y ?? 0));
      const bDist = Math.abs((b.target?.x ?? 0) - (b.source?.x ?? 0)) +
                    Math.abs((b.target?.y ?? 0) - (b.source?.y ?? 0));
      return aDist - bDist;
    });

    sorted.forEach((connection: any) => {
      try {
        const waypoints = layouter.layoutConnection(connection, {
          connectionStart: connection.source,
          connectionEnd: connection.target,
        });

        if (Array.isArray(waypoints) && waypoints.length >= 2) {
          // Force orthogonal routing: if any segment is diagonal (neither
          // horizontal nor vertical), convert it to an L-shaped path by
          // inserting a midpoint so every segment is axis-aligned.
          const ortho: Array<{ x: number; y: number }> = [waypoints[0]];
          for (let i = 1; i < waypoints.length; i++) {
            const prev = ortho[ortho.length - 1];
            const curr = waypoints[i];
            const dx = Math.abs(curr.x - prev.x);
            const dy = Math.abs(curr.y - prev.y);
            // A segment is "diagonal" when it has meaningful movement on both axes
            if (dx > 1 && dy > 1) {
              // Insert an L-shaped bend: go horizontal first, then vertical
              ortho.push({ x: curr.x, y: prev.y });
            }
            ortho.push(curr);
          }
          modeling.updateWaypoints(connection, ortho);
        }
      } catch (error) {
        console.warn('Falha ao recalcular rota de fluxo:', error);
      }
    });
  }, []);

  const importDiagram = useCallback(async (xml: string) => {
    const modeler = modelerRef.current;
    if (!modeler) return;

    try {
      await modeler.importXML(xml);

      // Clear participant (pool) label — the pool header should be empty;
      // the process name lives in <bpmn:process name="...">
      const elementRegistry = modeler.get('elementRegistry') as {
        filter: (matcher: (element: any) => boolean) => any[];
      };
      const modeling = modeler.get('modeling') as {
        updateProperties: (element: any, properties: Record<string, any>) => void;
      };
      elementRegistry
        .filter((el: any) => el?.businessObject && is(el.businessObject, 'bpmn:Participant'))
        .forEach((el: any) => {
          if (el.businessObject.name) {
            modeling.updateProperties(el, { name: '' });
          }
        });

      const isAiDraftExporter = xml.includes('exporter="tottal-bpm-ai"');
      const hasDiagramEdges = xml.includes('<bpmndi:BPMNEdge');
      if (isAiDraftExporter && !hasDiagramEdges) {
        rerouteAiDraftConnections();
      }
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
  }, [rerouteAiDraftConnections, scheduleTooltipTranslation, scheduleVisualRefresh]);

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

  const calculateQualityReport = useCallback((): QualityReport => {
    const modeler = getActiveModeler();
    const elementRegistry = modeler.get('elementRegistry') as {
      filter: (matcher: (element: any) => boolean) => any[];
    };

    const allElements = elementRegistry.filter(() => true);
    const sequenceConnections = allElements.filter(
      (element) => element?.businessObject && element?.waypoints && is(element.businessObject, 'bpmn:SequenceFlow'),
    );
    const laneElements = allElements.filter(
      (element) => element?.businessObject && is(element.businessObject, 'bpmn:Lane'),
    );
    const emptyLaneElements = laneElements.filter((lane) => {
      const flowNodeRef = lane?.businessObject?.flowNodeRef;
      return !Array.isArray(flowNodeRef) || flowNodeRef.length === 0;
    });

    const shapeElements = allElements.filter((element) => {
      if (!element?.businessObject || element?.waypoints) return false;
      if (element.type === 'label') return false;
      if (is(element.businessObject, 'bpmn:Lane') || is(element.businessObject, 'bpmn:Participant')) return false;
      return Number.isFinite(element.width) && Number.isFinite(element.height) && element.width > 0 && element.height > 0;
    });

    const labelElements = allElements.filter((element) => {
      if (element.type !== 'label') return false;
      return Number.isFinite(element.width) && Number.isFinite(element.height) && element.width > 6 && element.height > 6;
    });

    const shapeBounds = new Map<string, BoundsBox>(
      shapeElements.map((shape) => [shape.id, toBoundsBox(shape)]),
    );
    const labelBounds = new Map<string, BoundsBox>(
      labelElements.map((label) => [label.id, toBoundsBox(label)]),
    );

    let shapeOverlaps = 0;
    for (let i = 0; i < shapeElements.length; i += 1) {
      for (let j = i + 1; j < shapeElements.length; j += 1) {
        if (boundsOverlap(shapeBounds.get(shapeElements[i].id)!, shapeBounds.get(shapeElements[j].id)!, 1)) {
          shapeOverlaps += 1;
        }
      }
    }

    let labelOverlaps = 0;
    for (let i = 0; i < labelElements.length; i += 1) {
      for (let j = i + 1; j < labelElements.length; j += 1) {
        if (boundsOverlap(labelBounds.get(labelElements[i].id)!, labelBounds.get(labelElements[j].id)!, 1)) {
          labelOverlaps += 1;
        }
      }
    }

    let labelShapeOverlaps = 0;
    labelElements.forEach((label) => {
      const currentLabelBounds = labelBounds.get(label.id)!;
      const overlapsAnyShape = shapeElements.some((shape) => {
        const shapeId = shape.id;
        if (label.labelTarget?.id && label.labelTarget.id === shapeId) {
          return false;
        }
        return boundsOverlap(currentLabelBounds, shapeBounds.get(shapeId)!, 1);
      });

      if (overlapsAnyShape) {
        labelShapeOverlaps += 1;
      }
    });

    let edgeShapeCrossings = 0;
    sequenceConnections.forEach((connection) => {
      const sourceId = connection.source?.id;
      const targetId = connection.target?.id;
      const points = Array.isArray(connection.waypoints) ? connection.waypoints : [];
      if (points.length < 2) return;

      for (const shape of shapeElements) {
        if (shape.id === sourceId || shape.id === targetId) continue;
        const bounds = shapeBounds.get(shape.id)!;
        let intersects = false;
        for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
          if (segmentIntersectsBounds(points[pointIndex], points[pointIndex + 1], bounds)) {
            intersects = true;
            break;
          }
        }
        if (intersects) {
          edgeShapeCrossings += 1;
        }
      }
    });

    let edgeEdgeCrossings = 0;
    for (let i = 0; i < sequenceConnections.length; i += 1) {
      const first = sequenceConnections[i];
      const firstPoints = Array.isArray(first.waypoints) ? first.waypoints : [];
      if (firstPoints.length < 2) continue;

      for (let j = i + 1; j < sequenceConnections.length; j += 1) {
        const second = sequenceConnections[j];
        if (
          first.source?.id === second.source?.id ||
          first.source?.id === second.target?.id ||
          first.target?.id === second.source?.id ||
          first.target?.id === second.target?.id
        ) {
          continue;
        }

        const secondPoints = Array.isArray(second.waypoints) ? second.waypoints : [];
        if (secondPoints.length < 2) continue;

        let hasCrossing = false;
        for (let firstIndex = 0; firstIndex < firstPoints.length - 1 && !hasCrossing; firstIndex += 1) {
          for (let secondIndex = 0; secondIndex < secondPoints.length - 1; secondIndex += 1) {
            if (
              segmentsIntersect(
                firstPoints[firstIndex],
                firstPoints[firstIndex + 1],
                secondPoints[secondIndex],
                secondPoints[secondIndex + 1],
              )
            ) {
              hasCrossing = true;
              break;
            }
          }
        }

        if (hasCrossing) {
          edgeEdgeCrossings += 1;
        }
      }
    }

    const metrics: QualityMetrics = {
      shapeOverlaps,
      labelOverlaps,
      labelShapeOverlaps,
      edgeShapeCrossings,
      edgeEdgeCrossings,
      emptyLanes: emptyLaneElements.length,
    };

    const rawScore =
      100 -
      metrics.shapeOverlaps * 18 -
      metrics.labelOverlaps * 12 -
      metrics.labelShapeOverlaps * 9 -
      metrics.edgeShapeCrossings * 10 -
      Math.min(metrics.edgeEdgeCrossings, 18) * 2 -
      metrics.emptyLanes * 4;
    const score = clamp(Math.round(rawScore), 0, 100);

    const issues: string[] = [];
    const warnings: string[] = [];

    if (metrics.shapeOverlaps > 0) {
      issues.push(`${metrics.shapeOverlaps} sobreposição(ões) entre tarefas/eventos.`);
    }
    if (metrics.labelOverlaps > 0) {
      issues.push(`${metrics.labelOverlaps} colisão(ões) entre labels.`);
    }
    if (metrics.labelShapeOverlaps > 0) {
      issues.push(`${metrics.labelShapeOverlaps} label(s) sobrepondo nós de processo.`);
    }
    if (metrics.edgeShapeCrossings > 0) {
      issues.push(`${metrics.edgeShapeCrossings} conexão(ões) atravessando atividades.`);
    }
    if (metrics.edgeEdgeCrossings > 0) {
      warnings.push(`${metrics.edgeEdgeCrossings} cruzamento(s) entre conexões.`);
    }
    if (metrics.emptyLanes > 0) {
      warnings.push(`${metrics.emptyLanes} lane(s) vazia(s) detectada(s).`);
    }

    return {
      score,
      threshold: QUALITY_THRESHOLD,
      metrics,
      emptyLaneElementIds: emptyLaneElements.map((lane) => lane.id),
      issues,
      warnings,
    };
  }, []);

  const handleCheckQuality = useCallback(() => {
    try {
      const report = calculateQualityReport();
      setQualityReport(report);
      setQualityDetailsOpen(false);
      setErrors([]);
    } catch (err: any) {
      setErrors([`Erro ao avaliar qualidade: ${err.message}`]);
    }
  }, [calculateQualityReport]);

  const redistributeParticipantLanes = useCallback((participantIds: string[]): number => {
    if (participantIds.length === 0) {
      return 0;
    }

    const modeler = getActiveModeler();
    const elementRegistry = modeler.get('elementRegistry') as {
      get: (id: string) => any;
    };
    const modeling = modeler.get('modeling') as {
      resizeShape: (shape: any, bounds: { x: number; y: number; width: number; height: number }) => void;
    };

    let resizedLanes = 0;
    const uniqueParticipantIds = Array.from(new Set(participantIds));

    uniqueParticipantIds.forEach((participantId) => {
      const participant = elementRegistry.get(participantId);
      if (!participant?.businessObject || !is(participant.businessObject, 'bpmn:Participant')) {
        return;
      }

      const participantChildren = Array.isArray(participant.children) ? participant.children : [];
      const lanes = participantChildren
        .filter((child: any) => child?.businessObject && is(child.businessObject, 'bpmn:Lane'))
        .sort((a: any, b: any) => (a.y ?? 0) - (b.y ?? 0));

      if (lanes.length === 0) {
        return;
      }

      const participantHeight = Math.max(1, Math.round(participant.height || 0));
      const minLaneHeight = participantHeight <= lanes.length * 72
        ? Math.max(1, Math.floor(participantHeight / lanes.length))
        : 72;

      const lanePlans = lanes.map((lane: any) => {
        const laneChildren = Array.isArray(lane.children)
          ? lane.children.filter((child: any) => {
              if (!child || child.type === 'label' || child.waypoints) return false;
              if (!child.businessObject) return false;
              if (is(child.businessObject, 'bpmn:Lane') || is(child.businessObject, 'bpmn:Participant')) return false;
              return Number.isFinite(child.width) && Number.isFinite(child.height);
            })
          : [];

        const contentWeight = Math.max(1, laneChildren.length);
        const defaultRequired = 110;

        if (laneChildren.length === 0) {
          return {
            lane,
            weight: contentWeight,
            requiredHeight: Math.max(minLaneHeight, defaultRequired),
          };
        }

        const contentTop = Math.min(...laneChildren.map((child: any) => child.y));
        const contentBottom = Math.max(...laneChildren.map((child: any) => child.y + child.height));
        const contentHeight = Math.max(0, contentBottom - contentTop);
        const requiredHeight = Math.max(minLaneHeight, Math.min(participantHeight, Math.round(contentHeight + 100)));

        return {
          lane,
          weight: contentWeight,
          requiredHeight,
        };
      });

      let targetHeights = lanePlans.map((plan) => plan.requiredHeight);
      const totalRequired = targetHeights.reduce((sum, value) => sum + value, 0);

      if (totalRequired > participantHeight) {
        const scale = participantHeight / totalRequired;
        targetHeights = targetHeights.map((height) => Math.max(minLaneHeight, Math.floor(height * scale)));

        let overflow = targetHeights.reduce((sum, value) => sum + value, 0) - participantHeight;
        while (overflow > 0) {
          let changed = false;
          for (let index = 0; index < targetHeights.length && overflow > 0; index += 1) {
            if (targetHeights[index] <= minLaneHeight) {
              continue;
            }
            targetHeights[index] -= 1;
            overflow -= 1;
            changed = true;
          }
          if (!changed) {
            break;
          }
        }

        if (overflow > 0) {
          const base = Math.max(1, Math.floor(participantHeight / targetHeights.length));
          targetHeights = targetHeights.map((_value, index) =>
            index === targetHeights.length - 1
              ? Math.max(1, participantHeight - base * (targetHeights.length - 1))
              : base);
        }
      } else if (totalRequired < participantHeight) {
        const freeHeight = participantHeight - totalRequired;
        const totalWeight = lanePlans.reduce((sum, plan) => sum + plan.weight, 0) || lanePlans.length;
        targetHeights = targetHeights.map((height, index) =>
          height + Math.floor((freeHeight * lanePlans[index].weight) / totalWeight));

        let remainder = participantHeight - targetHeights.reduce((sum, value) => sum + value, 0);
        let cursor = 0;
        while (remainder > 0) {
          targetHeights[cursor % targetHeights.length] += 1;
          remainder -= 1;
          cursor += 1;
        }
      }

      let nextLaneY = participant.y;
      lanePlans.forEach((plan, index) => {
        const laneShape = plan.lane;
        const targetHeight = Math.max(1, targetHeights[index]);
        const targetBounds = {
          x: laneShape.x,
          y: nextLaneY,
          width: laneShape.width,
          height: targetHeight,
        };

        const moved = Math.abs((laneShape.y ?? 0) - nextLaneY) > 0.5;
        const resized = Math.abs((laneShape.height ?? 0) - targetHeight) > 0.5;

        if (moved || resized) {
          modeling.resizeShape(laneShape, targetBounds);
          resizedLanes += 1;
        }
        nextLaneY += targetHeight;
      });
    });

    return resizedLanes;
  }, []);

  const handleCleanEmptyLanes = useCallback(() => {
    try {
      const report = qualityReport || calculateQualityReport();
      if (report.emptyLaneElementIds.length === 0) {
        setErrors(['Nenhuma lane vazia para limpar.']);
        return;
      }

      const modeler = getActiveModeler();
      const elementRegistry = modeler.get('elementRegistry') as {
        get: (id: string) => any;
      };
      const modeling = modeler.get('modeling') as {
        removeShape: (shape: any) => void;
      };

      const lanesToRemove = report.emptyLaneElementIds
        .map((laneId) => elementRegistry.get(laneId))
        .filter(Boolean)
        .sort((a, b) => (b.y ?? 0) - (a.y ?? 0));

      const participantIds = lanesToRemove
        .map((lane) => lane.parent?.id)
        .filter((participantId): participantId is string => typeof participantId === 'string' && participantId.length > 0);

      let removed = 0;
      lanesToRemove.forEach((lane) => {
        modeling.removeShape(lane);
        removed += 1;
      });

      const laneResizes = redistributeParticipantLanes(participantIds);
      setLaneCleanupUndoSteps(removed + laneResizes);
      scheduleVisualRefresh();
      const nextReport = calculateQualityReport();
      setQualityReport(nextReport);
      setQualityDetailsOpen(nextReport.emptyLaneElementIds.length > 0);
      setErrors([]);
    } catch (err: any) {
      setErrors([`Erro ao limpar lanes: ${err.message}`]);
    }
  }, [calculateQualityReport, qualityReport, redistributeParticipantLanes, scheduleVisualRefresh]);

  const handleUndoLaneCleanup = useCallback(() => {
    if (laneCleanupUndoSteps < 1) return;

    try {
      const modeler = getActiveModeler();
      const commandStack = modeler.get('commandStack') as {
        canUndo: () => boolean;
        undo: () => void;
      };

      let undone = 0;
      while (undone < laneCleanupUndoSteps && commandStack.canUndo()) {
        commandStack.undo();
        undone += 1;
      }

      setLaneCleanupUndoSteps(0);
      scheduleVisualRefresh();
      const report = calculateQualityReport();
      setQualityReport(report);
      setQualityDetailsOpen(false);
      setErrors([]);
    } catch (err: any) {
      setErrors([`Erro ao desfazer limpeza de lanes: ${err.message}`]);
    }
  }, [calculateQualityReport, laneCleanupUndoSteps, scheduleVisualRefresh]);

  const handleAutoArrange = useCallback(() => {
    try {
      const modeler = getActiveModeler();
      const elementRegistry = modeler.get('elementRegistry') as {
        filter: (matcher: (element: any) => boolean) => any[];
        get: (id: string) => any;
      };
      const modeling = modeler.get('modeling') as {
        moveShape: (shape: any, delta: { x: number; y: number }, newParent?: any) => void;
        resizeShape: (shape: any, bounds: { x: number; y: number; width: number; height: number }) => void;
        updateProperties: (element: any, properties: Record<string, any>) => void;
      };
      const canvas = modeler.get('canvas') as {
        zoom: (value?: number | 'fit-viewport', center?: 'auto') => number | void;
      };

      const allElements = elementRegistry.filter(() => true);

      // Clear participant label if present (semantic fix for existing diagrams)
      allElements
        .filter((el) => el?.businessObject && is(el.businessObject, 'bpmn:Participant') && el.businessObject.name)
        .forEach((el) => modeling.updateProperties(el, { name: '' }));

      const participant = allElements.find(
        (element) =>
          element?.businessObject &&
          !element?.waypoints &&
          element.type !== 'label' &&
          is(element.businessObject, 'bpmn:Participant'),
      );

      let lanes = allElements
        .filter(
          (element) =>
            element?.businessObject &&
            !element?.waypoints &&
            element.type !== 'label' &&
            is(element.businessObject, 'bpmn:Lane'),
        )
        .sort((a, b) => (a.y ?? 0) - (b.y ?? 0));

      const flowNodes = allElements.filter((element) => {
        if (!element?.businessObject || element?.waypoints || element.type === 'label') return false;
        if (is(element.businessObject, 'bpmn:Participant') || is(element.businessObject, 'bpmn:Lane')) return false;

        return (
          is(element.businessObject, 'bpmn:StartEvent') ||
          is(element.businessObject, 'bpmn:EndEvent') ||
          is(element.businessObject, 'bpmn:Task') ||
          is(element.businessObject, 'bpmn:SubProcess') ||
          is(element.businessObject, 'bpmn:CallActivity') ||
          is(element.businessObject, 'bpmn:Gateway')
        );
      });

      if (flowNodes.length < 2) {
        setErrors(['Layout automático: adicione mais elementos de processo para organizar.']);
        return;
      }

      const nodeById = new Map(flowNodes.map((node) => [node.id, node]));
      const originalOrder = new Map(flowNodes.map((node, index) => [node.id, index]));
      const nodeIds = new Set(flowNodes.map((node) => node.id));

      const sequenceConnections = allElements.filter(
        (element) =>
          element?.waypoints &&
          element?.businessObject &&
          is(element.businessObject, 'bpmn:SequenceFlow'),
      );

      const outgoingByNode = new Map<string, string[]>();
      const incomingByNode = new Map<string, string[]>();
      const indegree = new Map<string, number>();
      flowNodes.forEach((node) => indegree.set(node.id, 0));

      sequenceConnections.forEach((connection) => {
        const sourceId = connection.source?.id;
        const targetId = connection.target?.id;
        if (!sourceId || !targetId || !nodeIds.has(sourceId) || !nodeIds.has(targetId)) {
          return;
        }

        const outgoing = outgoingByNode.get(sourceId) || [];
        outgoing.push(targetId);
        outgoingByNode.set(sourceId, outgoing);

        const incoming = incomingByNode.get(targetId) || [];
        incoming.push(sourceId);
        incomingByNode.set(targetId, incoming);

        indegree.set(targetId, (indegree.get(targetId) || 0) + 1);
      });

      const rankByNodeId = new Map<string, number>();
      flowNodes.forEach((node) => rankByNodeId.set(node.id, 0));

      const queue = flowNodes
        .filter((node) => (indegree.get(node.id) || 0) === 0)
        .sort((a, b) => (a.x ?? 0) - (b.x ?? 0) || (a.y ?? 0) - (b.y ?? 0));

      const processed = new Set<string>();
      while (queue.length > 0) {
        const node = queue.shift()!;
        if (processed.has(node.id)) {
          continue;
        }
        processed.add(node.id);

        const sourceRank = rankByNodeId.get(node.id) || 0;
        const targets = outgoingByNode.get(node.id) || [];
        targets.forEach((targetId) => {
          rankByNodeId.set(targetId, Math.max(rankByNodeId.get(targetId) || 0, sourceRank + 1));
          const nextIndegree = (indegree.get(targetId) || 0) - 1;
          indegree.set(targetId, nextIndegree);
          if (nextIndegree <= 0) {
            const targetNode = nodeById.get(targetId);
            if (targetNode) {
              queue.push(targetNode);
              queue.sort((a, b) => (a.x ?? 0) - (b.x ?? 0) || (a.y ?? 0) - (b.y ?? 0));
            }
          }
        });
      }

      const unresolved = flowNodes
        .filter((node) => !processed.has(node.id))
        .sort((a, b) => (a.x ?? 0) - (b.x ?? 0) || (a.y ?? 0) - (b.y ?? 0));

      unresolved.forEach((node) => {
        const incoming = incomingByNode.get(node.id) || [];
        const fallbackRank = incoming.length > 0
          ? Math.max(...incoming.map((sourceId) => rankByNodeId.get(sourceId) || 0)) + 1
          : 0;
        rankByNodeId.set(node.id, Math.max(rankByNodeId.get(node.id) || 0, fallbackRank));
      });

      // --- De-stacking pass: spread nodes that share the same (lane, rank) ---
      // When more than 2 nodes land in the same lane at the same rank they
      // would stack vertically.  Keep the first 2 and push excess nodes to
      // the next rank, shifting all downstream nodes so ordering is preserved.
      {
        // Build a temporary lane lookup (parent-based) so we can group before
        // the full laneByNodeId map is constructed below.
        const tempLane = (node: any): string => {
          if (node.parent?.businessObject && is(node.parent.businessObject, 'bpmn:Lane')) {
            return node.parent.id;
          }
          if (lanes.length > 0) {
            const centerY = (node.y || 0) + ((node.height || 0) / 2);
            const containing = lanes.find(
              (lane) => centerY >= lane.y && centerY <= lane.y + lane.height,
            );
            return containing?.id || lanes[0]?.id || '__default__';
          }
          return '__default__';
        };

        // Group node-ids by (lane, rank)
        const lrGroups = new Map<string, string[]>();
        flowNodes.forEach((node) => {
          const key = `${tempLane(node)}__${rankByNodeId.get(node.id) || 0}`;
          const list = lrGroups.get(key) || [];
          list.push(node.id);
          lrGroups.set(key, list);
        });

        // For every group that exceeds 2 nodes, push excess to rank+1.
        // We may need to iterate because pushing nodes can create new
        // over-crowded groups — but a single pass is usually sufficient.
        const MAX_PER_RANK = 2;
        let changed = true;
        let safety = 0;
        while (changed && safety < 20) {
          changed = false;
          safety++;

          // Rebuild groups each iteration
          lrGroups.clear();
          flowNodes.forEach((node) => {
            const key = `${tempLane(node)}__${rankByNodeId.get(node.id) || 0}`;
            const list = lrGroups.get(key) || [];
            list.push(node.id);
            lrGroups.set(key, list);
          });

          lrGroups.forEach((ids, groupKey) => {
            if (ids.length <= MAX_PER_RANK) return;

            // Sort by original order so first-encountered nodes stay put
            ids.sort(
              (a, b) => (originalOrder.get(a) || 0) - (originalOrder.get(b) || 0),
            );

            const currentRank = rankByNodeId.get(ids[0]) || 0;
            const excess = ids.slice(MAX_PER_RANK);

            excess.forEach((id) => {
              const newRank = currentRank + 1;
              rankByNodeId.set(id, newRank);

              // Shift all direct downstream nodes so they stay ahead
              const shiftDownstream = (sourceId: string, minRank: number) => {
                const targets = outgoingByNode.get(sourceId) || [];
                targets.forEach((tid) => {
                  const tRank = rankByNodeId.get(tid) || 0;
                  if (tRank <= minRank) {
                    rankByNodeId.set(tid, minRank + 1);
                    shiftDownstream(tid, minRank + 1);
                  }
                });
              };
              shiftDownstream(id, newRank);

              changed = true;
            });
          });
        }
      }

      const laneByNodeId = new Map<string, any>();
      const resolveLaneForNode = (node: any) => {
        if (node.parent?.businessObject && is(node.parent.businessObject, 'bpmn:Lane')) {
          return node.parent;
        }

        if (lanes.length === 0) {
          return null;
        }

        const centerY = (node.y || 0) + ((node.height || 0) / 2);
        const containingLane = lanes.find((lane) => centerY >= lane.y && centerY <= lane.y + lane.height);
        return containingLane || lanes[0];
      };

      flowNodes.forEach((node) => {
        laneByNodeId.set(node.id, resolveLaneForNode(node));
      });

      const maxRank = Math.max(...Array.from(rankByNodeId.values()), 0);
      const maxNodeWidth = Math.max(...flowNodes.map((node) => node.width || 120), 120);

      const getHorizontalBounds = () => {
        if (lanes.length > 0) {
          const left = Math.min(...lanes.map((lane) => lane.x));
          const right = Math.max(...lanes.map((lane) => lane.x + lane.width));
          return { left: left + 28, right: right - 28 };
        }

        const minX = Math.min(...flowNodes.map((node) => node.x || 0));
        const maxX = Math.max(...flowNodes.map((node) => (node.x || 0) + (node.width || 0)));
        return { left: minX + 20, right: maxX + 220 };
      };

      let horizontal = getHorizontalBounds();
      const columns = Math.max(maxRank + 1, 1);
      const estimatedGap = columns > 1
        ? Math.floor((horizontal.right - horizontal.left - maxNodeWidth - 24) / Math.max(columns - 1, 1))
        : AUTO_LAYOUT_MAX_COLUMN_GAP;
      let columnGap = clamp(estimatedGap, AUTO_LAYOUT_MIN_COLUMN_GAP, AUTO_LAYOUT_MAX_COLUMN_GAP);

      const neededWidth = maxNodeWidth + ((columns - 1) * columnGap) + 40;
      const availableWidth = horizontal.right - horizontal.left;
      if (participant && neededWidth > availableWidth) {
        const extraWidth = neededWidth - availableWidth + 40;
        modeling.resizeShape(participant, {
          x: participant.x,
          y: participant.y,
          width: participant.width + extraWidth,
          height: participant.height,
        });

        lanes = lanes.map((lane) => elementRegistry.get(lane.id)).filter(Boolean);
        horizontal = getHorizontalBounds();

        const recalcGap = columns > 1
          ? Math.floor((horizontal.right - horizontal.left - maxNodeWidth - 24) / Math.max(columns - 1, 1))
          : AUTO_LAYOUT_MAX_COLUMN_GAP;
        columnGap = clamp(recalcGap, AUTO_LAYOUT_MIN_COLUMN_GAP, AUTO_LAYOUT_MAX_COLUMN_GAP);
      }

      // --- Group nodes by (laneId + rank) for proper vertical distribution ---
      const laneRankGroups = new Map<string, any[]>();
      const fallbackLane = lanes[0] || null;

      flowNodes.forEach((node) => {
        const lane = laneByNodeId.get(node.id) || fallbackLane;
        const laneKey = lane?.id || '__default__';
        const rank = rankByNodeId.get(node.id) || 0;
        const groupKey = `${laneKey}__${rank}`;
        const list = laneRankGroups.get(groupKey) || [];
        list.push(node);
        laneRankGroups.set(groupKey, list);
      });

      // Calculate max rows per lane (to know minimum lane height needed)
      const laneMaxRows = new Map<string, number>();
      laneRankGroups.forEach((nodes, groupKey) => {
        const laneKey = groupKey.split('__')[0];
        const current = laneMaxRows.get(laneKey) || 0;
        laneMaxRows.set(laneKey, Math.max(current, nodes.length));
      });

      // Pre-expand participant height if content won't fit
      if (participant) {
        const defaultNodeHeight = 80;
        const rowGapInner = 30;
        let totalMinHeight = 0;
        (lanes.length > 0 ? lanes : [null]).forEach((lane) => {
          const laneKey = lane?.id || '__default__';
          const maxRows = laneMaxRows.get(laneKey) || 1;
          totalMinHeight +=
            AUTO_LAYOUT_LANE_VERTICAL_PADDING * 2 +
            maxRows * defaultNodeHeight +
            Math.max(0, maxRows - 1) * rowGapInner;
        });
        if (totalMinHeight > participant.height) {
          modeling.resizeShape(participant, {
            x: participant.x,
            y: participant.y,
            width: participant.width,
            height: totalMinHeight + 60,
          });
          lanes = lanes.map((lane) => elementRegistry.get(lane.id)).filter(Boolean);
        }
      }

      // Position each node: vertically centered within its lane at its rank column
      flowNodes.forEach((node) => {
        const lane = laneByNodeId.get(node.id) || fallbackLane;
        const laneKey = lane?.id || '__default__';
        const rank = rankByNodeId.get(node.id) || 0;
        const groupKey = `${laneKey}__${rank}`;
        const sameRankNodes = (laneRankGroups.get(groupKey) || [node])
          .sort((a, b) =>
            (a.y ?? 0) - (b.y ?? 0) ||
            (originalOrder.get(a.id) || 0) - (originalOrder.get(b.id) || 0));

        const rowIndex = sameRankNodes.findIndex((n) => n.id === node.id);
        const laneTop = lane ? lane.y : (Math.min(...flowNodes.map((n) => n.y || 0)) - 20);
        const laneHeight = lane ? lane.height : 400;
        const nodeHeight = node.height || 80;
        const totalRows = sameRankNodes.length;
        const requiredSpace = totalRows * nodeHeight + Math.max(0, totalRows - 1) * 30;
        const startY = laneTop + Math.max(
          AUTO_LAYOUT_LANE_VERTICAL_PADDING,
          (laneHeight - requiredSpace) / 2,
        );

        const targetX = horizontal.left + (rank * columnGap);
        const targetY = startY + rowIndex * (nodeHeight + 30);
        const delta = {
          x: targetX - node.x,
          y: targetY - node.y,
        };

        if (Math.abs(delta.x) > 0.5 || Math.abs(delta.y) > 0.5) {
          modeling.moveShape(node, delta, lane || undefined);
        }
      });

      // Redistribute lane heights based on actual content
      if (participant) {
        redistributeParticipantLanes([participant.id]);
      }

      // Post-redistribution: validate ALL nodes are within their lane/pool bounds
      if (participant) {
        // Re-fetch participant and lanes after redistribution (bounds have changed)
        const freshParticipant = elementRegistry.get(participant.id);
        const updatedLanes = elementRegistry
          .filter((el: any) => el?.businessObject && is(el.businessObject, 'bpmn:Lane'))
          .sort((a: any, b: any) => (a.y ?? 0) - (b.y ?? 0));

        const poolTop = freshParticipant?.y ?? participant.y;
        const poolBottom = poolTop + (freshParticipant?.height ?? participant.height);

        flowNodes.forEach((node) => {
          const freshNode = elementRegistry.get(node.id);
          if (!freshNode) return;

          const nodeCenter = freshNode.y + (freshNode.height || 0) / 2;
          const nodeBottom = freshNode.y + (freshNode.height || 0);

          // Find the assigned lane, or fall back to closest by position
          const assignedLane = laneByNodeId.get(node.id);
          let targetLane = assignedLane
            ? updatedLanes.find((l: any) => l.id === assignedLane.id)
            : null;

          // Fallback: find lane that contains this node's center
          if (!targetLane && updatedLanes.length > 0) {
            targetLane = updatedLanes.find((l: any) =>
              nodeCenter >= l.y && nodeCenter <= l.y + l.height,
            );
          }

          // Last resort: if node is outside pool entirely, assign to last lane
          if (!targetLane && updatedLanes.length > 0) {
            targetLane = nodeCenter > poolBottom
              ? updatedLanes[updatedLanes.length - 1]
              : updatedLanes[0];
          }
          if (!targetLane) return;

          const laneCenter = targetLane.y + targetLane.height / 2;
          const isOutsideLane = nodeCenter < targetLane.y || nodeCenter > targetLane.y + targetLane.height;
          const isOutsidePool = nodeBottom > poolBottom || freshNode.y < poolTop;

          if (isOutsideLane || isOutsidePool) {
            const newY = laneCenter - (freshNode.height || 0) / 2;
            modeling.moveShape(freshNode, { x: 0, y: newY - freshNode.y }, targetLane);
          }
        });
      }

      rerouteAiDraftConnections();
      canvas.zoom('fit-viewport', 'auto');
      scheduleVisualRefresh();

      const report = calculateQualityReport();
      setQualityReport(report);
      setQualityDetailsOpen(false);
      setErrors([]);
    } catch (err: any) {
      setErrors([`Erro ao organizar diagrama automaticamente: ${err.message}`]);
    }
  }, [calculateQualityReport, redistributeParticipantLanes, rerouteAiDraftConnections, scheduleVisualRefresh]);

  const handleElkAutoArrange = useCallback(async () => {
    try {
      const modeler = getActiveModeler();
      const elementRegistry = modeler.get('elementRegistry') as {
        filter: (matcher: (element: any) => boolean) => any[];
        get: (id: string) => any;
      };
      const modeling = modeler.get('modeling') as {
        moveShape: (shape: any, delta: { x: number; y: number }, newParent?: any) => void;
        resizeShape: (shape: any, bounds: { x: number; y: number; width: number; height: number }) => void;
        updateProperties: (element: any, properties: Record<string, any>) => void;
        updateWaypoints: (connection: any, waypoints: Array<{ x: number; y: number }>) => void;
      };
      const canvas = modeler.get('canvas') as {
        zoom: (value?: number | 'fit-viewport', center?: 'auto') => number | void;
      };
      const layouter = modeler.get('layouter') as {
        layoutConnection: (connection: any, hints?: Record<string, any>) => Array<{ x: number; y: number }>;
      };

      const allElements = elementRegistry.filter(() => true);

      // Clear participant label if present
      allElements
        .filter((el) => el?.businessObject && is(el.businessObject, 'bpmn:Participant') && el.businessObject.name)
        .forEach((el) => modeling.updateProperties(el, { name: '' }));

      const participant = allElements.find(
        (element) =>
          element?.businessObject &&
          !element?.waypoints &&
          element.type !== 'label' &&
          is(element.businessObject, 'bpmn:Participant'),
      );

      const lanes = allElements
        .filter(
          (element) =>
            element?.businessObject &&
            !element?.waypoints &&
            element.type !== 'label' &&
            is(element.businessObject, 'bpmn:Lane'),
        )
        .sort((a, b) => (a.y ?? 0) - (b.y ?? 0));

      const flowNodes = allElements.filter((element) => {
        if (!element?.businessObject || element?.waypoints || element.type === 'label') return false;
        if (is(element.businessObject, 'bpmn:Participant') || is(element.businessObject, 'bpmn:Lane')) return false;
        return (
          is(element.businessObject, 'bpmn:StartEvent') ||
          is(element.businessObject, 'bpmn:EndEvent') ||
          is(element.businessObject, 'bpmn:Task') ||
          is(element.businessObject, 'bpmn:SubProcess') ||
          is(element.businessObject, 'bpmn:CallActivity') ||
          is(element.businessObject, 'bpmn:Gateway')
        );
      });

      if (flowNodes.length < 2) {
        setErrors(['Layout automático: adicione mais elementos de processo para organizar.']);
        return;
      }

      const nodeIds = new Set(flowNodes.map((node) => node.id));

      const sequenceConnections = allElements.filter(
        (element) =>
          element?.waypoints &&
          element?.businessObject &&
          is(element.businessObject, 'bpmn:SequenceFlow'),
      );

      // --- Resolve lane for each flow node ---
      const resolveLaneForNode = (node: any) => {
        if (node.parent?.businessObject && is(node.parent.businessObject, 'bpmn:Lane')) {
          return node.parent;
        }
        if (lanes.length === 0) return null;
        const centerY = (node.y || 0) + ((node.height || 0) / 2);
        const containingLane = lanes.find((lane) => centerY >= lane.y && centerY <= lane.y + lane.height);
        return containingLane || lanes[0];
      };

      const laneByNodeId = new Map<string, any>();
      flowNodes.forEach((node) => {
        laneByNodeId.set(node.id, resolveLaneForNode(node));
      });

      // --- Build ELK graph ---
      const elk = new ELK();

      // Build lane group children: each lane is a group node containing its flow nodes
      const laneChildren: any[] = [];
      const laneNodeMap = new Map<string, any[]>(); // laneId -> elk child nodes

      // Group flow nodes by lane
      const nodesPerLane = new Map<string, any[]>();
      flowNodes.forEach((node) => {
        const lane = laneByNodeId.get(node.id);
        const laneKey = lane?.id || '__default__';
        const list = nodesPerLane.get(laneKey) || [];
        list.push(node);
        nodesPerLane.set(laneKey, list);
      });

      // Build ELK children for each lane
      if (lanes.length > 0) {
        lanes.forEach((lane) => {
          const laneFlowNodes = nodesPerLane.get(lane.id) || [];
          const elkLaneChildren = laneFlowNodes.map((node) => ({
            id: node.id,
            width: node.width || 120,
            height: node.height || 80,
          }));
          laneNodeMap.set(lane.id, elkLaneChildren);

          laneChildren.push({
            id: lane.id,
            layoutOptions: {
              'elk.padding': '[top=50,left=30,bottom=30,right=30]',
            },
            children: elkLaneChildren,
            edges: [],
          });
        });

        // Nodes not in any known lane go into a default group
        const defaultNodes = nodesPerLane.get('__default__') || [];
        if (defaultNodes.length > 0) {
          const elkDefaultChildren = defaultNodes.map((node) => ({
            id: node.id,
            width: node.width || 120,
            height: node.height || 80,
          }));
          laneChildren.push({
            id: '__default_lane__',
            children: elkDefaultChildren,
            edges: [],
          });
        }
      } else {
        // No lanes: all flow nodes are direct children of root
        flowNodes.forEach((node) => {
          laneChildren.push({
            id: node.id,
            width: node.width || 120,
            height: node.height || 80,
          });
        });
      }

      // Build ELK edges from sequence connections
      const elkEdges = sequenceConnections
        .filter((conn) => {
          const sourceId = conn.source?.id;
          const targetId = conn.target?.id;
          return sourceId && targetId && nodeIds.has(sourceId) && nodeIds.has(targetId);
        })
        .map((conn) => ({
          id: conn.id,
          sources: [conn.source.id],
          targets: [conn.target.id],
        }));

      // Root graph: participant or virtual root
      const rootId = participant?.id || '__elk_root__';
      const elkGraph: any = {
        id: rootId,
        layoutOptions: {
          'elk.algorithm': 'layered',
          'elk.direction': 'RIGHT',
          'elk.layered.spacing.nodeNodeBetweenLayers': '200',
          'elk.layered.spacing.edgeNodeBetweenLayers': '40',
          'elk.spacing.nodeNode': '40',
          'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
          'elk.edgeRouting': 'ORTHOGONAL',
          'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
        },
        children: laneChildren,
        edges: elkEdges,
      };

      // --- Run ELK layout ---
      const layoutResult = await elk.layout(elkGraph);

      // --- Map ELK positions back to bpmn-js elements ---
      // Determine base offset (participant or first lane position)
      const baseX = participant ? participant.x + 30 : (lanes.length > 0 ? lanes[0].x + 30 : 100);
      const baseY = participant ? participant.y : (lanes.length > 0 ? lanes[0].y : 100);

      // Helper: collect all elk nodes recursively into a flat map (id -> {x, y, width, height})
      const elkPositions = new Map<string, { x: number; y: number; width: number; height: number }>();
      const collectPositions = (elkNode: any, offsetX: number, offsetY: number) => {
        const absX = (elkNode.x || 0) + offsetX;
        const absY = (elkNode.y || 0) + offsetY;
        elkPositions.set(elkNode.id, {
          x: absX,
          y: absY,
          width: elkNode.width || 0,
          height: elkNode.height || 0,
        });
        if (elkNode.children) {
          elkNode.children.forEach((child: any) => collectPositions(child, absX, absY));
        }
      };
      collectPositions(layoutResult, baseX, baseY);

      // Resize participant to fit ELK result
      if (participant && layoutResult.width && layoutResult.height) {
        const newWidth = (layoutResult.width || 800) + 60;
        const newHeight = (layoutResult.height || 400) + 40;
        if (Math.abs(newWidth - participant.width) > 1 || Math.abs(newHeight - participant.height) > 1) {
          modeling.resizeShape(participant, {
            x: participant.x,
            y: participant.y,
            width: Math.max(newWidth, participant.width),
            height: Math.max(newHeight, participant.height),
          });
        }
      }

      // Resize and reposition lanes
      if (lanes.length > 0) {
        lanes.forEach((lane) => {
          const elkLane = elkPositions.get(lane.id);
          if (!elkLane) return;
          const freshLane = elementRegistry.get(lane.id);
          if (!freshLane) return;

          const newBounds = {
            x: participant ? participant.x + 30 : elkLane.x,
            y: elkLane.y,
            width: participant ? (participant.width || 800) - 30 : elkLane.width,
            height: elkLane.height,
          };

          // Resize lane
          if (
            Math.abs(newBounds.width - freshLane.width) > 1 ||
            Math.abs(newBounds.height - freshLane.height) > 1 ||
            Math.abs(newBounds.x - freshLane.x) > 1 ||
            Math.abs(newBounds.y - freshLane.y) > 1
          ) {
            modeling.resizeShape(freshLane, newBounds);
          }
        });
      }

      // Move flow nodes to ELK-computed positions
      flowNodes.forEach((node) => {
        const elkPos = elkPositions.get(node.id);
        if (!elkPos) return;

        const freshNode = elementRegistry.get(node.id);
        if (!freshNode) return;

        const delta = {
          x: elkPos.x - freshNode.x,
          y: elkPos.y - freshNode.y,
        };

        if (Math.abs(delta.x) > 0.5 || Math.abs(delta.y) > 0.5) {
          const lane = laneByNodeId.get(node.id);
          const freshLane = lane ? elementRegistry.get(lane.id) : undefined;
          modeling.moveShape(freshNode, delta, freshLane || undefined);
        }
      });

      // Update connection waypoints
      const elkEdgeMap = new Map<string, any>();
      const collectEdges = (elkNode: any) => {
        if (elkNode.edges) {
          elkNode.edges.forEach((edge: any) => elkEdgeMap.set(edge.id, edge));
        }
        if (elkNode.children) {
          elkNode.children.forEach((child: any) => collectEdges(child));
        }
      };
      collectEdges(layoutResult);

      sequenceConnections.forEach((connection) => {
        try {
          const elkEdge = elkEdgeMap.get(connection.id);
          if (elkEdge && elkEdge.sections && elkEdge.sections.length > 0) {
            // ELK provides edge routes via sections
            const section = elkEdge.sections[0];
            const waypoints: Array<{ x: number; y: number }> = [];
            if (section.startPoint) {
              waypoints.push({ x: section.startPoint.x + baseX, y: section.startPoint.y + baseY });
            }
            if (section.bendPoints) {
              section.bendPoints.forEach((bp: any) => {
                waypoints.push({ x: bp.x + baseX, y: bp.y + baseY });
              });
            }
            if (section.endPoint) {
              waypoints.push({ x: section.endPoint.x + baseX, y: section.endPoint.y + baseY });
            }
            if (waypoints.length >= 2) {
              modeling.updateWaypoints(connection, waypoints);
              return;
            }
          }

          // Fallback: use bpmn-js layouter
          const freshConn = elementRegistry.get(connection.id);
          if (freshConn) {
            const wp = layouter.layoutConnection(freshConn, {
              connectionStart: freshConn.source,
              connectionEnd: freshConn.target,
            });
            if (Array.isArray(wp) && wp.length >= 2) {
              modeling.updateWaypoints(freshConn, wp);
            }
          }
        } catch (error) {
          console.warn('Falha ao atualizar waypoints de fluxo:', error);
        }
      });

      canvas.zoom('fit-viewport', 'auto');
      scheduleVisualRefresh();

      const report = calculateQualityReport();
      setQualityReport(report);
      setQualityDetailsOpen(false);
      setErrors([]);
    } catch (err: any) {
      console.error('ELK layout error, falling back to manual arrange:', err);
      // Fallback to the original auto-arrange if ELK fails
      handleAutoArrange();
    }
  }, [calculateQualityReport, handleAutoArrange, scheduleVisualRefresh]);

  const runExportWithQualityGate = useCallback(async (action: () => Promise<void>) => {
    const report = calculateQualityReport();
    setQualityReport(report);

    if (report.score < report.threshold) {
      setQualityDetailsOpen(true);
      setErrors([]);
    }

    await action();
  }, [calculateQualityReport]);

  const handleSave = async () => {
    if (readOnly) return;

    try {
      const report = calculateQualityReport();
      setQualityReport(report);
      setQualityDetailsOpen(false);

      const modeler = getActiveModeler();
      const { xml } = await modeler.saveXML({ format: true });
      const { svg } = await modeler.saveSVG();

      const bpmnContent = {
        xml,
        elements: [],
        flows: [],
      };

      onSave?.(bpmnContent, svg);
      if (report.score < report.threshold) {
        setErrors([
          `Versão salva com warning: score ${report.score}/100 (mínimo ${report.threshold}).`,
        ]);
      } else {
        setErrors([]);
      }
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

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getSvgSourceSize = (svg: string, fallbackWidth: number, fallbackHeight: number) => {
    const parser = new DOMParser();
    const parsedSvg = parser.parseFromString(svg, 'image/svg+xml').documentElement;
    const widthAttr = parsedSvg.getAttribute('width');
    const heightAttr = parsedSvg.getAttribute('height');
    const viewBoxAttr = parsedSvg.getAttribute('viewBox');

    const widthFromAttr = widthAttr ? Number.parseFloat(widthAttr) : Number.NaN;
    const heightFromAttr = heightAttr ? Number.parseFloat(heightAttr) : Number.NaN;

    if (Number.isFinite(widthFromAttr) && widthFromAttr > 0 && Number.isFinite(heightFromAttr) && heightFromAttr > 0) {
      return {
        width: widthFromAttr,
        height: heightFromAttr,
      };
    }

    if (viewBoxAttr) {
      const parts = viewBoxAttr
        .split(/\s+/)
        .map((part) => Number.parseFloat(part))
        .filter((part) => Number.isFinite(part));
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        return {
          width: parts[2],
          height: parts[3],
        };
      }
    }

    return {
      width: fallbackWidth,
      height: fallbackHeight,
    };
  };

  const createImageFromSvg = (svg: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const image = new Image();

      image.onload = () => {
        URL.revokeObjectURL(blobUrl);
        resolve(image);
      };

      image.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        reject(new Error('Falha ao carregar SVG para exportação PNG'));
      };

      image.src = blobUrl;
    });

  const exportSvgAsPng = async (svg: string, options: PngExportOptions) => {
    const image = await createImageFromSvg(svg);
    const scaleFactor = Math.min(Math.max(options.qualityScale, 1), 2);
    const padding = Math.round(Math.min(options.width, options.height) * 0.04);
    const drawableWidth = Math.max(options.width - padding * 2, 1);
    const drawableHeight = Math.max(options.height - padding * 2, 1);

    const source = getSvgSourceSize(
      svg,
      image.naturalWidth || options.width,
      image.naturalHeight || options.height,
    );
    const fitScale = Math.min(drawableWidth / source.width, drawableHeight / source.height);
    const drawWidth = source.width * fitScale;
    const drawHeight = source.height * fitScale;
    const drawX = (options.width - drawWidth) / 2;
    const drawY = (options.height - drawHeight) / 2;

    const hiResCanvas = document.createElement('canvas');
    hiResCanvas.width = Math.round(options.width * scaleFactor);
    hiResCanvas.height = Math.round(options.height * scaleFactor);
    const hiResContext = hiResCanvas.getContext('2d');

    if (!hiResContext) {
      throw new Error('Não foi possível criar contexto de alta resolução para PNG');
    }

    hiResContext.scale(scaleFactor, scaleFactor);
    hiResContext.fillStyle = '#ffffff';
    hiResContext.fillRect(0, 0, options.width, options.height);
    hiResContext.imageSmoothingEnabled = true;
    hiResContext.imageSmoothingQuality = 'high';
    hiResContext.drawImage(image, drawX, drawY, drawWidth, drawHeight);

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = options.width;
    outputCanvas.height = options.height;
    const outputContext = outputCanvas.getContext('2d');

    if (!outputContext) {
      throw new Error('Não foi possível criar contexto final para PNG');
    }

    outputContext.fillStyle = '#ffffff';
    outputContext.fillRect(0, 0, options.width, options.height);
    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = 'high';
    outputContext.drawImage(
      hiResCanvas,
      0,
      0,
      hiResCanvas.width,
      hiResCanvas.height,
      0,
      0,
      options.width,
      options.height,
    );

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      outputCanvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error('Falha ao gerar arquivo PNG'));
      }, 'image/png');
    });

    downloadBlob(pngBlob, options.fileName);
  };

  const dismissOnboarding = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, 'seen');
    }
    setShowOnboarding(false);
  };

  const handleExportSvg = async () => {
    await runExportWithQualityGate(async () => {
      try {
        const modeler = getActiveModeler();
        const { svg } = await modeler.saveSVG();
        downloadFile(svg, 'image/svg+xml', 'diagram.svg');
        setErrors([]);
      } catch (err: any) {
        setErrors([`Erro ao exportar SVG: ${err.message}`]);
      }
    });
  };

  const handleExportXml = async () => {
    await runExportWithQualityGate(async () => {
      try {
        const modeler = getActiveModeler();
        const { xml } = await modeler.saveXML({ format: true });
        downloadFile(xml, 'application/xml', 'diagram.bpmn');
        setErrors([]);
      } catch (err: any) {
        setErrors([`Erro ao exportar XML: ${err.message}`]);
      }
    });
  };

  const handleExportPng = async (options: PngExportOptions) => {
    await runExportWithQualityGate(async () => {
      try {
        const modeler = getActiveModeler();
        const { svg } = await modeler.saveSVG();
        await exportSvgAsPng(svg, options);
        setErrors([]);
      } catch (err: any) {
        setErrors([`Erro ao exportar PNG: ${err.message}`]);
      }
    });
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

  const handleToggleFocusMode = () => {
    setFocusMode((current) => {
      const next = !current;
      if (next) {
        setQualityDetailsOpen(false);
        setFocusPropertiesOpen(false);
      }
      return next;
    });
  };

  return (
    <div className={`bpmn-editor-layout flex h-full min-h-0 min-w-0 gap-4 ${focusMode ? 'focus-mode' : ''}`}>
      <div className="bpmn-editor-main flex-1 flex flex-col min-h-0 min-w-0">
        {showOnboarding && !focusMode && (
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

        {qualityReport && (
          <div
            className={`message ${qualityReport.score >= qualityReport.threshold ? 'message-success' : 'message-info'} mb-3 quality-report-panel ${
              focusMode && !qualityDetailsOpen ? 'quality-report-panel-focus' : ''
            }`}
          >
            <div className="quality-report-header-row">
              <p className="font-semibold">
                Score de qualidade: {qualityReport.score}/100 (mínimo recomendado {qualityReport.threshold})
              </p>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => setQualityDetailsOpen((current) => !current)}
                title={qualityDetailsOpen ? 'Ocultar painel de qualidade' : 'Abrir painel de qualidade'}
              >
                {qualityDetailsOpen ? 'Ocultar painel' : 'Abrir painel'}
              </button>
            </div>
            {(qualityDetailsOpen || !focusMode) && (
              <>
                {qualityReport.score < qualityReport.threshold && (
                  <p className="text-sm mt-1 quality-report-summary">
                    Score abaixo do mínimo recomendado. Exportação está liberada nesta fase para priorizar ajustes de layout.
                  </p>
                )}
                <p className="text-sm mt-1 quality-report-summary">
                  Métricas: sobreposição de nós {qualityReport.metrics.shapeOverlaps}, colisão de labels {qualityReport.metrics.labelOverlaps},
                  labels sobre nós {qualityReport.metrics.labelShapeOverlaps}, conexões atravessando nós {qualityReport.metrics.edgeShapeCrossings},
                  cruzamentos de conexões {qualityReport.metrics.edgeEdgeCrossings}, lanes vazias {qualityReport.metrics.emptyLanes}.
                </p>
              </>
            )}

            {!qualityDetailsOpen && (
              <p className="quality-report-findings-count mt-1">
                {qualityReport.issues.length + qualityReport.warnings.length} apontamento(s) encontrado(s).
                {focusMode ? ' Painel em modo compacto.' : ' Use “Abrir painel” para detalhes.'}
              </p>
            )}

            {qualityDetailsOpen && (
              <div className="quality-report-details">
                {qualityReport.issues.length > 0 && (
                  <ul className="list-disc pl-5 text-sm mt-2">
                    {qualityReport.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                )}

                {qualityReport.warnings.length > 0 && (
                  <ul className="list-disc pl-5 text-sm mt-2">
                    {qualityReport.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}

                {qualityReport.emptyLaneElementIds.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleCleanEmptyLanes}
                      className="btn btn-secondary btn-small"
                      title="Remover lanes vazias detectadas na análise"
                    >
                      Limpar lanes vazias
                    </button>
                    {laneCleanupUndoSteps > 0 && (
                      <button
                        type="button"
                        onClick={handleUndoLaneCleanup}
                        className="btn btn-ghost btn-small"
                        title="Desfazer limpeza de lanes"
                      >
                        Desfazer limpeza
                      </button>
                    )}
                  </div>
                )}
                {qualityReport.issues.length === 0 && qualityReport.warnings.length === 0 && (
                  <p className="text-sm mt-2">Nenhum problema detectado na análise atual.</p>
                )}
              </div>
            )}
            {!qualityDetailsOpen && qualityReport.emptyLaneElementIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCleanEmptyLanes}
                  className="btn btn-secondary btn-small"
                  title="Remover lanes vazias detectadas na análise"
                >
                  Limpar lanes vazias
                </button>
                {laneCleanupUndoSteps > 0 && (
                  <button
                    type="button"
                    onClick={handleUndoLaneCleanup}
                    className="btn btn-ghost btn-small"
                    title="Desfazer limpeza de lanes"
                  >
                    Desfazer limpeza
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="bpmn-editor-actions flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            onClick={handleToggleFocusMode}
            title={focusMode ? 'Sair do modo foco do diagrama' : 'Expandir diagrama para foco em edição'}
            aria-label={focusMode ? 'Sair do modo foco do diagrama' : 'Expandir diagrama para foco em edição'}
            data-tooltip={focusMode ? 'Sair do foco 80%' : 'Modo foco 80%'}
            className={`tooltip-trigger btn ${focusMode ? 'btn-primary' : 'btn-secondary'}`}
          >
            {focusMode ? 'Sair foco 80%' : 'Modo foco 80%'}
          </button>
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
            type="button"
            onClick={handleCheckQuality}
            title="Executar análise de qualidade visual e semântica básica"
            aria-label="Executar análise de qualidade visual e semântica básica"
            data-tooltip="Executar análise de qualidade visual e semântica básica"
            className="tooltip-trigger btn btn-secondary"
          >
            Verificar qualidade
          </button>
          <button
            type="button"
            onClick={handleElkAutoArrange}
            disabled={readOnly}
            title="Distribuir automaticamente os quadros por fluxo e por lane"
            aria-label="Distribuir automaticamente os quadros por fluxo e por lane"
            data-tooltip="Distribuir automaticamente os quadros por fluxo e por lane"
            className="tooltip-trigger btn btn-secondary"
          >
            Organizar automático
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
          <button
            onClick={() => handleExportPng({
              width: 1920,
              height: 1080,
              qualityScale: 2,
              fileName: 'diagram-1920x1080.png',
            })}
            title="Exportar PNG em 1920x1080 com alta qualidade"
            aria-label="Exportar PNG em 1920x1080 com alta qualidade"
            data-tooltip="Exportar PNG em 1920x1080 com alta qualidade"
            className="tooltip-trigger btn btn-secondary"
          >
            PNG 1920x1080
          </button>
          <button
            onClick={() => handleExportPng({
              width: 3840,
              height: 2160,
              qualityScale: 1,
              fileName: 'diagram-3840x2160.png',
            })}
            title="Exportar PNG em 3840x2160 (4K)"
            aria-label="Exportar PNG em 3840x2160 (4K)"
            data-tooltip="Exportar PNG em 3840x2160 (4K)"
            className="tooltip-trigger btn btn-ghost"
          >
            PNG 4K
          </button>
        </div>

        {selectedElement && focusMode && (
          <details
            className="properties-dropdown mb-3"
            open={focusPropertiesOpen}
            onToggle={(event) => setFocusPropertiesOpen((event.currentTarget as HTMLDetailsElement).open)}
          >
            <summary>Propriedades do elemento</summary>
            <div className="properties-dropdown-content">
              <BpmnPropertiesPanel
                element={selectedElement}
                modeler={modelerRef.current}
                onUpdate={() => setSelectedElement(null)}
              />
            </div>
          </details>
        )}

        <div
          ref={containerRef}
          className={`bpmn-container flex-1 min-h-0 min-w-0 w-full h-full overflow-hidden border border-gray-300 rounded bg-white ${focusMode ? 'bpmn-container-focus' : ''}`}
        />
      </div>

      {selectedElement && !focusMode && (
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
