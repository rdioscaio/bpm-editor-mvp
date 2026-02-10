# Environment Variables - BPM Editor MVP

## 📋 Referência Completa de Variáveis de Ambiente

### 🖥️ Backend (Railway)

| Variável | Tipo | Descrição | Exemplo |
|----------|------|-----------|---------|
| `NODE_ENV` | string | Ambiente de execução | `production` |
| `PORT` | number | Porta do servidor | `3001` |
| `DB_HOST` | string | Host do banco PostgreSQL | `ep-xyz.neon.tech` |
| `DB_PORT` | number | Porta do PostgreSQL | `5432` |
| `DB_USER` | string | Usuário do banco | `neondb_owner` |
| `DB_PASSWORD` | string | Senha do banco | `<senha-segura>` |
| `DB_NAME` | string | Nome do banco | `bpm_editor` |

**Origem das variáveis do Neon:**
```
Connection String do Neon:
postgresql://user:password@host:5432/database

Extrair:
- DB_HOST = host
- DB_PORT = 5432
- DB_USER = user
- DB_PASSWORD = password
- DB_NAME = database
```

### 🎨 Frontend (Vercel)

| Variável | Tipo | Descrição | Exemplo |
|----------|------|-----------|---------|
| `VITE_API_URL` | string | URL do backend | `https://bpm-editor-backend.railway.app` |

**Notas:**
- Deixe em branco para usar proxy local (desenvolvimento)
- Em produção, aponte para URL do Railway

---

## 🚀 Configuração por Ambiente

### 📱 Desenvolvimento Local

**Backend (.env):**
```env
NODE_ENV=development
PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=bpm_editor
```

**Frontend (.env.local):**
```env
VITE_API_URL=http://localhost:3001
```

### 🌐 Produção (Railway + Neon + Vercel)

**Railway (Backend):**
```
NODE_ENV=production
PORT=3001
DB_HOST=<neon-host>
DB_PORT=5432
DB_USER=<neon-user>
DB_PASSWORD=<neon-password>
DB_NAME=<neon-database>
```

**Vercel (Frontend):**
```
VITE_API_URL=https://bpm-editor-backend.railway.app
```

---

## 📝 Passo a Passo: Copiar/Colar

### 1️⃣ Criar Banco no Neon

1. Acesse [neon.tech](https://neon.tech)
2. Crie projeto e banco
3. Copie a connection string:
   ```
   postgresql://neondb_owner:password@ep-xyz.neon.tech/neondb
   ```

### 2️⃣ Configurar Railway

1. Acesse [railway.app](https://railway.app)
2. Crie novo projeto e conecte repositório
3. Vá para **Variables**
4. Adicione estas variáveis **exatamente** como estão:

```
NODE_ENV=production
PORT=3001
DB_HOST=ep-xyz.neon.tech
DB_PORT=5432
DB_USER=neondb_owner
DB_PASSWORD=seu_password_aqui
DB_NAME=neondb
```

**⚠️ Importante:** Substitua `ep-xyz.neon.tech`, `neondb_owner`, `seu_password_aqui` e `neondb` pelos valores da sua connection string do Neon.

### 3️⃣ Configurar Vercel

1. Acesse [vercel.com](https://vercel.com)
2. Crie novo projeto e conecte repositório
3. Vá para **Settings** → **Environment Variables**
4. Adicione:

```
VITE_API_URL=https://bpm-editor-backend.railway.app
```

**⚠️ Importante:** Substitua `bpm-editor-backend` pela URL real do seu Railway.

---

## ✅ Checklist de Validação

- [ ] Banco criado no Neon
- [ ] Connection string copiada
- [ ] Variáveis adicionadas no Railway
- [ ] Variáveis adicionadas no Vercel
- [ ] Deploy do Railway concluído
- [ ] Deploy do Vercel concluído
- [ ] Teste de persistência funcionando

---

## 🔍 Como Verificar Variáveis

### Railway
```bash
# Ver logs com variáveis (sem valores sensíveis)
railway logs
```

### Vercel
```bash
# Ver variáveis configuradas
vercel env list
```

---

## 🚨 Troubleshooting

### "Connection refused" (Banco)
- Verifique se `DB_HOST` está correto
- Confirme que IP está whitelisted no Neon
- Teste conexão: `psql postgresql://user:password@host/db`

### "CORS error" (Frontend)
- Verifique se `VITE_API_URL` está correto
- Confirme que backend tem CORS habilitado
- Teste: `curl -i https://bpm-editor-backend.railway.app/health`

### "Build failed" (Vercel)
- Verifique logs de build
- Confirme que `VITE_API_URL` está definido
- Teste build local: `VITE_API_URL=... npm run build`

---

**Última atualização:** 2026-02-09
