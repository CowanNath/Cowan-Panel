import React, { useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Item } from '../types';
import { usePanelStore } from '../stores/panel';
import { useIsDark } from '../theme';

function initialColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 45% 45%)`;
}

/** 卡片图标：加载失败（404/非图片）时自动回退为首字母占位 */
const CardIcon: React.FC<{ item: Item }> = ({ item }) => {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [item.iconUrl]);

  if (item.iconUrl && !broken) {
    return (
      <img
        className="bookmark-icon"
        src={item.iconUrl}
        alt=""
        draggable={false}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div className="bookmark-icon bookmark-letter" style={{ background: initialColor(item.name) }}>
      {item.name.charAt(0).toUpperCase()}
    </div>
  );
};

export const BookmarkCard: React.FC<{
  item: Item;
  onContextMenu?: (e: React.MouseEvent, item: Item) => void;
}> = ({ item, onContextMenu }) => {
  const isDark = useIsDark();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, data: { type: 'item', groupId: item.groupId } });
  const statusMap = usePanelStore((s) => s.statusMap);
  const probeEnabled = usePanelStore((s) => s.settings.probeEnabled);

  const status = item.checkEnabled ? statusMap[item.id] ?? item.lastStatus : undefined;
  const statusColor =
    status === 'up' ? '#52c41a' : status === 'down' ? '#ff4d4f' : '#9e9e9e';

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: item.cardBackgroundColor || (isDark ? '#2a2a2a6b' : '#ffffffb0'),
    backdropFilter: 'blur(8px)',
  };

  const open = () => {
    const url = /^https?:\/\//i.test(item.url) ? item.url : `https://${item.url}`;
    if (item.openInNewTab) window.open(url, '_blank');
    else window.location.href = url;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bookmark-card"
      {...attributes}
      {...listeners}
      onClick={open}
      onContextMenu={(e) => onContextMenu?.(e, item)}
    >
      <div className="bookmark-main">
        <CardIcon item={item} />
        <div className="bookmark-text">
          <div className="bookmark-name">{item.name}</div>
          {item.description && <div className="bookmark-desc">{item.description}</div>}
        </div>
      </div>
      {probeEnabled && item.checkEnabled && (
        <span className="status-dot" style={{ background: statusColor }} title={status} />
      )}
    </div>
  );
};

export const StaticCard: React.FC<{ item: Item; onEdit?: () => void; onDelete?: () => void }> = ({
  item,
  onEdit,
  onDelete,
}) => {
  const isDark = useIsDark();
  return (
    <div
      className="bookmark-card"
      style={{ background: item.cardBackgroundColor || (isDark ? '#2a2a2a6b' : '#ffffffb0') }}
      onClick={(e) => {
        const url = /^https?:\/\//i.test(item.url) ? item.url : `https://${item.url}`;
        if (item.openInNewTab) window.open(url, '_blank');
        else window.location.href = url;
        e.stopPropagation();
      }}
      onContextMenu={(e) => {
        if (!onEdit) return;
        e.preventDefault();
        onDelete?.();
      }}
    >
      <div className="bookmark-main">
        <CardIcon item={item} />
        <div className="bookmark-text">
          <div className="bookmark-name">{item.name}</div>
          {item.description && <div className="bookmark-desc">{item.description}</div>}
        </div>
      </div>
    </div>
  );
};
