import { VideoCue, VideoSource } from '../contracts';

const TIME =
  /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;
const MAX_CUES = 3000;

const toSeconds = (hours: string | undefined, minutes: string, seconds: string, millis: string) =>
  Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(millis.padEnd(3, '0')) / 1000;

const clean = (text: string): string =>
  text
    .replace(/<[^>]+>/g, '')
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Đọc phụ đề dạng SRT hoặc WebVTT thành các câu có mốc bắt đầu (giây). Bỏ câu trống. */
export function parseSubtitles(raw: string): VideoCue[] {
  const blocks = raw
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/);

  const cues: VideoCue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const index = lines.findIndex(line => TIME.test(line));
    if (index === -1) {
      continue;
    }
    const match = TIME.exec(lines[index])!;
    const text = clean(lines.slice(index + 1).join(' '));
    if (text) {
      const start = toSeconds(match[1], match[2], match[3], match[4]);
      const end = toSeconds(match[5], match[6], match[7], match[8]);
      // Phụ đề lỗi có giờ kết thúc không sau giờ bắt đầu thì bỏ giờ kết thúc thay vì giữ số vô nghĩa.
      cues.push(end > start ? { start, end, text } : { start, text });
    }
    if (cues.length > MAX_CUES) {
      throw new Error(`Phụ đề quá dài (tối đa ${MAX_CUES} câu).`);
    }
  }

  // Phụ đề tự động hay lặp mốc giờ; giữ câu đầu và bỏ các câu trùng mốc để cue luôn tăng dần.
  const sorted = cues.sort((a, b) => a.start - b.start);
  return sorted.filter((cue, i) => i === 0 || cue.start > sorted[i - 1].start);
}

/** Ghép bản dịch vào từng câu: lấy câu dịch có mốc giờ gần nhất, lệch không quá `tolerance` giây. */
export function mergeTranslation(cues: VideoCue[], translation: VideoCue[], tolerance = 1.5): VideoCue[] {
  const used = new Set<number>();
  return cues.map(cue => {
    let best = -1;
    let bestGap = tolerance;
    translation.forEach((candidate, index) => {
      const gap = Math.abs(candidate.start - cue.start);
      if (!used.has(index) && gap <= bestGap) {
        best = index;
        bestGap = gap;
      }
    });
    if (best === -1) {
      return cue;
    }
    used.add(best);
    return { ...cue, vi: translation[best].text };
  });
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** Lấy id video từ link YouTube (watch, youtu.be, embed, shorts) hoặc từ chính id 11 ký tự. */
export function parseYoutubeId(input: string): string | null {
  const text = input.trim();
  if (YOUTUBE_ID.test(text)) {
    return text;
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = url.pathname.slice(1).split('/')[0];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.searchParams.get('v') ?? /^\/(?:embed|shorts|live)\/([^/]+)/.exec(url.pathname)?.[1] ?? null;
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

export function videoSourceFrom(input: { youtube?: string; fileUrl?: string }): VideoSource {
  if (input.youtube) {
    const id = parseYoutubeId(input.youtube);
    if (!id) {
      throw new Error('Link YouTube không hợp lệ.');
    }
    return { type: 'youtube', id };
  }
  if (input.fileUrl && /^https?:\/\//i.test(input.fileUrl)) {
    return { type: 'file', url: input.fileUrl };
  }
  throw new Error('Cần link YouTube hoặc link tệp video bắt đầu bằng http(s).');
}
