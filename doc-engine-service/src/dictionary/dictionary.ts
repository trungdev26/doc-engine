export interface DictionaryMeaning {
  partOfSpeech: string;
  definition: string;
  example?: string;
}

export interface DictionaryEntry {
  word: string;
  /** Phiên âm IPA, ví dụ /ˈpæʃən/. */
  ipa?: string;
  /** Link file phát âm (https). */
  audio?: string;
  meanings: DictionaryMeaning[];
  /** Nghĩa tiếng Việt của từ. */
  vi?: string;
  /**
   * true khi một nguồn bị lỗi hoặc giới hạn tốc độ nên kết quả chưa đủ (thiếu phiên âm, từ loại...). Kết quả
   * như vậy chỉ trả tạm, không được lưu; giao diện không cho lưu từ và cho tra lại.
   */
  partial?: boolean;
}

/** Từ hợp lệ để tra: chữ cái, có thể có dấu nháy hoặc gạch nối ở giữa. Chặn mọi thứ khác trước khi gọi ra ngoài. */
export const WORD_PATTERN = /^[A-Za-z](?:[A-Za-z'’-]{0,38}[A-Za-z])?$/;

export function normalizeWord(raw: string): string {
  return raw.trim().toLowerCase().replace(/’/g, "'");
}

export const MAX_PHRASE_WORDS = 8;
export const MAX_PHRASE_LENGTH = 80;

/** Chuẩn hóa một cụm người học kéo chọn: gộp khoảng trắng, bỏ dấu câu hai đầu, chữ thường. */
export function normalizePhrase(raw: string): string {
  return raw
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^A-Za-z]+/, '')
    .replace(/[^A-Za-z]+$/, '')
    .toLowerCase();
}

/** Cụm hợp lệ để tra: 2 đến 8 từ, chỉ chữ cái, dấu nháy, gạch nối, dấu phẩy và khoảng trắng đơn. */
export function isPhrase(text: string): boolean {
  if (text.length > MAX_PHRASE_LENGTH || !/^[a-z](?:[a-z' ,-]*[a-z])?$/.test(text)) return false;
  const count = text.split(' ').length;
  return count >= 2 && count <= MAX_PHRASE_WORDS && !text.includes('  ');
}

/**
 * Các dạng nên thử khi từ điển không có đúng dạng đang gặp trong lời thoại (freaked, passions, running...).
 * Dạng gốc luôn đứng đầu; chỉ là phỏng đoán đơn giản, không phải bộ tách gốc từ đầy đủ.
 */
export function lemmaCandidates(word: string): string[] {
  const out = [word];
  const add = (candidate: string) => {
    if (candidate.length >= 3 && !out.includes(candidate)) out.push(candidate);
  };
  if (word.endsWith("'s")) add(word.slice(0, -2));
  if (word.endsWith('ies')) add(word.slice(0, -3) + 'y');
  if (word.endsWith('es')) add(word.slice(0, -2));
  if (word.endsWith('s')) add(word.slice(0, -1));
  if (word.endsWith('ed')) {
    add(word.slice(0, -2));
    add(word.slice(0, -1));
    if (/(.)\1ed$/.test(word)) add(word.slice(0, -3));
  }
  if (word.endsWith('ing')) {
    add(word.slice(0, -3));
    add(word.slice(0, -3) + 'e');
    if (/(.)\1ing$/.test(word)) add(word.slice(0, -4));
  }
  return out;
}

const MAX_MEANINGS = 4;

/** Lấy phần tiếng Anh trong wikitext của một trang Wiktionary (các ngôn ngữ khác bị bỏ). */
function englishSection(wikitext: string): string {
  return wikitext.split(/^==English==\s*$/m)[1]?.split(/^==[^=]/m)[0] ?? '';
}

/**
 * Phiên âm IPA và tên file âm thanh từ wikitext của Wiktionary. Ưu tiên giọng Mỹ (GA/US) vì người học
 * thường theo giọng này; không có thì lấy giọng đầu tiên. Chỉ nhận tên file âm thanh có dạng an toàn.
 */
export function parseWiktionaryPronunciation(wikitext: string): {
  ipa?: string;
  audioFile?: string;
} {
  const english = englishSection(wikitext);

  const candidates: { ipa: string; american: boolean }[] = [];
  for (const match of english.matchAll(/\{\{IPA\|en\|([^}]*)\}\}/g)) {
    const args = match[1].split('|');
    const ipa =
      args.find(arg => /^\/[^/]+\/$/.test(arg)) ?? args.find(arg => /^\[[^\]]+\]$/.test(arg));
    if (ipa) {
      candidates.push({ ipa, american: args.some(arg => /^a=.*\b(GA|US)\b/.test(arg)) });
    }
  }
  const chosen = candidates.find(c => c.american) ?? candidates[0];

  const files = [...english.matchAll(/\{\{audio\|en\|([^|}]+)\|/gi)]
    .map(match => match[1].trim())
    .filter(name => /^[\w .()'-]{1,120}\.(ogg|wav|mp3)$/i.test(name));
  const audioFile =
    files.find(name => /^en-us-/i.test(name)) ?? files.find(name => /^en-/i.test(name)) ?? files[0];

  return { ...(chosen ? { ipa: chosen.ipa } : {}), ...(audioFile ? { audioFile } : {}) };
}

/** Link phát âm của một file trên Wikimedia Commons; Commons tự chuyển tới file thật. */
export function commonsAudioUrl(file: string): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}`;
}

const decodeEntities = (text: string): string =>
  text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ');

/**
 * Định nghĩa từ REST API của Wiktionary (`/page/definition/<từ>`): mỗi từ loại lấy nghĩa đầu tiên, bỏ thẻ
 * HTML. Các nghĩa chỉ là "dạng của từ khác" vẫn được giữ vì đó chính là điều người học cần biết.
 */
export function parseWiktionaryDefinitions(raw: unknown): DictionaryMeaning[] {
  const groups = Array.isArray((raw as { en?: unknown } | null)?.en)
    ? ((raw as { en: unknown[] }).en as { partOfSpeech?: unknown; definitions?: unknown }[])
    : [];
  const meanings: DictionaryMeaning[] = [];
  for (const group of groups) {
    if (typeof group?.partOfSpeech !== 'string' || !Array.isArray(group.definitions)) continue;
    for (const item of group.definitions as { definition?: unknown }[]) {
      if (typeof item?.definition !== 'string') continue;
      const definition = decodeEntities(
        item.definition
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' '),
      ).trim();
      if (definition) {
        meanings.push({ partOfSpeech: group.partOfSpeech.toLowerCase(), definition });
        break;
      }
    }
  }
  return meanings.slice(0, MAX_MEANINGS);
}

/** Rút gọn phản hồi của dictionaryapi.dev thành phần giao diện cần. Dữ liệu lạ thì bỏ qua thay vì lỗi. */
export function parseDictionaryResponse(
  word: string,
  raw: unknown,
): Omit<DictionaryEntry, 'vi'> | null {
  const entries = Array.isArray(raw) ? raw : [];
  const meanings: DictionaryMeaning[] = [];
  let ipa: string | undefined;
  let audio: string | undefined;

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const phonetics = Array.isArray(entry.phonetics) ? entry.phonetics : [];
    ipa ??= [entry.phonetic, ...phonetics.map((p: { text?: unknown }) => p?.text)].find(
      (text): text is string => typeof text === 'string' && text.trim() !== '',
    );
    audio ??= phonetics
      .map((p: { audio?: unknown }) => p?.audio)
      .find((url: unknown): url is string => typeof url === 'string' && /^https:\/\//.test(url));

    for (const meaning of Array.isArray(entry.meanings) ? entry.meanings : []) {
      const first = Array.isArray(meaning?.definitions) ? meaning.definitions[0] : undefined;
      if (typeof first?.definition === 'string' && typeof meaning.partOfSpeech === 'string') {
        meanings.push({
          partOfSpeech: meaning.partOfSpeech,
          definition: first.definition,
          ...(typeof first.example === 'string' ? { example: first.example } : {}),
        });
      }
    }
  }

  if (!meanings.length && !ipa) return null;
  return {
    word,
    ...(ipa ? { ipa: ipa.replace(/^\[|\]$/g, '').replace(/^(?!\/)(.*)$/, '/$1/') } : {}),
    ...(audio ? { audio } : {}),
    meanings: meanings.slice(0, MAX_MEANINGS),
  };
}
