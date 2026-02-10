# Quick Start - BPM Editor MVP

## 🚀 Começar em 2 Minutos

### Pré-requisitos
- Docker + Docker Compose
- Node.js 18+
- pnpm

### Comando Único

```bash
bash setup_local.sh
```

Isso vai:
1. ✓ Iniciar PostgreSQL (Docker)
2. ✓ Instalar dependências
3. ✓ Compilar servidor
4. ✓ Rodar migrations automáticas
5. ✓ Testar persistência
6. ✓ Iniciar frontend

---

## 🧪 Teste Rápido (Após Setup)

### 1. Abrir Editor
```
http://localhost:5173
```

### 2. Criar Processo
- Clique em "+ Novo Processo"
- Nome: "Meu Primeiro Processo"
- Clique em "✓ Criar Processo"

### 3. Arrastar Task
- Clique em "✎ Editar"
- No canvas, arraste uma **Task** do painel esquerdo
- Solte no canvas

### 4. Salvar
- Clique em "💾 Salvar"
- Aguarde mensagem de sucesso

### 5. Recarregar (Testar Persistência)
- Pressione F5 ou Ctrl+R
- Confirme que o processo ainda está lá

### 6. Exportar
- Clique em "📥 Export XML" (baixa arquivo .bpmn)
- Clique em "🖼️ Export SVG" (baixa imagem)

---

## 📋 Estrutura do Projeto

```
bpm-editor-mvp/
├── server/              # Backend NestJS
├── client/              # Frontend React
├── docker-compose.yml   # PostgreSQL local
├── setup_local.sh       # Script de setup
├── DEPLOYMENT.md        # Guia de deploy
├── ENVIRONMENT_VARS.md  # Variáveis de ambiente
├── CORS_CHECKLIST.md    # Validação CORS
└── MIGRATIONS.md        # Estratégia de banco
```

---

## 🔗 Links Importantes

| Serviço | URL | Descrição |
|---------|-----|-----------|
| Frontend | http://localhost:5173 | Editor BPMN |
| Backend | http://localhost:3001 | API REST |
| Health | http://localhost:3001/health | Status do servidor |
| Banco | localhost:5432 | PostgreSQL |

---

## 🛑 Parar Serviços

```bash
# Parar tudo
Ctrl+C (no terminal do setup_local.sh)

# Parar apenas banco
docker-compose down

# Limpar tudo (incluindo dados)
docker-compose down -v
```

---

## 🐛 Problemas Comuns

### "Port already in use"
```bash
# Liberar porta 5173
lsof -ti:5173 | xargs kill -9

# Liberar porta 3001
lsof -ti:3001 | xargs kill -9
```

### "Cannot connect to Docker daemon"
```bash
# Iniciar Docker
sudo systemctl start docker

# Ou no macOS
open /Applications/Docker.app
```

### "pnpm not found"
```bash
npm install -g pnpm
```

---

## ✅ Próximos Passos

1. **Testar localmente** (este guia)
2. **Ler DEPLOYMENT.md** (para entender deploy)
3. **Preparar contas** (Neon, Railway, Vercel)
4. **Fazer deploy** (seguir DEPLOYMENT.md)

---

## 📞 Suporte

- Erro no setup? Verifique `QUICK_START.md`
- Erro no deploy? Verifique `DEPLOYMENT.md`
- Erro de variáveis? Verifique `ENVIRONMENT_VARS.md`
- Erro de CORS? Verifique `CORS_CHECKLIST.md`

---

**Última atualização:** 2026-02-09
