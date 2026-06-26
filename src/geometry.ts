import type {
  LinkedSelectionRange,
  OverlayRect,
  OverlayRectType,
  PercentOverlayRect,
  SelectionRange,
} from './types';

/** 将百分比坐标统一到 4 位小数，且只修正极小浮点溢出到 0-100 边界 */
function normalizePercentValue(value: number): number {
  const rounded = Math.round(value * 10000) / 10000;
  if (rounded < 0 && rounded > -0.0001) return 0;
  if (rounded > 100 && rounded < 100.0001) return 100;
  return rounded;
}

/**
 * 将像素 Overlay 矩形换算为相对 Selection SVG Overlay 视口的百分比矩形。
 * 几何基准使用 Selection 容器的 getBoundingClientRect()：传入 rect 已是容器局部像素坐标，
 * 因此仅按当前容器宽高归一化；返回值用于联动受控数据持久化，避免写入像素 rect。
 */
export function pixelRectsToPercentRects(
  rects: OverlayRect[],
  container: HTMLElement,
): PercentOverlayRect[] {
  const containerRect = container.getBoundingClientRect();
  if (containerRect.width <= 0 || containerRect.height <= 0) return [];

  return rects.map((rect) => ({
    x: normalizePercentValue((rect.x / containerRect.width) * 100),
    y: normalizePercentValue((rect.y / containerRect.height) * 100),
    width: normalizePercentValue((rect.width / containerRect.width) * 100),
    height: normalizePercentValue((rect.height / containerRect.height) * 100),
  }));
}

/**
 * 将联动受控数据中的百分比矩形还原为当前容器像素矩形。
 * 这些像素 rect 只用于命中测试、手柄与 Popover 定位等瞬态 UI 计算，不应写回受控数据。
 */
export function percentRectsToPixelRects(
  rects: PercentOverlayRect[],
  container: HTMLElement,
): OverlayRect[] {
  const containerRect = container.getBoundingClientRect();
  return rects.map((rect) => ({
    x: (rect.x / 100) * containerRect.width,
    y: (rect.y / 100) * containerRect.height,
    width: (rect.width / 100) * containerRect.width,
    height: (rect.height / 100) * containerRect.height,
  }));
}

/** 浅比较两个百分比 rect 列表，用于后续联动模式 memo/state 去重 */
export function percentRectListsEqual(
  a: PercentOverlayRect[],
  b: PercentOverlayRect[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const rectA = a[i];
    const rectB = b[i];
    if (!rectA || !rectB) return false;
    if (
      rectA.x !== rectB.x ||
      rectA.y !== rectB.y ||
      rectA.width !== rectB.width ||
      rectA.height !== rectB.height
    ) {
      return false;
    }
  }
  return true;
}

export function getEffectiveLegacyOverlayRectType(
  range: Pick<SelectionRange, 'overlayRectType'>,
  fallback: OverlayRectType,
): OverlayRectType {
  return range.overlayRectType ?? fallback;
}

export function getEffectiveLinkedOverlayRectType(
  item: Pick<LinkedSelectionRange, 'overlayRectType'>,
): OverlayRectType {
  return item.overlayRectType ?? 'percent';
}

export function storeRectsForOverlayRectType(
  pixelRects: OverlayRect[],
  overlayRectType: OverlayRectType,
  container: HTMLElement,
): OverlayRect[] | PercentOverlayRect[] {
  return overlayRectType === 'px' ? pixelRects : pixelRectsToPercentRects(pixelRects, container);
}
