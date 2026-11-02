import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { LoginRequired } from '../auth/auth.guard';
import { OptionalUserId, UserId } from '../auth/current-user';
import { LearningService } from './learning.service';
import { Track } from '../contracts';

class UpdateProfileDto {
  @IsOptional()
  @IsIn(['dev', 'english'])
  track?: Track;

  @IsOptional()
  @IsString()
  band?: string;
}

class CompleteLessonDto {
  @IsInt()
  @Min(0)
  @Max(100)
  score!: number;
}

@Controller()
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  @Get('bands')
  bands() {
    return this.learning.bands();
  }

  @Get('profile')
  @LoginRequired()
  profile(@UserId() userId: string) {
    return this.learning.getProfile(userId);
  }

  @Put('profile')
  @LoginRequired()
  updateProfile(@UserId() userId: string, @Body() dto: UpdateProfileDto) {
    return this.learning.updateProfile(userId, dto);
  }

  @Get('progress')
  @LoginRequired()
  progress(@UserId() userId: string) {
    return this.learning.progress(userId);
  }

  @Get('skills/:skill/roadmap')
  async roadmap(
    @OptionalUserId() userId: string | undefined,
    @Param('skill') skill: string,
    @Query('band') band?: string,
  ) {
    if (!this.learning.isSkill(skill)) {
      throw new BadRequestException(`Kỹ năng không hợp lệ: ${skill}`);
    }
    // Khách không có hồ sơ nên mặc định Band 3.0 và không có bài nào đã hoàn thành.
    const chosen = band ?? (userId ? (await this.learning.getProfile(userId)).band : '3.0');
    return this.learning.roadmap(userId, skill, chosen);
  }

  /** Danh sách video kèm chủ đề và trình độ để dựng trang xem video. Công khai. */
  @Get('videos')
  videos() {
    return this.learning.videos();
  }

  @Get('lessons/:id')
  lesson(@Param('id') id: string) {
    return this.learning.lesson(id);
  }

  @Post('lessons/:id/complete')
  @LoginRequired()
  complete(@UserId() userId: string, @Param('id') id: string, @Body() dto: CompleteLessonDto) {
    return this.learning.complete(userId, id, dto.score);
  }
}
