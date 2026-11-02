import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../environments/environment';

/** Ghép gốc API (từ environment, rỗng khi dev) vào đường dẫn tương đối. */
export const apiUrl = (path: string): string =>
  environment.apiBase && path.startsWith('/') ? environment.apiBase + path : path;

/** Gửi cookie đăng nhập kèm request sang API khi web và API khác domain. */
export const credentialsInterceptor: HttpInterceptorFn = (request, next) =>
  next(request.url.startsWith(apiUrl('/api')) ? request.clone({ withCredentials: true }) : request);
