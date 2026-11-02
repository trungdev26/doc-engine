import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { apiUrl } from './api-config';
import { AuthService } from './auth.service';

/** Các đường dẫn mà 401 là kết quả bình thường (sai mật khẩu, chưa đăng nhập) chứ không phải hết phiên. */
const EXEMPT = [apiUrl('/api/auth/login'), apiUrl('/api/auth/me'), apiUrl('/api/auth/logout')];

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !EXEMPT.some(path => request.url.startsWith(path))) {
        auth.expire();
      }
      return throwError(() => error);
    }),
  );
};
