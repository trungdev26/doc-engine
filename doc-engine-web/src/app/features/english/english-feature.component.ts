import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ENGLISH_FEATURES, EnglishFeature } from './english-features';

@Component({
  selector: 'app-english-feature',
  template: `
    <section class="english-feature" *ngIf="feature as f">
      <span class="english-feature__badge">Sắp ra mắt</span>
      <h1>{{ f.label }}</h1>
      <p class="english-feature__summary">{{ f.summary }}</p>

      <h2>Sẽ có trong phần này</h2>
      <ul class="english-feature__list">
        <li *ngFor="let item of f.upcoming">{{ item }}</li>
      </ul>

      <nav class="english-feature__others" aria-label="Tính năng tiếng Anh khác">
        <a
          *ngFor="let other of otherFeatures"
          [routerLink]="['/english', other.slug]"
          class="english-feature__chip"
        >
          {{ other.label }}
        </a>
      </nav>
    </section>
  `,
  styles: [
    `
      .english-feature {
        max-width: 720px;
      }
      .english-feature__badge {
        display: inline-block;
        padding: 3px 10px;
        color: var(--app-accent-strong);
        font-size: 12px;
        font-weight: 700;
        background: var(--app-accent-soft);
        border-radius: 999px;
      }
      h1 {
        margin: 14px 0 8px;
        color: var(--app-text-strong);
        font-size: 2em;
        letter-spacing: -0.025em;
      }
      h2 {
        margin: 32px 0 10px;
        color: var(--app-text-strong);
        font-size: 1.1em;
      }
      .english-feature__summary {
        margin: 0;
        color: var(--app-text-muted);
        font-size: 15px;
        line-height: 1.7;
      }
      .english-feature__list {
        margin: 0;
        padding-left: 20px;
        color: var(--app-text);
        line-height: 1.9;
      }
      .english-feature__others {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 36px;
      }
      .english-feature__chip {
        padding: 6px 14px;
        color: var(--app-text);
        font-size: 13px;
        text-decoration: none;
        background: var(--app-chip);
        border-radius: 999px;
        transition: background-color 0.16s ease;
      }
      .english-feature__chip:hover {
        background: var(--app-chip-hover);
      }
    `,
  ],
})
export class EnglishFeatureComponent {
  readonly feature: EnglishFeature | undefined;
  readonly otherFeatures: EnglishFeature[];

  constructor(route: ActivatedRoute) {
    const slug = route.snapshot.data['slug'] as string;
    this.feature = ENGLISH_FEATURES.find(item => item.slug === slug);
    this.otherFeatures = ENGLISH_FEATURES.filter(item => item.slug !== slug);
  }
}
