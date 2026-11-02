import { Injectable } from '@nestjs/common';
import {
  DictionaryEntry,
  commonsAudioUrl,
  lemmaCandidates,
  parseDictionaryResponse,
  parseWiktionaryDefinitions,
  parseWiktionaryPronunciation,
} from './dictionary';
import { DictionaryStore, EnglishStatus } from './dictionary.store';

const TIMEOUT_MS = 4000;
const MEMORY_MAX = 1000;
const MEMORY_TTL_MS = 60 * 60 * 1000;

type EnglishEntry = Omit<DictionaryEntry, 'vi'>;

/** Một lần gọi nguồn ngoài: `status` là mã HTTP, 0 nếu lỗi mạng hoặc quá hạn. */
interface Fetched {
  status: number;
  json: unknown;
}

/** found: có dữ liệu. none: nguồn trả lời rõ là không có từ. error: lỗi hoặc bị giới hạn tốc độ, chưa biết. */
type Lookup = { entry: EnglishEntry | null; state: 'found' | 'none' | 'error' };

export interface FetchedEntry {
  entry: DictionaryEntry;
  /** error: phần tiếng Anh chưa lấy được vì nguồn lỗi; kết quả không được lưu để lần sau thử lại. */
  status: EnglishStatus | 'error';
}

/**
 * Tra từ từ ba nguồn miễn phí: dictionaryapi.dev và Wiktionary (phiên âm, âm thanh, từ loại, định nghĩa
 * tiếng Anh) và MyMemory (nghĩa tiếng Việt). Địa chỉ cố định trong mã nên không có đường cho người dùng bắt
 * máy chủ gọi nơi khác. Thứ tự: bộ nhớ trong tiến trình, rồi kho lưu bền (Postgres), cuối cùng mới gọi ra
 * ngoài. Dữ liệu từ Wiktionary theo giấy phép CC BY-SA nên giao diện ghi nguồn.
 */
@Injectable()
export class DictionaryService {
  private readonly memory = new Map<string, { at: number; entry: DictionaryEntry }>();

  constructor(private readonly store: DictionaryStore) {}

  async lookup(word: string): Promise<DictionaryEntry> {
    const hit = this.memory.get(word);
    if (hit && Date.now() - hit.at < MEMORY_TTL_MS) {
      return hit.entry;
    }
    const saved = await this.store.get(word).catch(() => null);
    if (saved) {
      this.remember(saved);
      return saved;
    }
    return this.refresh(word);
  }

  /**
   * Tra một cụm từ: chỉ có nghĩa tiếng Việt (từ điển không có mục cho cụm tự do). Kết quả chỉ giữ trong bộ
   * nhớ chứ không ghi Postgres, vì endpoint công khai và số cụm người học có thể chọn là không giới hạn.
   */
  async lookupPhrase(phrase: string): Promise<DictionaryEntry> {
    const hit = this.memory.get(phrase);
    if (hit && Date.now() - hit.at < MEMORY_TTL_MS) {
      return hit.entry;
    }
    const vi = await this.vietnamese(phrase);
    const entry: DictionaryEntry = { word: phrase, meanings: [], ...(vi ? { vi } : {}) };
    if (vi) {
      this.remember(entry);
    }
    return entry;
  }

  async refresh(word: string): Promise<DictionaryEntry> {
    return (await this.fetchEntry(word)).entry;
  }

  /**
   * Gọi các nguồn bên ngoài rồi lưu kết quả. Worker nền và lần tra đầu tiên đều đi qua đây. Chỉ lưu khi phần
   * tiếng Anh có câu trả lời chắc chắn (có dữ liệu, hoặc các từ điển nói rõ là không có); nguồn lỗi hay bị
   * giới hạn tốc độ thì trả kết quả tạm cho người đang chờ nhưng không lưu.
   */
  async fetchEntry(word: string): Promise<FetchedEntry> {
    const [english, vi] = await Promise.all([this.english(word), this.vietnamese(word)]);
    const entry: DictionaryEntry = {
      ...(english.entry ?? { word, meanings: [] }),
      word,
      ...(vi ? { vi } : {}),
    };
    if (english.state === 'error') {
      return { entry: { ...entry, partial: true }, status: 'error' };
    }
    // Không có gì cả (kể cả nghĩa tiếng Việt) thì nhiều khả năng MyMemory cũng đang lỗi: để lần sau thử lại.
    if (english.state === 'found' || vi) {
      const status: EnglishStatus = english.state === 'found' ? 'found' : 'none';
      this.remember(entry);
      await this.store.set(entry, status).catch(() => undefined);
      return { entry, status };
    }
    return { entry: { ...entry, partial: true }, status: 'error' };
  }

  private remember(entry: DictionaryEntry): void {
    if (this.memory.size >= MEMORY_MAX) {
      this.memory.delete(this.memory.keys().next().value as string);
    }
    this.memory.set(entry.word, { at: Date.now(), entry });
  }

  private async english(word: string): Promise<Lookup> {
    // Với mỗi dạng của từ (dạng đúng trước, dạng gốc sau): hỏi dictionaryapi.dev trước. Wiktionary chỉ là dự
    // phòng cho những từ nó thiếu (pretty, night, world...) nên các từ phổ biến không tốn lượt gọi Wiktionary.
    let sawError = false;
    for (const candidate of lemmaCandidates(word).slice(0, 3)) {
      const primary = await this.dictionaryApi(candidate);
      if (primary.entry) return { entry: primary.entry, state: 'found' };
      const backup = await this.wiktionary(candidate);
      if (backup.entry) {
        return { entry: backup.entry, state: backup.state === 'found' ? 'found' : 'error' };
      }
      if (primary.state === 'error' || backup.state === 'error') sawError = true;
    }
    return { entry: null, state: sawError ? 'error' : 'none' };
  }

  private async dictionaryApi(word: string): Promise<Lookup> {
    const { status, json } = await this.getJson(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    );
    if (status === 200) {
      const entry = parseDictionaryResponse(word, json);
      return { entry, state: entry ? 'found' : 'none' };
    }
    return { entry: null, state: status === 404 ? 'none' : 'error' };
  }

  private async wiktionary(word: string): Promise<Lookup> {
    // Định nghĩa trước: từ không có trang thì dừng ngay, khỏi gọi thêm lần nữa để lấy phiên âm.
    const definitions = await this.getJson(
      `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`,
    );
    if (definitions.status !== 200) {
      return { entry: null, state: definitions.status === 404 ? 'none' : 'error' };
    }
    const meanings = parseWiktionaryDefinitions(definitions.json);

    // Phiên âm lấy từ wikitext. Lỗi ở bước này không làm mất phần định nghĩa đã có.
    const page = await this.getJson(
      `https://en.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(word)}&prop=wikitext&format=json&formatversion=2`,
    );
    const wikitext = (page.json as { parse?: { wikitext?: unknown } } | null)?.parse?.wikitext;
    const { ipa, audioFile } = parseWiktionaryPronunciation(
      typeof wikitext === 'string' ? wikitext : '',
    );

    if (!ipa && !meanings.length) {
      return { entry: null, state: page.status === 200 ? 'none' : 'error' };
    }
    return {
      entry: {
        word,
        ...(ipa ? { ipa } : {}),
        ...(audioFile ? { audio: commonsAudioUrl(audioFile) } : {}),
        meanings,
      },
      // Có định nghĩa mà trang phiên âm bị lỗi hoặc giới hạn tốc độ thì kết quả chỉ là một nửa: vẫn trả cho
      // người đang chờ nhưng đánh dấu error để không bị lưu và tra lại sau.
      state: page.status === 200 ? 'found' : 'error',
    };
  }

  private async vietnamese(word: string): Promise<string | undefined> {
    const { json } = await this.getJson(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|vi`,
    );
    const text = (json as { responseData?: { translatedText?: unknown } } | null)?.responseData
      ?.translatedText;
    // MyMemory trả lại đúng từ gốc hoặc chữ in hoa báo lỗi khi không dịch được; bỏ các trường hợp đó.
    if (typeof text !== 'string' || !text.trim()) return undefined;
    const clean = text.trim();
    // MyMemory đôi khi trả lại đúng mẫu "%s" chưa điền, hoặc in hoa cả chuỗi khi báo lỗi.
    return clean.toLowerCase() === word || /QUERY LENGTH|MYMEMORY|INVALID|%S/i.test(clean)
      ? undefined
      : clean;
  }

  private async getJson(url: string): Promise<Fetched> {
    try {
      // Wikimedia yêu cầu User-Agent nêu rõ ứng dụng; các nguồn khác bỏ qua header này.
      const response = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'User-Agent': 'base-angular-learning/1.0 (personal study app)' },
      });
      return { status: response.status, json: response.ok ? await response.json() : null };
    } catch {
      return { status: 0, json: null };
    }
  }
}
