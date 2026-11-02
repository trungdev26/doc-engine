import { ReviewGrade } from '../contracts';

/** Số ngày chờ ứng với từng hộp (Leitner). Hộp càng cao, từ càng được ôn thưa. */
export const BOX_INTERVAL_DAYS = [0, 1, 2, 4, 8, 16];
const MAX_BOX = BOX_INTERVAL_DAYS.length - 1;
const DAY_MS = 24 * 60 * 60 * 1000;

export function nextReview(
  box: number,
  grade: ReviewGrade,
  now: Date,
): { box: number; dueAt: string } {
  const nextBox =
    grade === 'again' ? 0 : Math.min(MAX_BOX, box + (grade === 'easy' ? 2 : 1));
  const due = new Date(now.getTime() + BOX_INTERVAL_DAYS[nextBox] * DAY_MS);
  return { box: nextBox, dueAt: due.toISOString() };
}
