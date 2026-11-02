import { AfterViewInit, Component, ElementRef, Input, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NzImageService } from 'ng-zorro-antd/image';
import { MermaidAPI } from 'ngx-markdown';

export interface TocItem {
  id: string;
  text: string;
  children: TocItem[];
}

@Component({
  selector: 'app-markdown-doc',
  templateUrl: './markdown-doc.component.html',
  styleUrls: ['./markdown-doc.component.scss'],
})
export class MarkdownDocComponent implements AfterViewInit, OnDestroy {
  @Input() docSrc?: string;
  readonly mermaidOptions: MermaidAPI.Config = {
    theme: MermaidAPI.Theme.Dark,
    themeVariables: {
      primaryColor: '#1e293b',
      primaryBorderColor: '#64748b',
      primaryTextColor: '#e2e8f0',
      secondaryColor: '#1e293b',
      secondaryTextColor: '#e2e8f0',
      tertiaryColor: '#1e293b',
      tertiaryTextColor: '#e2e8f0',
      textColor: '#e2e8f0',
      lineColor: '#94a3b8',
      mainBkg: '#1e293b',
      nodeBorder: '#64748b',
      clusterBkg: '#1e293b',
      clusterBorder: '#64748b',
      edgeLabelBackground: '#1e293b',
      labelTextColor: '#e2e8f0',
      titleColor: '#e2e8f0',
    },
  };
  tocItems: TocItem[] = [];
  activeId: string | null = null;

  private scrollContainer: HTMLElement | null = null;
  private observer?: IntersectionObserver;
  private expandOverrides = new Map<string, boolean>();

  constructor(
    route: ActivatedRoute,
    private readonly el: ElementRef<HTMLElement>,
    private readonly imageService: NzImageService,
  ) {
    this.docSrc = route.snapshot.data['docSrc'];
  }

  ngAfterViewInit(): void {
    this.scrollContainer = this.el.nativeElement.closest<HTMLElement>('.app-content');
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  onReady(): void {
    this.el.nativeElement.querySelectorAll('.markdown-body img').forEach(img => {
      img.addEventListener('click', () => {
        const image = img as HTMLImageElement;
        this.imageService.preview([{ src: image.src, alt: image.alt }]);
      });
    });

    const headingEls = this.el.nativeElement.querySelectorAll<HTMLElement>('.markdown-body h2, .markdown-body h3');
    this.tocItems = this.buildToc(headingEls);
    this.setupScrollSpy(headingEls);

    this.el.nativeElement.querySelectorAll<HTMLAnchorElement>('.markdown-body a[href^="#"]').forEach(link => {
      link.addEventListener('click', event => {
        event.preventDefault();
        const id = decodeURIComponent(link.getAttribute('href')!.slice(1));
        this.scrollToHeading(id);
      });
    });
  }

  isExpanded(item: TocItem): boolean {
    const override = this.expandOverrides.get(item.id);
    if (override !== undefined) {
      return override;
    }
    return this.activeId === item.id || item.children.some(child => child.id === this.activeId);
  }

  toggleExpand(item: TocItem, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.expandOverrides.set(item.id, !this.isExpanded(item));
  }

  scrollToHeading(id: string): void {
    const target = this.el.nativeElement.querySelector<HTMLElement>(`[id="${id}"]`);
    if (!target) {
      return;
    }
    this.activeId = id;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private buildToc(headingEls: NodeListOf<HTMLElement>): TocItem[] {
    const usedSlugs = new Map<string, number>();
    const toc: TocItem[] = [];
    let currentH2: TocItem | null = null;

    headingEls.forEach(heading => {
      const text = heading.textContent?.trim() ?? '';
      const id = this.slugify(text, usedSlugs);
      heading.id = id;

      const item: TocItem = { id, text, children: [] };
      if (heading.tagName === 'H2') {
        toc.push(item);
        currentH2 = item;
      } else if (currentH2) {
        currentH2.children.push(item);
      } else {
        toc.push(item);
      }
    });

    return toc;
  }

  private setupScrollSpy(headingEls: NodeListOf<HTMLElement>): void {
    this.observer?.disconnect();
    if (!this.scrollContainer || !headingEls.length) {
      return;
    }

    this.observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(entry => entry.isIntersecting);
        if (!visible.length) {
          return;
        }
        const topMost = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
        this.activeId = (topMost.target as HTMLElement).id;
      },
      {
        root: this.scrollContainer,
        rootMargin: '0px 0px -70% 0px',
        threshold: 0,
      },
    );

    headingEls.forEach(heading => this.observer!.observe(heading));
  }

  private slugify(text: string, usedSlugs: Map<string, number>): string {
    const slug = text
      .toLowerCase()
      .replace(/[`'"“”‘’.,:;!?()[\]{}<>#*_~/\\|@$%^&+=]/g, '')
      .trim()
      .replace(/\s+/g, '-');

    const count = usedSlugs.get(slug) ?? 0;
    usedSlugs.set(slug, count + 1);
    return count === 0 ? slug : `${slug}-${count}`;
  }
}
