#!/bin/bash

set -e

echo "🚀 BPM Editor MVP - Setup Local"
echo "================================"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função para print com cor
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

if ! command -v docker &> /dev/null; then
  print_error "Docker não encontrado. Instale em: https://docs.docker.com/get-docker/"
  exit 1
fi
print_status "Docker encontrado"

if ! command -v docker-compose &> /dev/null; then
  print_error "Docker Compose não encontrado"
  exit 1
fi
print_status "Docker Compose encontrado"

if ! command -v node &> /dev/null; then
  print_error "Node.js não encontrado. Instale em: https://nodejs.org/"
  exit 1
fi
print_status "Node.js encontrado ($(node --version))"

if ! command -v pnpm &> /dev/null; then
  print_info "pnpm não encontrado. Instalando..."
  npm install -g pnpm
fi
print_status "pnpm encontrado ($(pnpm --version))"

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

# 6. Criar arquivo .env local
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
EOF
  print_status ".env criado"
else
  print_status ".env já existe"
fi

# 7. Testar healthcheck
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

# 8. Testar persistência
echo ""
print_info "Testando persistência..."

# Criar processo
PROCESS_ID=$(curl -s -X POST http://localhost:3001/api/processes \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Process","description":"Setup test"}' | jq -r '.id')

if [ -z "$PROCESS_ID" ] || [ "$PROCESS_ID" = "null" ]; then
  print_error "Erro ao criar processo"
  kill $SERVER_PID 2>/dev/null || true
  exit 1
fi
print_status "Processo criado: $PROCESS_ID"

# Recuperar processo
RETRIEVED=$(curl -s http://localhost:3001/api/processes/$PROCESS_ID | jq -r '.name')

if [ "$RETRIEVED" = "Test Process" ]; then
  print_status "Persistência funcionando ✓"
else
  print_error "Persistência falhou"
  kill $SERVER_PID 2>/dev/null || true
  exit 1
fi

# 9. Iniciar cliente
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
