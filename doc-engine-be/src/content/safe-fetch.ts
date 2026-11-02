import { lookup as dnsLookup } from 'dns';
import { LookupAddress } from 'dns';
import * as http from 'http';
import * as https from 'https';
import { isIP } from 'net';

const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 10_000;

/** true nếu địa chỉ IP thuộc mạng công cộng. Chặn loopback, mạng nội bộ, link-local và multicast. */
export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) {
      return isPublicAddress(mapped[1]);
    }
    return !(
      lower === '::' ||
      lower === '::1' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      /^fe[89ab]/.test(lower) ||
      lower.startsWith('ff')
    );
  }
  return false;
}

/**
 * Tải một tệp văn bản qua http(s) một cách an toàn cho máy chủ: chỉ đến địa chỉ công cộng
 * (kiểm tra ngay lúc kết nối nên không bị đánh lừa bằng DNS), không theo chuyển hướng, có giới hạn
 * thời gian và dung lượng.
 */
export function fetchPublicText(rawUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return reject(new Error('Link không hợp lệ.'));
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return reject(new Error('Chỉ hỗ trợ link http hoặc https.'));
    }
    if (url.username || url.password) {
      return reject(new Error('Link không được chứa tên đăng nhập.'));
    }

    const client = url.protocol === 'https:' ? https : http;
    const request = client.get(
      url,
      {
        timeout: TIMEOUT_MS,
        headers: { 'user-agent': 'dev-internals-importer', accept: 'text/plain, */*' },
        lookup: (hostname, options, callback) => {
          dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
            if (error) {
              return callback(error, '', 4);
            }
            const list = addresses as LookupAddress[];
            const allowed = list.find(item => isPublicAddress(item.address));
            if (!allowed || list.some(item => !isPublicAddress(item.address))) {
              return callback(new Error('Địa chỉ này không được phép truy cập.') as NodeJS.ErrnoException, '', 4);
            }
            if ((options as { all?: boolean }).all) {
              return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, [allowed]);
            }
            callback(null, allowed.address, allowed.family);
          });
        },
      },
      response => {
        const status = response.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          response.resume();
          return reject(new Error(`Không tải được tệp (mã ${status}).`));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            request.destroy(new Error('Tệp quá lớn (tối đa 1 MB).'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        response.on('error', reject);
      },
    );
    request.on('timeout', () => request.destroy(new Error('Hết thời gian chờ khi tải tệp.')));
    request.on('error', reject);
  });
}
