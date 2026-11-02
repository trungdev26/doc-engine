import { Component, OnInit } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './core/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  isLoginPage = false;

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    // Trang đăng nhập đứng riêng, không có thanh bên và menu.
    this.isLoginPage = this.router.url.split(/[?#]/)[0] === '/login';
    this.router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe(event => {
      this.isLoginPage = (event as NavigationEnd).urlAfterRedirects.split(/[?#]/)[0] === '/login';
    });
    // Hỏi máy chủ xem phiên đăng nhập (cookie) còn hiệu lực không, để hiện đúng tên người dùng.
    this.auth.restore().subscribe();
  }
}
