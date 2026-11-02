import { Injectable, signal } from '@angular/core';
import { STORAGE_KEYS } from './local-storage';

export type LearningTrack = 'dev' | 'english';

export interface LearningProfile {
  track: LearningTrack;
  nativeLang: 'vi';
  targetLang: 'en';
  onboardedAt: string;
}

/**
 * Nơi lưu profile. Hiện tại là localStorage; khi có BE chỉ cần viết implementation
 * gọi API và đổi `useClass` trong AppModule, không phải sửa nơi dùng.
 */
export abstract class LearningProfileStore {
  abstract load(): LearningProfile | null;
  abstract save(profile: LearningProfile): void;
}

@Injectable()
export class LocalStorageLearningProfileStore extends LearningProfileStore {
  load(): LearningProfile | null {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEYS.profile) ?? 'null');
      return value && (value.track === 'dev' || value.track === 'english')
        ? {
            track: value.track,
            nativeLang: 'vi',
            targetLang: 'en',
            onboardedAt: String(value.onboardedAt ?? ''),
          }
        : null;
    } catch {
      return null;
    }
  }

  save(profile: LearningProfile): void {
    localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));
  }
}

@Injectable({ providedIn: 'root' })
export class LearningProfileService {
  private readonly state = signal<LearningProfile | null>(null);

  readonly profile = this.state.asReadonly();

  constructor(private readonly store: LearningProfileStore) {
    this.state.set(store.load());
  }

  get track(): LearningTrack {
    return this.state()?.track ?? 'dev';
  }

  get isOnboarded(): boolean {
    return this.state() !== null;
  }

  chooseTrack(track: LearningTrack): void {
    const profile: LearningProfile = {
      track,
      nativeLang: 'vi',
      targetLang: 'en',
      onboardedAt: this.state()?.onboardedAt || new Date().toISOString(),
    };
    this.store.save(profile);
    this.state.set(profile);
  }
}
