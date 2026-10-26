import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { HolderOutlined } from '@ant-design/icons';
import type { Group, Item } from '../types';
import { BookmarkCard } from './Card';

export const GroupBlock: React.FC<{
  group: Group;
  onItemContextMenu?: (e: React.MouseEvent, item: Item) => void;
}> = ({ group, onItemContextMenu }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: group.id, data: { type: 'group' } });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <section ref={setNodeRef} style={style} className="group-block" id={`group-${group.id}`}>
      <div className="group-header">
        <span className="group-drag-handle" {...attributes} {...listeners} title="拖拽排序分组">
          <HolderOutlined />
        </span>
        <h2 className="group-title">{group.name}</h2>
      </div>
      <SortableContext items={group.items.map((i) => i.id)} strategy={rectSortingStrategy}>
        <div className="card-grid">
          {group.items.map((item) => (
            <BookmarkCard key={item.id} item={item} onContextMenu={onItemContextMenu} />
          ))}
        </div>
      </SortableContext>
      {group.items.length === 0 && <div className="group-empty">暂无卡片</div>}
    </section>
  );
};
