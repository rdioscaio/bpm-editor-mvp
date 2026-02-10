#!/bin/bash

set -e

echo "🚀 BPM Editor MVP - Setup Local"
echo "================================"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
  echo -e "${GREEN}✓${NC} $1"
}

print_error() {
  echo -e "${RED}✗${NC} $1"
}

print_info() {
  echo -e "${YELLOW}ℹ${NC} $1"
}

# 1. Verificar pré-requisitos
echo ""
print_info "Verificando pré-requisitos..."

# Node.js
if ! command -v node &> /dev/null; then
  print_error "Node.js não encontrado"
  echo "Instale em: https://nodejs.org/ (v18+)"
  exit 1
fi
NODE_VERSION=$(node --version)
print_status "Node.js $NODE_VERSION"

# npm
if ! command -v npm &> /dev/null; then
  print_error "npm não encontrado"
  exit 1
fi
NPM_VERSION=$(npm --version)
print_status "npm $NPM_VERSION"

# pnpm
if ! command -v pnpm &> /dev/null; then
  print_info "pnpm não encontrado. Instalando..."
  npm install -g pnpm
fi
PNPM_VERSION=$(pnpm --version)
print_status "pnpm $PNPM_VERSION"

# Docker
if ! command -v docker &> /dev/null; then
  print_error "Docker não encontrado"
  echo "Instale em: https://docs.docker.com/get-docker/"
  exit 1
fi
DOCKER_VERSION=$(docker --version)
print_status "$DOCKER_VERSION"

# Docker Compose
if ! command -v docker-compose &> /dev/null; then
  print_error "Docker Compose não encontrado"
  exit 1
fi
DC_VERSION=$(docker-compose --version)
print_status "$DC_VERSION"

# jq (para parsing JSON)
if ! command -v jq &> /dev/null; then
  print_info "jq não encontrado. Instalando..."
  if command -v apt-get &> /dev/null; then
    sudo apt-get update && sudo apt-get install -y jq
  elif command -v brew &> /dev/null; then
    brew install jq
  else
    print_error "Não consegui instalar jq. Instale manualmente."
    exit 1
  fi
fi
print_status "jq instalado"

# 2. Parar containers antigos
echo ""
print_info "Parando containers antigos..."
docker-compose down 2>/dev/null || true
print_status "Containers parados"

# 3. Iniciar PostgreSQL
echo ""
print_info "Iniciando PostgreSQL..."
docker-compose up -d postgres
print_status "PostgreSQL iniciado"

# Aguardar banco ficar pronto
print_info "Aguardando banco ficar pronto..."
for i in {1..30}; do
  if docker-compose exec -T postgres pg_isready -U postgres &>/dev/null; then
    print_status "Banco pronto"
    break
  fi
  if [ $i -eq 30 ]; then
    print_error "Timeout aguardando banco"
    exit 1
  fi
  sleep 1
done

# 4. Instalar dependências
echo ""
print_info "Instalando dependências..."
pnpm install
print_status "Dependências instaladas"

# 5. Build do servidor
echo ""
print_info "Compilando servidor..."
cd server
npm run build
cd ..
print_status "Servidor compilado"

# 6. Build do cliente
echo ""
print_info "Compilando cliente..."
cd client
npm run build
cd ..
print_status "Cliente compilado"

# 7. Criar arquivo .env local
echo ""
print_info "Configurando variáveis de ambiente..."
if [ ! -f server/.env ]; then
  cat > server/.env << 'EOF'
NODE_ENV=development
PORT=3001

DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=bpm_editor

CORS_ORIGIN=http://localhost:5173,http://localhost:3000
TYPEORM_SYNCHRONIZE=true
EOF
  print_status ".env criado"
else
  print_status ".env já existe"
fi

# 8. Testar healthcheck
echo ""
print_info "Iniciando servidor em background..."
cd server
npm run start > /tmp/server.log 2>&1 &
SERVER_PID=$!
cd ..

# Aguardar servidor iniciar
print_info "Aguardando servidor iniciar..."
for i in {1..30}; do
  if curl -s http://localhost:3001/health &>/dev/null; then
    print_status "Servidor respondendo"
    break
  fi
  if [ $i -eq 30 ]; then
    print_error "Timeout aguardando servidor"
    kill $SERVER_PID 2>/dev/null || true
    cat /tmp/server.log
    exit 1
  fi
  sleep 1
done

# 9. Testar persistência
echo ""
print_info "Testando persistência..."

# Criar processo
PROCESS_RESPONSE=$(curl -s -X POST http://localhost:3001/api/processes \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Process","description":"Setup test"}')

PROCESS_ID=$(echo "$PROCESS_RESPONSE" | jq -r '.id // empty')

if [ -z "$PROCESS_ID" ]; then
  print_error "Erro ao criar processo"
  print_error "Resposta: $PROCESS_RESPONSE"
  kill $SERVER_PID 2>/dev/null || true
  exit 1
fi
print_status "Processo criado: $PROCESS_ID"

# Recuperar processo
RETRIEVED=$(curl -s http://localhost:3001/api/processes/$PROCESS_ID | jq -r '.name // empty')

if [ "$RETRIEVED" = "Test Process" ]; then
  print_status "Persistência funcionando ✓"
else
  print_error "Persistência falhou"
  kill $SERVER_PID 2>/dev/null || true
  exit 1
fi

# 10. Iniciar cliente
echo ""
print_info "Iniciando cliente (Ctrl+C para parar)..."
cd client
npm run dev &
CLIENT_PID=$!
cd ..

# Aguardar cliente
sleep 3

echo ""
echo "================================"
echo -e "${GREEN}✓ Setup concluído com sucesso!${NC}"
echo "================================"
echo ""
echo "📍 Endpoints:"
echo "  • Frontend: http://localhost:5173"
echo "  • Backend:  http://localhost:3001"
echo "  • Health:   http://localhost:3001/health"
echo ""
echo "🧪 Teste rápido:"
echo "  1. Abra http://localhost:5173"
echo "  2. Crie um novo processo"
echo "  3. Arraste elementos no canvas"
echo "  4. Clique em 'Salvar'"
echo "  5. Recarregue a página"
echo "  6. Exporte BPMN XML ou SVG"
echo ""
echo "Para parar:"
echo "  • Ctrl+C (para cliente)"
echo "  • docker-compose down (para banco)"
echo ""

# Manter script rodando
wait
