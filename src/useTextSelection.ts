import { useCallback, useEffect, useState } from 'react';
import type { OverlayRect, UseTextSelectionResult } from './types';

/**
 * 获取选区相对于容器的字符偏移量
 * 浏览器 Selection API 返回的是 node + offset，
 * 需要换算成相对于容器的纯文本偏移量
 */
function getRangeOffsets(
  container: HTMLElement,
  selection: Selection,
): { start: number; end: number } | null {
  const range = selection.getRangeAt(0);
  if (!range) return null;

  if (!container.contains(range.commonAncestorContainer)) {
    return null;
  }

  // 通过 selectNodeContents + setEnd 计算从容器起点到选区起点的字符数
  const preRange = document.createRange();
  preRange.selectNodeContents(container);
  preRange.setEnd(range.startContainer, range.startOffset);
  const start = preRange.toString().length;

  preRange.setEnd(range.endContainer, range.endOffset);
  const end = preRange.toString().length;

  return { start, end };
}

/**
 * 把一个原生 Range 的 ClientRects 换算为相对容器的 Overlay 矩形数组。
 * 多行选区会拆成多个矩形（每行一段）。
 */
function rangeToOverlayRects(range: Range, container: HTMLElement): OverlayRect[] {
  const containerRect = container.getBoundingClientRect();
  const rects = range.getClientRects();
  const out: OverlayRect[] = [];
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
  return out;
}

/**
 * 内部选区状态。把所有派生数据（含工具栏坐标与 Overlay 矩形）一次性写入，
 * 这样可以避免在外层 useEffect 里再 setState 触发 react-hooks/set-state-in-effect。
 */
interface InternalSelectionState {
  selectedText: string;
  startIndex: number;
  endIndex: number;
  toolbar: { x: number; y: number } | null;
  /** 正在选择时的 Overlay 矩形（多行可能多个） */
  rects: OverlayRect[];
}

const EMPTY_STATE: InternalSelectionState = {
  selectedText: '',
  startIndex: -1,
  endIndex: -1,
  toolbar: null,
  rects: [],
};

/**
 * 文本选区 Hook
 *
 * 监听 document.selectionchange，提取：
 * - 选中文本 + 字符偏移量（start/end）
 * - 工具栏坐标（基于选区 boundingClientRect）
 * - 选区的多行矩形（用于绘制 Overlay）
 *
 * 所有坐标均相对于 container 左上角。
 */
export function useTextSelection(
  containerRef: React.RefObject<HTMLElement | null>,
): UseTextSelectionResult & {
  toolbar: { x: number; y: number } | null;
  rects: OverlayRect[];
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

    const offsets = getRangeOffsets(container, selection);
    if (!offsets) {
      setState(EMPTY_STATE);
      return;
    }

    const text = selection.toString();
    if (!text.trim()) {
      setState(EMPTY_STATE);
      return;
    }

    const nativeRange = selection.getRangeAt(0);
    const rect = nativeRange.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const rects = rangeToOverlayRects(nativeRange, container);

    setState({
      selectedText: text,
      startIndex: Math.min(offsets.start, offsets.end),
      endIndex: Math.max(offsets.start, offsets.end),
      toolbar: {
        x: rect.left + rect.width / 2 - containerRect.left,
        y: rect.top - containerRect.top - 8,
      },
      rects,
    });
  }, [containerRef]);

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
    toolbar: hasSelection ? state.toolbar : null,
    rects: hasSelection ? state.rects : [],
  };
}
