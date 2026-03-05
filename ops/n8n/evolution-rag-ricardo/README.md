# Evolution RAG (Ricardo) - Atualização 2026-03-05

Workflow: `s6N8kKQ9gc_FM1EivtwlQ`

## Mudanças aplicadas
- Comando `.`: liga agente no chat com contexto curto (20 mensagens).
- Comando `..`: liga agente no chat com contexto amplo (100 mensagens).
- Comando `um minuto`: desliga o agente no chat.
- Reações (`reactionMessage`) passam a ser ignoradas sem resposta.
- Fluxo de texto passa por busca de contexto em `chat/findMessages` antes do agente.
- Resposta normal continua com `Delay 1 Minuto`.

## Arquivos
- `workflow_pre_2026-03-05.redacted.json`: snapshot anterior (sem segredos).
- `workflow_post_2026-03-05.redacted.json`: snapshot publicado (sem segredos).

## Validação manual executada
- `reactionMessage` => `ignore=true`, `ignoreReason=reaction`, sem envio.
- `.` => comando processado, estado `enabled=true`, `contextLimit=20`.
- `..` => comando processado, estado `enabled=true`, `contextLimit=100`.
- `um minuto` => comando processado, estado `enabled=false`.
