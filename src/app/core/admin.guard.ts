import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Chỉ cho vào trang quản trị khi đã đăng nhập bằng tài khoản admin. Chưa đăng nhập thì chuyển sang
 * /login và nhớ đường dẫn đang định vào, để đăng nhập xong quay lại đúng trang đó.
 */
export const adminGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.checked()) {
    await firstValueFrom(auth.restore());
  }
  if (auth.isAdmin()) {
    return true;
  }
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
