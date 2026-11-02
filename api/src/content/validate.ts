import { Lesson, SKILLS, Skill } from '../contracts';
import { BANDS } from './bands';
import { skillOf } from './lessons';

/** Một gói nội dung để nạp vào DB: các bài cùng một kỹ năng, band và unit. */
export interface ContentPack {
  skill: Skill;
  band: string;
  unit: { id: string; title: string };
  lessons: Lesson[];
}

export interface ParsedPack extends ContentPack {
  /** Lý do từng bài bị bỏ qua, để báo lại cho người nạp. */
  skipped: string[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNonEmptyArray = (value: unknown): boolean => Array.isArray(value) && value.length > 0;

function quizzesOk(quizzes: unknown): boolean {
  return (
    isNonEmptyArray(quizzes) &&
    (quizzes as unknown[]).every(
      quiz =>
        isObject(quiz) &&
        typeof quiz.question === 'string' &&
        Array.isArray(quiz.options) &&
        quiz.options.length >= 2 &&
        Number.isInteger(quiz.answer) &&
        (quiz.answer as number) >= 0 &&
        (quiz.answer as number) < quiz.options.length,
    )
  );
}

const nonEmptyString = (value: unknown): boolean => typeof value === 'string' && !!value.trim();

function validateSpeaking(lesson: Record<string, unknown>): string | null {
  if (isNonEmptyArray(lesson.sentences) && !lesson.turns) {
    return null;
  }
  if (!isNonEmptyArray(lesson.turns)) {
    return 'speaking cần sentences hoặc turns';
  }
  const roles = lesson.roles;
  if (!isNonEmptyArray(roles) || (roles as unknown[]).length < 2) {
    return 'speaking dạng hội thoại cần ít nhất 2 roles';
  }
  const roleIds = new Set<string>();
  for (const role of roles as unknown[]) {
    if (!isObject(role) || !nonEmptyString(role.id) || !nonEmptyString(role.name)) {
      return 'mỗi role cần id và name';
    }
    roleIds.add(role.id as string);
  }
  for (const [index, turn] of (lesson.turns as unknown[]).entries()) {
    if (!isObject(turn) || !nonEmptyString(turn.text) || !nonEmptyString(turn.vi)) {
      return `turn ${index + 1} cần text và vi`;
    }
    if (!roleIds.has(turn.role as string)) {
      return `turn ${index + 1} dùng role không có trong roles`;
    }
  }
  return null;
}

/** Chỉ nhận video YouTube (id 11 ký tự) hoặc tệp http(s), và phụ đề có thời gian tăng dần. */
function validateVideo(lesson: Record<string, unknown>): string | null {
  const source = lesson.source;
  if (!isObject(source)) {
    return 'video cần source';
  }
  if (source.type === 'youtube') {
    if (typeof source.id !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(source.id)) {
      return 'source.id của YouTube phải gồm 11 ký tự';
    }
  } else if (source.type === 'file') {
    if (typeof source.url !== 'string' || !/^https?:\/\//i.test(source.url)) {
      return 'source.url phải bắt đầu bằng http hoặc https';
    }
  } else {
    return 'source.type phải là youtube hoặc file';
  }
  if (lesson.topic !== undefined && (typeof lesson.topic !== 'string' || lesson.topic.length > 60)) {
    return 'topic phải là chuỗi tối đa 60 ký tự';
  }
  if (
    lesson.durationSeconds !== undefined &&
    (typeof lesson.durationSeconds !== 'number' ||
      !Number.isFinite(lesson.durationSeconds) ||
      lesson.durationSeconds <= 0)
  ) {
    return 'durationSeconds phải là số giây dương';
  }
  if (
    lesson.thumbnail !== undefined &&
    (typeof lesson.thumbnail !== 'string' || !/^https:\/\//i.test(lesson.thumbnail))
  ) {
    return 'thumbnail phải là link https';
  }
  if (!isNonEmptyArray(lesson.cues)) {
    return 'video cần cues';
  }
  let previous = -1;
  for (const [index, cue] of (lesson.cues as unknown[]).entries()) {
    if (!isObject(cue) || !nonEmptyString(cue.text)) {
      return `cue ${index + 1} cần text`;
    }
    if (typeof cue.start !== 'number' || !Number.isFinite(cue.start) || cue.start < 0) {
      return `cue ${index + 1} cần start là số giây không âm`;
    }
    if (
      cue.end !== undefined &&
      (typeof cue.end !== 'number' || !Number.isFinite(cue.end) || cue.end <= cue.start)
    ) {
      return `cue ${index + 1} có end không hợp lệ (phải lớn hơn start)`;
    }
    if (cue.start <= previous) {
      return `cue ${index + 1} phải có start lớn hơn cue trước`;
    }
    previous = cue.start;
  }
  return null;
}

/** Trả về lý do bài học không dùng được, hoặc null nếu hợp lệ. */
export function validateLesson(lesson: unknown): string | null {
  if (!isObject(lesson)) return 'không phải đối tượng';
  if (typeof lesson.id !== 'string' || !/^[a-z0-9-]+$/.test(lesson.id)) {
    return 'id phải là chữ thường, số và dấu gạch ngang';
  }
  if (typeof lesson.title !== 'string' || !lesson.title.trim()) return 'thiếu title';

  switch (lesson.kind) {
    case 'vocab':
      return isNonEmptyArray(lesson.words) ? null : 'vocab cần words';
    case 'speaking':
      return validateSpeaking(lesson);
    case 'video':
      return validateVideo(lesson);
    case 'grammar':
      return isNonEmptyArray(lesson.rules) && quizzesOk(lesson.practice)
        ? null
        : 'grammar cần rules và practice hợp lệ (answer phải nằm trong options)';
    case 'reading':
      return isNonEmptyArray(lesson.paragraphs) &&
        quizzesOk(lesson.questions) &&
        quizzesOk(lesson.review)
        ? null
        : 'reading cần paragraphs, questions và review hợp lệ';
    case 'listening':
      return isNonEmptyArray(lesson.lines) && quizzesOk(lesson.questions)
        ? null
        : 'listening cần lines và questions hợp lệ';
    default:
      return 'kind không hợp lệ';
  }
}

/** Kiểm tra cấu trúc gói; ném lỗi nếu hỏng, còn bài lẻ không hợp lệ thì bỏ qua và ghi vào `skipped`. */
export function parsePack(raw: unknown): ParsedPack {
  if (!isObject(raw)) throw new Error('gói nội dung phải là một đối tượng JSON');
  const { skill, band, unit, lessons } = raw as Partial<ContentPack>;
  if (!skill || !SKILLS.includes(skill)) throw new Error('skill không hợp lệ');
  if (!BANDS.some(item => item.id === band)) throw new Error('band không hợp lệ');
  if (!unit?.id || !unit.title) throw new Error('thiếu unit.id hoặc unit.title');
  if (!isNonEmptyArray(lessons)) throw new Error('lessons rỗng');

  const accepted: Lesson[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const lesson of lessons!) {
    const problem = validateLesson(lesson);
    const id = isObject(lesson) ? String(lesson.id) : '?';
    if (problem) {
      skipped.push(`${id}: ${problem}`);
    } else if (skillOf(lesson) !== skill) {
      skipped.push(`${id}: không thuộc kỹ năng ${skill}`);
    } else if (seen.has(lesson.id)) {
      skipped.push(`${id}: trùng id trong cùng gói`);
    } else {
      seen.add(lesson.id);
      accepted.push(lesson);
    }
  }
  if (!accepted.length) throw new Error(`không có bài hợp lệ nào (${skipped.join('; ')})`);
  return { skill, band: band!, unit, lessons: accepted, skipped };
}
