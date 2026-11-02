import { VideoLesson } from '../contracts';
import { fetchPublicText } from './safe-fetch';
import { mergeTranslation, parseSubtitles, videoSourceFrom } from './subtitles';
import { ContentPack } from './validate';

/** Thông tin để dựng một bài xem video từ link và phụ đề. */
export interface VideoImportInput {
  /** Link hoặc id YouTube. */
  youtube?: string;
  /** Hoặc link tệp video http(s). */
  fileUrl?: string;
  /** Phụ đề tiếng Anh: link hoặc nội dung SRT/VTT. */
  subtitleUrl?: string;
  subtitleText?: string;
  /** Bản dịch tiếng Việt (không bắt buộc): link hoặc nội dung. */
  translationUrl?: string;
  translationText?: string;
  id: string;
  title: string;
  channel?: string;
  /** Chủ đề để gom nhóm ở danh sách. */
  topic?: string;
  durationSeconds?: number;
  /** Ảnh xem trước cho video dạng tệp (video YouTube tự có ảnh từ id). */
  thumbnail?: string;
  /** Dòng ghi nguồn bắt buộc theo giấy phép, ví dụ "(CC) Blender Foundation | mango.blender.org". */
  credit?: string;
  band: string;
  unitId: string;
  unitTitle: string;
}

async function load(url: string | undefined, text: string | undefined): Promise<string | undefined> {
  if (text?.trim()) {
    return text;
  }
  return url ? fetchPublicText(url) : undefined;
}

/** Dựng gói nội dung xem video: tải phụ đề, tách câu, ghép bản dịch nếu có. */
export async function buildVideoPack(input: VideoImportInput): Promise<ContentPack> {
  const source = videoSourceFrom(input);
  const rawEnglish = await load(input.subtitleUrl, input.subtitleText);
  if (!rawEnglish) {
    throw new Error('Cần link hoặc nội dung phụ đề tiếng Anh.');
  }
  let cues = parseSubtitles(rawEnglish);
  if (!cues.length) {
    throw new Error('Không đọc được câu nào từ phụ đề. Hãy kiểm tra định dạng SRT hoặc VTT.');
  }
  const rawTranslation = await load(input.translationUrl, input.translationText);
  if (rawTranslation) {
    cues = mergeTranslation(cues, parseSubtitles(rawTranslation));
  }

  const lesson: VideoLesson = {
    kind: 'video',
    id: input.id,
    title: input.title,
    ...(input.channel ? { channel: input.channel } : {}),
    ...(input.topic ? { topic: input.topic } : {}),
    ...(input.durationSeconds ? { durationSeconds: input.durationSeconds } : {}),
    ...(input.thumbnail ? { thumbnail: input.thumbnail } : {}),
    ...(input.credit ? { credit: input.credit } : {}),
    source,
    cues,
  };
  return {
    skill: 'video',
    band: input.band,
    unit: { id: input.unitId, title: input.unitTitle },
    lessons: [lesson],
  };
}
