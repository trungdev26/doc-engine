import { NotFoundException } from '@nestjs/common';
import { Lesson, Skill, VideoCard, VideoLesson } from '../contracts';
import { ContentRepository, UnitView, toVideoCard } from './content.repository';
import { LESSONS, UNITS } from './lessons';
import { ParsedPack } from './validate';
import { PgPool } from '../store/pg.pool';

export const CONTENT_SCHEMA_SQL = [
  `create table if not exists lessons (
    id text primary key,
    skill text not null,
    kind text not null,
    title text not null,
    body jsonb not null,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists units (
    skill text not null,
    band text not null,
    id text not null,
    title text not null,
    position int not null default 0,
    primary key (skill, band, id)
  )`,
  `create table if not exists unit_lessons (
    skill text not null,
    band text not null,
    unit_id text not null,
    lesson_id text not null references lessons (id) on delete cascade,
    position int not null default 0,
    primary key (skill, band, unit_id, lesson_id)
  )`,
];

/** Bài học trong Postgres (Neon). Nạp dữ liệu bằng `importPack` hoặc `seedBuiltIn`. */
export class PgContent extends ContentRepository {
  readonly writable = true;

  constructor(private readonly pool: PgPool) {
    super();
  }

  async ensureSchema(): Promise<void> {
    for (const statement of CONTENT_SCHEMA_SQL) {
      await this.pool.query(statement);
    }
  }

  /**
   * Nội dung bài học ít đổi mà mỗi truy vấn tới Neon mất cả trăm mili giây, nên giữ trong bộ nhớ
   * một lúc. Nạp bài mới qua `importPack` xoá bộ nhớ đệm ngay trong tiến trình này; còn nếu bài được
   * nạp từ tiến trình khác (lệnh `npm run content:import`) thì API thấy bài mới sau tối đa `CACHE_MS`.
   */
  private static readonly CACHE_MS = 60_000;
  private readonly cache = new Map<string, { value: unknown; expires: number }>();

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) {
      return hit.value as T;
    }
    const value = await load();
    this.cache.set(key, { value, expires: Date.now() + PgContent.CACHE_MS });
    return value;
  }

  lesson(id: string): Promise<Lesson> {
    // Bài không tồn tại ném lỗi nên không bị lưu vào bộ nhớ đệm.
    return this.cached(`lesson:${id}`, async () => {
      const { rows } = await this.pool.query('select body from lessons where id = $1', [id]);
      if (!rows.length) {
        throw new NotFoundException(`Không có bài học ${id}`);
      }
      return rows[0].body as Lesson;
    });
  }

  /** Danh sách video: đọc mọi bài video kèm band chứa nó, rồi dựng thẻ (không gồm phụ đề). */
  videos(): Promise<VideoCard[]> {
    return this.cached('videos', async () => {
      const { rows } = await this.pool.query(
        `select l.body, ul.band
           from lessons l
           join unit_lessons ul on ul.lesson_id = l.id and ul.skill = 'video'
          where l.kind = 'video'
          order by ul.band, l.created_at, l.id`,
      );
      return rows.map(row => toVideoCard(row.body as VideoLesson, row.band as string));
    });
  }

  units(skill: Skill, band: string): Promise<UnitView[]> {
    return this.cached(`units:${skill}:${band}`, () => this.loadUnits(skill, band));
  }

  private async loadUnits(skill: Skill, band: string): Promise<UnitView[]> {
    const { rows } = await this.pool.query(
      `select u.id as unit_id, u.title as unit_title, l.id as lesson_id, l.title as lesson_title
         from units u
         left join unit_lessons ul
           on ul.skill = u.skill and ul.band = u.band and ul.unit_id = u.id
         left join lessons l on l.id = ul.lesson_id
        where u.skill = $1 and u.band = $2
        order by u.position, u.id, ul.position`,
      [skill, band],
    );
    const units = new Map<string, UnitView>();
    for (const row of rows) {
      const unit: UnitView = units.get(row.unit_id) ?? {
        id: row.unit_id,
        title: row.unit_title,
        lessons: [],
      };
      if (row.lesson_id) {
        unit.lessons.push({ id: row.lesson_id, title: row.lesson_title });
      }
      units.set(row.unit_id, unit);
    }
    return [...units.values()];
  }

  /**
   * Nạp một gói bài học trong một giao dịch. Bài đã có (cùng id) được cập nhật nội dung,
   * nên chạy lại cùng một file là an toàn. Trả về số bài đã ghi.
   */
  async importPack(pack: ParsedPack): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const unit = await client.query(
        `insert into units (skill, band, id, title, position)
         values ($1, $2, $3, $4, coalesce((select max(position) + 1 from units where skill = $1 and band = $2), 0))
         on conflict (skill, band, id) do update set title = excluded.title
         returning position`,
        [pack.skill, pack.band, pack.unit.id, pack.unit.title],
      );
      void unit;
      for (const lesson of pack.lessons) {
        await client.query(
          `insert into lessons (id, skill, kind, title, body)
           values ($1, $2, $3, $4, $5::jsonb)
           on conflict (id) do update
             set skill = excluded.skill, kind = excluded.kind, title = excluded.title, body = excluded.body`,
          [lesson.id, pack.skill, lesson.kind, lesson.title, JSON.stringify(lesson)],
        );
        await client.query(
          `insert into unit_lessons (skill, band, unit_id, lesson_id, position)
           values ($1, $2, $3, $4,
             coalesce((select max(position) + 1 from unit_lessons
                        where skill = $1 and band = $2 and unit_id = $3), 0))
           on conflict (skill, band, unit_id, lesson_id) do nothing`,
          [pack.skill, pack.band, pack.unit.id, lesson.id],
        );
      }
      await client.query('commit');
      this.cache.clear();
      return pack.lessons.length;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** Nạp các bài mẫu trong code vào DB, theo đúng unit và band hiện có. */
  async seedBuiltIn(): Promise<number> {
    const byId = new Map(LESSONS.map(lesson => [lesson.id, lesson]));
    let total = 0;
    for (const [skill, bands] of Object.entries(UNITS) as [Skill, Record<string, typeof UNITS.words['3.0']>][]) {
      for (const [band, units] of Object.entries(bands)) {
        for (const unit of units) {
          total += await this.importPack({
            skill,
            band,
            unit: { id: unit.id, title: unit.title },
            lessons: unit.lessonIds.map(id => byId.get(id)!),
            skipped: [],
          });
        }
      }
    }
    return total;
  }
}
