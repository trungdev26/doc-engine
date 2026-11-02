import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SKILLS } from '../contracts';
import { BANDS } from '../content/bands';
import { ContentRepository } from '../content/content.repository';
import { collectWords } from './dictionary-words';
import { DictionaryService } from './dictionary.service';
import { DictionaryStore } from './dictionary.store';

const BOOT_DELAY_MS = 20_000;
const RERUN_MS = 6 * 60 * 60 * 1000;
/** Lượt bị dừng vì nguồn ngoài lỗi hoặc giới hạn tốc độ thì thử lại sớm hơn lịch thường. */
const RETRY_SOON_MS = 10 * 60 * 1000;
/** Khoảng nghỉ giữa hai từ: nhẹ tay với các nguồn miễn phí và không tranh băng thông của người đang học. */
const WORD_GAP_MS = 2000;
/** Một từ gặp lỗi thì nghỉ lâu hơn trước khi thử từ kế; lỗi liên tiếp chừng này lần thì bỏ cả lượt. */
const ERROR_GAP_MS = 20_000;
const ERROR_ABORT_AFTER = 3;
/** Tên nguồn từ trong bảng mốc: các từ lấy từ nội dung bài học. */
const SOURCE = 'lessons';
/**
 * Trần tạm thời: kho chỉ giữ tối đa chừng này từ lấy từ bài học (tính cả từ đã có), đủ thì worker dừng.
 * Muốn tra tiếp thì đặt DICTIONARY_SYNC_LIMIT lớn hơn rồi khởi động lại API; worker đi tiếp từ mốc đã lưu.
 */
const DEFAULT_LIMIT = 10_000;

const limitFromEnv = (): number => {
  const parsed = Number(process.env.DICTIONARY_SYNC_LIMIT);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_LIMIT;
};

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Thứ tự worker đi qua các từ: từ mốc trở đi trước, hết danh sách thì quay lại đầu danh sách. Nhờ vậy từ
 * mới của bài mới thêm (nằm trước mốc theo chữ cái) vẫn được tra ở lượt sau mà không phải quét lại từ đầu.
 */
export function orderFromCursor(words: string[], cursor: string | null): string[] {
  if (!cursor) return words;
  return [...words.filter(word => word > cursor), ...words.filter(word => word <= cursor)];
}

/**
 * Worker nền: quét mọi bài học, tra sẵn các từ chưa có trong kho và lưu lại. Nhờ vậy lúc người học bấm
 * vào một từ thì đã có kết quả sẵn trong Postgres, không phải chờ ba nguồn bên ngoài. Sau mỗi từ, worker
 * ghi mốc (từ vừa xử lý) vào bảng `dictionary_sync`, nên khởi động lại hay nâng trần đều đi tiếp đúng chỗ.
 * Từ nào nguồn ngoài báo lỗi thì không lưu và không tính là đã xong, nên sẽ được thử lại ở lượt sau.
 * Chạy ngay trong tiến trình API, một từ mỗi lần; tắt bằng DICTIONARY_SYNC=off.
 */
@Injectable()
export class DictionarySyncService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('DictionarySync');
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private running = false;
  /** true khi lượt vừa rồi bị dừng giữa chừng vì nguồn ngoài liên tục lỗi. */
  lastRunAborted = false;

  constructor(
    private readonly content: ContentRepository,
    private readonly dictionary: DictionaryService,
    private readonly store: DictionaryStore,
  ) {}

  onModuleInit(): void {
    if (process.env.DICTIONARY_SYNC === 'off' || process.env.NODE_ENV === 'test') return;
    this.schedule(BOOT_DELAY_MS);
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(delay: number): void {
    this.timer = setTimeout(() => {
      void this.syncOnce().finally(
        () => !this.stopped && this.schedule(this.lastRunAborted ? RETRY_SOON_MS : RERUN_MS),
      );
    }, delay);
    this.timer.unref();
  }

  /** Mọi từ xuất hiện trong các bài học hiện có, theo thứ tự chữ cái. */
  async allWords(): Promise<string[]> {
    const ids = new Set<string>();
    for (const skill of SKILLS) {
      for (const band of BANDS) {
        for (const unit of await this.content.units(skill, band.id)) {
          unit.lessons.forEach(lesson => ids.add(lesson.id));
        }
      }
    }
    const words = new Set<string>();
    for (const id of ids) {
      try {
        collectWords(await this.content.lesson(id)).forEach(word => words.add(word));
      } catch {
        // Bài lỗi hoặc vừa bị xóa thì bỏ qua, không làm hỏng cả lượt.
      }
    }
    return [...words].sort();
  }

  /** Tra và lưu các từ còn thiếu cho tới khi đủ `limit` từ trong kho. Trả về số từ đã lưu trong lượt này. */
  async syncOnce(
    options: { gapMs?: number; errorGapMs?: number; limit?: number } = {},
  ): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    this.lastRunAborted = false;
    try {
      const limit = options.limit ?? limitFromEnv();
      const all = await this.allWords();
      const have = await this.store.fresh(all);
      const state = await this.store.getSync(SOURCE);

      const missing = orderFromCursor(all, state.cursor).filter(word => !have.has(word));
      const todo = missing.slice(0, Math.max(0, limit - have.size));
      this.log.log(
        `${all.length} từ trong bài học, ${have.size} đã có, trần ${limit} từ. ` +
          (state.cursor ? `Đi tiếp sau từ "${state.cursor}"` : 'Bắt đầu từ đầu danh sách') +
          `: sẽ tra ${todo.length} từ.`,
      );

      let done = 0;
      let failed = 0;
      let consecutiveErrors = 0;
      let cursor = state.cursor;
      for (const word of todo) {
        if (this.stopped) break;
        const { status } = await this.dictionary.fetchEntry(word);

        if (status === 'error') {
          // Nguồn lỗi hoặc đang giới hạn tốc độ: không lưu, không đẩy mốc qua từ này, nghỉ rồi thử từ kế.
          failed++;
          if (++consecutiveErrors >= ERROR_ABORT_AFTER) {
            this.lastRunAborted = true;
            this.log.warn(`Nguồn từ điển liên tục lỗi, dừng lượt này và thử lại sau ít phút.`);
            break;
          }
          await sleep(options.errorGapMs ?? ERROR_GAP_MS);
          continue;
        }

        consecutiveErrors = 0;
        done++;
        cursor = word;
        // Ghi mốc sau từng từ: API tắt giữa chừng thì lần sau chỉ mất tối đa một từ.
        await this.store.setSync(SOURCE, { cursor, processed: state.processed + done });
        await sleep(options.gapMs ?? WORD_GAP_MS);
      }

      // Đã xử lý hết mọi từ còn thiếu mà không từ nào lỗi: xong một vòng, lần sau quét lại từ đầu danh sách.
      if (done > 0 && failed === 0 && done === missing.length) {
        await this.store.setSync(SOURCE, { cursor: null, processed: state.processed + done });
        cursor = null;
      }
      if (done || failed) {
        this.log.log(
          `Đã lưu ${done} từ` +
            (failed ? `, ${failed} từ gặp lỗi (sẽ thử lại)` : '') +
            (cursor ? `, dừng sau từ "${cursor}".` : ', hết một vòng danh sách.'),
        );
      }
      return done;
    } catch (error) {
      this.log.warn(`Đồng bộ từ điển gặp lỗi: ${(error as Error).message}`);
      return 0;
    } finally {
      this.running = false;
    }
  }
}
