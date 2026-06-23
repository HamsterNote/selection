import type { ReactNode } from 'react';

/**
 * 选区数据结构
 * 表示一段被用户选中/高亮的文本
 */
export interface SelectionRange {
  /** 唯一标识 */
  id: string;
  /** 选区文本内容 */
  text: string;
  /** 在原始文本中的起始偏移量 */
  start: number;
  /** 在原始文本中的结束偏移量 */
  end: number;
  /** 创建时间戳 */
  createdAt: number;
}

/**
 * Selection 组件的 Props
 */
export interface SelectionProps {
  /** 要显示和可选区的文本内容 */
  content: string;
  /** 当前已存在的选区列表 */
  ranges: SelectionRange[];
  /** 当用户选中文本并确认时触发 */
  onSelect?: (range: SelectionRange) => void;
  /** 当用户移除某个选区时触发 */
  onRemove?: (id: string) => void;
  /** 自定义选区高亮颜色，默认为黄色半透明 */
  highlightColor?: string;
  /** 自定义类名 */
  className?: string;
  /** 子元素（备用，通常通过 content 传入文本） */
  children?: ReactNode;
}

/**
 * useTextSelection Hook 的返回值
 */
export interface UseTextSelectionResult {
  /** 当前选中的文本 */
  selectedText: string;
  /** 当前选区的起始偏移量（相对于容器） */
  startIndex: number;
  /** 当前选区的结束偏移量（相对于容器） */
  endIndex: number;
  /** 当前是否有有效选区 */
  hasSelection: boolean;
  /** 清除当前选区 */
  clear: () => void;
}
