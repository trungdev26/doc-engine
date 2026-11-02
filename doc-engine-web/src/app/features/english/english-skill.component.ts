import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';
import { Band, Roadmap, Skill } from '../../core/api.models';
import { AuthService } from '../../core/auth.service';
import { EnglishApiService } from '../../core/english-api.service';
import { ENGLISH_FEATURES, EnglishFeature } from './english-features';

@Component({
  selector: 'app-english-skill',
  templateUrl: './english-skill.component.html',
  styleUrls: ['./english-skill.component.scss'],
})
export class EnglishSkillComponent implements OnInit {
  readonly feature: EnglishFeature;
  readonly skill: Skill;

  bands: Band[] = [];
  selectedBand = '3.0';
  roadmap: Roadmap | null = null;
  loading = true;
  failed = false;

  constructor(
    route: ActivatedRoute,
    private readonly api: EnglishApiService,
    private readonly auth: AuthService,
  ) {
    const slug = route.snapshot.data['slug'] as string;
    this.feature = ENGLISH_FEATURES.find(item => item.slug === slug)!;
    this.skill = this.feature.skill!;
  }

  ngOnInit(): void {
    this.auth.restore().subscribe(() => {
      // Khách chưa có hồ sơ nên bắt đầu ở Band 3.0 và chọn band nào cũng không được lưu lại.
      if (!this.auth.user()) {
        this.load();
        return;
      }
      // Máy chủ tự dùng band trong hồ sơ khi không gửi band, nên không phải chờ hồ sơ rồi mới hỏi lộ trình.
      this.load(true);
    });
  }

  get nextLesson() {
    return this.roadmap?.units
      .flatMap(unit => unit.lessons)
      .find(lesson => lesson.available && !lesson.completed);
  }

  get percent(): number {
    const roadmap = this.roadmap;
    return roadmap?.totalCount
      ? Math.round((roadmap.completedCount / roadmap.totalCount) * 100)
      : 0;
  }

  lessonLink(id: string): string[] {
    const base =
      { speaking: 'speaking-lesson', video: 'video-lesson' }[this.skill as string] ?? 'lesson';
    return [`/english/${base}`, id];
  }

  selectBand(id: string): void {
    if (id === this.selectedBand) {
      return;
    }
    this.selectedBand = id;
    // Lưu lựa chọn để lần sau mở lại đúng band; lỗi lưu không chặn việc xem lộ trình.
    if (this.auth.user()) {
      this.api.setBand(id).subscribe({ error: () => undefined });
    }
    this.load();
  }

  retry(): void {
    this.failed = false;
    this.ngOnInit();
  }

  private load(useProfileBand = false): void {
    this.loading = true;
    forkJoin({
      bands: this.api.bands(),
      roadmap: this.api.roadmap(this.skill, useProfileBand ? undefined : this.selectedBand),
    }).subscribe({
      next: ({ bands, roadmap }) => {
        this.bands = bands;
        this.roadmap = roadmap;
        this.selectedBand = roadmap.band;
        this.loading = false;
      },
      error: () => this.fail(),
    });
  }

  private fail(): void {
    this.loading = false;
    this.failed = true;
  }
}
