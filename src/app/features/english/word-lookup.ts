/**
 * Cụm từ người học kéo chọn trong lời thoại: 2 đến 8 từ tiếng Anh. Trả về cụm đã chuẩn hóa (chữ thường,
 * bỏ dấu câu hai đầu) hoặc null nếu không hợp lệ. Cùng quy tắc với máy chủ, để không gửi những cụm sẽ bị từ chối.
 */
export function phraseKey(raw: string): string | null {
  const cleaned = raw
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^A-Za-z]+/, '')
    .replace(/[^A-Za-z]+$/, '')
    .toLowerCase();
  if (cleaned.length > 80 || !/^[a-z](?:[a-z' ,-]*[a-z])?$/.test(cleaned)) {
    return null;
  }
  const count = cleaned.split(' ').length;
  return count >= 2 && count <= 8 ? cleaned : null;
}

export type IpaKind = 'vowel' | 'consonant' | 'mark';
export interface IpaPart {
  text: string;
  kind: IpaKind;
}

const IPA_VOWELS = new Set([...'aeiouyɑæɐɒəɘɚɜɝɞɛɪɨɔʊʌʉɯɤøœɶɵɷ']);
/** Ký hiệu không phải âm: gạch bao ngoài, trọng âm, dấu tách âm tiết. */
const IPA_MARKS = new Set([...'/[]ˈˌ.|‿() ']);
/** Dấu đi kèm âm đứng trước: độ dài, dấu phụ ghép, chữ nhỏ nâng (ʰ ʷ ʲ), r-colored. */
const IPA_ATTACHED = /[ːˑ˞̀-ͯᴀ-ᶿʰ-˿]/;

/**
 * Tách phiên âm IPA thành từng đoạn nguyên âm, phụ âm và ký hiệu, để tô màu cho dễ nhìn.
 * Dấu độ dài (ː) và dấu phụ đi theo âm đứng trước. Ký tự lạ coi là phụ âm.
 */
export function ipaParts(ipa: string): IpaPart[] {
  const parts: IpaPart[] = [];
  let last: IpaKind = 'mark';
  for (const char of ipa) {
    let kind: IpaKind;
    if (IPA_MARKS.has(char)) {
      kind = 'mark';
    } else if (IPA_ATTACHED.test(char) && parts.length) {
      kind = last;
    } else {
      kind = IPA_VOWELS.has(char) ? 'vowel' : 'consonant';
    }
    const tail = parts[parts.length - 1];
    if (tail && tail.kind === kind) {
      tail.text += char;
    } else {
      parts.push({ text: char, kind });
    }
    last = kind;
  }
  return parts;
}

const POS_LABELS: Record<string, string> = {
  noun: 'n.',
  verb: 'v.',
  adjective: 'adj.',
  adverb: 'adv.',
  pronoun: 'pron.',
  preposition: 'prep.',
  conjunction: 'conj.',
  interjection: 'interj.',
  determiner: 'det.',
  article: 'art.',
  numeral: 'num.',
  particle: 'part.',
  contraction: 'contr.',
  phrase: 'phr.',
  proverb: 'prov.',
};

/** Từ loại viết tắt kiểu từ điển (noun → n.). Từ loại lạ thì cắt ngắn để vừa cột. */
export function posLabel(partOfSpeech: string): string {
  const key = partOfSpeech.trim().toLowerCase();
  return POS_LABELS[key] ?? (key.length > 5 ? `${key.slice(0, 4)}.` : key);
}

/**
 * Từ để tra rút ra từ một "từ" trong lời thoại: bỏ dấu câu và ký tự thừa ở hai đầu ("night.", "“Fourty",
 * "...by"), giữ dấu nháy và gạch nối ở giữa. Trả null nếu không còn chữ nào (số, dấu câu, tiếng động).
 */
export function lookupKey(raw: string): string | null {
  const cleaned = raw
    .replace(/’/g, "'")
    .replace(/^[^A-Za-z]+/, '')
    .replace(/[^A-Za-z]+$/, '')
    .toLowerCase();
  return /^[a-z](?:[a-z'-]{0,38}[a-z])?$/.test(cleaned) ? cleaned : null;
}
