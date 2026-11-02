import { isPhrase, normalizePhrase } from './dictionary';

describe('phrase lookup helpers', () => {
  it('chuẩn hóa cụm: gộp khoảng trắng, bỏ dấu câu hai đầu, chữ thường, đổi dấu nháy cong', () => {
    expect(normalizePhrase('  “Follow   our passions;  ')).toBe('follow our passions');
    expect(normalizePhrase('Why don’t you just admit')).toBe("why don't you just admit");
    expect(normalizePhrase('...you have your robotics,')).toBe('you have your robotics');
    expect(normalizePhrase('1780')).toBe('');
  });

  it('chỉ nhận cụm từ 2 đến 8 từ tiếng Anh, tối đa 80 ký tự', () => {
    expect(isPhrase('follow our passions')).toBe(true);
    expect(isPhrase('freaked out by my robot hand')).toBe(true);
    expect(isPhrase('well-known fact, really')).toBe(true);
    // Một từ thì đi đường tra từ, không phải cụm.
    expect(isPhrase('passion')).toBe(false);
    expect(isPhrase('')).toBe(false);
    // Quá 8 từ hoặc quá dài.
    expect(isPhrase('one two three four five six seven eight nine')).toBe(false);
    expect(isPhrase(`${'a'.repeat(50)} ${'b'.repeat(40)}`)).toBe(false);
    // Ký tự lạ bị từ chối trước khi gọi ra ngoài.
    expect(isPhrase('hello 123 world')).toBe(false);
    expect(isPhrase('a/b c')).toBe(false);
    expect(isPhrase('x?y=1 z')).toBe(false);
    expect(isPhrase('hello  world')).toBe(false);
  });
});
