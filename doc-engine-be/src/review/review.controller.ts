import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LoginRequired } from '../auth/auth.guard';
import { UserId } from '../auth/current-user';
import { ReviewGrade } from '../contracts';
import { ReviewService } from './review.service';

class SaveWordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  word!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  meaning!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  ipa?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  example?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  groupIds?: string[];
}

class GradeDto {
  @IsIn(['again', 'good', 'easy'])
  grade!: ReviewGrade;
}

class GroupDto {
  @IsString()
  @MaxLength(200)
  name!: string;
}

class WordGroupsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  groupIds!: string[];
}

class QuizQuery {
  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  count?: number;
}

/** Từ đã lưu và nhóm từ là dữ liệu cá nhân nên cả controller đòi đăng nhập. */
@Controller('review')
@LoginRequired()
export class ReviewController {
  constructor(private readonly review: ReviewService) {}

  @Get('summary')
  summary(@UserId() userId: string) {
    return this.review.summary(userId);
  }

  @Get('words')
  words(
    @UserId() userId: string,
    @Query('groupId') groupId?: string,
    @Query('search') search?: string,
  ) {
    return this.review.list(userId, { groupId, search });
  }

  @Get('due')
  due(@UserId() userId: string, @Query('groupId') groupId?: string) {
    return this.review.due(userId, groupId);
  }

  @Get('quiz')
  quiz(@UserId() userId: string, @Query() query: QuizQuery) {
    return this.review.quiz(userId, query.groupId, query.count ?? 10);
  }

  @Post('words')
  save(@UserId() userId: string, @Body() dto: SaveWordDto) {
    return this.review.save(userId, dto);
  }

  @Post('words/:id/grade')
  @HttpCode(200)
  grade(@UserId() userId: string, @Param('id') id: string, @Body() dto: GradeDto) {
    return this.review.grade(userId, id, dto.grade);
  }

  @Put('words/:id/groups')
  setGroups(@UserId() userId: string, @Param('id') id: string, @Body() dto: WordGroupsDto) {
    return this.review.setWordGroups(userId, id, dto.groupIds);
  }

  @Delete('words/:id')
  @HttpCode(204)
  async remove(@UserId() userId: string, @Param('id') id: string) {
    await this.review.remove(userId, id);
  }

  @Get('groups')
  groups(@UserId() userId: string) {
    return this.review.groups(userId);
  }

  @Post('groups')
  createGroup(@UserId() userId: string, @Body() dto: GroupDto) {
    return this.review.createGroup(userId, dto.name);
  }

  @Patch('groups/:id')
  renameGroup(@UserId() userId: string, @Param('id') id: string, @Body() dto: GroupDto) {
    return this.review.renameGroup(userId, id, dto.name);
  }

  @Delete('groups/:id')
  @HttpCode(204)
  async deleteGroup(@UserId() userId: string, @Param('id') id: string) {
    await this.review.deleteGroup(userId, id);
  }
}
