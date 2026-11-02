import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SpeakingLesson, SpeakingTurn, SpeakingVocab } from '../../core/api.models';
import { AuthService } from '../../core/auth.service';
import { EnglishApiService } from '../../core/english-api.service';
import { Recorder } from '../../core/recorder';
import { DictationResult, checkDictation } from './dictation';

type Step = 'context' | 'shadowing' | 'roleplay' | 'dictation' | 'vocab';

const STEPS: { id: Step; label: string }[] = [
  { id: 'context', label: 'Bối cảnh' },
  { id: 'shadowing', label: 'Shadowing' },
  { id: 'roleplay', label: 'Role-play' },
  { id: 'dictation', label: 'Dictation' },
  { id: 'vocab', label: 'Từ vựng' },
];

@Component({
  selector: 'app-dialogue-lesson',
  templateUrl: './dialogue-lesson.component.html',
  styleUrls: ['./dialogue-lesson.component.scss'],
})
export class DialogueLessonComponent implements OnInit, OnDestroy {
  readonly steps = STEPS;
  lesson: SpeakingLesson | null = null;
  loading = true;
  failed = false;

  step: Step = 'context';
  roleId = '';
  showTranslation = new Set<number>();
  rate = 1;

  // Shadowing và Role-play đi từng lượt
  turnIndex = 0;
  /** Sự kiện dừng ghi âm chạy ngoài Angular nên phải chạy lại phát hiện thay đổi để màn hình cập nhật. */
  readonly recorder = new Recorder(() => this.zone.run(() => this.cdr.detectChanges()));
  recordedTurns = new Set<number>();

  // Dictation
  dictationIndex = 0;
  dictationInput = '';
  dictationResult: DictationResult | null = null;
  dictationScores: number[] = [];

  // Từ vựng
  vocabView: 'list' | 'cards' = 'list';
  known = new Set<string>();
  expanded = new Set<string>();
  cardIndex = 0;
  cardFlipped = false;
  saved = new Set<string>();
  saveError = '';

  finished = false;
  saveFailed = false;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly api: EnglishApiService,
    readonly auth: AuthService,
    private readonly zone: NgZone,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.api.lesson<SpeakingLesson>(id).subscribe({
      next: lesson => {
        this.lesson = lesson;
        this.roleId = lesson.roles?.[0]?.id ?? '';
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.failed = true;
      },
    });
  }

  ngOnDestroy(): void {
    this.recorder.dispose();
    window.speechSynthesis?.cancel();
  }

  get turns(): SpeakingTurn[] {
    return this.lesson?.turns ?? [];
  }

  get vocab(): SpeakingVocab[] {
    return this.lesson?.vocab ?? [];
  }

  get myRole() {
    return this.lesson?.roles?.find(role => role.id === this.roleId);
  }

  roleName(id: string): string {
    return this.lesson?.roles?.find(role => role.id === id)?.name ?? id;
  }

  /** Lượt này do người học nói (vai đã chọn) hay do máy đọc thay vai còn lại. */
  isMine(turn: SpeakingTurn): boolean {
    return turn.role === this.roleId;
  }

  get stepNumber(): number {
    return STEPS.findIndex(item => item.id === this.step) + 1;
  }

  go(step: Step): void {
    this.step = step;
    this.turnIndex = 0;
    this.recorder.discard();
    this.dictationResult = null;
    this.dictationInput = '';
    window.speechSynthesis?.cancel();
  }

  chooseRole(id: string): void {
    this.roleId = id;
  }

  toggleTranslation(index: number): void {
    this.showTranslation.has(index)
      ? this.showTranslation.delete(index)
      : this.showTranslation.add(index);
  }

  speak(text: string): void {
    if (!('speechSynthesis' in window)) {
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = this.rate;
    window.speechSynthesis.speak(utterance);
  }

  toggleRate(): void {
    this.rate = this.rate === 1 ? 0.7 : 1;
  }

  // ---- Shadowing / Role-play ----

  get turn(): SpeakingTurn | undefined {
    return this.turns[this.turnIndex];
  }

  /** Ở Role-play, lượt của vai kia được máy đọc cho bạn nghe; lượt của bạn thì bạn ghi âm. */
  get needsRecording(): boolean {
    const turn = this.turn;
    return !!turn && (this.step === 'shadowing' || this.isMine(turn));
  }

  nextTurn(): void {
    this.recorder.discard();
    if (this.turnIndex < this.turns.length - 1) {
      this.turnIndex += 1;
      // Role-play: tự đọc lượt của vai kia để người học đáp lại.
      const turn = this.turns[this.turnIndex];
      if (this.step === 'roleplay' && !this.isMine(turn)) {
        this.speak(turn.text);
      }
    } else {
      this.go(this.step === 'shadowing' ? 'roleplay' : 'dictation');
    }
  }

  async toggleRecord(): Promise<void> {
    if (this.recorder.state === 'recording') {
      this.recorder.stop();
      this.recordedTurns.add(this.turnIndex);
    } else {
      await this.recorder.start();
    }
  }

  // ---- Dictation ----

  get dictationTurn(): SpeakingTurn | undefined {
    return this.turns[this.dictationIndex];
  }

  checkDictation(): void {
    const turn = this.dictationTurn;
    if (!turn || this.dictationResult) {
      return;
    }
    const result = checkDictation(turn.text, this.dictationInput);
    this.dictationResult = result;
    this.dictationScores[this.dictationIndex] = result.total
      ? Math.round((result.correctCount / result.total) * 100)
      : 0;
  }

  nextDictation(): void {
    if (this.dictationIndex < this.turns.length - 1) {
      this.dictationIndex += 1;
      this.dictationInput = '';
      this.dictationResult = null;
    } else {
      this.go('vocab');
    }
  }

  // ---- Từ vựng ----

  toggleKnown(word: string): void {
    this.known.has(word) ? this.known.delete(word) : this.known.add(word);
  }

  toggleExpanded(word: string): void {
    this.expanded.has(word) ? this.expanded.delete(word) : this.expanded.add(word);
  }

  get card(): SpeakingVocab | undefined {
    return this.vocab[this.cardIndex];
  }

  nextCard(): void {
    this.cardFlipped = false;
    this.cardIndex = (this.cardIndex + 1) % Math.max(1, this.vocab.length);
  }

  /** Lưu từ vào thư viện ôn tập. Cần đăng nhập vì từ đã lưu là dữ liệu cá nhân. */
  saveWord(item: SpeakingVocab): void {
    if (!this.auth.user()) {
      this.loginToSave();
      return;
    }
    this.saveError = '';
    this.api.saveWord({ word: item.word, meaning: item.meaning, example: item.example }).subscribe({
      next: () => this.saved.add(item.word),
      error: () => (this.saveError = 'Chưa lưu được từ này. Bạn thử lại nhé.'),
    });
  }

  loginToSave(): void {
    void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
  }

  // ---- Hoàn thành ----

  get score(): number {
    const dictation = this.dictationScores.length
      ? this.dictationScores.reduce((sum, value) => sum + value, 0) / this.turns.length
      : 0;
    const speaking = this.turns.length ? (this.recordedTurns.size / this.mine) * 100 : 0;
    return Math.round(Math.min(100, (dictation + Math.min(100, speaking)) / 2));
  }

  private get mine(): number {
    return Math.max(1, this.turns.filter(turn => this.isMine(turn)).length);
  }

  finish(): void {
    if (!this.lesson) {
      return;
    }
    this.finished = true;
    if (!this.auth.user()) {
      return;
    }
    this.api
      .complete(this.lesson.id, this.score)
      .subscribe({ error: () => (this.saveFailed = true) });
  }
}
