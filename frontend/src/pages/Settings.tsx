import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { HolderOutlined } from '@ant-design/icons';
import {
  Button, Divider, Form, Input, Modal, Popconfirm, Radio,
  Space, Spin, Tabs, Upload, message as antdMessage,
} from 'antd';
import {
  ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, EditOutlined,
  PlusOutlined, ReloadOutlined, UploadOutlined, ArrowLeftOutlined, PictureOutlined,
} from '@ant-design/icons';
import { usePanelStore } from '../stores/panel';
import * as apiClient from '../api';
import type { Group, Item } from '../types';
import { ItemEditor } from '../components/ItemEditor';
import { useIsDark } from '../theme';

const downloadJson = (data: unknown, filename: string) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};

const GroupModal: React.FC<{
  open: boolean;
  editing?: Group | null;
  onClose: () => void;
}> = ({ open, editing, onClose }) => {
  const [form] = Form.useForm();
  const { addGroup, renameGroup } = usePanelStore();
  useEffect(() => {
    if (open) form.setFieldsValue({ name: editing?.name ?? '' });
  }, [open, editing, form]);

  const ok = async () => {
    const { name } = await form.validateFields();
    try {
      if (editing) await renameGroup(editing.id, name);
      else await addGroup(name);
      antdMessage.success('已保存');
      onClose();
    } catch {
      antdMessage.error('保存失败');
    }
  };
  return (
    <Modal
      title={editing ? '编辑分组' : '新增分组'}
      open={open}
      onCancel={onClose}
      onOk={ok}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="分组名称" rules={[{ required: true, message: '请输入名称' }]}>
          <Input placeholder="如：常用工具" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

// ItemEditor 已抽取到 components/ItemEditor.tsx，此处直接使用

const BasicTab: React.FC = () => {
  const { settings, setSettings, load } = usePanelStore();
  const [form] = Form.useForm();
  useEffect(() => {
    form.setFieldsValue(settings);
  }, [settings, form]);

  const save = async () => {
    const v = await form.validateFields();
    try {
      await setSettings({ ...settings, ...v });
      antdMessage.success('已保存');
    } catch {
      antdMessage.error('保存失败');
    }
  };

  return (
    <Form form={form} layout="vertical" style={{ maxWidth: 520 }}>
      <Form.Item name="siteTitle" label="站点标题">
        <Input />
      </Form.Item>
      <Form.Item name="theme" label="主题">
        <Radio.Group
          options={[
            { value: 'light', label: '亮色' },
            { value: 'dark', label: '暗色' },
            { value: 'auto', label: '跟随系统' },
          ]}
          optionType="button"
        />
      </Form.Item>
      <Form.Item label="壁纸">
        <Space.Compact style={{ width: '100%' }}>
          <Form.Item name="wallpaper" noStyle>
            <Input placeholder="图片 URL，留空则无壁纸" />
          </Form.Item>
          <Upload
            accept="image/*"
            showUploadList={false}
            customRequest={async ({ file }) => {
              try {
                const url = await apiClient.uploadIcon(file as File);
                await setSettings({ ...settings, wallpaper: url });
                antdMessage.success('壁纸已上传并保存');
              } catch {
                antdMessage.error('上传失败');
              }
            }}
          >
            <Button icon={<UploadOutlined />}>上传</Button>
          </Upload>
        </Space.Compact>
      </Form.Item>
      <Form.Item name="groupLayout" label="分组排列">
        <Radio.Group
          options={[
            { value: 'stack', label: '上下堆叠' },
            { value: 'columns', label: '左右多列' },
          ]}
          optionType="button"
        />
      </Form.Item>
      <Space>
        <Button type="primary" onClick={save}>
          保存设置
        </Button>
        <Button icon={<ReloadOutlined />} onClick={() => load()}>
          重新加载
        </Button>
      </Space>
    </Form>
  );
};

// 网络 Tab：图标抓取代理设置
const NetworkTab: React.FC = () => {
  const { settings, setSettings } = usePanelStore();
  const [form] = Form.useForm();
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    form.setFieldsValue({ proxy: settings.proxy ?? '' });
  }, [settings.proxy, form]);

  const save = async () => {
    const v = await form.validateFields();
    try {
      await setSettings({ ...settings, proxy: (v.proxy ?? '').trim() });
      antdMessage.success('代理设置已保存');
    } catch {
      antdMessage.error('保存失败');
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      await apiClient.fetchFavicon('https://www.google.com/');
      antdMessage.success('代理可用：已成功抓取 Google 图标');
    } catch {
      antdMessage.error('抓取失败：代理不可用，或目标站点拒绝访问');
    } finally {
      setTesting(false);
    }
  };

  return (
    <Form form={form} layout="vertical" style={{ maxWidth: 520 }}>
      <Form.Item
        name="proxy"
        label="图标抓取代理"
        tooltip="留空则直连（不读取 Windows 系统代理）。支持 http:// 代理，例如 Clash/V2Ray 常见的 http://127.0.0.1:7890"
        extra="仅用于抓取网站图标 favicon；在线探测始终直连，不受此设置影响。"
      >
        <Input placeholder="http://127.0.0.1:7890（留空 = 直连）" />
      </Form.Item>
      <Space>
        <Button type="primary" onClick={save}>
          保存
        </Button>
        <Button loading={testing} onClick={test}>
          测试代理
        </Button>
      </Space>
    </Form>
  );
};

// 设置页可拖拽行：整行可拖，行内按钮点击不受影响
const SortableManageRow: React.FC<{
  id: number;
  className?: string;
  children: React.ReactNode;
}> = ({ id, className = '', children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`manage-row ${className}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        cursor: 'grab',
      }}
    >
      <HolderOutlined style={{ opacity: 0.4, flexShrink: 0 }} />
      {children}
    </div>
  );
};

const ManageTab: React.FC = () => {
  const { groups, removeGroup, removeItem, reorderGroups, reorderItems, load } = usePanelStore();
  const [groupModal, setGroupModal] = useState<{ open: boolean; editing: Group | null }>({
    open: false,
    editing: null,
  });
  const [itemModal, setItemModal] = useState<{
    open: boolean;
    editing: Item | null;
    defaultGroupId?: number;
  }>({ open: false, editing: null });
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onGroupDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = sortedGroups.map((g) => g.id);
    const from = ids.indexOf(active.id as number);
    const to = ids.indexOf(over.id as number);
    if (to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    await reorderGroups(ids);
  };

  const onItemDragEnd = async (e: DragEndEvent) => {
    if (!activeGroup) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = activeItems.map((i) => i.id);
    const from = ids.indexOf(active.id as number);
    const to = ids.indexOf(over.id as number);
    if (to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    await reorderItems(activeGroup.id, ids);
  };

  const sortedGroups = [...groups].sort((a, b) => a.sort - b.sort);
  const activeGroup = sortedGroups.find((g) => g.id === selectedGroup) ?? sortedGroups[0];
  const activeItems = activeGroup
    ? [...activeGroup.items].sort((a, b) => a.sort - b.sort)
    : [];

  const moveGroup = async (index: number, dir: -1 | 1) => {
    const ids = sortedGroups.map((g) => g.id);
    const to = index + dir;
    if (to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ids.splice(index, 1)[0]);
    await reorderGroups(ids);
  };

  const moveItem = async (index: number, dir: -1 | 1) => {
    if (!activeGroup) return;
    const ids = activeItems.map((i) => i.id);
    const to = index + dir;
    if (to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ids.splice(index, 1)[0]);
    await reorderItems(activeGroup.id, ids);
  };

  const [filling, setFilling] = useState(false);
  const fillMissingIcons = async () => {
    const missing = () => groups.flatMap((g) => g.items).filter((i) => !i.iconUrl && !!i.url).length;
    if (missing() === 0) {
      antdMessage.info('没有缺失图标的卡片');
      return;
    }
    setFilling(true);
    const total = missing();
    const key = `fill-${Date.now()}`;
    antdMessage.open({ content: `后端正在补全图标（共 ${total} 个）…`, key, duration: 0 });
    try {
      await apiClient.backfillIcons();
      // 轮询进度：每 3 秒刷新一次数据，直到缺失数量不再下降或为 0
      let last = total;
      for (let i = 0; i < 200; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        await load();
        const left = missing();
        antdMessage.open({
          content: `补全图标中：已完成 ${total - left}/${total}（剩余 ${left}）`,
          key,
          duration: 0,
        });
        if (left === 0 || left === last) {
          if (left === last && left > 0) {
            // 数量不再变化，说明剩余站点抓取失败
            antdMessage.open({ content: `补全结束：成功 ${total - left}，失败 ${left}`, key, duration: 4 });
          } else {
            antdMessage.open({ content: `图标补全完成：${total} 个全部成功`, key, duration: 4 });
          }
          break;
        }
        last = left;
      }
    } catch {
      antdMessage.open({ content: '补全失败', key, duration: 4 });
    } finally {
      setFilling(false);
    }
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setGroupModal({ open: true, editing: null })}
        >
          新增分组
        </Button>
        <Button
          icon={<PlusOutlined />}
          disabled={!activeGroup}
          onClick={() => setItemModal({ open: true, editing: null, defaultGroupId: activeGroup?.id })}
        >
          新增卡片
        </Button>
        <Button
          icon={<PictureOutlined />}
          loading={filling}
          onClick={() => fillMissingIcons().catch(() => { setFilling(false); antdMessage.error('补全失败'); })}
        >
          一键补全缺失图标
        </Button>
      </Space>

      <div className="manage-columns">
        <div className="manage-col">
          <Divider orientation="left" plain>
            分组（拖拽排序）
          </Divider>
          <DndContext sensors={sensors} onDragEnd={(e) => onGroupDragEnd(e).catch(() => undefined)}>
            <SortableContext items={sortedGroups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
              <div className="manage-list">
                {sortedGroups.map((g) => (
                  <SortableManageRow key={g.id} id={g.id} className={activeGroup?.id === g.id ? 'active' : ''}>
                    <span className="manage-name" onClick={() => setSelectedGroup(g.id)} style={{ cursor: 'pointer' }}>
                      {g.name}
                    </span>
                    <span className="manage-sub" onClick={() => setSelectedGroup(g.id)} style={{ cursor: 'pointer' }}>
                      {g.items.length} 个卡片
                    </span>
                    <Space onClick={(e) => e.stopPropagation()}>
                      <Button size="small" icon={<ArrowUpOutlined />} onClick={() => moveGroup(sortedGroups.indexOf(g), -1)} />
                      <Button size="small" icon={<ArrowDownOutlined />} onClick={() => moveGroup(sortedGroups.indexOf(g), 1)} />
                      <Button
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => setGroupModal({ open: true, editing: g })}
                      />
                      <Popconfirm
                        title="删除分组及其所有卡片？"
                        onConfirm={() => removeGroup(g.id).catch(() => antdMessage.error('删除失败'))}
                      >
                        <Button size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  </SortableManageRow>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <div className="manage-col">
          <Divider orientation="left" plain>
            「{activeGroup?.name ?? '-'}」的卡片（拖拽排序）
          </Divider>
          <DndContext sensors={sensors} onDragEnd={(e) => onItemDragEnd(e).catch(() => undefined)}>
            <SortableContext items={activeItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <div className="manage-list">
                {activeItems.map((it) => (
                  <SortableManageRow key={it.id} id={it.id}>
                    {it.iconUrl && <img className="manage-icon" src={it.iconUrl} alt="" />}
                    <span className="manage-name">{it.name}</span>
                    <span className="manage-sub">{it.url}</span>
                    <Space onClick={(e) => e.stopPropagation()}>
                      <Button size="small" icon={<ArrowUpOutlined />} onClick={() => moveItem(activeItems.indexOf(it), -1)} />
                      <Button size="small" icon={<ArrowDownOutlined />} onClick={() => moveItem(activeItems.indexOf(it), 1)} />
                      <Button
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => setItemModal({ open: true, editing: it })}
                      />
                      <Popconfirm
                        title="删除该卡片？"
                        onConfirm={() => removeItem(it.id).catch(() => antdMessage.error('删除失败'))}
                      >
                        <Button size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  </SortableManageRow>
                ))}
                {activeGroup && activeItems.length === 0 && <div className="group-empty">暂无卡片</div>}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>

      <GroupModal
        open={groupModal.open}
        editing={groupModal.editing}
        onClose={() => setGroupModal({ open: false, editing: null })}
      />
      <ItemEditor
        open={itemModal.open}
        editing={itemModal.editing}
        groups={sortedGroups}
        defaultGroupId={itemModal.defaultGroupId}
        onClose={() => setItemModal({ open: false, editing: null })}
      />
    </div>
  );
};

const DataTab: React.FC = () => {
  const { load } = usePanelStore();
  const [mode, setMode] = useState<'overwrite' | 'append'>('overwrite');
  const [busy, setBusy] = useState(false);

  const readFile = (file: File): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(JSON.parse(String(r.result)));
      r.onerror = reject;
      r.readAsText(file);
    });

  const doImport = async (file: File, kind: 'sunpanel' | 'full') => {
    setBusy(true);
    try {
      const content = await readFile(file);
      if (kind === 'sunpanel') await apiClient.importSunPanel(content, mode);
      else await apiClient.importFull(content);
      antdMessage.success('导入成功');
      await load();
    } catch (e) {
      const resp = (e as { response?: { status?: number; data?: unknown } }).response;
      if (kind === 'sunpanel' && resp?.status === 404) antdMessage.error('导入失败：文件格式不合法');
      else antdMessage.error('导入失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <Divider orientation="left" plain>
        sun-panel 格式
      </Divider>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Radio.Group
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          options={[
            { value: 'overwrite', label: '覆盖导入' },
            { value: 'append', label: '追加导入' },
          ]}
          optionType="button"
        />
        <Upload
          accept=".json"
          showUploadList={false}
          maxCount={1}
          disabled={busy}
          customRequest={({ file }) => doImport(file as File, 'sunpanel')}
        >
          <Button icon={<UploadOutlined />} loading={busy}>
            导入 sun-panel JSON
          </Button>
        </Upload>
        <Space>
          <Button
            onClick={async () => {
              try {
                downloadJson(await apiClient.exportSunPanel(), 'sun-panel-config.json');
              } catch {
                antdMessage.error('导出失败');
              }
            }}
          >
            导出 sun-panel 格式
          </Button>
        </Space>

        <Divider orientation="left" plain>
          全量备份
        </Divider>
        <Space>
          <Upload
            accept=".json"
            showUploadList={false}
            maxCount={1}
            disabled={busy}
            customRequest={({ file }) => doImport(file as File, 'full')}
          >
            <Button icon={<UploadOutlined />} loading={busy}>
              导入全量备份
            </Button>
          </Upload>
          <Button
            onClick={async () => {
              try {
                downloadJson(await apiClient.exportFull(), `cowan-panel-backup.json`);
              } catch {
                antdMessage.error('导出失败');
              }
            }}
          >
            导出全量备份
          </Button>
        </Space>
      </Space>
    </div>
  );
};

export const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { loading, load } = usePanelStore();
  const isDark = useIsDark();
  const settings = usePanelStore((s) => s.settings);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  return (
    <div className={`page settings-page ${isDark ? 'dark' : 'light'}`}
      style={settings.wallpaper ? { backgroundImage: `url(${settings.wallpaper})` } : undefined}
    >
      <header className="topbar">
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>
            返回
          </Button>
          <h1 className="site-title">设置</h1>
        </Space>
      </header>
      <main className="content">
        {loading ? (
          <Spin size="large" />
        ) : (
          <div className="settings-card">
            <Tabs
              items={[
                { key: 'basic', label: '基本设置', children: <BasicTab /> },
                { key: 'manage', label: '分组与卡片', children: <ManageTab /> },
                { key: 'network', label: '网络', children: <NetworkTab /> },
                { key: 'data', label: '数据', children: <DataTab /> },
              ]}
            />
          </div>
        )}
      </main>
    </div>
  );
};
