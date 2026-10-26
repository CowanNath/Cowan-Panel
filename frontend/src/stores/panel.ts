import { create } from 'zustand';
import type { Group, Item, Settings, StatusEntry } from '../types';
import * as apiClient from '../api';

export const DEFAULT_SETTINGS: Settings = {
  siteTitle: 'Cowan Panel',
  theme: 'auto',
  wallpaper: '',
  groupLayout: 'stack',
  proxy: '',
  probeEnabled: false,
  probeInterval: 60,
};

// 把后端返回的设置统一归一化为前端语义类型（容忍字符串布尔/数字）
const normalizeSettings = (raw: Partial<Settings>): Settings => ({
  siteTitle: String(raw.siteTitle ?? ''),
  theme: (raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : 'auto'),
  wallpaper: raw.wallpaper ? String(raw.wallpaper) : '',
  groupLayout: raw.groupLayout === 'columns' ? 'columns' : 'stack',
  proxy: raw.proxy ? String(raw.proxy) : '',
  probeEnabled: raw.probeEnabled === true || (raw.probeEnabled as unknown) === 'true',
  probeInterval: Number(raw.probeInterval) > 0 ? Number(raw.probeInterval) : 60,
});

interface PanelState {
  loading: boolean;
  groups: Group[];
  settings: Settings;
  statusMap: Record<number, string>;
  load: () => Promise<void>;
  setSettings: (s: Settings, persist?: boolean) => Promise<void>;
  applyStatus: (list: StatusEntry[]) => void;

  addGroup: (name: string) => Promise<void>;
  renameGroup: (id: number, name: string) => Promise<void>;
  removeGroup: (id: number) => Promise<void>;
  reorderGroups: (ids: number[]) => Promise<void>;

  addItem: (item: Partial<Item>) => Promise<void>;
  editItem: (id: number, data: Partial<Item>) => Promise<void>;
  removeItem: (id: number) => Promise<void>;
  reorderItems: (groupId: number, ids: number[]) => Promise<void>;
  recheckItem: (id: number) => Promise<void>;
}

export const usePanelStore = create<PanelState>((set, get) => ({
  loading: true,
  groups: [],
  settings: DEFAULT_SETTINGS,
  statusMap: {},

  load: async () => {
    const data = await apiClient.fetchOverview();
    set({ groups: data.groups || [], settings: normalizeSettings(data.settings ?? {}), loading: false });
  },

  setSettings: async (s, persist = true) => {
    set({ settings: s });
    if (persist) await apiClient.putSettings(s);
  },

  applyStatus: (list) =>
    set((st) => {
      const map: Record<number, string> = { ...st.statusMap };
      for (const e of list) map[e.id] = e.lastStatus;
      return { statusMap: map };
    }),

  addGroup: async (name) => {
    const g = await apiClient.createGroup({ name });
    set((st) => ({ groups: [...st.groups, { ...g, items: [] }] }));
  },

  renameGroup: async (id, name) => {
    await apiClient.updateGroup(id, { name });
    set((st) => ({
      groups: st.groups.map((g) => (g.id === id ? { ...g, name } : g)),
    }));
  },

  removeGroup: async (id) => {
    await apiClient.deleteGroup(id);
    set((st) => ({ groups: st.groups.filter((g) => g.id !== id) }));
  },

  reorderGroups: async (ids) => {
    set((st) => {
      const byId = new Map(st.groups.map((g) => [g.id, g]));
      const next = ids.map((id) => byId.get(id)!).filter(Boolean);
      return { groups: next.map((g, i) => ({ ...g, sort: i + 1 })) };
    });
    await apiClient.sortGroups(ids);
  },

  addItem: async (item) => {
    const it = await apiClient.createItem(item);
    set((st) => ({
      groups: st.groups.map((g) =>
        g.id === it.groupId ? { ...g, items: [...g.items, it] } : g,
      ),
    }));
  },

  editItem: async (id, data) => {
    await apiClient.updateItem(id, data);
    set((st) => ({
      groups: st.groups.map((g) => ({
        ...g,
        items: g.items.map((it) => (it.id === id ? { ...it, ...data, id } : it)),
      })),
    }));
  },

  removeItem: async (id) => {
    await apiClient.deleteItem(id);
    set((st) => ({
      groups: st.groups.map((g) => ({ ...g, items: g.items.filter((it) => it.id !== id) })),
    }));
  },

  reorderItems: async (groupId, ids) => {
    set((st) => ({
      groups: st.groups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              items: ids
                .map((id) => g.items.find((it) => it.id === id)!)
                .filter(Boolean)
                .map((it, i) => ({ ...it, sort: i + 1 })),
            }
          : g,
      ),
    }));
    await apiClient.sortItems(ids);
  },

  recheckItem: async (id) => {
    const r = await apiClient.checkItem(id);
    const status = r?.data?.lastStatus;
    if (status) {
      set((st) => ({ statusMap: { ...st.statusMap, [id]: status } }));
    }
    get();
  },
}));
