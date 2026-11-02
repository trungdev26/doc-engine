export type DanhGiaChiSo = 'binh_thuong' | 'cao' | 'thap';
export type TrangThaiKy = 'cho_ky' | 'da_ky' | 'huy';

export interface ChiSoMau {
  id: number;
  tenChiSo: string;
  giaTri: number;
  donVi: string;
  khoangThamChieu: string;
  danhGia: DanhGiaChiSo;
  trangThai: TrangThaiKy;
}
