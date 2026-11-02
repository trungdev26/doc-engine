import { CompletedLesson, Profile, SavedWord, WordGroup } from '../contracts';

/** Toàn bộ trạng thái học của một người dùng. */
export interface StoreData {
  profile: Profile;
  completed: Record<string, CompletedLesson>;
  savedWords: SavedWord[];
  groups: WordGroup[];
}

export function defaultData(): StoreData {
  return {
    profile: { track: 'dev', band: '3.0', nativeLang: 'vi', targetLang: 'en' },
    completed: {},
    savedWords: [],
    groups: [],
  };
}

/** Điền giá trị mặc định cho dữ liệu cũ hoặc thiếu trường để code phía trên không phải kiểm tra null. */
export function normalizeData(raw: unknown): StoreData {
  const saved = (raw ?? {}) as Partial<StoreData>;
  const base = defaultData();
  return {
    profile: { ...base.profile, ...saved.profile },
    completed: saved.completed ?? {},
    savedWords: Array.isArray(saved.savedWords)
      ? saved.savedWords.map(word => ({ ...word, groupIds: word.groupIds ?? [] }))
      : [],
    groups: Array.isArray(saved.groups) ? saved.groups : [],
  };
}
