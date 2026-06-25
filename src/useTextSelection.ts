import { useCallback, useEffect, useState } from 'react';
import { pixelRectsToPercentRects } from './geometry';
import { getRegisteredContainers, resolveEndpoint } from './linkedRegistry';
import type {
  LinkedSelectionRange,
  OverlayRect,
  PercentOverlayRect,
  UseTextSelectionResult,
} from './types';

type UseTextSelectionOptions = {
  readonly linkedMode?: boolean;
  readonly selectionId?: string | null;
};

type LinkedSelectionCapture = {
  readonly item: LinkedSelectionRange;
  readonly localRects: OverlayRect[];
  readonly localStartIndex: number;
  readonly localEndIndex: number;
};

function getRangeOffsets(
  container: HTMLElement,
  selection: Selection,
): { start: number; end: number } | null {
  const range = selection.getRangeAt(0);
  if (!range) return null;

  if (!container.contains(range.commonAncestorContainer)) {
    return null;
  }

  const start = getLocalOffset(container, range.startContainer, range.startOffset);
  const end = getLocalOffset(container, range.endContainer, range.endOffset);
  if (start === null || end === null) return null;

  return { start, end };
}

function getLocalOffset(container: HTMLElement, node: Node, offset: number): number | null {
  if (!container.contains(node)) return null;
  const range = document.createRange();
  range.selectNodeContents(container);
  try {
    range.setEnd(node, offset);
  } catch (error) {
    if (error instanceof Error) return null;
    throw error;
  }
  return range.toString().length;
}

function generateId(): string {
  return `hsn-sel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isSameDocumentLightDomEndpoint(node: Node): boolean {
  const ownerDocument = node instanceof Document ? node : node.ownerDocument;
  return ownerDocument === document && node.getRootNode() === document;
}

function isRangeBackward(range: Range): boolean {
  const temp = document.createRange();
  temp.setStart(range.startContainer, range.startOffset);
  temp.setEnd(range.endContainer, range.endOffset);
  return temp.collapsed && !range.collapsed;
}

function createContainerFragmentRange(range: Range, container: HTMLElement): Range | null {
  if (!range.intersectsNode(container)) return null;

  const containerRange = document.createRange();
  containerRange.selectNodeContents(container);
  const fragment = document.createRange();

  try {
    if (range.compareBoundaryPoints(Range.START_TO_START, containerRange) <= 0) {
      fragment.setStart(containerRange.startContainer, containerRange.startOffset);
    } else {
      fragment.setStart(range.startContainer, range.startOffset);
    }

    if (range.compareBoundaryPoints(Range.END_TO_END, containerRange) >= 0) {
      fragment.setEnd(containerRange.endContainer, containerRange.endOffset);
    } else {
      fragment.setEnd(range.endContainer, range.endOffset);
    }
  } catch (error) {
    if (error instanceof Error) return null;
    throw error;
  }

  if (fragment.collapsed || !fragment.toString().trim()) return null;
  return fragment;
}

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

function captureLinkedSelection(
  selection: Selection,
  localSelectionId: string | null | undefined,
): LinkedSelectionCapture | null {
  const range = selection.getRangeAt(0);
  if (!range) return null;

  if (
    !isSameDocumentLightDomEndpoint(range.startContainer) ||
    !isSameDocumentLightDomEndpoint(range.endContainer)
  ) {
    return null;
  }

  const start = resolveEndpoint(range.startContainer, range.startOffset);
  const end = resolveEndpoint(range.endContainer, range.endOffset);
  if (!start || !end) return null;
  const backward = isRangeBackward(range);
  const documentStart = backward ? end : start;
  const documentEnd = backward ? start : end;

  const rectsBySelectionId: Record<string, PercentOverlayRect[]> = {};
  let linkedText = '';
  let localRects: OverlayRect[] = [];
  let localStartIndex = -1;
  let localEndIndex = -1;

  for (const entry of getRegisteredContainers()) {
    const fragment = createContainerFragmentRange(range, entry.element);
    if (!fragment) continue;
    const fragmentText = fragment.toString();

    const pixelRects = rangeToOverlayRects(fragment, entry.element);
    if (pixelRects.length === 0) continue;

    const fragmentStart = getLocalOffset(
      entry.element,
      fragment.startContainer,
      fragment.startOffset,
    );
    const fragmentEnd = getLocalOffset(
      entry.element,
      fragment.endContainer,
      fragment.endOffset,
    );
    if (fragmentStart === null || fragmentEnd === null) continue;

    const percentRects = pixelRectsToPercentRects(pixelRects, entry.element);
    if (percentRects.length === 0) continue;
    linkedText += fragmentText;
    rectsBySelectionId[entry.selectionId] = percentRects;

    if (entry.selectionId === localSelectionId) {
      localRects = pixelRects;
      localStartIndex = Math.min(fragmentStart, fragmentEnd);
      localEndIndex = Math.max(fragmentStart, fragmentEnd);
    }
  }

  if (Object.keys(rectsBySelectionId).length === 0) return null;

  return {
    item: {
      id: generateId(),
      text: linkedText,
      start: documentStart,
      end: documentEnd,
      createdAt: Date.now(),
      rectsBySelectionId,
    },
    localRects,
    localStartIndex,
    localEndIndex,
  };
}

function rangeToOverlayRects(range: Range, container: HTMLElement): OverlayRect[] {
  const containerRect = container.getBoundingClientRect();
  const out: OverlayRect[] = [];

  // Range#getClientRects() 在跨块级元素选择时会返回块容器自身的矩形。
  // 这里按文本节点切片后取 rect，只绘制真正选中文字的行盒，避免把大块父容器画成选区。
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node instanceof Text) {
      const textFragment = createTextFragmentRange(range, node);
      if (textFragment) {
        const rects = textFragment.getClientRects();
        for (let i = 0; i < rects.length; i += 1) {
          const r = rects[i];
          // 跳过零尺寸的杂项矩形（行末空 inline 框等）
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

interface InternalSelectionState {
  selectedText: string;
  startIndex: number;
  endIndex: number;
  /** 正在选择时的 Overlay 矩形（多行可能多个） */
  rects: OverlayRect[];
  linkedRange: LinkedSelectionRange | null;
}

const EMPTY_STATE: InternalSelectionState = {
  selectedText: '',
  startIndex: -1,
  endIndex: -1,
  rects: [],
  linkedRange: null,
};

export function useTextSelection(
  containerRef: React.RefObject<HTMLElement | null>,
  options: UseTextSelectionOptions = {},
): UseTextSelectionResult & {
  rects: OverlayRect[];
  linkedRange: LinkedSelectionRange | null;
} {
  const [state, setState] = useState<InternalSelectionState>(EMPTY_STATE);

  const handleSelectionChange = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      setState(EMPTY_STATE);
      return;
    }

    const text = selection.toString();
    if (!text.trim()) {
      setState(EMPTY_STATE);
      return;
    }

    if (options.linkedMode) {
      const linkedCapture = captureLinkedSelection(selection, options.selectionId);
      if (!linkedCapture) {
        setState(EMPTY_STATE);
        return;
      }

      setState({
        selectedText: linkedCapture.item.text,
        startIndex: linkedCapture.localStartIndex,
        endIndex: linkedCapture.localEndIndex,
        rects: linkedCapture.localRects,
        linkedRange: linkedCapture.item,
      });
      return;
    }

    const offsets = getRangeOffsets(container, selection);
    if (!offsets) {
      setState(EMPTY_STATE);
      return;
    }

    const nativeRange = selection.getRangeAt(0);
    const rects = rangeToOverlayRects(nativeRange, container);

    setState({
      selectedText: text,
      startIndex: Math.min(offsets.start, offsets.end),
      endIndex: Math.max(offsets.start, offsets.end),
      rects,
      linkedRange: null,
    });
  }, [containerRef, options.linkedMode, options.selectionId]);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [handleSelectionChange]);

  const clear = useCallback(() => {
    setState(EMPTY_STATE);
    window.getSelection()?.removeAllRanges();
  }, []);

  const hasSelection = state.startIndex >= 0 && state.endIndex > state.startIndex;

  return {
    selectedText: state.selectedText,
    startIndex: state.startIndex,
    endIndex: state.endIndex,
    hasSelection,
    clear,
    rects: hasSelection ? state.rects : [],
    linkedRange: hasSelection ? state.linkedRange : null,
  };
}
