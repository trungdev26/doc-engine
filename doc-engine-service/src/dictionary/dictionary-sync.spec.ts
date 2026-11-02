import { Lesson } from '../contracts';
import { ContentRepository } from '../content/content.repository';
import { collectWords, wordsIn } from './dictionary-words';
import { DictionarySyncService, orderFromCursor } from './dictionary-sync.service';
import { DictionaryService, FetchedEntry } from './dictionary.service';
import { DictionaryStore, EnglishStatus, MemoryDictionaryStore } from './dictionary.store';

describe('wordsIn / collectWords', () => {
  it('tách từ tra được: bỏ dấu câu, số và ký tự lạ, đổi chữ thường', () => {
    expect(wordsIn('“Fourty years later” Whatever, Thom. 1780 ...by 90% RAAAH!')).toEqual([
      'fourty',
      'years',
      'later',
      'whatever',
      'thom',
      'by',
      'raaah',
    ]);
    expect(wordsIn("You're a jerk, it’s well-known")).toEqual([
      "you're",
      'a',
      'jerk',
      "it's",
      'well-known',
    ]);
    expect(wordsIn('')).toEqual([]);
  });

  it('gom từ từ nhiều dạng bài học, mỗi từ một lần', () => {
    const video: Lesson = {
      kind: 'video',
      id: 'v',
      title: 't',
      source: { type: 'youtube', id: 'x' },
      cues: [
        { start: 0, text: 'Hello world' },
        { start: 2, text: 'hello again' },
      ],
    };
    expect([...collectWords(video)].sort()).toEqual(['again', 'hello', 'world']);

    const speaking: Lesson = {
      kind: 'speaking',
      id: 's',
      title: 't',
      situation: 'x',
      turns: [{ role: 'a', text: 'Good morning', vi: 'Chào buổi sáng' }],
      vocab: [{ word: 'greet', meaning: 'chào' }],
    };
    expect([...collectWords(speaking)].sort()).toEqual(['good', 'greet', 'morning']);
  });
});

describe('MemoryDictionaryStore', () => {
  it('trả bản đã lưu và cho biết từ nào đã có', async () => {
    const store = new MemoryDictionaryStore();
    expect(await store.get('night')).toBeNull();
    await store.set({ word: 'night', vi: 'đêm', meanings: [] }, 'found');
    expect((await store.get('night'))?.vi).toBe('đêm');
    expect([...(await store.fresh(['night', 'day']))]).toEqual(['night']);
  });

  it('từ từ điển nói là không có hết hạn sớm hơn từ đã có nội dung', async () => {
    const store = new MemoryDictionaryStore();
    await store.set({ word: 'zzz', vi: 'x', meanings: [] }, 'none');
    await store.set({ word: 'ok', vi: 'được', meanings: [] }, 'found');
    const realNow = Date.now;
    try {
      Date.now = () => realNow() + 4 * 86_400_000;
      expect(await store.get('zzz')).toBeNull();
      expect(await store.get('ok')).not.toBeNull();
      Date.now = () => realNow() + 91 * 86_400_000;
      expect(await store.get('ok')).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });
});

describe('DictionarySyncService', () => {
  const lesson: Lesson = {
    kind: 'video',
    id: 'v1',
    title: 't',
    source: { type: 'youtube', id: 'x' },
    cues: [{ start: 0, text: 'Pretty night, pretty robot' }],
  };

  const content = {
    units: jest.fn(async (skill: string, band: string) =>
      skill === 'video' && band === '3.0'
        ? [{ id: 'u', title: 'u', lessons: [{ id: 'v1', title: 't' }] }]
        : [],
    ),
    lesson: jest.fn(async () => lesson),
  } as unknown as ContentRepository;

  /** Từ điển giả: lưu vào kho như bản thật khi có kết quả chắc chắn, còn 'error' thì không lưu gì. */
  const fakeDictionary = (
    store: DictionaryStore,
    outcome: (word: string) => EnglishStatus | 'error' = () => 'found',
    delayMs = 0,
  ) => {
    const fetchEntry = jest.fn(async (word: string): Promise<FetchedEntry> => {
      if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
      const status = outcome(word);
      const entry = { word, vi: `vi-${word}`, meanings: [] };
      if (status !== 'error') await store.set(entry, status);
      return { entry, status };
    });
    return { fetchEntry };
  };

  const build = (store: DictionaryStore, dictionary: { fetchEntry: jest.Mock }) =>
    new DictionarySyncService(content, dictionary as unknown as DictionaryService, store);

  it('chỉ tra những từ chưa có trong kho và lưu lại, các lượt sau không tra lại', async () => {
    const store = new MemoryDictionaryStore();
    await store.set({ word: 'night', vi: 'đêm', meanings: [] }, 'found');
    const dictionary = fakeDictionary(store);
    const sync = build(store, dictionary);

    expect(await sync.allWords()).toEqual(['night', 'pretty', 'robot']);
    expect(await sync.syncOnce({ gapMs: 0 })).toBe(2);
    expect(dictionary.fetchEntry.mock.calls.map(call => call[0])).toEqual(['pretty', 'robot']);

    expect(await sync.syncOnce({ gapMs: 0 })).toBe(0);
    expect(dictionary.fetchEntry).toHaveBeenCalledTimes(2);
  });

  it('giới hạn số từ mỗi lượt và không chạy chồng hai lượt', async () => {
    const store = new MemoryDictionaryStore();
    const dictionary = fakeDictionary(store, () => 'found', 5);
    const sync = build(store, dictionary);

    const [first, second] = await Promise.all([
      sync.syncOnce({ gapMs: 0, limit: 1 }),
      sync.syncOnce({ gapMs: 0, limit: 1 }),
    ]);
    expect(first + second).toBe(1);
    expect(dictionary.fetchEntry).toHaveBeenCalledTimes(1);
  });

  it('trần tính cả từ đã có trong kho: đủ trần thì dừng, trần 0 thì không tra gì', async () => {
    const store = new MemoryDictionaryStore();
    await store.set({ word: 'night', vi: 'đêm', meanings: [] }, 'found');
    const dictionary = fakeDictionary(store);
    const sync = build(store, dictionary);

    // Đã có 1 từ, trần 2 nên chỉ còn chỗ cho đúng 1 từ nữa.
    expect(await sync.syncOnce({ gapMs: 0, limit: 2 })).toBe(1);
    expect(dictionary.fetchEntry.mock.calls.map(call => call[0])).toEqual(['pretty']);
    // Đã đủ 2 từ: lượt sau không tra thêm.
    expect(await sync.syncOnce({ gapMs: 0, limit: 2 })).toBe(0);
    expect(await sync.syncOnce({ gapMs: 0, limit: 0 })).toBe(0);
    expect(dictionary.fetchEntry).toHaveBeenCalledTimes(1);
  });

  it('ghi mốc sau mỗi từ và đi tiếp đúng chỗ ở lượt sau, hết danh sách thì về đầu', async () => {
    const store = new MemoryDictionaryStore();
    const dictionary = fakeDictionary(store);
    const sync = build(store, dictionary);

    // Danh sách: night, pretty, robot. Trần 1 từ cho mỗi lượt nên mỗi lượt tra đúng một từ.
    expect(await sync.syncOnce({ gapMs: 0, limit: 1 })).toBe(1);
    expect(await store.getSync('lessons')).toMatchObject({ cursor: 'night', processed: 1 });

    // Nâng trần lên 2: đi tiếp sau "night", không tra lại từ đầu.
    expect(await sync.syncOnce({ gapMs: 0, limit: 2 })).toBe(1);
    expect(dictionary.fetchEntry.mock.calls.map(call => call[0])).toEqual(['night', 'pretty']);
    expect(await store.getSync('lessons')).toMatchObject({ cursor: 'pretty', processed: 2 });

    // Tra nốt từ cuối thì hết một vòng: mốc về null để lượt sau quét lại từ đầu (bắt từ mới của bài mới).
    expect(await sync.syncOnce({ gapMs: 0, limit: 3 })).toBe(1);
    expect(await store.getSync('lessons')).toMatchObject({ cursor: null, processed: 3 });
  });

  it('sắp thứ tự từ mốc trở đi trước, rồi quay lại đầu danh sách', () => {
    const words = ['apple', 'bat', 'cat', 'dog'];
    expect(orderFromCursor(words, null)).toEqual(words);
    expect(orderFromCursor(words, 'bat')).toEqual(['cat', 'dog', 'apple', 'bat']);
    expect(orderFromCursor(words, 'dog')).toEqual(['apple', 'bat', 'cat', 'dog']);
    expect(orderFromCursor(words, 'zzz')).toEqual(words);
  });

  it('nguồn lỗi liên tục thì dừng lượt, không lưu, không đẩy mốc và đánh dấu để thử lại sớm', async () => {
    const store = new MemoryDictionaryStore();
    const dictionary = fakeDictionary(store, () => 'error');
    const sync = build(store, dictionary);

    expect(await sync.syncOnce({ gapMs: 0, errorGapMs: 0 })).toBe(0);
    // Ba từ, lỗi liên tục 3 lần thì dừng ngay lần thứ ba.
    expect(dictionary.fetchEntry).toHaveBeenCalledTimes(3);
    expect(sync.lastRunAborted).toBe(true);
    expect(await store.getSync('lessons')).toMatchObject({ cursor: null, processed: 0 });
    expect([...(await store.fresh(['night', 'pretty', 'robot']))]).toEqual([]);

    // Nguồn hồi phục: lượt sau tra lại đủ cả ba từ.
    const healthy = fakeDictionary(store);
    expect(await build(store, healthy).syncOnce({ gapMs: 0 })).toBe(3);
  });

  it('một từ lỗi lẻ tẻ thì được thử lại ở vòng sau, các từ khác vẫn xong', async () => {
    const store = new MemoryDictionaryStore();
    let pretty = 0;
    const dictionary = fakeDictionary(store, word =>
      word === 'pretty' && pretty++ === 0 ? 'error' : 'found',
    );
    const sync = build(store, dictionary);

    expect(await sync.syncOnce({ gapMs: 0, errorGapMs: 0 })).toBe(2);
    expect(sync.lastRunAborted).toBe(false);
    // Còn một từ lỗi nên chưa tính là hết vòng: mốc vẫn nằm ở từ cuối đã lưu.
    expect((await store.getSync('lessons')).cursor).toBe('robot');
    expect([...(await store.fresh(['night', 'pretty', 'robot']))].sort()).toEqual([
      'night',
      'robot',
    ]);

    expect(await sync.syncOnce({ gapMs: 0, errorGapMs: 0 })).toBe(1);
    expect([...(await store.fresh(['night', 'pretty', 'robot']))].sort()).toEqual([
      'night',
      'pretty',
      'robot',
    ]);
  });

  it('một bài lỗi không làm hỏng cả lượt', async () => {
    const broken = {
      units: content.units,
      lesson: jest.fn(async () => {
        throw new Error('hỏng');
      }),
    } as unknown as ContentRepository;
    const store = new MemoryDictionaryStore();
    const sync = new DictionarySyncService(
      broken,
      { fetchEntry: jest.fn() } as unknown as DictionaryService,
      store,
    );
    expect(await sync.allWords()).toEqual([]);
    expect(await sync.syncOnce({ gapMs: 0 })).toBe(0);
  });
});
