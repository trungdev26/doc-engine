import { DictionaryService } from './dictionary.service';
import { MemoryDictionaryStore } from './dictionary.store';

type Reply = { status: number; body?: unknown };

/** Giả `fetch`: trả lời theo từ khóa trong địa chỉ; địa chỉ nào không khớp thì báo lỗi mạng. */
function mockFetch(routes: Record<string, Reply>) {
  const calls: string[] = [];
  global.fetch = jest.fn(async (input: unknown) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(routes).find(part => url.includes(part));
    if (!key) throw new Error('mạng lỗi');
    const { status, body } = routes[key];
    return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  return calls;
}

const MYMEMORY = 'api.mymemory.translated.net';
const DICTIONARY_API = 'api.dictionaryapi.dev';
const WIKT_REST = 'wiktionary.org/api/rest_v1';
const WIKT_PARSE = 'wiktionary.org/w/api.php';

const viReply = (text: string): Reply => ({
  status: 200,
  body: { responseData: { translatedText: text } },
});

describe('DictionaryService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('dictionaryapi.dev có từ thì dùng luôn, không gọi Wiktionary', async () => {
    const calls = mockFetch({
      [DICTIONARY_API]: {
        status: 200,
        body: [
          {
            phonetic: '/ɹiːzn/',
            meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A cause.' }] }],
          },
        ],
      },
      [MYMEMORY]: viReply('lý do'),
    });
    const store = new MemoryDictionaryStore();
    const { entry, status } = await new DictionaryService(store).fetchEntry('reason');

    expect(status).toBe('found');
    expect(entry.partial).toBeUndefined();
    expect(entry).toMatchObject({ word: 'reason', ipa: '/ɹiːzn/', vi: 'lý do' });
    expect(entry.meanings[0].partOfSpeech).toBe('noun');
    expect(calls.some(url => url.includes('wiktionary'))).toBe(false);
    expect((await store.get('reason'))?.vi).toBe('lý do');
  });

  it('dictionaryapi.dev thiếu từ thì Wiktionary bổ sung phiên âm và từ loại', async () => {
    mockFetch({
      [DICTIONARY_API]: { status: 404 },
      [WIKT_REST]: {
        status: 200,
        body: { en: [{ partOfSpeech: 'Noun', definitions: [{ definition: 'The planet.' }] }] },
      },
      [WIKT_PARSE]: {
        status: 200,
        body: {
          parse: {
            wikitext: '==English==\n{{IPA|en|/wɜːld/|a=GA}}\n{{audio|en|en-us-world.ogg|a=US}}',
          },
        },
      },
      [MYMEMORY]: viReply('thế giới'),
    });
    const { entry, status } = await new DictionaryService(new MemoryDictionaryStore()).fetchEntry(
      'world',
    );

    expect(status).toBe('found');
    expect(entry.ipa).toBe('/wɜːld/');
    expect(entry.audio).toContain('en-us-world.ogg');
    expect(entry.meanings).toEqual([{ partOfSpeech: 'noun', definition: 'The planet.' }]);
    expect(entry.vi).toBe('thế giới');
  });

  it('Wiktionary bị giới hạn tốc độ (429) thì KHÔNG lưu, để lần sau thử lại thay vì ghi nhớ thiếu từ loại', async () => {
    mockFetch({
      [DICTIONARY_API]: { status: 404 },
      [WIKT_REST]: { status: 429 },
      [WIKT_PARSE]: { status: 429 },
      [MYMEMORY]: viReply('thế giới'),
    });
    const store = new MemoryDictionaryStore();
    const { entry, status } = await new DictionaryService(store).fetchEntry('world');

    // Người đang chờ vẫn nhận được nghĩa tiếng Việt, nhưng kho không bị ghi một kết quả thiếu.
    expect(status).toBe('error');
    expect(entry.vi).toBe('thế giới');
    // Kết quả trả tạm được đánh dấu để giao diện không cho lưu từ thiếu dữ liệu.
    expect(entry.partial).toBe(true);
    expect(await store.get('world')).toBeNull();
  });

  it('có định nghĩa nhưng trang phiên âm bị 429 thì chỉ trả tạm, KHÔNG lưu (tránh lưu thiếu phiên âm 90 ngày)', async () => {
    mockFetch({
      [DICTIONARY_API]: { status: 404 },
      [WIKT_REST]: {
        status: 200,
        body: { en: [{ partOfSpeech: 'Adjective', definitions: [{ definition: 'Attractive.' }] }] },
      },
      [WIKT_PARSE]: { status: 429 },
      [MYMEMORY]: viReply('khá'),
    });
    const store = new MemoryDictionaryStore();
    const { entry, status } = await new DictionaryService(store).fetchEntry('pretty');

    expect(status).toBe('error');
    expect(entry.meanings).toHaveLength(1);
    expect(entry.ipa).toBeUndefined();
    expect(await store.get('pretty')).toBeNull();
  });

  it('trang phiên âm trả 200 nhưng từ thật sự không có IPA thì vẫn lưu bình thường', async () => {
    mockFetch({
      [DICTIONARY_API]: { status: 404 },
      [WIKT_REST]: {
        status: 200,
        body: { en: [{ partOfSpeech: 'Noun', definitions: [{ definition: 'A thing.' }] }] },
      },
      [WIKT_PARSE]: {
        status: 200,
        body: { parse: { wikitext: '==English==\nKhông có phiên âm.' } },
      },
      [MYMEMORY]: viReply('đồ vật'),
    });
    const store = new MemoryDictionaryStore();
    const { status } = await new DictionaryService(store).fetchEntry('thingy');

    expect(status).toBe('found');
    expect((await store.get('thingy'))?.meanings).toHaveLength(1);
  });

  it('mọi từ điển cùng trả 404 thì lưu "không có" (có nghĩa tiếng Việt), hết hạn sớm', async () => {
    mockFetch({
      [DICTIONARY_API]: { status: 404 },
      [WIKT_REST]: { status: 404 },
      [MYMEMORY]: viReply('xyz-vi'),
    });
    const store = new MemoryDictionaryStore();
    const { status } = await new DictionaryService(store).fetchEntry('zzyzx');

    expect(status).toBe('none');
    expect((await store.get('zzyzx'))?.vi).toBe('xyz-vi');
  });

  it('nghĩa tiếng Việt có mẫu "%s" chưa điền thì bỏ, nhưng từ vẫn lưu khi phần tiếng Anh đủ', async () => {
    mockFetch({
      [DICTIONARY_API]: {
        status: 200,
        body: [
          {
            phonetic: '/ˈdɑktɚ/',
            meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A physician.' }] }],
          },
        ],
      },
      [MYMEMORY]: viReply('%s bác sĩ'),
    });
    const store = new MemoryDictionaryStore();
    const { entry, status } = await new DictionaryService(store).fetchEntry('doctor');

    expect(status).toBe('found');
    expect(entry.vi).toBeUndefined();
    expect(entry.ipa).toBe('/ˈdɑktɚ/');
    expect((await store.get('doctor'))?.meanings).toHaveLength(1);
  });

  it('mất mạng hoàn toàn thì không lưu gì', async () => {
    mockFetch({});
    const store = new MemoryDictionaryStore();
    const { entry, status } = await new DictionaryService(store).fetchEntry('night');

    expect(status).toBe('error');
    expect(entry).toEqual({ word: 'night', meanings: [], partial: true });
    expect(await store.get('night')).toBeNull();
  });

  it('lookup dùng bản đã lưu, lần hai không gọi ra ngoài', async () => {
    const calls = mockFetch({
      [DICTIONARY_API]: {
        status: 200,
        body: [{ meanings: [{ partOfSpeech: 'verb', definitions: [{ definition: 'To go.' }] }] }],
      },
      [MYMEMORY]: viReply('đi'),
    });
    const service = new DictionaryService(new MemoryDictionaryStore());
    await service.lookup('go');
    const before = calls.length;
    expect((await service.lookup('go')).vi).toBe('đi');
    expect(calls.length).toBe(before);
  });
});
