import { Recorder } from './recorder';

/** MediaRecorder giả: như thật, dừng xong mới bắn dataavailable rồi stop một lúc sau. */
class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(readonly stream: MediaStream) {
    FakeMediaRecorder.instances.push(this);
  }

  start(): void {
    this.state = 'recording';
  }

  stop(): void {
    this.state = 'inactive';
    setTimeout(() => {
      this.ondataavailable?.({ data: new Blob(['tieng-noi']) });
      this.onstop?.();
    });
  }
}

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 5));

describe('Recorder', () => {
  let original: unknown;
  let tracks: { stop: jasmine.Spy }[];
  let getUserMedia: jasmine.Spy;
  let release: (() => void) | null;
  let created: jasmine.Spy;

  const makeStream = () => {
    const track = { stop: jasmine.createSpy('track.stop') };
    tracks.push(track);
    return { getTracks: () => [track] } as unknown as MediaStream;
  };

  beforeEach(() => {
    original = (window as any).MediaRecorder;
    (window as any).MediaRecorder = FakeMediaRecorder;
    FakeMediaRecorder.instances = [];
    tracks = [];
    release = null;
    getUserMedia = jasmine
      .createSpy('getUserMedia')
      .and.callFake(() => Promise.resolve(makeStream()));
    spyOnProperty(navigator, 'mediaDevices', 'get').and.returnValue({
      getUserMedia,
    } as unknown as MediaDevices);
    created = spyOn(URL, 'createObjectURL').and.returnValue('blob:ban-ghi');
    spyOn(URL, 'revokeObjectURL');
  });

  afterEach(() => {
    (window as any).MediaRecorder = original;
  });

  it('ghi rồi dừng thì có bản nghe lại và micro được tắt', async () => {
    const recorder = new Recorder();
    expect(recorder.state).toBe('idle');

    await recorder.start();
    expect(recorder.state).toBe('recording');

    recorder.stop();
    await tick();
    expect(recorder.state).toBe('recorded');
    expect(recorder.url).toBe('blob:ban-ghi');
    expect(tracks[0].stop).toHaveBeenCalled();
  });

  it('bỏ bản ghi khi đang ghi thì sự kiện dừng muộn không dựng lại bản cũ', async () => {
    const recorder = new Recorder();
    await recorder.start();

    recorder.discard();
    await tick();

    expect(recorder.state).toBe('idle');
    expect(recorder.url).toBeNull();
    expect(created).not.toHaveBeenCalled();
    expect(tracks[0].stop).toHaveBeenCalled();
  });

  it('bỏ bản đã ghi thì thu hồi bộ nhớ của bản nghe', async () => {
    const recorder = new Recorder();
    await recorder.start();
    recorder.stop();
    await tick();

    recorder.discard();
    expect(recorder.url).toBeNull();
    expect(recorder.state).toBe('idle');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:ban-ghi');
  });

  it('bấm hai lần khi đang chờ cấp quyền chỉ mở một luồng micro', async () => {
    getUserMedia.and.callFake(
      () =>
        new Promise<MediaStream>(resolve => {
          release = () => resolve(makeStream());
        }),
    );
    const recorder = new Recorder();
    const first = recorder.start();
    const second = recorder.start();
    release!();
    await Promise.all([first, second]);

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(FakeMediaRecorder.instances.length).toBe(1);
  });

  it('rời trang lúc hộp xin quyền đang mở thì tắt micro ngay khi được cấp', async () => {
    getUserMedia.and.callFake(
      () =>
        new Promise<MediaStream>(resolve => {
          release = () => resolve(makeStream());
        }),
    );
    const recorder = new Recorder();
    const pending = recorder.start();
    recorder.dispose();
    release!();
    await pending;

    expect(recorder.state).not.toBe('recording');
    expect(FakeMediaRecorder.instances.length).toBe(0);
    expect(tracks[0].stop).toHaveBeenCalled();
  });

  it('bị từ chối quyền thì báo denied và cho thử lại', async () => {
    getUserMedia.and.returnValue(Promise.reject(new Error('NotAllowedError')));
    const recorder = new Recorder();
    await recorder.start();
    expect(recorder.state).toBe('denied');

    getUserMedia.and.callFake(() => Promise.resolve(makeStream()));
    await recorder.start();
    expect(recorder.state).toBe('recording');
  });

  it('dừng quá nhanh không có dữ liệu thì không tạo bản nghe rỗng', async () => {
    const recorder = new Recorder();
    await recorder.start();
    const media = FakeMediaRecorder.instances[0];
    media.stop = () => {
      media.state = 'inactive';
      setTimeout(() => media.onstop?.());
    };
    recorder.stop();
    await tick();

    expect(recorder.state).toBe('idle');
    expect(recorder.url).toBeNull();
  });

  it('báo unsupported khi trình duyệt không có MediaRecorder', () => {
    (window as any).MediaRecorder = undefined;
    expect(new Recorder().state).toBe('unsupported');
  });
});
