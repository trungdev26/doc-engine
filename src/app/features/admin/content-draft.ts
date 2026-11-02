import { Skill } from '../../core/api.models';

export type Kind = 'vocab' | 'grammar' | 'reading' | 'listening' | 'speaking';

export const KINDS: { kind: Kind; skill: Skill; label: string }[] = [
  { kind: 'vocab', skill: 'words', label: 'Từ vựng' },
  { kind: 'grammar', skill: 'grammar', label: 'Ngữ pháp' },
  { kind: 'reading', skill: 'reading', label: 'Đọc hiểu' },
  { kind: 'listening', skill: 'listening', label: 'Luyện nghe' },
  { kind: 'speaking', skill: 'speaking', label: 'Luyện nói' },
];

export interface QuizDraft {
  question: string;
  options: string[];
  answer: number;
}
export interface WordDraft {
  word: string;
  pos: string;
  ipa: string;
  meaning: string;
  definition: string;
  example: string;
  exampleVi: string;
}
export interface SentenceDraft {
  text: string;
  vi: string;
  ipa: string;
}
export interface RuleDraft {
  subject: string;
  verb: string;
  short: string;
  example: string;
  note: string;
}
export interface LineDraft {
  speaker: string;
  text: string;
  vi: string;
}

export interface Draft {
  kind: Kind;
  band: string;
  unitId: string;
  unitTitle: string;
  lessonId: string;
  title: string;
  situation: string;
  intro: string;
  context: string;
  metaText: string;
  paragraphsText: string;
  words: WordDraft[];
  sentences: SentenceDraft[];
  rules: RuleDraft[];
  lines: LineDraft[];
  practice: QuizDraft[];
  questions: QuizDraft[];
  review: QuizDraft[];
}

export const emptyQuiz = (): QuizDraft => ({ question: '', options: ['', ''], answer: 0 });
export const emptyWord = (): WordDraft => ({
  word: '',
  pos: '',
  ipa: '',
  meaning: '',
  definition: '',
  example: '',
  exampleVi: '',
});
export const emptySentence = (): SentenceDraft => ({ text: '', vi: '', ipa: '' });
export const emptyRule = (): RuleDraft => ({
  subject: '',
  verb: '',
  short: '',
  example: '',
  note: '',
});
export const emptyLine = (): LineDraft => ({ speaker: '', text: '', vi: '' });

export function emptyDraft(kind: Kind, base?: Partial<Draft>): Draft {
  return {
    kind,
    band: base?.band ?? '3.0',
    unitId: base?.unitId ?? '',
    unitTitle: base?.unitTitle ?? '',
    lessonId: '',
    title: '',
    situation: '',
    intro: '',
    context: '',
    metaText: '',
    paragraphsText: '',
    words: [emptyWord()],
    sentences: [emptySentence()],
    rules: [emptyRule()],
    lines: [emptyLine(), emptyLine()],
    practice: [emptyQuiz()],
    questions: [emptyQuiz()],
    review: [emptyQuiz()],
  };
}

/** Tạo id dạng "chao-hoi-lam-quen" từ tiêu đề tiếng Việt. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const blank = (value: string): boolean => !value.trim();
const rowEmpty = (row: object): boolean => Object.values(row).every(v => blank(String(v)));
const quizEmpty = (quiz: QuizDraft): boolean => blank(quiz.question) && quiz.options.every(blank);

const trimmed = <T extends object>(row: T): T =>
  Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value).trim()])) as T;

/** Bỏ các dòng để trống hẳn, giữ các dòng đã nhập dở để còn báo lỗi. */
function filledRows<T extends object>(rows: T[]): T[] {
  return rows.filter(row => !rowEmpty(row)).map(trimmed);
}
function filledQuizzes(quizzes: QuizDraft[]): QuizDraft[] {
  return quizzes
    .filter(quiz => !quizEmpty(quiz))
    .map(quiz => ({
      question: quiz.question.trim(),
      options: quiz.options.map(option => option.trim()).filter(option => option),
      // Bỏ ô lựa chọn trống thì phải dời vị trí đáp án đúng theo.
      answer: quiz.options
        .slice(0, quiz.answer)
        .map(option => option.trim())
        .filter(option => option).length,
    }));
}

function checkQuizzes(label: string, quizzes: QuizDraft[], errors: string[]): void {
  const rows = filledQuizzes(quizzes);
  if (!rows.length) {
    errors.push(`${label}: cần ít nhất một câu hỏi.`);
  }
  rows.forEach((quiz, index) => {
    const name = `${label}, câu ${index + 1}`;
    if (!quiz.question) errors.push(`${name}: chưa có nội dung câu hỏi.`);
    if (quiz.options.length < 2) errors.push(`${name}: cần ít nhất 2 lựa chọn.`);
    const original = quizzes.filter(item => !quizEmpty(item))[index];
    if (original && blank(original.options[original.answer] ?? '')) {
      errors.push(`${name}: đáp án đúng đang trỏ vào ô lựa chọn trống.`);
    }
  });
}

function checkRows<T extends object>(
  label: string,
  rows: T[],
  required: { key: keyof T; name: string }[],
  errors: string[],
): void {
  const filled = filledRows(rows);
  if (!filled.length) {
    errors.push(`${label}: cần ít nhất một dòng.`);
  }
  filled.forEach((row, index) => {
    for (const { key, name } of required) {
      if (blank(String(row[key]))) errors.push(`${label}, dòng ${index + 1}: thiếu ${name}.`);
    }
  });
}

/** Trả về danh sách lỗi bằng tiếng Việt; rỗng nghĩa là có thể lưu. */
export function validateDraft(draft: Draft): string[] {
  const errors: string[] = [];
  if (blank(draft.unitTitle)) errors.push('Chưa nhập tên unit.');
  if (blank(draft.unitId)) errors.push('Chưa có mã unit.');
  else if (!/^[a-z0-9-]+$/.test(draft.unitId))
    errors.push('Mã unit chỉ gồm chữ thường, số và dấu "-".');
  if (blank(draft.title)) errors.push('Chưa nhập tên bài học.');
  if (blank(draft.lessonId)) errors.push('Chưa có mã bài học.');
  else if (!/^[a-z0-9-]+$/.test(draft.lessonId)) {
    errors.push('Mã bài học chỉ gồm chữ thường, số và dấu "-".');
  }

  switch (draft.kind) {
    case 'vocab':
      checkRows(
        'Từ vựng',
        draft.words,
        [
          { key: 'word', name: 'từ' },
          { key: 'meaning', name: 'nghĩa' },
        ],
        errors,
      );
      break;
    case 'speaking':
      if (blank(draft.situation)) errors.push('Chưa nhập tình huống.');
      checkRows(
        'Câu luyện nói',
        draft.sentences,
        [
          { key: 'text', name: 'câu tiếng Anh' },
          { key: 'vi', name: 'bản dịch' },
        ],
        errors,
      );
      break;
    case 'grammar':
      if (blank(draft.intro)) errors.push('Chưa nhập phần giải thích quy tắc.');
      checkRows(
        'Quy tắc',
        draft.rules,
        [
          { key: 'subject', name: 'chủ ngữ' },
          { key: 'verb', name: 'động từ' },
          { key: 'short', name: 'dạng rút gọn' },
          { key: 'example', name: 'ví dụ' },
        ],
        errors,
      );
      checkQuizzes('Luyện tập', draft.practice, errors);
      break;
    case 'reading':
      if (blank(draft.context)) errors.push('Chưa nhập bối cảnh.');
      if (!splitParagraphs(draft.paragraphsText).length) errors.push('Chưa nhập nội dung bài đọc.');
      checkQuizzes('Câu hỏi', draft.questions, errors);
      checkQuizzes('Ôn lại', draft.review, errors);
      break;
    case 'listening':
      if (blank(draft.situation)) errors.push('Chưa nhập tình huống.');
      checkRows(
        'Lời thoại',
        draft.lines,
        [
          { key: 'speaker', name: 'người nói' },
          { key: 'text', name: 'câu tiếng Anh' },
          { key: 'vi', name: 'bản dịch' },
        ],
        errors,
      );
      checkQuizzes('Câu hỏi', draft.questions, errors);
      break;
  }
  return errors;
}

export const splitParagraphs = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map(part => part.trim())
    .filter(Boolean);

const splitLines = (text: string): string[] =>
  text
    .split('\n')
    .map(part => part.trim())
    .filter(Boolean);

/** Dựng gói nội dung đúng định dạng API (`ContentPack`). Gọi sau khi `validateDraft` trả về rỗng. */
export function buildPack(draft: Draft): Record<string, unknown> {
  const skill = KINDS.find(item => item.kind === draft.kind)!.skill;
  const base = { kind: draft.kind, id: draft.lessonId.trim(), title: draft.title.trim() };

  let lesson: Record<string, unknown>;
  switch (draft.kind) {
    case 'vocab':
      lesson = { ...base, words: filledRows(draft.words) };
      break;
    case 'speaking':
      lesson = {
        ...base,
        situation: draft.situation.trim(),
        sentences: filledRows(draft.sentences),
      };
      break;
    case 'grammar':
      lesson = {
        ...base,
        intro: draft.intro.trim(),
        rules: filledRows(draft.rules),
        practice: filledQuizzes(draft.practice),
      };
      break;
    case 'reading':
      lesson = {
        ...base,
        context: draft.context.trim(),
        meta: splitLines(draft.metaText),
        paragraphs: splitParagraphs(draft.paragraphsText),
        questions: filledQuizzes(draft.questions),
        review: filledQuizzes(draft.review),
      };
      break;
    case 'listening':
      lesson = {
        ...base,
        situation: draft.situation.trim(),
        lines: filledRows(draft.lines),
        questions: filledQuizzes(draft.questions),
      };
      break;
  }

  return {
    skill,
    band: draft.band,
    unit: { id: draft.unitId.trim(), title: draft.unitTitle.trim() },
    lessons: [lesson],
  };
}
