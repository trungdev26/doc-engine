/** Bản sao hợp đồng dữ liệu của api/src/contracts.ts. Sửa một bên thì sửa bên kia. */

export type Skill = 'words' | 'grammar' | 'listening' | 'speaking' | 'reading' | 'video';

export interface Band {
  id: string;
  label: string;
  cefr: string;
  level: string;
}

export interface RoadmapLesson {
  id: string;
  title: string;
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
  ipa?: string;
}

export interface SpeakingRole {
  id: string;
  name: string;
  description: string;
}

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

export interface VideoCue {
  start: number;
  /** Giờ kết thúc câu (giây); thiếu thì ước lượng theo số từ. */
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
  topic?: string;
  durationSeconds?: number;
  thumbnail?: string;
  credit?: string;
  source: VideoSource;
  cues: VideoCue[];
}

export type Lesson =
  | VocabLesson
  | GrammarLesson
  | ReadingLesson
  | ListeningLesson
  | SpeakingLesson
  | VideoLesson;

export interface WordGroup {
  id: string;
  name: string;
  createdAt: string;
}

export interface WordGroupSummary extends WordGroup {
  count: number;
  due: number;
}

export interface QuizQuestion {
  wordId: string;
  prompt: string;
  options: string[];
  answer: number;
}

export interface SavedWord {
  id: string;
  word: string;
  meaning: string;
  ipa?: string;
  example?: string;
  groupIds: string[];
  box: number;
  dueAt: string;
  addedAt: string;
}

export interface DictionaryMeaning {
  partOfSpeech: string;
  definition: string;
  example?: string;
}

export interface DictionaryEntry {
  word: string;
  ipa?: string;
  audio?: string;
  meanings: DictionaryMeaning[];
  vi?: string;
  /** true khi máy chủ chưa lấy đủ dữ liệu (nguồn lỗi tạm thời): không lưu từ, cho tra lại. */
  partial?: boolean;
}

export type ReviewGrade = 'again' | 'good' | 'easy';

export type SkillProgress = Record<Skill, { completed: number; total: number }>;

export interface VideoCard {
  id: string;
  title: string;
  channel?: string;
  topic: string;
  /** Trình độ CEFR suy từ band chứa video. */
  level: string;
  band: string;
  durationSeconds?: number;
  source: VideoSource;
  thumbnail?: string;
}
