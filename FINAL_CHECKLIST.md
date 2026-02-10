# Final Checklist - BPM Editor MVP

## 📦 Entregáveis (3 Coisas Objetivas)

### ✅ 1. PROVA FUNCIONAL (Sem Deploy Ainda)

**Repositório:**
```
https://github.com/[seu-usuario]/bpm-editor-mvp
```

**Comando Único para Rodar Local:**
```bash
bash setup_local.sh
```

**O que o script faz:**
- ✓ Inicia PostgreSQL via Docker
- ✓ Instala dependências (pnpm)
- ✓ Compila servidor NestJS
- ✓ Executa migrations automáticas
- ✓ Testa persistência (cria e recupera processo)
- ✓ Inicia backend (http://localhost:3001)
- ✓ Inicia frontend (http://localhost:5173)

**Teste Manual (Após script rodar):**

1. **Arrastar Task:**
   - Abra http://localhost:5173
   - Clique em "+ Novo Processo"
   - Nome: "Test Process"
   - Clique em "✎ Editar"
   - Arraste uma **Task** do painel para o canvas
   - ✓ Task aparece no canvas

2. **Salvar:**
   - Clique em "💾 Salvar"
   - ✓ Mensagem "Processo salvo com sucesso!"

3. **Recarregar (Persistência):**
   - Pressione F5
   - ✓ Processo ainda está lá
   - ✓ Task ainda está no canvas

4. **Exportar:**
   - Clique em "📥 Export XML"
   - ✓ Arquivo `diagram.bpmn` baixado
   - Clique em "🖼️ Export SVG"
   - ✓ Arquivo `diagram.svg` baixado

---

### ✅ 2. BANCO E MIGRATIONS

**Migrations Automáticas:**
- ✓ Localizadas em: `server/src/database.config.ts`
- ✓ Ativadas com: `synchronize: !isProduction`
- ✓ Entidades em: `server/src/modules/process/entities/`

**Comando de Boot (Railway):**
```
Procfile:
web: cd server && npm run start
```

**Alternativa com Migrations Explícitas:**
```
web: cd server && npm run typeorm migration:run && npm run start
```

**Seed Opcional (Validação Rápida):**
```bash
# Criar processo de teste
curl -X POST http://localhost:3001/api/processes \
  -H "Content-Type: application/json" \
  -d '{"name":"Sample Process","description":"Test"}'

# Listar processos
curl http://localhost:3001/api/processes
```

**Validação de Schema:**
```bash
# Conectar ao banco
psql postgresql://user:password@host/database

# Listar tabelas
\dt

# Ver schema
\d processes
\d process_versions
```

---

### ✅ 3. ARQUIVOS E VARIÁVEIS

#### 📄 `.env.example` (Copiar/Colar)

**Backend:**
```env
NODE_ENV=development
PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=bpm_editor
```

**Frontend:**
```env
VITE_API_URL=http://localhost:3001
```

#### 🚂 Railway - Variáveis Exatas

```
NODE_ENV=production
PORT=3001
DB_HOST=<neon-host>
DB_PORT=5432
DB_USER=<neon-user>
DB_PASSWORD=<neon-password>
DB_NAME=<neon-database>
```

**Como extrair do Neon:**
```
Connection String: postgresql://user:password@host:5432/database

Extrair:
- DB_HOST = host
- DB_PORT = 5432
- DB_USER = user
- DB_PASSWORD = password
- DB_NAME = database
```

#### 🎨 Vercel - Variáveis Exatas

```
VITE_API_URL=https://bpm-editor-backend.railway.app
```

**Substituir `bpm-editor-backend` pela URL real do Railway**

#### 🔐 CORS - Origens Permitidas

**Desenvolvimento:**
```
http://localhost:5173
http://localhost:3000
```

**Produção:**
```
https://bpm-editor.vercel.app
https://bpm-editor-backend.railway.app
```

**Arquivo:** `server/src/main.ts`
```typescript
const allowedOrigins = [
  'http://localhost:5173',
  'https://bpm-editor.vercel.app',
];

app.enableCors({
  origin: allowedOrigins,
  credentials: true,
});
```

---

## 📚 Documentação Incluída

| Arquivo | Descrição |
|---------|-----------|
| `QUICK_START.md` | Começar em 2 minutos |
| `DEPLOYMENT.md` | Guia completo de deploy |
| `ENVIRONMENT_VARS.md` | Variáveis de ambiente |
| `CORS_CHECKLIST.md` | Validação de CORS |
| `MIGRATIONS.md` | Estratégia de banco |
| `setup_local.sh` | Script de setup automático |
| `docker-compose.yml` | PostgreSQL local |

---

## 🎯 Próximos Passos (Para Você)

### Fase 1: Validar Localmente ✓
```bash
bash setup_local.sh
# Testar: arrastar, salvar, recarregar, exportar
```

### Fase 2: Preparar Contas
- [ ] Criar conta Neon (neon.tech)
- [ ] Criar conta Railway (railway.app)
- [ ] Criar conta Vercel (vercel.com)

### Fase 3: Deploy
- [ ] Seguir `DEPLOYMENT.md` passo a passo
- [ ] Adicionar variáveis no Railway
- [ ] Adicionar variáveis no Vercel
- [ ] Fazer deploy

### Fase 4: Validar Deploy
- [ ] Testar healthcheck: `/health`
- [ ] Testar CRUD: `POST /api/processes`
- [ ] Testar persistência: criar, recarregar
- [ ] Testar CORS: requisições do frontend

---

## ✅ Validação Final (Critério de Aceite)

### Teste 1: Arrastar Task
- [ ] Abrir editor
- [ ] Arrastar Task para canvas
- [ ] Task aparece no canvas

### Teste 2: Salvar
- [ ] Clicar em "Salvar"
- [ ] Mensagem de sucesso aparece
- [ ] Versão é criada

### Teste 3: Recarregar (Persistência)
- [ ] Recarregar página (F5)
- [ ] Processo ainda está lá
- [ ] Task ainda está no canvas
- [ ] Versão foi recuperada

### Teste 4: Exportar
- [ ] Export BPMN XML: arquivo `.bpmn` baixado
- [ ] Export SVG: arquivo `.svg` baixado
- [ ] PNG: (futuro, não no MVP)

---

## 🔗 Links Importantes

| Serviço | URL |
|---------|-----|
| GitHub | https://github.com/[seu-usuario]/bpm-editor-mvp |
| Neon | https://console.neon.tech |
| Railway | https://railway.app/dashboard |
| Vercel | https://vercel.com/dashboard |

---

## 📞 Troubleshooting Rápido

| Problema | Solução |
|----------|---------|
| "Port already in use" | `lsof -ti:5173 \| xargs kill -9` |
| "Cannot connect to Docker" | `sudo systemctl start docker` |
| "pnpm not found" | `npm install -g pnpm` |
| "CORS error" | Verifique `CORS_CHECKLIST.md` |
| "Connection refused" | Verifique credenciais do Neon |

---

## 🎓 Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                    Cliente (Vercel)                         │
│  React + Vite → https://bpm-editor.vercel.app              │
└──────────────────────┬──────────────────────────────────────┘
                       │ API Calls
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                 Backend (Railway)                           │
│  NestJS → https://bpm-editor-backend.railway.app           │
└──────────────────────┬──────────────────────────────────────┘
                       │ SQL Queries
                       ↓
┌─────────────────────────────────────────────────────────────┐
│              Banco de Dados (Neon)                          │
│  PostgreSQL Gerenciado                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Resumo Técnico

| Aspecto | Tecnologia |
|---------|-----------|
| Frontend | React 19 + Vite + Tailwind |
| Backend | NestJS + Express |
| Banco | PostgreSQL (Neon) |
| ORM | TypeORM |
| Editor BPMN | bpmn-js |
| Hospedagem | Vercel + Railway |
| CI/CD | GitHub Actions |

---

**Versão:** 1.0.0  
**Data:** 2026-02-09  
**Status:** ✅ Pronto para Deploy
