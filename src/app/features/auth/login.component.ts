import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent {
  username = '';
  password = '';
  showPassword = false;
  submitting = false;
  error = '';

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {}

  get canSubmit(): boolean {
    return !!this.username.trim() && !!this.password && !this.submitting;
  }

  submit(): void {
    if (!this.canSubmit) {
      return;
    }
    this.submitting = true;
    this.error = '';
    this.auth.login(this.username.trim(), this.password).subscribe({
      next: () => {
        this.submitting = false;
        this.password = '';
        void this.router.navigateByUrl(this.destination());
      },
      error: (error: HttpErrorResponse) => {
        this.submitting = false;
        this.error = this.auth.describe(error);
        this.password = '';
      },
    });
  }

  /** Chỉ chấp nhận đường dẫn nội bộ, để không bị lợi dụng chuyển người dùng sang trang khác sau khi đăng nhập. */
  private destination(): string {
    const target = this.route.snapshot.queryParamMap.get('returnUrl');
    return target && target.startsWith('/') && !target.startsWith('//') ? target : '/';
  }
}
