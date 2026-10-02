import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { MENU_SECTIONS, MenuItem } from './menu.config';

type ThemeMode = 'light' | 'dark' | 'system';
type SearchScope = 'all' | 'bookmarks' | 'recent';

interface NavigationItem {
  label: string;
  context: string;
  section: string;
  link: string;
  searchText: string;
}

const STORAGE_KEYS = {
  theme: 'dev-internals.theme',
  bookmarks: 'dev-internals.bookmarks',
  recent: 'dev-internals.recent',
  sidebarWidth: 'dev-internals.sidebar-width',
} as const;

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
  readonly navigationItems = this.flattenNavigation();
  readonly sidebarMinWidth = SIDEBAR_MIN_WIDTH;
  readonly sidebarMaxWidth = SIDEBAR_MAX_WIDTH;

  collapsed = false;
  sidebarWidth = SIDEBAR_DEFAULT_WIDTH;
  mobileMenuOpen = false;
  showBackToTop = false;
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

  constructor(private readonly router: Router) {}

  ngOnInit(): void {
    this.restorePreferences();
    this.applyTheme();
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

  get searchResults(): NavigationItem[] {
    const query = this.normalize(this.searchQuery);
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
    const index = this.navigationItems.findIndex(item => item.link === this.currentLink);
    return index > 0 ? this.navigationItems[index - 1] : undefined;
  }

  get nextItem(): NavigationItem | undefined {
    const index = this.navigationItems.findIndex(item => item.link === this.currentLink);
    return index >= 0 && index < this.navigationItems.length - 1
      ? this.navigationItems[index + 1]
      : undefined;
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
      this.addToRecent(current.link);
    }
  }

  private flattenNavigation(): NavigationItem[] {
    const items: NavigationItem[] = [];

    for (const section of MENU_SECTIONS) {
      this.appendNavigationItems(items, section.items, section.title, []);

      for (const group of section.groups ?? []) {
        if (group.link) {
          items.push(
            this.createNavigationItem(group.title, group.title, section.title, group.link),
          );
        }
        this.appendNavigationItems(items, group.items, section.title, [group.title]);
      }
    }

    return items;
  }

  private appendNavigationItems(
    target: NavigationItem[],
    menuItems: MenuItem[] | undefined,
    section: string,
    ancestors: string[],
  ): void {
    for (const item of menuItems ?? []) {
      if (item.link) {
        const context = ancestors.length ? ancestors.join(' · ') : section;
        target.push(this.createNavigationItem(item.label, context, section, item.link));
      }

      this.appendNavigationItems(target, item.children, section, [...ancestors, item.label]);
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

  private createNavigationItem(
    label: string,
    context: string,
    section: string,
    link: string,
  ): NavigationItem {
    return {
      label,
      context,
      section,
      link,
      searchText: this.normalize(`${label} ${context} ${section}`),
    };
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
    this.bookmarks = this.restoreSet(STORAGE_KEYS.bookmarks);
    this.recentLinks = this.restoreArray(STORAGE_KEYS.recent);
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

  private restoreSet(key: string): Set<string> {
    return new Set(this.restoreArray(key));
  }

  private restoreArray(key: string): string[] {
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? '[]');
      return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
    } catch {
      return [];
    }
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

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }
}
