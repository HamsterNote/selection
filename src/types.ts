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
  /** 在容器纯文本中的起始字符偏移量 */
  start: number;
  /** 在容器纯文本中的结束字符偏移量 */
  end: number;
  /** 创建时间戳 */
  createdAt: number;
}

/**
 * 一个相对于容器左上角的矩形（绝对定位用）
 */
export interface OverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Selection 组件的 Props
 *
 * 注意：内容通过 children 传入并原样渲染，组件不会对 children 做任何包装/修改。
 * 选区高亮以绝对定位的矩形（Rect）形式渲染到 children 的同级图层，相对 children 独立。
 */
export interface SelectionProps {
  /** 文本内容（任意 React 节点）。组件保证不会改写或包装。 */
  children: ReactNode;
  /** 当前已存在的选区列表 */
  ranges: SelectionRange[];
  /** 当用户选中文本并确认时触发 */
  onSelect?: (range: SelectionRange) => void;
  /** 当用户移除某个选区时触发 */
  onRemove?: (id: string) => void;
  /** 已确认的高亮颜色（持久 Range 的 Overlay 颜色），默认半透明黄 */
  highlightColor?: string;
  /** 正在选择时的临时 Overlay 颜色，默认半透明粉 */
  selectionColor?: string;
  /** 自定义类名 */
  className?: string;
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
