import { ChiSoMau, DanhGiaChiSo, TrangThaiKy } from './chi-so.model';

const TEN_CHI_SO = [
  'Glucose',
  'Cholesterol toàn phần',
  'HDL-Cholesterol',
  'LDL-Cholesterol',
  'Triglyceride',
  'Ure',
  'Creatinine',
  'AST (GOT)',
  'ALT (GPT)',
  'Acid Uric',
  'Bilirubin toàn phần',
  'Protein toàn phần',
  'Albumin',
  'Hemoglobin',
  'Hematocrit',
  'Bạch cầu (WBC)',
  'Hồng cầu (RBC)',
  'Tiểu cầu (PLT)',
  'Natri (Na+)',
  'Kali (K+)',
  'Clo (Cl-)',
  'Canxi',
  'CRP',
  'HbA1c',
  'TSH',
  'FT4',
  'FT3',
];

const DON_VI = ['mg/dL', 'g/L', 'U/L', 'mmol/L', '10^9/L', '%', 'ng/mL', 'mIU/L'];

const DANH_GIA: DanhGiaChiSo[] = ['binh_thuong', 'cao', 'thap'];
const TRANG_THAI: TrangThaiKy[] = ['cho_ky', 'da_ky', 'huy'];

export function generateMockData(count: number): ChiSoMau[] {
  const result: ChiSoMau[] = [];
  for (let i = 0; i < count; i++) {
    const tenChiSo = TEN_CHI_SO[i % TEN_CHI_SO.length];
    const donVi = DON_VI[i % DON_VI.length];
    const min = +(Math.random() * 10).toFixed(1);
    const max = +(min + Math.random() * 20).toFixed(1);
    result.push({
      id: i + 1,
      tenChiSo: `${tenChiSo} #${i + 1}`,
      giaTri: +(Math.random() * 100).toFixed(1),
      donVi,
      khoangThamChieu: `${min} - ${max}`,
      danhGia: DANH_GIA[i % DANH_GIA.length],
      trangThai: TRANG_THAI[i % TRANG_THAI.length],
    });
  }
  return result;
}
