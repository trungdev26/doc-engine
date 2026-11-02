import { Lesson, Skill, VideoCard, VideoLesson } from '../contracts';
import { BANDS } from './bands';
import { ParsedPack } from './validate';

export interface UnitView {
  id: string;
  title: string;
  lessons: { id: string; title: string }[];
}

/** Nơi lấy và ghi bài học. Có hai bản: dữ liệu mẫu trong code (chỉ đọc) và Postgres (Neon). */
export abstract class ContentRepository {
  /** true khi ghi được bài mới. Bài mẫu trong code là chỉ đọc. */
  abstract readonly writable: boolean;
  /** Ném NotFoundException nếu không có bài. */
  abstract lesson(id: string): Promise<Lesson>;
  abstract units(skill: Skill, band: string): Promise<UnitView[]>;
  /** Danh sách video kèm chủ đề và trình độ, không gồm phụ đề. */
  abstract videos(): Promise<VideoCard[]>;
  /** Ghi một gói bài học đã được kiểm tra. Bài trùng id được cập nhật. Trả về số bài đã ghi. */
  abstract importPack(pack: ParsedPack): Promise<number>;
}

/** Dựng thẻ danh sách từ một bài video và band chứa nó. Dùng chung cho mọi nơi lưu nội dung. */
export function toVideoCard(lesson: VideoLesson, band: string): VideoCard {
  return {
    id: lesson.id,
    title: lesson.title,
    ...(lesson.channel ? { channel: lesson.channel } : {}),
    topic: lesson.topic?.trim() || 'Khác',
    level: BANDS.find(item => item.id === band)?.cefr ?? '',
    band,
    ...(lesson.durationSeconds ? { durationSeconds: lesson.durationSeconds } : {}),
    source: lesson.source,
    ...(lesson.thumbnail ? { thumbnail: lesson.thumbnail } : {}),
  };
}
