# Migrations - BPM Editor MVP

## 🗄️ Estratégia de Banco de Dados

O BPM Editor MVP usa **TypeORM com `synchronize: true`** em desenvolvimento e `synchronize: false` em produção.

### Por quê?

- **Desenvolvimento:** Sincronização automática (mais rápido)
- **Produção:** Migrations explícitas (mais seguro)

---

## 📝 Entidades (Schemas)

### 1. `Process` (Tabela: `processes`)

```sql
CREATE TABLE processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  responsible VARCHAR(255),
  tags TEXT[],
  currentVersionId UUID,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);
```

### 2. `ProcessVersion` (Tabela: `process_versions`)

```sql
CREATE TABLE process_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processId UUID NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  versionNumber INT NOT NULL,
  bpmnContent JSONB NOT NULL,
  svgContent TEXT,
  description TEXT,
  createdAt TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_process_versions_processId ON process_versions(processId);
```

---

## 🚀 Migrations em Produção (Railway)

### Opção 1: Sincronização Automática (Recomendado para MVP)

**Como funciona:**
1. TypeORM compara schema atual com entidades
2. Cria/altera tabelas automaticamente
3. Sem necessidade de migrations explícitas

**Configuração:**
```typescript
// server/src/database.config.ts
export const getDatabaseConfig = (): TypeOrmModuleOptions => {
  return {
    synchronize: !isProduction, // ✓ Automático em dev, false em prod
    // ...
  };
};
```

**Ativação em Produção:**
```typescript
// Para ativar em produção (apenas na primeira vez):
synchronize: true, // Mude para true, faça deploy, depois mude para false
```

### Opção 2: Migrations Explícitas (Futuro)

Quando precisar de migrations mais complexas:

```bash
# Gerar migration
npm run typeorm migration:generate src/migrations/InitialSchema

# Rodar migrations
npm run typeorm migration:run

# Reverter
npm run typeorm migration:revert
```

---

## 🔧 Boot Command para Railway

### Comando Atual (No `Procfile`)

```
web: cd server && npm run start
```

### Alternativa com Migrations Explícitas

```
web: cd server && npm run typeorm migration:run && npm run start
```

### Script de Boot Completo

```bash
#!/bin/bash
cd server

# Aguardar banco ficar pronto
until pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER; do
  echo "Aguardando banco..."
  sleep 1
done

# Rodar migrations (se necessário)
npm run typeorm migration:run || true

# Iniciar servidor
npm run start
```

---

## 📋 Checklist de Migrations

### Antes do Deploy

- [ ] Entidades estão corretas em `src/modules/process/entities/`
- [ ] `database.config.ts` tem `synchronize` correto
- [ ] Banco local funciona com `npm run dev`
- [ ] Teste de persistência passa

### Após Deploy no Railway

- [ ] Banco foi criado no Neon
- [ ] Tabelas foram criadas automaticamente
- [ ] Teste de health check passa (`/health`)
- [ ] Teste de CRUD funciona (`POST /api/processes`)

### Validação de Schema

```bash
# Conectar ao banco no Neon
psql postgresql://user:password@host/database

# Listar tabelas
\dt

# Ver schema da tabela
\d processes
\d process_versions

# Sair
\q
```

---

## 🔄 Fluxo de Sincronização

### Desenvolvimento Local

```
1. npm run dev
   ↓
2. TypeORM conecta ao banco
   ↓
3. Compara schema com entidades
   ↓
4. Cria/altera tabelas automaticamente
   ↓
5. Servidor inicia
```

### Produção (Railway)

```
1. Railway inicia container
   ↓
2. npm run start
   ↓
3. TypeORM conecta ao Neon
   ↓
4. Se synchronize=true: cria/altera tabelas
   ↓
5. Se synchronize=false: usa schema existente
   ↓
6. Servidor inicia
```

---

## ⚠️ Cuidados Importantes

### ❌ Não Faça

```typescript
// Nunca use synchronize=true em produção permanentemente
synchronize: true, // ❌ Perigoso!
```

### ✅ Faça

```typescript
// Use synchronize baseado no ambiente
synchronize: process.env.NODE_ENV !== 'production',
```

### 🔒 Segurança

- Backups automáticos no Neon (ativados por padrão)
- Teste migrations em staging antes de produção
- Mantenha histórico de mudanças no Git

---

## 🧪 Teste de Persistência

### Script de Teste

```bash
#!/bin/bash

# Criar processo
PROCESS=$(curl -s -X POST http://localhost:3001/api/processes \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","description":"Persistence test"}')

PROCESS_ID=$(echo $PROCESS | jq -r '.id')

echo "✓ Processo criado: $PROCESS_ID"

# Recuperar processo
RETRIEVED=$(curl -s http://localhost:3001/api/processes/$PROCESS_ID)

NAME=$(echo $RETRIEVED | jq -r '.name')

if [ "$NAME" = "Test" ]; then
  echo "✓ Persistência OK"
else
  echo "✗ Persistência FALHOU"
fi
```

---

## 📞 Troubleshooting

### Erro: "relation does not exist"

**Causa:** Tabelas não foram criadas

**Solução:**
1. Verifique se `synchronize: true` está ativo
2. Reinicie o servidor
3. Verifique logs de erro

### Erro: "duplicate key value"

**Causa:** Dados duplicados no banco

**Solução:**
```sql
-- Limpar dados (apenas em desenvolvimento!)
DELETE FROM process_versions;
DELETE FROM processes;
```

### Erro: "column does not exist"

**Causa:** Schema desatualizado

**Solução:**
1. Verifique entidades em `src/modules/process/entities/`
2. Rode `npm run build`
3. Reinicie servidor

---

## 📚 Referências

- [TypeORM Docs](https://typeorm.io/)
- [TypeORM Synchronize](https://typeorm.io/connection-options)
- [Neon Docs](https://neon.tech/docs/)

---

**Última atualização:** 2026-02-09
