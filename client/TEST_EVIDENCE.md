# TEST_EVIDENCE — Fase A (UI/BPMN Legibilidade)

## Metadados
- Data: `2026-02-11`
- Branch: `ui/layout-fix`
- Escopo: `client/estilos/docs`

## Evidências Técnicas Executadas
1. Build do client
- Comando:
```bash
cd /home/rdios/apps/bpm-editor-mvp/client
npm run build
```
- Resultado: `PASS`
- Observação: bundle gerado com sucesso; warning de chunk size (não bloqueante).

## Evidências Funcionais (manuais) — pendentes de execução guiada
Base de execução: `client/VISUAL_QA.md`

1. TC-01 Layout denso (6 tarefas, 2 gateways, 2-4 lanes)
- Status: `PENDENTE`
- Evidência esperada: screenshot em `100%` e em `Ajustar à tela`.

2. TC-02 Texto extremo (com e sem espaços)
- Status: `PENDENTE`
- Evidência esperada: screenshot provando wrap + elipse sem vazamento.

3. TC-03 Fluxos (hover/seleção)
- Status: `PENDENTE`
- Evidência esperada: screenshot com sequence flow em hover e selecionado.

4. TC-04 Lanes alternadas
- Status: `PENDENTE`
- Evidência esperada: screenshot mostrando alternância de lanes e bordas discretas.

5. TC-05 Viewport controls
- Sequência: `Ajustar à tela -> Zoom + (3x) -> Zoom - (2x) -> Centralizar`
- Status: `PENDENTE`
- Evidência esperada: screenshots por etapa crítica.

6. TC-06 Persistência
- Sequência: salvar -> F5 -> reabrir
- Status: `PENDENTE`
- Evidência esperada: screenshot pós-reload + confirmação de continuidade visual.

7. TC-07 Export SVG
- Status: `PENDENTE`
- Evidência esperada: arquivo SVG aberto e validado em viewer/browser.

## Critério de Aprovação da Fase A
`APROVADO` apenas quando:
1. Build `PASS`.
2. Todos os TC (`TC-01..TC-07`) com evidência anexada.
3. Revisão explícita antes de qualquer deploy em produção.
