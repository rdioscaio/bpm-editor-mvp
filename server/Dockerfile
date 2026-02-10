FROM node:20-alpine

WORKDIR /app

# Deterministic install for production build
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

CMD ["npm", "run", "start:prod"]
