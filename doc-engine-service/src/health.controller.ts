import { Controller, Get } from '@nestjs/common';

/**
 * Endpoint công khai, không chạm database. Dùng để một lịch bên ngoài gọi định kỳ,
 * giữ cho process trên Render free không bị tắt sau khoảng 15 phút không có request.
 */
@Controller('health')
export class HealthController {
  @Get()
  health(): { ok: true } {
    return { ok: true };
  }
}
