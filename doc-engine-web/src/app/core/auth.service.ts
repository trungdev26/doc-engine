import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';

export interface AuthUser {
  username: string;
  role: 'admin' | 'user';
}

/**
 * Trạng thái đăng nhập. JWT nằm trong cookie httpOnly do máy chủ đặt nên mã JavaScript không đọc
 * được token; ở đây chỉ giữ thông tin hiển thị (tên và quyền).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly state = signal<AuthUser | null>(null);
  private readonly ready = signal(false);

  readonly user = this.state.asReadonly();
  /** false khi đang hỏi máy chủ xem đã đăng nhập chưa; giao diện chờ để không nháy màn hình đăng nhập. */
  readonly checked = this.ready.asReadonly();
  readonly isAdmin = computed(() => this.state()?.role === 'admin');

  constructor(private readonly http: HttpClient) {}

  private restoring?: Observable<void>;

  /** Hỏi máy chủ xem đã đăng nhập chưa. Gọi nhiều lần vẫn chỉ gửi một request. */
  restore(): Observable<void> {
    this.restoring ??= this.http.get<AuthUser>('/api/auth/me').pipe(
      tap(user => this.state.set(user)),
      map(() => undefined),
      catchError(() => {
        this.state.set(null);
        return of(undefined);
      }),
      tap(() => this.ready.set(true)),
      shareReplay(1),
    );
    return this.restoring;
  }

  login(username: string, password: string): Observable<AuthUser> {
    return this.http
      .post<AuthUser>('/api/auth/login', { username, password })
      .pipe(tap(user => this.state.set({ username: user.username, role: user.role })));
  }

  logout(): Observable<void> {
    return this.http.post<void>('/api/auth/logout', {}).pipe(
      catchError(() => of(undefined)),
      tap(() => this.state.set(null)),
    );
  }

  /** Máy chủ trả 401 giữa chừng (hết hạn, bị thu hồi) thì quay về màn hình đăng nhập. */
  expire(): void {
    this.state.set(null);
    this.ready.set(true);
  }

  describe(error: HttpErrorResponse): string {
    switch (error.status) {
      case 0:
        return 'Không kết nối được máy chủ. Bạn thử lại sau nhé.';
      case 401:
        return 'Sai tên đăng nhập hoặc mật khẩu.';
      case 429:
        return error.error?.message ?? 'Bạn thử quá nhiều lần. Hãy đợi một lát rồi thử lại.';
      case 400:
        return 'Hãy nhập đủ tên đăng nhập và mật khẩu.';
      default:
        return 'Có lỗi xảy ra khi đăng nhập. Bạn thử lại sau nhé.';
    }
  }
}
