# Angular Router Guards

Tài liệu này tập trung vào cách dùng Guard trong các bài toán thực tế. Mục tiêu không chỉ là biết `CanActivate`, `CanDeactivate`, `CanMatch`, mà là biết đặt guard đúng chỗ, tránh side effect, không gọi API thừa và không biến Router thành nơi chứa toàn bộ business rule.

---

## 1. Tư duy khi thiết kế Guard

Guard nhìn đơn giản, nhưng trong app thật nó thường quyết định flow người dùng.

Một middle/senior nên hỏi:

```text
Guard này đang bảo vệ trải nghiệm gì?
Guard này có gọi API thừa không?
Guard này redirect có giữ được intended URL không?
Guard này có làm mất dữ liệu user đang nhập không?
Guard này có trùng logic với backend hoặc permission service không?
```

Guard phù hợp cho:

```text
User đã login chưa?
User có quyền vào màn này không?
Context bắt buộc đã có chưa?
Feature có bật không?
Có được rời màn hiện tại không?
```

Guard không nên là nơi chính để xử lý:

```text
Rule nghiệp vụ phức tạp
Validate dữ liệu domain
Quyết định bảo mật cuối cùng
Load quá nhiều dữ liệu phụ
Orchestrate workflow dài
```

---

## 2. Case 1: Auth guard giữ returnUrl

### Bài toán

```text
User vào /patients/123/edit
Nhưng chưa login
-> redirect sang /auth/login
Sau khi login xong
-> quay lại /patients/123/edit
```

### Guard

```ts
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) {
    return true;
  }

  return router.createUrlTree(['/auth/login'], {
    queryParams: { returnUrl: state.url },
  });
};
```

### Login component

```ts
login(): void {
  this.authService.login(this.form.value).subscribe(() => {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    this.router.navigateByUrl(returnUrl || '/');
  });
}
```

### Route

```ts
{
  path: 'patients/:id/edit',
  component: PatientEditComponent,
  canActivate: [authGuard]
}
```

### Điểm cần để ý

```text
Không hard-code redirect về trang chủ.
Không gọi router.navigate() trong guard rồi return false.
Không lưu returnUrl vào biến global nếu query param đã đủ.
Validate returnUrl nếu hệ thống có redirect ra domain ngoài.
```

Nên return `UrlTree` thay vì gọi `router.navigate()` trong guard.

```ts
// Tốt
return router.createUrlTree(['/auth/login'], {
  queryParams: { returnUrl: state.url },
});

// Kém hơn
router.navigate(['/auth/login']);
return false;
```

`UrlTree` giúp Router xử lý redirect như một phần của navigation hiện tại, dễ test hơn và ít side effect hơn.

---

## 3. Case 2: Permission guard dùng route data

### Bài toán

```text
/users chỉ cần User.View
/users/create cần User.Create
/users/:id/edit cần User.Update
```

Nếu viết riêng guard cho từng page, code sẽ lặp và khó maintain. Cách tốt hơn là để permission nằm trong route data.

### Guard

```ts
export const permissionGuard: CanActivateFn = route => {
  const authz = inject(AuthorizationService);
  const router = inject(Router);
  const permission = route.data['permission'] as string | undefined;

  if (!permission) {
    return true;
  }

  if (authz.hasPermission(permission)) {
    return true;
  }

  return router.createUrlTree(['/forbidden']);
};
```

### Route

```ts
export const USER_ROUTES: Routes = [
  {
    path: '',
    component: UserListComponent,
    canActivate: [permissionGuard],
    data: { permission: 'User.View' },
  },
  {
    path: 'create',
    component: UserCreateComponent,
    canActivate: [permissionGuard],
    data: { permission: 'User.Create' },
  },
  {
    path: ':id/edit',
    component: UserEditComponent,
    canActivate: [permissionGuard],
    data: { permission: 'User.Update' },
  },
];
```

### Tư duy production

```text
Route data là metadata của màn hình.
Permission service là nơi hiểu user có quyền gì.
Guard chỉ nối hai thứ đó lại để quyết định navigation.
```

Không nên:

```ts
if (url.includes('/users/create')) {
  return authz.hasPermission('User.Create');
}
```

Lý do: guard sẽ phụ thuộc string URL, đổi route là dễ vỡ logic.

---

## 4. Case 3: CanDeactivate cho form có thay đổi thật sự

### Bài toán

```text
Ban đầu name = "A"
User sửa thành "B"
-> rời trang thì cảnh báo

User sửa thành "B"
Sau đó sửa lại "A"
-> rời trang không cảnh báo
```

Không nên chỉ dùng `form.dirty`, vì `dirty` nói rằng user đã từng sửa form, không nói giá trị hiện tại có khác dữ liệu ban đầu hay không.

Một hướng production hơn là so sánh current value với initial snapshot.

### Guard

```ts
export interface CanLeavePage {
  canLeave(): boolean | Observable<boolean>;
}

export const canLeavePageGuard: CanDeactivateFn<CanLeavePage> = component => {
  return component.canLeave();
};
```

### Component

```ts
type PatientFormValue = {
  name: string;
  phone: string;
};

@Component({
  selector: 'app-patient-edit',
  templateUrl: './patient-edit.component.html',
})
export class PatientEditComponent implements OnInit, CanLeavePage {
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(ConfirmDialogService);
  private initialValue!: PatientFormValue;

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true }),
    phone: new FormControl('', { nonNullable: true }),
  });

  ngOnInit(): void {
    const patient = this.route.snapshot.data['patient'];

    this.form.setValue({
      name: patient.name,
      phone: patient.phone,
    });

    this.initialValue = this.form.getRawValue();
  }

  canLeave(): boolean | Observable<boolean> {
    if (!this.hasRealChanges()) {
      return true;
    }

    return this.dialog.confirm({
      title: 'Có thay đổi chưa lưu',
      message: 'Bạn có muốn rời khỏi trang này không?',
      okText: 'Rời trang',
      cancelText: 'Ở lại',
    });
  }

  private hasRealChanges(): boolean {
    return !isEqual(this.form.getRawValue(), this.initialValue);
  }
}
```

### Route

```ts
{
  path: 'patients/:id/edit',
  component: PatientEditComponent,
  canDeactivate: [canLeavePageGuard],
  resolve: { patient: patientResolver }
}
```

Nếu không muốn dùng lodash:

```ts
function isSamePatientForm(a: PatientFormValue, b: PatientFormValue): boolean {
  return a.name === b.name && a.phone === b.phone;
}
```

### Điểm middle/senior

```text
dirty/touched phục vụ validation UX.
So sánh initial/current phục vụ cảnh báo mất dữ liệu.
Hai chuyện này không giống nhau.
```

Với form lớn, nên chuẩn hóa dữ liệu trước khi so sánh.

```ts
function normalizePatientForm(value: PatientFormValue): PatientFormValue {
  return {
    name: value.name.trim(),
    phone: value.phone.trim(),
  };
}
```

Nếu có array, date, object lồng nhau, cần định nghĩa rõ:

```text
Thứ tự array có quan trọng không?
Date so sánh theo object Date hay ISO string?
Field readonly có tính vào thay đổi không?
Field server tự sinh có nên loại khỏi comparison không?
```

---

## 5. Case 4: Guard check workspace/tenant/context

### Bài toán

```text
App có nhiều chi nhánh/phòng ban/tenant.
Một số route bắt buộc user phải chọn context trước.
Nếu chưa chọn context -> redirect sang màn chọn context.
Sau khi chọn xong -> quay lại route cũ.
```

### Guard

```ts
export const requiredWorkspaceGuard: CanActivateFn = (_route, state) => {
  const workspace = inject(WorkspaceContextService);
  const router = inject(Router);

  if (workspace.hasSelectedWorkspace()) {
    return true;
  }

  return router.createUrlTree(['/select-workspace'], {
    queryParams: { returnUrl: state.url },
  });
};
```

### Route

```ts
{
  path: 'reports',
  canActivate: [authGuard, requiredWorkspaceGuard],
  loadChildren: () => import('./reports/report.routes').then(m => m.REPORT_ROUTES)
}
```

### Điểm cần để ý

```text
authGuard nên chạy trước context guard.
Nếu chưa login thì không nên hỏi workspace.
Nếu workspace hết hiệu lực, clear context rồi redirect rõ ràng.
API vẫn phải validate workspaceId/tenantId.
```

Nếu context được load async:

```ts
export const requiredWorkspaceGuard: CanActivateFn = (_route, state) => {
  const workspace = inject(WorkspaceContextService);
  const router = inject(Router);

  return workspace.selectedWorkspace$.pipe(
    take(1),
    map(selected => {
      if (selected) {
        return true;
      }

      return router.createUrlTree(['/select-workspace'], {
        queryParams: { returnUrl: state.url },
      });
    })
  );
};
```

Không nên subscribe thủ công trong guard:

```ts
// Không nên
workspace.selectedWorkspace$.subscribe(...);
return false;
```

Hãy return `Observable<boolean | UrlTree>` để Router quản lý lifecycle.

---

## 6. Case 5: CanMatch cho feature flag/lazy route

### Bài toán

```text
Tính năng báo cáo mới chỉ mở cho một số khách hàng.
Không muốn route lazy module được match nếu feature flag tắt.
```

### Guard

```ts
export const featureEnabledGuard: CanMatchFn = route => {
  const flags = inject(FeatureFlagService);
  const router = inject(Router);
  const feature = route.data?.['feature'] as string;

  if (flags.isEnabled(feature)) {
    return true;
  }

  return router.createUrlTree(['/not-found']);
};
```

### Route

```ts
{
  path: 'advanced-reports',
  canMatch: [featureEnabledGuard],
  data: { feature: 'AdvancedReports' },
  loadChildren: () =>
    import('./advanced-reports/routes').then(m => m.ADVANCED_REPORT_ROUTES)
}
```

### Vì sao dùng CanMatch?

```text
Route chưa được match thì lazy module chưa cần activate.
Hợp với feature flag, A/B test, route chỉ tồn tại với một nhóm user.
```

Nếu route bị tắt hoàn toàn với user, `CanMatch` thường hợp hơn `CanActivate`.

---

## 7. Case 6: Guard không nên ôm business rule quá nặng

### Bài toán

```text
Không cho sửa đơn hàng nếu đơn đã thanh toán.
Không cho hủy phiếu nếu phiếu đã khóa.
Không cho duyệt nếu thiếu thông tin bắt buộc.
```

Đây nghe giống guard, nhưng thường không nên nhét hết vào Router Guard.

Guard chỉ nên quyết định điều kiện vào màn hình:

```text
User đã login chưa?
User có quyền vào màn này không?
Context bắt buộc đã có chưa?
Feature có bật không?
Có được rời màn hiện tại không?
```

Business rule nên nằm ở domain/service/API:

```ts
save(): void {
  this.orderService.updateOrder(this.orderId, this.form.getRawValue()).subscribe({
    next: () => this.router.navigate(['/orders', this.orderId]),
    error: error => this.handleSaveError(error),
  });
}
```

Backend vẫn là nguồn quyết định cuối cùng:

```text
Frontend có thể disable button, ẩn action, cảnh báo sớm.
Backend phải reject request không hợp lệ.
```

Nếu rule chỉ ảnh hưởng một action, hãy kiểm tra tại action đó. Nếu rule quyết định user có được vào cả màn hình hay không, guard mới hợp lý.

---

## 8. Case 7: Guard gọi API, cache và tránh request lặp

### Bài toán

```text
Permission/context phải lấy từ API.
Mỗi lần đổi route guard lại gọi API.
App bị chậm và server nhận request lặp.
```

Guard không nên tự cache phức tạp. Nên để service quản lý state/cache.

```ts
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);
  private readonly session$ = this.http.get<SessionDto>('/api/session').pipe(
    shareReplay({ bufferSize: 1, refCount: false })
  );

  getSession(): Observable<SessionDto> {
    return this.session$;
  }
}
```

Guard:

```ts
export const sessionReadyGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  const router = inject(Router);

  return session.getSession().pipe(
    take(1),
    map(result => {
      if (result.isAuthenticated) {
        return true;
      }

      return router.createUrlTree(['/auth/login']);
    }),
    catchError(() => of(router.createUrlTree(['/auth/login'])))
  );
};
```

Điểm cần nhớ:

```text
Guard return Observable, không subscribe thủ công.
Service chịu trách nhiệm cache.
Guard chỉ map dữ liệu thành true hoặc UrlTree.
Luôn xử lý error để navigation không treo.
```

---

## 9. Thứ tự guard trong route

Ví dụ:

```ts
{
  path: 'reports',
  canActivate: [authGuard, requiredWorkspaceGuard, permissionGuard],
  data: { permission: 'Report.View' },
  loadChildren: () => import('./reports/routes').then(m => m.REPORT_ROUTES)
}
```

Tư duy:

```text
1. Chưa login thì redirect login trước.
2. Login rồi mới kiểm tra context.
3. Có context rồi mới kiểm tra permission màn hình.
```

Thứ tự không chỉ là kỹ thuật. Nó ảnh hưởng UX.

Nếu check permission trước auth, user chưa login có thể bị đẩy sang forbidden, trong khi đúng flow phải là login.

---

## 10. Test guard

Guard tốt nên dễ test vì nó ít side effect.

Ví dụ test auth guard:

```ts
it('redirects to login with returnUrl when user is not logged in', () => {
  authService.isLoggedIn.and.returnValue(false);

  const result = TestBed.runInInjectionContext(() =>
    authGuard({} as ActivatedRouteSnapshot, {
      url: '/patients/123/edit',
    } as RouterStateSnapshot)
  );

  expect(result).toEqual(
    router.createUrlTree(['/auth/login'], {
      queryParams: { returnUrl: '/patients/123/edit' },
    })
  );
});
```

Với guard async:

```ts
it('allows navigation when session is authenticated', done => {
  sessionService.getSession.and.returnValue(of({ isAuthenticated: true }));

  const result$ = TestBed.runInInjectionContext(() =>
    sessionReadyGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
  ) as Observable<boolean | UrlTree>;

  result$.subscribe(result => {
    expect(result).toBe(true);
    done();
  });
});
```

Nếu guard khó test, thường là dấu hiệu nó đang làm quá nhiều việc.

---

## 11. Checklist review Guard

```text
[ ] Guard có return boolean/UrlTree/Observable rõ ràng không?
[ ] Redirect có giữ intended URL nếu cần không?
[ ] Guard có gọi API lặp lại mỗi lần navigation không?
[ ] Permission lấy từ route data hay hard-code theo URL?
[ ] Guard có đang chứa business rule đáng ra thuộc backend/domain service không?
[ ] CanDeactivate có phân biệt dirty và real changes không?
[ ] Guard order có hợp lý không? auth trước permission/context?
[ ] Guard async có take(1), catchError hoặc completion rõ ràng không?
[ ] Guard có subscribe thủ công không?
[ ] Backend có check lại quyền và rule quan trọng không?
```

---

## 12. Tóm tắt

```text
Guard tốt:
- nhỏ
- rõ intent
- ít side effect
- return UrlTree khi redirect
- dựa vào service chuyên trách
- dễ test
- không thay thế backend security

Guard kém:
- hard-code URL
- gọi navigate() rồi return false
- subscribe thủ công
- gọi API lặp
- chứa quá nhiều business rule
- làm navigation treo khi API lỗi
```

Một câu dễ nhớ:

```text
Guard quyết định user có được đi qua cửa này không.
Guard không nên trở thành nơi vận hành toàn bộ tòa nhà.
```
