import { checkDictation, tokenize } from './dictation';

describe('dictation', () => {
  it('bỏ dấu câu, hoa thường và dấu nháy cong khi tách từ', () => {
    expect(tokenize('Hi! I’m NEW, here.')).toEqual(['hi', "i'm", 'new', 'here']);
  });

  it('chấm đúng hoàn toàn dù khác hoa thường và dấu câu', () => {
    const result = checkDictation('Nice to meet you, Daniel.', 'nice to meet you daniel');
    expect(result.exact).toBeTrue();
    expect(result.correctCount).toBe(5);
  });

  it('đánh dấu từ thiếu và không làm sai các từ phía sau', () => {
    const result = checkDictation('I live in Da Nang', 'I live Da Nang');
    expect(result.words.map(item => item.correct)).toEqual([true, true, false, true, true]);
    expect(result.exact).toBeFalse();
  });

  it('không tính là đúng hoàn toàn khi gõ thừa từ', () => {
    const result = checkDictation('Are you from Spain', 'Are you really from Spain');
    expect(result.correctCount).toBe(4);
    expect(result.exact).toBeFalse();
  });

  it('câu để trống thì không từ nào đúng', () => {
    const result = checkDictation('Hello there', '');
    expect(result.correctCount).toBe(0);
    expect(result.exact).toBeFalse();
  });

  it("gõ thiếu dấu nháy vẫn đúng: youre = you're", () => {
    const result = checkDictation("You're a jerk, Thom.", 'youre a jerk thom');
    expect(result.exact).toBeTrue();
    expect(result.words[0].word).toBe("you're");
  });

  it('dấu ba chấm đầu câu của phụ đề không thành một "từ" cần gõ', () => {
    expect(tokenize('...alright! Fine!')).toEqual(['alright', 'fine']);
    expect(checkDictation('...alright! Fine!', 'alright fine').exact).toBeTrue();
  });

  it('chỉ có ký hiệu thì coi như không có từ nào', () => {
    expect(tokenize("... -- ' !")).toEqual([]);
  });
});
