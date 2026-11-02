import {
  abLoopTarget,
  cueIndexAt,
  formatDuration,
  formatTime,
  wordsReached,
  youtubeThumbnail,
} from './video-player';

describe('video-player helpers', () => {
  const starts = [23, 25, 27, 30.8, 34.5];

  it('tìm đúng câu đang đọc, kể cả trước câu đầu và sau câu cuối', () => {
    expect(cueIndexAt(starts, 0)).toBe(-1);
    expect(cueIndexAt(starts, 23)).toBe(0);
    expect(cueIndexAt(starts, 24.9)).toBe(0);
    expect(cueIndexAt(starts, 25)).toBe(1);
    expect(cueIndexAt(starts, 31)).toBe(3);
    expect(cueIndexAt(starts, 999)).toBe(4);
    expect(cueIndexAt([], 5)).toBe(-1);
  });

  it('ước lượng số từ đã đọc theo thời gian và không vượt quá số từ', () => {
    expect(wordsReached(10, 0, 10, -1)).toBe(0);
    expect(wordsReached(10, 0, 10, 0)).toBe(0);
    expect(wordsReached(10, 0, 10, 4.25)).toBe(5);
    expect(wordsReached(10, 0, 10, 8.5)).toBe(10);
    expect(wordsReached(10, 0, 10, 100)).toBe(10);
    expect(wordsReached(0, 0, 10, 5)).toBe(0);
  });

  it('vòng lặp A-B chỉ tua lại khi đủ hai mốc hợp lệ và đã chạm mốc B', () => {
    expect(abLoopTarget(null, null, 50)).toBeNull();
    expect(abLoopTarget(10, null, 50)).toBeNull();
    expect(abLoopTarget(10, 20, 15)).toBeNull();
    expect(abLoopTarget(10, 20, 20)).toBe(10);
    expect(abLoopTarget(10, 20, 31)).toBe(10);
    // Mốc B không sau mốc A thì bỏ qua, tránh tua liên tục.
    expect(abLoopTarget(20, 10, 99)).toBeNull();
    expect(abLoopTarget(0, 5, 6)).toBe(0);
  });

  it('định dạng thời gian phút:giây', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.9)).toBe('1:05');
    expect(formatTime(-3)).toBe('0:00');
  });

  it('định dạng thời lượng ở góc ảnh xem trước', () => {
    expect(formatDuration(369)).toBe('6:09');
    expect(formatDuration(3723)).toBe('1:02:03');
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(59.6)).toBe('1:00');
  });

  it('lấy ảnh xem trước của YouTube từ id', () => {
    expect(youtubeThumbnail('R6MlUcmOul8')).toBe(
      'https://i.ytimg.com/vi/R6MlUcmOul8/hqdefault.jpg',
    );
  });
});
