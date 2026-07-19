import type { CSSProperties } from 'react';
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
import {
  clampPointToContainer,
  getEffectiveLegacyOverlayRectType,
  getEffectiveLinkedOverlayRectType,
  isRectCreatable,
  normalizeRectFromPoints,
  percentRectsToPixelRects,
  pixelRectsToPercentRects,
  storeRectForOverlayRectType,
  storeRectsForOverlayRectType,
} from './geometry';
import { createLinkedDomRangeFromEndpoints, updateLinkedRangeFromEndpoints } from './linkedRange';
import {
  getRegisteredContainers,
  registerLinkedContainer,
  resolveEndpoint,
  syncSelectionOrder,
} from './linkedRegistry';
import './style.css';
import {
  buildPercentRectStyle,
  completeRangeStyleSnapshot,
  createRangeStyleSnapshot,
  deriveHandleVisualStyle,
  getEffectiveMarkerStyle,
  getEffectiveSelectedMarkerStyle,
  getEffectiveSelectionStyle,
  type StyleInput,
  styleShallowEqual,
  styleToSvgRectProps,
} from './styleUtils';
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
  SelectionRect,
  SelectionRectPoint,
  SelectionRef,
} from './types';
import { useTextSelection } from './useTextSelection';

type PersistedRectGroup = {
  id: string;
  selectionId: string | null;
  overlayRectType: OverlayRectType;
  rects: OverlayRect[];
  percentRects: PercentOverlayRect[];
  markerStyle?: CSSProperties;
  selectionStyle?: CSSProperties;
};

type ActiveRectGroup = {
  overlayRectType: OverlayRectType;
  rects: OverlayRect[];
  percentRects: PercentOverlayRect[];
};

type ActiveSelectionRect = {
  start: SelectionRectPoint;
  end: SelectionRectPoint;
  rect: OverlayRect;
};

type ClickPoint = {
  readonly clientX: number;
  readonly clientY: number;
};

type SkipClickToken = {
  readonly point: ClickPoint | null;
  readonly expiresAt: number;
};

const SKIP_CLICK_WINDOW_MS = 750;
const SKIP_CLICK_TOLERANCE_PX = 4;

function createSkipClickToken(point: ClickPoint | null): SkipClickToken {
  return { point, expiresAt: Date.now() + SKIP_CLICK_WINDOW_MS };
}

function skipClickTokenMatches(token: SkipClickToken, event: MouseEvent): boolean {
  if (Date.now() > token.expiresAt) return false;
  if (token.point === null) return true;
  return (
    Math.abs(event.clientX - token.point.clientX) <= SKIP_CLICK_TOLERANCE_PX &&
    Math.abs(event.clientY - token.point.clientY) <= SKIP_CLICK_TOLERANCE_PX
  );
}

type LinkedModeContext = {
  selectionId: string;
  data: LinkedSelectionData;
};

type HandleDragStartEvent = React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>;

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

/**
 * 在视口坐标 (x, y) 处查找单词并返回对应的 DOM Range。
 * 不创建原生 Selection —— 移动端 user-select:none 下 addRange() 会被静默拒绝，
 * 即使成功也会触发浏览器渲染原生水滴手柄。调用方应通过 setFromRange 注入 state。
 *
 * 分词策略（优先级递减）：
 * 1. Selection.modify('extend', dir, 'word') —— 浏览器原生分词
 * 2. 手动 Unicode 字符属性扩展 —— 回退方案
 * 3. CJK 单字符退化 —— 避免 \p{L} 选中整段中文
 */
function selectWordAtPoint(x: number, y: number): Range | null {
  const caret = caretInfoFromPoint(x, y);
  if (!caret || !(caret.node instanceof Text)) return null;

  const text = caret.node.textContent ?? '';
  if (!text) return null;

  const offset = Math.min(caret.offset, text.length);

  const isWordChar = (ch: string | undefined): boolean => !!ch && /[\p{L}\p{N}_]/u.test(ch);
  let start = offset;
  let end = offset;
  while (start > 0 && isWordChar(text[start - 1])) start--;
  while (end < text.length && isWordChar(text[end])) end++;

  const isCJK = (ch: string): boolean =>
    /[\u{4e00}-\u{9fff}\u{3400}-\u{4dbf}\u{3040}-\u{30ff}\u{ac00}-\u{d7af}\u{f900}-\u{faff}]/u.test(
      ch,
    );
  if (end - start > 1 && isCJK(text[offset] ?? text[Math.max(0, offset - 1)])) {
    start = offset;
    end = Math.min(text.length, offset + 1);
  }

  if (start >= end) return null;

  const wordRange = document.createRange();
  wordRange.setStart(caret.node, start);
  wordRange.setEnd(caret.node, end);
  return wordRange;
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

function overlayRectsEqual(a: readonly OverlayRect[], b: readonly OverlayRect[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (
      a[i].x !== b[i].x ||
      a[i].y !== b[i].y ||
      a[i].width !== b[i].width ||
      a[i].height !== b[i].height
    ) {
      return false;
    }
  }
  return true;
}

function linkedActiveRangeEqual(
  a: LinkedSelectionRange | null | undefined,
  b: LinkedSelectionRange | null | undefined,
): boolean {
  if (!a || !b) return a === b;
  if (a.text !== b.text) return false;
  if (a.overlayRectType !== b.overlayRectType) return false;
  if (a.start.selectionId !== b.start.selectionId || a.start.offset !== b.start.offset)
    return false;
  if (a.end.selectionId !== b.end.selectionId || a.end.offset !== b.end.offset) return false;
  if (!styleShallowEqual(a.markerStyle, b.markerStyle)) return false;
  if (!styleShallowEqual(a.selectionStyle, b.selectionStyle)) return false;

  const aKeys = Object.keys(a.rectsBySelectionId);
  const bKeys = Object.keys(b.rectsBySelectionId);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    const aRects = a.rectsBySelectionId[key];
    const bRects = b.rectsBySelectionId[key];
    if (!aRects || !bRects) return false;
    if (!overlayRectsEqual(aRects, bRects)) return false;
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
    tool = 'text',
    rects: propRects = [],
    selectedRectId = null,
    onCreateRect,
    onSelectRect,
    onUpdateRect,
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
  const [containerReadyVersion, setContainerReadyVersion] = useState(0);
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
  const isTextTool = tool === 'text';
  const isRectTool = tool === 'rect';
  const activeRectOverlayRectType = legacyOverlayRectType;

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
    [
      markerStyle,
      selectionStyle,
      markerColors,
      highlightColor,
      selectionColor,
      newSelectionOptions,
    ],
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

  const {
    selectedText,
    startIndex,
    endIndex,
    hasSelection,
    clear,
    rects,
    linkedRange,
    setFromRange,
  } = useTextSelection(containerRef, {
    enabled: isTextTool,
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
  const dragRectAnchorRef = useRef<SelectionRectPoint | null>(null);
  // 拖动期间的「锚点」：不动的那个边界的纯文本偏移。
  // 拖 start 时锚点=end，拖 end 时锚点=start。缓存以避免 selectionchange 同步更新 ref 导致锚点漂移。
  const dragAnchorRef = useRef<number>(-1);
  // 被拖动手柄的 DOM 引用：拖动开始时设为手柄元素，用于 onUp 恢复 pointerEvents。
  // 避免依赖 React state → CSS class 链（重渲染延迟导致首帧 pointermove 命中手柄）。
  const dragHandleElRef = useRef<HTMLElement | null>(null);
  // 拖动/拖选结束后记录一个短期 click 跳过令牌，只跳过紧随其后、同坐标的合成 click。
  // 跨区域拖选可能不会在结束容器派发 click；令牌不能残留到用户下一次空白点击。
  const skipClickRef = useRef<SkipClickToken | null>(null);
  const [activeRect, setActiveRect] = useState<ActiveSelectionRect | null>(null);
  const activeRectRef = useRef<ActiveSelectionRect | null>(null);
  activeRectRef.current = activeRect;
  const [isDrawingRect, setIsDrawingRect] = useState(false);
  const rectDrawingStartRef = useRef<SelectionRectPoint | null>(null);
  const rectDrawingPointerIdRef = useRef<number | null>(null);
  const pendingActiveClearPointRef = useRef<ClickPoint | null>(null);
  const startIndexRef = useRef(startIndex);
  const endIndexRef = useRef(endIndex);
  startIndexRef.current = startIndex;
  endIndexRef.current = endIndex;
  // 桥接 ref：让移动端 touch effect 和 pointermove 调用 setFromRange 而不触发重注册。
  const setFromRangeRef = useRef(setFromRange);
  setFromRangeRef.current = setFromRange;
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
  const setLinkedDraggingRange = useCallback((draggingRange: LinkedSelectionDragState | null) => {
    const data = linkedDataRef.current;
    const onChange = onLinkedDataChangeRef.current;
    if (!data || !onChange) return;
    onChange({ ...data, draggingRange });
  }, []);

  /**
   * 更新联动模式共享的「正在鼠标拖选新文本」状态。
   * 通过 ref 读取最新 linkedData / onLinkedDataChange，避免闭包过期。
   */
  const setLinkedSelectingText = useCallback((selectingText: boolean) => {
    const data = linkedDataRef.current;
    const onChange = onLinkedDataChangeRef.current;
    if (!data || !onChange) return;
    onChange({ ...data, selectingText });
  }, []);

  const setLinkedActiveRange = useCallback((activeRange: LinkedSelectionRange | null) => {
    const data = linkedDataRef.current;
    const onChange = onLinkedDataChangeRef.current;
    if (!data || !onChange) return;
    if (data.activeRange === activeRange) return;
    onChange({ ...data, activeRange });
  }, []);

  const pointFromPointer = useCallback(
    (event: PointerEvent | MouseEvent): SelectionRectPoint | null => {
      const container = containerRef.current;
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      const clientX = Number.isNaN(Number(event.clientX)) ? 0 : Number(event.clientX);
      const clientY = Number.isNaN(Number(event.clientY)) ? 0 : Number(event.clientY);
      return clampPointToContainer({ x: clientX - rect.left, y: clientY - rect.top }, container);
    },
    [],
  );

  const clearActiveSelection = useCallback(() => {
    clear();
    setLinkedActiveRange(null);
  }, [clear, setLinkedActiveRange]);

  const clearActiveRect = useCallback(() => {
    rectDrawingStartRef.current = null;
    rectDrawingPointerIdRef.current = null;
    setIsDrawingRect(false);
    setActiveRect(null);
  }, []);

  useEffect(() => {
    if (isRectTool) {
      clearActiveSelection();
      return;
    }
    clearActiveRect();
  }, [clearActiveRect, clearActiveSelection, isRectTool]);

  const currentSelectedRangeId = linkedContext
    ? linkedContext.data.selectedRangeId
    : selectedRangeId;
  const currentSelectedRangeIdRef = useRef(currentSelectedRangeId);
  currentSelectedRangeIdRef.current = currentSelectedRangeId;
  const linkedDraggingRange = linkedContext?.data.draggingRange ?? null;
  const sharedActiveRange = linkedContext?.data.activeRange ?? null;
  const activeSelectionOverlayRectType = linkedContext
    ? linkedOverlayRectType
    : legacyOverlayRectType;
  const sharedActiveRectGroup = useMemo<ActiveRectGroup | null>(() => {
    if (containerReadyVersion === 0) return null;
    if (!linkedContext || !sharedActiveRange) return null;
    const container = containerRef.current;
    if (!container) return null;
    const storedRects = sharedActiveRange.rectsBySelectionId[linkedContext.selectionId];
    if (!storedRects) return null;
    const overlayType = getEffectiveLinkedOverlayRectType(sharedActiveRange);
    const pixelRects =
      overlayType === 'px' ? storedRects : percentRectsToPixelRects(storedRects, container);
    const percentRects =
      overlayType === 'percent' ? storedRects : pixelRectsToPercentRects(storedRects, container);
    return { overlayRectType: overlayType, rects: pixelRects, percentRects };
  }, [containerReadyVersion, linkedContext, sharedActiveRange]);
  const activeSelectionRectGroup = useMemo<ActiveRectGroup | null>(() => {
    if (!activeRect) return null;
    const container = containerRef.current;
    const percentRects =
      container && activeRectOverlayRectType === 'percent'
        ? pixelRectsToPercentRects([activeRect.rect], container)
        : [];
    return {
      overlayRectType: activeRectOverlayRectType,
      rects: [activeRect.rect],
      percentRects,
    };
  }, [activeRect, activeRectOverlayRectType]);
  const activeRangeForDisplay = linkedRange ?? sharedActiveRange;
  const hasActiveTextSelection = isTextTool && (hasSelection || sharedActiveRectGroup !== null);
  const displayRects = useMemo(
    () => (hasSelection ? rects : (sharedActiveRectGroup?.rects ?? [])),
    [hasSelection, rects, sharedActiveRectGroup?.rects],
  );
  const displayActiveOverlayRectType =
    sharedActiveRectGroup?.overlayRectType ?? activeSelectionOverlayRectType;
  // 桥接 ref：容器 mousedown 监听需要读取最新 hasSelection / rects，但 effect 不重注册。
  const hasSelectionRef = useRef(hasActiveTextSelection);
  hasSelectionRef.current = hasActiveTextSelection;
  const clearActiveSelectionRef = useRef(clearActiveSelection);
  clearActiveSelectionRef.current = clearActiveSelection;
  const rectsRef = useRef(displayRects);
  rectsRef.current = displayRects;
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
  const mouseSelectingTextRef = useRef(false);
  // 桥接 ref：让触摸 effect（空依赖）能在长按选词后调用 onSelectionStart。
  const onSelectionStartRef = useRef(onSelectionStart);
  onSelectionStartRef.current = onSelectionStart;
  // 桥接 ref：让触摸 effect 在长按结束时调用 onSelectionEnd。
  const onSelectionEndRef = useRef(onSelectionEnd);
  onSelectionEndRef.current = onSelectionEnd;
  // 移动端 touchend 后浏览器会合成 mousedown/mouseup/click 事件。
  // 该 ref 标记「下一个合成 mousedown 不应触发 onSelectionStart」，用于：
  // 1. 长按选词 —— 已在 timer 回调中触发过 start，合成 mousedown 不应重复触发；
  // 2. 点击取消选区 —— 只应清除选区，不应触发 start；
  // 3. 普通轻触 —— 移动端不通过 mousedown 表达「开始选择」，统一抑制。
  const suppressNextMouseDownStartRef = useRef(false);
  // 桥接 ref：文档级取消选中监听需要读取最新矩形选中回调，但不应频繁重绑监听器。
  const selectedRectIdRef = useRef<string | null>(selectedRectId);
  selectedRectIdRef.current = selectedRectId;
  const onSelectRectRef = useRef(onSelectRect);
  onSelectRectRef.current = onSelectRect;

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

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    setContainerReadyVersion((version) => version + 1);
  }, []);

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

  /** 每个已确认 SelectionRect 对应的 Overlay 矩形组 */
  const [persistedSelectionRects, setPersistedSelectionRects] = useState<PersistedRectGroup[]>([]);

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
          const rangeOverlayRectType = getEffectiveLegacyOverlayRectType(
            range,
            legacyOverlayRectType,
          );
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

  const recomputePersistedSelectionRects = useCallback(() => {
    const container = containerRef.current;
    const next: PersistedRectGroup[] = [];
    if (container) {
      for (const rect of propRects) {
        if (linkedContext && rect.selectionId && rect.selectionId !== linkedContext.selectionId) {
          continue;
        }
        const rectOverlayRectType = rect.overlayRectType;
        const sourceRects = [rect.rect];
        const rangePixelRects =
          rectOverlayRectType === 'px'
            ? sourceRects
            : percentRectsToPixelRects(sourceRects, container);
        const rangePercentRects =
          rectOverlayRectType === 'percent'
            ? sourceRects
            : pixelRectsToPercentRects(sourceRects, container);
        next.push({
          id: rect.id,
          selectionId: rect.selectionId ?? null,
          overlayRectType: rectOverlayRectType,
          rects: rangePixelRects as OverlayRect[],
          percentRects: rangePercentRects as PercentOverlayRect[],
          markerStyle: rect.markerStyle,
          selectionStyle: rect.selectionStyle,
        });
      }
    }
    setPersistedSelectionRects((prev) => (rectListsEqual(prev, next) ? prev : next));
  }, [linkedContext, propRects]);

  // ranges 变化时同步重算（layout effect 避免闪烁）。
  // 这是 React 官方推荐的 DOM 测量模式：useLayoutEffect 读取 DOM → setState 重渲。
  // 浅比较保证幂等，不会循环。lint 的 set-state-in-effect 在此模式下为误报。
  useLayoutEffect(() => {
    recomputePersistedRects();
    recomputePersistedSelectionRects();
  }, [recomputePersistedRects, recomputePersistedSelectionRects]);

  // 容器尺寸变化（窗口 resize、字体加载、外层 flex 重排）时重算
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      recomputePersistedRects();
      recomputePersistedSelectionRects();
    });
    ro.observe(container);
    window.addEventListener('resize', recomputePersistedRects);
    window.addEventListener('resize', recomputePersistedSelectionRects);
    document.addEventListener('scroll', recomputePersistedRects, true);
    document.addEventListener('scroll', recomputePersistedSelectionRects, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recomputePersistedRects);
      window.removeEventListener('resize', recomputePersistedSelectionRects);
      document.removeEventListener('scroll', recomputePersistedRects, true);
      document.removeEventListener('scroll', recomputePersistedSelectionRects, true);
    };
  }, [recomputePersistedRects, recomputePersistedSelectionRects]);

  /**
   * 确认选区：构造 SelectionRange 并回调。
   * 触发顺序：onSelect → onHighlight → onSelectRange → clear()
   * onSelectRange 自动将新建的 range 设为「选中」，满足「刚高亮完的也算一种选中」的需求。
   */
  const handleConfirm = useCallback(() => {
    const activeLinkedRange = linkedRange ?? sharedActiveRange;
    const activeText = selectedText || activeLinkedRange?.text || '';
    if (!hasSelection && !activeLinkedRange) return;
    if (!activeText) return;

    if (linkedContext) {
      if (!activeLinkedRange) {
        clearActiveSelection();
        return;
      }

      const nextData: LinkedSelectionData = {
        ...linkedContext.data,
        items: [...linkedContext.data.items, activeLinkedRange],
        selectedRangeId: activeLinkedRange.id,
        activeRange: null,
      };
      onLinkedDataChange?.(nextData);
      onLinkedSelect?.(activeLinkedRange);
      onLinkedSelectRange?.(activeLinkedRange.id);

      if (
        activeLinkedRange.start.selectionId === linkedSelectionId &&
        activeLinkedRange.end.selectionId === linkedSelectionId
      ) {
        const localRange: SelectionRange = {
          id: activeLinkedRange.id,
          text: activeLinkedRange.text,
          start: activeLinkedRange.start.offset,
          end: activeLinkedRange.end.offset,
          createdAt: activeLinkedRange.createdAt,
          overlayRectType: activeLinkedRange.overlayRectType,
          rects: activeLinkedRange.rectsBySelectionId[linkedSelectionId],
          markerStyle: activeLinkedRange.markerStyle,
          selectionStyle: activeLinkedRange.selectionStyle,
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
    clearActiveSelection();
  }, [
    hasSelection,
    selectedText,
    linkedContext,
    linkedRange,
    sharedActiveRange,
    linkedSelectionId,
    onLinkedDataChange,
    onLinkedSelect,
    onLinkedSelectRange,
    clear,
    clearActiveSelection,
    startIndex,
    endIndex,
    onSelect,
    onHighlight,
    legacyOverlayRectType,
    rects,
    selectRange,
    styleSnapshot,
  ]);

  const handleConfirmRect = useCallback(() => {
    const draft = activeRectRef.current;
    const container = containerRef.current;
    if (!draft || !container) return;

    let start = draft.start;
    let end = draft.end;

    if (activeRectOverlayRectType === 'percent') {
      const { width, height } = container.getBoundingClientRect();
      const clampStart = clampPointToContainer(draft.start, container);
      const clampEnd = clampPointToContainer(draft.end, container);
      start = {
        x: (clampStart.x / width) * 100,
        y: (clampStart.y / height) * 100,
      };
      end = {
        x: (clampEnd.x / width) * 100,
        y: (clampEnd.y / height) * 100,
      };
    }

    const rect: SelectionRect = {
      id: generateId(),
      createdAt: Date.now(),
      overlayRectType: activeRectOverlayRectType,
      start,
      end,
      rect: storeRectForOverlayRectType(draft.rect, activeRectOverlayRectType, container),
      ...(linkedSelectionId ? { selectionId: linkedSelectionId } : {}),
      ...styleSnapshot,
    };
    onCreateRect?.(rect);
    onSelectRect?.(rect.id);
    clearActiveRect();
  }, [
    activeRectOverlayRectType,
    clearActiveRect,
    linkedSelectionId,
    onCreateRect,
    onSelectRect,
    styleSnapshot,
  ]);

  const handleConfirmCurrentTool = useCallback(() => {
    if (tool === 'rect') {
      handleConfirmRect();
      return;
    }
    handleConfirm();
  }, [handleConfirm, handleConfirmRect, tool]);

  // 用 useImperativeHandle 暴露命令式 API。
  // 设计上仅暴露 highlight/clear 两个动作，不暴露内部状态——
  // 内部状态（选区文本、坐标）走 props 回调上报，避免外部直接读取造成耦合。
  useImperativeHandle(
    ref,
    () => ({
      highlight: handleConfirm,
      confirm: handleConfirmCurrentTool,
      confirmRect: handleConfirmRect,
      clear: () => {
        clearActiveSelection();
        clearActiveRect();
      },
    }),
    [
      handleConfirm,
      handleConfirmCurrentTool,
      handleConfirmRect,
      clearActiveSelection,
      clearActiveRect,
    ],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isRectTool) return;

    const clearNativeSelection = () => {
      window.getSelection()?.removeAllRanges();
    };

    const handleNativeSelectStart = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.hsn-selection-handle')) return;
      if (target instanceof Node && selectionPopoverRef.current?.contains(target)) return;
      if (target instanceof Node && popoverRef.current?.contains(target)) return;
      event.preventDefault();
      clearNativeSelection();
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.hsn-selection-handle')) return;
      if (target instanceof Node && selectionPopoverRef.current?.contains(target)) return;
      if (target instanceof Node && popoverRef.current?.contains(target)) return;

      const start = pointFromPointer(event);
      if (!start) return;
      if (dragHandleRef.current) return;

      event.preventDefault();
      clearNativeSelection();
      clearActiveSelectionRef.current();
      selectRange?.(null);
      onSelectRect?.(null);
      setIsDrawingRect(true);
      rectDrawingStartRef.current = start;
      rectDrawingPointerIdRef.current = event.pointerId;
      setIsSelectingText(false);
      mouseSelectingTextRef.current = false;
      setLinkedSelectingText(false);
      setActiveRect({
        start,
        end: start,
        rect: normalizeRectFromPoints(start, start),
      });
      container.setPointerCapture?.(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent | MouseEvent) => {
      // 只有正在从容器内部框选时，document 级 pointermove 才属于矩形绘制。
      // 否则点击确认按钮等普通交互会被误当成绘制结束流程，导致 activeRect 被清空。
      if (!rectDrawingStartRef.current) return;
      if (
        rectDrawingPointerIdRef.current !== (event as PointerEvent).pointerId &&
        rectDrawingPointerIdRef.current !== null &&
        (event as PointerEvent).pointerId !== undefined
      )
        return;
      const start = rectDrawingStartRef.current;
      const end = pointFromPointer(event);
      if (!start || !end) return;
      event.preventDefault();
      clearNativeSelection();
      const rect = normalizeRectFromPoints(start, end);
      setActiveRect(isRectCreatable(rect) ? { start, end, rect } : null);
    };

    const handlePointerUp = (event: PointerEvent | MouseEvent) => {
      // 同 pointermove：没有绘制起点时，pointerup 可能来自 popover/toolbar 按钮，
      // 不应清除已经画好的矩形草稿。
      if (!rectDrawingStartRef.current) return;
      if (
        rectDrawingPointerIdRef.current !== (event as PointerEvent).pointerId &&
        rectDrawingPointerIdRef.current !== null &&
        (event as PointerEvent).pointerId !== undefined
      )
        return;
      const start = rectDrawingStartRef.current;
      const end = pointFromPointer(event);
      rectDrawingStartRef.current = null;
      rectDrawingPointerIdRef.current = null;
      setIsDrawingRect(false);
      setIsSelectingText(false);
      mouseSelectingTextRef.current = false;
      setLinkedSelectingText?.(false);
      event.preventDefault();
      clearNativeSelection();
      container.releasePointerCapture?.((event as PointerEvent).pointerId);
      if (!start || !end) {
        setActiveRect(null);
        return;
      }
      const rect = normalizeRectFromPoints(start, end);
      if (isRectCreatable(rect)) {
        skipClickRef.current = createSkipClickToken({
          clientX: event.clientX,
          clientY: event.clientY,
        });
        setActiveRect({ start, end, rect });
        return;
      }
      setActiveRect(null);
    };

    container.addEventListener('selectstart', handleNativeSelectStart, true);
    container.addEventListener('dragstart', handleNativeSelectStart, true);
    container.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    return () => {
      container.removeEventListener('selectstart', handleNativeSelectStart, true);
      container.removeEventListener('dragstart', handleNativeSelectStart, true);
      container.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      rectDrawingStartRef.current = null;
      rectDrawingPointerIdRef.current = null;
    };
  }, [isRectTool, onSelectRect, pointFromPointer, selectRange, setLinkedSelectingText]);

  // 容器 mousedown：把 selectionchange 之外的「开始」语义补齐。
  // selectionchange 仅在选区已经变化时触发，无法表达「用户开始按下鼠标准备拖选」这个动作，
  // 因此用原生 mousedown 作为开始信号；mouseup 时若仍有选区则视为结束。
  // 选区在 mousedown 时通常仍是上一次状态或空，因此原始 selection 直接传出供外部观察。
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isTextTool) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target;
      if (target instanceof Element && target.closest('.hsn-selection-handle')) {
        e.preventDefault();
        return;
      }
      if (target instanceof Node && selectionPopoverRef.current?.contains(target)) {
        return;
      }
      if (target instanceof Node && popoverRef.current?.contains(target)) {
        return;
      }

      // 拖动 range handle 期间，容器 mousedown 不应干预原生选区。
      if (dragHandleRef.current || dragPersistedIdRef.current) {
        return;
      }

      // 移动端 touchend 合成的 mousedown：若已标记抑制，消费标记并退出。
      // 长按选词已在 timer 中触发 start；点击取消选区不应触发 start；
      // 普通轻触在移动端不通过 mousedown 表达「开始选择」。
      if (suppressNextMouseDownStartRef.current) {
        suppressNextMouseDownStartRef.current = false;
        return;
      }

      // 点击在活跃选区 rect 内部时阻止默认行为并保留选区，
      // 但不进入「新选择中」状态——否则点击选区内部会误隐藏手柄。
      if (hasSelectionRef.current && rectsRef.current.length > 0) {
        const cRect = container.getBoundingClientRect();
        const x = e.clientX - cRect.left;
        const y = e.clientY - cRect.top;
        let hitActiveSelection = false;
        for (const r of rectsRef.current) {
          if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
            hitActiveSelection = true;
            break;
          }
        }
        if (hitActiveSelection) {
          e.preventDefault();
          return;
        }
        pendingActiveClearPointRef.current = {
          clientX: e.clientX,
          clientY: e.clientY,
        };
      } else {
        pendingActiveClearPointRef.current = null;
      }

      // 开始新的鼠标选择手势：隐藏活跃选区手柄直到 mouseup。
      onSelectRect?.(null);
      mouseSelectingTextRef.current = true;
      setIsSelectingText(true);
      setLinkedSelectingText(true);
      const startCb = onSelectionStartRef.current;
      if (!startCb) return;
      const selection = window.getSelection();
      if (!selection) return;
      startCb({ x: e.clientX, y: e.clientY }, selection);
    };

    const handleMouseUp = (e: MouseEvent) => {
      const selection = window.getSelection();
      const target = e.target;
      if (target instanceof Node && selectionPopoverRef.current?.contains(target)) {
        return;
      }
      if (target instanceof Node && popoverRef.current?.contains(target)) {
        return;
      }
      const pendingActiveClearPoint = pendingActiveClearPointRef.current;
      pendingActiveClearPointRef.current = null;
      mouseSelectingTextRef.current = false;
      setIsSelectingText(false);
      if (!(target instanceof Node) || !container.contains(target)) return;
      if (pendingActiveClearPoint) {
        const moved =
          Math.abs(e.clientX - pendingActiveClearPoint.clientX) > SKIP_CLICK_TOLERANCE_PX ||
          Math.abs(e.clientY - pendingActiveClearPoint.clientY) > SKIP_CLICK_TOLERANCE_PX;
        if (!moved) {
          clearActiveSelectionRef.current();
          setLinkedSelectingText(false);
          return;
        }
      }
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        setLinkedSelectingText(false);
        return;
      }
      const range = selection.getRangeAt(0);
      if (!range.intersectsNode(container)) {
        setLinkedSelectingText(false);
        return;
      }
      if (!selection.toString().trim()) {
        setLinkedSelectingText(false);
        return;
      }
      // 标记跳过紧随其后的 click 事件，避免 handleContainerClick 将拖拽结束
      // 时鼠标位置判定为「点击在选区 rect 外部」而误清除刚形成的活跃选区。
      skipClickRef.current = createSkipClickToken({
        clientX: e.clientX,
        clientY: e.clientY,
      });
      // 只有真正接收本次 mouseup 的容器才能清理 linked selectingText。
      // 否则 page-a 的 document 监听会在 page-b 前先清理共享状态，触发父级重渲染，
      // 导致 page-b 的 mouseup 监听在同一事件分发中被移除，进而漏掉 end 事件。
      setLinkedSelectingText(false);
      onSelectionEndRef.current?.({ x: e.clientX, y: e.clientY }, selection);
    };

    container.addEventListener('mousedown', handleMouseDown);
    // mouseup 监听挂在 document 上：用户可能在容器内按下后拖出容器再松开，
    // 这种情况下 mouseup 不会冒泡到容器，所以要在 document 层捕获。
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isTextTool, onSelectRect, setLinkedSelectingText]);

  useEffect(() => {
    if (!hasSelection && !mouseSelectingTextRef.current) {
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
      if (!isTextTool) return;
      if ('pointerType' in e && (e as PointerEvent).pointerType === 'touch') {
        e.preventDefault();
      }
    };
    container.addEventListener('contextmenu', handleContextMenu);
    return () => {
      container.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [isTextTool]);

  // 触摸设备长按检测：代替原生长按选词（因 user-select:none 禁用了原生选区 UI）。
  // touchstart 后启动计时器，若在 LONG_PRESS_MS 内未发生超过 MOVE_THRESHOLD_PX 的位移，
  // 判定为长按并通过 selectWordAtPoint 计算单词 Range，再通过 setFromRange 注入 hook state。
  // 全程不创建原生 Selection，不触发 selectionchange，不出现原生水滴手柄/蓝色高亮。
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isTextTool) return;
    if (
      typeof window.matchMedia !== 'function' ||
      !window.matchMedia('(pointer: coarse)').matches
    ) {
      return;
    }

    const LONG_PRESS_MS = 450;
    const MOVE_THRESHOLD_PX = 10;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let startX = 0;
    let startY = 0;
    let moved = false;
    let longPressTriggered = false;
    // 仅「单指无移动轻触」才允许取消活跃选区；双指缩放/单指拖动都应保留选区。
    let singleFingerTapCandidate = false;
    // 标记本次 touch 从 Popover/手柄内发起。
    // 若 true，touchend 不干预选区、不触发 start/end、不设置 suppress —— 让合成 click 冒泡到按钮。
    let touchStartedInPopoverOrHandle = false;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartedInPopoverOrHandle = false;
      singleFingerTapCandidate = false;
      moved = false;
      longPressTriggered = false;
      if (e.touches.length !== 1) {
        skipClickRef.current = createSkipClickToken(null);
        return;
      }
      const target = e.target;
      if (target instanceof Element && target.closest('.hsn-selection-handle')) {
        touchStartedInPopoverOrHandle = true;
        return;
      }
      if (target instanceof Node) {
        if (popoverRef.current?.contains(target)) {
          touchStartedInPopoverOrHandle = true;
          return;
        }
        if (selectionPopoverRef.current?.contains(target)) {
          touchStartedInPopoverOrHandle = true;
          return;
        }
      }
      singleFingerTapCandidate = true;

      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      timer = setTimeout(() => {
        timer = null;
        longPressTriggered = true;
        const wordRange = selectWordAtPoint(touch.clientX, touch.clientY);
        if (wordRange) {
          setFromRangeRef.current(wordRange);
          // 移动端 setFromRange 不创建原生 Selection，handleMouseUp 检测到 isCollapsed 直接 return，
          // 因此 start/end 必须由本 touch handler 独立管理。此处触发 onSelectionStart。
          const startCb = onSelectionStartRef.current;
          if (startCb) {
            const sel = window.getSelection();
            if (sel) startCb({ x: touch.clientX, y: touch.clientY }, sel);
          }
        }
      }, LONG_PRESS_MS);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!singleFingerTapCandidate) {
        if (e.touches.length !== 1) skipClickRef.current = createSkipClickToken(null);
        return;
      }
      if (timer === null) return;
      if (e.touches.length !== 1) {
        clearTimeout(timer);
        timer = null;
        singleFingerTapCandidate = false;
        skipClickRef.current = createSkipClickToken(null);
        return;
      }
      const touch = e.touches[0];
      if (Math.hypot(touch.clientX - startX, touch.clientY - startY) > MOVE_THRESHOLD_PX) {
        moved = true;
        clearTimeout(timer);
        timer = null;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      // Popover/手柄内发起的 touch：不干预选区，让合成 click 到达按钮。
      // 修复 Issue 2：之前点击 Popover 高亮按钮会清除选区导致按钮失效。
      if (touchStartedInPopoverOrHandle) {
        touchStartedInPopoverOrHandle = false;
        return;
      }
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      // 移动端 touchend 后浏览器合成 mousedown，统一抑制其触发 onSelectionStart。
      // start/end 生命周期由本 touch handler 独立管理，不依赖合成鼠标事件。
      // 修复 Issue 3：点击取消选区不应触发 start。
      suppressNextMouseDownStartRef.current = true;
      // 长按选词结束：触发 onSelectionEnd。
      // 修复 Issue 1：移动端 setFromRange 不创建原生 Selection，handleMouseUp 检测 isCollapsed 直接 return，
      // 导致 end 永远不触发。此处补充触发。
      if (longPressTriggered && hasSelectionRef.current) {
        const endCb = onSelectionEndRef.current;
        if (endCb) {
          const touch = e.changedTouches[0];
          const sel = window.getSelection();
          if (sel && touch) endCb({ x: touch.clientX, y: touch.clientY }, sel);
        }
      }
      // 轻触取消选区：已有选区且非长按、非移动 → 清除选区。
      // 修复 Issue 3：点击任意位置取消选中。
      const isSingleFingerTap = singleFingerTapCandidate && !moved && !longPressTriggered;
      if (isSingleFingerTap && hasSelectionRef.current) {
        clearActiveSelectionRef.current();
      } else if (hasSelectionRef.current) {
        const touch = e.changedTouches[0] ?? null;
        skipClickRef.current = createSkipClickToken(
          touch ? { clientX: touch.clientX, clientY: touch.clientY } : null,
        );
      }
      singleFingerTapCandidate = false;
      moved = false;
      longPressTriggered = false;
    };

    const clearTimer = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      singleFingerTapCandidate = false;
      moved = false;
      longPressTriggered = false;
      touchStartedInPopoverOrHandle = false;
    };

    container.addEventListener('touchstart', handleTouchStart, {
      passive: true,
    });
    container.addEventListener('touchmove', handleTouchMove, {
      passive: true,
    });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', clearTimer, { passive: true });
    return () => {
      clearTimer();
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', clearTimer);
    };
  }, [isTextTool]);

  // 当用户开始拖选新文本时（hasSelection 变为 true），自动取消当前选中的高亮 range。
  // 这实现了「当前新选择而又没高亮的选区」与「已选中的高亮 range」互斥的需求。
  useEffect(() => {
    if (hasSelection) {
      selectRange?.(null);
      onSelectRect?.(null);
    }
  }, [hasSelection, onSelectRect, selectRange]);

  useEffect(() => {
    if (!linkedContext || !hasSelection || !linkedRange) return;
    if (linkedRange.start.selectionId !== linkedContext.selectionId) return;
    if (linkedActiveRangeEqual(linkedContext.data.activeRange, linkedRange)) return;
    onLinkedDataChange?.({
      ...linkedContext.data,
      activeRange: linkedRange,
      selectedRangeId: null,
    });
  }, [hasSelection, linkedContext, linkedRange, onLinkedDataChange]);

  // 容器点击：用于「点击高亮以选中」的命中测试。
  // 高亮 Overlay 在文字下方，这里读容器坐标并和持久 rect 做矩形包含检测。
  // 如果当前是「拖选完成」的 click（getSelection 仍有文本），则不触发选中。
  // Toggle 行为：点击已选中的 range 取消选中，点击未选中的 range 设为选中。
  const handleContainerClick = useCallback(
    (e: MouseEvent) => {
      // 拖拽手柄结束后浏览器合成 click 事件，此处消费 skip 标记并跳过命中测试，
      // 避免拖拽后误触发 toggle 清空 selectedRangeId。
      const skipClickToken = skipClickRef.current;
      if (skipClickToken) {
        skipClickRef.current = null;
        if (skipClickTokenMatches(skipClickToken, e)) return;
      }

      // 点击来自 Popover 或选区 Popover 内部时，不做命中测试。
      // 否则点击删除按钮等操作会冒泡到 container click，
      // 导致对 Popover 位置坐标做 hit-test 选中了下方的高亮。
      // 此检查需在 hasSelection 分支之前，避免点击 popover 按钮时误清除文字选区。
      const target = e.target;
      if (e.defaultPrevented) return;
      if (target instanceof Node) {
        const popoverEl = popoverRef.current;
        const selectionPopoverEl = selectionPopoverRef.current;
        if (popoverEl?.contains(target)) return;
        if (selectionPopoverEl?.contains(target)) return;
      }

      if (
        target instanceof Element &&
        target.closest(
          'button, a, input, textarea, select, option, label, summary, details, [role="button"], [contenteditable="true"]',
        )
      ) {
        return;
      }

      if (activeRect) {
        clearActiveRect();
        return;
      }

      // 已有活跃选区时：drag 结束后的合成 click 会被 skip token 吞掉；
      // 其他 click 都代表用户显式取消选中，不再区分点击点是否落在 rect 内。
      if (hasActiveTextSelection) {
        clearActiveSelection();
        return;
      }

      const native = window.getSelection();
      if (native && !native.isCollapsed && native.toString().trim()) return;

      const container = containerRef.current;
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      const x = e.clientX - cRect.left;
      const y = e.clientY - cRect.top;

      let hitRectId: string | null = null;
      for (const { id, rects: rs } of persistedSelectionRects) {
        for (const r of rs) {
          if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
            hitRectId = id;
            break;
          }
        }
        if (hitRectId) break;
      }
      if (hitRectId) {
        onSelectRect?.(hitRectId === selectedRectId ? null : hitRectId);
        selectRange?.(null);
        return;
      }

      for (const { id, rects: rs } of persistedRects) {
        for (const r of rs) {
          if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
            selectRange?.(id === currentSelectedRangeId ? null : id);
            onSelectRect?.(null);
            return;
          }
        }
      }

      selectRange?.(null);
      onSelectRect?.(null);
    },
    [
      selectRange,
      currentSelectedRangeId,
      persistedRects,
      hasActiveTextSelection,
      clearActiveSelection,
      activeRect,
      persistedSelectionRects,
      onSelectRect,
      selectedRectId,
      clearActiveRect,
    ],
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

  // 点击文档任意位置取消选中，除了 Popover / handle 内部。
  // 用 pointerdown 而非 click，确保比容器内的 click 早触发：
  //   pointerdown(document) → click(container) → click(document)
  // 这样即使点击是落在另一个高亮 rect 上，document 先清空，
  // 紧接着 container 的 click 通过 hit-test 再把新 rect 设为选中，最终状态正确。
  // touch / pen 直接跳过，避免双指缩放等触摸手势误触发取消选中。
  useEffect(() => {
    if (!currentSelectedRangeId && !selectedRectId && !activeRect) return;
    const handleDocPointerDown = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== 'mouse') {
        skipClickRef.current = createSkipClickToken(null);
        return;
      }
      if (dragHandleRef.current || dragPersistedIdRef.current) return;
      if (e.target instanceof Element && e.target.closest('.hsn-selection-handle')) return;
      if (e.target instanceof Element && e.target.closest('.hsn-selection-popover')) return;
      // 外部工具栏/表单控件本身是一个明确操作（如确认矩形、切换工具），
      // 不应被当作“点击空白处取消选中”，否则 pointerdown 会抢在 button click 前清掉 active rect。
      if (
        e.target instanceof Element &&
        e.target.closest(
          'button, input, select, textarea, label, a[href], [role="button"], [role="menuitem"], [contenteditable="true"]',
        )
      ) {
        return;
      }
      const popoverEl = popoverRef.current;
      if (popoverEl && e.target instanceof Node && popoverEl.contains(e.target)) return;
      const selectionPopoverEl = selectionPopoverRef.current;
      if (selectionPopoverEl && e.target instanceof Node && selectionPopoverEl.contains(e.target))
        return;

      const container = containerRef.current;
      if (container && e.target instanceof Node && container.contains(e.target)) return;

      if (activeRectRef.current) {
        clearActiveRect();
        return;
      }

      if (currentSelectedRangeIdRef.current) {
        selectRange?.(null);
      }
      if (selectedRectIdRef.current) {
        onSelectRectRef.current?.(null);
      }
    };
    document.addEventListener('pointerdown', handleDocPointerDown);
    return () => {
      document.removeEventListener('pointerdown', handleDocPointerDown);
    };
  }, [activeRect, clearActiveRect, currentSelectedRangeId, selectRange, selectedRectId]);

  const beginHandleDrag = useCallback(
    (which: 'start' | 'end', rangeId: string | undefined, handleElement: HTMLElement) => {
      const nextPersistedId = rangeId ?? null;
      if (dragHandleRef.current === which && dragPersistedIdRef.current === nextPersistedId) return;

      // 立即设内联 pointer-events: none，不依赖 React 重渲染 → CSS class 链。
      // 首帧 pointermove 在 React commit 前就可能触发，若手柄仍 intercept 事件，
      // caretRangeFromPoint 会命中手柄而非文字，导致选区跳变/闪烁。
      handleElement.style.pointerEvents = 'none';
      dragHandleElRef.current = handleElement;
      dragHandleRef.current = which;
      dragPersistedIdRef.current = nextPersistedId;

      // 缓存拖动锚点：不动的那个边界。拖 start 锚点=end，拖 end 锚点=start。
      // 活跃选区从 ref 读取当前 endIndex/startIndex；高亮 range 从 ranges 读取当前 range 的 end/start。
      if (nextPersistedId) {
        const linkedData = linkedDataRef.current;
        const currentSelId = linkedSelectionIdRef.current;
        if (linkedData && currentSelId) {
          const item = linkedData.items.find((it) => it.id === nextPersistedId);
          if (!item) {
            dragAnchorRef.current = -1;
            return;
          }
          dragLinkedAnchorRef.current = which === 'start' ? item.end : item.start;
          dragAnchorRef.current = which === 'start' ? item.end.offset : item.start.offset;
        } else {
          // legacy 模式
          const r = rangesRef.current.find((x) => x.id === nextPersistedId);
          dragAnchorRef.current = r ? (which === 'start' ? r.end : r.start) : -1;
        }
      } else {
        const activeLinkedRange = linkedRange ?? linkedDataRef.current?.activeRange ?? null;
        if (activeLinkedRange) {
          const anchorEndpoint =
            which === 'start' ? activeLinkedRange.end : activeLinkedRange.start;
          dragLinkedAnchorRef.current = anchorEndpoint;
          dragAnchorRef.current = anchorEndpoint.offset;
        } else {
          dragAnchorRef.current = which === 'start' ? endIndexRef.current : startIndexRef.current;
          dragLinkedAnchorRef.current = null;
        }
      }
      // 在联动模式下同步共享拖拽状态，让所有关联容器都能隐藏对应手柄/Popover。
      const currentLinkedData = linkedDataRef.current;
      const currentLinkedSelectionId = linkedSelectionIdRef.current;
      if (currentLinkedData && currentLinkedSelectionId) {
        setLinkedDraggingRange(
          nextPersistedId
            ? { type: 'persisted-range', id: nextPersistedId }
            : { type: 'active-selection' },
        );
      }

      setDragHandle(which);
      setDragPersistedId(nextPersistedId);
    },
    [linkedRange, setLinkedDraggingRange],
  );

  /**
   * 手柄 pointerdown/mousedown：进入拖动模式。
   * preventDefault 阻止浏览器开始新的原生文本选区；
   * stopPropagation 阻止冒泡到容器，避免误触发「点击高亮选中」逻辑。
   * 第二参数 rangeId 可选：传入则表示拖动的是已选中高亮 range 的手柄（修改其 start/end）；
   * 不传则拖动的是活跃选区手柄（修改原生 selection）。
   */
  const startHandleDrag = useCallback(
    (which: 'start' | 'end', rangeId?: string) => (e: HandleDragStartEvent) => {
      e.preventDefault();
      e.stopPropagation();
      beginHandleDrag(which, rangeId, e.currentTarget);
    },
    [beginHandleDrag],
  );

  const beginRectHandleDrag = useCallback(
    (which: 'start' | 'end', rectId: string | undefined, handleElement: HTMLElement) => {
      const nextPersistedId = rectId ?? null;
      if (dragHandleRef.current === which && dragPersistedIdRef.current === nextPersistedId) return;

      handleElement.style.pointerEvents = 'none';
      dragHandleElRef.current = handleElement;
      dragHandleRef.current = which;
      dragPersistedIdRef.current = nextPersistedId;

      if (nextPersistedId) {
        const item = propRects.find((r) => r.id === nextPersistedId);
        if (item) {
          dragRectAnchorRef.current = which === 'start' ? item.end : item.start;
        }
      } else {
        const currentActiveRect = activeRectRef.current;
        if (currentActiveRect) {
          dragRectAnchorRef.current =
            which === 'start' ? currentActiveRect.end : currentActiveRect.start;
        }
      }

      setDragHandle(which);
      setDragPersistedId(nextPersistedId);
    },
    [propRects],
  );

  const startRectHandleDrag = useCallback(
    (which: 'start' | 'end', rectId?: string) => (e: HandleDragStartEvent) => {
      e.preventDefault();
      e.stopPropagation();
      beginRectHandleDrag(which, rectId, e.currentTarget);
    },
    [beginRectHandleDrag],
  );

  useEffect(() => {
    const handleNativeDragStart = (event: PointerEvent | MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const handle = target.closest<HTMLElement>('.hsn-selection-handle');
      if (!handle) return;
      const container = containerRef.current;
      if (!container?.contains(handle)) return;

      const type = handle.classList.contains('hsn-selection-handle--start')
        ? 'start'
        : handle.classList.contains('hsn-selection-handle--end')
          ? 'end'
          : undefined;
      if (!type) return;

      event.preventDefault();
      event.stopPropagation();

      if (handle.classList.contains('hsn-selection-handle-rect')) {
        const rectId = handle.getAttribute('data-rect-id') || undefined;
        beginRectHandleDrag(type, rectId, handle);
      } else {
        const rangeId = !hasSelectionRef.current
          ? (currentSelectedRangeIdRef.current ?? undefined)
          : undefined;
        beginHandleDrag(type, rangeId, handle);
      }
    };

    document.addEventListener('pointerdown', handleNativeDragStart, true);
    document.addEventListener('mousedown', handleNativeDragStart, true);
    return () => {
      document.removeEventListener('pointerdown', handleNativeDragStart, true);
      document.removeEventListener('mousedown', handleNativeDragStart, true);
    };
  }, [beginHandleDrag, beginRectHandleDrag]);

  /**
   * 拖动进行中 / 结束的全局 pointer 监听。
   * 始终挂载，具体拖动状态通过 refs 判断，避免首个 pointermove 早于 React state commit 时丢失。
   * 在 pointermove 中：
   *   1) 通过 caretInfoFromPoint 在鼠标处反查 caret 的 (node, offset)；
   *   2) 用 preRange 累计字符长度，换算为容器纯文本偏移；
   *   3) 以拖动开始时缓存的 anchor（不动边界）为锚点，newOffset 为移动边界，
   *      用 Math.min/max 生成正端 lo/hi，允许越过锚点实现反向选区；
   *   4) 活跃选区：构造 DOM Range + setSelection 触发 selectionchange → hook 更新 rects；
   *      高亮 range：构造 updated SelectionRange + onUpdateRange 上报，并同步原生 selection 以更新 persisted rects。
   * 监听器不依赖 dragHandle state；使用 rangesRef / dragAnchorRef 桥接最新值，
   * 避免 selectionchange 同步更新 ref 导致锚点漂移。
   */
  useEffect(() => {
    const isTouch =
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

    const onMove = (e: PointerEvent) => {
      const which = dragHandleRef.current;
      if (!which) return;
      const container = containerRef.current;
      if (!container) return;
      const persistedId = dragPersistedIdRef.current;
      const persistedRectItem = persistedId
        ? propRects.find((rect) => rect.id === persistedId)
        : undefined;

      if (persistedRectItem || (isRectTool && activeRect)) {
        const point = pointFromPointer(e);
        if (!point) return;

        if (persistedRectItem) {
          const item = persistedRectItem;
          const anchor = which === 'start' ? item.end : item.start;

          let anchorPixel = anchor;
          if (item.overlayRectType === 'percent') {
            const { width, height } = container.getBoundingClientRect();
            anchorPixel = {
              x: (anchor.x / 100) * width,
              y: (anchor.y / 100) * height,
            };
          }
          const rect = normalizeRectFromPoints(anchorPixel, point);

          let start = which === 'start' ? point : anchorPixel;
          let end = which === 'start' ? anchorPixel : point;

          if (item.overlayRectType === 'percent') {
            const { width, height } = container.getBoundingClientRect();
            start = {
              x: (start.x / width) * 100,
              y: (start.y / height) * 100,
            };
            end = {
              x: (end.x / width) * 100,
              y: (end.y / height) * 100,
            };
          }

          if (
            rect.x === item.rect.x &&
            rect.y === item.rect.y &&
            rect.width === item.rect.width &&
            rect.height === item.rect.height
          ) {
            return;
          }

          onUpdateRect?.({
            ...item,
            start,
            end,
            rect: storeRectForOverlayRectType(rect, item.overlayRectType, container),
          });
          return;
        } else if (activeRect) {
          const anchor = dragRectAnchorRef.current;
          if (!anchor) return;
          const rect = normalizeRectFromPoints(anchor, point);
          setActiveRect({
            start: which === 'start' ? point : anchor,
            end: which === 'start' ? anchor : point,
            rect,
          });
          return;
        }
      }

      const info = caretInfoFromPoint(e.clientX, e.clientY);
      if (!info) return;

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
        if (!linkedDomRange) return;
        if (isTouch) {
          setFromRangeRef.current(linkedDomRange);
        } else {
          const selection = window.getSelection();
          if (!selection) return;
          selection.removeAllRanges();
          selection.addRange(linkedDomRange);
        }
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
            {
              markerStyle: cur.markerStyle,
              selectionStyle: cur.selectionStyle,
            },
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

      if (isTouch) {
        setFromRangeRef.current(newRange);
      } else {
        const sel = window.getSelection();
        if (!sel) return;
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!dragHandleRef.current && !dragPersistedIdRef.current) return;
      const persistedId = dragPersistedIdRef.current;
      if (dragHandleElRef.current) {
        dragHandleElRef.current.style.pointerEvents = '';
        dragHandleElRef.current = null;
      }
      skipClickRef.current = createSkipClickToken({
        clientX: e.clientX,
        clientY: e.clientY,
      });
      dragHandleRef.current = null;
      dragPersistedIdRef.current = null;
      dragLinkedAnchorRef.current = null;
      dragAnchorRef.current = -1;
      setDragHandle(null);
      setDragPersistedId(null);
      if (persistedId) {
        if (propRects.some((rect) => rect.id === persistedId)) {
          onSelectRectRef.current?.(persistedId);
        } else {
          selectRange?.(persistedId);
        }
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
  }, [
    legacyOverlayRectType,
    selectRange,
    setLinkedDraggingRange,
    styleSnapshot,
    isRectTool,
    pointFromPointer,
    propRects,
    onUpdateRect,
    activeRect,
  ]);

  // 计算 Popover 的锚点：选中 range 的最顶部矩形的水平中点 + 顶边。
  // 没有选中、或选中的 id 在 persistedRects 中找不到时为 null（不渲染 Popover）。
  const popoverAnchor = (() => {
    // 拖拽 range handle 或鼠标选择文本期间隐藏 Popover，避免遮挡视线或位置跳动。
    // 联动模式下，同一次拖拽/选择在其它关联容器中也应隐藏。
    if (dragHandle || isLinkedSelectedRangeDragging || isSelectingText || isLinkedSelectingText)
      return null;

    if (selectedRectId && popover) {
      const entry = persistedSelectionRects.find((p) => p.id === selectedRectId);
      if (entry && entry.rects.length > 0) {
        const anchorRects = entry.overlayRectType === 'percent' ? entry.percentRects : entry.rects;
        let top = anchorRects[0];
        for (const r of anchorRects) {
          if (r.y < top.y) top = r;
        }
        return {
          x: top.x + top.width / 2,
          y: top.y,
          overlayRectType: entry.overlayRectType,
        };
      }
    }

    if (!currentSelectedRangeId || !popover) return null;
    if (linkedContext) {
      const selectedItem = linkedContext.data.items.find(
        (item) => item.id === currentSelectedRangeId,
      );
      if (!selectedItem || selectedItem.start.selectionId !== linkedContext.selectionId)
        return null;
    }
    const entry = persistedRects.find((p) => p.id === currentSelectedRangeId);
    if (!entry) return null;
    const anchorRects = entry.overlayRectType === 'percent' ? entry.percentRects : entry.rects;
    if (anchorRects.length === 0) return null;
    let top = anchorRects[0];
    for (const r of anchorRects) {
      if (r.y < top.y) top = r;
    }
    return {
      x: top.x + top.width / 2,
      y: top.y,
      overlayRectType: entry.overlayRectType,
    };
  })();

  // 百分比坐标只在 rects 变化（新选区）时计算一次，避免缩放导致容器 BCR 变化后重算出漂移的百分比值
  const activePercentRects = useMemo(() => {
    if (activeSelectionRectGroup) return activeSelectionRectGroup.percentRects;
    if (!hasSelection && sharedActiveRectGroup) return sharedActiveRectGroup.percentRects;
    const container = containerRef.current;
    if (!container || displayActiveOverlayRectType !== 'percent') return [];
    return pixelRectsToPercentRects(displayRects, container);
  }, [
    displayRects,
    displayActiveOverlayRectType,
    hasSelection,
    sharedActiveRectGroup,
    activeSelectionRectGroup,
  ]);

  // 计算「选区 Popover」锚点：活跃选区（未高亮）最顶部矩形的水平中点 + 顶边。
  // 与 popoverAnchor 互斥（活跃选区时 selectedRangeId 必为 null）。
  const selectionPopoverAnchor = (() => {
    // 拖拽 range handle 或鼠标选择文本期间隐藏选区 Popover，避免遮挡视线或位置跳动。
    // 联动模式下，同一次拖拽/选择在其它关联容器中也应隐藏。
    if (
      dragHandle ||
      isLinkedActiveSelectionDragging ||
      isSelectingText ||
      isLinkedSelectingText ||
      isDrawingRect
    )
      return null;

    if (activeRect && selectionPopover) {
      const anchorRects =
        activeRectOverlayRectType === 'percent'
          ? activeSelectionRectGroup?.percentRects || []
          : activeSelectionRectGroup?.rects || [];
      if (anchorRects.length > 0) {
        let top = anchorRects[0];
        for (const r of anchorRects) {
          if (r.y < top.y) top = r;
        }
        return {
          x: top.x + top.width / 2,
          y: top.y,
          overlayRectType: activeRectOverlayRectType,
        };
      }
    }

    if (!hasActiveTextSelection || !selectionPopover || displayRects.length === 0) {
      return null;
    }
    if (
      !activeSelectionRectGroup &&
      linkedContext &&
      activeRangeForDisplay?.start.selectionId !== linkedContext.selectionId
    ) {
      return null;
    }
    const anchorRects =
      displayActiveOverlayRectType === 'percent' ? activePercentRects : displayRects;
    if (anchorRects.length === 0) return null;
    let top = anchorRects[0];
    for (const r of anchorRects) {
      if (r.y < top.y) top = r;
    }
    return {
      x: top.x + top.width / 2,
      y: top.y,
      overlayRectType: displayActiveOverlayRectType,
    };
  })();

  function buildPositionStyleValue(value: number, overlayRectType: OverlayRectType): string {
    return overlayRectType === 'percent' ? `${value}%` : `${value}px`;
  }

  // 构建手柄的内联样式：绝对定位 + 从 owner 样式推导的颜色。
  const buildHandleStyle = (
    left: number,
    top: number,
    overlayRectType: OverlayRectType,
    ownerStyle: CSSProperties | undefined,
  ): React.CSSProperties => {
    const s: React.CSSProperties = {
      left: buildPositionStyleValue(left, overlayRectType),
      top: buildPositionStyleValue(top, overlayRectType),
    };
    const visual = deriveHandleVisualStyle(ownerStyle, legacyHandleFallback);
    if (visual.background !== undefined) s.background = visual.background;
    if (visual.borderColor !== undefined) {
      s.borderColor = visual.borderColor;
      s.borderWidth =
        typeof visual.borderWidth === 'number'
          ? `${visual.borderWidth}px`
          : (visual.borderWidth ?? '2px');
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
    onDragStart: (e: HandleDragStartEvent) => void,
    ariaLabel: string,
    className: string,
    style: React.CSSProperties,
    positionUnit: OverlayRectType = legacyOverlayRectType,
    target: 'text' | 'rect' = 'text',
    rectId: string | null = null,
  ) => {
    const handleProps: HandleRenderProps = {
      type,
      owner,
      rangeId,
      target,
      rectId,
      position,
      positionUnit,
      isDragging,
      onPointerDown: (event) => onDragStart(event),
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
        data-rect-id={rectId ?? ''}
        data-range-id={rangeId ?? ''}
        ref={(el) => {
          if (!el) return;
          const nativeDragStart = (event: PointerEvent | MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            if (target === 'rect') {
              beginRectHandleDrag(type, rectId ?? undefined, el);
            } else {
              beginHandleDrag(type, rangeId ?? undefined, el);
            }
          };
          el.onpointerdown = nativeDragStart;
          el.onmousedown = nativeDragStart;
        }}
        onMouseDown={onDragStart}
        onPointerDown={handleProps.onPointerDown}
      />
    );
  };

  return (
    <div
      ref={containerRef}
      className={`hsn-selection-container${isRectTool ? ' hsn-selection-container--rect-tool' : ''}${className ? ` ${className}` : ''}`}
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
            const svgProps: {
              fill?: string;
              stroke?: string;
              strokeWidth?: number | string;
            } = styleToSvgRectProps(groupStyle);
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

        {persistedSelectionRects.map((group) => {
          const { id, selectionId: rectSelectionId, overlayRectType: rectType, rects: rs } = group;
          if (rectType !== 'px') return null;
          return rs.map((r) => {
            const isSelected = id === selectedRectId;
            const groupStyle = isSelected
              ? getEffectiveSelectedMarkerStyle(group.markerStyle, styleInput)
              : getEffectiveMarkerStyle(group.markerStyle, styleInput);
            const svgProps: {
              fill?: string;
              stroke?: string;
              strokeWidth?: number | string;
            } = styleToSvgRectProps(groupStyle);
            return (
              <rect
                key={`${id}-${r.x},${r.y},${r.width},${r.height}`}
                data-rect-id={id}
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

        {hasActiveTextSelection &&
          displayActiveOverlayRectType === 'px' &&
          displayRects.map((r) => {
            const activeSvgProps: {
              fill?: string;
              stroke?: string;
              strokeWidth?: number | string;
            } = styleToSvgRectProps(activeSelectionStyle);
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
        {activeRect && activeRectOverlayRectType === 'px' && (
          <rect
            data-rect-id=""
            data-selection-id={linkedContext?.selectionId ?? ''}
            className="hsn-selection-rect hsn-selection-rect--active"
            x={activeRect.rect.x}
            y={activeRect.rect.y}
            width={activeRect.rect.width}
            height={activeRect.rect.height}
            rx={2}
            ry={2}
            style={styleToSvgRectProps(activeSelectionStyle)}
          />
        )}
      </svg>

      {(persistedRects.some((group) => group.overlayRectType === 'percent') ||
        persistedSelectionRects.some((group) => group.overlayRectType === 'percent') ||
        (hasActiveTextSelection && displayActiveOverlayRectType === 'percent') ||
        (activeRect && activeRectOverlayRectType === 'percent')) && (
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
                    {
                      left: `${r.x}%`,
                      top: `${r.y}%`,
                      width: `${r.width}%`,
                      height: `${r.height}%`,
                    },
                    groupStyle,
                  )}
                />
              );
            });
          })}

          {persistedSelectionRects.map((group) => {
            const { id, overlayRectType: rectType, percentRects } = group;
            if (rectType !== 'percent') return null;
            return percentRects.map((r) => {
              const isSelected = id === selectedRectId;
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
                    {
                      left: `${r.x}%`,
                      top: `${r.y}%`,
                      width: `${r.width}%`,
                      height: `${r.height}%`,
                    },
                    groupStyle,
                  )}
                />
              );
            });
          })}

          {hasActiveTextSelection &&
            displayActiveOverlayRectType === 'percent' &&
            activePercentRects.map((r) => (
              <div
                key={`active-${r.x},${r.y},${r.width},${r.height}`}
                className="hsn-selection-percent-rect hsn-selection-percent-rect-active"
                style={buildPercentRectStyle(
                  {
                    left: `${r.x}%`,
                    top: `${r.y}%`,
                    width: `${r.width}%`,
                    height: `${r.height}%`,
                  },
                  activeSelectionStyle,
                )}
              />
            ))}
          {activeRect &&
            activeRectOverlayRectType === 'percent' &&
            activeSelectionRectGroup?.percentRects.map((r) => (
              <div
                key={`active-rect-${r.x},${r.y},${r.width},${r.height}`}
                className="hsn-selection-percent-rect hsn-selection-percent-rect-active"
                style={buildPercentRectStyle(
                  {
                    left: `${r.x}%`,
                    top: `${r.y}%`,
                    width: `${r.width}%`,
                    height: `${r.height}%`,
                  },
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
            left: buildPositionStyleValue(
              selectionPopoverAnchor.x,
              selectionPopoverAnchor.overlayRectType,
            ),
            top: buildPositionStyleValue(
              selectionPopoverAnchor.y,
              selectionPopoverAnchor.overlayRectType,
            ),
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
      {activeRect &&
        !isDrawingRect &&
        !isLinkedSelectingText &&
        !dragPersistedId &&
        (() => {
          const isDraggingActive = !!(dragHandle && !dragPersistedId);
          const container = containerRef.current;

          let displayStart = activeRect.start;
          let displayEnd = activeRect.end;

          if (activeRectOverlayRectType === 'percent' && container) {
            const { width, height } = container.getBoundingClientRect();
            displayStart = {
              x: (displayStart.x / width) * 100,
              y: (displayStart.y / height) * 100,
            };
            displayEnd = {
              x: (displayEnd.x / width) * 100,
              y: (displayEnd.y / height) * 100,
            };
          }

          return (
            <>
              {renderSingleHandle(
                'start',
                'active-selection',
                null,
                { x: displayStart.x, y: displayStart.y },
                isDraggingActive,
                startRectHandleDrag('start'),
                '拖动以调整选区起点',
                `hsn-selection-handle hsn-selection-handle--start hsn-selection-handle-rect${isDraggingActive ? ' hsn-selection-handle--dragging' : ''}`,
                buildHandleStyle(
                  displayStart.x,
                  displayStart.y,
                  activeRectOverlayRectType,
                  activeSelectionStyle,
                ),
                activeRectOverlayRectType,
                'rect',
                null,
              )}
              {renderSingleHandle(
                'end',
                'active-selection',
                null,
                { x: displayEnd.x, y: displayEnd.y },
                isDraggingActive,
                startRectHandleDrag('end'),
                '拖动以调整选区终点',
                `hsn-selection-handle hsn-selection-handle--end hsn-selection-handle-rect${isDraggingActive ? ' hsn-selection-handle--dragging' : ''}`,
                buildHandleStyle(
                  displayEnd.x,
                  displayEnd.y,
                  activeRectOverlayRectType,
                  activeSelectionStyle,
                ),
                activeRectOverlayRectType,
                'rect',
                null,
              )}
            </>
          );
        })()}

      {hasActiveTextSelection &&
        displayRects.length > 0 &&
        !isSelectingText &&
        !isLinkedSelectingText &&
        !dragHandle &&
        !isLinkedSelectedRangeDragging &&
        !isLinkedActiveSelectionDragging &&
        (() => {
          const activeHandleRects =
            displayActiveOverlayRectType === 'percent' ? activePercentRects : displayRects;
          if (activeHandleRects.length === 0) return null;

          const showStartHandle =
            !linkedContext ||
            !activeRangeForDisplay ||
            activeRangeForDisplay.start.selectionId === linkedContext.selectionId;
          const showEndHandle =
            !linkedContext ||
            !activeRangeForDisplay ||
            activeRangeForDisplay.end.selectionId === linkedContext.selectionId;

          const first = activeHandleRects[0] || {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
          };
          const last = activeHandleRects[activeHandleRects.length - 1] || {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
          };

          return (
            <>
              {showStartHandle &&
                renderSingleHandle(
                  'start',
                  'active-selection',
                  null,
                  { x: first.x, y: first.y + first.height / 2 },
                  false,
                  startHandleDrag('start'),
                  '拖动以调整选区起点',
                  'hsn-selection-handle hsn-selection-handle--start',
                  buildHandleStyle(
                    first.x,
                    first.y + first.height / 2,
                    displayActiveOverlayRectType,
                    activeSelectionStyle,
                  ),
                  displayActiveOverlayRectType,
                  'text',
                  null,
                )}
              {showEndHandle &&
                renderSingleHandle(
                  'end',
                  'active-selection',
                  null,
                  { x: last.x + last.width, y: last.y + last.height / 2 },
                  false,
                  startHandleDrag('end'),
                  '拖动以调整选区终点',
                  'hsn-selection-handle hsn-selection-handle--end',
                  buildHandleStyle(
                    last.x + last.width,
                    last.y + last.height / 2,
                    displayActiveOverlayRectType,
                    activeSelectionStyle,
                  ),
                  displayActiveOverlayRectType,
                  'text',
                  null,
                )}
            </>
          );
        })()}

      {!hasActiveTextSelection &&
        !activeRect &&
        (selectedRectId || currentSelectedRangeId) &&
        (!dragHandle ||
          dragPersistedId === selectedRectId ||
          dragPersistedId === currentSelectedRangeId) &&
        (!isLinkedSelectedRangeDragging || !!selectedRectId) &&
        (() => {
          if (selectedRectId) {
            const persistedSelectionRect = propRects.find((rect) => rect.id === selectedRectId);
            if (!persistedSelectionRect) return null;
            if (
              linkedContext &&
              persistedSelectionRect.selectionId &&
              persistedSelectionRect.selectionId !== linkedContext.selectionId
            ) {
              return null;
            }
            const isDraggingPersisted = !!(dragHandle && dragPersistedId === selectedRectId);
            const entryType = persistedSelectionRect.overlayRectType || 'px';
            const persistedHandleStyle = getEffectiveMarkerStyle(
              persistedSelectionRect.markerStyle,
              styleInput,
            );

            return (
              <>
                {renderSingleHandle(
                  'start',
                  'persisted-range',
                  selectedRectId,
                  {
                    x: persistedSelectionRect.start.x,
                    y: persistedSelectionRect.start.y,
                  },
                  isDraggingPersisted,
                  startRectHandleDrag('start', selectedRectId),
                  '拖动以调整高亮起点',
                  `hsn-selection-handle hsn-selection-handle--start hsn-selection-handle-rect${isDraggingPersisted ? ' hsn-selection-handle--dragging' : ''}`,
                  buildHandleStyle(
                    persistedSelectionRect.start.x,
                    persistedSelectionRect.start.y,
                    entryType,
                    persistedHandleStyle,
                  ),
                  entryType,
                  'rect',
                  selectedRectId,
                )}
                {renderSingleHandle(
                  'end',
                  'persisted-range',
                  selectedRectId,
                  {
                    x: persistedSelectionRect.end.x,
                    y: persistedSelectionRect.end.y,
                  },
                  isDraggingPersisted,
                  startRectHandleDrag('end', selectedRectId),
                  '拖动以调整高亮终点',
                  `hsn-selection-handle hsn-selection-handle--end hsn-selection-handle-rect${isDraggingPersisted ? ' hsn-selection-handle--dragging' : ''}`,
                  buildHandleStyle(
                    persistedSelectionRect.end.x,
                    persistedSelectionRect.end.y,
                    entryType,
                    persistedHandleStyle,
                  ),
                  entryType,
                  'rect',
                  selectedRectId,
                )}
              </>
            );
          }

          const resolvedId = currentSelectedRangeId;
          if (!resolvedId) return null;

          let showStartHandle = true;
          let showEndHandle = true;
          if (linkedContext) {
            const item = linkedContext.data.items.find((it) => it.id === resolvedId);
            if (!item) return null;
            showStartHandle = item.start.selectionId === linkedContext.selectionId;
            showEndHandle = item.end.selectionId === linkedContext.selectionId;
            if (!showStartHandle && !showEndHandle) return null;
          }

          const entry = persistedRects.find((p) => p.id === resolvedId);
          if (!entry) return null;
          const rs = entry.overlayRectType === 'percent' ? entry.percentRects : entry.rects;
          if (rs.length === 0) return null;
          const persistedHandleStyle = getEffectiveMarkerStyle(entry.markerStyle, styleInput);
          const first = rs[0] || { x: 0, y: 0, width: 0, height: 0 };
          const last = rs[rs.length - 1] || {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
          };
          const isDraggingPersisted = !!(dragHandle && dragPersistedId === resolvedId);
          return (
            <>
              {showStartHandle &&
                renderSingleHandle(
                  'start',
                  'persisted-range',
                  resolvedId,
                  { x: first.x, y: first.y + first.height / 2 },
                  isDraggingPersisted,
                  startHandleDrag('start', resolvedId),
                  '拖动以调整高亮起点',
                  `hsn-selection-handle hsn-selection-handle--start${isDraggingPersisted ? ' hsn-selection-handle--dragging' : ''}`,
                  buildHandleStyle(
                    first.x,
                    first.y + first.height / 2,
                    entry.overlayRectType,
                    persistedHandleStyle,
                  ),
                  entry.overlayRectType,
                  'text',
                  null,
                )}
              {showEndHandle &&
                renderSingleHandle(
                  'end',
                  'persisted-range',
                  resolvedId,
                  { x: last.x + last.width, y: last.y + last.height / 2 },
                  isDraggingPersisted,
                  startHandleDrag('end', resolvedId),
                  '拖动以调整高亮终点',
                  `hsn-selection-handle hsn-selection-handle--end${isDraggingPersisted ? ' hsn-selection-handle--dragging' : ''}`,
                  buildHandleStyle(
                    last.x + last.width,
                    last.y + last.height / 2,
                    entry.overlayRectType,
                    persistedHandleStyle,
                  ),
                  entry.overlayRectType,
                  'text',
                  null,
                )}
            </>
          );
        })()}
    </div>
  );
});

export default Selection;
