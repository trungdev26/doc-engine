import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Band,
  DictionaryEntry,
  Lesson,
  QuizQuestion,
  ReviewGrade,
  Roadmap,
  SavedWord,
  Skill,
  SkillProgress,
  VideoCard,
  WordGroup,
  WordGroupSummary,
} from './api.models';

const API = '/api';

@Injectable({ providedIn: 'root' })
export class EnglishApiService {
  constructor(private readonly http: HttpClient) {}

  profile(): Observable<{ track: 'dev' | 'english'; band: string }> {
    return this.http.get<{ track: 'dev' | 'english'; band: string }>(`${API}/profile`);
  }

  bands(): Observable<Band[]> {
    return this.http.get<Band[]>(`${API}/bands`);
  }

  /** Bỏ trống `band` thì máy chủ dùng band trong hồ sơ của người đang đăng nhập. */
  roadmap(skill: Skill, band?: string): Observable<Roadmap> {
    return this.http.get<Roadmap>(`${API}/skills/${skill}/roadmap`, {
      params: band ? { band } : {},
    });
  }

  progress(): Observable<SkillProgress> {
    return this.http.get<SkillProgress>(`${API}/progress`);
  }

  setBand(band: string): Observable<unknown> {
    return this.http.put(`${API}/profile`, { band });
  }

  /** Tra một từ: phiên âm, âm thanh, định nghĩa và nghĩa tiếng Việt. Công khai. */
  define(word: string): Observable<DictionaryEntry> {
    return this.http.get<DictionaryEntry>(`${API}/dictionary/${encodeURIComponent(word)}`);
  }

  /** Tra một cụm từ (2 đến 8 từ) người học kéo chọn: trả nghĩa tiếng Việt. Công khai. */
  definePhrase(text: string): Observable<DictionaryEntry> {
    return this.http.get<DictionaryEntry>(`${API}/dictionary/phrases/lookup`, {
      params: { text },
    });
  }

  videos(): Observable<VideoCard[]> {
    return this.http.get<VideoCard[]>(`${API}/videos`);
  }

  lesson<T extends Lesson>(id: string): Observable<T> {
    return this.http.get<T>(`${API}/lessons/${id}`);
  }

  complete(id: string, score: number): Observable<unknown> {
    return this.http.post(`${API}/lessons/${id}/complete`, { score });
  }

  adminStatus(): Observable<{ writable: boolean }> {
    return this.http.get<{ writable: boolean }>(`${API}/admin/content/status`);
  }

  importPack(pack: Record<string, unknown>): Observable<{ imported: number; skipped: string[] }> {
    return this.http.post<{ imported: number; skipped: string[] }>(
      `${API}/admin/content/packs`,
      pack,
    );
  }

  reviewSummary(): Observable<{ saved: number; due: number }> {
    return this.http.get<{ saved: number; due: number }>(`${API}/review/summary`);
  }

  savedWords(filter: { groupId?: string; search?: string } = {}): Observable<SavedWord[]> {
    return this.http.get<SavedWord[]>(`${API}/review/words`, { params: this.params(filter) });
  }

  dueWords(groupId?: string): Observable<SavedWord[]> {
    return this.http.get<SavedWord[]>(`${API}/review/due`, { params: this.params({ groupId }) });
  }

  quiz(groupId?: string, count = 10): Observable<QuizQuestion[]> {
    return this.http.get<QuizQuestion[]>(`${API}/review/quiz`, {
      params: this.params({ groupId, count }),
    });
  }

  saveWord(word: {
    word: string;
    meaning: string;
    ipa?: string;
    example?: string;
    groupIds?: string[];
  }) {
    return this.http.post<SavedWord>(`${API}/review/words`, word);
  }

  setWordGroups(id: string, groupIds: string[]): Observable<SavedWord> {
    return this.http.put<SavedWord>(`${API}/review/words/${id}/groups`, { groupIds });
  }

  groups(): Observable<WordGroupSummary[]> {
    return this.http.get<WordGroupSummary[]>(`${API}/review/groups`);
  }

  createGroup(name: string): Observable<WordGroup> {
    return this.http.post<WordGroup>(`${API}/review/groups`, { name });
  }

  renameGroup(id: string, name: string): Observable<WordGroup> {
    return this.http.patch<WordGroup>(`${API}/review/groups/${id}`, { name });
  }

  deleteGroup(id: string): Observable<void> {
    return this.http.delete<void>(`${API}/review/groups/${id}`);
  }

  gradeWord(id: string, grade: ReviewGrade): Observable<SavedWord> {
    return this.http.post<SavedWord>(`${API}/review/words/${id}/grade`, { grade });
  }

  removeWord(id: string): Observable<void> {
    return this.http.delete<void>(`${API}/review/words/${id}`);
  }

  /** Bỏ các tham số rỗng để không gửi `groupId=undefined` lên máy chủ. */
  private params(values: Record<string, string | number | undefined>): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined && value !== '') {
        params = params.set(key, String(value));
      }
    }
    return params;
  }
}
