/** Hợp đồng dữ liệu giữa API và FE. FE giữ bản sao ở src/app/core/api.models.ts. */

export type Track = 'dev' | 'english';
export type Skill = 'words' | 'grammar' | 'listening' | 'speaking' | 'reading' | 'video';
export const SKILLS: Skill[] = ['words', 'grammar', 'listening', 'speaking', 'reading', 'video'];

export interface Band {
  id: string;
  label: string;
  cefr: string;
  level: string;
}

export interface Profile {
  track: Track;
  band: string;
  nativeLang: 'vi';
  targetLang: 'en';
}

export interface RoadmapLesson {
  id: string;
  title: string;
  subtitle?: string;
  available: boolean;
  completed: boolean;
}

export interface RoadmapUnit {
  id: string;
  title: string;
  lessons: RoadmapLesson[];
}

export interface Roadmap {
  skill: Skill;
  band: string;
  units: RoadmapUnit[];
  completedCount: number;
  totalCount: number;
}

export interface Quiz {
  question: string;
  options: string[];
  answer: number;
}

export interface VocabWord {
  word: string;
  pos: string;
  ipa: string;
  meaning: string;
  definition: string;
  example: string;
  exampleVi: string;
}

export interface VocabLesson {
  kind: 'vocab';
  id: string;
  title: string;
  words: VocabWord[];
}

export interface GrammarRule {
  subject: string;
  verb: string;
  short: string;
  example: string;
  note: string;
}

export interface GrammarLesson {
  kind: 'grammar';
  id: string;
  title: string;
  intro: string;
  rules: GrammarRule[];
  practice: Quiz[];
}

export interface ReadingLesson {
  kind: 'reading';
  id: string;
  title: string;
  context: string;
  meta: string[];
  paragraphs: string[];
  questions: Quiz[];
  review: Quiz[];
}

export interface DialogueLine {
  speaker: string;
  text: string;
  vi: string;
}

export interface ListeningLesson {
  kind: 'listening';
  id: string;
  title: string;
  situation: string;
  lines: DialogueLine[];
  questions: Quiz[];
}

export interface SpeakingSentence {
  text: string;
  vi: string;
  /** Không bắt buộc: bỏ trống thì giao diện không hiện dòng phiên âm. */
  ipa?: string;
}

export interface SpeakingRole {
  id: string;
  name: string;
  description: string;
}

/** Một lượt thoại trong hội thoại luyện nói; `role` trỏ tới `SpeakingRole.id`. */
export interface SpeakingTurn {
  role: string;
  text: string;
  vi: string;
}

export interface SpeakingPhrase {
  text: string;
  vi: string;
}

export interface SpeakingVocab {
  word: string;
  meaning: string;
  pos?: string;
  example?: string;
  exampleVi?: string;
}

/**
 * Bài luyện nói. Dạng đơn giản chỉ có `sentences`. Dạng hội thoại có `turns` và `roles`, kèm mục tiêu,
 * mẫu câu chính và từ vựng; giao diện dựng các bước Bối cảnh, Shadowing, Role-play, Dictation, Từ vựng.
 */
export interface SpeakingLesson {
  kind: 'speaking';
  id: string;
  title: string;
  situation: string;
  sentences?: SpeakingSentence[];
  roles?: SpeakingRole[];
  goals?: string[];
  phrases?: SpeakingPhrase[];
  turns?: SpeakingTurn[];
  vocab?: SpeakingVocab[];
}

/** Một dòng phụ đề: `start` tính bằng giây từ đầu video. */
export interface VideoCue {
  start: number;
  /** Giờ kết thúc câu (giây). Không bắt buộc; thiếu thì giao diện ước lượng theo số từ. */
  end?: number;
  text: string;
  vi?: string;
}

export type VideoSource = { type: 'youtube'; id: string } | { type: 'file'; url: string };

export interface VideoLesson {
  kind: 'video';
  id: string;
  title: string;
  channel?: string;
  /** Chủ đề để gom nhóm ở danh sách, ví dụ "Truyện & hoạt hình". */
  topic?: string;
  /** Thời lượng video (giây), hiện ở góc ảnh xem trước. */
  durationSeconds?: number;
  /** Ảnh xem trước cho video dạng tệp. Video YouTube tự lấy ảnh từ id nên không cần. */
  thumbnail?: string;
  /** Dòng ghi nguồn bắt buộc theo giấy phép (ví dụ Creative Commons), hiện dưới video. */
  credit?: string;
  source: VideoSource;
  cues: VideoCue[];
}

/** Thẻ video ở danh sách: không kèm phụ đề để danh sách nhẹ. */
export interface VideoCard {
  id: string;
  title: string;
  channel?: string;
  topic: string;
  /** Trình độ CEFR suy từ band chứa video (A1 đến C2). */
  level: string;
  band: string;
  durationSeconds?: number;
  source: VideoSource;
  thumbnail?: string;
}

export const DEFAULT_VIDEO_TOPIC = 'Khác';

export type Lesson =
  | VocabLesson
  | GrammarLesson
  | ReadingLesson
  | ListeningLesson
  | SpeakingLesson
  | VideoLesson;

export interface CompletedLesson {
  completedAt: string;
  score: number;
}

export interface WordGroup {
  id: string;
  name: string;
  createdAt: string;
}

export interface SavedWord {
  id: string;
  word: string;
  meaning: string;
  ipa?: string;
  example?: string;
  /** Các nhóm từ chứa từ này. */
  groupIds: string[];
  box: number;
  dueAt: string;
  addedAt: string;
  lastReviewedAt?: string;
}

export type ReviewGrade = 'again' | 'good' | 'easy';
