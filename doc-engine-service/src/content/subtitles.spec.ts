import { isPublicAddress } from './safe-fetch';
import { mergeTranslation, parseSubtitles, parseYoutubeId, videoSourceFrom } from './subtitles';
import { parsePack } from './validate';

describe('parseSubtitles', () => {
  it('đọc SRT: bỏ số thứ tự, thẻ định dạng và nối câu nhiều dòng', () => {
    const cues = parseSubtitles(
      '1\n00:00:23,000 --> 00:00:24,500\nYou\'re a jerk, Thom.\n\n2\n00:00:27,000 --> 00:00:30,500\n<i>...you have</i>\nyour robotics.\n',
    );
    expect(cues).toEqual([
      { start: 23, end: 24.5, text: "You're a jerk, Thom." },
      { start: 27, end: 30.5, text: '...you have your robotics.' },
    ]);
  });

  it('đọc WebVTT có tiêu đề và mốc giờ dạng phút:giây', () => {
    const cues = parseSubtitles('WEBVTT\n\n00:01.500 --> 00:03.000 align:start\nHello there.\n\n01:02:03.250 --> 01:02:05.000\nLate line.');
    expect(cues).toEqual([
      { start: 1.5, end: 3, text: 'Hello there.' },
      { start: 3723.25, end: 3725, text: 'Late line.' },
    ]);
  });

  it('chịu được CRLF, BOM, câu trống và mốc giờ bị trùng', () => {
    const cues = parseSubtitles('﻿1\r\n00:00:01,000 --> 00:00:02,000\r\nFirst\r\n\r\n2\r\n00:00:01,000 --> 00:00:02,000\r\nDuplicate start\r\n\r\n3\r\n00:00:05,000 --> 00:00:06,000\r\n\r\n');
    expect(cues).toEqual([{ start: 1, end: 2, text: 'First' }]);
  });

  it('bỏ giờ kết thúc khi không sau giờ bắt đầu', () => {
    const raw = ['1', '00:00:05,000 --> 00:00:04,000', 'Bad end', ''].join('\n');
    expect(parseSubtitles(raw)).toEqual([{ start: 5, text: 'Bad end' }]);
  });

  it('sắp xếp lại khi phụ đề không theo thứ tự', () => {
    const cues = parseSubtitles('1\n00:00:10,000 --> 00:00:11,000\nB\n\n2\n00:00:02,000 --> 00:00:03,000\nA\n');
    expect(cues.map(cue => cue.text)).toEqual(['A', 'B']);
  });
});

describe('mergeTranslation', () => {
  it('ghép bản dịch theo mốc giờ gần nhất và không dùng một câu dịch hai lần', () => {
    const merged = mergeTranslation(
      [
        { start: 1, text: 'Hello' },
        { start: 1.4, text: 'World' },
        { start: 20, text: 'Far away' },
      ],
      [{ start: 1.2, text: 'Xin chào' }],
    );
    expect(merged[0].vi).toBe('Xin chào');
    expect(merged[1].vi).toBeUndefined();
    expect(merged[2].vi).toBeUndefined();
  });
});

describe('parseYoutubeId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=R6MlUcmOul8', 'R6MlUcmOul8'],
    ['https://youtu.be/R6MlUcmOul8?t=10', 'R6MlUcmOul8'],
    ['https://m.youtube.com/embed/R6MlUcmOul8', 'R6MlUcmOul8'],
    ['https://www.youtube.com/shorts/R6MlUcmOul8', 'R6MlUcmOul8'],
    ['R6MlUcmOul8', 'R6MlUcmOul8'],
  ])('lấy id từ %s', (input, id) => {
    expect(parseYoutubeId(input)).toBe(id);
  });

  it.each(['https://evil.com/watch?v=R6MlUcmOul8', 'https://www.youtube.com/watch?v=ngan', 'khong-phai-link', ''])(
    'từ chối %s',
    input => {
      expect(parseYoutubeId(input)).toBeNull();
    },
  );

  it('videoSourceFrom ưu tiên YouTube và từ chối link không phải http', () => {
    expect(videoSourceFrom({ youtube: 'https://youtu.be/R6MlUcmOul8' })).toEqual({ type: 'youtube', id: 'R6MlUcmOul8' });
    expect(videoSourceFrom({ fileUrl: 'https://example.com/a.mp4' })).toEqual({ type: 'file', url: 'https://example.com/a.mp4' });
    expect(() => videoSourceFrom({ fileUrl: 'file:///etc/passwd' })).toThrow();
    expect(() => videoSourceFrom({ fileUrl: 'javascript:alert(1)' })).toThrow();
  });
});

describe('isPublicAddress', () => {
  it.each(['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.16.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd12::1', '::ffff:127.0.0.1', 'khong-phai-ip'])(
    'chặn %s',
    address => {
      expect(isPublicAddress(address)).toBe(false);
    },
  );

  it.each(['8.8.8.8', '151.101.1.1', '172.32.0.1', '2606:4700:4700::1111'])('cho phép %s', address => {
    expect(isPublicAddress(address)).toBe(true);
  });
});

describe('parsePack cho bài video và bài hội thoại', () => {
  const video = {
    kind: 'video',
    id: 'v-1',
    title: 'Video',
    source: { type: 'youtube', id: 'R6MlUcmOul8' },
    cues: [{ start: 0, text: 'a' }, { start: 2, text: 'b' }],
  };
  const pack = (lesson: unknown, skill = 'video') => ({ skill, band: '3.0', unit: { id: 'u', title: 'U' }, lessons: [lesson] });

  it('nhận bài video hợp lệ', () => {
    expect(parsePack(pack(video)).lessons).toHaveLength(1);
  });

  it('từ chối video sai nguồn hoặc phụ đề không tăng dần', () => {
    expect(() => parsePack(pack({ ...video, source: { type: 'youtube', id: 'ngan' } }))).toThrow();
    expect(() => parsePack(pack({ ...video, source: { type: 'file', url: 'ftp://x/a.mp4' } }))).toThrow();
    expect(() => parsePack(pack({ ...video, cues: [{ start: 5, text: 'a' }, { start: 5, text: 'b' }] }))).toThrow();
    expect(() => parsePack(pack({ ...video, cues: [] }))).toThrow();
    expect(() => parsePack(pack({ ...video, cues: [{ start: 3, end: 2, text: 'a' }] }))).toThrow();
  });

  const roles = [
    { id: 'host', name: 'Người địa phương', description: 'x' },
    { id: 'guest', name: 'Khách', description: 'y' },
  ];

  it('nhận hội thoại luyện nói và từ chối lượt thoại có vai không tồn tại', () => {
    const speaking = { kind: 'speaking', id: 's-1', title: 'S', situation: 'x', roles, turns: [{ role: 'host', text: 'Hi', vi: 'Chào' }] };
    expect(parsePack(pack(speaking, 'speaking')).lessons).toHaveLength(1);
    const bad = { ...speaking, turns: [{ role: 'ai-do', text: 'Hi', vi: 'Chào' }] };
    expect(() => parsePack(pack(bad, 'speaking'))).toThrow();
  });
});

describe('video có chủ đề, thời lượng và ảnh xem trước', () => {
  const base = {
    kind: 'video',
    id: 'v-2',
    title: 'Video',
    source: { type: 'youtube', id: 'R6MlUcmOul8' },
    cues: [{ start: 0, text: 'a' }],
  };
  const pack = (lesson: unknown) => ({ skill: 'video', band: '4.0-5.0', unit: { id: 'u', title: 'U' }, lessons: [lesson] });

  it('nhận video có đủ các trường mới', () => {
    expect(
      parsePack(pack({ ...base, topic: 'Khoa học', durationSeconds: 369, thumbnail: 'https://i.ytimg.com/vi/x/hqdefault.jpg' })).lessons,
    ).toHaveLength(1);
  });

  it('từ chối thời lượng không dương, ảnh không phải https và chủ đề quá dài', () => {
    expect(() => parsePack(pack({ ...base, durationSeconds: 0 }))).toThrow();
    expect(() => parsePack(pack({ ...base, durationSeconds: 'dai' }))).toThrow();
    expect(() => parsePack(pack({ ...base, thumbnail: 'http://x/a.jpg' }))).toThrow();
    expect(() => parsePack(pack({ ...base, thumbnail: 'javascript:alert(1)' }))).toThrow();
    expect(() => parsePack(pack({ ...base, topic: 'x'.repeat(61) }))).toThrow();
  });
});

