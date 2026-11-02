# Angular Router từ cơ bản đến nâng cao

Tài liệu này đi từ nền tảng Angular Router đến các quyết định thiết kế thường gặp trong dự án production. Mục tiêu không chỉ là biết viết route, mà là hiểu cách Router điều hướng, tải code, bảo vệ màn hình, chuẩn bị dữ liệu, giữ trạng thái URL và tránh các lỗi kiến trúc khó sửa về sau.

Các ví dụ dùng Angular 17, ưu tiên functional guard/resolver và lazy loading. Với dự án dùng module truyền thống, các nguyên tắc vẫn giống nhau.

---

## 1. Angular Router giải quyết vấn đề gì?

Single Page Application chỉ tải một trang HTML chính, sau đó JavaScript quyết định component nào được hiển thị theo URL.

```text
/patients
  -> PatientListComponent

/patients/123
  -> PatientDetailComponent

/settings/users
  -> UserManagementComponent
```

Angular Router là lớp điều phối giữa URL, component tree, lifecycle điều hướng, lazy loading, guard, resolver và browser history.

Nói ngắn gọn:

```text
Router = URL -> route config -> component / lazy module -> data / guard / resolver -> outlet
```

Không nên xem Router chỉ là "menu chuyển trang". Trong hệ thống lớn, Router là một phần của kiến trúc application shell, phân quyền, preload, deep link, refresh state và performance.

---

## 2. Route cơ bản

### 2.1. Khai báo route

```ts
import { Routes } from '@angular/router';
import { PatientListComponent } from './patient-list.component';
import { PatientDetailComponent } from './patient-detail.component';

export const routes: Routes = [
  { path: 'patients', component: PatientListComponent },
  { path: 'patients/:id', component: PatientDetailComponent },
  { path: '', redirectTo: 'patients', pathMatch: 'full' },
  { path: '**', redirectTo: 'patients' }
];
```

Ý nghĩa:

```text
path: 'patients'
-> match URL /patients

path: 'patients/:id'
-> match URL /patients/123, id = 123

redirectTo
-> chuyển hướng

path: '**'
-> fallback khi không route nào match
```

### 2.2. Hiển thị component bằng router-outlet

```html
<app-shell>
  <router-outlet></router-outlet>
</app-shell>
```

`router-outlet` là vị trí Angular đặt component tương ứng với route hiện tại.

```text
URL đổi
-> Router tìm route match
-> tạo component
-> đặt component vào router-outlet
```

### 2.3. Điều hướng bằng routerLink

```html
<a routerLink="/patients">Danh sách bệnh nhân</a>
<a [routerLink]="['/patients', patient.id]">Chi tiết</a>
```

Ưu tiên `routerLink` thay vì tự gọi `window.location.href`, vì `routerLink` đi qua Router, giữ SPA navigation và không reload toàn bộ app.

### 2.4. Điều hướng bằng code

```ts
constructor(private router: Router) {}

openDetail(id: string): void {
  this.router.navigate(['/patients', id]);
}
```

Trường hợp cần query params:

```ts
this.router.navigate(['/patients'], {
  queryParams: {
    keyword: 'An',
    status: 'active'
  }
});
```

---

## 3. Path params, query params và fragment

### 3.1. Path params

Path params là phần định danh chính của resource.

```ts
{ path: 'patients/:id', component: PatientDetailComponent }
```

URL:

```text
/patients/123
```

Đọc bằng `ActivatedRoute`:

```ts
constructor(private route: ActivatedRoute) {}

ngOnInit(): void {
  const id = this.route.snapshot.paramMap.get('id');
}
```

Nếu component có thể được reuse khi chỉ đổi param, nên subscribe:

```ts
ngOnInit(): void {
  this.route.paramMap.subscribe(params => {
    const id = params.get('id');
    this.loadPatient(id);
  });
}
```

Ví dụ reuse:

```text
Đang ở /patients/1
Click sang /patients/2
-> Angular có thể reuse cùng PatientDetailComponent instance
-> ngOnInit không chạy lại
-> subscribe paramMap giúp load lại dữ liệu
```

### 3.2. Query params

Query params phù hợp cho state phụ trợ của màn hình:

```text
/patients?keyword=an&page=2&status=active
```

Các giá trị như search keyword, filter, sort, tab, page nên đặt vào query params nếu cần share link, refresh không mất trạng thái hoặc browser back/forward hoạt động đúng.

```ts
this.router.navigate([], {
  relativeTo: this.route,
  queryParams: {
    keyword: this.keyword,
    page: 1
  },
  queryParamsHandling: 'merge'
});
```

`queryParamsHandling: 'merge'` giúp giữ các query param cũ không bị xóa ngoài ý muốn.

### 3.3. Fragment

Fragment là phần sau dấu `#`:

```text
/patient-guide#insurance
```

Dùng cho anchor trong trang, tab nhẹ hoặc scroll đến section.

```html
<a [routerLink]="['/patient-guide']" fragment="insurance">Bảo hiểm</a>
```

---

## 4. ActivatedRoute và Router state

### 4.1. ActivatedRoute là gì?

`ActivatedRoute` là route đang được kích hoạt tại vị trí component hiện tại trong route tree.

Nó cung cấp:

```text
- paramMap
- queryParamMap
- data
- url
- fragment
- parent
- firstChild
- snapshot
```

### 4.2. Snapshot hay Observable?

Dùng `snapshot` khi dữ liệu route chỉ cần đọc một lần lúc component khởi tạo:

```ts
const id = this.route.snapshot.paramMap.get('id');
```

Dùng observable khi cùng component có thể tồn tại nhưng params/query/data thay đổi:

```ts
this.route.queryParamMap.subscribe(params => {
  this.keyword = params.get('keyword') ?? '';
});
```

Rule thực tế:

```text
Màn hình detail /items/:id:
- Nếu có link từ item này sang item khác trong chính detail page -> subscribe paramMap.
- Nếu vào detail rồi rời hẳn sang page khác -> snapshot thường đủ.
```

### 4.3. Route data tĩnh

```ts
{
  path: 'patients',
  component: PatientListComponent,
  data: {
    title: 'Bệnh nhân',
    permission: 'Patient.View'
  }
}
```

Đọc:

```ts
const title = this.route.snapshot.data['title'];
```

Route data phù hợp cho metadata ổn định như title, breadcrumb, permission key, layout mode.

---

## 5. Nested routes và layout

### 5.1. Route cha con

```ts
export const routes: Routes = [
  {
    path: 'patients',
    component: PatientShellComponent,
    children: [
      { path: '', component: PatientListComponent },
      { path: ':id', component: PatientDetailComponent },
      { path: ':id/visits', component: PatientVisitsComponent }
    ]
  }
];
```

`PatientShellComponent` cần có outlet con:

```html
<app-patient-tabs></app-patient-tabs>
<router-outlet></router-outlet>
```

Luồng render:

```text
/patients/123/visits
-> App outlet render PatientShellComponent
-> PatientShellComponent outlet render PatientVisitsComponent
```

### 5.2. Layout route

Một pattern phổ biến:

```ts
export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      { path: 'dashboard', component: DashboardComponent },
      { path: 'patients', loadChildren: () => import('./patients/patient.routes').then(m => m.PATIENT_ROUTES) }
    ]
  },
  {
    path: 'auth',
    component: AuthLayoutComponent,
    children: [
      { path: 'login', component: LoginComponent }
    ]
  }
];
```

Lợi ích:

```text
- Tách layout đăng nhập khỏi layout chính
- Giữ sidebar/header ở route cha
- Feature routes nằm dưới layout tương ứng
- Dễ áp guard theo cụm route
```

### 5.3. Empty path trong children

```ts
{
  path: 'settings',
  component: SettingsShellComponent,
  children: [
    { path: '', redirectTo: 'users', pathMatch: 'full' },
    { path: 'users', component: UserListComponent },
    { path: 'roles', component: RoleListComponent }
  ]
}
```

Luôn thêm `pathMatch: 'full'` khi redirect từ path rỗng, để tránh redirect match quá rộng.

---

## 6. Lazy loading

### 6.1. Vì sao cần lazy loading?

Nếu tất cả feature đều nằm trong bundle đầu tiên, user phải tải cả phần chưa dùng.

```text
Không lazy:
Initial bundle = app + patients + warehouse + reports + settings + admin

Lazy:
Initial bundle = app shell + route hiện tại
Khi vào /reports mới tải reports chunk
```

Lazy loading giúp giảm initial load, đặc biệt với màn hình admin, báo cáo, cấu hình, thư viện UI nặng.

### 6.2. Lazy load routes

Angular 17 có thể lazy load route array:

```ts
export const routes: Routes = [
  {
    path: 'patients',
    loadChildren: () =>
      import('./features/patients/patient.routes').then(m => m.PATIENT_ROUTES)
  }
];
```

File feature:

```ts
export const PATIENT_ROUTES: Routes = [
  { path: '', component: PatientListComponent },
  { path: ':id', component: PatientDetailComponent }
];
```

### 6.3. Lazy load standalone component

```ts
{
  path: 'help',
  loadComponent: () =>
    import('./help/help-page.component').then(m => m.HelpPageComponent)
}
```

Phù hợp với page đơn lẻ, không cần cả module/route tree.

### 6.4. Boundary của lazy loading

Không nên chia lazy quá nhỏ theo mọi component. Chia theo feature hoặc workflow:

```text
Nên:
- /patients
- /warehouse
- /reports
- /settings

Không nên:
- Lazy từng button, từng table nhỏ nếu không có lý do rõ ràng
```

Một lazy boundary tốt thường có:

```text
- Route path rõ nghĩa
- Feature ownership rõ
- Bundle size đáng kể
- Ít shared state trực tiếp với feature khác
- Có thể preload theo nhu cầu
```

---

## 7. Preloading strategy

### 7.1. Preload là gì?

Lazy loading giảm initial bundle, nhưng lần đầu vào feature lazy có thể bị delay tải chunk. Preloading cho phép Angular tải trước lazy chunk sau khi app đã ổn định.

```text
Initial load
-> render màn hình đầu tiên
-> sau đó preload các lazy route theo strategy
```

### 7.2. Preload tất cả lazy routes

```ts
RouterModule.forRoot(routes, {
  preloadingStrategy: PreloadAllModules
})
```

Phù hợp khi app không quá lớn và muốn navigation sau đó nhanh hơn.

### 7.3. Custom preload theo route data

```ts
@Injectable({ providedIn: 'root' })
export class SelectivePreloadingStrategy implements PreloadingStrategy {
  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    return route.data?.['preload'] ? load() : of(null);
  }
}
```

Route:

```ts
{
  path: 'reports',
  loadChildren: () => import('./reports/report.routes').then(m => m.REPORT_ROUTES),
  data: { preload: true }
}
```

Tư duy middle/senior:

```text
Lazy loading là tối ưu initial load.
Preloading là tối ưu navigation sau initial load.
Không bật preload theo cảm tính; đo bundle và hành vi user trước.
```

---

## 8. Guards

### 8.1. Guard dùng để làm gì?

Guard quyết định một navigation có được tiếp tục hay không.

Các loại hay gặp:

```text
CanActivate
-> có được vào route này không?

CanActivateChild
-> có được vào các route con không?

CanMatch
-> route này có được match không, thường dùng với lazy route hoặc permission

CanDeactivate
-> có được rời khỏi route hiện tại không?
```

### 8.2. Functional CanActivate guard

```ts
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) {
    return true;
  }

  return router.createUrlTree(['/auth/login']);
};
```

Route:

```ts
{
  path: 'patients',
  canActivate: [authGuard],
  loadChildren: () => import('./patients/patient.routes').then(m => m.PATIENT_ROUTES)
}
```

Nên return `UrlTree` thay vì gọi `router.navigate()` bên trong guard.

```text
Tốt:
return router.createUrlTree(['/login'])

Kém hơn:
router.navigate(['/login']);
return false;
```

Return `UrlTree` giúp Router xử lý redirect như một phần của navigation hiện tại, dễ test và ít side effect hơn.

### 8.3. Permission guard

```ts
export const permissionGuard: CanActivateFn = route => {
  const authz = inject(AuthorizationService);
  const router = inject(Router);
  const permission = route.data?.['permission'];

  if (!permission || authz.hasPermission(permission)) {
    return true;
  }

  return router.createUrlTree(['/forbidden']);
};
```

Route:

```ts
{
  path: 'settings/users',
  component: UserListComponent,
  canActivate: [permissionGuard],
  data: { permission: 'User.View' }
}
```

### 8.4. CanMatch cho lazy route

`CanMatch` chạy trước khi route được chọn. Nó hữu ích khi muốn chặn route lazy theo quyền hoặc feature flag.

```ts
export const featureFlagGuard: CanMatchFn = route => {
  const flags = inject(FeatureFlagService);
  return flags.isEnabled(route.data?.['feature']);
};
```

```ts
{
  path: 'new-reports',
  canMatch: [featureFlagGuard],
  loadChildren: () => import('./new-reports/routes').then(m => m.NEW_REPORT_ROUTES),
  data: { feature: 'NewReports' }
}
```

Khác biệt quan trọng:

```text
CanActivate:
Route đã match, sau đó mới quyết định có activate không.

CanMatch:
Quyết định route có được match không.
```

### 8.5. CanDeactivate cho form chưa lưu

```ts
export interface PendingChanges {
  hasPendingChanges(): boolean;
}

export const pendingChangesGuard: CanDeactivateFn<PendingChanges> = component => {
  if (!component.hasPendingChanges()) {
    return true;
  }

  return confirm('Bạn có thay đổi chưa lưu. Rời khỏi trang?');
};
```

Route:

```ts
{
  path: 'patients/:id/edit',
  component: PatientEditComponent,
  canDeactivate: [pendingChangesGuard]
}
```

Trong production, thay `confirm()` bằng dialog service để UX nhất quán.

### 8.6. Guard không thay thế bảo mật backend

Guard chỉ chạy ở client. User có thể sửa JavaScript, gọi API trực tiếp hoặc bỏ qua UI.

```text
Router guard = bảo vệ trải nghiệm frontend.
Backend authorization = bảo vệ dữ liệu thật.
```

Mọi permission quan trọng phải được kiểm tra ở API/backend.

---

## 9. Resolvers

### 9.1. Resolver dùng để làm gì?

Resolver lấy dữ liệu trước khi route được activate.

```text
Navigation bắt đầu
-> guard pass
-> resolver chạy
-> dữ liệu sẵn sàng
-> component được tạo
```

Ví dụ:

```ts
export const patientResolver: ResolveFn<Patient> = route => {
  const api = inject(PatientApiService);
  const id = route.paramMap.get('id')!;
  return api.getById(id);
};
```

Route:

```ts
{
  path: 'patients/:id',
  component: PatientDetailComponent,
  resolve: {
    patient: patientResolver
  }
}
```

Component:

```ts
ngOnInit(): void {
  this.patient = this.route.snapshot.data['patient'];
}
```

### 9.2. Khi nào nên dùng resolver?

Nên dùng khi:

```text
- Màn hình không có ý nghĩa nếu thiếu dữ liệu chính
- Cần tránh render trạng thái nửa vời
- Cần lấy metadata cho title/breadcrumb trước khi vào page
- Detail page cần 404/redirect sớm nếu resource không tồn tại
```

Không nên lạm dụng khi:

```text
- Dữ liệu phụ, có thể load sau
- Page cần skeleton nhanh
- API chậm và không muốn block navigation
- Có nhiều widget độc lập, mỗi widget tự load hợp lý hơn
```

### 9.3. Resolver và UX loading

Resolver block navigation cho đến khi hoàn thành. Nếu API chậm, user có thể cảm giác click không phản hồi nếu app không có global route loading indicator.

Pattern tốt:

```text
- Dữ liệu bắt buộc: resolver
- Dữ liệu phụ: component tự load với skeleton
- App shell: có loading bar theo Router events
```

---

## 10. Router events

### 10.1. Các event chính

Router phát ra event trong quá trình navigation:

```text
NavigationStart
RoutesRecognized
GuardsCheckStart
GuardsCheckEnd
ResolveStart
ResolveEnd
NavigationEnd
NavigationCancel
NavigationError
```

### 10.2. Loading indicator

```ts
@Injectable({ providedIn: 'root' })
export class RouteLoadingService {
  private loadingSubject = new BehaviorSubject(false);
  loading$ = this.loadingSubject.asObservable();

  constructor(router: Router) {
    router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        this.loadingSubject.next(true);
      }

      if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.loadingSubject.next(false);
      }
    });
  }
}
```

Trong app lớn, loading indicator nên tính cả lazy chunk, guard async và resolver.

### 10.3. Debug navigation

Router events giúp debug:

```text
- Vì sao navigation bị cancel?
- Guard nào chặn?
- Resolver có chạy không?
- Route lazy có tải không?
- Navigation bị redirect bao nhiêu lần?
```

Tạm thời có thể bật tracing:

```ts
RouterModule.forRoot(routes, {
  enableTracing: true
})
```

Không bật tracing trong production.

---

## 11. Route reuse và component lifecycle

### 11.1. Component có thể không bị destroy khi param đổi

Khi điều hướng giữa hai URL dùng cùng route config:

```text
/patients/1
-> /patients/2
```

Angular có thể reuse component instance. Vì vậy:

```text
ngOnInit không chắc chạy lại
constructor không chạy lại
paramMap/queryParamMap có thể emit giá trị mới
```

Nếu màn hình detail cần load lại theo `id`, subscribe param:

```ts
this.route.paramMap
  .pipe(
    map(params => params.get('id')!),
    distinctUntilChanged(),
    switchMap(id => this.api.getById(id))
  )
  .subscribe(patient => {
    this.patient = patient;
  });
```

### 11.2. Custom RouteReuseStrategy

Angular cho phép custom `RouteReuseStrategy` để cache component theo route. Đây là kỹ thuật nâng cao, có thể hữu ích cho màn hình danh sách nặng cần quay lại giữ nguyên state.

Nhưng cần cẩn thận:

```text
- Component bị cache thì lifecycle destroy không chạy như mong đợi
- Subscription/timer có thể còn sống
- Data có thể stale
- Memory tăng nếu cache nhiều page
- Permission/context user đổi có thể làm cache sai
```

Chỉ dùng khi có số liệu UX/performance rõ ràng. Với đa số case, lưu state vào query params hoặc store dễ kiểm soát hơn.

---

## 12. URL là state của màn hình

### 12.1. Vì sao URL state quan trọng?

Một màn hình list production thường có:

```text
- keyword
- filter
- sort
- page
- pageSize
- selected tab
```

Nếu các state này chỉ nằm trong component field, user refresh sẽ mất hết. Link share cho người khác cũng không giữ đúng màn hình.

Nên đưa các state quan trọng vào query params:

```text
/patients?keyword=an&status=active&page=2&sort=createdAt_desc
```

### 12.2. Đồng bộ form filter với query params

Pattern:

```text
1. Khi vào page, đọc query params để init form/list state.
2. Khi user đổi filter, update query params.
3. Khi query params đổi, load data theo query params.
```

Ví dụ:

```ts
ngOnInit(): void {
  this.route.queryParamMap
    .pipe(
      map(params => ({
        keyword: params.get('keyword') ?? '',
        page: Number(params.get('page') ?? 1)
      })),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      switchMap(query => this.api.search(query))
    )
    .subscribe(result => {
      this.result = result;
    });
}
```

Khi user search:

```ts
search(keyword: string): void {
  this.router.navigate([], {
    relativeTo: this.route,
    queryParams: {
      keyword,
      page: 1
    },
    queryParamsHandling: 'merge'
  });
}
```

### 12.3. Tránh vòng lặp query params

Lỗi hay gặp:

```text
queryParamMap subscribe -> patch form
form.valueChanges subscribe -> navigate query params
-> queryParamMap emit lại
-> patch form lại
```

Cách giảm rủi ro:

```text
- patchValue(..., { emitEvent: false }) khi init form từ URL
- debounce form.valueChanges
- distinctUntilChanged cho query object
- chỉ navigate khi query mới khác query hiện tại
```

---

## 13. Breadcrumb, title và menu active

### 13.1. Dùng route data cho breadcrumb

```ts
{
  path: 'patients',
  data: { breadcrumb: 'Bệnh nhân' },
  children: [
    { path: '', component: PatientListComponent },
    {
      path: ':id',
      component: PatientDetailComponent,
      data: { breadcrumb: 'Chi tiết' }
    }
  ]
}
```

Breadcrumb service có thể đọc `router.routerState.snapshot.root`, đi qua `firstChild` và lấy `data.breadcrumb`.

### 13.2. Dynamic title

```ts
@Injectable({ providedIn: 'root' })
export class RouteTitleService {
  constructor(router: Router, title: Title) {
    router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        const routeTitle = this.getDeepestTitle(router.routerState.snapshot.root);
        title.setTitle(routeTitle ? `${routeTitle} - App` : 'App');
      });
  }

  private getDeepestTitle(route: ActivatedRouteSnapshot): string | undefined {
    let current: ActivatedRouteSnapshot | null = route;
    let result: string | undefined;

    while (current) {
      result = current.data['title'] ?? result;
      current = current.firstChild;
    }

    return result;
  }
}
```

### 13.3. Menu active

Trong template:

```html
<a
  routerLink="/patients"
  routerLinkActive="active"
  [routerLinkActiveOptions]="{ exact: false }">
  Bệnh nhân
</a>
```

`exact: false` giúp parent menu active khi đang ở route con như `/patients/123`.

---

## 14. Error handling và fallback route

### 14.1. Not found

```ts
{ path: 'not-found', component: NotFoundComponent },
{ path: '**', redirectTo: 'not-found' }
```

Đặt wildcard cuối cùng. Router match route theo thứ tự từ trên xuống.

### 14.2. Forbidden

```ts
{ path: 'forbidden', component: ForbiddenComponent }
```

Guard permission redirect về `/forbidden` khi user đăng nhập nhưng không đủ quyền.

### 14.3. Resolver không tìm thấy dữ liệu

Resolver có thể redirect khi API trả 404:

```ts
export const patientResolver: ResolveFn<Patient | UrlTree> = route => {
  const api = inject(PatientApiService);
  const router = inject(Router);
  const id = route.paramMap.get('id')!;

  return api.getById(id).pipe(
    catchError(() => of(router.createUrlTree(['/not-found'])))
  );
};
```

Trong thực tế, cân nhắc hiển thị not-found page hoặc inline empty state tùy workflow.

---

## 15. Performance với Router

### 15.1. Các nguồn chi phí

```text
- Initial route tải bundle lớn
- Lazy route tải chunk chậm
- Resolver block navigation lâu
- Guard gọi API nhiều lần
- Component detail/list load lại do query params emit thừa
- Menu/sidebar render lại nhiều khi NavigationEnd
- Query params update quá thường xuyên khi user gõ
```

### 15.2. Tối ưu thường dùng

```text
- Lazy load theo feature
- Preload có chọn lọc
- Debounce search trước khi update URL
- distinctUntilChanged cho param/query stream
- Cache dữ liệu đọc nhiều, ít đổi
- Resolver chỉ dùng cho dữ liệu bắt buộc
- Avoid guard gọi API nếu permission đã có trong auth state
- Không tạo object route data động trong template
```

### 15.3. Đo đạc

Các câu hỏi cần trả lời:

```text
- Initial bundle bao nhiêu?
- Chunk của route nặng nhất là gì?
- Navigation chậm do tải chunk, guard, resolver hay component render?
- API nào chạy khi vào route?
- Có navigation redirect vòng lặp không?
- Query params có bị update liên tục không?
```

Tool:

```text
- Chrome DevTools Network: xem lazy chunk và API
- Chrome Performance: scripting/rendering khi navigation
- Angular DevTools: component render/change detection
- Build stats/source-map-explorer nếu cần phân tích bundle
```

---

## 16. Security và authorization

### 16.1. Không tin dữ liệu từ URL

URL là input từ user. Luôn validate:

```text
- id có đúng format không?
- page có phải số dương không?
- pageSize có vượt giới hạn không?
- sort field có nằm trong whitelist không?
- filter có cần encode/sanitize không?
```

Ví dụ:

```ts
const page = Math.max(1, Number(params.get('page') ?? 1));
const pageSize = Math.min(100, Math.max(10, Number(params.get('pageSize') ?? 20)));
```

### 16.2. Frontend permission chỉ là UX

Route guard, menu ẩn/hiện, button disabled đều giúp UX tốt hơn nhưng không đủ để bảo mật.

Backend vẫn phải kiểm tra:

```text
- User có quyền xem resource không?
- User có quyền thao tác action này không?
- Resource thuộc tenant/branch/organization hợp lệ không?
```

### 16.3. Open redirect

Cẩn thận với returnUrl:

```text
/login?returnUrl=https://evil.example
```

Chỉ cho phép redirect nội bộ:

```ts
function normalizeReturnUrl(returnUrl: string | null): string {
  if (!returnUrl || !returnUrl.startsWith('/')) {
    return '/';
  }

  if (returnUrl.startsWith('//')) {
    return '/';
  }

  return returnUrl;
}
```

---

## 17. Testing Router

### 17.1. Test guard

```ts
it('redirects to login when user is not authenticated', () => {
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { isLoggedIn: () => false } },
      provideRouter([])
    ]
  });

  const result = TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));

  expect(result).toBeInstanceOf(UrlTree);
});
```

### 17.2. Test component đọc params

Có thể mock `ActivatedRoute`:

```ts
providers: [
  {
    provide: ActivatedRoute,
    useValue: {
      paramMap: of(convertToParamMap({ id: '123' })),
      snapshot: {
        paramMap: convertToParamMap({ id: '123' }),
        data: {}
      }
    }
  }
]
```

### 17.3. Test navigation flow

Với route thật:

```ts
TestBed.configureTestingModule({
  imports: [RouterTestingModule.withRoutes(routes)]
});
```

Test nên tập trung vào behavior:

```text
- Không login thì redirect login
- Không đủ quyền thì forbidden
- Param đổi thì load lại data
- Query params được sync đúng
- CanDeactivate chặn rời trang khi form dirty
```

---

## 18. Lỗi production thường gặp

- **Quên `pathMatch: 'full'` ở redirect path rỗng**
  Redirect match quá rộng, gây route không vào đúng page hoặc redirect lặp.

- **Wildcard đặt trước route cụ thể**
  `**` match mọi thứ, nên các route phía sau không bao giờ chạy.

- **Đọc `snapshot.paramMap` trong component reuse**
  Chuyển từ `/items/1` sang `/items/2` nhưng dữ liệu không load lại.

- **Guard gọi `navigate()` rồi return false**
  Dễ tạo side effect và navigation khó debug. Nên return `UrlTree`.

- **Resolver lấy quá nhiều dữ liệu**
  Navigation bị block lâu, user thấy app chậm.

- **List state không nằm trong URL**
  Refresh hoặc share link mất filter/page/sort.

- **Update query params theo từng phím không debounce**
  Browser history phình to, API gọi nhiều, navigation event liên tục.

- **Permission chỉ check ở frontend**
  API vẫn bị gọi được nếu backend không kiểm tra.

- **Lazy route phụ thuộc shared module quá nặng**
  Chunk lazy vẫn lớn vì import nhầm thư viện hoặc module chung ôm quá nhiều thứ.

---

## 19. Checklist thiết kế route cho feature mới

```text
Route shape:
[ ] URL có phản ánh resource/workflow rõ không?
[ ] Path params dùng cho định danh chính chưa?
[ ] Query params dùng cho filter/sort/page/tab cần share chưa?
[ ] Có fallback/not-found phù hợp không?

Architecture:
[ ] Feature có nên lazy load không?
[ ] Lazy boundary có đủ lớn và rõ ownership không?
[ ] Layout route đặt đúng cấp chưa?
[ ] Route data cho title/breadcrumb/permission có nhất quán không?

Security:
[ ] Auth guard đặt ở cấp phù hợp chưa?
[ ] Permission guard dùng route data chưa?
[ ] Backend có check quyền tương ứng chưa?
[ ] Params/query từ URL đã validate chưa?

Data:
[ ] Dữ liệu nào bắt buộc cần resolver?
[ ] Dữ liệu nào nên load trong component với skeleton?
[ ] Param đổi có load lại data đúng không?
[ ] Query params có debounce/distinctUntilChanged không?

UX:
[ ] Browser back/forward hoạt động đúng không?
[ ] Refresh không mất state quan trọng không?
[ ] Menu active/breadcrumb/title đúng không?
[ ] Navigation chậm có loading indicator không?

Performance:
[ ] Bundle route có quá lớn không?
[ ] Có cần preload không?
[ ] Guard/resolver có gọi API thừa không?
[ ] Có cache dữ liệu phù hợp không?
```

---

## 20. Tóm tắt tư duy middle/senior

```text
Router không chỉ map URL sang component.

Router là nơi thiết kế:
- cấu trúc URL
- layout shell
- lazy loading boundary
- auth/permission flow
- dữ liệu bắt buộc trước khi vào page
- trạng thái màn hình có thể share/refresh
- browser history
- loading/error/fallback UX

Route tốt giúp app dễ mở rộng.
Route kém làm feature dính chặt, khó deep link, khó phân quyền, khó lazy load và khó debug navigation.
```

Một route design tốt thường có 4 đặc điểm:

```text
1. URL đọc vào hiểu được user đang ở đâu.
2. State quan trọng nằm trong URL hoặc store có chủ đích.
3. Guard/resolver đủ dùng, không biến route thành nơi chứa toàn bộ business logic.
4. Lazy loading và preload dựa trên feature boundary và số liệu thực tế.
```
