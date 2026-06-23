import { useCallback, useEffect, useState } from 'react';
import type { UseTextSelectionResult } from './types';

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
 * 内部选区状态。把所有派生数据（含工具栏坐标）一次性写入，
 * 这样可以避免在外层 useEffect 里再 setState 触发 react-hooks/set-state-in-effect。
 */
interface InternalSelectionState {
  selectedText: string;
  startIndex: number;
  endIndex: number;
  toolbar: { x: number; y: number } | null;
}

const EMPTY_STATE: InternalSelectionState = {
  selectedText: '',
  startIndex: -1,
  endIndex: -1,
  toolbar: null,
};

/**
 * 文本选区 Hook
 *
 * 监听 document.selectionchange 事件，提取选中文本 + 偏移量 + 工具栏坐标。
 * 工具栏坐标基于选区 boundingClientRect 计算，使用方负责把它套用到弹层定位上。
 */
export function useTextSelection(
  containerRef: React.RefObject<HTMLElement | null>,
): UseTextSelectionResult & { toolbar: { x: number; y: number } | null } {
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

    const text = selection.toString().trim();
    if (!text) {
      setState(EMPTY_STATE);
      return;
    }

    // 选区可视矩形，用于定位工具栏
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    setState({
      selectedText: text,
      startIndex: Math.min(offsets.start, offsets.end),
      endIndex: Math.max(offsets.start, offsets.end),
      toolbar: {
        x: rect.left + rect.width / 2 - containerRect.left,
        y: rect.top - containerRect.top - 8,
      },
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
  };
}
