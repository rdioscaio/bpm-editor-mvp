# BPM Editor MVP

Um editor BPMN funcional com persistência em PostgreSQL, validação básica e exports.

## 🚀 Características do MVP

- ✅ Editor BPMN com drag-and-drop (bpmn-js)
- ✅ Biblioteca de Processos (listagem, criar, deletar)
- ✅ Painel de propriedades mínimo (nome, descrição, responsável, SLA, tags)
- ✅ Validação básica de BPMN (start/end/gateway/nome)
- ✅ Persistência em PostgreSQL com versionamento por snapshot
- ✅ Export BPMN XML
- ✅ Export SVG
- ✅ API REST com NestJS

## 📋 Pré-requisitos

- Node.js 18+
- PostgreSQL 12+
- pnpm (ou npm/yarn)

## 🛠️ Setup Inicial

### 1. Instalar dependências

```bash
cd /home/ubuntu/bpm-editor-mvp
pnpm install
```

### 2. Configurar banco de dados

```bash
# Criar arquivo .env no server
cd server
cp .env.example .env

# Editar .env com suas credenciais PostgreSQL
# DB_HOST=localhost
# DB_PORT=5432
# DB_USER=postgres
# DB_PASSWORD=postgres
# DB_NAME=bpm_editor
```

### 3. Criar banco de dados

```bash
# Conectar ao PostgreSQL
psql -U postgres

# Criar banco
CREATE DATABASE bpm_editor;

# Sair
\q
```

### 4. Executar migrations (TypeORM)

```bash
cd server
npm run db:setup
```

## 🚀 Rodar Localmente

### Terminal 1 - Servidor (NestJS)

```bash
cd server
npm run dev
# Servidor rodando em http://localhost:3001
```

### Terminal 2 - Cliente (React)

```bash
cd client
npm run dev
# Cliente rodando em http://localhost:5173
```

Abra http://localhost:5173 no navegador.

## 📁 Estrutura do Projeto

```
bpm-editor-mvp/
├── server/                    # Backend NestJS
│   ├── src/
│   │   ├── main.ts           # Entry point
│   │   ├── app.module.ts     # Módulo principal
│   │   └── modules/
│   │       └── process/      # Módulo de processos
│   │           ├── entities/ # Entidades TypeORM
│   │           ├── dto/      # Data Transfer Objects
│   │           ├── process.service.ts
│   │           ├── process.controller.ts
│   │           └── process.module.ts
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
├── client/                    # Frontend React
│   ├── src/
│   │   ├── main.tsx          # Entry point
│   │   ├── App.tsx           # Componente principal
│   │   ├── index.css         # Estilos globais
│   │   ├── components/       # Componentes React
│   │   │   ├── BpmnEditor.tsx
│   │   │   └── BpmnPropertiesPanel.tsx
│   │   ├── pages/            # Páginas
│   │   │   ├── ProcessLibrary.tsx
│   │   │   └── Editor.tsx
│   │   └── services/         # Serviços API
│   │       └── api.ts
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── package.json
│
├── package.json              # Root package.json (workspace)
└── README.md
```

## 🔌 API Endpoints

### Processos

- `GET /api/processes` - Listar todos os processos
- `POST /api/processes` - Criar novo processo
- `GET /api/processes/:id` - Obter detalhes de um processo
- `PUT /api/processes/:id` - Atualizar processo
- `DELETE /api/processes/:id` - Deletar processo

### Validação

- `POST /api/processes/:id/validate` - Validar BPMN

### Versões

- `POST /api/processes/:id/versions` - Salvar nova versão
- `GET /api/processes/:id/versions` - Listar versões
- `GET /api/processes/:id/versions/:versionId` - Obter versão específica

## 📊 Modelo de Dados

### Tabela: processes

```sql
CREATE TABLE processes (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  responsible VARCHAR(255),
  tags TEXT[],
  currentVersionId UUID,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);
```

### Tabela: process_versions

```sql
CREATE TABLE process_versions (
  id UUID PRIMARY KEY,
  processId UUID NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  versionNumber INT NOT NULL,
  bpmnContent JSONB NOT NULL,
  svgContent TEXT,
  description TEXT,
  createdAt TIMESTAMP DEFAULT NOW()
);
```

## ✅ Validação BPMN

O MVP implementa validação básica:

- ✓ Deve haver pelo menos um Start Event
- ✓ Deve haver pelo menos um End Event
- ✓ Tasks devem ter nome
- ✓ Flows devem referenciar elementos válidos

## 📥 Exports

### BPMN XML

Clique em "Export XML" para baixar o diagrama em formato BPMN 2.0 XML.

### SVG

Clique em "Export SVG" para baixar o diagrama como imagem vetorial.

## 🧪 Testes

```bash
# Testes unitários (quando implementados)
npm run test

# Testes E2E (quando implementados)
npm run test:e2e
```

## 🐛 Troubleshooting

### Erro de conexão com PostgreSQL

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solução:** Verifique se PostgreSQL está rodando:

```bash
# macOS (Homebrew)
brew services start postgresql

# Linux (systemd)
sudo systemctl start postgresql

# Windows
# Abra Services.msc e inicie o PostgreSQL
```

### Porta 3001 ou 5173 já em uso

```bash
# Mudar porta do servidor
PORT=3002 npm run dev:server

# Mudar porta do cliente no vite.config.ts
# server: { port: 5174 }
```

### Erro ao importar bpmn-js

Se receber erro ao importar bpmn-js, certifique-se de que as dependências estão instaladas:

```bash
cd client
npm install bpmn-js diagram-js --save
```

## 📝 Próximos Passos (Fase 2+)

- [ ] Colaboração em tempo real (WebSocket + OT/CRDT)
- [ ] Multi-tenancy com RLS
- [ ] SSO/SAML
- [ ] Governança (fluxo de aprovação)
- [ ] Auditoria imutável
- [ ] Comentários e threads
- [ ] Diff entre versões
- [ ] PDF avançado com RACI, Risco, SLA

## 📄 Licença

MIT

## 👥 Contribuindo

1. Fork o repositório
2. Criar branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abrir um Pull Request

---

**Construído com ❤️ usando React, NestJS e PostgreSQL**
