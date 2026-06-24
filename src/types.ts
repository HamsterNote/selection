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
 * 新绘制选区（正在选中、尚未高亮的活跃选区）的选项集合。
 * 后续可在该对象上继续扩展更多字段（笔触、边框、动画等）。
 */
export interface NewSelectionOptions {
  /** 活跃选区的 Overlay 颜色（覆盖默认半透明粉）；不传则使用 selectionColor 或 CSS 默认 */
  color?: string;
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
  /** 当前已存在的选区列表（受控） */
  ranges: SelectionRange[];
  /**
   * 当前被选中的高亮 range 的 ID（受控属性）。
   * null 表示没有选中任何 range（用户正在拖选新文本，或未点击任何高亮区域）。
   * 「刚高亮完」的 range 也会被自动设为选中。
   */
  selectedRangeId?: string | null;
  /** 当用户确认高亮时触发（无论来源是 ref.highlight() 还是其它内部确认路径） */
  onSelect?: (range: SelectionRange) => void;
  /**
   * 当用户选中/取消选中某个已高亮的 range 时触发。
   * - 点击未选中的高亮 range → 传入该 range 的 id
   * - 点击已选中的高亮 range → 传入 null（toggle）
   * - 用户开始拖选新文本 → 传入 null
   * - 执行 highlight() 后自动选中 → 传入新 range 的 id
   */
  onSelectRange?: (id: string | null) => void;
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
  /**
   * 当某个高亮被选中时，在其上方弹出的 Popover 内容。
   * 由外部传入任意 React 节点（例如删除按钮、工具栏）。
   * 默认为空：不传则不渲染 Popover。
   *
   * 行为：
   * - 仅当存在被选中的高亮（selectedRangeId 非 null 且能在 ranges 中找到）时显示；
   * - 位置：选中高亮第一行（最顶行）矩形正上方，水平居中；
   * - 点击 Popover 内部不会触发「点击外部取消选中」逻辑。
   */
  popover?: ReactNode;
  /**
   * 当用户正在选中文本（活跃选区、尚未高亮）时显示的 Popover 内容。
   * 由外部传入任意 React 节点（例如「高亮」按钮）。
   * 与 `popover` 互斥：活跃选区和已选中高亮不同时存在。
   *
   * 行为：
   * - 仅当存在活跃选区（hasSelection 为真，且未选中已高亮 range）时显示；
   * - 位置：活跃选区第一行（最顶行）矩形正上方，水平居中；
   * - 调用方在传入的按钮上建议 `onMouseDown={e => e.preventDefault()}`
   *   防止点击导致原生选区被浏览器清空（与组件外部按钮相同）。
   */
  selectionPopover?: ReactNode;
  /**
   * 新绘制选区（活跃选区、尚未高亮）的选项集合。
   * 目前支持 `color`，未来可在该对象上扩展更多属性。
   */
  newSelectionOptions?: NewSelectionOptions;
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
