import { MENU_SECTIONS, MenuItem, MenuSection, MenuTrack } from './menu.config';

export interface NavigationItem {
  label: string;
  context: string;
  section: string;
  track: MenuTrack;
  link: string;
  searchText: string;
}

export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function createItem(
  label: string,
  context: string,
  section: MenuSection,
  link: string,
): NavigationItem {
  return {
    label,
    context,
    section: section.title,
    track: section.track ?? 'dev',
    link,
    searchText: normalizeText(`${label} ${context} ${section.title}`),
  };
}

function appendItems(
  target: NavigationItem[],
  menuItems: MenuItem[] | undefined,
  section: MenuSection,
  ancestors: string[],
): void {
  for (const item of menuItems ?? []) {
    if (item.link) {
      const context = ancestors.length ? ancestors.join(' · ') : item.label;
      target.push(createItem(item.label, context, section, item.link));
    }

    appendItems(target, item.children, section, [...ancestors, item.label]);
  }
}

export function buildNavigationItems(sections: MenuSection[]): NavigationItem[] {
  const items: NavigationItem[] = [];

  for (const section of sections) {
    appendItems(items, section.items, section, []);

    for (const group of section.groups ?? []) {
      if (group.link) {
        items.push(createItem(group.title, group.title, section, group.link));
      }
      appendItems(items, group.items, section, [group.title]);
    }
  }

  return items;
}

export const NAVIGATION_ITEMS = buildNavigationItems(MENU_SECTIONS);
