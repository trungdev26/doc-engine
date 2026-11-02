import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Chặn trang cần dữ liệu cá nhân (ôn tập, vườn từ) khi chưa đăng nhập: chuyển sang /login và nhớ
 * đường dẫn đang định vào, để đăng nhập xong quay lại đúng trang đó.
 */
export const loginGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.checked()) {
    await firstValueFrom(auth.restore());
  }
  return auth.user()
    ? true
    : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
