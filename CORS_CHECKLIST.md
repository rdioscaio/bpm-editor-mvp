# CORS Checklist - BPM Editor MVP

## 🔐 Configuração de CORS (Cross-Origin Resource Sharing)

### ⚠️ O que é CORS?

CORS controla quais domínios podem fazer requisições ao seu backend. Sem configuração correta, o navegador bloqueia requisições do frontend.

---

## ✅ Checklist de Validação

### 1. Backend (NestJS) - Arquivo: `server/src/main.ts`

**Desenvolvimento Local:**
```typescript
app.enableCors({
  origin: 'http://localhost:5173',
  credentials: true,
});
```

**Produção (Railway + Vercel):**
```typescript
const allowedOrigins = [
  'https://bpm-editor.vercel.app',
  'http://localhost:5173', // Manter para testes
];

app.enableCors({
  origin: allowedOrigins,
  credentials: true,
});
```

### 2. Variáveis de Ambiente

**Frontend (Vercel):**
```
VITE_API_URL=https://bpm-editor-backend.railway.app
```

**Backend (Railway):**
```
NODE_ENV=production
PORT=3001
DB_HOST=<neon-host>
DB_PORT=5432
DB_USER=<neon-user>
DB_PASSWORD=<neon-password>
DB_NAME=<neon-database>
```

---

## 🧪 Testes de CORS

### Teste 1: Health Check
```bash
# Deve retornar 200 OK
curl -i https://bpm-editor-backend.railway.app/health
```

### Teste 2: Requisição com CORS
```bash
# Teste de CORS do navegador
curl -i -H "Origin: https://bpm-editor.vercel.app" \
  -H "Access-Control-Request-Method: GET" \
  https://bpm-editor-backend.railway.app/health
```

### Teste 3: No Navegador
1. Abra https://bpm-editor.vercel.app
2. Abra DevTools (F12)
3. Vá para **Console**
4. Execute:
```javascript
fetch('https://bpm-editor-backend.railway.app/api/processes')
  .then(r => r.json())
  .then(d => console.log('✓ CORS OK:', d))
  .catch(e => console.error('✗ CORS Error:', e))
```

---

## 🚨 Erros Comuns e Soluções

### Erro: "Access to XMLHttpRequest has been blocked by CORS policy"

**Causa:** Backend não tem CORS habilitado para o domínio do frontend

**Solução:**
1. Verifique `server/src/main.ts`
2. Adicione o domínio do Vercel à lista `allowedOrigins`
3. Faça deploy do backend
4. Aguarde ~2 minutos
5. Teste novamente

### Erro: "The CORS protocol does not allow specifying a wildcard (*) for credentials"

**Causa:** Tentativa de usar `origin: '*'` com `credentials: true`

**Solução:**
```typescript
// ❌ Errado
app.enableCors({
  origin: '*',
  credentials: true,
});

// ✅ Correto
app.enableCors({
  origin: ['https://bpm-editor.vercel.app', 'http://localhost:5173'],
  credentials: true,
});
```

### Erro: "Preflight request failed"

**Causa:** Requisição OPTIONS não é respondida corretamente

**Solução:**
1. Verifique se `app.enableCors()` está ANTES de `app.listen()`
2. Confirme que não há middleware bloqueando OPTIONS
3. Teste com curl:
```bash
curl -i -X OPTIONS https://bpm-editor-backend.railway.app/api/processes
```

---

## 📋 Origens Permitidas (Copiar/Colar)

### Desenvolvimento
```
http://localhost:5173
http://localhost:3000
```

### Produção
```
https://bpm-editor.vercel.app
https://bpm-editor-backend.railway.app
```

### Ambos (Recomendado para testes)
```typescript
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://bpm-editor.vercel.app',
  'https://bpm-editor-backend.railway.app',
];
```

---

## 🔄 Fluxo de Requisição (Debug)

1. **Frontend faz requisição:**
   ```
   GET https://bpm-editor-backend.railway.app/api/processes
   Origin: https://bpm-editor.vercel.app
   ```

2. **Backend responde com headers CORS:**
   ```
   Access-Control-Allow-Origin: https://bpm-editor.vercel.app
   Access-Control-Allow-Credentials: true
   ```

3. **Navegador valida:**
   - ✓ Origem permitida?
   - ✓ Credenciais habilitadas?
   - ✓ Método permitido?

4. **Resultado:**
   - ✓ Requisição enviada
   - ✗ Requisição bloqueada

---

## 📞 Validação Final

Após deploy, execute este checklist:

- [ ] Frontend acessa `/health` do backend
- [ ] Frontend consegue listar processos (`GET /api/processes`)
- [ ] Frontend consegue criar processo (`POST /api/processes`)
- [ ] DevTools não mostra erros de CORS
- [ ] Teste de persistência funciona

---

**Última atualização:** 2026-02-09
