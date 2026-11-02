import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SpeakingLesson } from '../../core/api.models';
import { EnglishApiService } from '../../core/english-api.service';

/**
 * Chọn giao diện luyện nói theo dạng bài: bài có `turns` (hội thoại nhiều vai) dùng giao diện hội thoại,
 * bài chỉ có `sentences` dùng giao diện luyện từng câu.
 */
@Component({
  selector: 'app-speaking-router',
  template: `
    <app-dialogue-lesson *ngIf="kind === 'dialogue'"></app-dialogue-lesson>
    <app-speaking-lesson *ngIf="kind === 'sentences'"></app-speaking-lesson>
    <div class="state" *ngIf="kind === 'loading'">Đang tải bài học...</div>
    <div class="state" *ngIf="kind === 'error'">
      <strong>Không tải được bài học.</strong>
      <a routerLink="/english/speaking">Quay lại</a>
    </div>
  `,
  styles: [
    `
      .state {
        display: grid;
        gap: 6px;
        max-width: 760px;
        margin: 0 auto;
        padding: 18px;
        color: var(--app-text-muted);
        background: var(--app-surface-2);
        border: 1px solid var(--app-border);
        border-radius: 16px;
      }
    `,
  ],
})
export class SpeakingRouterComponent implements OnInit {
  kind: 'loading' | 'dialogue' | 'sentences' | 'error' = 'loading';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly api: EnglishApiService,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.api.lesson<SpeakingLesson>(id).subscribe({
      next: lesson => (this.kind = lesson.turns?.length ? 'dialogue' : 'sentences'),
      error: () => (this.kind = 'error'),
    });
  }
}
