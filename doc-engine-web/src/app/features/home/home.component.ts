import { Component } from '@angular/core';
import { LearningProfileService, LearningTrack } from '../../core/learning-profile.service';
import { STORAGE_KEYS, readStringArray } from '../../core/local-storage';
import { ENGLISH_FEATURES, EnglishFeature } from '../english/english-features';
import { MENU_SECTIONS } from '../../layout/shell/menu.config';
import { NAVIGATION_ITEMS, NavigationItem } from '../../layout/shell/navigation';

interface SectionCard {
  title: string;
  icon: string;
  count: number;
  link: string;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent {
  readonly track: LearningTrack;
  readonly englishFeatures: EnglishFeature[] = ENGLISH_FEATURES;
  readonly recent: NavigationItem[];
  readonly sections: SectionCard[];
  readonly greeting = this.createGreeting();

  constructor(profile: LearningProfileService) {
    this.track = profile.track;

    const byLink = new Map(NAVIGATION_ITEMS.map(item => [item.link, item]));
    this.recent = readStringArray(STORAGE_KEYS.recent)
      .map(link => byLink.get(link))
      .filter((item): item is NavigationItem => !!item && item.track === this.track)
      .slice(0, 4);

    this.sections = MENU_SECTIONS.filter(section => (section.track ?? 'dev') === 'dev').map(
      section => {
        const items = NAVIGATION_ITEMS.filter(
          item => item.track === 'dev' && item.section === section.title,
        );
        return {
          title: section.title,
          icon: section.icon,
          count: items.length,
          link: items[0]?.link ?? '/',
        };
      },
    );
  }

  private createGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 11) {
      return 'Chào buổi sáng';
    }
    return hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  }
}
