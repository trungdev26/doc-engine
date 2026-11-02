import { INestApplication, ValidationPipe } from '@nestjs/common';

/** Cấu hình dùng chung cho main.ts và e2e test để hai nơi không lệch nhau. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
}
