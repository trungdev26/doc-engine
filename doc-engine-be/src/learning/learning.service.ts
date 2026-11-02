import { Injectable, NotFoundException } from '@nestjs/common';
import { BANDS } from '../content/bands';
import { ContentRepository } from '../content/content.repository';
import {
  Band,
  CompletedLesson,
  Lesson,
  Profile,
  Roadmap,
  SKILLS,
  Skill,
  Track,
} from '../contracts';
import { Store } from '../store/store';

@Injectable()
export class LearningService {
  constructor(
    private readonly store: Store,
    private readonly content: ContentRepository,
  ) {}

  bands(): Band[] {
    return BANDS;
  }

  async getProfile(userId: string): Promise<Profile> {
    return (await this.store.read(userId)).profile;
  }

  async updateProfile(
    userId: string,
    patch: { track?: Track; band?: string },
  ): Promise<Profile> {
    if (patch.band && !BANDS.some(band => band.id === patch.band)) {
      throw new NotFoundException(`Không có band ${patch.band}`);
    }
    return this.store.update(userId, data => {
      data.profile = { ...data.profile, ...patch };
      return data.profile;
    });
  }

  isSkill(value: string): value is Skill {
    return (SKILLS as string[]).includes(value);
  }

  /** `userId` bỏ trống là khách: vẫn xem được lộ trình nhưng chưa có bài nào đánh dấu hoàn thành. */
  async roadmap(userId: string | undefined, skill: Skill, band: string): Promise<Roadmap> {
    const completed = userId ? (await this.store.read(userId)).completed : {};
    return this.buildRoadmap(completed, skill, band);
  }

  private async buildRoadmap(
    completed: Record<string, CompletedLesson>,
    skill: Skill,
    band: string,
  ): Promise<Roadmap> {
    // Band chưa có nội dung trả lộ trình rỗng thay vì lỗi.
    const units = (await this.content.units(skill, band)).map(unit => ({
      id: unit.id,
      title: unit.title,
      lessons: unit.lessons.map(lesson => ({
        id: lesson.id,
        title: lesson.title,
        available: true,
        completed: !!completed[lesson.id],
      })),
    }));
    const lessons = units.flatMap(unit => unit.lessons);
    return {
      skill,
      band,
      units,
      completedCount: lessons.filter(lesson => lesson.completed).length,
      totalCount: lessons.length,
    };
  }

  lesson(id: string): Promise<Lesson> {
    return this.content.lesson(id);
  }

  videos() {
    return this.content.videos();
  }

  async complete(userId: string, id: string, score: number): Promise<CompletedLesson> {
    await this.lesson(id);
    return this.store.update(userId, data => {
      const previous = data.completed[id];
      const entry: CompletedLesson = {
        completedAt: new Date().toISOString(),
        // Giữ điểm cao nhất để làm lại bài không làm tụt tiến độ.
        score: Math.max(previous?.score ?? 0, score),
      };
      data.completed[id] = entry;
      return entry;
    });
  }

  async progress(userId: string): Promise<Record<Skill, { completed: number; total: number }>> {
    // Đọc trạng thái người dùng đúng một lần rồi dùng chung cho mọi kỹ năng.
    const data = await this.store.read(userId);
    const entries = await Promise.all(
      SKILLS.map(async skill => {
        const { completedCount, totalCount } = await this.buildRoadmap(
          data.completed,
          skill,
          data.profile.band,
        );
        return [skill, { completed: completedCount, total: totalCount }] as const;
      }),
    );
    return Object.fromEntries(entries) as Record<Skill, { completed: number; total: number }>;
  }
}
