import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Lesson, Quiz, VocabWord } from '../../core/api.models';
import { AuthService } from '../../core/auth.service';
import { EnglishApiService } from '../../core/english-api.service';
import { DictationResult, checkDictation } from './dictation';

type StepType = 'cards' | 'rules' | 'text' | 'dialogue' | 'quiz' | 'dictation';

interface Step {
  label: string;
  type: StepType;
  quiz?: Quiz[];
}

interface QuizState {
  picked: (number | null)[];
  checked: boolean;
}

@Component({
  selector: 'app-lesson-player',
  templateUrl: './lesson-player.component.html',
  styleUrls: ['./lesson-player.component.scss'],
})
export class LessonPlayerComponent implements OnInit, OnDestroy {
  lesson: Lesson | null = null;
  steps: Step[] = [];
  stepIndex = 0;
  loading = true;
  failed = false;
  finished = false;
  saving = false;
  saveFailed = false;

  cardIndex = 0;
  showTranslation = true;
  savedWords = new Set<string>();
  private quizStates = new Map<number, QuizState>();

  dictationIndex = 0;
  dictationInput = '';
  dictationResult: DictationResult | null = null;
  dictationScores: number[] = [];

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly api: EnglishApiService,
    readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.api.lesson(id).subscribe({
      next: lesson => {
        this.lesson = lesson;
        this.steps = this.buildSteps(lesson);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.failed = true;
      },
    });
  }

  ngOnDestroy(): void {
    this.stopSpeaking();
  }

  get step(): Step {
    return this.steps[this.stepIndex];
  }

  get words(): VocabWord[] {
    return this.lesson?.kind === 'vocab' ? this.lesson.words : [];
  }

  get currentWord(): VocabWord | undefined {
    return this.words[this.cardIndex];
  }

  get isLastStep(): boolean {
    return this.stepIndex === this.steps.length - 1;
  }

  get backLink(): string {
    const skill = {
      vocab: 'words',
      grammar: 'grammar',
      reading: 'reading',
      listening: 'listening',
      speaking: 'speaking',
    };
    return `/english/${this.lesson ? skill[this.lesson.kind] : ''}`;
  }

  get score(): number {
    let correct = 0;
    let total = 0;
    this.steps.forEach((step, index) => {
      const state = this.quizStates.get(index);
      for (const [i, quiz] of (step.quiz ?? []).entries()) {
        total += 1;
        if (state?.picked[i] === quiz.answer) {
          correct += 1;
        }
      }
    });
    const quizScore = total ? (correct / total) * 100 : 100;
    if (this.dictationScores.length) {
      const dictation =
        this.dictationScores.reduce((sum, value) => sum + value, 0) / this.dictationTotal;
      return Math.round((quizScore + dictation) / 2);
    }
    return Math.round(quizScore);
  }

  quizState(): QuizState {
    let state = this.quizStates.get(this.stepIndex);
    if (!state) {
      state = { picked: (this.step.quiz ?? []).map(() => null), checked: false };
      this.quizStates.set(this.stepIndex, state);
    }
    return state;
  }

  pick(questionIndex: number, optionIndex: number): void {
    const state = this.quizState();
    if (!state.checked) {
      state.picked[questionIndex] = optionIndex;
    }
  }

  get canCheck(): boolean {
    const state = this.quizState();
    return !state.checked && state.picked.every(value => value !== null);
  }

  check(): void {
    this.quizState().checked = true;
  }

  get dictationLine() {
    return this.lesson?.kind === 'listening' ? this.lesson.lines[this.dictationIndex] : undefined;
  }

  get dictationTotal(): number {
    return this.lesson?.kind === 'listening' ? this.lesson.lines.length : 0;
  }

  checkDictationLine(): void {
    const line = this.dictationLine;
    if (!line || this.dictationResult) {
      return;
    }
    const result = checkDictation(line.text, this.dictationInput);
    this.dictationResult = result;
    this.dictationScores[this.dictationIndex] = result.total
      ? Math.round((result.correctCount / result.total) * 100)
      : 0;
  }

  nextDictation(): void {
    if (this.dictationIndex < this.dictationTotal - 1) {
      this.dictationIndex += 1;
      this.dictationInput = '';
      this.dictationResult = null;
    } else {
      this.next();
    }
  }

  get canContinue(): boolean {
    return this.step.type !== 'quiz' || this.quizState().checked;
  }

  optionClass(questionIndex: number, optionIndex: number): string {
    const state = this.quizState();
    const quiz = this.step.quiz![questionIndex];
    if (state.checked) {
      if (optionIndex === quiz.answer) {
        return 'is-correct';
      }
      return state.picked[questionIndex] === optionIndex ? 'is-wrong' : '';
    }
    return state.picked[questionIndex] === optionIndex ? 'is-picked' : '';
  }

  next(): void {
    this.stopSpeaking();
    if (this.isLastStep) {
      this.finish();
      return;
    }
    this.stepIndex += 1;
    this.cardIndex = 0;
  }

  prevCard(): void {
    this.cardIndex = Math.max(0, this.cardIndex - 1);
  }

  nextCard(): void {
    if (this.cardIndex < this.words.length - 1) {
      this.cardIndex += 1;
    } else {
      this.next();
    }
  }

  /** Chuyển sang trang đăng nhập rồi quay lại đúng bài này. */
  loginToSave(): void {
    void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
  }

  saveWord(word: VocabWord): void {
    if (!this.auth.user()) {
      this.loginToSave();
      return;
    }
    if (this.savedWords.has(word.word)) {
      return;
    }
    this.api
      .saveWord({ word: word.word, meaning: word.meaning, ipa: word.ipa, example: word.example })
      .subscribe({
        next: () => this.savedWords.add(word.word),
        error: () => (this.saveFailed = true),
      });
  }

  speak(text: string): void {
    if (!('speechSynthesis' in window)) {
      return;
    }
    this.stopSpeaking();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }

  private stopSpeaking(): void {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  private finish(): void {
    if (!this.lesson || this.saving) {
      return;
    }
    if (!this.auth.user()) {
      // Khách vẫn làm xong bài nhưng tiến độ không được lưu.
      this.finished = true;
      return;
    }
    this.saving = true;
    this.api.complete(this.lesson.id, this.score).subscribe({
      next: () => {
        this.saving = false;
        this.finished = true;
      },
      error: () => {
        this.saving = false;
        this.finished = true;
        this.saveFailed = true;
      },
    });
  }

  private buildSteps(lesson: Lesson): Step[] {
    switch (lesson.kind) {
      case 'vocab':
        return [
          { label: 'Học', type: 'cards' },
          { label: 'Kiểm tra', type: 'quiz', quiz: this.vocabQuiz(lesson.words) },
        ];
      case 'grammar':
        return [
          { label: 'Quy tắc', type: 'rules' },
          { label: 'Luyện tập', type: 'quiz', quiz: lesson.practice },
        ];
      case 'reading':
        return [
          { label: 'Đọc', type: 'text' },
          { label: 'Câu hỏi', type: 'quiz', quiz: lesson.questions },
          { label: 'Ôn lại', type: 'quiz', quiz: lesson.review },
        ];
      case 'speaking':
        // Bài luyện nói có component riêng (ghi âm), xem SpeakingLessonComponent.
        return [];
      case 'listening':
        return [
          { label: 'Lời thoại', type: 'dialogue' },
          { label: 'Câu hỏi', type: 'quiz', quiz: lesson.questions },
          { label: 'Nghe chép', type: 'dictation' },
        ];
    }
  }

  /** Mỗi từ thành một câu hỏi "Từ nào có nghĩa là ...", đáp án sai lấy từ các từ còn lại. */
  private vocabQuiz(words: VocabWord[]): Quiz[] {
    return words.map((word, index) => {
      const options = words
        .map((_, offset) => words[(index + offset) % words.length].word)
        .slice(0, 4)
        .sort(() => Math.random() - 0.5);
      return {
        question: `Từ nào có nghĩa: ${word.meaning}`,
        options,
        answer: options.indexOf(word.word),
      };
    });
  }
}
