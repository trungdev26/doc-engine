import { buildPack, emptyDraft, slugify, splitParagraphs, validateDraft } from './content-draft';

describe('content-draft', () => {
  describe('slugify', () => {
    it('bỏ dấu tiếng Việt và đổi đ thành d', () => {
      expect(slugify('Chào hỏi làm quen')).toBe('chao-hoi-lam-quen');
      expect(slugify('Đây là tôi!')).toBe('day-la-toi');
    });

    it('gộp ký tự đặc biệt và cắt dấu gạch ở hai đầu', () => {
      expect(slugify('  Unit 1 · Giới thiệu  ')).toBe('unit-1-gioi-thieu');
    });
  });

  it('tách đoạn văn theo dòng trống', () => {
    expect(splitParagraphs('Hi Linh,\n\nMy name is Marta.\nI live in Lisbon.\n\n\nBye')).toEqual([
      'Hi Linh,',
      'My name is Marta.\nI live in Lisbon.',
      'Bye',
    ]);
  });

  describe('validateDraft', () => {
    const base = () => ({
      ...emptyDraft('vocab', { unitId: 'unit-1', unitTitle: 'Unit 1' }),
      lessonId: 'bai-1',
      title: 'Bài 1',
    });

    it('báo đủ lỗi khi form còn trống', () => {
      const errors = validateDraft(emptyDraft('vocab'));
      expect(errors).toContain('Chưa nhập tên unit.');
      expect(errors).toContain('Chưa nhập tên bài học.');
      expect(errors).toContain('Từ vựng: cần ít nhất một dòng.');
    });

    it('chấp nhận bài từ vựng đã nhập đủ và bỏ qua dòng để trống', () => {
      const draft = base();
      draft.words = [
        { ...draft.words[0], word: 'hello', meaning: 'xin chào' },
        { ...draft.words[0], word: '', meaning: '' },
      ];
      expect(validateDraft(draft)).toEqual([]);
      const lesson = (buildPack(draft)['lessons'] as { words: unknown[] }[])[0];
      expect(lesson.words.length).toBe(1);
    });

    it('báo dòng nhập dở thay vì bỏ qua âm thầm', () => {
      const draft = base();
      draft.words = [{ ...draft.words[0], word: 'hello', meaning: '' }];
      expect(validateDraft(draft)).toEqual(['Từ vựng, dòng 1: thiếu nghĩa.']);
    });

    it('từ chối mã có ký tự không hợp lệ', () => {
      const draft = { ...base(), lessonId: 'Bài 1' };
      expect(validateDraft(draft)).toContain('Mã bài học chỉ gồm chữ thường, số và dấu "-".');
    });

    it('báo đáp án đúng trỏ vào ô lựa chọn trống', () => {
      const draft = emptyDraft('grammar', { unitId: 'c1', unitTitle: 'C1' });
      draft.lessonId = 'g1';
      draft.title = 'G1';
      draft.intro = 'Giải thích';
      draft.rules = [{ subject: 'I', verb: 'am', short: "I'm", example: "I'm here.", note: '' }];
      draft.practice = [{ question: 'I ___ here.', options: ['am', '', 'is'], answer: 1 }];
      expect(validateDraft(draft)).toEqual([
        'Luyện tập, câu 1: đáp án đúng đang trỏ vào ô lựa chọn trống.',
      ]);
    });
  });

  describe('buildPack', () => {
    it('dời vị trí đáp án đúng khi bỏ ô lựa chọn trống phía trước', () => {
      const draft = emptyDraft('listening', { unitId: 's1', unitTitle: 'S1' });
      draft.lessonId = 'l1';
      draft.title = 'L1';
      draft.situation = 'Tình huống';
      draft.lines = [{ speaker: 'A', text: 'Hi', vi: 'Chào' }];
      draft.questions = [{ question: 'Q?', options: ['', 'x', 'y'], answer: 2 }];

      expect(validateDraft(draft)).toEqual([]);
      const lesson = (
        buildPack(draft)['lessons'] as { questions: { options: string[]; answer: number }[] }[]
      )[0];
      expect(lesson.questions[0].options).toEqual(['x', 'y']);
      expect(lesson.questions[0].answer).toBe(1);
    });

    it('gắn đúng kỹ năng và unit cho gói', () => {
      const draft = emptyDraft('speaking', { band: '3.5', unitId: 's1', unitTitle: 'Chặng 1' });
      draft.lessonId = 'noi-1';
      draft.title = 'Nói 1';
      draft.situation = 'Gặp bạn mới';
      draft.sentences = [{ text: 'Hello.', vi: 'Xin chào.', ipa: '' }];
      expect(buildPack(draft)).toEqual({
        skill: 'speaking',
        band: '3.5',
        unit: { id: 's1', title: 'Chặng 1' },
        lessons: [
          {
            kind: 'speaking',
            id: 'noi-1',
            title: 'Nói 1',
            situation: 'Gặp bạn mới',
            sentences: [{ text: 'Hello.', vi: 'Xin chào.', ipa: '' }],
          },
        ],
      });
    });
  });
});
