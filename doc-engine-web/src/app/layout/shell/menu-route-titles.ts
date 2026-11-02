import { Route, Routes } from '@angular/router';
import { MENU_SECTIONS, MenuItem } from './menu.config';

const APP_TITLE = 'Dev Internals';

function createMenuTitleMap(): Map<string, string> {
  const titles = new Map<string, string>();

  for (const section of MENU_SECTIONS) {
    addItemTitles(titles, section.items ?? [], [], section.title);

    for (const group of section.groups ?? []) {
      if (group.link) {
        titles.set(group.link, `${group.title} | ${section.title} | ${APP_TITLE}`);
      }

      addItemTitles(titles, group.items ?? [], [group.title], section.title);
    }
  }

  return titles;
}

function addItemTitles(
  titles: Map<string, string>,
  items: MenuItem[],
  ancestors: string[],
  sectionTitle: string,
): void {
  for (const item of items) {
    if (item.link) {
      titles.set(item.link, [item.label, ...ancestors, sectionTitle, APP_TITLE].join(' | '));
    }

    addItemTitles(titles, item.children ?? [], [item.label, ...ancestors], sectionTitle);
  }
}

const menuTitles = createMenuTitleMap();

export function withMenuRouteTitles(routes: Routes): Routes {
  return routes.map(route => applyTitle(route));
}

function applyTitle(route: Route, parentPath = ''): Route {
  const path = joinPaths(parentPath, route.path);
  const title = menuTitles.get(path);

  return {
    ...route,
    ...(title ? { title } : {}),
    ...(route.children ? { children: route.children.map(child => applyTitle(child, path)) } : {}),
  };
}

function joinPaths(parentPath: string, routePath?: string): string {
  const segments = [parentPath, routePath]
    .filter((path): path is string => !!path)
    .map(path => path.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean);

  return `/${segments.join('/')}`;
}
