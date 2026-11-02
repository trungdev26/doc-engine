export interface DictationWord {
  word: string;
  correct: boolean;
}

export interface DictationResult {
  words: DictationWord[];
  correctCount: number;
  total: number;
  exact: boolean;
}

/** Bỏ dấu câu và hoa thường để "Hello!" và "hello" được coi là cùng một từ. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(token => /[a-z0-9]/.test(token));
}

/**
 * Khoá để so hai từ: bỏ dấu nháy, nên "youre" được tính là đúng với "you're". Người học thường gõ
 * thiếu dấu nháy, và đây là bài nghe chứ không phải bài chính tả dấu câu. Đổi lại "well" cũng khớp
 * "we'll", chấp nhận được vì ngữ cảnh câu thường phân biệt hai từ này.
 */
const matchKey = (word: string): string => word.replace(/'/g, '');

/**
 * So từng từ của câu gốc với câu người học gõ theo thứ tự (LCS), nên thiếu hoặc thừa một từ
 * không làm mọi từ phía sau bị tính sai.
 */
export function checkDictation(expected: string, typed: string): DictationResult {
  const target = tokenize(expected);
  const answer = tokenize(typed);
  const targetKeys = target.map(matchKey);
  const answerKeys = answer.map(matchKey);

  const table: number[][] = Array.from({ length: target.length + 1 }, () =>
    new Array<number>(answer.length + 1).fill(0),
  );
  for (let i = target.length - 1; i >= 0; i--) {
    for (let j = answer.length - 1; j >= 0; j--) {
      table[i][j] =
        targetKeys[i] === answerKeys[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const matched = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < target.length && j < answer.length) {
    if (targetKeys[i] === answerKeys[j]) {
      matched.add(i);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }

  const words = target.map((word, index) => ({ word, correct: matched.has(index) }));
  const correctCount = matched.size;
  return {
    words,
    correctCount,
    total: target.length,
    exact: correctCount === target.length && answer.length === target.length,
  };
}
