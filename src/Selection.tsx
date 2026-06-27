import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties } from 'react';
import {
  getEffectiveLinkedOverlayRectType,
  getEffectiveLegacyOverlayRectType,
  pixelRectsToPercentRects,
  percentRectsToPixelRects,
  storeRectsForOverlayRectType,
} from './geometry';
import {
  getRegisteredContainers,
  registerLinkedContainer,
  resolveEndpoint,
  syncSelectionOrder,
} from './linkedRegistry';
import { createLinkedDomRangeFromEndpoints, updateLinkedRangeFromEndpoints } from './linkedRange';
import type {
  HandlePosition,
  HandleRenderProps,
  LinkedSelectionData,
  LinkedSelectionDragState,
  LinkedSelectionRange,
  OverlayRect,
  OverlayRectType,
  PercentOverlayRect,
  SelectionHandleOwner,
  SelectionHandleType,
  SelectionProps,
  SelectionRange,
  SelectionRef,
} from './types';
import {
  buildPercentRectStyle,
  completeRangeStyleSnapshot,
  createRangeStyleSnapshot,
  deriveHandleVisualStyle,
  getEffectiveMarkerStyle,
  getEffectiveSelectedMarkerStyle,
  getEffectiveSelectionStyle,
  styleShallowEqual,
  styleToSvgRectProps,
  type StyleInput,
} from './styleUtils';
import { useTextSelection } from './useTextSelection';
import './style.css';

type PersistedRectGroup = {
  id: string;
  selectionId: string | null;
  overlayRectType: OverlayRectType;
  rects: OverlayRect[];
  percentRects: PercentOverlayRect[];
  markerStyle?: CSSProperties;
  selectionStyle?: CSSProperties;
};

type LinkedModeContext = {
  selectionId: string;
  data: LinkedSelectionData;
};

/** 生成唯一 ID（毫秒时间戳 + 6 位随机串） */
function generateId(): string {
  return `hsn-sel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 根据字符偏移量在容器内创建一个 DOM Range
 * 通过 TreeWalker 遍历所有文本节点，累加长度找到对应的 (node, offset)
 */
function createRangeFromOffsets(container: HTMLElement, start: number, end: number): Range | null {
  if (start < 0 || end < 0) return null;
  // 支持反向传入（start > end）：自动交换以构造正向 Range。
  // 拖拽手柄允许两边界自由越过彼此，这里统一兜底方向。
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  if (hi <= lo) return null;

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

/**
 * 在视口坐标 (clientX, clientY) 处获取 caret (文本节点 + 偏移)。
 * 用于拖拽手柄时根据鼠标位置反查新的选区边界。
 * 兼容 WebKit 的 caretRangeFromPoint 与 Firefox 的 caretPositionFromPoint。
 */
function caretInfoFromPoint(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (typeof doc.caretRangeFromPoint === 'function') {
    const r = doc.caretRangeFromPoint(x, y);
    if (r?.startContainer) return { node: r.startContainer, offset: r.startOffset };
    return null;
  }
  if (typeof document.caretPositionFromPoint === 'function') {
    const p = document.caretPositionFromPoint(x, y);
    if (p) return { node: p.offsetNode, offset: p.offset };
    return null;
  }
  return null;
}

/** 把 Range 的 ClientRects 换算为相对容器的 Overlay 矩形数组（多行可能多个） */
function createTextFragmentRange(range: Range, textNode: Text): Range | null {
  if (!range.intersectsNode(textNode)) return null;

  const textRange = document.createRange();
  textRange.selectNodeContents(textNode);

  let startOffset = 0;
  let endOffset = textNode.length;

  if (range.compareBoundaryPoints(Range.START_TO_START, textRange) > 0) {
    if (range.startContainer !== textNode) return null;
    startOffset = range.startOffset;
  }

  if (range.compareBoundaryPoints(Range.END_TO_END, textRange) < 0) {
    if (range.endContainer !== textNode) return null;
    endOffset = range.endOffset;
  }

  if (endOffset <= startOffset) return null;

  const fragment = document.createRange();
  fragment.setStart(textNode, startOffset);
  fragment.setEnd(textNode, endOffset);

  if (fragment.collapsed || !fragment.toString()) return null;
  return fragment;
}

function rangeToOverlayRects(range: Range, container: HTMLElement): OverlayRect[] {
  const containerRect = container.getBoundingClientRect();
  const out: OverlayRect[] = [];

  // 原生 Range#getClientRects() 在跨块选择时可能包含块级父容器 rect。
  // 按文本节点切片后再取 rect，可以只绘制实际被选中的文字行盒。
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node instanceof Text) {
      const textFragment = createTextFragmentRange(range, node);
      if (textFragment) {
        const rects = textFragment.getClientRects();
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
      }
    }
    node = walker.nextNode();
  }
  return out;
}

/** 浅比较两个持久 rect 列表，用于避免重复 setState 触发渲染循环 */
function rectListsEqual(a: PersistedRectGroup[], b: PersistedRectGroup[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].id !== b[i].id) return false;
    if (a[i].selectionId !== b[i].selectionId) return false;
    if (a[i].overlayRectType !== b[i].overlayRectType) return false;
    if (!styleShallowEqual(a[i].markerStyle, b[i].markerStyle)) return false;
    if (!styleShallowEqual(a[i].selectionStyle, b[i].selectionStyle)) return false;
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
    const pa = a[i].percentRects;
    const pb = b[i].percentRects;
    if (pa.length !== pb.length) return false;
    for (let j = 0; j < pa.length; j += 1) {
      if (
        pa[j].x !== pb[j].x ||
        pa[j].y !== pb[j].y ||
        pa[j].width !== pb[j].width ||
        pa[j].height !== pb[j].height
      ) {
        return false;
      }
    }
  }
  return true;
}

function getLinkedModeContext(
  linkedMode: boolean | undefined,
  selectionId: string | undefined,
  linkedData: LinkedSelectionData | undefined,
): LinkedModeContext | null {
  if (!linkedMode || !linkedData) return null;
  const normalizedSelectionId = selectionId?.trim();
  if (!normalizedSelectionId) return null;
  return { selectionId: normalizedSelectionId, data: linkedData };
}

function isLinkedItemVisibleInSelection(item: LinkedSelectionRange, selectionId: string): boolean {
  return (
    item.start.selectionId === selectionId ||
    item.end.selectionId === selectionId ||
    item.rectsBySelectionId[selectionId] !== undefined
  );
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
    selectionId,
    linkedMode,
    linkedData,
    onLinkedDataChange,
    onLinkedSelect,
    onLinkedUpdateRange,
    onLinkedSelectRange,
    ranges,
    selectedRangeId,
    onSelect,
    onSelectRange,
    onSelectionStart,
    onSelectionEnd,
    onHighlight,
    onUpdateRange,
    highlightColor,
    selectionColor,
    className,
    popover,
    selectionPopover,
    newSelectionOptions,
    renderHandle,
    markerColors,
    markerStyle,
    selectionStyle,
    overlayRectType,
  },
  ref,
): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Popover DOM 引用，用于「点击文档其它位置取消选中」时排除 popover 内部点击
  const popoverRef = useRef<HTMLDivElement>(null);
  // 选区（活跃，未高亮）Popover 的 DOM 引用；用于点击事件外排除
  const selectionPopoverRef = useRef<HTMLDivElement>(null);

  const linkedContext = useMemo(
    () => getLinkedModeContext(linkedMode, selectionId, linkedData),
    [linkedMode, selectionId, linkedData],
  );
  const linkedSelectionId = linkedContext?.selectionId ?? null;
  const legacyOverlayRectType = overlayRectType ?? 'px';
  const linkedOverlayRectType = linkedContext?.data.overlayRectType ?? overlayRectType ?? 'percent';

  // 样式输入：新 API + 旧版兼容 props，memo 化避免稳定引用变化导致不必要的重渲染。
  const styleInput: StyleInput = useMemo(
    () => ({
      markerStyle,
      selectionStyle,
      markerColors,
      highlightColor,
      selectionColor,
      newSelectionOptions,
    }),
    [markerStyle, selectionStyle, markerColors, highlightColor, selectionColor, newSelectionOptions],
  );
  // 写入 range 数据时的样式快照，浅拷贝以保证老数据不受后续 props 变化影响。
  const styleSnapshot = useMemo(() => createRangeStyleSnapshot(styleInput), [styleInput]);
  // 活跃选区始终使用当前 props 解析出的 selectionStyle（尚未持久化）。
  const activeSelectionStyle = useMemo(
    () => getEffectiveSelectionStyle(undefined, styleInput),
    [styleInput],
  );
  // pointermove 监听器通过 ref 读取最新样式输入，避免重注册。
  const styleInputRef = useRef(styleInput);
  styleInputRef.current = styleInput;

  const { selectedText, startIndex, endIndex, hasSelection, clear, rects, linkedRange } =
    useTextSelection(containerRef, {
      linkedMode: !!linkedContext,
      selectionId: linkedSelectionId,
      overlayRectType: linkedOverlayRectType,
      markerStyle: styleSnapshot.markerStyle,
      selectionStyle: styleSnapshot.selectionStyle,
    });

  // 拖拽手柄状态：'start' 代表调整选区起点，'end' 代表调整终点
  const [dragHandle, setDragHandle] = useState<'start' | 'end' | null>(null);
  const dragHandleRef = useRef<'start' | 'end' | null>(null);
  // 当前拖动的是哪个高亮 range（null 表示拖动的是活跃选区，而非高亮 range）。
  const [dragPersistedId, setDragPersistedId] = useState<string | null>(null);
  const dragPersistedIdRef = useRef<string | null>(null);
  const dragLinkedAnchorRef = useRef<LinkedSelectionRange['start'] | null>(null);
  // 拖动期间的「锚点」：不动的那个边界的纯文本偏移。
  // 拖 start 时锚点=end，拖 end 时锚点=start。缓存以避免 selectionchange 同步更新 ref 导致锚点漂移。
  const dragAnchorRef = useRef<number>(-1);
  // 被拖动手柄的 DOM 引用：拖动开始时设为手柄元素，用于 onUp 恢复 pointerEvents。
  // 避免依赖 React state → CSS class 链（重渲染延迟导致首帧 pointermove 命中手柄）。
  const dragHandleElRef = useRef<HTMLElement | null>(null);
  // 拖动结束后设为 true，阻止紧随其后的合成 click 事件误触「点击高亮选中」的 toggle 逻辑。
  // pointerup → click 顺序由浏览器保证；在 handleContainerClick 中消费一次即清除。
  const skipClickRef = useRef(false);
  const startIndexRef = useRef(startIndex);
  const endIndexRef = useRef(endIndex);
  startIndexRef.current = startIndex;
  endIndexRef.current = endIndex;
  // 桥接 ref：让 pointermove 监听器读取最新 ranges / onUpdateRange 而不触发重注册。
  const rangesRef = useRef(ranges);
  rangesRef.current = ranges;
  const onUpdateRangeRef = useRef(onUpdateRange);
  onUpdateRangeRef.current = onUpdateRange;
  const linkedDataRef = useRef(linkedData);
  linkedDataRef.current = linkedData;
  const onLinkedDataChangeRef = useRef(onLinkedDataChange);
  onLinkedDataChangeRef.current = onLinkedDataChange;
  // 桥接 ref：联动模式下拖拽手柄监听器需要读取最新的 onLinkedUpdateRange
  const onLinkedUpdateRangeRef = useRef(onLinkedUpdateRange);
  onLinkedUpdateRangeRef.current = onLinkedUpdateRange;
  // 桥接 ref：startHandleDrag（useCallback 空 deps）需要读取当前 linkedSelectionId
  const linkedSelectionIdRef = useRef(linkedSelectionId);
  linkedSelectionIdRef.current = linkedSelectionId;

  /**
   * 更新联动模式共享的拖拽状态。
   * 通过 ref 读取最新 linkedData / onLinkedDataChange，避免闭包过期。
   */
  const setLinkedDraggingRange = useCallback(
    (draggingRange: LinkedSelectionDragState | null) => {
      const data = linkedDataRef.current;
      const onChange = onLinkedDataChangeRef.current;
      if (!data || !onChange) return;
      onChange({ ...data, draggingRange });
    },
    [],
  );

  /**
   * 更新联动模式共享的「正在鼠标拖选新文本」状态。
   * 通过 ref 读取最新 linkedData / onLinkedDataChange，避免闭包过期。
   */
  const setLinkedSelectingText = useCallback(
    (selectingText: boolean) => {
      const data = linkedDataRef.current;
      const onChange = onLinkedDataChangeRef.current;
      if (!data || !onChange) return;
      onChange({ ...data, selectingText });
    },
    [],
  );

  // 桥接 ref：容器 mousedown 监听需要读取最新 hasSelection / rects，但 effect 不重注册。
  const hasSelectionRef = useRef(hasSelection);
  hasSelectionRef.current = hasSelection;
  const rectsRef = useRef(rects);
  rectsRef.current = rects;
  const currentSelectedRangeId = linkedContext
    ? linkedContext.data.selectedRangeId
    : selectedRangeId;
  const linkedDraggingRange = linkedContext?.data.draggingRange ?? null;
  const isLinkedActiveSelectionDragging = linkedDraggingRange?.type === 'active-selection';
  const isLinkedSelectedRangeDragging =
    linkedDraggingRange?.type === 'persisted-range' &&
    linkedDraggingRange.id === currentSelectedRangeId;
  const isLinkedSelectingText = linkedContext?.data.selectingText ?? false;
  const selectRange = linkedContext ? onLinkedSelectRange : onSelectRange;
  // 鼠标驱动的新文本选择手势进行中：从 mousedown 开始，到 mouseup 或选区消失结束。
  // 该状态期间隐藏活跃选区手柄，避免手柄干扰拖选；点击已有活跃选区 rect 内部不进入此状态。
  const [isSelectingText, setIsSelectingText] = useState(false);
  const isSelectingTextRef = useRef(isSelectingText);
  isSelectingTextRef.current = isSelectingText;

  const getLinkedSelectionOrder = useCallback(
    () => getRegisteredContainers().map((entry) => entry.selectionId),
    [],
  );

  useEffect(() => {
    if (!linkedMode) return;
    if (selectionId?.trim()) return;
    if (import.meta.env.DEV) {
      console.warn('Selection linkedMode requires a non-empty selectionId.');
    }
  }, [linkedMode, selectionId]);

  useEffect(() => {
    if (!linkedSelectionId) return;
    const container = containerRef.current;
    if (!container) return;

    const unregister = registerLinkedContainer(linkedSelectionId, container);
    syncSelectionOrder(
      linkedDataRef.current,
      getLinkedSelectionOrder(),
      onLinkedDataChangeRef.current,
    );

    return () => {
      unregister();
      syncSelectionOrder(
        linkedDataRef.current,
        getLinkedSelectionOrder(),
        onLinkedDataChangeRef.current,
      );
    };
  }, [getLinkedSelectionOrder, linkedSelectionId]);

  useEffect(() => {
    if (!linkedContext) return;
    syncSelectionOrder(linkedContext.data, getLinkedSelectionOrder(), onLinkedDataChange);
  }, [getLinkedSelectionOrder, linkedContext, onLinkedDataChange]);

  // 旧版 markerColors.handle 仍作为手柄样式的最后回退，保留引用以便传给 deriveHandleVisualStyle。
  const legacyHandleFallback = markerColors?.handle;

  /** 每个已确认 range 对应的 Overlay 矩形组 */
  const [persistedRects, setPersistedRects] = useState<PersistedRectGroup[]>([]);

  /**
   * 计算所有持久 range 的 Overlay 矩形。
   * 用函数式 setState + 浅比较，避免重复触发渲染。
   */
  const recomputePersistedRects = useCallback(() => {
    const container = containerRef.current;
    const next: PersistedRectGroup[] = [];
    if (container) {
      if (linkedContext) {
        for (const item of linkedContext.data.items) {
          if (!isLinkedItemVisibleInSelection(item, linkedContext.selectionId)) continue;
          const storedRects = item.rectsBySelectionId[linkedContext.selectionId];
          if (!storedRects) continue;
          const itemOverlayRectType = getEffectiveLinkedOverlayRectType(item);
          const itemPixelRects =
            itemOverlayRectType === 'px'
              ? storedRects
              : percentRectsToPixelRects(storedRects, container);
          const itemPercentRects =
            itemOverlayRectType === 'percent'
              ? storedRects
              : pixelRectsToPercentRects(storedRects, container);
          next.push({
            id: item.id,
            selectionId: linkedContext.selectionId,
            overlayRectType: itemOverlayRectType,
            rects: itemPixelRects,
            percentRects: itemPercentRects,
            markerStyle: item.markerStyle,
            selectionStyle: item.selectionStyle,
          });
        }
      } else {
        for (const range of ranges) {
          const rangeOverlayRectType = getEffectiveLegacyOverlayRectType(range, legacyOverlayRectType);
          const storedRects = range.rects;
          const measuredRects = (() => {
            const domRange = createRangeFromOffsets(container, range.start, range.end);
            return domRange ? rangeToOverlayRects(domRange, container) : [];
          })();
          const sourceRects = storedRects && storedRects.length > 0 ? storedRects : measuredRects;
          const rangePixelRects =
            rangeOverlayRectType === 'px'
              ? sourceRects
              : percentRectsToPixelRects(sourceRects, container);
          const rangePercentRects =
            rangeOverlayRectType === 'percent'
              ? sourceRects
              : pixelRectsToPercentRects(sourceRects, container);
          next.push({
            id: range.id,
            selectionId: null,
            overlayRectType: rangeOverlayRectType,
            rects: rangePixelRects,
            percentRects: rangePercentRects,
            markerStyle: range.markerStyle,
            selectionStyle: range.selectionStyle,
          });
        }
      }
    }
    setPersistedRects((prev) => (rectListsEqual(prev, next) ? prev : next));
  }, [legacyOverlayRectType, linkedContext, ranges]);

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
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recomputePersistedRects);
    };
  }, [recomputePersistedRects]);

  /**
   * 确认选区：构造 SelectionRange 并回调。
   * 触发顺序：onSelect → onHighlight → onSelectRange → clear()
   * onSelectRange 自动将新建的 range 设为「选中」，满足「刚高亮完的也算一种选中」的需求。
   */
  const handleConfirm = useCallback(() => {
    if (!hasSelection || !selectedText) return;

    if (linkedContext) {
      if (!linkedRange) {
        clear();
        return;
      }

      const nextData: LinkedSelectionData = {
        ...linkedContext.data,
        items: [...linkedContext.data.items, linkedRange],
        selectedRangeId: linkedRange.id,
      };
      onLinkedDataChange?.(nextData);
      onLinkedSelect?.(linkedRange);
      onLinkedSelectRange?.(linkedRange.id);

      if (
        linkedRange.start.selectionId === linkedSelectionId &&
        linkedRange.end.selectionId === linkedSelectionId
      ) {
        const localRange: SelectionRange = {
          id: linkedRange.id,
          text: linkedRange.text,
          start: linkedRange.start.offset,
          end: linkedRange.end.offset,
          createdAt: linkedRange.createdAt,
          overlayRectType: linkedRange.overlayRectType,
          rects: linkedRange.rectsBySelectionId[linkedSelectionId],
          markerStyle: linkedRange.markerStyle,
          selectionStyle: linkedRange.selectionStyle,
        };
        onSelect?.(localRange);
        onHighlight?.(localRange);
      }

      clear();
      return;
    }

    const container = containerRef.current;
    if (!container) return;
    const rangeOverlayRectType = legacyOverlayRectType;
    const range: SelectionRange = {
      id: generateId(),
      text: selectedText,
      start: startIndex,
      end: endIndex,
      createdAt: Date.now(),
      overlayRectType: rangeOverlayRectType,
      rects: storeRectsForOverlayRectType(rects, rangeOverlayRectType, container),
      ...styleSnapshot,
    };

    onSelect?.(range);
    onHighlight?.(range);
    selectRange?.(range.id);
    clear();
  }, [
    hasSelection,
    selectedText,
    linkedContext,
    linkedRange,
    linkedSelectionId,
    onLinkedDataChange,
    onLinkedSelect,
    onLinkedSelectRange,
    clear,
    startIndex,
    endIndex,
    onSelect,
    onHighlight,
    legacyOverlayRectType,
    rects,
    selectRange,
    styleSnapshot,
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
      const target = e.target;
      if (target instanceof Element && target.closest('.hsn-selection-handle')) {
        e.preventDefault();
        return;
      }
      if (target instanceof Node && selectionPopoverRef.current?.contains(target)) {
        return;
      }

      // 拖动 range handle 期间，容器 mousedown 不应干预原生选区。
      if (dragHandleRef.current || dragPersistedIdRef.current) {
        return;
      }

      // 点击在活跃选区 rect 内部时阻止默认行为并保留选区，
      // 但不进入「新选择中」状态——否则点击选区内部会误隐藏手柄。
      if (hasSelectionRef.current && rectsRef.current.length > 0) {
        const cRect = container.getBoundingClientRect();
        const x = e.clientX - cRect.left;
        const y = e.clientY - cRect.top;
        for (const r of rectsRef.current) {
          if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
            e.preventDefault();
            return;
          }
        }
      }

      // 开始新的鼠标选择手势：隐藏活跃选区手柄直到 mouseup。
      setIsSelectingText(true);
      setLinkedSelectingText(true);
      if (!onSelectionStart) return;
      const selection = window.getSelection();
      if (!selection) return;
      onSelectionStart({ x: e.clientX, y: e.clientY }, selection);
    };

    const handleMouseUp = (e: MouseEvent) => {
      const selection = window.getSelection();
      const target = e.target;
      if (target instanceof Node && selectionPopoverRef.current?.contains(target)) {
        return;
      }
      setIsSelectingText(false);
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (!(target instanceof Node) || !container.contains(target)) return;
      if (!range.intersectsNode(container)) return;
      if (!selection.toString().trim()) return;
      // 标记跳过紧随其后的 click 事件，避免 handleContainerClick 将拖拽结束
      // 时鼠标位置判定为「点击在选区 rect 外部」而误清除刚形成的活跃选区。
      skipClickRef.current = true;
      // 只有真正接收本次 mouseup 的容器才能清理 linked selectingText。
      // 否则 page-a 的 document 监听会在 page-b 前先清理共享状态，触发父级重渲染，
      // 导致 page-b 的 mouseup 监听在同一事件分发中被移除，进而漏掉 end 事件。
      setLinkedSelectingText(false);
      onSelectionEnd?.({ x: e.clientX, y: e.clientY }, selection);
    };

    container.addEventListener('mousedown', handleMouseDown);
    // mouseup 监听挂在 document 上：用户可能在容器内按下后拖出容器再松开，
    // 这种情况下 mouseup 不会冒泡到容器，所以要在 document 层捕获。
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onSelectionStart, onSelectionEnd, setLinkedSelectingText]);

  useEffect(() => {
    if (!hasSelection) {
      setIsSelectingText(false);
      setLinkedSelectingText(false);
    }
  }, [hasSelection, setLinkedSelectingText]);

  // 触摸设备长按文字触发的原生 contextmenu（系统选区菜单/复制弹窗）需屏蔽。
  // 仅在 pointerType === 'touch' 时 preventDefault，桌面右键菜单不受影响。
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleContextMenu = (e: MouseEvent) => {
      // contextmenu 的 TS 类型是 MouseEvent，但触摸触发时浏览器实际派发的是 PointerEvent 子类，
      // 其上携带 pointerType。用 in 守卫做类型窄化，避免 as any。
      if ('pointerType' in e && (e as PointerEvent).pointerType === 'touch') {
        e.preventDefault();
      }
    };
    container.addEventListener('contextmenu', handleContextMenu);
    return () => {
      container.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  // 当用户开始拖选新文本时（hasSelection 变为 true），自动取消当前选中的高亮 range。
  // 这实现了「当前新选择而又没高亮的选区」与「已选中的高亮 range」互斥的需求。
  useEffect(() => {
    if (hasSelection) {
      selectRange?.(null);
    }
  }, [hasSelection, selectRange]);

  // 容器点击：用于「点击高亮以选中」的命中测试。
  // 高亮 Overlay 在文字下方，这里读容器坐标并和持久 rect 做矩形包含检测。
  // 如果当前是「拖选完成」的 click（getSelection 仍有文本），则不触发选中。
  // Toggle 行为：点击已选中的 range 取消选中，点击未选中的 range 设为选中。
  const handleContainerClick = useCallback(
    (e: MouseEvent) => {
      if (!selectRange) return;
      // 拖拽手柄结束后浏览器合成 click 事件，此处消费 skip 标记并跳过命中测试，
      // 避免拖拽后误触发 toggle 清空 selectedRangeId。
      if (skipClickRef.current) {
        skipClickRef.current = false;
        return;
      }

      // 点击来自 Popover 或选区 Popover 内部时，不做命中测试。
      // 否则点击删除按钮等操作会冒泡到 container click，
      // 导致对 Popover 位置坐标做 hit-test 选中了下方的高亮。
      // 此检查需在 hasSelection 分支之前，避免点击 popover 按钮时误清除文字选区。
      const target = e.target;
      if (target instanceof Node) {
        const popoverEl = popoverRef.current;
        const selectionPopoverEl = selectionPopoverRef.current;
        if (popoverEl?.contains(target)) return;
        if (selectionPopoverEl?.contains(target)) return;
      }

      // 已有文字选区时：点击选区 rect 内部保留选区，点击外部清除文字选择。
      // 替代原先「有原生选区则直接 return」的逻辑，使得点击空白处可取消选区。
      if (hasSelection) {
        const container = containerRef.current;
        if (!container) return;
        const cRect = container.getBoundingClientRect();
        const x = e.clientX - cRect.left;
        const y = e.clientY - cRect.top;
        for (const r of rects) {
          if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
            return; // 点击在活跃选区 rect 内部，保留选区
          }
        }
        clear(); // 点击在活跃选区 rect 外部，清除文字选择
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
            selectRange(id === currentSelectedRangeId ? null : id);
            return;
          }
        }
      }
    },
    [selectRange, currentSelectedRangeId, persistedRects, hasSelection, rects, clear],
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

  // 点击文档任意位置取消选中，除了 Popover 内部。
  // 用 mousedown 而非 click，确保比容器内的 click 早触发：
  //   mousedown(document) → click(container) → click(document)
  // 这样即使点击是落在另一个高亮 rect 上，document 先清空，
  // 紧接着 container 的 click 通过 hit-test 再把新 rect 设为选中，最终状态正确。
  // 点击 popover 内部不应取消选中，所以排除 popoverRef 命中的目标。
  useEffect(() => {
    if (!currentSelectedRangeId || !selectRange) return;
    const handleDocMouseDown = (e: MouseEvent) => {
      if (dragHandleRef.current || dragPersistedIdRef.current) return;
      if (e.target instanceof Element && e.target.closest('.hsn-selection-handle')) return;
      const selectedEntry = persistedRects.find((entry) => entry.id === currentSelectedRangeId);
      if (selectedEntry && selectedEntry.rects.length > 0) {
        const first = selectedEntry.rects[0];
        const last = selectedEntry.rects[selectedEntry.rects.length - 1];
        const container = containerRef.current;
        if (container) {
          const containerRect = container.getBoundingClientRect();
          const x = e.clientX - containerRect.left;
          const y = e.clientY - containerRect.top;
          const nearStartHandle = Math.hypot(x - first.x, y - (first.y + first.height / 2)) <= 24;
          const nearEndHandle = Math.hypot(x - (last.x + last.width), y - (last.y + last.height / 2)) <= 24;
          if (nearStartHandle || nearEndHandle) return;
        }
      }
      if (e.target instanceof Element && e.target.closest('.hsn-selection-popover')) return;
      const popoverEl = popoverRef.current;
      if (popoverEl && e.target instanceof Node && popoverEl.contains(e.target)) return;
      selectRange(null);
    };
    document.addEventListener('mousedown', handleDocMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleDocMouseDown);
    };
  }, [currentSelectedRangeId, persistedRects, selectRange]);

  /**
   * 手柄 pointerdown：进入拖动模式。
   * preventDefault 阻止浏览器开始新的原生文本选区；
   * stopPropagation 阻止冒泡到容器，避免误触发「点击高亮选中」逻辑。
   * 第二参数 rangeId 可选：传入则表示拖动的是已选中高亮 range 的手柄（修改其 start/end）；
   * 不传则拖动的是活跃选区手柄（修改原生 selection）。
   */
  const startHandleDrag = useCallback(
    (which: 'start' | 'end', rangeId?: string) => (e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      // 立即设内联 pointer-events: none，不依赖 React 重渲染 → CSS class 链。
      // 首帧 pointermove 在 React commit 前就可能触发，若手柄仍 intercept 事件，
      // caretRangeFromPoint 会命中手柄而非文字，导致选区跳变/闪烁。
      e.currentTarget.style.pointerEvents = 'none';
      dragHandleElRef.current = e.currentTarget;
      dragHandleRef.current = which;
      dragPersistedIdRef.current = rangeId ?? null;

      // 缓存拖动锚点：不动的那个边界。拖 start 锚点=end，拖 end 锚点=start。
      // 活跃选区从 ref 读取当前 endIndex/startIndex；高亮 range 从 ranges 读取当前 range 的 end/start。
      if (rangeId) {
        const linkedData = linkedDataRef.current;
        const currentSelId = linkedSelectionIdRef.current;
        if (linkedData && currentSelId) {
          const item = linkedData.items.find((it) => it.id === rangeId);
          if (!item) {
            dragAnchorRef.current = -1;
            return;
          }
          dragLinkedAnchorRef.current = which === 'start' ? item.end : item.start;
          dragAnchorRef.current = which === 'start' ? item.end.offset : item.start.offset;
        } else {
          // legacy 模式
          const r = rangesRef.current.find((x) => x.id === rangeId);
          dragAnchorRef.current = r ? (which === 'start' ? r.end : r.start) : -1;
        }
      } else {
        dragAnchorRef.current = which === 'start' ? endIndexRef.current : startIndexRef.current;
        dragLinkedAnchorRef.current = linkedRange
          ? which === 'start'
            ? linkedRange.end
            : linkedRange.start
          : null;
      }
      // 在联动模式下同步共享拖拽状态，让所有关联容器都能隐藏对应手柄/Popover。
      const currentLinkedData = linkedDataRef.current;
      const currentLinkedSelectionId = linkedSelectionIdRef.current;
      if (currentLinkedData && currentLinkedSelectionId) {
        setLinkedDraggingRange(
          rangeId ? { type: 'persisted-range', id: rangeId } : { type: 'active-selection' },
        );
      }

      setDragHandle(which);
      setDragPersistedId(rangeId ?? null);
    },
    [linkedRange, setLinkedDraggingRange],
  );

  /**
   * 拖动进行中 / 结束的全局 pointer 监听。
   * 仅在 dragHandle 非 null（拖动激活）时挂载，拖动结束自动解除。
   * 在 pointermove 中：
   *   1) 通过 caretInfoFromPoint 在鼠标处反查 caret 的 (node, offset)；
   *   2) 用 preRange 累计字符长度，换算为容器纯文本偏移；
   *   3) 以拖动开始时缓存的 anchor（不动边界）为锚点，newOffset 为移动边界，
   *      用 Math.min/max 生成正端 lo/hi，允许越过锚点实现反向选区；
   *   4) 活跃选区：构造 DOM Range + setSelection 触发 selectionchange → hook 更新 rects；
   *      高亮 range：构造 updated SelectionRange + onUpdateRange 上报，并同步原生 selection 以更新 persisted rects。
   * 监听器依赖 [dragHandle]：拖动开始时挂载，结束时卸载，期间不会随 startIndex/endIndex 变化重注册
   * （使用 rangesRef / dragAnchorRef 桥接最新值，避免 selectionchange 同步更新 ref 导致锚点漂移）。
   */
  useEffect(() => {
    if (!dragHandle) return;
    const onMove = (e: PointerEvent) => {
      const which = dragHandleRef.current;
      if (!which) return;
      const container = containerRef.current;
      if (!container) return;

      const info = caretInfoFromPoint(e.clientX, e.clientY);
      if (!info) return;

      const persistedId = dragPersistedIdRef.current;
      const linkedMovingEndpoint = linkedDataRef.current
        ? resolveEndpoint(info.node, info.offset)
        : null;
      if (persistedId) {
        const linkedData = linkedDataRef.current;
        const currentSelId = linkedSelectionIdRef.current;
        const anchorEndpoint = dragLinkedAnchorRef.current;
        if (linkedData && currentSelId && anchorEndpoint) {
          const item = linkedData.items.find((it) => it.id === persistedId);
          if (!item) return;
          if (!linkedMovingEndpoint) return;

          const updatedItem = updateLinkedRangeFromEndpoints({
            item,
            fixedEndpoint: anchorEndpoint,
            movingEndpoint: linkedMovingEndpoint,
            containers: getRegisteredContainers(),
            fallbackStyleSnapshot: styleSnapshot,
          });
          if (!updatedItem) return;
          if (
            updatedItem.start.selectionId === item.start.selectionId &&
            updatedItem.start.offset === item.start.offset &&
            updatedItem.end.selectionId === item.end.selectionId &&
            updatedItem.end.offset === item.end.offset
          ) {
            return;
          }

          const nextData: LinkedSelectionData = {
            ...linkedData,
            items: linkedData.items.map((it) => (it.id === persistedId ? updatedItem : it)),
          };
          onLinkedUpdateRangeRef.current?.(updatedItem);
          onLinkedDataChangeRef.current?.(nextData);
          return;
        }
      }

      const activeLinkedAnchor = dragLinkedAnchorRef.current;
      if (!persistedId && activeLinkedAnchor && linkedMovingEndpoint) {
        const linkedDomRange = createLinkedDomRangeFromEndpoints({
          fixedEndpoint: activeLinkedAnchor,
          movingEndpoint: linkedMovingEndpoint,
          containers: getRegisteredContainers(),
        });
        const selection = window.getSelection();
        if (!linkedDomRange || !selection) return;
        selection.removeAllRanges();
        selection.addRange(linkedDomRange);
        return;
      }

      if (!container.contains(info.node)) return;

      const preRange = document.createRange();
      preRange.selectNodeContents(container);
      try {
        preRange.setEnd(info.node, info.offset);
      } catch {
        return;
      }
      const newOffset = preRange.toString().length;

      if (persistedId) {
        // legacy 模式分支
        const cur = rangesRef.current.find((r) => r.id === persistedId);
        if (!cur) return;
        const anchor = dragAnchorRef.current;
        if (anchor < 0) return;
        // 锚点固定为拖动开始时的不动边界，移动边界跟随鼠标，允许越过实现反向。
        const lo = Math.min(anchor, newOffset);
        const hi = Math.max(anchor, newOffset);
        if (hi - lo < 1) return;
        if (lo === cur.start && hi === cur.end) return;

        const domRange = createRangeFromOffsets(container, lo, hi);
        if (!domRange) return;
        const updated: SelectionRange = {
          ...cur,
          start: lo,
          end: hi,
          text: domRange.toString(),
          overlayRectType: getEffectiveLegacyOverlayRectType(cur, legacyOverlayRectType),
          rects: storeRectsForOverlayRectType(
            rangeToOverlayRects(domRange, container),
            getEffectiveLegacyOverlayRectType(cur, legacyOverlayRectType),
            container,
          ),
          ...completeRangeStyleSnapshot(
            { markerStyle: cur.markerStyle, selectionStyle: cur.selectionStyle },
            styleInputRef.current,
          ),
        };
        // 仅上报更新；不设原生选区。
        // persistedRects 由 ranges prop 变化驱动重算（useLayoutEffect），无需 selectionchange。
        // 若设原生选区会触发 hasSelection=true → onSelectRange(null) 副作用，
        // 清空 selectedRangeId 导致高亮样式与 Popover 消失。
        onUpdateRangeRef.current?.(updated);
        return;
      }

      const anchor = dragAnchorRef.current;
      if (anchor < 0) return;
      // 锚点是拖动开始时缓存的不动边界，移动边界跟随鼠标。允许越过锚点实现反向选区。
      const lo = Math.min(anchor, newOffset);
      const hi = Math.max(anchor, newOffset);
      if (hi - lo < 1) return;

      const newRange = createRangeFromOffsets(container, lo, hi);
      if (!newRange) return;

      const sel = window.getSelection();
      if (!sel) return;
      sel.removeAllRanges();
      sel.addRange(newRange);
    };
    const onUp = () => {
      const persistedId = dragPersistedIdRef.current;
      if (dragHandleElRef.current) {
        dragHandleElRef.current.style.pointerEvents = '';
        dragHandleElRef.current = null;
      }
      skipClickRef.current = true;
      dragHandleRef.current = null;
      dragPersistedIdRef.current = null;
      dragLinkedAnchorRef.current = null;
      dragAnchorRef.current = -1;
      setDragHandle(null);
      setDragPersistedId(null);
      if (persistedId) {
        selectRange?.(persistedId);
      }

      // 清除联动模式共享拖拽状态，让关联容器重新显示手柄/Popover。
      if (linkedDataRef.current) {
        setLinkedDraggingRange(null);
      }
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
  }, [dragHandle, legacyOverlayRectType, selectRange, setLinkedDraggingRange, styleSnapshot]);

  // 计算 Popover 的锚点：选中 range 的最顶部矩形的水平中点 + 顶边。
  // 没有选中、或选中的 id 在 persistedRects 中找不到时为 null（不渲染 Popover）。
  const popoverAnchor = (() => {
    // 拖拽 range handle 期间隐藏 Popover，避免遮挡视线或位置跳动。
    // 联动模式下，同一次拖拽在其它关联容器中也应隐藏。
    if (dragHandle || isLinkedSelectedRangeDragging) return null;
    if (!currentSelectedRangeId || !popover) return null;
    const entry = persistedRects.find((p) => p.id === currentSelectedRangeId);
    if (!entry) return null;
    const anchorRects = entry.overlayRectType === 'percent' ? entry.percentRects : entry.rects;
    if (anchorRects.length === 0) return null;
    let top = anchorRects[0];
    for (const r of anchorRects) {
      if (r.y < top.y) top = r;
    }
    return { x: top.x + top.width / 2, y: top.y, overlayRectType: entry.overlayRectType };
  })();

  const activeSelectionOverlayRectType = linkedContext ? linkedOverlayRectType : legacyOverlayRectType;
  const activePercentRects = (() => {
    const container = containerRef.current;
    if (!container || activeSelectionOverlayRectType !== 'percent') return [];
    return pixelRectsToPercentRects(rects, container);
  })();

  // 计算「选区 Popover」锚点：活跃选区（未高亮）最顶部矩形的水平中点 + 顶边。
  // 与 popoverAnchor 互斥（活跃选区时 selectedRangeId 必为 null）。
  const selectionPopoverAnchor = (() => {
    // 拖拽 range handle 期间隐藏选区 Popover，避免遮挡视线或位置跳动。
    // 联动模式下，同一次拖拽在其它关联容器中也应隐藏。
    if (dragHandle || isLinkedActiveSelectionDragging) return null;
    if (!hasSelection || !selectionPopover || rects.length === 0) {
      return null;
    }
    const anchorRects = activeSelectionOverlayRectType === 'percent' ? activePercentRects : rects;
    if (anchorRects.length === 0) return null;
    let top = anchorRects[0];
    for (const r of anchorRects) {
      if (r.y < top.y) top = r;
    }
    return { x: top.x + top.width / 2, y: top.y, overlayRectType: activeSelectionOverlayRectType };
  })();

  function buildPositionStyleValue(value: number, overlayRectType: OverlayRectType): string {
    return overlayRectType === 'percent' ? `${value}%` : `${value}px`;
  }

  // 构建手柄的内联样式：绝对定位 + 从 owner 样式推导的颜色。
  const buildHandleStyle = (left: number, top: number, overlayRectType: OverlayRectType, ownerStyle: CSSProperties | undefined): React.CSSProperties => {
    const s: React.CSSProperties = {
      left: buildPositionStyleValue(left, overlayRectType),
      top: buildPositionStyleValue(top, overlayRectType),
    };
    const visual = deriveHandleVisualStyle(ownerStyle, legacyHandleFallback);
    if (visual.background !== undefined) s.background = visual.background;
    if (visual.borderColor !== undefined) {
      s.borderColor = visual.borderColor;
      s.borderWidth = typeof visual.borderWidth === 'number'
        ? `${visual.borderWidth}px`
        : visual.borderWidth ?? '2px';
      s.borderStyle = 'solid';
    }
    return s;
  };

  // 渲染单个手柄：renderHandle 优先，返回 null 则隐藏（不留 fallback），否则用默认 <button>。
  const renderSingleHandle = (
    type: SelectionHandleType,
    owner: SelectionHandleOwner,
    rangeId: string | null,
    position: HandlePosition,
    isDragging: boolean,
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void,
    ariaLabel: string,
    className: string,
    style: React.CSSProperties,
    positionUnit: OverlayRectType = legacyOverlayRectType,
  ) => {
    const handleProps: HandleRenderProps = {
      type,
      owner,
      rangeId,
      position,
      positionUnit,
      isDragging,
      onPointerDown,
      ariaLabel,
      className,
      style,
    };
    if (renderHandle) {
      const rendered = renderHandle(handleProps);
      if (rendered === null) return null;
      return rendered;
    }
    return (
      <button
        type="button"
        className={className}
        tabIndex={-1}
        aria-label={ariaLabel}
        style={style}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerDown={onPointerDown}
      />
    );
  };

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
        {persistedRects.map((group) => {
          const { id, selectionId: rectSelectionId, overlayRectType: rectType, rects: rs } = group;
          if (rectType !== 'px') return null;
          return rs.map((r) => {
            const isSelected = id === currentSelectedRangeId;
            const groupStyle = isSelected
              ? getEffectiveSelectedMarkerStyle(group.markerStyle, styleInput)
              : getEffectiveMarkerStyle(group.markerStyle, styleInput);
            const svgProps: { fill?: string; stroke?: string; strokeWidth?: number | string } = styleToSvgRectProps(groupStyle);
            return (
              <rect
                key={`${id}-${r.x},${r.y},${r.width},${r.height}`}
                data-range-id={id}
                data-selection-id={rectSelectionId ?? ''}
                className={`hsn-selection-rect ${
                  isSelected ? 'hsn-selection-rect--selected' : 'hsn-selection-rect--highlight'
                }`}
                x={r.x}
                y={r.y}
                width={r.width}
                height={r.height}
                rx={2}
                ry={2}
                style={svgProps}
              />
            );
          });
        })}

        {hasSelection &&
          activeSelectionOverlayRectType === 'px' &&
          rects.map((r) => {
          const activeSvgProps: { fill?: string; stroke?: string; strokeWidth?: number | string } = styleToSvgRectProps(activeSelectionStyle);
          return (
            <rect
              key={`active-${r.x},${r.y},${r.width},${r.height}`}
              data-range-id=""
              data-selection-id={linkedContext?.selectionId ?? ''}
              className="hsn-selection-rect hsn-selection-rect--active"
              x={r.x}
              y={r.y}
              width={r.width}
              height={r.height}
              rx={2}
              ry={2}
              style={activeSvgProps}
            />
          );
          })}
      </svg>

      {(persistedRects.some((group) => group.overlayRectType === 'percent') ||
        (hasSelection && activeSelectionOverlayRectType === 'percent')) && (
        <div className="hsn-selection-percent-overlay" aria-hidden="true" role="presentation">
          {persistedRects.map((group) => {
            const { id, overlayRectType: rectType, percentRects } = group;
            if (rectType !== 'percent') return null;
            return percentRects.map((r) => {
              const isSelected = id === currentSelectedRangeId;
              const groupStyle = isSelected
                ? getEffectiveSelectedMarkerStyle(group.markerStyle, styleInput)
                : getEffectiveMarkerStyle(group.markerStyle, styleInput);
              return (
                <div
                  key={`${id}-${r.x},${r.y},${r.width},${r.height}`}
                  className={`hsn-selection-percent-rect hsn-selection-percent-rect-highlight${
                    isSelected ? ' hsn-selection-percent-rect-selected' : ''
                  }`}
                  style={buildPercentRectStyle(
                    { left: `${r.x}%`, top: `${r.y}%`, width: `${r.width}%`, height: `${r.height}%` },
                    groupStyle,
                  )}
                />
              );
            });
          })}

          {hasSelection &&
            activeSelectionOverlayRectType === 'percent' &&
            activePercentRects.map((r) => (
              <div
                key={`active-${r.x},${r.y},${r.width},${r.height}`}
                className="hsn-selection-percent-rect hsn-selection-percent-rect-active"
                style={buildPercentRectStyle(
                  { left: `${r.x}%`, top: `${r.y}%`, width: `${r.width}%`, height: `${r.height}%` },
                  activeSelectionStyle,
                )}
              />
            ))}
        </div>
      )}

      {/* 内容层：children 原样渲染，不做任何包装 */}
      <div ref={contentRef} className="hsn-selection-content">
        {children}
      </div>

      {/*
        Popover 层：渲染在 children 之上、与 overlay 同层级（更高 z-index 保证浮在最上）。
        位置基于选中 range 顶部矩形的水平中点；transform 把自己钉在锚点正上方。
        用 ref 给 document mousedown 判断「是否点在 popover 内」。
      */}
      {popoverAnchor && (
        <div
          ref={popoverRef}
          className="hsn-selection-popover"
          style={{
            left: buildPositionStyleValue(popoverAnchor.x, popoverAnchor.overlayRectType),
            top: buildPositionStyleValue(popoverAnchor.y, popoverAnchor.overlayRectType),
          }}
        >
          {popover}
        </div>
      )}

      {/*
        选区（活跃，未高亮）Popover：与上面的 popover 互斥。
        容器 mousedown 阻止默认行为，避免点击内部按钮导致原生选区被浏览器清空。
      */}
      {selectionPopoverAnchor && (
        <div
          ref={selectionPopoverRef}
          className="hsn-selection-popover"
          style={{
            left: buildPositionStyleValue(selectionPopoverAnchor.x, selectionPopoverAnchor.overlayRectType),
            top: buildPositionStyleValue(selectionPopoverAnchor.y, selectionPopoverAnchor.overlayRectType),
          }}
        >
          {selectionPopover}
        </div>
      )}

      {/*
        拖拽手柄：活跃选区的首尾各一个粉色圆形。
        起点手柄钉在第一行矩形左侧中央，终点手柄钉在最后一行矩形右侧中央。
        拖动时通过 caretInfoFromPoint 反查 caret 偏移，更新原生选区；
        selectionchange → hook 重新计算 rects → 手柄位置基于新 rects 自然跟随。
        鼠标驱动的新选择手势期间（mousedown 到 mouseup）隐藏活跃手柄，避免干扰拖选。
      */}
      {hasSelection &&
        rects.length > 0 &&
        !isSelectingText &&
        !isLinkedSelectingText &&
        !dragHandle &&
        !isLinkedActiveSelectionDragging &&
        (() => {
          const activeHandleRects = activeSelectionOverlayRectType === 'percent' ? activePercentRects : rects;
          if (activeHandleRects.length === 0) return null;
          const first = activeHandleRects[0];
          const last = activeHandleRects[activeHandleRects.length - 1];
          const isDraggingActive = !!(dragHandle && !dragPersistedId);
          const showStartHandle =
            !linkedContext ||
            !linkedRange ||
            linkedRange.start.selectionId === linkedContext.selectionId;
          const showEndHandle =
            !linkedContext ||
            !linkedRange ||
            linkedRange.end.selectionId === linkedContext.selectionId;
          return (
            <>
              {showStartHandle &&
                renderSingleHandle(
                  'start',
                  'active-selection',
                  null,
                  { x: first.x, y: first.y + first.height / 2 },
                  isDraggingActive,
                  startHandleDrag('start'),
                  '拖动以调整选区起点',
                  `hsn-selection-handle hsn-selection-handle--start${isDraggingActive ? ' hsn-selection-handle--dragging' : ''}`,
                  buildHandleStyle(first.x, first.y + first.height / 2, activeSelectionOverlayRectType, activeSelectionStyle),
                  activeSelectionOverlayRectType,
                )}
              {showEndHandle &&
                renderSingleHandle(
                  'end',
                  'active-selection',
                  null,
                  { x: last.x + last.width, y: last.y + last.height / 2 },
                  isDraggingActive,
                  startHandleDrag('end'),
                  '拖动以调整选区终点',
                  `hsn-selection-handle hsn-selection-handle--end${isDraggingActive ? ' hsn-selection-handle--dragging' : ''}`,
                  buildHandleStyle(last.x + last.width, last.y + last.height / 2, activeSelectionOverlayRectType, activeSelectionStyle),
                  activeSelectionOverlayRectType,
                )}
            </>
          );
        })()}

      {!hasSelection &&
        currentSelectedRangeId &&
        !dragHandle &&
        !isLinkedSelectedRangeDragging &&
        (() => {
          let showStartHandle = true;
          let showEndHandle = true;
          if (linkedContext) {
            const item = linkedContext.data.items.find((it) => it.id === currentSelectedRangeId);
            if (!item) return null;
            showStartHandle = item.start.selectionId === linkedContext.selectionId;
            showEndHandle = item.end.selectionId === linkedContext.selectionId;
            if (!showStartHandle && !showEndHandle) return null;
          }
          const entry = persistedRects.find((p) => p.id === currentSelectedRangeId);
          if (!entry) return null;
          const rs = entry.overlayRectType === 'percent' ? entry.percentRects : entry.rects;
          if (rs.length === 0) return null;
          const persistedHandleStyle = getEffectiveMarkerStyle(entry.markerStyle, styleInput);
          const first = rs[0];
          const last = rs[rs.length - 1];
          const isDraggingPersisted = !!(dragHandle && dragPersistedId === currentSelectedRangeId);
          return (
            <>
              {showStartHandle &&
                renderSingleHandle(
                  'start',
                  'persisted-range',
                  currentSelectedRangeId,
                  { x: first.x, y: first.y + first.height / 2 },
                  isDraggingPersisted,
                  startHandleDrag('start', currentSelectedRangeId),
                  '拖动以调整高亮起点',
                  `hsn-selection-handle hsn-selection-handle--start${isDraggingPersisted ? ' hsn-selection-handle--dragging' : ''}`,
                  buildHandleStyle(first.x, first.y + first.height / 2, entry.overlayRectType, persistedHandleStyle),
                  entry.overlayRectType,
                )}
              {showEndHandle &&
                renderSingleHandle(
                  'end',
                  'persisted-range',
                  currentSelectedRangeId,
                  { x: last.x + last.width, y: last.y + last.height / 2 },
                  isDraggingPersisted,
                  startHandleDrag('end', currentSelectedRangeId),
                  '拖动以调整高亮终点',
                  `hsn-selection-handle hsn-selection-handle--end${isDraggingPersisted ? ' hsn-selection-handle--dragging' : ''}`,
                  buildHandleStyle(last.x + last.width, last.y + last.height / 2, entry.overlayRectType, persistedHandleStyle),
                  entry.overlayRectType,
                )}
            </>
          );
        })()}
    </div>
  );
});

export default Selection;
