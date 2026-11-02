import { PgClient, PgPool } from '../store/pg.pool';
import { PgContent } from './pg.content';
import { parsePack } from './validate';

type Row = Record<string, unknown>;

/** Postgres giả, đủ để kiểm tra thứ tự giao dịch và cách gom bài theo unit. */
class FakePool implements PgPool {
  log: string[] = [];
  rows: Row[] = [];
  failOn: string | null = null;

  private handle = async (text: string) => {
    const sql = text.trim().replace(/\s+/g, ' ');
    const head = sql.split(' ').slice(0, 3).join(' ');
    this.log.push(head);
    if (this.failOn && sql.startsWith(this.failOn)) {
      throw new Error('hỏng giữa chừng');
    }
    return { rows: sql.startsWith('select u.id') ? this.rows : [] };
  };

  query = this.handle;
  connect = async (): Promise<PgClient> => ({
    query: this.handle,
    release: () => this.log.push('release'),
  });
  end = async () => undefined;
}

const vocab = (id: string) => ({
  kind: 'vocab',
  id,
  title: `Bài ${id}`,
  words: [{ word: 'hi', pos: 'n', ipa: '', meaning: 'chào', definition: '', example: '', exampleVi: '' }],
});

describe('parsePack', () => {
  const base = { skill: 'words', band: '3.5', unit: { id: 'u1', title: 'Unit 1' } };

  it('nhận bài hợp lệ và báo lý do với bài bị bỏ qua', () => {
    const pack = parsePack({
      ...base,
      lessons: [vocab('ok-1'), { kind: 'vocab', id: 'Sai Id', title: 'x', words: [1] }, vocab('ok-1')],
    });
    expect(pack.lessons.map(lesson => lesson.id)).toEqual(['ok-1']);
    expect(pack.skipped).toHaveLength(2);
  });

  it('từ chối gói sai band, sai kỹ năng hoặc không có bài hợp lệ', () => {
    expect(() => parsePack({ ...base, band: '1.0', lessons: [vocab('a')] })).toThrow('band');
    expect(() => parsePack({ ...base, skill: 'dancing', lessons: [vocab('a')] })).toThrow('skill');
    expect(() => parsePack({ ...base, lessons: [{ kind: 'vocab', id: 'a' }] })).toThrow(
      'không có bài hợp lệ',
    );
  });

  it('bỏ qua bài thuộc kỹ năng khác với gói', () => {
    const pack = parsePack({
      ...base,
      lessons: [vocab('a'), { kind: 'speaking', id: 'b', title: 'b', sentences: [{ text: 'x' }] }],
    });
    expect(pack.lessons.map(lesson => lesson.id)).toEqual(['a']);
    expect(pack.skipped[0]).toContain('không thuộc kỹ năng');
  });

  it('từ chối câu hỏi có đáp án nằm ngoài danh sách lựa chọn', () => {
    const grammar = {
      kind: 'grammar',
      id: 'g',
      title: 'g',
      rules: [{}],
      practice: [{ question: 'q', options: ['a', 'b'], answer: 5 }],
    };
    expect(() => parsePack({ skill: 'grammar', band: '3.0', unit: base.unit, lessons: [grammar] })).toThrow();
  });
});

describe('PgContent', () => {
  let pool: FakePool;
  let content: PgContent;

  beforeEach(() => {
    pool = new FakePool();
    content = new PgContent(pool);
  });

  it('gom các dòng join thành unit và bài theo đúng thứ tự', async () => {
    pool.rows = [
      { unit_id: 'u1', unit_title: 'Unit 1', lesson_id: 'a', lesson_title: 'A' },
      { unit_id: 'u1', unit_title: 'Unit 1', lesson_id: 'b', lesson_title: 'B' },
      { unit_id: 'u2', unit_title: 'Unit 2', lesson_id: null, lesson_title: null },
    ];
    expect(await content.units('words', '3.0')).toEqual([
      { id: 'u1', title: 'Unit 1', lessons: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] },
      { id: 'u2', title: 'Unit 2', lessons: [] },
    ]);
  });

  it('nạp gói trong một giao dịch rồi commit', async () => {
    const count = await content.importPack(
      parsePack({
        skill: 'words',
        band: '3.0',
        unit: { id: 'u1', title: 'Unit 1' },
        lessons: [vocab('a'), vocab('b')],
      }),
    );
    expect(count).toBe(2);
    expect(pool.log).toEqual([
      'begin',
      'insert into units',
      'insert into lessons',
      'insert into unit_lessons',
      'insert into lessons',
      'insert into unit_lessons',
      'commit',
      'release',
    ]);
  });

  it('rollback khi một câu lệnh lỗi để không nạp dở gói', async () => {
    pool.failOn = 'insert into lessons';
    await expect(
      content.importPack(
        parsePack({
          skill: 'words',
          band: '3.0',
          unit: { id: 'u1', title: 'Unit 1' },
          lessons: [vocab('a')],
        }),
      ),
    ).rejects.toThrow('hỏng giữa chừng');
    expect(pool.log).toContain('rollback');
    expect(pool.log).not.toContain('commit');
    expect(pool.log.at(-1)).toBe('release');
  });

  describe('bộ nhớ đệm', () => {
    const pack = () =>
      parsePack({
        skill: 'words',
        band: '3.0',
        unit: { id: 'u1', title: 'Unit 1' },
        lessons: [vocab('a')],
      });

    it('lần hai đọc từ bộ nhớ, không gọi lại database', async () => {
      pool.rows = [{ unit_id: 'u1', unit_title: 'U', lesson_id: 'a', lesson_title: 'A' }];
      await content.units('words', '3.0');
      pool.log = [];
      await content.units('words', '3.0');
      await content.units('words', '3.0');
      expect(pool.log).toEqual([]);
    });

    it('khoá theo kỹ năng và band nên band khác vẫn truy vấn', async () => {
      await content.units('words', '3.0');
      pool.log = [];
      await content.units('words', '3.5');
      expect(pool.log).toEqual(['select u.id as']);
    });

    it('nạp bài mới thì xoá bộ nhớ để người dùng thấy ngay', async () => {
      await content.units('words', '3.0');
      await content.importPack(pack());
      pool.log = [];
      await content.units('words', '3.0');
      expect(pool.log).toEqual(['select u.id as']);
    });

    it('bài không tồn tại không bị lưu vào bộ nhớ', async () => {
      await expect(content.lesson('khong-co')).rejects.toThrow('Không có bài học');
      pool.log = [];
      await expect(content.lesson('khong-co')).rejects.toThrow('Không có bài học');
      expect(pool.log.length).toBe(1);
    });
  });
});
