import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SpeakingLesson } from '../../core/api.models';
import { AuthService } from '../../core/auth.service';
import { EnglishApiService } from '../../core/english-api.service';
import { Recorder } from '../../core/recorder';

@Component({
  selector: 'app-speaking-lesson',
  templateUrl: './speaking-lesson.component.html',
  styleUrls: ['./speaking-lesson.component.scss'],
})
export class SpeakingLessonComponent implements OnInit, OnDestroy {
  lesson: SpeakingLesson | null = null;
  loading = true;
  failed = false;
  finished = false;
  saveFailed = false;

  index = 0;
  rate = 1;
  readonly recorder = new Recorder(() => {
    this.zone.run(() => {
      if (this.recorder.state === 'recorded') {
        this.practiced.add(this.index);
      }
      this.cdr.detectChanges();
    });
  });
  practiced = new Set<number>();

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

  get sentence() {
    return this.lesson?.sentences[this.index];
  }

  get isLast(): boolean {
    return !!this.lesson && this.index === this.lesson.sentences.length - 1;
  }

  get percent(): number {
    return this.lesson ? Math.round((this.practiced.size / this.lesson.sentences.length) * 100) : 0;
  }

  listen(): void {
    const text = this.sentence?.text;
    if (!text || !('speechSynthesis' in window)) {
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

  toggleRecord(): void {
    this.recorder.state === 'recording' ? this.recorder.stop() : void this.recorder.start();
  }

  next(): void {
    if (this.isLast) {
      this.finish();
      return;
    }
    this.index += 1;
    this.resetForSentence();
  }

  previous(): void {
    if (this.index > 0) {
      this.index -= 1;
      this.resetForSentence();
    }
  }

  private resetForSentence(): void {
    this.recorder.discard();
  }

  loginToSave(): void {
    void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
  }

  private finish(): void {
    if (!this.lesson) {
      return;
    }
    if (!this.auth.user()) {
      this.finished = true;
      return;
    }
    this.api.complete(this.lesson.id, this.percent).subscribe({
      next: () => (this.finished = true),
      error: () => {
        this.finished = true;
        this.saveFailed = true;
      },
    });
  }
}
