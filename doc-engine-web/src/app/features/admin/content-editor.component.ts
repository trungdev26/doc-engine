import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { EnglishApiService } from '../../core/english-api.service';
import { Band } from '../../core/api.models';
import {
  Draft,
  KINDS,
  Kind,
  buildPack,
  emptyDraft,
  emptyLine,
  emptyQuiz,
  emptyRule,
  emptySentence,
  emptyWord,
  slugify,
  validateDraft,
} from './content-draft';

type QuizField = 'practice' | 'questions' | 'review';
type RowField = 'words' | 'sentences' | 'rules' | 'lines';

@Component({
  selector: 'app-content-editor',
  templateUrl: './content-editor.component.html',
  styleUrls: ['./content-editor.component.scss'],
})
export class ContentEditorComponent implements OnInit {
  readonly kinds = KINDS;
  bands: Band[] = [];
  draft: Draft = emptyDraft('vocab');

  writable = true;
  checking = true;
  showErrors = false;
  saving = false;
  message: { type: 'ok' | 'error'; text: string; details?: string[] } | null = null;
  /** Người dùng đã tự sửa mã chưa; chưa sửa thì mã tự theo tên để khỏi phải nghĩ. */
  private lessonIdTouched = false;
  private unitIdTouched = false;

  constructor(private readonly api: EnglishApiService) {}

  ngOnInit(): void {
    this.api.bands().subscribe({ next: bands => (this.bands = bands) });
    this.api.adminStatus().subscribe({
      next: status => {
        this.writable = status.writable;
        this.checking = false;
      },
      error: () => {
        this.checking = false;
        this.message = { type: 'error', text: 'Không kết nối được máy chủ. Bạn thử lại sau nhé.' };
      },
    });
  }

  get errors(): string[] {
    return validateDraft(this.draft);
  }

  get blocked(): boolean {
    return !this.writable;
  }

  readonly blockedReason = 'Máy chủ chưa kết nối cơ sở dữ liệu nên chưa lưu được bài mới.';

  setKind(kind: Kind): void {
    if (kind === this.draft.kind) {
      return;
    }
    // Giữ lại band và unit đang chọn, vì người soạn thường nhập nhiều bài liền nhau trong một unit.
    this.draft = emptyDraft(kind, this.draft);
    this.lessonIdTouched = false;
    this.message = null;
    this.showErrors = false;
  }

  onTitleChange(): void {
    if (!this.lessonIdTouched) {
      this.draft.lessonId = slugify(this.draft.title);
    }
  }

  onUnitTitleChange(): void {
    if (!this.unitIdTouched) {
      this.draft.unitId = slugify(this.draft.unitTitle);
    }
  }

  touchLessonId(): void {
    this.lessonIdTouched = true;
  }

  touchUnitId(): void {
    this.unitIdTouched = true;
  }

  addRow(field: RowField): void {
    const create = {
      words: emptyWord,
      sentences: emptySentence,
      rules: emptyRule,
      lines: emptyLine,
    }[field];
    (this.draft[field] as unknown[]).push(create());
  }

  removeRow(field: RowField, index: number): void {
    const rows = this.draft[field] as unknown[];
    if (rows.length > 1) {
      rows.splice(index, 1);
    }
  }

  addQuiz(field: QuizField): void {
    this.draft[field].push(emptyQuiz());
  }

  removeQuiz(field: QuizField, index: number): void {
    if (this.draft[field].length > 1) {
      this.draft[field].splice(index, 1);
    }
  }

  addOption(field: QuizField, quizIndex: number): void {
    const quiz = this.draft[field][quizIndex];
    if (quiz.options.length < 6) {
      quiz.options.push('');
    }
  }

  removeOption(field: QuizField, quizIndex: number, optionIndex: number): void {
    const quiz = this.draft[field][quizIndex];
    if (quiz.options.length <= 2) {
      return;
    }
    quiz.options.splice(optionIndex, 1);
    // Xoá lựa chọn nằm trước hoặc chính là đáp án đúng thì dời lại cho khỏi trỏ sai.
    if (optionIndex < quiz.answer || quiz.answer >= quiz.options.length) {
      quiz.answer = Math.max(0, quiz.answer - 1);
    }
  }

  trackByIndex(index: number): number {
    return index;
  }

  submit(): void {
    this.showErrors = true;
    this.message = null;
    if (this.errors.length) {
      this.message = { type: 'error', text: 'Còn thông tin chưa hợp lệ, xem danh sách bên dưới.' };
      return;
    }
    this.saving = true;
    this.api.importPack(buildPack(this.draft)).subscribe({
      next: result => {
        this.saving = false;
        this.message = {
          type: 'ok',
          text: `Đã lưu bài "${this.draft.title.trim()}".`,
          details: result.skipped,
        };
        this.nextLesson();
      },
      error: (error: HttpErrorResponse) => {
        this.saving = false;
        this.message = { type: 'error', text: this.describe(error) };
      },
    });
  }

  /** Sau khi lưu xong, mở form trống nhưng giữ band và unit để nhập tiếp bài kế. */
  private nextLesson(): void {
    this.draft = emptyDraft(this.draft.kind, this.draft);
    this.lessonIdTouched = false;
    this.showErrors = false;
  }

  private describe(error: HttpErrorResponse): string {
    switch (error.status) {
      case 0:
        return 'Không kết nối được máy chủ. Bạn thử lại sau nhé.';
      case 401:
        return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.';
      case 403:
        return 'Tài khoản của bạn không có quyền soạn bài.';
      case 503:
        return 'Máy chủ chưa kết nối cơ sở dữ liệu nên chưa lưu được bài mới.';
      case 400:
        return `Máy chủ từ chối nội dung: ${error.error?.message ?? 'dữ liệu không hợp lệ'}`;
      default:
        return 'Có lỗi xảy ra khi lưu. Bạn thử lại sau nhé.';
    }
  }
}
