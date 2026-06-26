import type { CSSProperties, PointerEvent, ReactNode } from 'react';

/**
 * Overlay 矩形坐标类型。
 * - `'px'`：像素坐标，随容器当前尺寸存储/渲染。
 * - `'percent'`：百分比坐标，按 `selection-container` 宽高归一化存储，用 div 渲染。
 */
export type OverlayRectType = 'px' | 'percent';

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
  /**
   * 当前 range 的 Overlay 矩形坐标类型。
   * 缺省时，新创建的 range 默认 `'px'`，以保持旧行为；
   * 联动模式下缺省的历史数据按 `'percent'` 解析（因为 rectsBySelectionId 已按百分比存储）。
   */
  overlayRectType?: OverlayRectType;
  /**
   * 当前 range 的 Overlay 矩形列表。
   * 当 `overlayRectType === 'px'` 时为像素坐标；
   * 当 `overlayRectType === 'percent'` 时为相对 selection-container 的 0-100 百分比坐标。
   */
  rects?: OverlayRect[] | PercentOverlayRect[];
}

/**
 * 联动选区端点。
 * 使用 selectionId 指向具体文本区域，offset 表示该区域纯文本内的字符偏移量。
 */
export type SelectionEndpoint = { selectionId: string; offset: number };

/**
 * 联动模式下相对于文本区域的百分比矩形。
 * x/y/width/height 均由调用方按百分比坐标保存，便于跨区域重算 Overlay。
 */
export type PercentOverlayRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

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
 * 联动模式下跨一个或多个文本区域的公开 range 数据结构。
 * start/end 通过 SelectionEndpoint 指向不同 selectionId，rectsBySelectionId 保存每个区域的 Overlay 矩形。
 */
export type LinkedSelectionRange = {
  id: string;
  text: string;
  start: SelectionEndpoint;
  end: SelectionEndpoint;
  createdAt: number;
  /**
   * 当前联动 range 的 Overlay 矩形坐标类型。
   * 缺省时按 `'percent'` 解析，以兼容旧数据（ rectsBySelectionId 已按百分比存储）。
   */
  overlayRectType?: OverlayRectType;
  /**
   * 每个 selectionId 对应的 Overlay 矩形列表。
   * 当 `overlayRectType === 'px'` 时为像素坐标；
   * 当 `overlayRectType === 'percent'` 或缺省时为 0-100 百分比坐标。
   */
  rectsBySelectionId: Record<string, OverlayRect[] | PercentOverlayRect[]>;
};

/**
 * 联动模式下共享的拖拽状态。
 * 用于在多个 linked Selection 容器之间同步“是否正在拖拽某 range 的手柄”。
 */
export type LinkedSelectionDragState =
  | { type: 'active-selection' }
  | { type: 'persisted-range'; id: string };

/**
 * 联动模式的受控数据集合。
 * items 保存所有联动 range，selectedRangeId 表示当前选中项，selectionOrder 表示文本区域顺序。
 */
export type LinkedSelectionData = {
  items: LinkedSelectionRange[];
  selectedRangeId: string | null;
  selectionOrder: string[];
  /**
   * 当前联动数据集合默认使用的 Overlay 矩形坐标类型。
   * 新创建的联动 range 会继承该值；缺省时按 `'percent'` 处理以兼容旧数据。
   */
  overlayRectType?: OverlayRectType;
  /**
   * 共享的联动模式拖拽状态。
   * 当用户在某个 linked Selection 容器中拖动手柄时，所有关联容器都会读取该字段，
   * 同步隐藏对应的手柄与 Popover，避免跨区域拖拽时视觉元素堆叠或遮挡。
   */
  draggingRange?: LinkedSelectionDragState | null;
  /**
   * 共享的联动模式「正在鼠标拖选新文本」状态。
   * 当用户在某个 linked Selection 容器中按下鼠标开始新选择时，所有关联容器都会读取该字段，
   * 同步隐藏活跃选区手柄，避免跨区拖选时其它页面上的手柄仍然显示。
   */
  selectingText?: boolean;
};

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
  /** 活跃选区的 Overlay 颜色（覆盖默认半透明粉）；不传则使用 markerColors.selection.fill 或 selectionColor 或 CSS 默认 */
  color?: string;
}

// ---------------------------------------------------------------------------
// 拖拽手柄（Range Handle）外部可定制类型
// ---------------------------------------------------------------------------

/** 手柄类型：start 代表选区起点，end 代表选区终点 */
export type SelectionHandleType = 'start' | 'end';

/** 手柄所属对象：active-selection 为活跃选区，persisted-range 为已确认的高亮 range */
export type SelectionHandleOwner = 'active-selection' | 'persisted-range';

/** 手柄在容器坐标系中的位置（像素，相对容器左上角） */
export interface HandlePosition {
  x: number;
  y: number;
}

/**
 * 传给外部自定义手柄渲染函数的 props。
 *
 * 外部组件应：
 * 1. 将 `position` 应用到根元素的绝对定位（或使用推荐的 `style`）；
 * 2. 在自身的 `onPointerDown` 中调用 `props.onPointerDown`，以启用库内置拖拽逻辑；
 * 3. 可选地使用 `className` / `style` / `ariaLabel` 以兼容默认样式表。
 */
export interface HandleRenderProps {
  /** 是起点还是终点手柄 */
  type: SelectionHandleType;
  /** 手柄属于活跃选区还是已确认高亮 range */
  owner: SelectionHandleOwner;
  /** 当 owner 为 persisted-range 时对应的 range id；active-selection 时为 null */
  rangeId: string | null;
  /** 手柄在容器坐标系中的位置 */
  position: HandlePosition;
  /** 当前手柄是否正在被拖拽 */
  isDragging: boolean;
  /**
   * 库内置的拖拽启动回调。
   * 外部组件必须在其根元素的 onPointerDown 中调用此函数，
   * 否则手柄拖拽将无法工作。
   */
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  /** 推荐的无障碍标签 */
  ariaLabel: string;
  /** 推荐的 className（兼容默认样式表）；完全自定义时可忽略 */
  className: string;
  /** 推荐的内联样式（含绝对定位 + 可选默认颜色）；外部组件应合并到根元素 */
  style: CSSProperties;
}

// ---------------------------------------------------------------------------
// 标记颜色（Marker Colors）配置类型
// ---------------------------------------------------------------------------

/** 边框/描边样式（可选颜色 + 可选宽度） */
export interface MarkerStrokeStyle {
  /** 边框颜色（SVG stroke 或 CSS border-color） */
  color?: string;
  /** 边框宽度（px），不传则沿用默认 */
  width?: number;
}

/** 单个标记的颜色样式（填充 + 可选边框） */
export interface MarkerColorStyle {
  /** 填充颜色（SVG fill 或 CSS background-color） */
  fill?: string;
  /** 边框；可传字符串（仅颜色）或对象（颜色 + 宽度） */
  stroke?: string | MarkerStrokeStyle;
}

/**
 * 标记颜色配置。
 *
 * - `selection`：活跃选区（正在选中、尚未高亮）的颜色
 * - `highlight`：已确认高亮 range 的颜色（未选中态）
 * - `selectedHighlight`：被选中的高亮 range 的颜色（含边框）
 * - `handle`：拖拽手柄的颜色（fill→背景, stroke→边框）
 *
 * 所有字段可选；不传的字段回退到 CSS 默认值。
 * 与 legacy props（highlightColor / selectionColor / newSelectionOptions.color）共存时，
 * 新 API 优先级高于 legacy props。
 */
export interface MarkerColors {
  /** 活跃选区（正在选中、尚未高亮）的颜色 */
  selection?: MarkerColorStyle;
  /** 已确认高亮 range（未选中态）的颜色 */
  highlight?: MarkerColorStyle;
  /** 被选中的高亮 range 的颜色（对应 selectedRangeId） */
  selectedHighlight?: MarkerColorStyle;
  /** 拖拽手柄的颜色；fill 映射到 CSS background，stroke 映射到 CSS border */
  handle?: MarkerColorStyle;
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
  /** 当前文本区域在联动模式中的唯一标识；不要使用 id 作为该 prop 名称。 */
  selectionId?: string;
  /** 是否启用跨多个文本区域的联动选区模式；不传或 false 时保持 legacy 行为。 */
  linkedMode?: boolean;
  /**
   * Overlay 矩形坐标类型，控制新 range 的数据存储方式与渲染方式。
   * - `'px'`：像素坐标，SVG `<rect>` 渲染（默认，保持旧行为）。
   * - `'percent'`：相对 selection-container 的 0-100 百分比坐标，`<div>` 渲染。
   */
  overlayRectType?: OverlayRectType;
  /** 联动模式的受控数据；legacy 调用方可不传。 */
  linkedData?: LinkedSelectionData;
  /** 联动模式数据变化时触发，调用方应据此更新 linkedData。 */
  onLinkedDataChange?: (next: LinkedSelectionData) => void;
  /** 联动模式下确认/选择一个跨区域 range 时触发。 */
  onLinkedSelect?: (range: LinkedSelectionRange) => void;
  /** 联动模式下调整跨区域 range 后触发。 */
  onLinkedUpdateRange?: (range: LinkedSelectionRange) => void;
  /** 联动模式下选中/取消选中某个 range 时触发。 */
  onLinkedSelectRange?: (id: string | null) => void;
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
  /**
   * 钩子：用户拖动已选中高亮 range 的首尾手柄以调整范围结束时触发。
   * 传入更新后的 range（id 不变，start/end/text 可能变化）。
   * 调用方应据此更新其受控 ranges 列表中对应条目的字段。
   */
  onUpdateRange?: (range: SelectionRange) => void;
  /**
   * 已确认的高亮颜色（持久 Range 的 Overlay 颜色），默认半透明黄。
   *
   * Legacy：优先使用 `markerColors.highlight.fill`。
   * 同时传入两者时 `markerColors` 优先。
   */
  highlightColor?: string;
  /**
   * 正在选择时的临时 Overlay 颜色，默认半透明粉。
   *
   * Legacy：优先使用 `markerColors.selection.fill` 或 `newSelectionOptions.color`。
   * 同时传入两者时 `markerColors` / `newSelectionOptions` 优先。
   */
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
  /**
   * 自定义拖拽手柄渲染函数。
   *
   * 返回的 React 节点应在其 `onPointerDown` 中调用 `props.onPointerDown`
   * 以启用库内置拖拽逻辑。返回 `null` 表示隐藏该手柄。
   * 不传时使用内置圆形 `<button>` 手柄。
   */
  renderHandle?: (props: HandleRenderProps) => ReactNode;
  /**
   * 标记颜色配置（活跃选区、高亮、选中高亮、手柄）。
   *
   * 各字段可选；不传的字段回退到 CSS 默认。
   * 与 legacy 颜色 props 共存时，`markerColors` 优先。
   */
  markerColors?: MarkerColors;
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
