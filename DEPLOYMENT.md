# Deployment Guide - BPM Editor MVP

Este guia descreve como fazer o deploy permanente do BPM Editor MVP usando Neon (PostgreSQL), Railway (Backend) e Vercel (Frontend).

## 🏗️ Arquitetura de Deployment

```
┌─────────────────────────────────────────────────────────────┐
│                    Cliente (Vercel)                         │
│  React + Vite → https://bpm-editor.vercel.app              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ↓ API Calls
┌─────────────────────────────────────────────────────────────┐
│                 Backend (Railway)                           │
│  NestJS → https://bpm-editor-backend.railway.app           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ↓ SQL Queries
┌─────────────────────────────────────────────────────────────┐
│              Banco de Dados (Neon)                          │
│  PostgreSQL Gerenciado                                      │
└─────────────────────────────────────────────────────────────┘
```

## 📋 Pré-requisitos

- Conta GitHub (para conectar repositórios)
- Conta Vercel (vercel.com)
- Conta Railway (railway.app)
- Conta Neon (neon.tech)

## 🚀 Passo a Passo

### 1. Criar Banco de Dados no Neon

1. Acesse [neon.tech](https://neon.tech)
2. Crie uma conta e faça login
3. Crie um novo projeto
4. Copie a connection string (DATABASE_URL)
   - Formato: `postgresql://user:password@host/database`

**Variáveis de Ambiente do Neon:**
```
DB_HOST=<host-do-neon>
DB_PORT=5432
DB_USER=<user>
DB_PASSWORD=<password>
DB_NAME=<database>
```

### 2. Deploy Backend no Railway

1. Acesse [railway.app](https://railway.app)
2. Crie uma conta e faça login
3. Clique em "New Project"
4. Selecione "Deploy from GitHub"
5. Autorize Railway a acessar seu GitHub
6. Selecione o repositório `bpm-editor-mvp`
7. Railway detectará automaticamente o `Procfile`

**Configurar Variáveis de Ambiente no Railway:**

No painel do Railway, vá para "Variables" e adicione:

```
NODE_ENV=production
PORT=3001
DB_HOST=<neon-host>
DB_PORT=5432
DB_USER=<neon-user>
DB_PASSWORD=<neon-password>
DB_NAME=<neon-database>
```

**Deploy automático:**
- Railway fará deploy automaticamente a cada push na branch `main`
- Copie a URL do backend (ex: `https://bpm-editor-backend.railway.app`)

### 3. Deploy Frontend no Vercel

1. Acesse [vercel.com](https://vercel.com)
2. Crie uma conta e faça login
3. Clique em "New Project"
4. Selecione "Import Git Repository"
5. Autorize Vercel a acessar seu GitHub
6. Selecione o repositório `bpm-editor-mvp`

**Configurar Build Settings:**

- **Framework Preset:** Vite
- **Build Command:** `cd client && npm run build`
- **Output Directory:** `client/dist`
- **Install Command:** `pnpm install`

**Configurar Variáveis de Ambiente:**

No painel do Vercel, vá para "Settings" → "Environment Variables" e adicione:

```
VITE_API_URL=https://bpm-editor-backend.railway.app
```

**Deploy automático:**
- Vercel fará deploy automaticamente a cada push na branch `main`
- Copie a URL do frontend (ex: `https://bpm-editor.vercel.app`)

### 4. Configurar CORS no Backend

No arquivo `server/src/main.ts`, o CORS já está configurado para aceitar requisições do Vercel:

```typescript
app.enableCors({
  origin: 'http://localhost:5173', // Desenvolvimento
  credentials: true,
});
```

Para produção, atualize para:

```typescript
const allowedOrigins = [
  'https://bpm-editor.vercel.app',
  'http://localhost:5173',
];

app.enableCors({
  origin: allowedOrigins,
  credentials: true,
});
```

## 🔄 CI/CD Automático

O projeto inclui GitHub Actions (`.github/workflows/deploy.yml`) que:

1. Executa a cada push na branch `main`
2. Instala dependências
3. Faz build do servidor e cliente
4. Railway e Vercel fazem deploy automaticamente

## 📊 Monitoramento

### Railway Dashboard
- URL: https://railway.app/dashboard
- Monitore logs, CPU, memória
- Configure alertas

### Vercel Dashboard
- URL: https://vercel.com/dashboard
- Monitore performance, builds
- Configure webhooks

### Neon Dashboard
- URL: https://console.neon.tech
- Monitore conexões, queries
- Configure backups

## 🧪 Testes Pós-Deploy

1. **Acesse o frontend:** https://bpm-editor.vercel.app
2. **Crie um novo processo**
3. **Arraste elementos no canvas**
4. **Salve o processo**
5. **Recarregue a página** (confirme persistência)
6. **Exporte BPMN XML e SVG**

## 🐛 Troubleshooting

### Erro: "Cannot find module"
- Verifique se `pnpm install` foi executado
- Limpe cache: `rm -rf node_modules && pnpm install`

### Erro: "Connection refused" (Banco de dados)
- Verifique credenciais do Neon
- Confirme que o IP está whitelisted no Neon
- Teste conexão local: `psql postgresql://...`

### Erro: "CORS error"
- Verifique se `VITE_API_URL` está correto no Vercel
- Confirme que o backend tem CORS habilitado

### Erro: "Build failed"
- Verifique logs no Railway/Vercel
- Confirme que `package.json` está correto
- Teste build local: `npm run build`

## 📝 Variáveis de Ambiente Resumidas

### Backend (Railway)
```
NODE_ENV=production
PORT=3001
DB_HOST=<neon-host>
DB_PORT=5432
DB_USER=<neon-user>
DB_PASSWORD=<neon-password>
DB_NAME=<neon-database>
```

### Frontend (Vercel)
```
VITE_API_URL=https://bpm-editor-backend.railway.app
```

## 🔐 Segurança

- ✅ Senhas do banco não ficam em código (variáveis de ambiente)
- ✅ CORS configurado para aceitar apenas domínios conhecidos
- ✅ SSL/TLS automático (Vercel + Railway)
- ✅ Backups automáticos (Neon)

## 📞 Suporte

Para problemas com:
- **Vercel:** https://vercel.com/support
- **Railway:** https://railway.app/support
- **Neon:** https://neon.tech/docs

---

**Última atualização:** 2026-02-09
