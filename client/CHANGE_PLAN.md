# CHANGE_PLAN — Fase A (UI/BPMN Legibilidade)

## Metadados
- Projeto: `bpm-editor-mvp`
- Escopo desta rodada: `client/estilos/docs` apenas
- Data: `2026-02-11`
- Branch: `ui/layout-fix`

## Objetivo da Fase A
Melhorar legibilidade e usabilidade de diagramas BPMN densos, sem alterar contratos de API, persistência ou semântica BPMN do XML salvo.

## Alterações Planejadas e Aplicadas
1. `client/src/components/BpmnEditor.tsx`
- Auto-fit de texto em elementos principais e labels de `sequenceFlow`:
  - faixa de fonte `10..16`
  - quebra de linha antes de elipse
  - elipse no limite (`...`)
- Controles de viewport:
  - `Ajustar à tela`
  - `Zoom +`
  - `Zoom -`
  - `Centralizar`
- Reaplicação de ajustes visuais por evento (`eventBus`) após import/edição.
- Ativação de `snapping` para alinhamento leve.

2. `client/src/index.css`
- Tokens adicionais para legibilidade de fluxo/shape/lane.
- Contraste reforçado no canvas.
- Aumento de espessura/hit-area de conexões.
- Destaque de hover/seleção (shape e connection).
- Faixas alternadas em lanes (light/dark).
- Ajustes para setas/markers e linhas de snap.

3. `client/VISUAL_QA.md`
- Checklist de validação visual da Fase A.

## Fora de Escopo (nesta fase)
- Endpoints/API/backend/schema/migrations.
- Motor de execução BPMN.
- Simulação preditiva e orquestração distribuída.

## Riscos e Mitigações
1. Reflow de labels em cenários extremos.
- Mitigação: algoritmo com limites, quebra e elipse; fallback para tamanho mínimo.

2. Estilo forte demais em conexões.
- Mitigação: valores moderados e tokens CSS centralizados para ajuste rápido.

3. Divergência entre visual editor e SVG exportado.
- Mitigação: lanes striping aplicado no SVG do canvas (não só classe CSS).

## Rollback
1. Reverter apenas os arquivos da fase:
- `client/src/components/BpmnEditor.tsx`
- `client/src/index.css`
- `client/VISUAL_QA.md`
2. Manter commits anteriores intactos.

## Gate para avanço da fase
Para concluir Fase A:
1. `npm run build` no client deve passar.
2. Checklist manual do `VISUAL_QA.md` executado com evidências.
3. Aprovação explícita antes de deploy.
