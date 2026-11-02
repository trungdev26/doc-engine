import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';

const ADMIN = { username: 'adminx', password: 'mat-khau-thu-nghiem-1' };

describe('API', () => {
  let app: INestApplication;
  let token: string;

  const http = () => request(app.getHttpServer());
  const as = (method: 'get' | 'post' | 'put' | 'delete' | 'patch', url: string) =>
    http()[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'api-'));
    process.env.DATA_FILE = join(dir, 'store.json');
    process.env.CONTENT_FILE = join(dir, 'content.json');
    process.env.USERS_FILE = join(dir, 'users.json');
    process.env.ADMIN_USERNAME = ADMIN.username;
    process.env.ADMIN_PASSWORD = ADMIN.password;
    process.env.SESSION_SECRET = 'khoa-thu-nghiem-dai-hon-ba-muoi-hai-ky-tu-xxxxxxxx';
    process.env.RATE_LIMIT_MAX = '1000';
    delete process.env.DATABASE_URL;

    const { AppModule } = await import('./app.module');
    const { configureApp } = await import('./setup');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const login = await http().post('/api/auth/login').send(ADMIN).expect(200);
    token = login.body.token;
  });

  afterAll(() => app.close());

  describe('đăng nhập', () => {
    it('khách xem được bài học, nhưng lưu từ, tiến độ và hồ sơ đòi đăng nhập', async () => {
      await http().get('/api/bands').expect(200);
      await http().get('/api/lessons/greetings').expect(200);
      const roadmap = await http().get('/api/skills/words/roadmap?band=3.0').expect(200);
      expect(roadmap.body.completedCount).toBe(0);

      await http().get('/api/review/words').expect(401);
      await http().post('/api/review/words').send({ word: 'a', meaning: 'b' }).expect(401);
      await http().get('/api/review/groups').expect(401);
      await http().get('/api/profile').expect(401);
      await http().get('/api/progress').expect(401);
      await http().post('/api/lessons/greetings/complete').send({ score: 50 }).expect(401);
      await http().get('/api/admin/content/status').expect(401);
      await http().post('/api/admin/content/packs').send({}).expect(401);
      await http().get('/api/review/words').set('Authorization', 'Bearer rac.rac.rac').expect(401);
    });

    it('đăng nhập đúng trả JWT và đặt cookie httpOnly', async () => {
      const res = await http().post('/api/auth/login').send(ADMIN).expect(200);
      expect(res.body).toMatchObject({ username: 'adminx', role: 'admin' });
      expect(res.body.token.split('.')).toHaveLength(3);
      const cookie = String(res.headers['set-cookie']);
      expect(cookie).toContain('session=');
      expect(cookie).toContain('HttpOnly');
    });

    it('dùng được cookie thay cho header, và /me trả người đang đăng nhập', async () => {
      const login = await http().post('/api/auth/login').send(ADMIN).expect(200);
      const cookie = String(login.headers['set-cookie']).split(';')[0];
      const me = await http().get('/api/auth/me').set('Cookie', cookie).expect(200);
      expect(me.body).toEqual({ username: 'adminx', role: 'admin' });
      await http().get('/api/bands').set('Cookie', cookie).expect(200);
    });

    it('sai mật khẩu và sai tên cùng nhận một thông báo, không cấp token', async () => {
      const wrongPassword = await http()
        .post('/api/auth/login')
        .send({ username: 'adminx', password: 'sai-mat-khau' })
        .expect(401);
      const wrongUser = await http()
        .post('/api/auth/login')
        .send({ username: 'nguoi-la', password: 'sai-mat-khau' })
        .expect(401);
      expect(wrongPassword.body.message).toBe(wrongUser.body.message);
      expect(wrongPassword.body.token).toBeUndefined();
    });

    it('tên đăng nhập không phân biệt hoa thường', async () => {
      await http().post('/api/auth/login').send({ username: 'ADMINX', password: ADMIN.password }).expect(200);
    });

    it('từ chối JWT bị sửa nội dung hoặc tự khai alg là none', async () => {
      const [header, body, signature] = token.split('.');
      const forgedBody = Buffer.from(
        JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), role: 'admin', sub: 'ai-do' }),
      ).toString('base64url');
      // Dùng endpoint admin để thấy token giả bị từ chối (phần học công khai nên không phân biệt được).
      const probe = (value: string) =>
        http().get('/api/admin/content/status').set('Authorization', `Bearer ${value}`);
      await probe(`${header}.${forgedBody}.${signature}`).expect(401);

      const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      await probe(`${noneHeader}.${body}.`).expect(401);
      await probe(token).expect(200);
    });

    it('khoá đăng nhập sau nhiều lần sai liên tiếp', async () => {
      for (let i = 0; i < 5; i++) {
        await http().post('/api/auth/login').send({ username: 'adminx', password: 'sai' }).expect(401);
      }
      const blocked = await http().post('/api/auth/login').send({ username: 'adminx', password: 'sai' });
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  describe('học tập', () => {
    it('trả lộ trình Band 3.0 và đánh dấu bài đã hoàn thành', async () => {
      const before = await as('get', '/api/skills/words/roadmap?band=3.0');
      expect(before.status).toBe(200);
      expect(before.body.totalCount).toBe(2);
      expect(before.body.completedCount).toBe(0);

      await as('post', '/api/lessons/greetings/complete').send({ score: 80 }).expect(201);

      const after = await as('get', '/api/skills/words/roadmap?band=3.0');
      expect(after.body.completedCount).toBe(1);

      const progress = await as('get', '/api/progress');
      expect(progress.body.words).toEqual({ completed: 1, total: 2 });
      expect(progress.body.speaking).toEqual({ completed: 0, total: 1 });
    });

    it('trả bài khác nhau theo band và có lộ trình luyện nói', async () => {
      const band35 = await as('get', '/api/skills/words/roadmap?band=3.5');
      expect(band35.body.units[0].lessons.map((lesson: { id: string }) => lesson.id)).toEqual([
        'daily-routine',
      ]);
      const speaking = await as('get', '/api/skills/speaking/roadmap?band=3.0');
      expect(speaking.body.totalCount).toBe(1);
      const lesson = await as('get', '/api/lessons/introduce-yourself');
      expect(lesson.body.kind).toBe('speaking');
    });

    it('trả lộ trình rỗng cho band chưa có nội dung', async () => {
      const res = await as('get', '/api/skills/words/roadmap?band=7.0-8.0');
      expect(res.status).toBe(200);
      expect(res.body.units).toEqual([]);
    });

    it('từ chối kỹ năng và dữ liệu không hợp lệ', async () => {
      await as('get', '/api/skills/dancing/roadmap').expect(400);
      await as('post', '/api/lessons/greetings/complete').send({ score: 500 }).expect(400);
      await as('get', '/api/lessons/khong-co').expect(404);
    });
  });

  describe('soạn nội dung', () => {
    const pack = {
      skill: 'words',
      band: '3.0',
      unit: { id: 'u9', title: 'Unit 9' },
      lessons: [
        {
          kind: 'vocab',
          id: 'bai-moi',
          title: 'Bài mới',
          words: [{ word: 'a', pos: 'n', ipa: '', meaning: 'm', definition: '', example: '', exampleVi: '' }],
        },
      ],
    };

    it('chỉ admin được ghi, và bài lưu xong hiện ngay trong lộ trình', async () => {
      await as('post', '/api/admin/content/packs').send({ skill: 'words' }).expect(400);

      const saved = await as('post', '/api/admin/content/packs').send(pack).expect(201);
      expect(saved.body).toEqual({ imported: 1, skipped: [] });

      const roadmap = await as('get', '/api/skills/words/roadmap?band=3.0');
      const unit = roadmap.body.units.find((item: { id: string }) => item.id === 'u9');
      expect(unit.lessons.map((lesson: { id: string }) => lesson.id)).toEqual(['bai-moi']);

      pack.lessons[0].title = 'Bài mới (sửa)';
      await as('post', '/api/admin/content/packs').send(pack).expect(201);
      const again = await as('get', '/api/skills/words/roadmap?band=3.0');
      const sameUnit = again.body.units.find((item: { id: string }) => item.id === 'u9');
      expect(sameUnit.lessons).toEqual([
        { id: 'bai-moi', title: 'Bài mới (sửa)', available: true, completed: false },
      ]);
    });
  });

  describe('danh sách video', () => {
    it('công khai, nhóm được theo chủ đề và có trình độ, không kèm phụ đề', async () => {
      const lesson = {
        kind: 'video',
        id: 'video-thu',
        title: 'Video thử',
        channel: 'Kênh thử',
        topic: 'Khoa học',
        durationSeconds: 120,
        source: { type: 'youtube', id: 'R6MlUcmOul8' },
        cues: [{ start: 0, end: 2, text: 'Hello there.' }],
      };
      await as('post', '/api/admin/content/packs')
        .send({ skill: 'video', band: '4.0-5.0', unit: { id: 'u1', title: 'U1' }, lessons: [lesson] })
        .expect(201);
      await as('post', '/api/admin/content/packs')
        .send({
          skill: 'video',
          band: '3.0',
          unit: { id: 'u1', title: 'U1' },
          lessons: [{ ...lesson, id: 'video-khong-chu-de', topic: undefined, title: 'Không chủ đề' }],
        })
        .expect(201);

      const res = await http().get('/api/videos').expect(200);
      const byId = Object.fromEntries(res.body.map((card: { id: string }) => [card.id, card]));
      expect(byId['video-thu']).toMatchObject({ topic: 'Khoa học', level: 'B1', band: '4.0-5.0', durationSeconds: 120 });
      expect(byId['video-khong-chu-de']).toMatchObject({ topic: 'Khác', level: 'A1' });
      expect(byId['video-thu'].cues).toBeUndefined();
    });
  });

  describe('ôn tập', () => {
    const word = (name: string, meaning: string) =>
      as('post', '/api/review/words').send({ word: name, meaning }).expect(201);

    it('lưu từ, ôn tập và đẩy lịch ôn ra sau', async () => {
      const saved = await word('hello', 'xin chào');
      const again = await word('Hello', 'xin chào');
      expect(again.body.id).toBe(saved.body.id);

      expect((await as('get', '/api/review/summary')).body).toEqual({ saved: 1, due: 1 });

      const graded = await as('post', `/api/review/words/${saved.body.id}/grade`).send({ grade: 'good' }).expect(200);
      expect(graded.body.box).toBe(1);
      expect((await as('get', '/api/review/summary')).body.due).toBe(0);

      await as('delete', `/api/review/words/${saved.body.id}`).expect(204);
    });

    it('tạo nhóm, gán từ vào nhóm, lọc theo nhóm và đếm đúng số từ', async () => {
      const group = (await as('post', '/api/review/groups').send({ name: 'Du lịch' }).expect(201)).body;
      await as('post', '/api/review/groups').send({ name: 'du LỊCH' }).expect(400);
      await as('post', '/api/review/groups').send({ name: '   ' }).expect(400);

      const ticket = (
        await as('post', '/api/review/words').send({ word: 'ticket', meaning: 'vé', groupIds: [group.id] }).expect(201)
      ).body;
      await word('luggage', 'hành lý');
      await as('post', '/api/review/words').send({ word: 'x', meaning: 'y', groupIds: ['khong-co'] }).expect(400);

      const inGroup = await as('get', `/api/review/words?groupId=${group.id}`);
      expect(inGroup.body.map((item: { word: string }) => item.word)).toEqual(['ticket']);

      const groups = await as('get', '/api/review/groups');
      expect(groups.body).toEqual([expect.objectContaining({ id: group.id, name: 'Du lịch', count: 1, due: 1 })]);

      const moved = await as('put', `/api/review/words/${ticket.id}/groups`).send({ groupIds: [] }).expect(200);
      expect(moved.body.groupIds).toEqual([]);
    });

    it('tìm từ không phân biệt hoa thường và dấu tiếng Việt', async () => {
      await word('airport', 'sân bay');
      const found = await as('get', '/api/review/words?search=SAN%20BAY');
      expect(found.body.map((item: { word: string }) => item.word)).toContain('airport');
    });

    it('xoá nhóm giữ lại từ nhưng gỡ khỏi nhóm', async () => {
      const group = (await as('post', '/api/review/groups').send({ name: 'Tạm' }).expect(201)).body;
      const item = (
        await as('post', '/api/review/words').send({ word: 'temp', meaning: 'tạm', groupIds: [group.id] }).expect(201)
      ).body;
      await as('delete', `/api/review/groups/${group.id}`).expect(204);

      const words = await as('get', '/api/review/words');
      const kept = words.body.find((entry: { id: string }) => entry.id === item.id);
      expect(kept.groupIds).toEqual([]);
    });

    it('tạo trắc nghiệm có đúng một đáp án đúng nằm trong các lựa chọn', async () => {
      const quiz = await as('get', '/api/review/quiz?count=3').expect(200);
      expect(quiz.body.length).toBeGreaterThan(0);
      for (const question of quiz.body) {
        expect(question.options.length).toBeGreaterThanOrEqual(2);
        expect(question.options[question.answer]).toBeDefined();
        expect(new Set(question.options).size).toBe(question.options.length);
      }
      await as('get', '/api/review/quiz?count=999').expect(400);
    });
  });

  it('mỗi người dùng chỉ thấy dữ liệu của mình, người thường không vào được phần admin', async () => {
    const { signSession } = await import('./auth/session');
    const other = signSession({ sub: 'nguoi-khac', username: 'khac', role: 'user' });
    const theirs = await http().get('/api/review/words').set('Authorization', `Bearer ${other}`).expect(200);
    expect(theirs.body).toEqual([]);
    const mine = await as('get', '/api/review/words');
    expect(mine.body.length).toBeGreaterThan(0);
    await http()
      .post('/api/admin/content/packs')
      .set('Authorization', `Bearer ${other}`)
      .send({})
      .expect(403);
  });
});
