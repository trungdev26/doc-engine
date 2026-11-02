import { Lesson } from '../contracts';
import { WORD_PATTERN, normalizeWord } from './dictionary';

/** Tách các từ có thể tra khỏi một đoạn văn: bỏ dấu câu hai đầu, số và ký tự lạ, đổi về chữ thường. */
export function wordsIn(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\s+/)) {
    const word = normalizeWord(raw.replace(/^[^A-Za-z]+/, '').replace(/[^A-Za-z]+$/, ''));
    if (word && WORD_PATTERN.test(word)) out.push(word);
  }
  return out;
}

/** Mọi từ tiếng Anh xuất hiện trong một bài học, để worker tra sẵn trước khi người học bấm vào. */
export function collectWords(lesson: Lesson): Set<string> {
  const texts: string[] = [];
  switch (lesson.kind) {
    case 'video':
      texts.push(...lesson.cues.map(cue => cue.text));
      break;
    case 'listening':
      texts.push(...lesson.lines.map(line => line.text));
      break;
    case 'reading':
      texts.push(...lesson.paragraphs);
      break;
    case 'vocab':
      texts.push(...lesson.words.flatMap(item => [item.word, item.example]));
      break;
    case 'speaking':
      texts.push(
        ...(lesson.sentences ?? []).map(item => item.text),
        ...(lesson.turns ?? []).map(item => item.text),
        ...(lesson.phrases ?? []).map(item => item.text),
        ...(lesson.vocab ?? []).map(item => item.word),
      );
      break;
    default:
      break;
  }
  return new Set(texts.flatMap(wordsIn));
}
