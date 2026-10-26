export interface Item {
  id: number;
  groupId: number;
  name: string;
  url: string;
  iconUrl?: string | null;
  description?: string | null;
  sort: number;
  cardBackgroundColor?: string | null;
  openInNewTab: boolean;
  checkEnabled: boolean;
  lastStatus?: 'up' | 'down' | 'unknown' | null;
  lastCheckedAt?: string | null;
}

export interface Group {
  id: number;
  name: string;
  sort: number;
  items: Item[];
}

export interface Settings {
  siteTitle: string;
  theme: 'light' | 'dark' | 'auto';
  wallpaper?: string | null;
  groupLayout?: 'stack' | 'columns';
  proxy?: string;
  probeEnabled: boolean;
  probeInterval: number;
}

export interface OverviewData {
  groups: Group[];
  settings: Settings;
}

export interface StatusEntry {
  id: number;
  lastStatus: 'up' | 'down' | 'unknown';
}
