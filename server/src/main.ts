import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // CORS - Origens permitidas (vem de variável de ambiente)
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
  const allowedOrigins = corsOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const originMatchers = allowedOrigins.map((origin) => {
    if (!origin.includes('*')) {
      return (value: string) => value === origin;
    }

    const escapedOrigin = origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escapedOrigin.replace(/\\\*/g, '.*')}$`);
    return (value: string) => regex.test(value);
  });

  app.enableCors({
    origin: (origin, callback) => {
      // Sem Origin normalmente é chamada server-to-server/healthcheck.
      if (!origin) {
        callback(null, true);
        return;
      }

      const allowed = originMatchers.some((matcher) => matcher(origin));
      callback(allowed ? null : new Error(`Origin ${origin} não permitida pelo CORS`), allowed);
    },
    credentials: true,
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`🔐 CORS allowed origins: ${allowedOrigins.join(', ')}`);
}

bootstrap();
