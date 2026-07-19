/// <reference types="vitest/globals" />
/**
 * styleUtils.test.ts — 样式工具函数 RED 测试
 *
 * 在实现 styleUtils.ts 之前，先定义所有公开 helper 的行为合约。
 * 测试应该因为模块不存在或返回值不匹配而失败（RED），
 * 而非因为拼写错误或类型不匹配。
 */
import type { CSSProperties } from 'react';
import type { MarkerColors, MarkerColorStyle, NewSelectionOptions } from './types';
import {
  snapshotStyle,
  resolveMarkerStyle,
  resolveSelectionStyle,
  createRangeStyleSnapshot,
  markerColorStyleToCssProperties,
  styleToSvgRectProps,
  buildPercentRectStyle,
  deriveHandleVisualStyle,
  styleShallowEqual,
} from './styleUtils';

// ---------------------------------------------------------------------------
// 输入类型：与未来 styleUtils 内部类型一致
// ---------------------------------------------------------------------------

type StyleInput = {
  readonly markerStyle?: CSSProperties;
  readonly selectionStyle?: CSSProperties;
  readonly markerColors?: MarkerColors;
  readonly highlightColor?: string;
  readonly selectionColor?: string;
  readonly newSelectionOptions?: NewSelectionOptions;
};

// ---------------------------------------------------------------------------
// 辅助工厂
// ---------------------------------------------------------------------------

/** 构造一个最小 MarkerColorStyle */
function makeColorStyle(fill: string, strokeColor?: string): MarkerColorStyle {
  return {
    fill,
    ...(strokeColor !== undefined ? { stroke: strokeColor } : {}),
  };
}

// =========================================================================
// 1. snapshotStyle
// =========================================================================
describe('snapshotStyle', () => {
  it('returns-undefined-for-undefined-input: undefined 返回 undefined', () => {
    // Given: 无输入
    // When
    const result = snapshotStyle(undefined);
    // Then
    expect(result).toBeUndefined();
  });

  it('returns-undefined-for-empty-object: 空对象返回 undefined', () => {
    // Given
    const input: CSSProperties = {};
    // When
    const result = snapshotStyle(input);
    // Then
    expect(result).toBeUndefined();
  });

  it('shallow-clones-a-valid-style: 有值对象返回浅拷贝', () => {
    // Given
    const input: CSSProperties = { backgroundColor: 'red', opacity: 0.5 };
    // When
    const result = snapshotStyle(input);
    // Then
    expect(result).toEqual(input);
    expect(result).not.toBe(input); // 浅拷贝，引用不同
  });

  it('preserves-all-keys: 保留所有 CSS 属性键', () => {
    // Given
    const input: CSSProperties = {
      backgroundColor: 'blue',
      borderColor: 'green',
      borderWidth: 2,
      borderStyle: 'solid',
      opacity: 0.8,
    };
    // When
    const result = snapshotStyle(input);
    // Then
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
  });
});

// =========================================================================
// 2. resolveMarkerStyle — 从输入中解析高亮 range 的样式
// =========================================================================
describe('resolveMarkerStyle', () => {
  it('prefers-markerStyle-prop: markerStyle 优先级最高', () => {
    // Given: 同时传入新 API 和旧 API
    const input: StyleInput = {
      markerStyle: { backgroundColor: 'rgba(0,0,255,0.3)' },
      markerColors: { highlight: makeColorStyle('rgba(255,0,0,0.3)') },
      highlightColor: 'rgba(0,255,0,0.3)',
    };
    // When
    const result = resolveMarkerStyle(input);
    // Then: 新 API 胜出
    expect(result).toEqual({ backgroundColor: 'rgba(0,0,255,0.3)' });
  });

  it('falls-back-to-markerColors-highlight: 无 markerStyle 时用 markerColors.highlight', () => {
    // Given
    const input: StyleInput = {
      markerColors: { highlight: makeColorStyle('rgba(255,0,0,0.3)') },
      highlightColor: 'rgba(0,255,0,0.3)',
    };
    // When
    const result = resolveMarkerStyle(input);
    // Then: markerColors 优先于 highlightColor
    expect(result).toBeDefined();
    expect(result?.backgroundColor).toBe('rgba(255,0,0,0.3)');
  });

  it('falls-back-to-highlightColor: 仅有 highlightColor 时使用它', () => {
    // Given
    const input: StyleInput = {
      highlightColor: 'rgba(0,255,0,0.3)',
    };
    // When
    const result = resolveMarkerStyle(input);
    // Then
    expect(result).toBeDefined();
    expect(result?.backgroundColor).toBe('rgba(0,255,0,0.3)');
  });

  it('returns-undefined-when-nothing-provided: 无任何输入返回 undefined', () => {
    // Given
    const input: StyleInput = {};
    // When
    const result = resolveMarkerStyle(input);
    // Then
    expect(result).toBeUndefined();
  });
});

// =========================================================================
// 3. resolveSelectionStyle — 从输入中解析活跃选区的样式
// =========================================================================
describe('resolveSelectionStyle', () => {
  it('prefers-selectionStyle-prop: selectionStyle 优先级最高', () => {
    // Given
    const input: StyleInput = {
      selectionStyle: { backgroundColor: 'rgba(0,0,255,0.2)' },
      markerColors: { selection: makeColorStyle('rgba(255,0,0,0.2)') },
      selectionColor: 'rgba(0,255,0,0.2)',
      newSelectionOptions: { color: 'rgba(128,0,128,0.2)' },
    };
    // When
    const result = resolveSelectionStyle(input);
    // Then
    expect(result).toEqual({ backgroundColor: 'rgba(0,0,255,0.2)' });
  });

  it('falls-back-to-markerColors-selection: 无 selectionStyle 时用 markerColors.selection', () => {
    // Given
    const input: StyleInput = {
      markerColors: { selection: makeColorStyle('rgba(255,0,0,0.2)') },
      selectionColor: 'rgba(0,255,0,0.2)',
      newSelectionOptions: { color: 'rgba(128,0,128,0.2)' },
    };
    // When
    const result = resolveSelectionStyle(input);
    // Then
    expect(result).toBeDefined();
    expect(result?.backgroundColor).toBe('rgba(255,0,0,0.2)');
  });

  it('falls-back-to-newSelectionOptions-color: 无 markerColors 时用 newSelectionOptions.color', () => {
    // Given
    const input: StyleInput = {
      selectionColor: 'rgba(0,255,0,0.2)',
      newSelectionOptions: { color: 'rgba(128,0,128,0.2)' },
    };
    // When
    const result = resolveSelectionStyle(input);
    // Then: newSelectionOptions 优先于 selectionColor
    expect(result).toBeDefined();
    expect(result?.backgroundColor).toBe('rgba(128,0,128,0.2)');
  });

  it('falls-back-to-selectionColor: 仅有 selectionColor 时使用它', () => {
    // Given
    const input: StyleInput = {
      selectionColor: 'rgba(0,255,0,0.2)',
    };
    // When
    const result = resolveSelectionStyle(input);
    // Then
    expect(result).toBeDefined();
    expect(result?.backgroundColor).toBe('rgba(0,255,0,0.2)');
  });

  it('returns-undefined-when-nothing-provided: 无任何输入返回 undefined', () => {
    // Given
    const input: StyleInput = {};
    // When
    const result = resolveSelectionStyle(input);
    // Then
    expect(result).toBeUndefined();
  });
});

// =========================================================================
// 4. createRangeStyleSnapshot
// =========================================================================
describe('createRangeStyleSnapshot', () => {
  it('returns-shallow-clones-of-both-styles: 返回两个样式的浅拷贝', () => {
    // Given
    const markerStyle: CSSProperties = { backgroundColor: 'yellow' };
    const selectionStyle: CSSProperties = { backgroundColor: 'pink' };
    const input: StyleInput = { markerStyle, selectionStyle };
    // When
    const result = createRangeStyleSnapshot(input);
    // Then: 值相等但引用不同
    expect(result.markerStyle).toEqual(markerStyle);
    expect(result.markerStyle).not.toBe(markerStyle);
    expect(result.selectionStyle).toEqual(selectionStyle);
    expect(result.selectionStyle).not.toBe(selectionStyle);
  });

  it('returns-undefined-for-missing-styles: 缺失的样式返回 undefined', () => {
    // Given: 无任何样式来源
    const input: StyleInput = {};
    // When
    const result = createRangeStyleSnapshot(input);
    // Then
    expect(result.markerStyle).toBeUndefined();
    expect(result.selectionStyle).toBeUndefined();
  });

  it('resolves-deprecated-props: 解析旧版 props 到对应样式', () => {
    // Given: 仅有旧版 props
    const input: StyleInput = {
      markerColors: { highlight: makeColorStyle('rgba(1,1,1,0.3)') },
      selectionColor: 'rgba(2,2,2,0.3)',
    };
    // When
    const result = createRangeStyleSnapshot(input);
    // Then: 两个样式都应被解析出来
    expect(result.markerStyle).toBeDefined();
    expect(result.selectionStyle).toBeDefined();
  });
});

// =========================================================================
// 5. markerColorStyleToCssProperties
// =========================================================================
describe('markerColorStyleToCssProperties', () => {
  it('maps-fill-to-backgroundColor: fill → backgroundColor', () => {
    // Given
    const colorStyle: MarkerColorStyle = { fill: 'rgba(255,0,0,0.5)' };
    // When
    const result = markerColorStyleToCssProperties(colorStyle);
    // Then
    expect(result.backgroundColor).toBe('rgba(255,0,0,0.5)');
  });

  it('maps-stroke-string-to-borderColor: stroke 字符串 → borderColor', () => {
    // Given
    const colorStyle: MarkerColorStyle = {
      fill: 'rgba(255,0,0,0.5)',
      stroke: 'blue',
    };
    // When
    const result = markerColorStyleToCssProperties(colorStyle);
    // Then
    expect(result.borderColor).toBe('blue');
    expect(result.borderStyle).toBe('solid');
  });

  it('maps-stroke-object-to-borderColor-and-borderWidth: stroke 对象 → borderColor + borderWidth', () => {
    // Given
    const colorStyle: MarkerColorStyle = {
      fill: 'rgba(255,0,0,0.5)',
      stroke: { color: 'green', width: 3 },
    };
    // When
    const result = markerColorStyleToCssProperties(colorStyle);
    // Then
    expect(result.borderColor).toBe('green');
    expect(result.borderWidth).toBe(3);
    expect(result.borderStyle).toBe('solid');
  });

  it('returns-empty-for-empty-input: 空对象返回空 CSSProperties', () => {
    // Given
    const colorStyle: MarkerColorStyle = {};
    // When
    const result = markerColorStyleToCssProperties(colorStyle);
    // Then: 无 fill / stroke 时不应有任何属性
    expect(result.backgroundColor).toBeUndefined();
    expect(result.borderColor).toBeUndefined();
  });
});

// =========================================================================
// 6. styleToSvgRectProps
// =========================================================================
describe('styleToSvgRectProps', () => {
  it('maps-backgroundColor-to-fill: backgroundColor → fill', () => {
    // Given
    const style: CSSProperties = { backgroundColor: 'rgba(255,0,0,0.3)' };
    // When
    const result = styleToSvgRectProps(style);
    // Then
    expect(result.fill).toBe('rgba(255,0,0,0.3)');
  });

  it('maps-background-to-fill: background（简写）→ fill', () => {
    // Given
    const style: CSSProperties = { background: 'rgba(0,0,255,0.3)' };
    // When
    const result = styleToSvgRectProps(style);
    // Then
    expect(result.fill).toBe('rgba(0,0,255,0.3)');
  });

  it('maps-borderColor-to-stroke: borderColor → stroke', () => {
    // Given
    const style: CSSProperties = { borderColor: 'green' };
    // When
    const result = styleToSvgRectProps(style);
    // Then
    expect(result.stroke).toBe('green');
  });

  it('maps-borderWidth-to-strokeWidth: borderWidth → strokeWidth', () => {
    // Given
    const style: CSSProperties = { borderWidth: 2 };
    // When
    const result = styleToSvgRectProps(style);
    // Then
    expect(result.strokeWidth).toBe(2);
  });

  it('maps-all-at-once: 同时映射 fill + stroke + strokeWidth', () => {
    // Given
    const style: CSSProperties = {
      backgroundColor: 'red',
      borderColor: 'blue',
      borderWidth: 3,
    };
    // When
    const result = styleToSvgRectProps(style);
    // Then
    expect(result.fill).toBe('red');
    expect(result.stroke).toBe('blue');
    expect(result.strokeWidth).toBe(3);
  });

  it('returns-empty-for-empty-input: 空样式返回空对象', () => {
    // Given
    const style: CSSProperties = {};
    // When
    const result = styleToSvgRectProps(style);
    // Then
    expect(result).toEqual({});
  });
});

// =========================================================================
// 7. buildPercentRectStyle
// =========================================================================
describe('buildPercentRectStyle', () => {
  it('merges-geometry-with-visual-style: 合并几何与视觉样式', () => {
    // Given
    const rect = { left: '10%', top: '20%', width: '50%', height: '30%' };
    const style: CSSProperties = { backgroundColor: 'rgba(255,0,0,0.3)' };
    // When
    const result = buildPercentRectStyle(rect, style);
    // Then: 几何属性存在
    expect(result.left).toBe('10%');
    expect(result.top).toBe('20%');
    expect(result.width).toBe('50%');
    expect(result.height).toBe('30%');
    // 视觉属性也存在
    expect(result.backgroundColor).toBe('rgba(255,0,0,0.3)');
  });

  it('geometry-wins-over-conflicting-style: 几何属性优先于冲突的样式属性', () => {
    // Given: 样式中也包含 width/height
    const rect = { left: '5%', top: '5%', width: '90%', height: '90%' };
    const style: CSSProperties = {
      width: '100px',
      height: '200px',
      backgroundColor: 'blue',
    };
    // When
    const result = buildPercentRectStyle(rect, style);
    // Then: 几何值覆盖样式值
    expect(result.left).toBe('5%');
    expect(result.top).toBe('5%');
    expect(result.width).toBe('90%');
    expect(result.height).toBe('90%');
    expect(result.backgroundColor).toBe('blue');
  });

  it('handles-empty-style: 空样式只返回几何属性', () => {
    // Given
    const rect = { left: '0%', top: '0%', width: '100%', height: '100%' };
    const style: CSSProperties = {};
    // When
    const result = buildPercentRectStyle(rect, style);
    // Then
    expect(result.left).toBe('0%');
    expect(result.top).toBe('0%');
    expect(result.width).toBe('100%');
    expect(result.height).toBe('100%');
  });
});

// =========================================================================
// 8. deriveHandleVisualStyle
// =========================================================================
describe('deriveHandleVisualStyle', () => {
  it('derives-from-style-when-colors-present: 样式有颜色时直接使用', () => {
    // Given
    const style: CSSProperties = {
      backgroundColor: 'red',
      borderColor: 'blue',
      borderWidth: 2,
      borderStyle: 'solid',
    };
    // When
    const result = deriveHandleVisualStyle(style);
    // Then
    expect(result.background).toBe('red');
    expect(result.borderColor).toBe('blue');
    expect(result.borderWidth).toBe(2);
    expect(result.borderStyle).toBe('solid');
  });

  it('falls-back-to-handle-when-style-has-no-colors: 样式无颜色时回退到 markerColors.handle', () => {
    // Given: 样式无任何颜色
    const style: CSSProperties = {};
    const fallbackHandle: MarkerColorStyle = {
      fill: 'purple',
      stroke: { color: 'orange', width: 1 },
    };
    // When
    const result = deriveHandleVisualStyle(style, fallbackHandle);
    // Then
    expect(result.background).toBe('purple');
    expect(result.borderColor).toBe('orange');
    expect(result.borderWidth).toBe(1);
    expect(result.borderStyle).toBe('solid');
  });

  it('makes-rgba-backgrounds-opaque: 手柄沿用高亮颜色但移除透明度', () => {
    // Given: 高亮本身需要半透明，而手柄圆圈必须保持同色且完全不透明
    const style: CSSProperties = { backgroundColor: 'rgba(244, 114, 182, 0.45)' };

    // When
    const result = deriveHandleVisualStyle(style);

    // Then
    expect(result.background).toBe('rgb(244, 114, 182)');
  });

  it('makes-alpha-hex-fallback-opaque: 旧版手柄颜色移除十六进制 alpha 通道', () => {
    // Given: 旧版 markerColors.handle 使用带 alpha 的八位十六进制颜色
    const fallbackHandle: MarkerColorStyle = { fill: '#409cffa0' };

    // When
    const result = deriveHandleVisualStyle(undefined, fallbackHandle);

    // Then
    expect(result.background).toBe('#409cff');
  });

  it('returns-undefined-values-when-nothing-available: 无任何来源时属性为 undefined', () => {
    // Given
    const style: CSSProperties = {};
    // When: 不传 fallbackHandle
    const result = deriveHandleVisualStyle(style);
    // Then
    expect(result.background).toBeUndefined();
    expect(result.borderColor).toBeUndefined();
  });
});

// =========================================================================
// 9. styleShallowEqual
// =========================================================================
describe('styleShallowEqual', () => {
  it('returns-true-for-identical-styles: 相同属性返回 true', () => {
    // Given
    const a: CSSProperties = { backgroundColor: 'red', opacity: 0.5 };
    const b: CSSProperties = { backgroundColor: 'red', opacity: 0.5 };
    // When
    const result = styleShallowEqual(a, b);
    // Then
    expect(result).toBe(true);
  });

  it('is-order-insensitive: 键顺序不同但值相同返回 true', () => {
    // Given
    const a: CSSProperties = { backgroundColor: 'red', opacity: 0.5 };
    const b: CSSProperties = { opacity: 0.5, backgroundColor: 'red' };
    // When
    const result = styleShallowEqual(a, b);
    // Then
    expect(result).toBe(true);
  });

  it('returns-false-for-different-values: 值不同返回 false', () => {
    // Given
    const a: CSSProperties = { backgroundColor: 'red' };
    const b: CSSProperties = { backgroundColor: 'blue' };
    // When
    const result = styleShallowEqual(a, b);
    // Then
    expect(result).toBe(false);
  });

  it('returns-false-for-different-key-counts: 键数量不同返回 false', () => {
    // Given
    const a: CSSProperties = { backgroundColor: 'red' };
    const b: CSSProperties = { backgroundColor: 'red', opacity: 0.5 };
    // When
    const result = styleShallowEqual(a, b);
    // Then
    expect(result).toBe(false);
  });

  it('returns-true-for-two-empty-objects: 两个空对象返回 true', () => {
    // Given
    const a: CSSProperties = {};
    const b: CSSProperties = {};
    // When
    const result = styleShallowEqual(a, b);
    // Then
    expect(result).toBe(true);
  });
});
