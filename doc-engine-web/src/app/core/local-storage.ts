export const STORAGE_KEYS = {
  theme: 'dev-internals.theme',
  bookmarks: 'dev-internals.bookmarks',
  recent: 'dev-internals.recent',
  sidebarWidth: 'dev-internals.sidebar-width',
  profile: 'dev-internals.profile',
} as const;

export function readStringArray(key: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
  } catch {
    return [];
  }
}
