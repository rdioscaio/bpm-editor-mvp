import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // CORS - Origens permitidas
  const allowedOrigins = [
    'http://localhost:5173',           // Desenvolvimento
    'http://localhost:3000',           // Desenvolvimento alternativo
    'https://bpm-editor.vercel.app',   // Produção (Vercel)
  ];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 Server running on http://localhost:${port}`);
}

bootstrap();
