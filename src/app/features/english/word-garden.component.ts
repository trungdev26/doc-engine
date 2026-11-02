import { Component, OnInit } from '@angular/core';
import { SavedWord } from '../../core/api.models';
import { EnglishApiService } from '../../core/english-api.service';

interface Stage {
  emoji: string;
  label: string;
}

/** Giai đoạn của cây theo hộp ôn tập: ôn đúng hạn nhiều lần thì cây lớn dần. */
const STAGES: Stage[] = [
  { emoji: '🌰', label: 'Hạt giống' },
  { emoji: '🌱', label: 'Mầm non' },
  { emoji: '🌿', label: 'Cây con' },
  { emoji: '🪴', label: 'Cây lớn' },
  { emoji: '🌳', label: 'Cây rậm lá' },
  { emoji: '🌸', label: 'Đơm hoa' },
];

@Component({
  selector: 'app-word-garden',
  templateUrl: './word-garden.component.html',
  styleUrls: ['./word-garden.component.scss'],
})
export class WordGardenComponent implements OnInit {
  words: SavedWord[] = [];
  loading = true;
  failed = false;

  constructor(private readonly api: EnglishApiService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.failed = false;
    this.api.savedWords().subscribe({
      next: words => {
        this.words = [...words].sort((a, b) => b.box - a.box);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.failed = true;
      },
    });
  }

  stage(word: SavedWord): Stage {
    return STAGES[Math.min(word.box, STAGES.length - 1)];
  }

  isThirsty(word: SavedWord): boolean {
    return new Date(word.dueAt) <= new Date();
  }

  get thirstyCount(): number {
    return this.words.filter(word => this.isThirsty(word)).length;
  }

  get bloomCount(): number {
    return this.words.filter(word => word.box >= STAGES.length - 1).length;
  }
}
