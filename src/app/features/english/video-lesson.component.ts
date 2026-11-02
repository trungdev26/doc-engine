import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  NgZone,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DictionaryEntry, VideoCue, VideoLesson } from '../../core/api.models';
import { AuthService } from '../../core/auth.service';
import { EnglishApiService } from '../../core/english-api.service';
import { Recorder } from '../../core/recorder';
import { DictationResult, checkDictation, tokenize } from './dictation';
import { IpaPart, ipaParts, lookupKey, phraseKey, posLabel } from './word-lookup';
import {
  PlayerAdapter,
  abLoopTarget,
  createFilePlayer,
  createYoutubePlayer,
  cueIndexAt,
  formatTime,
  wordsReached,
} from './video-player';

type Mode = 'script' | 'shadowing' | 'dictation';

/** Thẻ tra từ đang mở dưới tiêu đề "Lời thoại". */
interface DictState {
  word: string;
  /** true khi người học kéo chọn cả cụm (nhiều từ) thay vì bấm một từ. */
  phrase: boolean;
  cueIndex: number;
  wordIndex: number;
  loading: boolean;
  error: string;
  entry: DictionaryEntry | null;
  saved: boolean;
  saving: boolean;
}

@Component({
  selector: 'app-video-lesson',
  templateUrl: './video-lesson.component.html',
  styleUrls: ['./video-lesson.component.scss'],
})
export class VideoLessonComponent implements AfterViewInit, OnDestroy {
  @ViewChild('youtubeHost') private youtubeHost?: ElementRef<HTMLElement>;
  @ViewChild('fileVideo') private fileVideo?: ElementRef<HTMLVideoElement>;
  @ViewChild('scriptList') private scriptList?: ElementRef<HTMLElement>;
  @ViewChild('stage') private stage?: ElementRef<HTMLElement>;

  lesson: VideoLesson | null = null;
  loading = true;
  error = '';
  playerReady = false;

  mode: Mode = 'script';
  /** Hai nút EN và VI bật tắt từng ngôn ngữ của chữ đè lên video và của danh sách lời thoại. */
  showEnglish = true;
  showTranslation = true;
  rate = 1;
  playing = false;
  time = 0;
  duration = 0;
  activeIndex = -1;
  /** Số từ đã đọc tới trong câu đang phát, để tô sáng chữ chạy theo lời. */
  reached = 0;
  autoScroll = true;
  muted = false;
  fullscreen = false;
  /** Hai mốc của vòng lặp A-B. Bấm nút lần lượt: đặt A, đặt B (bắt đầu lặp), rồi xóa. */
  loopA: number | null = null;
  loopB: number | null = null;

  // Shadowing và nghe chép làm việc trên một câu được chọn.
  focusIndex = 0;
  readonly recorder = new Recorder(() => this.zone.run(() => this.cdr.detectChanges()));
  dictationInput = '';
  dictationResult: DictationResult | null = null;
  private loopUntil: number | null = null;

  dict: DictState | null = null;
  /** Mỗi lần tra tăng một số; kết quả của lần tra cũ (người học đã bấm từ khác) bị bỏ. */
  private lookupSeq = 0;
  /** Từ đã tra trong phiên này: bấm lại hiện ngay, không gọi máy chủ. */
  private readonly entries = new Map<string, DictionaryEntry>();
  private readonly wordCache = new WeakMap<VideoCue, string[]>();
  readonly posLabel = posLabel;
  private readonly ipaCache = new Map<string, IpaPart[]>();

  /** Phiên âm đã tách nguyên âm, phụ âm. Giữ kết quả theo chuỗi để template không dựng mảng mới mỗi lần vẽ. */
  ipaOf(ipa: string): IpaPart[] {
    let parts = this.ipaCache.get(ipa);
    if (!parts) {
      parts = ipaParts(ipa);
      this.ipaCache.set(ipa, parts);
    }
    return parts;
  }

  private player: PlayerAdapter | null = null;
  private timer: number | null = null;
  private starts: number[] = [];

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly api: EnglishApiService,
    private readonly auth: AuthService,
    private readonly zone: NgZone,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngAfterViewInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.api.lesson<VideoLesson>(id).subscribe({
      next: lesson => {
        this.lesson = lesson;
        this.starts = lesson.cues.map(cue => cue.start);
        this.loading = false;
        this.cdr.detectChanges();
        void this.startPlayer(lesson);
      },
      error: () => {
        this.loading = false;
        this.error = 'Không tải được bài học này.';
      },
    });
  }

  ngOnDestroy(): void {
    this.stopTimer();
    this.player?.destroy();
    this.recorder.dispose();
  }

  get cues(): VideoCue[] {
    return this.lesson?.cues ?? [];
  }

  /** Chữ đè lên video. Ẩn ở chế độ chính tả vì chính là đáp án của bài. */
  get currentCue(): VideoCue | undefined {
    return this.mode === 'dictation' ? undefined : this.cues[this.activeIndex];
  }

  get focusCue(): VideoCue | undefined {
    return this.cues[this.focusIndex];
  }

  get percent(): number {
    return this.duration ? Math.min(100, (this.time / this.duration) * 100) : 0;
  }

  get timeLabel(): string {
    return `${formatTime(this.time)} / ${formatTime(this.duration)}`;
  }

  /** Tách từ một lần cho mỗi câu; template gọi hàm này cho mọi câu ở mỗi lần cập nhật màn hình. */
  words(cue: VideoCue): string[] {
    let list = this.wordCache.get(cue);
    if (!list) {
      list = cue.text.split(/\s+/).filter(Boolean);
      this.wordCache.set(cue, list);
    }
    return list;
  }

  /** Số từ đã tô sáng cho câu thứ `index`: câu đã qua tô hết, câu đang đọc tô theo tiến độ, câu sau không tô. */
  litWords(index: number, cue: VideoCue): number {
    if (index < this.activeIndex) {
      return this.words(cue).length;
    }
    return index === this.activeIndex ? this.reached : 0;
  }

  time$(cue: VideoCue): string {
    return formatTime(cue.start);
  }

  // ---- Điều khiển phát ----

  togglePlay(): void {
    if (!this.player) {
      return;
    }
    this.loopUntil = null;
    this.playing ? this.player.pause() : this.player.play();
    this.playing = !this.playing;
  }

  jump(seconds: number): void {
    this.player?.seek(Math.max(0, Math.min(this.duration || Infinity, this.time + seconds)));
    this.sync();
  }

  seekTo(event: MouseEvent): void {
    const bar = event.currentTarget as HTMLElement;
    const rect = bar.getBoundingClientRect();
    this.player?.seek(((event.clientX - rect.left) / rect.width) * this.duration);
    this.sync();
  }

  toggleMute(): void {
    this.muted = !this.muted;
    this.player?.setMuted(this.muted);
  }

  /** Nút A-B: lần một đặt mốc A tại vị trí hiện tại, lần hai đặt mốc B và bắt đầu lặp, lần ba xóa vòng lặp. */
  cycleLoop(): void {
    if (this.loopA === null) {
      this.loopA = this.time;
    } else if (this.loopB === null) {
      // Mốc B phải sau A; nếu bấm quá sát thì coi như đặt lại A.
      if (this.time - this.loopA < 0.5) {
        this.loopA = this.time;
        return;
      }
      this.loopB = this.time;
    } else {
      this.loopA = null;
      this.loopB = null;
    }
  }

  get loopLabel(): string {
    if (this.loopA === null) {
      return 'A-B';
    }
    return this.loopB === null ? `A ${formatTime(this.loopA)}` : 'Đang lặp';
  }

  /** Toàn màn hình cho cả khung video lẫn chữ đè, vì nút của YouTube đã tắt (fs=0). */
  toggleFullscreen(): void {
    const stage = this.stage?.nativeElement;
    if (!stage) {
      return;
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void stage.requestFullscreen?.();
    }
  }

  /** Bấm ra ngoài thẻ tra từ thì đóng thẻ. Bấm vào chữ trong lời thoại không đóng, vì sẽ mở từ khác. */
  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent): void {
    if (this.dict && !(event.target as Element | null)?.closest('.dict, .cue__text')) {
      this.closeDict();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.dict) {
      this.closeDict();
    }
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    this.fullscreen = !!document.fullscreenElement;
  }

  cycleRate(): void {
    const rates = [1, 0.75, 0.5, 1.25];
    this.rate = rates[(rates.indexOf(this.rate) + 1) % rates.length];
    this.player?.setRate(this.rate);
  }

  /** Nhảy tới một câu rồi phát; ở chế độ shadowing và nghe chép thì phát đúng câu đó rồi dừng. */
  playCue(index: number, onlyThisCue = false): void {
    const cue = this.cues[index];
    if (!cue || !this.player) {
      return;
    }
    this.player.seek(cue.start);
    this.player.play();
    this.playing = true;
    this.loopUntil = onlyThisCue ? this.endOf(index) : null;
    this.sync();
  }

  previousCue(): void {
    this.playCue(Math.max(0, this.activeIndex - 1));
  }

  nextCue(): void {
    this.playCue(Math.min(this.cues.length - 1, this.activeIndex + 1));
  }

  // ---- Tra từ ----

  /** Bấm một từ trong lời thoại: tạm dừng video và hiện phiên âm, nghĩa. Không nhảy tới câu đó. */
  lookupWord(raw: string, cueIndex: number, wordIndex: number, event: Event): void {
    event.stopPropagation();
    const word = lookupKey(raw);
    if (!word) {
      return;
    }
    this.openDict(word, false, cueIndex, wordIndex);
  }

  /**
   * Người học kéo chọn nhiều từ trong một câu: tra cả cụm. Học theo cụm dễ nhớ hơn từ lẻ, và lúc lưu thì
   * câu gốc đi kèm làm ví dụ. Chọn một từ hoặc chọn bậy (quá 8 từ, có số) thì bỏ qua, để thao tác bấm từ lo.
   */
  lookupSelection(cueIndex: number, event: Event): void {
    const phrase = phraseKey(window.getSelection()?.toString() ?? '');
    if (!phrase) {
      return;
    }
    event.stopPropagation();
    this.openDict(phrase, true, cueIndex, -1);
  }

  /** Bấm vào dòng thoại thì nhảy tới câu đó; nhưng đang kéo chọn chữ thì không nhảy. */
  onCueClick(index: number): void {
    if (window.getSelection()?.toString().trim()) {
      return;
    }
    this.playCue(index);
  }

  private openDict(word: string, phrase: boolean, cueIndex: number, wordIndex: number): void {
    if (this.playing) {
      this.player?.pause();
      this.playing = false;
    }
    const seq = ++this.lookupSeq;
    const known = this.entries.get(word) ?? null;
    this.dict = {
      word,
      phrase,
      cueIndex,
      wordIndex,
      loading: !known,
      error: '',
      entry: known,
      saved: false,
      saving: false,
    };
    if (known) {
      return;
    }
    (phrase ? this.api.definePhrase(word) : this.api.define(word)).subscribe({
      next: entry => {
        // Kết quả dở dang không được nhớ tạm, để bấm lại từ đó là tra lại thay vì giữ nguyên chỗ thiếu.
        if (!entry.partial && (entry.vi || entry.ipa || entry.meanings.length)) {
          this.entries.set(word, entry);
        }
        if (seq === this.lookupSeq && this.dict) {
          this.dict = { ...this.dict, loading: false, entry };
        }
      },
      error: () => {
        if (seq === this.lookupSeq && this.dict) {
          this.dict = {
            ...this.dict,
            loading: false,
            error: 'Không tra được lúc này. Bạn thử lại sau nhé.',
          };
        }
      },
    });
  }

  /** Tra lại đúng từ hoặc cụm đang mở (khi máy chủ báo chưa lấy đủ dữ liệu). */
  retryDict(): void {
    const dict = this.dict;
    if (dict) {
      this.openDict(dict.word, dict.phrase, dict.cueIndex, dict.wordIndex);
    }
  }

  closeDict(): void {
    this.lookupSeq++;
    this.dict = null;
  }

  /** Câu gốc chứa từ hoặc cụm đang tra, làm ví dụ ngay trong thẻ và khi lưu. */
  contextOf(dict: DictState): string {
    return this.cues[dict.cueIndex]?.text ?? '';
  }

  /** Trình duyệt có giọng đọc tích hợp (Web Speech) để đọc những từ và cụm từ điển không có file âm thanh. */
  readonly canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

  /** Phát file âm thanh của từ điển nếu có; không có hoặc file hỏng thì đọc bằng giọng của trình duyệt. */
  playPronunciation(): void {
    const dict = this.dict;
    if (!dict) {
      return;
    }
    const url = dict.entry?.audio;
    if (!url) {
      this.speak(dict.word);
      return;
    }
    new Audio(url).play().catch(() => this.speak(dict.word));
  }

  private speak(text: string): void {
    if (!this.canSpeak) {
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    // Danh sách giọng nạp chậm ở lần đầu; chưa có thì để trình duyệt tự chọn theo `lang`.
    const voice = synth.getVoices().find(item => item.lang === 'en-US');
    if (voice) {
      utterance.voice = voice;
    }
    synth.speak(utterance);
  }

  /** Lưu từ vào thư viện ôn tập. Khách phải đăng nhập, xong quay lại đúng bài này. */
  saveDictWord(): void {
    const dict = this.dict;
    if (!dict?.entry || dict.entry.partial || dict.saved || dict.saving) {
      return;
    }
    if (!this.auth.user()) {
      void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    const entry = dict.entry;
    const meaning = entry.vi ?? entry.meanings[0]?.definition;
    if (!meaning) {
      return;
    }
    const seq = this.lookupSeq;
    this.dict = { ...dict, saving: true };
    this.api
      .saveWord({
        word: dict.word,
        meaning,
        ipa: entry.ipa,
        example: this.cues[dict.cueIndex]?.text,
      })
      .subscribe({
        next: () => {
          if (seq === this.lookupSeq && this.dict) {
            this.dict = { ...this.dict, saving: false, saved: true };
          }
        },
        error: () => {
          if (seq === this.lookupSeq && this.dict) {
            this.dict = { ...this.dict, saving: false, error: 'Chưa lưu được từ này.' };
          }
        },
      });
  }

  // ---- Chế độ học ----

  setMode(mode: Mode): void {
    this.mode = mode;
    this.closeDict();
    this.recorder.discard();
    this.dictationResult = null;
    this.dictationInput = '';
    this.loopUntil = null;
    if (mode !== 'script') {
      this.focusIndex = Math.max(0, this.activeIndex);
      this.player?.pause();
      this.playing = false;
    }
  }

  focus(index: number): void {
    this.focusIndex = Math.max(0, Math.min(this.cues.length - 1, index));
    this.recorder.discard();
    this.dictationResult = null;
    this.dictationInput = '';
  }

  listenFocus(): void {
    this.playCue(this.focusIndex, true);
  }

  toggleRecord(): void {
    this.recorder.state === 'recording'
      ? this.recorder.stop()
      : void this.recorder.start().then(() => this.cdr.markForCheck());
  }

  check(): void {
    const cue = this.focusCue;
    if (cue) {
      this.dictationResult = checkDictation(cue.text, this.dictationInput);
    }
  }

  tokens(text: string): string[] {
    return tokenize(text);
  }

  // ---- Nội bộ ----

  private async startPlayer(lesson: VideoLesson): Promise<void> {
    try {
      const source = lesson.source;
      if (source.type === 'youtube') {
        const host = this.youtubeHost?.nativeElement;
        if (!host) {
          return;
        }
        this.player = await createYoutubePlayer(host, source.id, () => undefined);
      } else {
        const video = this.fileVideo?.nativeElement;
        if (!video) {
          return;
        }
        this.player = createFilePlayer(video, source);
        video.addEventListener('loadedmetadata', () => this.zone.run(() => this.sync()));
      }
      this.playerReady = true;
      this.startTimer();
      this.sync();
    } catch (error) {
      this.error = (error as Error).message;
    }
    this.cdr.detectChanges();
  }

  /** Đọc vị trí phát vài lần mỗi giây ngoài Angular, chỉ cập nhật màn hình khi có gì thay đổi. */
  private startTimer(): void {
    this.zone.runOutsideAngular(() => {
      this.timer = window.setInterval(() => {
        const before = `${this.activeIndex}|${this.reached}|${this.playing}|${Math.floor(this.time)}`;
        this.sync();
        const back = abLoopTarget(this.loopA, this.loopB, this.time);
        if (back !== null) {
          this.player?.seek(back);
          this.sync();
        }
        const stopAt = this.loopUntil;
        if (stopAt !== null && this.time >= stopAt) {
          this.player?.pause();
          this.playing = false;
          this.loopUntil = null;
        }
        if (
          before !== `${this.activeIndex}|${this.reached}|${this.playing}|${Math.floor(this.time)}`
        ) {
          this.zone.run(() => {
            this.cdr.detectChanges();
            this.followActive();
          });
        }
      }, 150);
    });
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private sync(): void {
    if (!this.player) {
      return;
    }
    this.time = this.player.currentTime();
    this.duration = this.player.duration() || this.duration;
    this.playing = this.player.isPlaying();
    this.activeIndex = cueIndexAt(this.starts, this.time);
    const cue = this.cues[this.activeIndex];
    this.reached = cue
      ? wordsReached(this.words(cue).length, cue.start, this.endOf(this.activeIndex), this.time)
      : 0;
  }

  /**
   * Giờ kết thúc câu. Ưu tiên giờ có trong phụ đề; không có thì ước lượng theo số từ (khoảng 2,5 từ mỗi
   * giây) và không vượt quá giờ bắt đầu câu kế. Nhờ vậy nghe lại một câu không phát luôn đoạn im lặng
   * dài trước câu sau.
   */
  private endOf(index: number): number {
    const cue = this.cues[index];
    if (cue.end !== undefined) {
      return cue.end;
    }
    const next = this.cues[index + 1];
    const estimated = cue.start + Math.max(1.5, this.words(cue).length / 2.5 + 0.5);
    return next ? Math.min(estimated, next.start) : Math.min(estimated, this.duration || estimated);
  }

  /** Cuộn danh sách script để câu đang đọc luôn nằm trong tầm nhìn. */
  private followActive(): void {
    if (!this.autoScroll || this.mode !== 'script') {
      return;
    }
    const list = this.scriptList?.nativeElement;
    const active = list?.querySelector<HTMLElement>('.cue.is-active');
    if (list && active) {
      const top = active.offsetTop - list.clientHeight / 3;
      list.scrollTo({ top, behavior: 'smooth' });
    }
  }
}
