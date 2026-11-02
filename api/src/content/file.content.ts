import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { Lesson, Skill, VideoCard, VideoLesson } from '../contracts';
import { ContentRepository, UnitView, toVideoCard } from './content.repository';
import { StaticContent } from './static.content';
import { ParsedPack } from './validate';

interface Saved {
  lessons: Record<string, Lesson>;
  /** skill -> band -> unit -> danh sách id bài, theo thứ tự thêm vào. */
  units: Record<string, Record<string, { id: string; title: string; lessonIds: string[] }[]>>;
}

/**
 * Bài mẫu trong code cộng với bài do người dùng soạn, lưu vào một file JSON.
 * Dùng khi chưa có DATABASE_URL: vẫn soạn và lưu bài được, chỉ là chưa dùng Postgres.
 */
export class FileContent extends ContentRepository {
  readonly writable = true;

  private readonly file =
    process.env.CONTENT_FILE ?? join(process.cwd(), 'data', 'content.json');
  private readonly builtIn = new StaticContent();
  private saved: Saved = this.load();

  async lesson(id: string): Promise<Lesson> {
    return this.saved.lessons[id] ?? this.builtIn.lesson(id);
  }

  async units(skill: Skill, band: string): Promise<UnitView[]> {
    const units = await this.builtIn.units(skill, band);
    const result = units.map(unit => ({ ...unit, lessons: [...unit.lessons] }));
    for (const extra of this.saved.units[skill]?.[band] ?? []) {
      let target = result.find(unit => unit.id === extra.id);
      if (!target) {
        target = { id: extra.id, title: extra.title, lessons: [] };
        result.push(target);
      }
      target.title = extra.title;
      for (const id of extra.lessonIds) {
        const lesson = this.saved.lessons[id];
        const existing = target.lessons.find(item => item.id === id);
        if (existing) {
          existing.title = lesson.title;
        } else {
          target.lessons.push({ id, title: lesson.title });
        }
      }
    }
    return result;
  }

  async videos(): Promise<VideoCard[]> {
    const cards: VideoCard[] = [];
    for (const [band, units] of Object.entries(this.saved.units['video'] ?? {})) {
      for (const unit of units) {
        for (const id of unit.lessonIds) {
          const lesson = this.saved.lessons[id];
          if (lesson?.kind === 'video') {
            cards.push(toVideoCard(lesson as VideoLesson, band));
          }
        }
      }
    }
    return cards;
  }

  async importPack(pack: ParsedPack): Promise<number> {
    const next = structuredClone(this.saved);
    const bandUnits = ((next.units[pack.skill] ??= {})[pack.band] ??= []);
    let unit = bandUnits.find(item => item.id === pack.unit.id);
    if (!unit) {
      unit = { id: pack.unit.id, title: pack.unit.title, lessonIds: [] };
      bandUnits.push(unit);
    }
    unit.title = pack.unit.title;
    for (const lesson of pack.lessons) {
      next.lessons[lesson.id] = lesson;
      if (!unit.lessonIds.includes(lesson.id)) {
        unit.lessonIds.push(lesson.id);
      }
    }
    this.persist(next);
    this.saved = next;
    return pack.lessons.length;
  }

  private load(): Saved {
    if (!existsSync(this.file)) {
      return { lessons: {}, units: {} };
    }
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8'));
      return { lessons: raw.lessons ?? {}, units: raw.units ?? {} };
    } catch {
      return { lessons: {}, units: {} };
    }
  }

  private persist(data: Saved): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8');
    renameSync(temp, this.file);
  }
}
