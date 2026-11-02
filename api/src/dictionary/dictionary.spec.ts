import {
  WORD_PATTERN,
  commonsAudioUrl,
  lemmaCandidates,
  normalizeWord,
  parseDictionaryResponse,
  parseWiktionaryDefinitions,
  parseWiktionaryPronunciation,
} from './dictionary';

describe('Wiktionary', () => {
  const wikitext = [
    '==French==',
    '{{IPA|fr|/pʁɛ.ti/}}',
    '==English==',
    '===Pronunciation===',
    '* {{a|RP}} {{IPA|en|/ˈpɹɪt.i/|a=RP}}',
    '* {{a|GA}} {{IPA|en|/ˈpɹɪt.i/|[ˈpɹɪɾ.i]|a=GA,CA}}',
    '* {{audio|en|LL-Q1860 (eng)-Someone-pretty.wav|a=UK}}',
    '* {{audio|en|en-us-pretty.ogg|a=US}}',
    '===Adjective===',
    '==Spanish==',
    '{{IPA|es|/x/}}',
  ].join('\n');

  it('lấy IPA giọng Mỹ và file âm thanh en-us, bỏ qua các ngôn ngữ khác', () => {
    expect(parseWiktionaryPronunciation(wikitext)).toEqual({
      ipa: '/ˈpɹɪt.i/',
      audioFile: 'en-us-pretty.ogg',
    });
  });

  it('không có phần tiếng Anh hoặc tên file lạ thì bỏ qua', () => {
    expect(parseWiktionaryPronunciation('==French==\n{{IPA|fr|/x/}}')).toEqual({});
    expect(parseWiktionaryPronunciation('==English==\n{{audio|en|../../etc/passwd|a=US}}')).toEqual(
      {},
    );
  });

  it('dựng link phát âm từ Wikimedia Commons', () => {
    expect(commonsAudioUrl('en-us-pretty.ogg')).toBe(
      'https://commons.wikimedia.org/wiki/Special:FilePath/en-us-pretty.ogg',
    );
    expect(commonsAudioUrl('A b.wav')).toBe(
      'https://commons.wikimedia.org/wiki/Special:FilePath/A_b.wav',
    );
  });

  it('rút gọn định nghĩa: bỏ thẻ HTML và style, mỗi từ loại một nghĩa', () => {
    const raw = {
      en: [
        {
          partOfSpeech: 'Adjective',
          definitions: [
            {
              definition:
                '<a href="/wiki/pleasant">Pleasant</a> to the sight; <b>attractive</b>. <style>.x{color:red}</style>',
            },
            { definition: 'Second meaning.' },
          ],
        },
        { partOfSpeech: 'Adverb', definitions: [{ definition: 'Fairly &amp; somewhat.' }] },
        { partOfSpeech: 'Noun', definitions: [] },
      ],
    };
    expect(parseWiktionaryDefinitions(raw)).toEqual([
      { partOfSpeech: 'adjective', definition: 'Pleasant to the sight; attractive.' },
      { partOfSpeech: 'adverb', definition: 'Fairly & somewhat.' },
    ]);
    expect(parseWiktionaryDefinitions({ title: 'Not found' })).toEqual([]);
    expect(parseWiktionaryDefinitions(null)).toEqual([]);
  });
});

describe('dictionary helpers', () => {
  it('chỉ nhận từ gồm chữ cái, dấu nháy và gạch nối', () => {
    for (const ok of ['passion', "don't", 'well-known', 'a', "Thom's", 'it’s']) {
      expect(WORD_PATTERN.test(ok)).toBe(true);
    }
    for (const bad of [
      '',
      '1780',
      'a/b',
      '../etc',
      'hello world',
      '-x',
      "x'",
      'a'.repeat(41),
      'x?y=1',
    ]) {
      expect(WORD_PATTERN.test(bad)).toBe(false);
    }
  });

  it('chuẩn hóa chữ thường và dấu nháy cong', () => {
    expect(normalizeWord('  Don’t ')).toBe("don't");
  });

  it('đề xuất dạng gốc, dạng đúng luôn đứng đầu', () => {
    expect(lemmaCandidates('freaked')).toEqual(['freaked', 'freak', 'freake']);
    expect(lemmaCandidates('passions')).toContain('passion');
    expect(lemmaCandidates('stories')).toContain('story');
    expect(lemmaCandidates('running')).toEqual(expect.arrayContaining(['run', 'runn', 'runne']));
    expect(lemmaCandidates('stopped')).toContain('stop');
    expect(lemmaCandidates("thom's")).toContain('thom');
    expect(lemmaCandidates('go')).toEqual(['go']);
  });

  it('rút gọn phản hồi từ điển: phiên âm, âm thanh https, tối đa 4 nghĩa', () => {
    const raw = [
      {
        phonetic: '[ˈpʰæʃən]',
        phonetics: [
          { text: '[ˈpʰæʃən]', audio: 'http://x/a.mp3' },
          { audio: 'https://x/passion.mp3' },
        ],
        meanings: [
          {
            partOfSpeech: 'noun',
            definitions: [{ definition: 'A strong emotion.', example: 'a passion for books' }],
          },
          { partOfSpeech: 'verb', definitions: [{ definition: 'To feel strongly.' }] },
          ...Array.from({ length: 6 }, () => ({
            partOfSpeech: 'adj',
            definitions: [{ definition: 'x' }],
          })),
        ],
      },
    ];
    const parsed = parseDictionaryResponse('passion', raw)!;
    expect(parsed.ipa).toBe('/ˈpʰæʃən/');
    expect(parsed.audio).toBe('https://x/passion.mp3');
    expect(parsed.meanings).toHaveLength(4);
    expect(parsed.meanings[0]).toEqual({
      partOfSpeech: 'noun',
      definition: 'A strong emotion.',
      example: 'a passion for books',
    });
  });

  it('phản hồi lạ hoặc rỗng thì trả null, không ném lỗi', () => {
    expect(parseDictionaryResponse('x', { title: 'No Definitions Found' })).toBeNull();
    expect(parseDictionaryResponse('x', [])).toBeNull();
    expect(parseDictionaryResponse('x', [null, 5, { meanings: 'sai' }])).toBeNull();
  });
});
