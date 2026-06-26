/// <reference types="vitest/globals" />
/**
 * geometry.ts — 百分比矩形转换 & 缩放测试
 *
 * 测试 pixelRectsToPercentRects / percentRectsToPixelRects 的纯数学行为，
 * 不依赖 DOM 布局：通过 mock HTMLElement.getBoundingClientRect() 提供固定尺寸。
 */
import { pixelRectsToPercentRects, percentRectsToPixelRects } from './geometry';
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
