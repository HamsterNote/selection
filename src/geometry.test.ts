/// <reference types="vitest/globals" />
/**
 * geometry.ts — 百分比矩形转换 & 缩放测试
 *
 * 测试 pixelRectsToPercentRects / percentRectsToPixelRects 的纯数学行为，
 * 不依赖 DOM 布局：通过 mock HTMLElement.getBoundingClientRect() 提供固定尺寸。
 */
import {
  pixelRectsToPercentRects,
  percentRectsToPixelRects,
  clampPointToContainer,
  normalizeRectFromPoints,
  isRectCreatable,
  pixelRectToPercentRect,
  percentRectToPixelRect,
  storeRectForOverlayRectType,
} from './geometry';
import type { OverlayRect, PercentOverlayRect } from './types';

// ---------------------------------------------------------------------------
// 工具函数：构造一个 getBoundingClientRect 返回固定值的 HTMLElement mock
// ---------------------------------------------------------------------------
function makeContainer(
  left: number,
  top: number,
  width: number,
  height: number,
): HTMLElement {
  const el = document.createElement('div');
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON(): Record<string, number> {
      return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top };
    },
  });
  return el;
}

// ---------------------------------------------------------------------------
// pixelRectsToPercentRects — 像素 → 百分比
// ---------------------------------------------------------------------------
describe('pixelRectsToPercentRects', () => {
  it(
    'geometry.percent-conversion.stores-0-to-100-values: ' +
      '将容器内的像素矩形转换为 0-100 百分比值',
    () => {
      // Given: 容器 400×300，rect 在容器局部坐标 (50,60,100,30)
      const container = makeContainer(0, 0, 400, 300);
      const rects: OverlayRect[] = [{ x: 50, y: 60, width: 100, height: 30 }];

      // When: 转换为百分比
      const result = pixelRectsToPercentRects(rects, container);

      // Then: x=12.5%, y=20%, width=25%, height=10%
      expect(result).toHaveLength(1);
      const r = result[0]!;
      expect(r.x).toBe(12.5);
      expect(r.y).toBe(20);
      expect(r.width).toBe(25);
      expect(r.height).toBe(10);
    },
  );

  it(
    'geometry.percent-conversion.handles-container-offset: ' +
      '容器偏移不影响相对百分比（输入使用容器局部坐标即可）',
    () => {
      // Given: 容器偏移到 (10,20)，尺寸仍为 400×300
      //        rect 使用容器局部坐标 (50,60,100,30)
      const container = makeContainer(10, 20, 400, 300);
      const rects: OverlayRect[] = [{ x: 50, y: 60, width: 100, height: 30 }];

      // When: 转换为百分比
      const result = pixelRectsToPercentRects(rects, container);

      // Then: 百分比应与无偏移容器一致（函数只依赖容器宽高，不依赖 viewport 偏移）
      expect(result).toHaveLength(1);
      const r = result[0]!;
      expect(r.x).toBe(12.5);
      expect(r.y).toBe(20);
      expect(r.width).toBe(25);
      expect(r.height).toBe(10);
    },
  );

  it('一次调用处理多个矩形', () => {
    // Given: 两个不同位置的矩形
    const container = makeContainer(0, 0, 200, 100);
    const rects: OverlayRect[] = [
      { x: 0, y: 0, width: 200, height: 100 }, // 占满容器 → 100%
      { x: 50, y: 25, width: 100, height: 50 }, // 半宽半高居中 → 50%
    ];

    // When
    const result = pixelRectsToPercentRects(rects, container);

    // Then
    expect(result).toHaveLength(2);

    expect(result[0]!.x).toBe(0);
    expect(result[0]!.y).toBe(0);
    expect(result[0]!.width).toBe(100);
    expect(result[0]!.height).toBe(100);

    expect(result[1]!.x).toBe(25);
    expect(result[1]!.y).toBe(25);
    expect(result[1]!.width).toBe(50);
    expect(result[1]!.height).toBe(50);
  });

  it('零尺寸容器返回空数组', () => {
    const container = makeContainer(0, 0, 0, 0);
    const rects: OverlayRect[] = [{ x: 10, y: 10, width: 10, height: 10 }];
    const result = pixelRectsToPercentRects(rects, container);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// percentRectsToPixelRects — 百分比 → 像素
// ---------------------------------------------------------------------------
describe('percentRectsToPixelRects', () => {
  it(
    'geometry.percent-conversion.rescales-to-new-container-size: ' +
      '同一百分比矩形在不同容器尺寸下转换为不同像素值',
    () => {
      // Given: 百分比矩形 {x:10, y:10, width:20, height:5}
      const percentRect: PercentOverlayRect = { x: 10, y: 10, width: 20, height: 5 };

      // When — 容器 400×300
      const smallContainer = makeContainer(0, 0, 400, 300);
      const smallResult = percentRectsToPixelRects([percentRect], smallContainer);

      // Then: (40, 30, 80, 15)
      expect(smallResult).toHaveLength(1);
      expect(smallResult[0]!.x).toBe(40);
      expect(smallResult[0]!.y).toBe(30);
      expect(smallResult[0]!.width).toBe(80);
      expect(smallResult[0]!.height).toBe(15);

      // When — 容器 800×600（resize 后）
      const largeContainer = makeContainer(0, 0, 800, 600);
      const largeResult = percentRectsToPixelRects([percentRect], largeContainer);

      // Then: (80, 60, 160, 30) — 像素值随容器倍增
      expect(largeResult).toHaveLength(1);
      expect(largeResult[0]!.x).toBe(80);
      expect(largeResult[0]!.y).toBe(60);
      expect(largeResult[0]!.width).toBe(160);
      expect(largeResult[0]!.height).toBe(30);
    },
  );

  it('round-trip: pixel → percent → pixel(不同容器) 等价于直接缩放', () => {
    // Given: 原始像素矩形在 400×300 容器中
    const originalContainer = makeContainer(0, 0, 400, 300);
    const pixelRects: OverlayRect[] = [{ x: 50, y: 60, width: 100, height: 30 }];

    // When: 先转百分比，再在 800×600 容器中还原
    const percents = pixelRectsToPercentRects(pixelRects, originalContainer);
    const resizedContainer = makeContainer(0, 0, 800, 600);
    const resizedPixels = percentRectsToPixelRects(percents, resizedContainer);

    // Then: 宽高翻倍 (100→200, 30→60)，坐标也翻倍 (50→100, 60→120)
    expect(resizedPixels).toHaveLength(1);
    expect(resizedPixels[0]!.x).toBe(100);
    expect(resizedPixels[0]!.y).toBe(120);
    expect(resizedPixels[0]!.width).toBe(200);
    expect(resizedPixels[0]!.height).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// 单矩形几何辅助函数测试（selection-rect-tool）
// ---------------------------------------------------------------------------

describe('normalizeRectFromPoints', () => {
  it('正向拖拽 (40,30)->(120,90) 归一化为 {x:40,y:30,width:80,height:60}', () => {
    const rect = normalizeRectFromPoints({ x: 40, y: 30 }, { x: 120, y: 90 });
    expect(rect).toEqual({ x: 40, y: 30, width: 80, height: 60 });
  });

  it('反向拖拽 (120,90)->(40,30) 归一化到同一个矩形', () => {
    const rect = normalizeRectFromPoints({ x: 120, y: 90 }, { x: 40, y: 30 });
    expect(rect).toEqual({ x: 40, y: 30, width: 80, height: 60 });
  });
});

describe('clampPointToContainer', () => {
  const container = makeContainer(0, 0, 400, 300);

  it('容器内的点不被修改', () => {
    const clamped = clampPointToContainer({ x: 200, y: 150 }, container);
    expect(clamped).toEqual({ x: 200, y: 150 });
  });

  it('超出右边界的点被钳制到容器宽度', () => {
    const clamped = clampPointToContainer({ x: 500, y: 150 }, container);
    expect(clamped).toEqual({ x: 400, y: 150 });
  });

  it('超出下边界的点被钳制到容器高度', () => {
    const clamped = clampPointToContainer({ x: 200, y: 400 }, container);
    expect(clamped).toEqual({ x: 200, y: 300 });
  });

  it('负坐标被钳制到 0', () => {
    const clamped = clampPointToContainer({ x: -10, y: -5 }, container);
    expect(clamped).toEqual({ x: 0, y: 0 });
  });

  it('同时超出多个边界的点被正确钳制', () => {
    const clamped = clampPointToContainer({ x: -5, y: 500 }, container);
    expect(clamped).toEqual({ x: 0, y: 300 });
  });
});

describe('isRectCreatable', () => {
  it('宽高均 >= 2 时返回 true', () => {
    expect(isRectCreatable({ x: 0, y: 0, width: 80, height: 60 })).toBe(true);
  });

  it('恰好 2x2 时返回 true', () => {
    expect(isRectCreatable({ x: 0, y: 0, width: 2, height: 2 })).toBe(true);
  });

  it('宽度 < 2 时返回 false', () => {
    expect(isRectCreatable({ x: 0, y: 0, width: 1, height: 60 })).toBe(false);
  });

  it('高度 < 2 时返回 false', () => {
    expect(isRectCreatable({ x: 0, y: 0, width: 60, height: 1 })).toBe(false);
  });

  it('宽高均为 0 时返回 false', () => {
    expect(isRectCreatable({ x: 0, y: 0, width: 0, height: 0 })).toBe(false);
  });
});

describe('pixelRectToPercentRect / percentRectToPixelRect（单矩形）', () => {
  const container = makeContainer(0, 0, 400, 300);

  it('pixelRectToPercentRect: (40,30,80,60) → (10,10,20,20)', () => {
    const pct = pixelRectToPercentRect({ x: 40, y: 30, width: 80, height: 60 }, container);
    expect(pct).toEqual({ x: 10, y: 10, width: 20, height: 20 });
  });

  it('percentRectToPixelRect: (10,10,20,20) → (40,30,80,60)', () => {
    const px = percentRectToPixelRect({ x: 10, y: 10, width: 20, height: 20 }, container);
    expect(px).toEqual({ x: 40, y: 30, width: 80, height: 60 });
  });

  it('round-trip: pixel → percent → pixel 完全还原', () => {
    const original: OverlayRect = { x: 40, y: 30, width: 80, height: 60 };
    const pct = pixelRectToPercentRect(original, container);
    const restored = percentRectToPixelRect(pct, container);
    expect(restored).toEqual(original);
  });

  it('零尺寸容器返回 fallback 零值矩形', () => {
    const zeroContainer = makeContainer(0, 0, 0, 0);
    const pct = pixelRectToPercentRect({ x: 10, y: 10, width: 10, height: 10 }, zeroContainer);
    expect(pct).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe('storeRectForOverlayRectType', () => {
  const container = makeContainer(0, 0, 400, 300);
  const pixelRect: OverlayRect = { x: 40, y: 30, width: 80, height: 60 };

  it('overlayRectType=px 时原样返回像素矩形', () => {
    const result = storeRectForOverlayRectType(pixelRect, 'px', container);
    expect(result).toEqual({ x: 40, y: 30, width: 80, height: 60 });
  });

  it('overlayRectType=percent 时返回百分比矩形', () => {
    const result = storeRectForOverlayRectType(pixelRect, 'percent', container);
    expect(result).toEqual({ x: 10, y: 10, width: 20, height: 20 });
  });
});

describe('完整拖拽流程: clamp + normalize + store', () => {
  const container = makeContainer(0, 0, 400, 300);

  it('正向拖拽 (40,30)->(120,90) 产生可创建的 px/percent 矩形', () => {
    const clampedStart = clampPointToContainer({ x: 40, y: 30 }, container);
    const clampedEnd = clampPointToContainer({ x: 120, y: 90 }, container);
    const rect = normalizeRectFromPoints(clampedStart, clampedEnd);

    expect(rect).toEqual({ x: 40, y: 30, width: 80, height: 60 });
    expect(isRectCreatable(rect)).toBe(true);

    expect(storeRectForOverlayRectType(rect, 'px', container)).toEqual({
      x: 40, y: 30, width: 80, height: 60,
    });
    expect(storeRectForOverlayRectType(rect, 'percent', container)).toEqual({
      x: 10, y: 10, width: 20, height: 20,
    });
  });

  it('反向拖拽 (120,90)->(40,30) 产生相同的矩形', () => {
    const rect = normalizeRectFromPoints({ x: 120, y: 90 }, { x: 40, y: 30 });
    expect(rect).toEqual({ x: 40, y: 30, width: 80, height: 60 });
    expect(isRectCreatable(rect)).toBe(true);
  });

  it('超出边界的拖拽先钳制再归一化', () => {
    const start = clampPointToContainer({ x: -10, y: -5 }, container);
    const end = clampPointToContainer({ x: 500, y: 350 }, container);
    const rect = normalizeRectFromPoints(start, end);

    expect(rect).toEqual({ x: 0, y: 0, width: 400, height: 300 });
    expect(isRectCreatable(rect)).toBe(true);
  });

  it('<2px 拖拽不可创建', () => {
    const rect = normalizeRectFromPoints({ x: 40, y: 30 }, { x: 41, y: 30 });
    expect(isRectCreatable(rect)).toBe(false);
  });
});
