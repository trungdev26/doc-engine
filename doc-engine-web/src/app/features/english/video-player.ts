import { VideoSource } from '../../core/api.models';

/** Lớp mỏng che khác biệt giữa trình phát YouTube và thẻ video HTML5. */
export interface PlayerAdapter {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  currentTime(): number;
  duration(): number;
  isPlaying(): boolean;
  setRate(rate: number): void;
  setMuted(muted: boolean): void;
  destroy(): void;
}

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApi: Promise<void> | null = null;

/** Nạp script IFrame API của YouTube một lần duy nhất. */
function loadYoutubeApi(): Promise<void> {
  if (window.YT?.Player) {
    return Promise.resolve();
  }
  youtubeApi ??= new Promise<void>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      youtubeApi = null;
      reject(new Error('Không tải được trình phát YouTube.'));
    };
    document.head.appendChild(script);
  });
  return youtubeApi;
}

export async function createYoutubePlayer(
  host: HTMLElement,
  videoId: string,
  onReady: () => void,
): Promise<PlayerAdapter> {
  await loadYoutubeApi();
  return new Promise<PlayerAdapter>((resolve, reject) => {
    const player = new window.YT.Player(host, {
      videoId,
      width: '100%',
      height: '100%',
      // controls=0 ẩn thanh điều khiển của YouTube vì trang dùng điều khiển riêng. fs=0 và disablekb=1
      // tắt toàn màn hình và phím tắt của YouTube để không lệch với điều khiển của trang.
      // iv_load_policy=3 ẩn chú thích nổi; cc_load_policy=0 không tự bật phụ đề của YouTube.
      // autoplay=1 như trang 4you: bấm một thẻ ở danh sách là video chạy ngay, nên khung YouTube
      // không đứng yên ở trạng thái chưa phát (lúc đó YouTube luôn vẽ tiêu đề và nút chia sẻ).
      playerVars: {
        autoplay: 1,
        controls: 0,
        modestbranding: 1,
        rel: 0,
        fs: 0,
        disablekb: 1,
        iv_load_policy: 3,
        cc_load_policy: 0,
        playsinline: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: () => {
          onReady();
          resolve({
            play: () => player.playVideo(),
            pause: () => player.pauseVideo(),
            seek: (seconds: number) => player.seekTo(seconds, true),
            currentTime: () => player.getCurrentTime?.() ?? 0,
            duration: () => player.getDuration?.() ?? 0,
            // 1 là đang phát (YT.PlayerState.PLAYING).
            isPlaying: () => player.getPlayerState?.() === 1,
            setRate: (rate: number) => player.setPlaybackRate(rate),
            setMuted: (muted: boolean) => (muted ? player.mute() : player.unMute()),
            destroy: () => player.destroy(),
          });
        },
        onError: () =>
          reject(new Error('Video này không phát được (có thể bị chặn nhúng hoặc đã bị gỡ).')),
      },
    });
  });
}

export function createFilePlayer(
  video: HTMLVideoElement,
  source: Extract<VideoSource, { type: 'file' }>,
): PlayerAdapter {
  video.src = source.url;
  return {
    play: () => void video.play().catch(() => undefined),
    pause: () => video.pause(),
    seek: (seconds: number) => (video.currentTime = seconds),
    currentTime: () => video.currentTime,
    duration: () => (Number.isFinite(video.duration) ? video.duration : 0),
    isPlaying: () => !video.paused && !video.ended,
    setRate: (rate: number) => (video.playbackRate = rate),
    setMuted: (muted: boolean) => (video.muted = muted),
    destroy: () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    },
  };
}

/** Chỉ số câu đang đọc ở thời điểm `time`, hoặc -1 nếu chưa đến câu đầu. Cue đã sắp theo thời gian. */
export function cueIndexAt(starts: number[], time: number): number {
  let low = 0;
  let high = starts.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (starts[mid] <= time) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

/**
 * Số từ đã "đọc tới" trong một câu, tính theo tỉ lệ thời gian giữa câu này và câu kế tiếp.
 * Đây là ước lượng, vì phụ đề chỉ có mốc bắt đầu của cả câu chứ không có mốc từng từ.
 */
export function wordsReached(wordCount: number, start: number, end: number, time: number): number {
  if (wordCount <= 0 || end <= start || time < start) {
    return 0;
  }
  // Người nói thường dứt lời trước khi câu sau bắt đầu, nên dùng 85% khoảng thời gian.
  const progress = Math.min(1, (time - start) / ((end - start) * 0.85));
  return Math.ceil(progress * wordCount);
}

/**
 * Vòng lặp A-B: khi đã đặt đủ hai mốc và thời gian chạm mốc B thì trả về mốc A để tua lại, ngược lại trả
 * null. Dung sai nhỏ cho mốc B vì vị trí phát chỉ được đọc vài lần mỗi giây.
 */
export function abLoopTarget(a: number | null, b: number | null, time: number): number | null {
  return a !== null && b !== null && b > a && time >= b ? a : null;
}

export function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** Ảnh xem trước của video YouTube lấy từ chính id, không cần lưu thêm. */
export function youtubeThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** Thời lượng dạng 6:09 hoặc 1:02:03 cho góc ảnh xem trước. */
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}
