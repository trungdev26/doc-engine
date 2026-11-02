import { nextReview } from './srs';

describe('nextReview', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  it('đưa từ quên về hộp 0 và ôn lại ngay', () => {
    expect(nextReview(3, 'again', now)).toEqual({ box: 0, dueAt: now.toISOString() });
  });

  it('good tăng một hộp và hẹn theo số ngày của hộp mới', () => {
    expect(nextReview(1, 'good', now)).toEqual({
      box: 2,
      dueAt: '2026-01-03T00:00:00.000Z',
    });
  });

  it('easy nhảy hai hộp nhưng không vượt hộp cuối', () => {
    expect(nextReview(4, 'easy', now).box).toBe(5);
    expect(nextReview(5, 'good', now)).toEqual({
      box: 5,
      dueAt: '2026-01-17T00:00:00.000Z',
    });
  });
});
