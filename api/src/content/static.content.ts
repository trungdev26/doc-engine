import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Lesson, Skill, VideoCard } from '../contracts';
import { ContentRepository, UnitView } from './content.repository';
import { LESSONS, UNITS } from './lessons';

/** Bài học mẫu trong code, chỉ đọc. FileContent dùng nó làm nền cho bài do người dùng soạn. */
export class StaticContent extends ContentRepository {
  readonly writable = false;

  private readonly byId = new Map(LESSONS.map(lesson => [lesson.id, lesson]));

  async importPack(): Promise<number> {
    throw new ServiceUnavailableException(
      'Máy chủ chưa kết nối cơ sở dữ liệu nên chưa lưu được bài học mới.',
    );
  }

  async videos(): Promise<VideoCard[]> {
    return [];
  }

  async lesson(id: string): Promise<Lesson> {
    const found = this.byId.get(id);
    if (!found) {
      throw new NotFoundException(`Không có bài học ${id}`);
    }
    return found;
  }

  async units(skill: Skill, band: string): Promise<UnitView[]> {
    return (UNITS[skill][band] ?? []).map(unit => ({
      id: unit.id,
      title: unit.title,
      lessons: unit.lessonIds.map(id => ({ id, title: this.byId.get(id)!.title })),
    }));
  }
}
