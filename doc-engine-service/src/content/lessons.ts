import { Lesson, Skill } from '../contracts';

/** Dữ liệu bài học mẫu cho Band 3.0. Mỗi bài thêm vào đây sẽ tự xuất hiện trong lộ trình. */
export interface UnitSeed {
  id: string;
  title: string;
  lessonIds: string[];
}

export const LESSONS: Lesson[] = [
  {
    kind: 'vocab',
    id: 'greetings',
    title: 'Chào hỏi làm quen',
    words: [
      {
        word: 'hello',
        pos: 'interjection',
        ipa: '/həˈloʊ/',
        meaning: 'xin chào',
        definition: 'a word you say when you meet someone',
        example: 'I say hello to my teacher every morning.',
        exampleVi: 'Sáng nào tôi cũng chào cô giáo.',
      },
      {
        word: 'name',
        pos: 'noun',
        ipa: '/neɪm/',
        meaning: 'tên',
        definition: 'the word people call you',
        example: 'My name is Lan.',
        exampleVi: 'Tên tôi là Lan.',
      },
      {
        word: 'friend',
        pos: 'noun',
        ipa: '/frend/',
        meaning: 'bạn, bạn bè',
        definition: 'a person you like and know well',
        example: 'She is my best friend.',
        exampleVi: 'Cô ấy là bạn thân nhất của tôi.',
      },
      {
        word: 'meet',
        pos: 'verb',
        ipa: '/miːt/',
        meaning: 'gặp, làm quen',
        definition: 'to see and talk to someone for the first time',
        example: 'Nice to meet you.',
        exampleVi: 'Rất vui được gặp bạn.',
      },
      {
        word: 'nice',
        pos: 'adjective',
        ipa: '/naɪs/',
        meaning: 'dễ chịu, dễ mến',
        definition: 'pleasant and friendly',
        example: 'Tom is a nice person.',
        exampleVi: 'Tom là người dễ mến.',
      },
    ],
  },
  {
    kind: 'grammar',
    id: 'be-present',
    title: 'Mình là, bạn là, cô ấy là',
    intro:
      'Dùng am với I, is với he, she, it, và are với you, we, they. Khi nói, ta thường rút gọn: I\'m, she\'s, we\'re.',
    rules: [
      { subject: 'I', verb: 'am', short: "I'm", example: "I'm from Da Nang.", note: '' },
      {
        subject: 'he / she / it',
        verb: 'is',
        short: "She's",
        example: "She's a friend.",
        note: 'Một người hoặc một vật: is.',
      },
      {
        subject: 'you / we / they',
        verb: 'are',
        short: "We're",
        example: "We're neighbours.",
        note: 'You, we, they và nhiều người: are.',
      },
    ],
    practice: [
      { question: 'She ___ a teacher.', options: ['is', 'are', 'am'], answer: 0 },
      { question: 'I ___ from Vietnam.', options: ['am', 'is', 'are', 'be'], answer: 0 },
      { question: 'They ___ my neighbours.', options: ['is', 'am', 'are'], answer: 2 },
      { question: 'He ___ very kind.', options: ['are', 'is', 'am'], answer: 1 },
    ],
  },
  {
    kind: 'reading',
    id: 'new-pen-pal',
    title: 'Một người bạn qua thư mới',
    context: 'Bạn qua thư mới của bạn, Marta, viết email đầu tiên cho bạn.',
    meta: ['Từ: Marta Silva', 'Đến: Linh Nguyen', 'Chủ đề: Hello from Lisbon!'],
    paragraphs: [
      'Hi Linh,',
      'My name is Marta, and I am your new pen pal. I am 26 years old, and I live in Lisbon, in Portugal. I am a nurse in a big hospital near the river. I often work at night, so I sleep in the morning.',
      'I have one brother and one sister. My brother is a cook, and my sister is a student. We also have a lazy grey cat called Bolo.',
      'At the weekend, I like swimming in the sea with my friends. I also love cooking fish for my family on Sundays. What about you? What is your job, and what do you do at the weekend? Please write soon and send me a photo of your city!',
      'Best wishes, Marta',
    ],
    questions: [
      {
        question: 'What is the email mainly about?',
        options: [
          'Marta introduces herself to a new pen pal.',
          'Marta invites Linh to visit Lisbon.',
          'Marta asks Linh for help with her job.',
        ],
        answer: 0,
      },
      {
        question: 'How old is Marta?',
        options: ['She is 24 years old.', 'She is 26 years old.', 'She is 36 years old.'],
        answer: 1,
      },
      {
        question: 'Where does Marta work?',
        options: ['In a hospital', 'In a school', 'In a restaurant'],
        answer: 0,
      },
      {
        question: 'Marta often works at night.',
        options: ['Đúng', 'Sai', 'Không có thông tin'],
        answer: 0,
      },
    ],
    review: [
      { question: "Marta's home is in ___, Portugal.", options: ['Lisbon', 'London', 'Madrid'], answer: 0 },
      { question: 'She helps sick people as a ___.', options: ['teacher', 'nurse', 'cook'], answer: 1 },
      { question: 'Her brother works as a ___.', options: ['driver', 'nurse', 'cook'], answer: 2 },
      { question: 'The family cat is grey and very ___.', options: ['angry', 'lazy', 'young'], answer: 1 },
      { question: 'On Sundays, Marta cooks ___ for her family.', options: ['rice', 'cake', 'fish'], answer: 2 },
    ],
  },
  {
    kind: 'listening',
    id: 'hello-first-day',
    title: 'Hello on the first day',
    situation:
      'Trước buổi học tiếng Anh đầu tiên dành cho người mới bắt đầu, Sofia và Daniel gặp nhau trong lớp và làm quen.',
    lines: [
      {
        speaker: 'Sofia',
        text: 'Hi! Is this the English class for beginners?',
        vi: 'Chào bạn! Đây có phải lớp tiếng Anh cho người mới bắt đầu không?',
      },
      {
        speaker: 'Daniel',
        text: "Yes, it is. I'm new here too. My name is Daniel.",
        vi: 'Đúng rồi. Mình cũng mới đến. Mình tên là Daniel.',
      },
      {
        speaker: 'Sofia',
        text: "Nice to meet you, Daniel. I'm Sofia. Sofia Ruiz.",
        vi: 'Rất vui được gặp bạn, Daniel. Mình là Sofia. Sofia Ruiz.',
      },
      {
        speaker: 'Daniel',
        text: 'Nice to meet you too. How do you spell Ruiz?',
        vi: 'Mình cũng rất vui được gặp bạn. Ruiz đánh vần thế nào?',
      },
      {
        speaker: 'Sofia',
        text: "R, U, I, Z. It's a Spanish name.",
        vi: 'R, U, I, Z. Đó là một cái tên tiếng Tây Ban Nha.',
      },
      { speaker: 'Daniel', text: 'Are you from Spain?', vi: 'Bạn đến từ Tây Ban Nha à?' },
    ],
    questions: [
      { question: 'Where is Sofia from?', options: ['Spain', 'Canada', 'Mexico'], answer: 2 },
      {
        question: 'How does Sofia spell her family name?',
        options: ['R, U, I, Z', 'R, U, Y, S', 'R, O, I, Z'],
        answer: 0,
      },
      {
        question: 'Is Daniel new in the class?',
        options: ['Yes, he is.', 'No, he is not.', 'We do not know.'],
        answer: 0,
      },
    ],
  },
  {
    kind: 'vocab',
    id: 'family',
    title: 'Gia đình tôi',
    words: [
      {
        word: 'family',
        pos: 'noun',
        ipa: '/ˈfæm.əl.i/',
        meaning: 'gia đình',
        definition: 'a group of people who are related to each other',
        example: 'I have a small family.',
        exampleVi: 'Tôi có một gia đình nhỏ.',
      },
      {
        word: 'mother',
        pos: 'noun',
        ipa: '/ˈmʌð.ɚ/',
        meaning: 'mẹ',
        definition: 'your female parent',
        example: 'My mother cooks dinner every day.',
        exampleVi: 'Mẹ tôi nấu bữa tối mỗi ngày.',
      },
      {
        word: 'father',
        pos: 'noun',
        ipa: '/ˈfɑː.ðɚ/',
        meaning: 'bố, cha',
        definition: 'your male parent',
        example: 'My father drives a bus.',
        exampleVi: 'Bố tôi lái xe buýt.',
      },
      {
        word: 'brother',
        pos: 'noun',
        ipa: '/ˈbrʌð.ɚ/',
        meaning: 'anh trai, em trai',
        definition: 'a boy or man with the same parents as you',
        example: 'My brother is ten years old.',
        exampleVi: 'Em trai tôi mười tuổi.',
      },
      {
        word: 'sister',
        pos: 'noun',
        ipa: '/ˈsɪs.tɚ/',
        meaning: 'chị gái, em gái',
        definition: 'a girl or woman with the same parents as you',
        example: 'My sister is a student.',
        exampleVi: 'Chị tôi là sinh viên.',
      },
    ],
  },
  {
    kind: 'vocab',
    id: 'daily-routine',
    title: 'Một ngày của tôi',
    words: [
      {
        word: 'breakfast',
        pos: 'noun',
        ipa: '/ˈbrek.fəst/',
        meaning: 'bữa sáng',
        definition: 'the first meal of the day',
        example: 'I eat breakfast at seven.',
        exampleVi: 'Tôi ăn sáng lúc bảy giờ.',
      },
      {
        word: 'wake up',
        pos: 'phrasal verb',
        ipa: '/weɪk ʌp/',
        meaning: 'thức dậy',
        definition: 'to stop sleeping',
        example: 'I wake up early on Monday.',
        exampleVi: 'Tôi dậy sớm vào thứ Hai.',
      },
      {
        word: 'work',
        pos: 'verb',
        ipa: '/wɝːk/',
        meaning: 'làm việc',
        definition: 'to do a job',
        example: 'She works in a small shop.',
        exampleVi: 'Cô ấy làm việc ở một cửa hàng nhỏ.',
      },
      {
        word: 'tired',
        pos: 'adjective',
        ipa: '/taɪrd/',
        meaning: 'mệt',
        definition: 'needing to rest or sleep',
        example: 'I am tired after work.',
        exampleVi: 'Tôi mệt sau giờ làm.',
      },
      {
        word: 'sleep',
        pos: 'verb',
        ipa: '/sliːp/',
        meaning: 'ngủ',
        definition: 'to rest with your eyes closed',
        example: 'I sleep for eight hours.',
        exampleVi: 'Tôi ngủ tám tiếng.',
      },
    ],
  },
  {
    kind: 'speaking',
    id: 'introduce-yourself',
    title: 'Giới thiệu bản thân',
    situation: 'Bạn gặp một người bạn mới trong lớp học tiếng Anh và muốn giới thiệu về mình.',
    sentences: [
      {
        text: 'Hello, my name is Lan.',
        vi: 'Xin chào, tên mình là Lan.',
        ipa: '/həˈloʊ maɪ neɪm ɪz lɑːn/',
      },
      {
        text: 'I am from Vietnam.',
        vi: 'Mình đến từ Việt Nam.',
        ipa: '/aɪ æm frʌm ˌviːetˈnɑːm/',
      },
      { text: 'I live in Da Nang.', vi: 'Mình sống ở Đà Nẵng.', ipa: '/aɪ lɪv ɪn dɑː nɑːŋ/' },
      { text: 'I am a student.', vi: 'Mình là sinh viên.', ipa: '/aɪ æm ə ˈstuː.dənt/' },
      { text: 'Nice to meet you.', vi: 'Rất vui được gặp bạn.', ipa: '/naɪs tuː miːt juː/' },
    ],
  },
];

const SKILL_OF: Record<Lesson['kind'], Skill> = {
  vocab: 'words',
  grammar: 'grammar',
  reading: 'reading',
  listening: 'listening',
  speaking: 'speaking',
  video: 'video',
};

export function skillOf(lesson: Lesson): Skill {
  return SKILL_OF[lesson.kind];
}

/** Lộ trình theo kỹ năng rồi theo band: bài nào gắn vào đây sẽ tự xuất hiện trong lộ trình. */
export const UNITS: Record<Skill, Record<string, UnitSeed[]>> = {
  words: {
    '3.0': [
      {
        id: 'unit-1',
        title: 'Unit 1 · Giới thiệu về bản thân',
        lessonIds: ['greetings', 'family'],
      },
    ],
    '3.5': [
      { id: 'unit-1', title: 'Unit 1 · Thói quen hằng ngày', lessonIds: ['daily-routine'] },
    ],
  },
  grammar: {
    '3.0': [
      { id: 'chapter-1', title: 'Chương 1 · Xin chào, mình là Mai', lessonIds: ['be-present'] },
    ],
  },
  reading: {
    '3.0': [
      {
        id: 'stage-1',
        title: 'Chặng 1 · Đọc ghi chú & biển báo hằng ngày',
        lessonIds: ['new-pen-pal'],
      },
    ],
  },
  listening: {
    '3.0': [
      {
        id: 'stage-1',
        title: 'Chặng 1 · Nghe hiểu giao tiếp cơ bản hằng ngày',
        lessonIds: ['hello-first-day'],
      },
    ],
  },
  speaking: {
    '3.0': [
      { id: 'stage-1', title: 'Chặng 1 · Giới thiệu bản thân', lessonIds: ['introduce-yourself'] },
    ],
  },
  video: {},
};
