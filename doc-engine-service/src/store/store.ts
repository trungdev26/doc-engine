import { StoreData } from './state';

/**
 * Nơi lưu trạng thái học theo từng người dùng. Các service chỉ biết lớp trừu tượng này nên đổi từ
 * file JSON sang Postgres (Neon) mà không phải sửa nghiệp vụ.
 *
 * `update` chạy `mutate` trên một bản sao rồi mới ghi. Nếu `mutate` ném lỗi thì không có gì được ghi.
 */
export abstract class Store {
  abstract read(userId: string): Promise<StoreData>;
  abstract update<T>(userId: string, mutate: (data: StoreData) => T): Promise<T>;
}
