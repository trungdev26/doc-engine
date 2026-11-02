# Authenticate Shared Global

Case này xử lý một bài toán Angular production rất hay gặp: thông tin đăng nhập, user hiện tại, quyền, tenant/branch và token cần được nhiều nơi dùng chung, nhưng nếu gom tất cả vào một `AuthService` global thì rất dễ phình to, circular dependency, stale state và khó test.

Tên bài toán có thể gọi gọn là **Global Auth/Session State**. Nếu nói theo ngôn ngữ thiết kế: đây là bài toán **chia sẻ authentication context ở tầng global một cách có kiểm soát**.

---

## 1. Requirement thô

Product thường nói rất đơn giản:

```text
Sau khi user đăng nhập, toàn app phải biết user là ai, có quyền gì.

Menu phải ẩn/hiện theo quyền.
Guard phải chặn route không đủ quyền.
Interceptor phải gắn token vào request.
Header phải hiển thị tên user.
Khi đổi chi nhánh/tenant, dữ liệu liên quan phải refresh.
Khi logout, mọi state nhạy cảm phải clear.
```

Nghe như chỉ cần một `AuthService`, nhưng nếu thiết kế vội, service này sẽ nhanh chóng ôm quá nhiều việc.

---

## 2. Bài toán thật sự là gì?

Đây không chỉ là bài toán login.

Nó gồm nhiều mảnh khác nhau:

```text
Auth API:
- login
- logout
- refresh token
- load profile

Session state:
- current user
- token/session
- tenant/branch hiện tại
- permissions
- trạng thái authenticated/anonymous/loading

Consumers:
- route guard
- HTTP interceptor
- menu/sidebar
- permission directive
- header/avatar
- feature facade
- cache invalidation khi context đổi
```

Điểm quan trọng:

```text
Auth là use case.
Session là shared state.
Permission là derived capability.
Interceptor/Guard/Menu là consumer.
```

Không nên để tất cả phụ thuộc hai chiều vào nhau.

---

## 3. Naive solution và vấn đề

Cách dễ viết lúc đầu:

```ts
@Injectable({ providedIn: 'root' })
export class AuthService {
  currentUser$ = new BehaviorSubject<User | null>(null);
  permissions$ = new BehaviorSubject<string[]>([]);

  login(input: LoginInput): Observable<LoginResult> {
    return this.http.post<LoginResult>('/api/login', input).pipe(
      tap(result => {
        localStorage.setItem('token', result.token);
        this.currentUser$.next(result.user);
        this.permissions$.next(result.permissions);
      })
    );
  }

  hasPermission(permission: string): boolean {
    return this.permissions$.value.includes(permission);
  }

  logout(): void {
    localStorage.removeItem('token');
    this.currentUser$.next(null);
    this.permissions$.next([]);
  }
}
```

Ban đầu chạy được, nhưng lớn lên sẽ gặp vấn đề:

```text
- AuthService vừa gọi API, vừa giữ state, vừa check permission, vừa quản lý storage.
- Interceptor inject AuthService, AuthService lại dùng HttpClient, dễ sinh dependency vòng.
- Guard cần auth state nhưng lại trigger API lung tung.
- Permission check lúc sync, lúc async, logic bị phân tán.
- Đổi tenant/branch nhưng cache feature cũ không được clear.
- Logout chỉ xóa token, nhưng dữ liệu nhạy cảm trong các service khác vẫn còn.
- Unit test khó vì service quá nhiều trách nhiệm.
```

---

## 4. Design direction

Tách theo trách nhiệm:

```text
AuthApi
-> chỉ gọi API auth/session.

TokenStorage
-> chỉ đọc/ghi token.

SessionState
-> source of truth cho auth context trong frontend.

AuthFacade
-> orchestration use case login/logout/bootstrap/refresh.

PermissionService
-> derive quyền từ SessionState.

Guard/Interceptor/Menu
-> consumer của SessionState/PermissionService/TokenStorage.
```

Mô hình:

```text
Login Page
  -> AuthFacade.login()
     -> AuthApi.login()
     -> TokenStorage.set()
     -> SessionState.setSession()

Guard/Menu/Header
  -> đọc SessionState / PermissionService

HTTP Interceptor
  -> đọc TokenStorage
```

Rule thiết kế:

```text
State global phải có owner rõ.
Use case gọi API không nên là nơi mọi consumer phụ thuộc trực tiếp.
Interceptor nên đọc token tối thiểu, tránh kéo cả AuthService lớn vào dependency graph.
```

---

## 5. Model session

Ví dụ state global:

```ts
export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';

export interface AuthUser {
  id: string;
  displayName: string;
  email: string;
}

export interface AppSession {
  status: AuthStatus;
  user: AuthUser | null;
  tenantId: string | null;
  branchId: string | null;
  permissions: string[];
}

export const initialSession: AppSession = {
  status: 'unknown',
  user: null,
  tenantId: null,
  branchId: null,
  permissions: []
};
```

`unknown` rất quan trọng khi app mới mở:

```text
unknown:
-> chưa biết user có đăng nhập không, có thể đang bootstrap từ token.

anonymous:
-> chắc chắn chưa đăng nhập.

authenticated:
-> đã có session hợp lệ.
```

Nếu chỉ dùng `user === null`, guard dễ redirect sai trước khi bootstrap xong.

---

## 6. SessionState là source of truth

```ts
@Injectable({ providedIn: 'root' })
export class SessionState {
  private readonly sessionSubject = new BehaviorSubject<AppSession>(initialSession);

  readonly session$ = this.sessionSubject.asObservable();

  readonly status$ = this.session$.pipe(
    map(session => session.status),
    distinctUntilChanged()
  );

  readonly user$ = this.session$.pipe(
    map(session => session.user),
    distinctUntilChanged()
  );

  readonly branchId$ = this.session$.pipe(
    map(session => session.branchId),
    distinctUntilChanged()
  );

  readonly permissions$ = this.session$.pipe(
    map(session => session.permissions),
    distinctUntilChanged((a, b) => a.join('|') === b.join('|'))
  );

  get snapshot(): AppSession {
    return this.sessionSubject.value;
  }

  setAuthenticated(session: Omit<AppSession, 'status'>): void {
    this.sessionSubject.next({
      ...session,
      status: 'authenticated'
    });
  }

  setAnonymous(): void {
    this.sessionSubject.next({
      ...initialSession,
      status: 'anonymous'
    });
  }

  patchContext(context: Partial<Pick<AppSession, 'tenantId' | 'branchId' | 'permissions'>>): void {
    this.sessionSubject.next({
      ...this.sessionSubject.value,
      ...context
    });
  }
}
```

Không expose `BehaviorSubject` ra ngoài:

```text
Component/service khác không được gọi .next() tùy ý.
State chỉ đổi qua method có nghĩa nghiệp vụ.
```

---

## 7. TokenStorage tách riêng

```ts
@Injectable({ providedIn: 'root' })
export class TokenStorage {
  private readonly accessTokenKey = 'access_token';

  getAccessToken(): string | null {
    return localStorage.getItem(this.accessTokenKey);
  }

  setAccessToken(token: string): void {
    localStorage.setItem(this.accessTokenKey, token);
  }

  clear(): void {
    localStorage.removeItem(this.accessTokenKey);
  }
}
```

Lợi ích:

```text
- Interceptor chỉ cần TokenStorage.
- Không kéo AuthFacade/AuthService vào HTTP pipeline.
- Dễ đổi localStorage sang cookie/sessionStorage/memory storage.
- Dễ mock trong test.
```

Security note:

```text
Token lưu ở đâu phụ thuộc security policy của dự án.
Nếu dùng HttpOnly cookie thì interceptor có thể không cần gắn Authorization header.
Không hard-code một lựa chọn cho mọi hệ thống.
```

---

## 8. AuthApi chỉ gọi API

```ts
@Injectable({ providedIn: 'root' })
export class AuthApi {
  constructor(private readonly http: HttpClient) {}

  login(input: LoginInput): Observable<LoginResult> {
    return this.http.post<LoginResult>('/api/auth/login', input);
  }

  me(): Observable<SessionDto> {
    return this.http.get<SessionDto>('/api/auth/me');
  }

  logout(): Observable<void> {
    return this.http.post<void>('/api/auth/logout', {});
  }
}
```

`AuthApi` không tự set state, không biết menu, không biết guard.

---

## 9. AuthFacade orchestration

```ts
@Injectable({ providedIn: 'root' })
export class AuthFacade {
  readonly session$ = this.sessionState.session$;
  readonly status$ = this.sessionState.status$;

  constructor(
    private readonly authApi: AuthApi,
    private readonly tokenStorage: TokenStorage,
    private readonly sessionState: SessionState
  ) {}

  bootstrap(): Observable<AppSession> {
    const token = this.tokenStorage.getAccessToken();

    if (!token) {
      this.sessionState.setAnonymous();
      return of(this.sessionState.snapshot);
    }

    return this.authApi.me().pipe(
      tap(dto => this.sessionState.setAuthenticated(toAppSession(dto))),
      map(() => this.sessionState.snapshot),
      catchError(() => {
        this.tokenStorage.clear();
        this.sessionState.setAnonymous();
        return of(this.sessionState.snapshot);
      })
    );
  }

  login(input: LoginInput): Observable<void> {
    return this.authApi.login(input).pipe(
      tap(result => {
        this.tokenStorage.setAccessToken(result.accessToken);
        this.sessionState.setAuthenticated(toAppSession(result.session));
      }),
      map(() => void 0)
    );
  }

  logout(): Observable<void> {
    return this.authApi.logout().pipe(
      catchError(() => of(void 0)),
      tap(() => {
        this.tokenStorage.clear();
        this.sessionState.setAnonymous();
      })
    );
  }
}
```

Facade là nơi orchestration:

```text
Gọi API.
Ghi token.
Cập nhật session.
Xử lý fallback khi bootstrap fail.
```

Nhưng facade không nên chứa toàn bộ permission/menu/cache của app.

---

## 10. PermissionService derive từ session

```ts
@Injectable({ providedIn: 'root' })
export class PermissionService {
  constructor(private readonly sessionState: SessionState) {}

  has$(permission: string): Observable<boolean> {
    return this.sessionState.permissions$.pipe(
      map(permissions => permissions.includes(permission)),
      distinctUntilChanged()
    );
  }

  hasAny$(permissionsToCheck: string[]): Observable<boolean> {
    return this.sessionState.permissions$.pipe(
      map(permissions => permissionsToCheck.some(permission => permissions.includes(permission))),
      distinctUntilChanged()
    );
  }

  hasSnapshot(permission: string): boolean {
    return this.sessionState.snapshot.permissions.includes(permission);
  }
}
```

Lưu ý:

```text
Frontend permission chỉ phục vụ UX.
Backend vẫn phải check quyền thật.
```

---

## 11. Guard không nên tự login hoặc gọi API lung tung

```ts
export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  const sessionState = inject(SessionState);

  return sessionState.status$.pipe(
    filter(status => status !== 'unknown'),
    take(1),
    map(status => {
      if (status === 'authenticated') {
        return true;
      }

      return router.createUrlTree(['/login']);
    })
  );
};
```

Permission guard:

```ts
export const permissionGuard = (permission: string): CanActivateFn => {
  return () => {
    const router = inject(Router);
    const permissionService = inject(PermissionService);

    return permissionService.has$(permission).pipe(
      take(1),
      map(canAccess => canAccess ? true : router.createUrlTree(['/403']))
    );
  };
};
```

Điểm quan trọng:

```text
Guard đọc state đã bootstrap.
Bootstrap nên được xử lý ở app startup hoặc shell, không để mỗi guard tự gọi /me.
```

---

## 12. Interceptor đọc token tối thiểu

```ts
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenStorage = inject(TokenStorage);
  const token = tokenStorage.getAccessToken();

  if (!token) {
    return next(req);
  }

  return next(
    req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    })
  );
};
```

Tránh để interceptor phụ thuộc vào `AuthFacade` lớn:

```text
Interceptor nằm trong HTTP pipeline.
AuthFacade lại dùng AuthApi.
AuthApi dùng HttpClient.
Nếu kéo facade vào interceptor, dependency graph dễ rối và khó debug.
```

Nếu cần refresh token, nên thiết kế riêng một flow rõ ràng, có lock chống nhiều request refresh song song.

---

## 13. Menu/Header consume session

Header:

```ts
readonly user$ = this.sessionState.user$;
```

Menu:

```ts
readonly menuItems$ = this.sessionState.permissions$.pipe(
  map(permissions => buildMenuByPermissions(permissions))
);
```

Không nên để component menu tự gọi API profile hoặc tự đọc localStorage.

```text
Menu là projection của session/permission state.
Menu không phải owner của auth state.
```

---

## 14. Khi đổi tenant/branch

Đây là phần rất dễ bị thiếu.

Khi context đổi:

```text
branchId A -> branchId B
```

Những thứ có thể stale:

```text
- menu/permission theo chi nhánh
- danh mục theo chi nhánh
- dashboard
- list/detail đang cache
- selected entity hiện tại
- websocket subscription
- draft form đang mở
```

Ví dụ service theo dõi context:

```ts
@Injectable({ providedIn: 'root' })
export class AppContextEffects {
  constructor(
    sessionState: SessionState,
    catalogState: CatalogState,
    dashboardState: DashboardState,
    featureCacheRegistry: FeatureCacheRegistry
  ) {
    sessionState.branchId$
      .pipe(
        pairwise(),
        filter(([previous, current]) => !!previous && previous !== current)
      )
      .subscribe(() => {
        catalogState.clear();
        dashboardState.refresh();
        featureCacheRegistry.clearAll();
      });
  }
}
```

Production có thể dùng effect/facade khác tùy architecture, nhưng phải có chiến lược rõ:

```text
Context đổi thì cache nào stale?
State nào cần clear?
Route hiện tại còn hợp lệ không?
```

---

## 15. Logout phải clear nhiều hơn token

Logout không chỉ là:

```ts
localStorage.removeItem('token');
```

Checklist logout:

```text
[ ] clear token/session storage
[ ] set session anonymous
[ ] clear feature cache chứa dữ liệu nhạy cảm
[ ] close/reconnect websocket nếu cần
[ ] clear pending draft nếu thuộc user cũ
[ ] redirect về login hoặc public page
[ ] hủy timer/polling gắn với session cũ nếu có
```

Nếu dùng root services giữ cache, logout càng phải có cơ chế clear tập trung.

---

## 16. Bootstrap app

App mới mở thường cần:

```text
1. Đọc token.
2. Nếu không có token -> anonymous.
3. Nếu có token -> gọi /me.
4. Nếu /me OK -> authenticated.
5. Nếu /me fail -> clear token, anonymous.
6. Sau khi biết status, guard/menu mới render đúng.
```

Một hướng đơn giản là shell component gọi bootstrap:

```ts
ngOnInit(): void {
  this.authFacade.bootstrap()
    .pipe(take(1))
    .subscribe();
}
```

Nếu dùng `APP_INITIALIZER`, cân nhắc kỹ UX:

```text
APP_INITIALIZER chờ bootstrap xong mới render app.
Shell bootstrap cho phép hiển thị loading/skeleton rõ hơn.
```

Điểm chính: phải có trạng thái `unknown/loading`, không redirect vội khi chưa bootstrap.

---

## 17. Circular dependency hay gặp

Code có mùi:

```ts
@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(private permissionService: PermissionService) {}
}

@Injectable({ providedIn: 'root' })
export class PermissionService {
  constructor(private authService: AuthService) {}
}
```

Refactor:

```text
AuthFacade -> phụ thuộc AuthApi, TokenStorage, SessionState.
PermissionService -> phụ thuộc SessionState.
Interceptor -> phụ thuộc TokenStorage.
Guard -> phụ thuộc SessionState/PermissionService.
```

Khi nhiều service cần biết user hiện tại, đừng inject vòng nhau. Tách state chung ra.

---

## 18. Nên global cái gì?

Nên global:

```text
- current session
- token/session storage adapter
- current user
- permissions
- tenant/branch context
- connection manager nếu dùng chung toàn app
```

Không nên global tùy tiện:

```text
- filter của một màn hình
- selected row của một table
- draft của wizard
- modal open/close
- cache chỉ phục vụ một feature và cần reset khi rời route
```

Rule:

```text
Global auth context là global.
Feature UI state không tự nhiên trở thành global chỉ vì nó cần user hiện tại.
```

---

## 19. Test cases nên có

```text
[ ] Không có token -> bootstrap set anonymous.
[ ] Có token và /me OK -> bootstrap set authenticated.
[ ] Có token nhưng /me fail -> clear token và set anonymous.
[ ] Login success -> lưu token và set session.
[ ] Logout success/fail -> vẫn clear local session.
[ ] Guard chờ status khác unknown rồi mới quyết định.
[ ] PermissionService trả đúng quyền khi permissions đổi.
[ ] Interceptor gắn Authorization khi có token.
[ ] Interceptor không gắn Authorization khi không có token.
[ ] Đổi branch/tenant -> clear cache liên quan.
```

---

## 20. Production risks

```text
[ ] AuthService ôm quá nhiều trách nhiệm
    -> tách AuthApi, SessionState, TokenStorage, AuthFacade, PermissionService.

[ ] Guard redirect sai trước khi bootstrap xong
    -> dùng status unknown/authenticated/anonymous.

[ ] Interceptor kéo AuthFacade vào HTTP pipeline
    -> interceptor đọc TokenStorage tối thiểu.

[ ] Permission chỉ check ở frontend
    -> backend vẫn phải enforce quyền.

[ ] Đổi tenant/branch nhưng cache không clear
    -> có context invalidation strategy.

[ ] Logout chỉ xóa token
    -> clear cả session state, feature cache, realtime/polling nếu cần.

[ ] Circular dependency giữa Auth/Permission/Interceptor
    -> tách shared SessionState.

[ ] Expose BehaviorSubject ra ngoài
    -> chỉ expose Observable và method update rõ nghĩa.
```

---

## 21. Tư duy chốt

```text
Authentication không chỉ là login API.

Trong Angular production, auth là một global context:
- ai đang dùng app
- đang ở tenant/branch nào
- có quyền gì
- request cần credential gì
- dữ liệu nào phải stale khi context đổi
```

Middle/Senior không nhét tất cả vào một `AuthService` khổng lồ. Họ tách:

```text
API để gọi backend.
Storage để giữ token.
State để làm source of truth.
Facade để điều phối use case.
Permission để derive capability.
Guard/Interceptor/Menu để consume state.
```

Chốt lại:

> Authenticate Shared Global nên được hiểu là thiết kế **Global Auth/Session State**: state dùng chung toàn app, nhưng trách nhiệm phải tách rõ để tránh service phình to, dependency vòng, stale cache và logout không sạch.
