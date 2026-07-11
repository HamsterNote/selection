/**
 * styleUtils.ts — 选区样式快照、解析与转换工具
 *
 * 职责：把 `markerStyle` / `selectionStyle`（CSSProperties）以及旧版颜色 props
 * 统一转换为可存入 range 数据的样式快照，并映射到 SVG rect props / div inline style。
 */
import type { CSSProperties } from 'react';
import type { MarkerColorStyle, MarkerColors, NewSelectionOptions } from './types';

// ---------------------------------------------------------------------------
// 公开类型
// ---------------------------------------------------------------------------

/** 构建 range 数据时需要写入的样式快照。 */
export type RangeStyleSnapshot = {
  readonly markerStyle?: CSSProperties;
  readonly selectionStyle?: CSSProperties;
};

/** 解析样式的输入：新 API + 旧版兼容 props。 */
export type StyleInput = {
  readonly markerStyle?: CSSProperties;
  readonly selectionStyle?: CSSProperties;
  readonly markerColors?: MarkerColors;
  readonly highlightColor?: string;
  readonly selectionColor?: string;
  readonly newSelectionOptions?: NewSelectionOptions;
};

// ---------------------------------------------------------------------------
// 样式快照
// ---------------------------------------------------------------------------

/** 浅拷贝一份 CSSProperties；空对象或 undefined 返回 undefined。 */
export function snapshotStyle(style: CSSProperties | undefined): CSSProperties | undefined {
  if (style === undefined) return undefined;
  const keys = Object.keys(style);
  if (keys.length === 0) return undefined;
  return { ...style };
}

// ---------------------------------------------------------------------------
// 旧版颜色 → CSSProperties
// ---------------------------------------------------------------------------

/** 把旧版 `MarkerColorStyle` 转换为 CSSProperties。 */
export function markerColorStyleToCssProperties(
  colorStyle: MarkerColorStyle | undefined,
): CSSProperties {
  const result: CSSProperties = {};
  if (colorStyle === undefined) return result;

  if (colorStyle.fill !== undefined) {
    result.backgroundColor = colorStyle.fill;
  }

  const stroke = colorStyle.stroke;
  if (stroke !== undefined) {
    if (typeof stroke === 'string') {
      result.borderColor = stroke;
      result.borderStyle = 'solid';
    } else {
      if (stroke.color !== undefined) {
        result.borderColor = stroke.color;
      }
      if (stroke.width !== undefined) {
        result.borderWidth = stroke.width;
      }
      result.borderStyle = 'solid';
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// 有效样式解析（新 props 优先，旧 props 回退）
// ---------------------------------------------------------------------------

function hasVisualProperties(style: CSSProperties): boolean {
  return Object.keys(style).length > 0;
}

/** 解析持久高亮（marker）的有效样式。 */
export function resolveMarkerStyle(input: StyleInput): CSSProperties | undefined {
  if (input.markerStyle !== undefined) return input.markerStyle;

  const fromMarkerColors = markerColorStyleToCssProperties(input.markerColors?.highlight);
  if (hasVisualProperties(fromMarkerColors)) return fromMarkerColors;

  if (input.highlightColor !== undefined) {
    return { backgroundColor: input.highlightColor };
  }

  return undefined;
}

/** 解析已选中持久高亮的有效样式；新 API / 存储快照优先，旧版 selectedHighlight 作为兼容回退。 */
export function getEffectiveSelectedMarkerStyle(
  rangeStyle: CSSProperties | undefined,
  input: StyleInput,
): CSSProperties | undefined {
  if (rangeStyle !== undefined) return rangeStyle;
  if (input.markerStyle !== undefined) return input.markerStyle;

  const fromSelectedMarkerColors = markerColorStyleToCssProperties(
    input.markerColors?.selectedHighlight,
  );
  if (hasVisualProperties(fromSelectedMarkerColors)) return fromSelectedMarkerColors;

  return resolveMarkerStyle(input);
}

/** 解析活跃选区（selection）的有效样式。 */
export function resolveSelectionStyle(input: StyleInput): CSSProperties | undefined {
  if (input.selectionStyle !== undefined) return input.selectionStyle;

  const fromMarkerColors = markerColorStyleToCssProperties(input.markerColors?.selection);
  if (hasVisualProperties(fromMarkerColors)) return fromMarkerColors;

  if (input.newSelectionOptions?.color !== undefined) {
    return { backgroundColor: input.newSelectionOptions.color };
  }

  if (input.selectionColor !== undefined) {
    return { backgroundColor: input.selectionColor };
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Range 数据写入的样式快照
// ---------------------------------------------------------------------------

/** 从当前 props 解析并浅拷贝一份要存入 range 的样式快照。 */
export function createRangeStyleSnapshot(input: StyleInput): RangeStyleSnapshot {
  return {
    markerStyle: snapshotStyle(resolveMarkerStyle(input)),
    selectionStyle: snapshotStyle(resolveSelectionStyle(input)),
  };
}

/** 渲染时：range 已存储的样式优先，没有则回退到当前 props。 */
export function getEffectiveMarkerStyle(
  rangeStyle: CSSProperties | undefined,
  input: StyleInput,
): CSSProperties | undefined {
  return rangeStyle ?? resolveMarkerStyle(input);
}

/** 渲染时：range 已存储的样式优先，没有则回退到当前 props。 */
export function getEffectiveSelectionStyle(
  rangeStyle: CSSProperties | undefined,
  input: StyleInput,
): CSSProperties | undefined {
  return rangeStyle ?? resolveSelectionStyle(input);
}

/** 拖拽更新旧数据时：保留已有存储样式，缺失则补拍当前有效回退样式。 */
export function completeRangeStyleSnapshot(
  rangeStyle: RangeStyleSnapshot | undefined,
  input: StyleInput,
): RangeStyleSnapshot {
  return {
    markerStyle: rangeStyle?.markerStyle ?? snapshotStyle(resolveMarkerStyle(input)),
    selectionStyle: rangeStyle?.selectionStyle ?? snapshotStyle(resolveSelectionStyle(input)),
  };
}

// ---------------------------------------------------------------------------
// CSSProperties → SVG rect inline style
// ---------------------------------------------------------------------------

/** 把 CSSProperties 映射为 SVG `<rect>` 的 `style` 对象，使内联样式优先级高于 CSS class。 */
export function styleToSvgRectProps(style: CSSProperties | undefined): CSSProperties {
  if (style === undefined) return {};

  const result: CSSProperties = {};

  const fill =
    style.backgroundColor ?? (typeof style.background === 'string' ? style.background : undefined);
  if (fill !== undefined) {
    result.fill = fill;
  }

  if (style.borderColor !== undefined) {
    result.stroke = style.borderColor;
  }

  const borderWidth = style.borderWidth;
  if (borderWidth !== undefined) {
    result.strokeWidth = typeof borderWidth === 'number' ? borderWidth : parseFloat(borderWidth);
  }

  return result;
}

export type SvgRectVisualProps = CSSProperties;

// ---------------------------------------------------------------------------
// CSSProperties → percent div inline style
// ---------------------------------------------------------------------------

export type PercentGeometryRect = {
  readonly left: string;
  readonly top: string;
  readonly width: string;
  readonly height: string;
};

/** 合并 percent 几何与视觉样式；几何属性必须覆盖样式中的冲突值。 */
export function buildPercentRectStyle(
  rect: PercentGeometryRect,
  style: CSSProperties | undefined,
): CSSProperties {
  const base: CSSProperties = style === undefined ? {} : { ...style };
  return {
    ...base,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

// ---------------------------------------------------------------------------
// 手柄样式推导
// ---------------------------------------------------------------------------

export type HandleVisualStyle = {
  readonly background?: string;
  readonly borderColor?: string;
  readonly borderWidth?: number | string;
  readonly borderStyle?: string;
};

/** 从 owner 样式推导手柄的视觉样式；无颜色时回退到旧版 markerColors.handle。 */
export function deriveHandleVisualStyle(
  style: CSSProperties | undefined,
  fallbackHandle?: MarkerColorStyle,
): HandleVisualStyle {
  const styleBackground =
    typeof style?.backgroundColor === 'string'
      ? style.backgroundColor
      : typeof style?.background === 'string'
        ? style.background
        : undefined;
  const styleBorderColor = style?.borderColor;
  const styleBorderWidth = style?.borderWidth;
  const styleBorderStyle = style?.borderStyle;

  if (styleBackground !== undefined || styleBorderColor !== undefined) {
    return {
      background: styleBackground,
      borderColor: styleBorderColor,
      borderWidth: styleBorderWidth,
      borderStyle: styleBorderStyle,
    };
  }

  const fallback = markerColorStyleToCssProperties(fallbackHandle);
  if (fallback !== undefined) {
    return {
      background:
        typeof fallback.backgroundColor === 'string' ? fallback.backgroundColor : undefined,
      borderColor: fallback.borderColor,
      borderWidth: fallback.borderWidth,
      borderStyle: 'solid',
    };
  }

  return {};
}

// ---------------------------------------------------------------------------
// 浅相等（用于 persisted rect 列表去重）
// ---------------------------------------------------------------------------

/** 浅比较两份 CSSProperties，忽略键顺序。 */
export function styleShallowEqual(
  a: CSSProperties | undefined,
  b: CSSProperties | undefined,
): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    const valueA = a[key as keyof CSSProperties];
    const valueB = b[key as keyof CSSProperties];
    if (valueA !== valueB) return false;
  }

  return true;
}
