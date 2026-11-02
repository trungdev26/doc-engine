import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { STORAGE_KEYS, readStringArray } from '../../core/local-storage';
import { AuthService } from '../../core/auth.service';
import { LearningProfileService, LearningTrack } from '../../core/learning-profile.service';
import { ENGLISH_FEATURES } from '../../features/english/english-features';
import { MENU_SECTIONS, MenuItem } from './menu.config';
import { NAVIGATION_ITEMS, NavigationItem, normalizeText } from './navigation';

type ThemeMode = 'light' | 'dark' | 'system';
type SearchScope = 'all' | 'bookmarks' | 'recent';

const SIDEBAR_DEFAULT_WIDTH = 300;
const SIDEBAR_MIN_WIDTH = 300;
const SIDEBAR_MAX_WIDTH = 360;

@Component({
  selector: 'app-shell',
  templateUrl: './shell.component.html',
  styleUrls: ['./shell.component.scss'],
})
export class ShellComponent implements OnInit, OnDestroy {
  readonly menuSections = MENU_SECTIONS;
  readonly navigationItems = NAVIGATION_ITEMS;
  readonly englishFeatures = ENGLISH_FEATURES;
  readonly sidebarMinWidth = SIDEBAR_MIN_WIDTH;
  readonly sidebarMaxWidth = SIDEBAR_MAX_WIDTH;

  collapsed = false;
  sidebarWidth = SIDEBAR_DEFAULT_WIDTH;
  mobileMenuOpen = false;
  showBackToTop = false;
  showOnboarding = false;
  searchOpen = false;
  searchQuery = '';
  searchScope: SearchScope = 'all';
  activeSearchIndex = 0;
  focusMode = false;
  themeMode: ThemeMode = 'dark';
  isDarkTheme = true;
  readingProgress = 0;
  currentSection = 'Knowledge library';
  currentTitle = 'Engineering notes';
  currentLink = '';
  currentTrack: LearningTrack = 'dev';
  bookmarks = new Set<string>();
  recentLinks: string[] = [];
  private isResizingSidebar = false;
  private resizeStartX = 0;
  private resizeStartWidth = SIDEBAR_DEFAULT_WIDTH;
  private readonly resizeSidebarListener = (event: PointerEvent) => this.resizeSidebar(event);
  private readonly stopSidebarResizeListener = () => this.stopSidebarResize();

  @ViewChild('appContent', { read: ElementRef })
  private appContent!: ElementRef<HTMLElement>;

  @ViewChild('searchInput', { read: ElementRef })
  private searchInput?: ElementRef<HTMLInputElement>;

  constructor(
    private readonly router: Router,
    private readonly profile: LearningProfileService,
    readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.restorePreferences();
    this.applyTheme();
    this.currentTrack = this.profile.track;
    this.showOnboarding = !this.profile.isOnboarded;
    this.updateNavigationState(this.router.url);

    this.router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe(event => {
      this.updateNavigationState((event as NavigationEnd).urlAfterRedirects);
      this.closeMobileMenu();
      this.closeSearch();
      this.readingProgress = 0;
      requestAnimationFrame(() => this.appContent?.nativeElement.scrollTo({ top: 0 }));
    });
  }

  ngOnDestroy(): void {
    this.stopSidebarResize();
  }

  /** Mục menu phẳng của track tiếng Anh (không có nhóm con). */
  get englishItems(): MenuItem[] {
    return this.menuSections
      .filter(section => section.track === 'english')
      .flatMap(section => section.items ?? []);
  }

  get visibleSections() {
    return this.menuSections.filter(section => (section.track ?? 'dev') === this.currentTrack);
  }

  get trackItems(): NavigationItem[] {
    return this.navigationItems.filter(item => item.track === this.currentTrack);
  }

  get searchResults(): NavigationItem[] {
    const query = normalizeText(this.searchQuery);
    let items = this.navigationItems;

    if (this.searchScope === 'bookmarks') {
      items = items.filter(item => this.bookmarks.has(item.link));
    } else if (this.searchScope === 'recent') {
      const recentOrder = new Map(this.recentLinks.map((link, index) => [link, index]));
      items = items
        .filter(item => recentOrder.has(item.link))
        .sort((a, b) => recentOrder.get(a.link)! - recentOrder.get(b.link)!);
    }

    if (query) {
      items = items.filter(item => item.searchText.includes(query));
    }

    return items.slice(0, 9);
  }

  get previousItem(): NavigationItem | undefined {
    const items = this.trackItems;
    const index = items.findIndex(item => item.link === this.currentLink);
    return index > 0 ? items[index - 1] : undefined;
  }

  get nextItem(): NavigationItem | undefined {
    const items = this.trackItems;
    const index = items.findIndex(item => item.link === this.currentLink);
    return index >= 0 && index < items.length - 1 ? items[index + 1] : undefined;
  }

  get isCurrentBookmarked(): boolean {
    return this.bookmarks.has(this.currentLink);
  }

  get themeLabel(): string {
    return this.themeMode === 'system'
      ? 'System theme'
      : this.themeMode === 'dark'
        ? 'Dark theme'
        : 'Light theme';
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardShortcut(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.searchOpen ? this.closeSearch() : this.openSearch();
      return;
    }

    if (!this.searchOpen) {
      if (event.key === 'Escape' && this.focusMode) {
        event.preventDefault();
        this.focusMode = false;
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeSearch();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveSearchSelection(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveSearchSelection(-1);
    } else if (event.key === 'Enter') {
      const result = this.searchResults[this.activeSearchIndex];
      if (result) {
        event.preventDefault();
        this.navigateTo(result.link);
      }
    }
  }

  logout(): void {
    this.auth.logout().subscribe();
  }

  chooseTrack(track: LearningTrack): void {
    this.profile.chooseTrack(track);
    this.currentTrack = track;
    this.showOnboarding = false;
    this.closeMobileMenu();
    void this.router.navigateByUrl('/');
  }

  openOnboarding(): void {
    this.showOnboarding = true;
  }

  resizeSidebar(event: PointerEvent): void {
    if (!this.isResizingSidebar) {
      return;
    }

    this.sidebarWidth = this.clampSidebarWidth(
      this.resizeStartWidth + event.clientX - this.resizeStartX,
    );
  }

  stopSidebarResize(): void {
    if (!this.isResizingSidebar) {
      return;
    }

    this.isResizingSidebar = false;
    document.removeEventListener('pointermove', this.resizeSidebarListener);
    document.removeEventListener('pointerup', this.stopSidebarResizeListener);
    document.removeEventListener('pointercancel', this.stopSidebarResizeListener);
    document.body.classList.remove('is-resizing-sidebar');
    this.persistSidebarWidth();
  }

  startSidebarResize(event: PointerEvent): void {
    if (this.collapsed || window.innerWidth <= 900) {
      return;
    }

    event.preventDefault();
    this.isResizingSidebar = true;
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.sidebarWidth;
    document.addEventListener('pointermove', this.resizeSidebarListener);
    document.addEventListener('pointerup', this.stopSidebarResizeListener);
    document.addEventListener('pointercancel', this.stopSidebarResizeListener);
    document.body.classList.add('is-resizing-sidebar');
  }

  resizeSidebarByKeyboard(event: KeyboardEvent): void {
    const resizeStep = event.shiftKey ? 24 : 8;
    let nextWidth = this.sidebarWidth;

    if (event.key === 'ArrowLeft') {
      nextWidth -= resizeStep;
    } else if (event.key === 'ArrowRight') {
      nextWidth += resizeStep;
    } else if (event.key === 'Home') {
      nextWidth = SIDEBAR_MIN_WIDTH;
    } else if (event.key === 'End') {
      nextWidth = SIDEBAR_MAX_WIDTH;
    } else {
      return;
    }

    event.preventDefault();
    this.sidebarWidth = this.clampSidebarWidth(nextWidth);
    this.persistSidebarWidth();
  }

  openSearch(): void {
    this.searchOpen = true;
    this.searchQuery = '';
    this.searchScope = 'all';
    this.activeSearchIndex = 0;
    setTimeout(() => this.searchInput?.nativeElement.focus());
  }

  closeSearch(): void {
    this.searchOpen = false;
  }

  setSearchScope(scope: SearchScope): void {
    this.searchScope = scope;
    this.activeSearchIndex = 0;
    this.searchInput?.nativeElement.focus();
  }

  onSearchQueryChange(): void {
    this.activeSearchIndex = 0;
  }

  navigateTo(link: string): void {
    void this.router.navigateByUrl(link);
  }

  toggleBookmark(): void {
    if (!this.currentLink) {
      return;
    }
    this.isCurrentBookmarked
      ? this.bookmarks.delete(this.currentLink)
      : this.bookmarks.add(this.currentLink);
    this.persistSet(STORAGE_KEYS.bookmarks, this.bookmarks);
  }

  toggleFocusMode(): void {
    this.focusMode = !this.focusMode;
  }

  cycleTheme(): void {
    const themes: ThemeMode[] = ['system', 'light', 'dark'];
    this.themeMode = themes[(themes.indexOf(this.themeMode) + 1) % themes.length];
    localStorage.setItem(STORAGE_KEYS.theme, this.themeMode);
    this.applyTheme();
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
  }

  onContentScroll(event: Event): void {
    const target = event.target as HTMLElement;
    this.showBackToTop = target.scrollTop > 300;
    const scrollable = target.scrollHeight - target.clientHeight;
    this.readingProgress =
      scrollable > 0 ? Math.min(100, Math.round((target.scrollTop / scrollable) * 100)) : 100;
  }

  scrollToTop(): void {
    this.appContent.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private updateNavigationState(url: string): void {
    const cleanUrl = url.split(/[?#]/)[0];
    this.currentLink =
      this.navigationItems.find(item => this.matchesLink(item.link, cleanUrl))?.link ?? cleanUrl;

    for (const section of this.menuSections) {
      let sectionActive = this.updateMenuItemsState(section.items, cleanUrl);

      for (const group of section.groups ?? []) {
        const groupActive =
          (!!group.link && this.matchesLink(group.link, cleanUrl)) ||
          this.updateMenuItemsState(group.items, cleanUrl);

        group.open = groupActive;
        sectionActive ||= groupActive;
      }

      section.open = sectionActive;
    }

    const current = this.navigationItems.find(item => item.link === this.currentLink);
    if (current) {
      this.currentSection = current.section;
      this.currentTitle = current.context;
      this.currentTrack = current.track;
      this.addToRecent(current.link);
    } else if (cleanUrl.startsWith('/english')) {
      // Bài học và trang ôn tập không nằm trong mục lục nhưng vẫn thuộc track tiếng Anh.
      this.currentTrack = 'english';
      this.currentSection = 'Học tiếng Anh';
      this.currentTitle = /^\/english\/(speaking-)?lesson/.test(cleanUrl)
        ? 'Bài học'
        : 'Học tiếng Anh';
    } else {
      this.currentTrack = this.profile.track;
      this.currentSection = 'Trang chủ';
      this.currentTitle = this.currentTrack === 'english' ? 'Học tiếng Anh' : 'Dev Internals';
    }
  }

  private updateMenuItemsState(items: MenuItem[] | undefined, url: string): boolean {
    let hasActiveItem = false;

    for (const item of items ?? []) {
      const hasActiveChild = this.updateMenuItemsState(item.children, url);
      item.open = hasActiveChild;
      hasActiveItem ||= (!!item.link && this.matchesLink(item.link, url)) || hasActiveChild;
    }

    return hasActiveItem;
  }

  private matchesLink(link: string, url: string): boolean {
    return url === link || url.startsWith(`${link}/`);
  }

  private moveSearchSelection(direction: number): void {
    const count = this.searchResults.length;
    if (!count) {
      this.activeSearchIndex = 0;
      return;
    }
    this.activeSearchIndex = (this.activeSearchIndex + direction + count) % count;
  }

  private restorePreferences(): void {
    const savedTheme = localStorage.getItem(STORAGE_KEYS.theme) as ThemeMode | null;
    this.themeMode =
      savedTheme && ['light', 'dark', 'system'].includes(savedTheme) ? savedTheme : 'dark';
    this.bookmarks = new Set(readStringArray(STORAGE_KEYS.bookmarks));
    this.recentLinks = readStringArray(STORAGE_KEYS.recent);
    const savedSidebarWidth = Number(localStorage.getItem(STORAGE_KEYS.sidebarWidth));
    this.sidebarWidth =
      Number.isFinite(savedSidebarWidth) && savedSidebarWidth > 0
        ? this.clampSidebarWidth(savedSidebarWidth)
        : SIDEBAR_DEFAULT_WIDTH;
  }

  private applyTheme(): void {
    this.isDarkTheme =
      this.themeMode === 'dark' ||
      (this.themeMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset['theme'] = this.isDarkTheme ? 'dark' : 'light';
  }

  private addToRecent(link: string): void {
    this.recentLinks = [link, ...this.recentLinks.filter(item => item !== link)].slice(0, 12);
    localStorage.setItem(STORAGE_KEYS.recent, JSON.stringify(this.recentLinks));
  }

  private persistSet(key: string, value: Set<string>): void {
    localStorage.setItem(key, JSON.stringify([...value]));
  }

  private clampSidebarWidth(width: number): number {
    return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
  }

  private persistSidebarWidth(): void {
    localStorage.setItem(STORAGE_KEYS.sidebarWidth, String(this.sidebarWidth));
  }
}
