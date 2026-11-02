import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './setup';

/** Nạp .env của service nếu có (DATABASE_URL, PORT...). Biến đã đặt sẵn trong môi trường được ưu tiên. */
function loadEnvFile(): void {
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

async function bootstrap(): Promise<void> {
  loadEnvFile();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Sau reverse proxy (Nginx, Cloudflare...) phải bật để request.ip là IP người dùng chứ không phải IP proxy,
  // nếu không mọi người dùng bị tính chung một hạn mức. Ví dụ: TRUST_PROXY=1
  if (process.env.TRUST_PROXY) {
    const value = Number(process.env.TRUST_PROXY);
    app.set('trust proxy', Number.isNaN(value) ? process.env.TRUST_PROXY : value);
  }
  configureApp(app);
  // Dev: FE chạy ở cổng khác nên cần CORS; môi trường thật nên giới hạn origin.
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}/api`);
}

void bootstrap();
