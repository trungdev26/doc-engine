export type RecorderState = 'idle' | 'recording' | 'recorded' | 'denied' | 'unsupported';

/**
 * Ghi âm bằng micro của trình duyệt và giữ bản ghi gần nhất để nghe lại. Bản ghi chỉ nằm trong
 * trình duyệt, không gửi đi đâu. Gọi `dispose()` khi rời trang để tắt micro và giải phóng bộ nhớ.
 */
export class Recorder {
  state: RecorderState = Recorder.supported() ? 'idle' : 'unsupported';
  url: string | null = null;

  /**
   * @param onChange gọi mỗi khi trạng thái đổi ở nơi Angular không tự thấy (sự kiện dừng của
   *   MediaRecorder chạy ngoài vùng theo dõi), để giao diện cập nhật ngay.
   */
  constructor(private readonly onChange: () => void = () => undefined) {}

  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  /** Đang chờ người dùng trả lời hộp xin quyền micro; chặn bấm hai lần mở hai luồng. */
  private starting = false;
  private disposed = false;

  static supported(): boolean {
    return !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
  }

  async start(): Promise<void> {
    if (
      this.state === 'unsupported' ||
      this.state === 'recording' ||
      this.starting ||
      this.disposed
    ) {
      return;
    }
    this.discard();
    this.starting = true;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      this.starting = false;
      this.state = 'denied';
      return;
    }
    this.starting = false;
    if (this.disposed) {
      // Người dùng đã rời trang lúc hộp xin quyền đang mở: tắt micro ngay thay vì để nó chạy ngầm.
      stream.getTracks().forEach(track => track.stop());
      return;
    }

    this.stream = stream;
    const recorder = new MediaRecorder(stream);
    this.chunks = [];
    recorder.ondataavailable = event => {
      if (event.data.size) {
        this.chunks.push(event.data);
      }
    };
    recorder.onstop = () => {
      this.releaseMic();
      if (!this.chunks.length) {
        // Bấm dừng quá nhanh nên không có dữ liệu: coi như chưa ghi, không tạo bản nghe rỗng.
        this.state = 'idle';
        this.onChange();
        return;
      }
      this.url = URL.createObjectURL(
        new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' }),
      );
      this.state = 'recorded';
      this.onChange();
    };
    this.recorder = recorder;
    recorder.start();
    this.state = 'recording';
  }

  stop(): void {
    if (this.recorder?.state === 'recording') {
      this.recorder.stop();
    }
  }

  /** Bỏ bản ghi hiện tại và quay về trạng thái sẵn sàng. Không để sự kiện dừng muộn tạo lại bản ghi cũ. */
  discard(): void {
    const recorder = this.recorder;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state === 'recording') {
        recorder.stop();
      }
      this.recorder = null;
    }
    this.releaseMic();
    this.chunks = [];
    if (this.url) {
      URL.revokeObjectURL(this.url);
      this.url = null;
    }
    if (this.state === 'recorded' || this.state === 'recording') {
      this.state = Recorder.supported() ? 'idle' : 'unsupported';
    }
  }

  dispose(): void {
    this.disposed = true;
    this.discard();
  }

  private releaseMic(): void {
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
  }
}
