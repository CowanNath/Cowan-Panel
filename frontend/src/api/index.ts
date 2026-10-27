import axios from 'axios';
import type { Group, Item, OverviewData, Settings, StatusEntry } from '../types';

export const api = axios.create({ baseURL: '/api' });

export const fetchOverview = () =>
  api.get<OverviewData>('/overview').then((r) => r.data);

// groups
export const createGroup = (data: Partial<Pick<Group, 'name' | 'lan'>>) =>
  api.post<Group>('/groups', data).then((r) => r.data);
export const updateGroup = (id: number, data: Partial<Group>) =>
  api.put(`/groups/${id}`, data);
export const deleteGroup = (id: number) => api.delete(`/groups/${id}`);
export const sortGroups = (ids: number[]) =>
  api.put('/groups/sort', { ids });

// items
export const fetchItems = (groupId: number) =>
  api.get<Item[]>('/items', { params: { groupId } }).then((r) => r.data);
export const createItem = (data: Partial<Item>) =>
  api.post<Item>('/items', data).then((r) => r.data);
export const updateItem = (id: number, data: Partial<Item>) =>
  api.put(`/items/${id}`, data);
export const deleteItem = (id: number) => api.delete(`/items/${id}`);
export const sortItems = (ids: number[]) => api.put('/items/sort', { ids });
export const checkItem = (id: number) => api.post('/items/check', { id });
export const probeAll = () =>
  api
    .post<{
      total: number;
      up: number;
      down: number;
      items: { id: number; lastStatus: 'up' | 'down'; lastCheckedAt: string }[];
    }>('/probe/all', {}, { timeout: 120000 })
    .then((r) => r.data);

// status
export const fetchStatus = () =>
  api.get<StatusEntry[]>('/status').then((r) => r.data);

// icons
export const uploadIcon = (file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  return api
    .post<{ url: string }>('/icons/upload', fd)
    .then((r) => r.data.url);
};
export const fetchFavicon = (url: string) =>
  api
    .post<{ iconUrl: string }>('/favicon/fetch', { url })
    .then((r) => r.data.iconUrl);
export const backfillIcons = () =>
  api.post<{ started: boolean }>('/icons/backfill').then((r) => r.data);

// settings
export const getSettings = () =>
  api.get<Settings>('/settings').then((r) => r.data);
export const putSettings = (s: Settings) => api.put('/settings', s);

// import / export
export const importSunPanel = (content: unknown, mode: 'overwrite' | 'append') =>
  api.post('/import/sunpanel', content, { params: { mode } });
export const importFull = (content: unknown) =>
  api.post('/import/full', content);
export const exportSunPanel = () =>
  api.get('/export/sunpanel').then((r) => r.data);
export const exportFull = () => api.get('/export/full').then((r) => r.data);
