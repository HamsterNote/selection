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
 * 鼠标位置（用 viewport 坐标，即 clientX/clientY）
 * 用于选择开始/结束钩子向调用方报告鼠标当前位置
 */
export interface MousePosition {
  /** 鼠标相对 viewport 左上角的 X 坐标（clientX） */
  x: number;
  /** 鼠标相对 viewport 左上角的 Y 坐标（clientY） */
  y: number;
}

/**
 * 命令式 API：通过 ref 暴露给外部的能力
 * 让 Demo 可以在自己渲染的按钮中触发组件内部的高亮逻辑
 */
export interface SelectionRef {
  /**
   * 执行高亮：将当前用户选中的文本确认为一个持久高亮 range。
   * 内部会构造 SelectionRange，依次触发 onSelect 与 onHighlight 回调，
   * 然后清除当前选区状态。
   * 无有效选区时为空操作。
   */
  highlight: () => void;
  /** 清除当前选区状态（同时清除浏览器原生 selection 与内部 Overlay） */
  clear: () => void;
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
  /** 当用户确认高亮时触发（无论来源是 ref.highlight() 还是其它内部确认路径） */
  onSelect?: (range: SelectionRange) => void;
  /** 当用户移除某个选区时触发 */
  onRemove?: (id: string) => void;
  /**
   * 钩子：用户开始一次文本选择时触发。
   * 参数 1 —— 鼠标位置（基于 mousedown 时的 clientX/clientY，使用 viewport 坐标）；
   * 参数 2 —— 当前 `window.getSelection()` 返回的原生 Selection 对象。
   * 「开始」以容器内的 mousedown 作为起点信号。
   */
  onSelectionStart?: (mousePos: MousePosition, selection: Selection) => void;
  /**
   * 钩子：用户结束一次文本选择时触发。
   * 参数 1 —— 鼠标位置（基于 mouseup 时的 clientX/clientY，使用 viewport 坐标）；
   * 参数 2 —— 当前 `window.getSelection()` 返回的原生 Selection 对象。
   * 仅当 mouseup 时容器内仍存在有效选区才会触发。
   */
  onSelectionEnd?: (mousePos: MousePosition, selection: Selection) => void;
  /**
   * 钩子：组件执行「高亮」操作（即确认一个 range）时触发。
   * 与 onSelect 的区别：onSelect 语义偏「确认选区」，onHighlight 语义偏「触发了一次高亮动作」，
   * 后者用于专门测试或扩展高亮叙事；当前实现与 onSelect 同步触发，onHighlight 在 onSelect 之后。
   */
  onHighlight?: (range: SelectionRange) => void;
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
