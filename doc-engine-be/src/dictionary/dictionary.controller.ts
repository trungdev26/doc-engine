import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { WORD_PATTERN, isPhrase, normalizePhrase, normalizeWord } from './dictionary';
import { DictionaryService } from './dictionary.service';

@Controller('dictionary')
export class DictionaryController {
  constructor(private readonly dictionary: DictionaryService) {}

  /**
   * Tra một cụm từ (2 đến 8 từ) người học kéo chọn trong lời thoại. Đặt hai đoạn đường dẫn để không
   * trùng với `:word` (một từ tên "phrase" vẫn tra được).
   */
  @Get('phrases/lookup')
  phrase(@Query('text') text?: string) {
    const clean = normalizePhrase(typeof text === 'string' ? text : '');
    if (!isPhrase(clean)) {
      throw new BadRequestException('Cụm từ cần tra gồm 2 đến 8 từ tiếng Anh, tối đa 80 ký tự.');
    }
    return this.dictionary.lookupPhrase(clean);
  }

  /** Tra một từ: phiên âm, âm thanh, định nghĩa và nghĩa tiếng Việt. Công khai, vẫn chịu giới hạn tần suất chung. */
  @Get(':word')
  lookup(@Param('word') word: string) {
    if (!WORD_PATTERN.test(word)) {
      throw new BadRequestException(
        'Từ cần tra chỉ gồm chữ cái, dấu nháy hoặc gạch nối (tối đa 40 ký tự).',
      );
    }
    return this.dictionary.lookup(normalizeWord(word));
  }
}
