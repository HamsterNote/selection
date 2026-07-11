import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { OverlayRect, SelectionProps, SelectionRange, SelectionRef } from './types';
import { useTextSelection } from './useTextSelection';
import './style.css';

/** 生成唯一 ID（毫秒时间戳 + 6 位随机串） */
function generateId(): string {
  return `hsn-sel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 根据字符偏移量在容器内创建一个 DOM Range
 * 通过 TreeWalker 遍历所有文本节点，累加长度找到对应的 (node, offset)
 */
function createRangeFromOffsets(container: HTMLElement, start: number, end: number): Range | null {
  if (start < 0 || end < start) return null;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let charCount = 0;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;

  let node = walker.nextNode() as Text | null;
  while (node) {
    const nextCount = charCount + node.length;

    if (startNode === null && start <= nextCount) {
      startNode = node;
      startOffset = start - charCount;
    }
    if (end <= nextCount) {
      endNode = node;
      endOffset = end - charCount;
      break;
    }

    charCount = nextCount;
    node = walker.nextNode() as Text | null;
  }

  if (!startNode || !endNode) return null;

  try {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  } catch {
    return null;
  }
}

/** 把 Range 的 ClientRects 换算为相对容器的 Overlay 矩形数组（多行可能多个） */
function rangeToOverlayRects(range: Range, container: HTMLElement): OverlayRect[] {
  const containerRect = container.getBoundingClientRect();
  const rects = range.getClientRects();
  const out: OverlayRect[] = [];
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i];
    if (r.width <= 0 || r.height <= 0) continue;
    out.push({
      x: r.left - containerRect.left,
      y: r.top - containerRect.top,
      width: r.width,
      height: r.height,
    });
  }
  return out;
}

/** 浅比较两个持久 rect 列表，用于避免重复 setState 触发渲染循环 */
function rectListsEqual(
  a: Array<{ id: string; rects: OverlayRect[] }>,
  b: Array<{ id: string; rects: OverlayRect[] }>,
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].id !== b[i].id) return false;
    const ra = a[i].rects;
    const rb = b[i].rects;
    if (ra.length !== rb.length) return false;
    for (let j = 0; j < ra.length; j += 1) {
      if (
        ra[j].x !== rb[j].x ||
        ra[j].y !== rb[j].y ||
        ra[j].width !== rb[j].width ||
        ra[j].height !== rb[j].height
      ) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Selection 组件
 *
 * 设计要点：
 * 1. children 原样渲染到内容层（contentRef），组件不会修改/包装它们；
 * 2. 已确认的 ranges 与正在进行的选区都以「绝对定位的矩形」形式画在 Overlay 层上，
 *    通过 DOM Range + getClientRects 计算出每一行对应的矩形；
 * 3. 通过原生 ::selection 透明 + 自定义粉色 Overlay 实现自定义选择样式；
 * 4. 高亮按钮不再由组件内部渲染：通过 ref 暴露 highlight()/clear() 命令式 API
 *    供调用方在任意位置（例如自定义工具栏/外部按钮）触发。
 * 5. 组件为受控组件：ranges、selectedRangeId 均由外部管理；
 *    点击高亮 range 不再移除它，而是将其设为「选中」状态（toggle），通过 onSelectRange 回调上报。
 *    删除选区由外部调用方自行处理（例如在工具栏或列表中提供删除按钮）。
 *
 * 钩子（均在 props 中传入）：
 * - onSelectionStart(mousePos, selection)：容器内 mousedown 时触发；
 * - onSelectionEnd(mousePos, selection)：容器内 mouseup 且仍有有效选区时触发；
 * - onSelect(range)：执行 highlight() 后构造的 range 通过此回调上报（保持原行为）；
 * - onHighlight(range)：每次执行 highlight() 时额外触发，专门用于高亮叙事。
 * - onSelectRange(id|null)：当用户点击/取消选中某个高亮 range，或开始拖选新文本时触发。
 */
export const Selection = forwardRef<SelectionRef, SelectionProps>(function Selection(
  {
    children,
    ranges,
    selectedRangeId,
    onSelect,
    onSelectRange,
    onSelectionStart,
    onSelectionEnd,
    onHighlight,
    highlightColor,
    selectionColor,
    className,
  },
  ref,
): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const { selectedText, startIndex, endIndex, hasSelection, clear, rects } =
    useTextSelection(containerRef);

  /** 每个已确认 range 对应的 Overlay 矩形组 */
  const [persistedRects, setPersistedRects] = useState<Array<{ id: string; rects: OverlayRect[] }>>(
    [],
  );

  /**
   * 计算所有持久 range 的 Overlay 矩形。
   * 用函数式 setState + 浅比较，避免重复触发渲染。
   */
  const recomputePersistedRects = useCallback(() => {
    const container = containerRef.current;
    const next: Array<{ id: string; rects: OverlayRect[] }> = [];
    if (container) {
      for (const range of ranges) {
        const domRange = createRangeFromOffsets(container, range.start, range.end);
        if (!domRange) continue;
        next.push({ id: range.id, rects: rangeToOverlayRects(domRange, container) });
      }
    }
    setPersistedRects((prev) => (rectListsEqual(prev, next) ? prev : next));
  }, [ranges]);

  // ranges 变化时同步重算（layout effect 避免闪烁）。
  // 这是 React 官方推荐的 DOM 测量模式：useLayoutEffect 读取 DOM → setState 重渲。
  // 浅比较保证幂等，不会循环。lint 的 set-state-in-effect 在此模式下为误报。
  useLayoutEffect(() => {
    recomputePersistedRects();
  }, [recomputePersistedRects]);

  // 容器尺寸变化（窗口 resize、字体加载、外层 flex 重排）时重算
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => recomputePersistedRects());
    ro.observe(container);
    window.addEventListener('resize', recomputePersistedRects);
    document.addEventListener('scroll', recomputePersistedRects, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recomputePersistedRects);
      document.removeEventListener('scroll', recomputePersistedRects, true);
    };
  }, [recomputePersistedRects]);

  /**
   * 确认选区：构造 SelectionRange 并回调。
   * 触发顺序：onSelect → onHighlight → onSelectRange → clear()
   * onSelectRange 自动将新建的 range 设为「选中」，满足「刚高亮完的也算一种选中」的需求。
   */
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
    onHighlight?.(range);
    onSelectRange?.(range.id);
    clear();
  }, [
    hasSelection,
    selectedText,
    startIndex,
    endIndex,
    onSelect,
    onHighlight,
    onSelectRange,
    clear,
  ]);

  // 用 useImperativeHandle 暴露命令式 API。
  // 设计上仅暴露 highlight/clear 两个动作，不暴露内部状态——
  // 内部状态（选区文本、坐标）走 props 回调上报，避免外部直接读取造成耦合。
  useImperativeHandle(
    ref,
    () => ({
      highlight: handleConfirm,
      clear,
    }),
    [handleConfirm, clear],
  );

  // 容器 mousedown：把 selectionchange 之外的「开始」语义补齐。
  // selectionchange 仅在选区已经变化时触发，无法表达「用户开始按下鼠标准备拖选」这个动作，
  // 因此用原生 mousedown 作为开始信号；mouseup 时若仍有选区则视为结束。
  // 选区在 mousedown 时通常仍是上一次状态或空，因此原始 selection 直接传出供外部观察。
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (!onSelectionStart) return;
      const selection = window.getSelection();
      if (!selection) return;
      onSelectionStart({ x: e.clientX, y: e.clientY }, selection);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!onSelectionEnd) return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
      // 校验选区是否仍位于容器内（防止跨容器拖动尾点导致误触发）
      const range = selection.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) return;
      if (!selection.toString().trim()) return;
      onSelectionEnd({ x: e.clientX, y: e.clientY }, selection);
    };

    container.addEventListener('mousedown', handleMouseDown);
    // mouseup 监听挂在 document 上：用户可能在容器内按下后拖出容器再松开，
    // 这种情况下 mouseup 不会冒泡到容器，所以要在 document 层捕获。
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onSelectionStart, onSelectionEnd]);

  // 当用户开始拖选新文本时（hasSelection 变为 true），自动取消当前选中的高亮 range。
  // 这实现了「当前新选择而又没高亮的选区」与「已选中的高亮 range」互斥的需求。
  useEffect(() => {
    if (hasSelection) {
      onSelectRange?.(null);
    }
  }, [hasSelection, onSelectRange]);

  // 容器点击：用于「点击高亮以选中」的命中测试。
  // 高亮 Overlay 在文字下方，这里读容器坐标并和持久 rect 做矩形包含检测。
  // 如果当前是「拖选完成」的 click（getSelection 仍有文本），则不触发选中。
  // Toggle 行为：点击已选中的 range 取消选中，点击未选中的 range 设为选中。
  const handleContainerClick = useCallback(
    (e: MouseEvent) => {
      if (!onSelectRange) return;
      if (e.defaultPrevented) return;

      const target = e.target;
      if (
        target instanceof Element &&
        target.closest(
          'button, a, input, textarea, select, option, label, summary, details, [role="button"], [contenteditable="true"]',
        )
      ) {
        return;
      }

      const native = window.getSelection();
      if (native && !native.isCollapsed && native.toString().trim()) return;

      const container = containerRef.current;
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      const x = e.clientX - cRect.left;
      const y = e.clientY - cRect.top;

      for (const { id, rects: rs } of persistedRects) {
        for (const r of rs) {
          if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
            onSelectRange(id === selectedRangeId ? null : id);
            return;
          }
        }
      }
    },
    [onSelectRange, selectedRangeId, persistedRects],
  );

  // 用原生 click 监听挂在容器上；高亮的「点击选中」不是真正的按钮交互，
  // 不走 onClick 是为了避免给容器 div 加 onClick 引发的 a11y 规则误报。
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('click', handleContainerClick);
    return () => {
      container.removeEventListener('click', handleContainerClick);
    };
  }, [handleContainerClick]);

  return (
    <div
      ref={containerRef}
      className={`hsn-selection-container${className ? ` ${className}` : ''}`}
    >
      {/*
        Overlay 层（在内容下方）：持久高亮 + 当前选区，纯视觉。
        改用 <svg> 渲染，所有选框是 <rect>：
        - 比 <span> 绝对定位更适合「形状/笔触」类视觉表达（描边、圆角、未来可扩展斜线/波浪线下划线等）；
        - 单个 SVG 容器即可承载全部矩形，DOM 节点更少；
        - 选中态用 hsn-selection-rect--selected（带描边），未选中态用 hsn-selection-rect--highlight。
        SVG 用 preserveAspectRatio="none" 让坐标系等价于像素坐标。
      */}
      <svg
        className="hsn-selection-overlay"
        aria-hidden="true"
        role="presentation"
        focusable="false"
        preserveAspectRatio="none"
      >
        {persistedRects.map(({ id, rects: rs }) =>
          rs.map((r) => (
            <rect
              key={`${id}-${r.x},${r.y},${r.width},${r.height}`}
              className={`hsn-selection-rect ${
                id === selectedRangeId
                  ? 'hsn-selection-rect--selected'
                  : 'hsn-selection-rect--highlight'
              }`}
              x={r.x}
              y={r.y}
              width={r.width}
              height={r.height}
              rx={2}
              ry={2}
              {...(highlightColor && id !== selectedRangeId ? { fill: highlightColor } : null)}
            />
          )),
        )}

        {hasSelection &&
          rects.map((r) => (
            <rect
              key={`active-${r.x},${r.y},${r.width},${r.height}`}
              className="hsn-selection-rect hsn-selection-rect--active"
              x={r.x}
              y={r.y}
              width={r.width}
              height={r.height}
              rx={2}
              ry={2}
              {...(selectionColor ? { fill: selectionColor } : null)}
            />
          ))}
      </svg>

      {/* 内容层：children 原样渲染，不做任何包装 */}
      <div ref={contentRef} className="hsn-selection-content">
        {children}
      </div>
    </div>
  );
});

export default Selection;
