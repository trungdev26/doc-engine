import { Component, OnInit } from '@angular/core';
import { VideoCard } from '../../core/api.models';
import { EnglishApiService } from '../../core/english-api.service';
import { formatDuration, youtubeThumbnail } from './video-player';

interface Row {
  topic: string;
  cards: VideoCard[];
}

@Component({
  selector: 'app-video-library',
  templateUrl: './video-library.component.html',
  styleUrls: ['./video-library.component.scss'],
})
export class VideoLibraryComponent implements OnInit {
  cards: VideoCard[] = [];
  loading = true;
  failed = false;

  /** Chủ đề đang lọc; rỗng là tất cả. */
  topic = '';
  /** Trình độ đang lọc; rỗng là tất cả. */
  level = '';
  search = '';

  constructor(private readonly api: EnglishApiService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.failed = false;
    this.api.videos().subscribe({
      next: cards => {
        this.cards = cards;
        this.refresh();
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.failed = true;
      },
    });
  }

  /**
   * Các giá trị dưới đây được tính một lần mỗi khi dữ liệu hoặc bộ lọc đổi, không phải mỗi lần Angular
   * kiểm tra. Nếu để là getter thì mỗi lần kiểm tra lại tạo ra mảng mới, `*ngFor` tưởng dữ liệu đổi
   * và dựng lại toàn bộ thẻ (kể cả ảnh), làm trang bị kẹt trong vòng lặp vẽ.
   */
  topics: string[] = [];
  levels: string[] = [];
  rows: Row[] = [];

  setTopic(value: string): void {
    this.topic = value;
    this.refresh();
  }

  setLevel(value: string): void {
    this.level = value;
    this.refresh();
  }

  onSearch(value: string): void {
    this.search = value;
    this.refresh();
  }

  private refresh(): void {
    // Chủ đề theo thứ tự xuất hiện; "Khác" luôn đứng cuối.
    const found = [...new Set(this.cards.map(card => card.topic))];
    this.topics = [
      ...found.filter(name => name !== 'Khác'),
      ...found.filter(name => name === 'Khác'),
    ];
    this.levels = [...new Set(this.cards.map(card => card.level).filter(Boolean))].sort();

    const query = this.search.trim().toLowerCase();
    const visible = this.cards.filter(
      card =>
        (!this.topic || card.topic === this.topic) &&
        (!this.level || card.level === this.level) &&
        (!query || `${card.title} ${card.channel ?? ''}`.toLowerCase().includes(query)),
    );
    this.rows = this.topics
      .map(topic => ({ topic, cards: visible.filter(card => card.topic === topic) }))
      .filter(row => row.cards.length);
  }

  thumbnail(card: VideoCard): string | null {
    if (card.thumbnail) {
      return card.thumbnail;
    }
    return card.source.type === 'youtube' ? youtubeThumbnail(card.source.id) : null;
  }

  duration(card: VideoCard): string {
    return card.durationSeconds ? formatDuration(card.durationSeconds) : '';
  }

  trackById(_index: number, card: VideoCard): string {
    return card.id;
  }
}
