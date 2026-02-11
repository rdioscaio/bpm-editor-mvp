# Visual QA BPMN

## Escopo
- Legibilidade de nós, textos e sequence flows
- Leitura com lanes alternadas
- Controles de viewport (`Ajustar à tela`, `Zoom +`, `Zoom -`, `Centralizar`)
- Persistência visual no `Exportar SVG`

## Checklist Manual
1. Abra um processo e crie pelo menos `6` tarefas, `2` gateways e `2-4` lanes.
2. Verifique se o texto dos nós não vaza da borda e se o tamanho de fonte ajusta automaticamente.
3. Use nomes longos em tarefas para validar quebra de linha e elipse (`...`) no limite.
4. Passe o mouse sobre sequence flows e selecione conexões para validar destaque de stroke/seta.
5. Confirme alternância visual das lanes (faixas claras alternadas) e borda discreta.
6. Clique em `Ajustar à tela`, depois `Zoom +` e `Zoom -`, e finalize em `Centralizar`.
7. Salve, recarregue a página e valide que XML/persistência continuam iguais.
8. Exporte SVG e confirme que lanes, contraste e espessura das conexões foram preservados.

## Resultado Esperado
- Diagramas densos ficam legíveis sem poluição visual.
- Texto se mantém contido nos elementos principais.
- Fluxos permanecem visíveis em zoom normal e em hover/seleção.
