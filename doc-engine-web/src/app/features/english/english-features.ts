import { Skill } from '../../core/api.models';

export interface EnglishFeature {
  slug: string;
  /** Có giá trị khi mục này đã có bài học thật từ API; mục khác hiển thị trang "Sắp ra mắt". */
  skill?: Skill;
  label: string;
  icon: string;
  summary: string;
  upcoming: string[];
}

export const ENGLISH_FEATURES: EnglishFeature[] = [
  {
    slug: 'words',
    skill: 'words',
    label: 'Từ vựng',
    icon: 'font-size',
    summary: 'Học từ theo lộ trình, lưu từ khó để ôn lại đúng lúc sắp quên.',
    upcoming: [
      'Lộ trình theo Band 3.0 đến 9.0, tương ứng A1 đến C2, chia theo Unit và chủ đề',
      'Mỗi bài gồm 5 bước: Học, Nhớ, Điền từ, Hội thoại, Kiểm tra',
      'Thẻ từ có phiên âm IPA, nghĩa tiếng Việt, ví dụ và phát âm US/UK',
      'Nối cặp từ, xếp chữ cái nghe được, chọn từ còn thiếu trong câu',
    ],
  },
  {
    slug: 'grammar',
    skill: 'grammar',
    label: 'Ngữ pháp',
    icon: 'book',
    summary: 'Học ngữ pháp qua tình huống hội thoại, rồi luyện tới khi thành thạo mẫu câu.',
    upcoming: [
      'Lộ trình theo Band và Chương, mỗi chương kể một câu chuyện nhỏ',
      'Mỗi bài 5 bước: Khám phá, Quy tắc, Luyện tập, Sửa lỗi, Vận dụng',
      'Khám phá: chạm vào các tin nhắn có chứa mẫu câu mới',
      'Sửa lỗi: tìm và sửa lỗi sai trong tin nhắn',
    ],
  },
  {
    slug: 'listening',
    skill: 'listening',
    label: 'Luyện nghe',
    icon: 'customer-service',
    summary: 'Nghe video có phụ đề song ngữ, chép chính tả và điền từ còn thiếu.',
    upcoming: [
      'Lộ trình theo Band và Chặng, mỗi chặng có 20 bài nghe',
      'Mỗi bài có 2 phần: Câu hỏi (trả lời sau khi nghe) và Nghe chép',
      'Xem lời thoại kèm bản dịch, chỉ mở sau khi làm xong để không lộ đáp án',
      'Nghe lại từng câu thoại, đổi tốc độ và hiện hoặc ẩn chữ',
      'Video có phụ đề song ngữ EN–VI, chính tả và điền từ theo từng câu',
    ],
  },
  {
    slug: 'video',
    skill: 'video',
    label: 'Xem video',
    icon: 'play-circle',
    summary:
      'Xem video có phụ đề chạy theo, bấm từng câu để nghe lại, luyện shadowing và nghe chép.',
    upcoming: [
      'Video có phụ đề tiếng Anh và bản dịch',
      'Chữ chạy theo lời nói',
      'Shadowing và nghe chép từng câu',
    ],
  },
  {
    slug: 'speaking',
    skill: 'speaking',
    label: 'Luyện nói',
    icon: 'audio',
    summary: 'Nhại theo người bản ngữ rồi so phát âm của bạn với câu gốc.',
    upcoming: [
      'Shadowing từng câu với tốc độ tuỳ chỉnh',
      'Phiên âm IPA ngay dưới câu đang luyện',
      'Ghi âm và nghe lại',
    ],
  },
  {
    slug: 'reading',
    skill: 'reading',
    label: 'Đọc hiểu',
    icon: 'read',
    summary: 'Đọc email, thực đơn, tin nhắn, blog theo trình độ, chạm vào từ để xem nghĩa.',
    upcoming: [
      'Lộ trình theo Band và Chặng, mỗi chặng có khoảng 24 bài đọc',
      'Mỗi bài 3 bước: Đọc, Câu hỏi, Ôn lại',
      'Chạm vào từ để xem nghĩa, giữ và kéo để dịch cả cụm',
      'Câu hỏi trắc nghiệm và điền từ còn thiếu, cho phép xem lại bài đọc bất cứ lúc nào',
    ],
  },
  {
    slug: 'review',
    label: 'Ôn tập',
    icon: 'reload',
    summary: 'Ôn lại từ và câu đã học theo lịch, không bỏ sót.',
    upcoming: [
      'Lưu từ hoặc cụm từ khi đang xem video hay đọc bài, từ sẽ quay lại đúng lúc sắp quên',
      'Hai cách ôn: Flashcard tự đánh giá và Trắc nghiệm chọn nghĩa trong 4 đáp án',
      'Sổ tay để sắp xếp từ vựng theo chủ đề và luyện tập riêng',
      'Chuỗi ngày học liên tục',
    ],
  },
  {
    slug: 'word-garden',
    label: 'Vườn từ',
    icon: 'experiment',
    summary: 'Mỗi từ bạn học là một cái cây, ôn đều thì cây lớn.',
    upcoming: ['Từ mới là hạt giống', 'Ôn đúng hạn để cây phát triển', 'Xem cả vườn từ của bạn'],
  },
];
