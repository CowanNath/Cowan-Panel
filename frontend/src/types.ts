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
  /** 内网分组：探测时强制直连，不走代理 */
  lan?: boolean;
  items: Item[];
}

export interface Settings {
  siteTitle: string;
  theme: 'light' | 'dark' | 'auto';
  wallpaper?: string | null;
  groupLayout?: 'stack' | 'columns';
  proxy?: string;
  /** 外网分组探测时是否也走代理（内网分组始终直连） */
  probeViaProxy?: boolean;
}

export interface OverviewData {
  groups: Group[];
  settings: Settings;
}

export interface StatusEntry {
  id: number;
  lastStatus: 'up' | 'down' | 'unknown';
}
