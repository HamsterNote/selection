import { useCallback, useRef } from 'react';
import type { SelectionProps, SelectionRange } from './types';
import { useTextSelection } from './useTextSelection';
import './style.css';

/** 生成唯一 ID（毫秒时间戳 + 6 位随机串） */
function generateId(): string {
  return `hsn-sel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Selection 组件
 *
 * 用于在文本内容上实现高亮选区功能：
 * 1. 渲染文本，并将已有的 ranges 高亮显示
 * 2. 用户选中文本后弹出工具栏，点击确认触发 onSelect
 * 3. 点击已有高亮区域触发 onRemove
 */
export function Selection({
  content,
  ranges,
  onSelect,
  onRemove,
  highlightColor,
  className,
}: SelectionProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const { selectedText, startIndex, endIndex, hasSelection, clear, toolbar } =
    useTextSelection(containerRef);

  /** 确认选区：构造 SelectionRange 并回调 */
  const handleConfirm = useCallback(() => {
    if (!hasSelection || !selectedText) return;

    const range: SelectionRange = {
      id: generateId(),
      text: selectedText,
      start: startIndex,
      end: endIndex,
      createdAt: Date.now(),
    };

    onSelect?.(range);
    clear();
  }, [hasSelection, selectedText, startIndex, endIndex, onSelect, clear]);

  /**
   * 渲染高亮文本
   * 将 content 按已有 ranges 分段：普通文本 + 高亮片段交替
   */
  const renderHighlightedContent = (): React.ReactNode[] => {
    if (ranges.length === 0) return [content];

    // 按起始位置排序，避免乱序
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    const parts: React.ReactNode[] = [];
    let cursor = 0;

    for (const range of sorted) {
      if (range.start > cursor) {
        parts.push(content.slice(cursor, range.start));
      }
      parts.push(
        <button
          key={range.id}
          type="button"
          className="hsn-selection-highlight"
          style={highlightColor ? { backgroundColor: highlightColor } : undefined}
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.(range.id);
          }}
          title="点击移除高亮"
        >
          {content.slice(range.start, range.end)}
        </button>,
      );
      cursor = range.end;
    }

    if (cursor < content.length) {
      parts.push(content.slice(cursor));
    }

    return parts;
  };

  return (
    <div
      ref={containerRef}
      className={`hsn-selection-container${className ? ` ${className}` : ''}`}
    >
      {renderHighlightedContent()}

      {toolbar && hasSelection && (
        <div className="hsn-selection-toolbar" style={{ left: toolbar.x, top: toolbar.y }}>
          <button
            type="button"
            className="hsn-selection-toolbar-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleConfirm}
          >
            高亮
          </button>
        </div>
      )}
    </div>
  );
}

export default Selection;
