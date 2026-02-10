# BPM Editor MVP - Enterprise BPMN Platform

Um editor BPMN funcional com persistência em PostgreSQL, validação básica, versionamento e exports. Pronto para deploy em Neon + Railway + Vercel.

## 🚀 Começar em 2 Minutos

```bash
bash setup_local.sh
```

Isso inicia PostgreSQL, backend, frontend e testa persistência automaticamente.

## 📋 Checklist de Validação

Após `setup_local.sh`, teste:

1. **Arrastar Task:** Abra http://localhost:5173 → Novo Processo → Editar → Arraste Task
2. **Salvar:** Clique em "Salvar" → Confirme mensagem
3. **Recarregar:** F5 → Confirme que Task ainda está lá
4. **Exportar:** Clique em "Export XML" ou "Export SVG" → Confirme download

## 📁 Estrutura

```
bpm-editor-mvp/
├── server/              # Backend NestJS + API REST
├── client/              # Frontend React + Editor BPMN
├── docker-compose.yml   # PostgreSQL local
├── setup_local.sh       # Script de setup automático
├── QUICK_START.md       # Começar em 2 min
├── DEPLOYMENT.md        # Guia de deploy
├── ENVIRONMENT_VARS.md  # Variáveis de ambiente
├── CORS_CHECKLIST.md    # Validação CORS
├── MIGRATIONS.md        # Estratégia de banco
└── FINAL_CHECKLIST.md   # Resumo executivo
```

## 🔗 Links

| Serviço | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:3001 |
| Health | http://localhost:3001/health |

## 📚 Documentação

- **Começar:** `QUICK_START.md`
- **Deploy:** `DEPLOYMENT.md`
- **Variáveis:** `ENVIRONMENT_VARS.md`
- **CORS:** `CORS_CHECKLIST.md`
- **Banco:** `MIGRATIONS.md`
- **Resumo:** `FINAL_CHECKLIST.md`

## 🛠️ Stack

- Frontend: React 19 + Vite + Tailwind
- Backend: NestJS + TypeORM
- Banco: PostgreSQL (Neon)
- Hospedagem: Vercel + Railway
- Editor: bpmn-js

## ✅ Funcionalidades MVP

- ✓ Editor BPMN com drag-and-drop
- ✓ Biblioteca de Processos (CRUD)
- ✓ Painel de propriedades
- ✓ Validação básica de BPMN
- ✓ Versionamento por snapshot
- ✓ Export BPMN XML + SVG
- ✓ Persistência em PostgreSQL
- ✓ API REST completa
- ✓ Healthcheck endpoint

## 🚀 Deploy

Siga `DEPLOYMENT.md` para deploy em:
- **Banco:** Neon (PostgreSQL gerenciado)
- **Backend:** Railway (NestJS)
- **Frontend:** Vercel (React)

## 📞 Suporte

- Erro no setup? → `QUICK_START.md`
- Erro no deploy? → `DEPLOYMENT.md`
- Erro de variáveis? → `ENVIRONMENT_VARS.md`
- Erro de CORS? → `CORS_CHECKLIST.md`

---

**Versão:** 1.0.0 | **Status:** ✅ Pronto para Deploy
