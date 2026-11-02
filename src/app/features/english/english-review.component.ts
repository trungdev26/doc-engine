import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { QuizQuestion, ReviewGrade, SavedWord, WordGroupSummary } from '../../core/api.models';
import { EnglishApiService } from '../../core/english-api.service';

type Tab = 'review' | 'library';
type Mode = 'flashcard' | 'quiz';
type Phase = 'setup' | 'running' | 'done';

interface FlashStats {
  again: number;
  good: number;
  easy: number;
}

@Component({
  selector: 'app-english-review',
  templateUrl: './english-review.component.html',
  styleUrls: ['./english-review.component.scss'],
})
export class EnglishReviewComponent implements OnInit {
  tab: Tab = 'review';
  loading = true;
  error = '';

  groups: WordGroupSummary[] = [];
  words: SavedWord[] = [];
  summary = { saved: 0, due: 0 };

  /** Nhóm đang chọn để ôn hoặc lọc; rỗng nghĩa là tất cả từ. */
  groupId = '';
  search = '';

  // Quản lý nhóm
  newGroupName = '';
  editingGroupId: string | null = null;
  editingName = '';
  groupMessage = '';

  // Gán nhóm cho từ
  assigningWordId: string | null = null;

  // Phiên ôn
  mode: Mode = 'flashcard';
  phase: Phase = 'setup';
  reviewAll = false;
  queue: SavedWord[] = [];
  revealed = false;
  stats: FlashStats = { again: 0, good: 0, easy: 0 };
  total = 0;

  quiz: QuizQuestion[] = [];
  quizIndex = 0;
  picked: number | null = null;
  quizCorrect = 0;
  busy = false;

  constructor(private readonly api: EnglishApiService) {}

  ngOnInit(): void {
    this.refresh();
  }

  get current(): SavedWord | undefined {
    return this.queue[0];
  }

  get question(): QuizQuestion | undefined {
    return this.quiz[this.quizIndex];
  }

  get selectedGroup(): WordGroupSummary | undefined {
    return this.groups.find(group => group.id === this.groupId);
  }

  /** Số từ có thể ôn trong phạm vi đang chọn, tuỳ chế độ. */
  get available(): number {
    const group = this.selectedGroup;
    if (this.mode === 'quiz' || this.reviewAll) {
      return group ? group.count : this.summary.saved;
    }
    return group ? group.due : this.summary.due;
  }

  get canStart(): boolean {
    return this.mode === 'quiz' ? this.available >= 2 : this.available >= 1;
  }

  get startHint(): string {
    if (this.canStart) {
      return '';
    }
    if (this.mode === 'quiz') {
      return 'Cần ít nhất 2 từ để làm trắc nghiệm.';
    }
    return this.summary.saved
      ? 'Không còn từ nào đến hạn ôn. Bạn có thể chọn "Ôn cả những từ chưa đến hạn".'
      : 'Bạn chưa lưu từ nào. Hãy lưu từ khi học từ vựng.';
  }

  get percent(): number {
    return this.total ? Math.round(((this.total - this.queue.length) / this.total) * 100) : 0;
  }

  setTab(tab: Tab): void {
    this.tab = tab;
    this.error = '';
    if (tab === 'library') {
      this.loadWords();
    }
  }

  selectGroup(id: string): void {
    this.groupId = id;
    if (this.tab === 'library') {
      this.loadWords();
    }
  }

  refresh(): void {
    this.loading = true;
    this.error = '';
    this.api.reviewSummary().subscribe({
      next: summary => (this.summary = summary),
      error: error => this.fail(error),
    });
    this.api.groups().subscribe({
      next: groups => {
        this.groups = groups;
        // Nhóm đang chọn có thể vừa bị xoá ở nơi khác.
        if (this.groupId && !groups.some(group => group.id === this.groupId)) {
          this.groupId = '';
        }
        this.loading = false;
        this.loadWords();
      },
      error: error => this.fail(error),
    });
  }

  loadWords(): void {
    this.api
      .savedWords({ groupId: this.groupId || undefined, search: this.search.trim() })
      .subscribe({
        next: words => (this.words = words),
        error: error => this.fail(error),
      });
  }

  // ---- Phiên ôn ----

  start(): void {
    if (!this.canStart || this.busy) {
      return;
    }
    this.busy = true;
    this.error = '';
    const group = this.groupId || undefined;

    if (this.mode === 'quiz') {
      this.api.quiz(group, 10).subscribe({
        next: quiz => {
          this.busy = false;
          this.quiz = quiz;
          this.total = quiz.length;
          this.quizIndex = 0;
          this.picked = null;
          this.quizCorrect = 0;
          this.phase = quiz.length ? 'running' : 'done';
        },
        error: error => this.fail(error),
      });
      return;
    }

    const source = this.reviewAll
      ? this.api.savedWords({ groupId: group })
      : this.api.dueWords(group);
    source.subscribe({
      next: words => {
        this.busy = false;
        this.queue = words;
        this.total = words.length;
        this.revealed = false;
        this.stats = { again: 0, good: 0, easy: 0 };
        this.phase = words.length ? 'running' : 'done';
      },
      error: error => this.fail(error),
    });
  }

  reveal(): void {
    this.revealed = true;
  }

  grade(grade: ReviewGrade): void {
    const word = this.current;
    if (!word || this.busy) {
      return;
    }
    this.busy = true;
    this.api.gradeWord(word.id, grade).subscribe({
      next: () => {
        this.busy = false;
        this.stats[grade] += 1;
        this.queue = this.queue.slice(1);
        // "Quên" đưa từ về cuối hàng đợi để gặp lại ngay trong buổi này.
        if (grade === 'again') {
          this.queue.push(word);
        }
        this.revealed = false;
        if (!this.queue.length) {
          this.finish();
        }
      },
      error: error => this.fail(error),
    });
  }

  pickAnswer(index: number): void {
    if (this.picked !== null || !this.question) {
      return;
    }
    this.picked = index;
    const correct = index === this.question.answer;
    if (correct) {
      this.quizCorrect += 1;
    }
    // Trắc nghiệm cũng cập nhật lịch ôn: trả lời đúng là "nhớ", sai là "quên".
    this.api.gradeWord(this.question.wordId, correct ? 'good' : 'again').subscribe({
      error: error => this.fail(error),
    });
  }

  nextQuestion(): void {
    if (this.quizIndex < this.quiz.length - 1) {
      this.quizIndex += 1;
      this.picked = null;
    } else {
      this.finish();
    }
  }

  optionClass(index: number): string {
    if (this.picked === null || !this.question) {
      return '';
    }
    if (index === this.question.answer) {
      return 'is-correct';
    }
    return index === this.picked ? 'is-wrong' : '';
  }

  quit(): void {
    this.finish();
  }

  backToSetup(): void {
    this.phase = 'setup';
    this.refresh();
  }

  private finish(): void {
    this.phase = 'done';
    this.refresh();
  }

  // ---- Nhóm từ ----

  createGroup(): void {
    const name = this.newGroupName.trim();
    if (!name) {
      return;
    }
    this.groupMessage = '';
    this.api.createGroup(name).subscribe({
      next: () => {
        this.newGroupName = '';
        this.refresh();
      },
      error: (error: HttpErrorResponse) => (this.groupMessage = this.message(error)),
    });
  }

  startRename(group: WordGroupSummary): void {
    this.editingGroupId = group.id;
    this.editingName = group.name;
    this.groupMessage = '';
  }

  saveRename(): void {
    const id = this.editingGroupId;
    const name = this.editingName.trim();
    if (!id || !name) {
      return;
    }
    this.api.renameGroup(id, name).subscribe({
      next: () => {
        this.editingGroupId = null;
        this.refresh();
      },
      error: (error: HttpErrorResponse) => (this.groupMessage = this.message(error)),
    });
  }

  cancelRename(): void {
    this.editingGroupId = null;
  }

  deleteGroup(group: WordGroupSummary): void {
    if (!confirm(`Xoá nhóm "${group.name}"? Các từ trong nhóm vẫn được giữ lại.`)) {
      return;
    }
    this.api.deleteGroup(group.id).subscribe({
      next: () => {
        if (this.groupId === group.id) {
          this.groupId = '';
        }
        // Cập nhật màn hình ngay từ dữ liệu đang có rồi mới đồng bộ lại, đỡ phải chờ ba lượt gọi mạng.
        this.groups = this.groups.filter(item => item.id !== group.id);
        for (const word of this.words) {
          word.groupIds = word.groupIds.filter(id => id !== group.id);
        }
        this.refresh();
      },
      error: (error: HttpErrorResponse) => (this.groupMessage = this.message(error)),
    });
  }

  // ---- Thư viện từ ----

  toggleAssign(word: SavedWord): void {
    this.assigningWordId = this.assigningWordId === word.id ? null : word.id;
  }

  inGroup(word: SavedWord, groupId: string): boolean {
    return word.groupIds.includes(groupId);
  }

  toggleWordGroup(word: SavedWord, groupId: string): void {
    const groupIds = this.inGroup(word, groupId)
      ? word.groupIds.filter(id => id !== groupId)
      : [...word.groupIds, groupId];
    this.api.setWordGroups(word.id, groupIds).subscribe({
      next: updated => {
        word.groupIds = updated.groupIds;
        this.refreshGroupsOnly();
      },
      error: error => this.fail(error),
    });
  }

  removeWord(word: SavedWord): void {
    if (!confirm(`Xoá từ "${word.word}" khỏi thư viện?`)) {
      return;
    }
    this.api.removeWord(word.id).subscribe({
      next: () => {
        this.words = this.words.filter(item => item.id !== word.id);
        this.refresh();
      },
      error: error => this.fail(error),
    });
  }

  groupName(id: string): string {
    return this.groups.find(group => group.id === id)?.name ?? '';
  }

  isDue(word: SavedWord): boolean {
    return new Date(word.dueAt) <= new Date();
  }

  stageLabel(word: SavedWord): string {
    return ['Mới', 'Đang học', 'Đang học', 'Quen dần', 'Nhớ lâu', 'Thuộc'][Math.min(word.box, 5)];
  }

  private refreshGroupsOnly(): void {
    this.api.groups().subscribe({ next: groups => (this.groups = groups) });
    this.api.reviewSummary().subscribe({ next: summary => (this.summary = summary) });
  }

  private fail(error: HttpErrorResponse): void {
    this.loading = false;
    this.busy = false;
    this.error = this.message(error);
  }

  private message(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'Không kết nối được máy chủ. Bạn thử lại sau nhé.';
    }
    if (error.status === 400 && typeof error.error?.message === 'string') {
      return error.error.message;
    }
    return 'Có lỗi xảy ra. Bạn thử lại sau nhé.';
  }
}
