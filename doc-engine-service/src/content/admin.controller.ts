import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { AdminOnly } from '../auth/auth.guard';
import { ContentRepository } from './content.repository';
import { buildVideoPack } from './video-import';
import { ParsedPack, parsePack } from './validate';

class ImportVideoDto {
  @IsOptional() @IsString() @MaxLength(300) youtube?: string;
  @IsOptional() @IsString() @MaxLength(500) fileUrl?: string;
  @IsOptional() @IsString() @MaxLength(500) subtitleUrl?: string;
  @IsOptional() @IsString() @MaxLength(400_000) subtitleText?: string;
  @IsOptional() @IsString() @MaxLength(500) translationUrl?: string;
  @IsOptional() @IsString() @MaxLength(400_000) translationText?: string;

  @IsString() @Matches(/^[a-z0-9-]+$/) @MaxLength(80) id!: string;
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(120) channel?: string;
  @IsOptional() @IsString() @MaxLength(60) topic?: string;
  @IsOptional() @IsInt() @Min(1) @Max(86_400) durationSeconds?: number;
  @IsOptional() @IsString() @MaxLength(500) thumbnail?: string;
  @IsOptional() @IsString() @MaxLength(200) credit?: string;
  @IsString() @MaxLength(20) band!: string;
  @IsString() @Matches(/^[a-z0-9-]+$/) @MaxLength(80) unitId!: string;
  @IsString() @MaxLength(200) unitTitle!: string;
}

/** Soạn và nạp nội dung qua giao diện. Chỉ tài khoản admin được ghi. */
@Controller('admin/content')
@AdminOnly()
export class AdminContentController {
  constructor(private readonly content: ContentRepository) {}

  /** Cho giao diện biết có lưu được bài mới không. */
  @Get('status')
  status() {
    return { writable: this.content.writable };
  }

  /**
   * Dựng bài xem video từ link YouTube (hoặc tệp video) và phụ đề SRT/VTT, rồi lưu luôn.
   * Chỉ dùng cho video và phụ đề bạn có quyền sử dụng (giấy phép mở hoặc của chính bạn).
   */
  @Post('videos')
  async importVideo(@Body() dto: ImportVideoDto) {
    let pack: ParsedPack;
    try {
      pack = parsePack(await buildVideoPack(dto));
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    const imported = await this.content.importPack(pack);
    return { imported, cues: (pack.lessons[0] as { cues: unknown[] }).cues.length, skipped: pack.skipped };
  }

  @Post('packs')
  async importPack(@Body() body: unknown) {
    let pack: ParsedPack;
    try {
      pack = parsePack(body);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    const imported = await this.content.importPack(pack);
    return { imported, skipped: pack.skipped };
  }
}
