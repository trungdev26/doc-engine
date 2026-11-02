import 'reflect-metadata';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { PgContent } from './pg.content';
import { parsePack } from './validate';
import { VideoImportInput, buildVideoPack } from './video-import';
import { createPgPool } from '../store/pg.pool';

/**
 * Đọc file mô tả bài video. Trường `translationFile` (đường dẫn so với file mô tả) cho phép để bản
 * dịch tiếng Việt cạnh bài thay vì phải có link; nội dung được nạp vào `translationText`.
 */
function readVideoInput(file: string): VideoImportInput {
  const { translationFile, ...input } = JSON.parse(readFileSync(file, 'utf8')) as VideoImportInput & {
    translationFile?: string;
  };
  if (translationFile) {
    input.translationText = readFileSync(resolve(dirname(file), translationFile), 'utf8');
  }
  return input;
}

/**
 * Nạp nội dung vào Postgres (Neon).
 *   npm run content:seed                      nạp các bài mẫu có sẵn trong code
 *   npm run content:import -- path/to/a.json  nạp một hoặc nhiều gói nội dung
 * Chạy lại cùng một file là an toàn: bài trùng id được cập nhật, không nhân đôi.
 */
async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const [command, ...files] = process.argv.slice(2);

  // Chỉ kiểm tra cấu trúc, không cần database và không ghi gì.
  if (command === 'check-video') {
    for (const file of files) {
      const pack = parsePack(await buildVideoPack(readVideoInput(file)));
      const cues = (pack.lessons[0] as { cues: { start: number; text: string; vi?: string }[] }).cues;
      const translated = cues.filter(cue => cue.vi).length;
      console.log(
        `${file}: hợp lệ, ${cues.length} câu (${translated} có bản dịch), câu đầu: [${cues[0].start}s] ${cues[0].text}`,
      );
    }
    return;
  }

  if (command === 'check') {
    let problems = 0;
    for (const file of files) {
      const raw = JSON.parse(readFileSync(file, 'utf8'));
      for (const item of Array.isArray(raw) ? raw : [raw]) {
        try {
          const pack = parsePack(item);
          console.log(`${file}: hợp lệ ${pack.lessons.length} bài (${pack.skill} / Band ${pack.band})`);
          pack.skipped.forEach(reason => {
            problems++;
            console.warn(`  sẽ bị bỏ qua: ${reason}`);
          });
        } catch (error) {
          problems++;
          console.warn(`${file}: ${(error as Error).message}`);
        }
      }
    }
    if (problems) process.exit(1);
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Chưa đặt DATABASE_URL (xem api/.env.example).');
  }

  const pool = createPgPool(url);
  try {
    const content = new PgContent(pool);
    await content.ensureSchema();

    if (command === 'video') {
      // npm run video:import -- <file.json>: mô tả bài video (link YouTube, link phụ đề...) rồi tự lấy phụ đề.
      for (const file of files) {
        const pack = parsePack(await buildVideoPack(readVideoInput(file)));
        await content.importPack(pack);
        const cues = (pack.lessons[0] as { cues: unknown[] }).cues.length;
        console.log(`${file}: đã nạp bài video "${pack.lessons[0].title}" với ${cues} câu phụ đề.`);
      }
      return;
    }

    if (command === 'seed') {
      console.log(`Đã nạp ${await content.seedBuiltIn()} bài mẫu.`);
      return;
    }
    if (command !== 'import' || !files.length) {
      throw new Error('Cách dùng: import.js seed | import.js import <file.json>...');
    }
    for (const file of files) {
      const raw = JSON.parse(readFileSync(file, 'utf8'));
      // Một file có thể là một gói hoặc một mảng nhiều gói (mỗi gói một kỹ năng, band, unit).
      for (const item of Array.isArray(raw) ? raw : [raw]) {
        const pack = parsePack(item);
        const count = await content.importPack(pack);
        console.log(`${file}: đã nạp ${count} bài vào ${pack.skill} / Band ${pack.band}.`);
        pack.skipped.forEach(reason => console.warn(`  bỏ qua ${reason}`));
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error(`Lỗi: ${(error as Error).message}`);
  process.exit(1);
});
