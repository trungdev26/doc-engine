import { ipaParts, lookupKey, phraseKey, posLabel } from './word-lookup';

describe('ipaParts', () => {
  const kinds = (ipa: string) => ipaParts(ipa).map(part => `${part.kind[0]}:${part.text}`);

  it('tách nguyên âm, phụ âm và ký hiệu', () => {
    // /dɪˈstɹɔɪ/: d ɪ | st ɹ ɔɪ
    expect(kinds('/dɪˈstɹɔɪ/')).toEqual(['m:/', 'c:d', 'v:ɪ', 'm:ˈ', 'c:stɹ', 'v:ɔɪ', 'm:/']);
  });

  it('dấu độ dài và dấu phụ đi theo âm đứng trước', () => {
    // Hai ký hiệu liền nhau (/ và ˈ) được gộp thành một đoạn.
    expect(kinds('/ˈɹiːzən/')).toEqual(['m:/ˈ', 'c:ɹ', 'v:iː', 'c:z', 'v:ə', 'c:n', 'm:/']);
    // Dấu ghép dưới (̯) thuộc về nguyên âm ɪ đứng trước nó.
    expect(kinds('[naɪ̯t]')).toEqual(['m:[', 'c:n', 'v:aɪ̯', 'c:t', 'm:]']);
  });

  it('ghép lại đúng nguyên văn và không vỡ khi rỗng', () => {
    const ipa = '/ˈpɹɪt.i/';
    expect(
      ipaParts(ipa)
        .map(part => part.text)
        .join(''),
    ).toBe(ipa);
    expect(ipaParts('')).toEqual([]);
  });
});

describe('phraseKey', () => {
  it('chuẩn hóa cụm 2 đến 8 từ', () => {
    expect(phraseKey('  follow   our passions; ')).toBe('follow our passions');
    expect(phraseKey('“Why don’t you')).toBe("why don't you");
  });

  it('từ chối một từ, quá dài hoặc có ký tự lạ', () => {
    expect(phraseKey('passion')).toBeNull();
    expect(phraseKey('one two three four five six seven eight nine')).toBeNull();
    expect(phraseKey('hello 123 world')).toBeNull();
    expect(phraseKey('')).toBeNull();
  });
});

describe('posLabel', () => {
  it('viết tắt từ loại thông dụng kiểu từ điển', () => {
    expect(posLabel('noun')).toBe('n.');
    expect(posLabel('Adjective')).toBe('adj.');
    expect(posLabel(' interjection ')).toBe('interj.');
  });

  it('từ loại lạ thì cắt ngắn để vừa cột', () => {
    expect(posLabel('adverbial')).toBe('adve.');
    expect(posLabel('idiom')).toBe('idiom');
  });
});

describe('lookupKey', () => {
  it('bỏ dấu câu ở hai đầu và đổi về chữ thường', () => {
    expect(lookupKey('night.')).toBe('night');
    expect(lookupKey('“Fourty')).toBe('fourty');
    expect(lookupKey('...by')).toBe('by');
    expect(lookupKey('go!')).toBe('go');
    expect(lookupKey('Thom,')).toBe('thom');
  });

  it('giữ dấu nháy và gạch nối ở giữa, đổi dấu nháy cong', () => {
    expect(lookupKey("You're")).toBe("you're");
    expect(lookupKey('It’s')).toBe("it's");
    expect(lookupKey('well-known')).toBe('well-known');
    expect(lookupKey("Could'a")).toBe("could'a");
  });

  it('không tra số, dấu câu hay chuỗi quá dài', () => {
    expect(lookupKey('1780')).toBeNull();
    expect(lookupKey('...')).toBeNull();
    expect(lookupKey('90%.')).toBeNull();
    expect(lookupKey('a'.repeat(50))).toBeNull();
    expect(lookupKey('')).toBeNull();
  });
});
