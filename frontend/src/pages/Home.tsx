import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SettingOutlined, EditOutlined, DeleteOutlined, LinkOutlined, ExportOutlined } from '@ant-design/icons';
import { Modal, Spin, message as antdMessage } from 'antd';
import { usePanelStore } from '../stores/panel';
import { GroupBlock } from '../components/GroupBlock';
import { ItemEditor } from '../components/ItemEditor';
import { useIsDark } from '../theme';
import type { Item } from '../types';

const Clock: React.FC = () => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <span className="clock">
      {pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}
    </span>
  );
};

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const isDark = useIsDark();
  const { loading, groups, settings, load, applyStatus, reorderGroups, reorderItems, removeItem } =
    usePanelStore();
  const [activeItem, setActiveItem] = useState<{ id: number; name: string } | null>(null);
  // 右键菜单状态
  const [ctx, setCtx] = useState<{ x: number; y: number; item: Item } | null>(null);
  const [editor, setEditor] = useState<{ open: boolean; editing: Item | null }>({
    open: false,
    editing: null,
  });

  // 点击任意位置关闭右键菜单
  useEffect(() => {
    if (!ctx) return;
    const close = () => setCtx(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [ctx]);

  const onItemContextMenu = (e: React.MouseEvent, item: Item) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({ x: e.clientX, y: e.clientY, item });
  };

  const deleteItem = (item: Item) => {
    setCtx(null);
    Modal.confirm({
      title: `删除「${item.name}」？`,
      content: '删除后不可恢复（不影响该网站本身）。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await removeItem(item.id);
          antdMessage.success('已删除');
        } catch {
          antdMessage.error('删除失败');
        }
      },
    });
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  // 轮询在线状态：仅 probeEnabled
  useEffect(() => {
    if (!settings.probeEnabled) return;
    let stop = false;
    const poll = async () => {
      try {
        const r = await fetch('/api/status').then((r) => r.json());
        if (!stop && Array.isArray(r)) applyStatus(r);
      } catch {
        /* ignore */
      }
    };
    poll();
    const t = setInterval(poll, 30_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [settings.probeEnabled, applyStatus]);

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.sort - b.sort),
    [groups],
  );

  // 右侧分组导航：滚动时高亮当前分组
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);

  useEffect(() => {
    if (sortedGroups.length === 0) return;
    const els = sortedGroups
      .map((g) => document.getElementById(`group-${g.id}`))
      .filter((el): el is HTMLElement => !!el);
    if (els.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) {
          const id = Number(visible.target.id.replace('group-', ''));
          setActiveGroupId(id);
        }
      },
      { rootMargin: '-10% 0px -70% 0px', threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sortedGroups]);

  const jumpToGroup = (id: number) => {
    document.getElementById(`group-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const onDragStart = (e: DragStartEvent) => {
    if (e.active.data.current?.type === 'item') {
      const g = sortedGroups.find((g) => g.items.some((i) => i.id === e.active.id));
      const it = g?.items.find((i) => i.id === e.active.id);
      if (it) setActiveItem({ id: it.id, name: it.name });
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveItem(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const aType = active.data.current?.type;
    const oType = over.data.current?.type;

    if (aType === 'group') {
      // 分组间拖拽
      const ids = sortedGroups.map((g) => g.id);
      const from = ids.indexOf(active.id as number);
      const to = ids.indexOf(over.id as number);
      if (to < 0) return;
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      reorderGroups(ids).catch(() => undefined);
      return;
    }

    if (aType === 'item' && oType === 'item') {
      const groupId = active.data.current?.groupId as number;
      const overGroupId = over.data.current?.groupId as number;
      if (groupId !== overGroupId) return; // 简化：仅组内排序
      const g = sortedGroups.find((g) => g.id === groupId);
      if (!g) return;
      const ids = g.items.map((i) => i.id);
      const from = ids.indexOf(active.id as number);
      const to = ids.indexOf(over.id as number);
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      reorderItems(groupId, ids).catch(() => undefined);
    }
  };

  return (
    <div
      className={`page home ${isDark ? 'dark' : 'light'}`}
      style={settings.wallpaper ? { backgroundImage: `url(${settings.wallpaper})` } : undefined}
    >
      <header className="topbar">
        <h1 className="site-title">{settings.siteTitle || 'Cowan Panel'}</h1>
        <div className="topbar-right">
          <Clock />
          <button className="icon-btn" title="设置" onClick={() => navigate('/settings')}>
            <SettingOutlined />
          </button>
        </div>
      </header>

      {loading ? (
        <div className="loading-wrap">
          <Spin size="large" />
        </div>
      ) : (
        <main className="content">
          <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            <SortableContext items={sortedGroups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
              <div className={`groups-wrap ${settings.groupLayout === 'columns' ? 'columns' : ''}`}>
                {sortedGroups.map((g) => (
                  <GroupBlock key={g.id} group={g} onItemContextMenu={onItemContextMenu} />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeItem ? (
                <div className="drag-overlay-chip">{activeItem.name}</div>
              ) : null}
            </DragOverlay>
          </DndContext>
          {sortedGroups.length === 0 && (
            <div className="empty-home">还没有分组，前往设置页添加</div>
          )}
        </main>
      )}

      {!loading && sortedGroups.length > 0 && (
        <nav className="group-nav" aria-label="分组导航">
          {sortedGroups.map((g) => (
            <button
              key={g.id}
              className={`group-nav-item ${activeGroupId === g.id ? 'active' : ''}`}
              onClick={() => jumpToGroup(g.id)}
              title={g.name}
            >
              <span className="group-nav-dot" />
              <span className="group-nav-label">{g.name}</span>
            </button>
          ))}
        </nav>
      )}

      {ctx && (
        <div
          className="ctx-menu"
          style={{ left: Math.min(ctx.x, window.innerWidth - 160), top: Math.min(ctx.y, window.innerHeight - 170) }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="ctx-item"
            onClick={() => {
              setEditor({ open: true, editing: ctx.item });
              setCtx(null);
            }}
          >
            <EditOutlined /> 编辑
          </button>
          <button
            className="ctx-item"
            onClick={() => {
              navigator.clipboard?.writeText(ctx.item.url).then(
                () => antdMessage.success('链接已复制'),
                () => antdMessage.warning('复制失败'),
              );
              setCtx(null);
            }}
          >
            <LinkOutlined /> 复制链接
          </button>
          <button
            className="ctx-item"
            onClick={() => {
              const url = /^https?:\/\//i.test(ctx.item.url) ? ctx.item.url : `https://${ctx.item.url}`;
              window.open(url, '_blank');
              setCtx(null);
            }}
          >
            <ExportOutlined /> 新标签打开
          </button>
          <button className="ctx-item danger" onClick={() => deleteItem(ctx.item)}>
            <DeleteOutlined /> 删除
          </button>
        </div>
      )}

      <ItemEditor
        open={editor.open}
        editing={editor.editing}
        groups={sortedGroups}
        onClose={() => setEditor({ open: false, editing: null })}
      />
    </div>
  );
};
