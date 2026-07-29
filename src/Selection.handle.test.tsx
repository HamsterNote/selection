/// <reference types="vitest/globals" />
/**
 * Selection.handle.test.tsx — 0.2.0 默认手柄（移动端竖线+圆圈）契约测试
 *
 * 锁定以下公开契约：
 * 1. 8 格公共契约矩阵（active/persisted × text/rect × start/end）的 HandleRenderProps 全字段；
 * 2. 默认文本手柄 DOM：-text 修饰类、且仅 __line/__circle 子元素、28px × (行高+12) 内联热区；
 * 3. px / percent 几何与多行夹具的首/末行 lineHeight；
 * 4. hsn-selection-handle-dot 迁移回归锁：文本拖拽路由证明 + style.css 颜色/尺寸规则锁；
 * 5. 拖拽穿透（pointer-events: none）独立断言。
 */
import { fireEvent, render, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import type { CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { Selection } from './Selection';
import type { HandleRenderProps, SelectionRange, SelectionRect } from './types';

// 交叉类型声明：strict TS 下可读自定义 CSS 变量（禁用 CSSProperties & Record<string, unknown>）
type HandleStyle = CSSProperties & { '--hsn-handle-color'?: string };

// ---------------------------------------------------------------------------
// 固定测试夹具（与 Selection.overlayRectType.test.tsx 保持一致：px 行高 24 / percent 行高 8）
// ---------------------------------------------------------------------------

const CONTAINER_RECT = new DOMRect(0, 0, 400, 300);
const TEXT_RECT = new DOMRect(40, 30, 80, 24);

// owner 样式：所有矩阵格统一使用，文本格只推导 background，rect 格全量消费
const OWNER_BACKGROUND = 'rgba(64,156,255,0.25)';
const OWNER_BORDER_COLOR = '#1c7ed6';
const OWNER_STYLE: CSSProperties = {
  backgroundColor: OWNER_BACKGROUND,
  borderColor: OWNER_BORDER_COLOR,
  borderWidth: 2,
};

function makeDomRectList(rects: readonly DOMRect[]): DOMRectList {
  return Object.assign([...rects], {
    item: (index: number): DOMRect | null => rects[index] ?? null,
  });
}

// mock Range/容器几何：getClientRects 返回给定行 rects（默认单行 TEXT_RECT，height=24）
function mockGeometry(rects: readonly DOMRect[] = [TEXT_RECT]): void {
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: vi.fn() });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(CONTAINER_RECT);
  vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue(makeDomRectList(rects));
  vi.spyOn(Range.prototype, 'getBoundingClientRect').mockReturnValue(rects[0] ?? TEXT_RECT);
}

function content(): React.ReactElement {
  return (
    <>
      <p data-testid="first-paragraph">Deterministic paragraph one.</p>
      <p>Deterministic paragraph two.</p>
    </>
  );
}

function textNodeFrom(element: Element): Text {
  const node = element.firstChild;
  if (node instanceof Text) return node;
  throw new TypeError('Expected fixture paragraph text');
}

function selectionContainer(host: HTMLElement): HTMLElement {
  const element = host.querySelector('.hsn-selection-container');
  if (element instanceof HTMLElement) return element;
  throw new TypeError('Expected Selection container');
}

function installNativeSelection(container: HTMLElement): void {
  const paragraph = container.querySelector('[data-testid="first-paragraph"]');
  if (!paragraph) throw new TypeError('Expected first paragraph fixture');
  const range = document.createRange();
  range.setStart(textNodeFrom(paragraph), 0);
  range.setEnd(textNodeFrom(paragraph), 12);
  const selection = document.getSelection();
  if (!selection) throw new TypeError('Expected document selection');
  selection.removeAllRanges();
  selection.addRange(range);
  vi.spyOn(window, 'getSelection').mockReturnValue(selection);
}

function selectOnly(host: HTMLElement): void {
  const container = selectionContainer(host);
  installNativeSelection(container);
  act(() => {
    fireEvent.mouseDown(container, { clientX: 40, clientY: 30 });
    document.dispatchEvent(new Event('selectionchange'));
    fireEvent.mouseUp(document, { target: container, clientX: 90, clientY: 42 });
    flushSync(() => {});
  });
}

// jsdom 的 PointerEvent 不经 fireEvent 转发 clientX/clientY；
// 沿用 Selection.rect.test.tsx 的 MouseEvent + defineProperty pointerId 模式
function dispatchPointer(
  target: EventTarget,
  type: string,
  pointerId: number,
  clientX: number,
  clientY: number,
): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  target.dispatchEvent(event);
}

// 持久化 px 文本 range：rects 与 TEXT_RECT 一致（行高 24）
function pxTextRange(): SelectionRange {
  return {
    id: 'text-1',
    text: 'Deterministic',
    start: 0,
    end: 12,
    createdAt: 1,
    overlayRectType: 'px',
    rects: [{ x: 40, y: 30, width: 80, height: 24 }],
    markerStyle: { ...OWNER_STYLE },
  };
}

// 持久化 percent 文本 range：行高 8（百分比坐标）
function percentTextRange(): SelectionRange {
  return {
    id: 'text-percent',
    text: 'Deterministic',
    start: 0,
    end: 12,
    createdAt: 1,
    overlayRectType: 'percent',
    rects: [{ x: 10, y: 10, width: 20, height: 8 }],
    markerStyle: { ...OWNER_STYLE },
  };
}

// 持久化 px 框选 rect
function pxRect(): SelectionRect {
  return {
    id: 'rect-1',
    createdAt: 1,
    overlayRectType: 'px',
    start: { x: 50, y: 50 },
    end: { x: 150, y: 150 },
    rect: { x: 50, y: 50, width: 100, height: 100 },
    markerStyle: { ...OWNER_STYLE },
  };
}

// 读取与本文件同目录的 src/style.css。
// 计划首选写法 readFileSync(new URL('./style.css', import.meta.url)) 在 vitest jsdom 环境下
// 不可行：import.meta.url 被重写为 http scheme 且 jsdom 的 URL 对象无法直接传给 Node fs
// （实测 ERR_INVALID_URL_SCHEME）。file scheme 时取 pathname，否则回退 vitest cwd（项目根）
// 相对路径——两种路径指向同一个 src/style.css。
function readStyleCss(): string {
  const url = new URL('./style.css', import.meta.url);
  return readFileSync(url.protocol === 'file:' ? url.pathname : 'src/style.css', 'utf8');
}

// ---------------------------------------------------------------------------
// 8 格公共契约矩阵（active/persisted × text/rect × start/end）
// ---------------------------------------------------------------------------

type MatrixScenario = 'active-text' | 'active-rect' | 'persisted-text' | 'persisted-rect';

interface MatrixCell {
  readonly scenario: MatrixScenario;
  readonly type: 'start' | 'end';
  readonly owner: 'active-selection' | 'persisted-range';
  readonly target: 'text' | 'rect';
  readonly rangeId: string | null;
  readonly rectId: string | null;
  readonly className: string;
  readonly ariaLabel: string;
  readonly lineHeight: number | undefined;
  readonly position: { readonly x: number; readonly y: number };
  readonly styleKeys: readonly string[];
}

// 文本手柄 style 精确键集：left/top + 仅 --hsn-handle-color（决策6，不含 background/border*）
const TEXT_STYLE_KEYS: readonly string[] = ['--hsn-handle-color', 'left', 'top'];
// rect 手柄 style 精确键集：left/top + background + owner 有 borderColor 时的 border 三件套
const RECT_STYLE_KEYS: readonly string[] = [
  'background',
  'borderColor',
  'borderStyle',
  'borderWidth',
  'left',
  'top',
];

const MATRIX: readonly MatrixCell[] = [
  {
    scenario: 'active-text',
    type: 'start',
    owner: 'active-selection',
    target: 'text',
    rangeId: null,
    rectId: null,
    className: 'hsn-selection-handle hsn-selection-handle--start',
    ariaLabel: '拖动以调整选区起点',
    lineHeight: 24,
    position: { x: 40, y: 42 },
    styleKeys: TEXT_STYLE_KEYS,
  },
  {
    scenario: 'active-text',
    type: 'end',
    owner: 'active-selection',
    target: 'text',
    rangeId: null,
    rectId: null,
    className: 'hsn-selection-handle hsn-selection-handle--end',
    ariaLabel: '拖动以调整选区终点',
    lineHeight: 24,
    position: { x: 120, y: 42 },
    styleKeys: TEXT_STYLE_KEYS,
  },
  {
    scenario: 'active-rect',
    type: 'start',
    owner: 'active-selection',
    target: 'rect',
    rangeId: null,
    rectId: null,
    className: 'hsn-selection-handle hsn-selection-handle--start hsn-selection-handle-rect',
    ariaLabel: '拖动以调整选区起点',
    lineHeight: undefined,
    position: { x: 200, y: 200 },
    styleKeys: RECT_STYLE_KEYS,
  },
  {
    scenario: 'active-rect',
    type: 'end',
    owner: 'active-selection',
    target: 'rect',
    rangeId: null,
    rectId: null,
    className: 'hsn-selection-handle hsn-selection-handle--end hsn-selection-handle-rect',
    ariaLabel: '拖动以调整选区终点',
    lineHeight: undefined,
    position: { x: 250, y: 280 },
    styleKeys: RECT_STYLE_KEYS,
  },
  {
    scenario: 'persisted-text',
    type: 'start',
    owner: 'persisted-range',
    target: 'text',
    rangeId: 'text-1',
    rectId: null,
    className: 'hsn-selection-handle hsn-selection-handle--start',
    ariaLabel: '拖动以调整高亮起点',
    lineHeight: 24,
    position: { x: 40, y: 42 },
    styleKeys: TEXT_STYLE_KEYS,
  },
  {
    scenario: 'persisted-text',
    type: 'end',
    owner: 'persisted-range',
    target: 'text',
    rangeId: 'text-1',
    rectId: null,
    className: 'hsn-selection-handle hsn-selection-handle--end',
    ariaLabel: '拖动以调整高亮终点',
    lineHeight: 24,
    position: { x: 120, y: 42 },
    styleKeys: TEXT_STYLE_KEYS,
  },
  {
    scenario: 'persisted-rect',
    type: 'start',
    owner: 'persisted-range',
    target: 'rect',
    rangeId: 'rect-1',
    rectId: 'rect-1',
    className: 'hsn-selection-handle hsn-selection-handle--start hsn-selection-handle-rect',
    ariaLabel: '拖动以调整高亮起点',
    lineHeight: undefined,
    position: { x: 50, y: 50 },
    styleKeys: RECT_STYLE_KEYS,
  },
  {
    scenario: 'persisted-rect',
    type: 'end',
    owner: 'persisted-range',
    target: 'rect',
    rangeId: 'rect-1',
    rectId: 'rect-1',
    className: 'hsn-selection-handle hsn-selection-handle--end hsn-selection-handle-rect',
    ariaLabel: '拖动以调整高亮终点',
    lineHeight: undefined,
    position: { x: 150, y: 150 },
    styleKeys: RECT_STYLE_KEYS,
  },
];

// 按场景渲染并捕获 renderHandle props（active-rect 在容器上画出 200,200 → 250,280 的框选）
function renderScenario(scenario: MatrixScenario, captured: HandleRenderProps[]): void {
  const renderHandle = (props: HandleRenderProps): React.ReactElement => {
    captured.push(props);
    return <button type="button" data-testid={`handle-${props.type}`} style={props.style} />;
  };
  if (scenario === 'active-text') {
    const { container } = render(
      <Selection
        ranges={[]}
        overlayRectType="px"
        selectionStyle={OWNER_STYLE}
        renderHandle={renderHandle}
      >
        {content()}
      </Selection>,
    );
    selectOnly(container);
    return;
  }
  if (scenario === 'active-rect') {
    const { container } = render(
      <Selection ranges={[]} tool="rect" selectionStyle={OWNER_STYLE} renderHandle={renderHandle}>
        {content()}
      </Selection>,
    );
    const host = selectionContainer(container);
    act(() => {
      dispatchPointer(host, 'pointerdown', 1, 200, 200);
      dispatchPointer(document, 'pointermove', 1, 250, 280);
      dispatchPointer(document, 'pointerup', 1, 250, 280);
    });
    return;
  }
  if (scenario === 'persisted-text') {
    render(
      <Selection
        ranges={[pxTextRange()]}
        selectedRangeId="text-1"
        overlayRectType="px"
        renderHandle={renderHandle}
      >
        {content()}
      </Selection>,
    );
    return;
  }
  render(
    <Selection
      ranges={[]}
      rects={[pxRect()]}
      selectedRectId="rect-1"
      overlayRectType="px"
      renderHandle={renderHandle}
    >
      {content()}
    </Selection>,
  );
}

describe('Selection default handles', () => {
  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    vi.restoreAllMocks();
  });

  // 8 格矩阵：逐格断言全部公开字段，不用 objectContaining 略过任何字段
  // （vitest it.each 不支持 $var 插值，用元组 + %s 保证用例名可区分）
  it.each(MATRIX.map((cell) => [`${cell.scenario}.${cell.type}`, cell] as const))(
    'contract-matrix.%s',
    (_name, cell) => {
      // Given
      mockGeometry();
      const captured: HandleRenderProps[] = [];

      // When
      renderScenario(cell.scenario, captured);

      // Then
      const props = captured.find(
        (p) => p.owner === cell.owner && p.target === cell.target && p.type === cell.type,
      );
      expect(props).toBeDefined();
      expect(props!.owner).toBe(cell.owner);
      expect(props!.type).toBe(cell.type);
      expect(props!.rangeId).toBe(cell.rangeId);
      expect(props!.rectId).toBe(cell.rectId);
      expect(props!.target).toBe(cell.target);
      // handleProps.className 对外字节不变：-text 只在内置 button DOM 上（见 DOM 用例）
      expect(props!.className).toBe(cell.className);
      expect(props!.ariaLabel).toBe(cell.ariaLabel);
      expect(props!.lineHeight).toBe(cell.lineHeight);
      expect(props!.positionUnit).toBe('px');
      expect(props!.isDragging).toBe(false);
      expect(props!.position).toEqual(cell.position);
      // 外部 style 精确键集：含 left/top，不含 width/height（热区尺寸只属内置 button）
      expect(Object.keys(props!.style).sort()).toEqual([...cell.styleKeys]);
      const style = props!.style as HandleStyle;
      expect(style.width).toBeUndefined();
      expect(style.height).toBeUndefined();
      if (cell.target === 'text') {
        expect(style['--hsn-handle-color']).toBe(OWNER_BACKGROUND);
        expect(style.background).toBeUndefined();
        expect(style.borderColor).toBeUndefined();
        expect(style.borderWidth).toBeUndefined();
        expect(style.borderStyle).toBeUndefined();
      } else {
        expect(style.background).toBe(OWNER_BACKGROUND);
        expect(style.borderColor).toBe(OWNER_BORDER_COLOR);
        expect(style.borderWidth).toBe('2px');
        expect(style.borderStyle).toBe('solid');
      }
    },
  );

  it('dom.default-text-button-has-text-class-line-circle-and-28x36-hotzone', () => {
    // Given: 持久化 px 文本 range（行高 24），走内置默认 button
    mockGeometry();
    const { container } = render(
      <Selection ranges={[pxTextRange()]} selectedRangeId="text-1" overlayRectType="px">
        {content()}
      </Selection>,
    );

    // Then: 内置 button 才带 hsn-selection-handle-text，且含且仅含 __line/__circle
    const buttons = container.querySelectorAll('button.hsn-selection-handle-text');
    expect(buttons).toHaveLength(2);
    const start = buttons[0] as HTMLElement;
    const end = buttons[1] as HTMLElement;
    expect(start.className).toBe(
      'hsn-selection-handle hsn-selection-handle--start hsn-selection-handle-text',
    );
    expect(end.className).toBe(
      'hsn-selection-handle hsn-selection-handle--end hsn-selection-handle-text',
    );
    for (const button of [start, end]) {
      expect(button.children).toHaveLength(2);
      expect(button.querySelector('.hsn-selection-handle__line')).not.toBeNull();
      expect(button.querySelector('.hsn-selection-handle__circle')).not.toBeNull();
    }

    // Then: px 几何——锚点 left/top 与旧圆点一致，热区 28px × (24+12)
    expect(start.style.left).toBe('40px');
    expect(start.style.top).toBe('42px');
    expect(start.style.width).toBe('28px');
    expect(start.style.height).toBe('36px');
    expect(end.style.left).toBe('120px');
    expect(end.style.top).toBe('42px');
    expect(end.style.width).toBe('28px');
    expect(end.style.height).toBe('36px');
  });

  it('dom.default-rect-button-is-empty-and-has-no-text-class', () => {
    // Given: 持久化 px 框选 rect，走内置默认 button
    mockGeometry();
    const { container } = render(
      <Selection ranges={[]} rects={[pxRect()]} selectedRectId="rect-1" overlayRectType="px">
        {content()}
      </Selection>,
    );

    // Then: rect 手柄无 -text 类、无子元素（空 button），视觉逐像素不变
    const buttons = container.querySelectorAll('button.hsn-selection-handle-rect');
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button.classList.contains('hsn-selection-handle-text')).toBe(false);
      expect(button.children).toHaveLength(0);
    }
  });

  it('geometry.percent-hotzone-height-is-calc', () => {
    // Given: 持久化 percent 文本 range（行高 8）
    mockGeometry();
    const { container } = render(
      <Selection
        ranges={[percentTextRange()]}
        selectedRangeId="text-percent"
        overlayRectType="percent"
      >
        {content()}
      </Selection>,
    );

    // Then: left/top 为百分比字符串，热区高 calc(8% + 12px)
    const buttons = container.querySelectorAll('button.hsn-selection-handle-text');
    expect(buttons).toHaveLength(2);
    const start = buttons[0] as HTMLElement;
    const end = buttons[1] as HTMLElement;
    expect(start.style.left).toBe('10%');
    expect(start.style.top).toBe('14%');
    expect(start.style.width).toBe('28px');
    expect(start.style.height).toBe('calc(8% + 12px)');
    expect(end.style.left).toBe('30%');
    expect(end.style.top).toBe('14%');
    expect(end.style.height).toBe('calc(8% + 12px)');
  });

  it('renderHandle-props.px-text-lineHeight-24-and-clean-style', () => {
    // Given
    mockGeometry();
    const captured: HandleRenderProps[] = [];
    const renderHandle = (props: HandleRenderProps): React.ReactElement => {
      captured.push(props);
      return <button type="button" data-testid={`handle-${props.type}`} style={props.style} />;
    };

    // When
    render(
      <Selection
        ranges={[pxTextRange()]}
        selectedRangeId="text-1"
        overlayRectType="px"
        renderHandle={renderHandle}
      >
        {content()}
      </Selection>,
    );

    // Then: lineHeight=行高 24；className 字节不变；style 不含 width/height；CSS 变量存在
    const start = captured.find((p) => p.type === 'start');
    expect(start).toBeDefined();
    expect(start!.lineHeight).toBe(24);
    expect(start!.className).toBe('hsn-selection-handle hsn-selection-handle--start');
    expect(start!.style.width).toBeUndefined();
    expect(start!.style.height).toBeUndefined();
    expect((start!.style as HandleStyle)['--hsn-handle-color']).toBe(OWNER_BACKGROUND);
  });

  it('renderHandle-props.percent-text-lineHeight-8', () => {
    // Given
    mockGeometry();
    const captured: HandleRenderProps[] = [];
    const renderHandle = (props: HandleRenderProps): React.ReactElement => {
      captured.push(props);
      return <button type="button" data-testid={`handle-${props.type}`} style={props.style} />;
    };

    // When
    render(
      <Selection
        ranges={[percentTextRange()]}
        selectedRangeId="text-percent"
        overlayRectType="percent"
        renderHandle={renderHandle}
      >
        {content()}
      </Selection>,
    );

    // Then: percent 模式下 lineHeight 单位随 positionUnit（0-100 百分比）
    const start = captured.find((p) => p.type === 'start');
    expect(start).toBeDefined();
    expect(start!.lineHeight).toBe(8);
    expect(start!.positionUnit).toBe('percent');
  });

  it('renderHandle-props.rect-lineHeight-undefined', () => {
    // Given
    mockGeometry();
    const captured: HandleRenderProps[] = [];
    const renderHandle = (props: HandleRenderProps): React.ReactElement => {
      captured.push(props);
      return <button type="button" data-testid={`handle-${props.type}`} style={props.style} />;
    };

    // When
    render(
      <Selection
        ranges={[]}
        rects={[pxRect()]}
        selectedRectId="rect-1"
        overlayRectType="px"
        renderHandle={renderHandle}
      >
        {content()}
      </Selection>,
    );

    // Then: rect 手柄恒不传 lineHeight（组件二次渲染会重复调用 renderHandle，
    // 与 Selection.rect.test.tsx 的 4 次调用实证一致，故逐条断言而不锁调用次数）
    expect(captured.length).toBeGreaterThanOrEqual(2);
    expect(captured.find((p) => p.type === 'start')).toBeDefined();
    expect(captured.find((p) => p.type === 'end')).toBeDefined();
    for (const props of captured) {
      expect(props.lineHeight).toBeUndefined();
    }
  });

  it('multi-line-fixture.start-uses-first-height-end-uses-last-height', () => {
    // Given: getClientRects 明确返回两行（首行高 24、末行高 16，坐标不作猜测）
    mockGeometry([new DOMRect(40, 30, 80, 24), new DOMRect(40, 54, 60, 16)]);
    const captured: HandleRenderProps[] = [];
    const renderHandle = (props: HandleRenderProps): React.ReactElement => {
      captured.push(props);
      return <button type="button" data-testid={`handle-${props.type}`} style={props.style} />;
    };
    const { container } = render(
      <Selection ranges={[]} overlayRectType="px" renderHandle={renderHandle}>
        {content()}
      </Selection>,
    );

    // When: 激活活跃选区
    selectOnly(container);

    // Then: start 取首行高 24，end 取末行高 16（串错 first/last 会直接红）
    const start = captured.find((p) => p.type === 'start' && p.owner === 'active-selection');
    const end = captured.find((p) => p.type === 'end' && p.owner === 'active-selection');
    expect(start).toBeDefined();
    expect(end).toBeDefined();
    expect(start!.lineHeight).toBe(24);
    expect(end!.lineHeight).toBe(16);
  });

  it('drag-pass-through.default-text-handle-sets-pointer-events-none', () => {
    // Given: 活跃选区的默认文本手柄
    mockGeometry();
    const { container } = render(
      <Selection ranges={[]} overlayRectType="px">
        {content()}
      </Selection>,
    );
    selectOnly(container);
    const handle = container.querySelector('button.hsn-selection-handle-text') as HTMLElement;
    expect(handle).not.toBeNull();

    // When: pointerDown 触发 beginHandleDrag（独立断言，不作路由证明）
    fireEvent.pointerDown(handle);

    // Then: 立即内联 pointer-events: none，避免 caretRangeFromPoint 命中手柄自身
    expect(handle.style.pointerEvents).toBe('none');

    // 收尾：pointerup 恢复内联样式，避免跨用例泄漏
    act(() => {
      dispatchPointer(document, 'pointerup', 1, 0, 0);
    });
    expect(handle.style.pointerEvents).toBe('');
  });
});

// ---------------------------------------------------------------------------
// hsn-selection-handle-dot 迁移回归锁（纯视觉类，无 rect 路由语义）
// ---------------------------------------------------------------------------

describe('hsn-selection-handle-dot migration lock', () => {
  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    vi.restoreAllMocks();
  });

  it('drag-routes-to-text-range-update-not-rect', () => {
    // Given: 一个 selected persisted SelectionRange，harness 只挂三个 spy
    mockGeometry();
    const onUpdateRange = vi.fn();
    const onUpdateRect = vi.fn();
    const onCreateRect = vi.fn();
    const range = pxTextRange();
    // -dot 复刻旧圆点视觉：renderHandle 返回带 -dot 后缀类的 span
    const renderHandle = (props: HandleRenderProps): React.ReactElement => (
      <span className={`${props.className} hsn-selection-handle-dot`} style={props.style} />
    );
    const { container } = render(
      <Selection
        ranges={[range]}
        selectedRangeId={range.id}
        overlayRectType="px"
        renderHandle={renderHandle}
        onUpdateRange={onUpdateRange}
        onUpdateRect={onUpdateRect}
        onCreateRect={onCreateRect}
      >
        {content()}
      </Selection>,
    );
    const endHandle = container.querySelector(
      '.hsn-selection-handle-dot.hsn-selection-handle--end',
    ) as HTMLElement;
    expect(endHandle).not.toBeNull();

    // Given: stub caretRangeFromPoint（jsdom 未实现），返回容器文本节点 offset 20 的 collapsed Range；
    // 保存原 descriptor，finally 强制恢复，原本不存在时删除该属性
    const original = Object.getOwnPropertyDescriptor(document, 'caretRangeFromPoint');
    const paragraph = container.querySelector('[data-testid="first-paragraph"]');
    if (!paragraph) throw new TypeError('Expected first paragraph fixture');
    const caretRange = document.createRange();
    caretRange.setStart(textNodeFrom(paragraph), 20);
    caretRange.collapse(true);
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: vi.fn(() => caretRange),
    });
    try {
      // When: end 手柄 pointerDown → pointermove → pointerup
      act(() => {
        dispatchPointer(endHandle, 'pointerdown', 1, 120, 42);
        dispatchPointer(document, 'pointermove', 1, 100, 42);
        dispatchPointer(document, 'pointerup', 1, 100, 42);
      });

      // Then: 文本路由——onUpdateRange 被调用，两个 rect spy 均零调用
      expect(onUpdateRange).toHaveBeenCalled();
      expect(onUpdateRect).not.toHaveBeenCalled();
      expect(onCreateRect).not.toHaveBeenCalled();
    } finally {
      if (original) {
        Object.defineProperty(document, 'caretRangeFromPoint', original);
      } else {
        // 原本不存在该属性：删除 stub，恢复 jsdom 初始状态
        Reflect.deleteProperty(document, 'caretRangeFromPoint');
      }
    }
  });

  it('color-and-size-css-lock', () => {
    // Given: -dot 迁移手柄捕获 owner 推导色
    mockGeometry();
    const captured: HandleRenderProps[] = [];
    const renderHandle = (props: HandleRenderProps): React.ReactElement => {
      captured.push(props);
      return <span className={`${props.className} hsn-selection-handle-dot`} style={props.style} />;
    };
    const { container } = render(
      <Selection
        ranges={[pxTextRange()]}
        selectedRangeId="text-1"
        overlayRectType="px"
        renderHandle={renderHandle}
      >
        {content()}
      </Selection>,
    );

    // Then: (a) dot 类存在；(b) CSS 变量等于 owner 推导色（jsdom 内联同步）
    const dot = container.querySelector('.hsn-selection-handle-dot') as HTMLElement;
    expect(dot).not.toBeNull();
    const start = captured.find((p) => p.type === 'start');
    expect(start).toBeDefined();
    expect((start!.style as HandleStyle)['--hsn-handle-color']).toBe(OWNER_BACKGROUND);
    expect(dot.style.getPropertyValue('--hsn-handle-color')).toBe(OWNER_BACKGROUND);

    // Then: (c) style.css 规则锁——读取源码，捕获独立 dot 规则块后分别断言两项
    // （独立规则前有注释块，计划的单正则无法跨越注释，按计划允许的兜底方案实现；
    // 不退化为全文件 includes）
    const css = readStyleCss();
    const dotRule = css.match(
      /(?:^|})\s*(?:\/\*[\s\S]*?\*\/\s*)*\.hsn-selection-handle-dot\s*\{([^{}]*)\}/,
    );
    expect(dotRule).not.toBeNull();
    const dotBlock = dotRule![1]!;
    expect(dotBlock).toMatch(/box-sizing\s*:\s*border-box/);
    expect(dotBlock).toMatch(/background\s*:\s*var\(--hsn-handle-color,\s*#ff4fa3\)/);
    // 声明顺序锁：box-sizing 在 background 之前（与计划固定正则的顺序语义一致）
    expect(dotBlock.indexOf('box-sizing')).toBeLessThan(dotBlock.indexOf('background'));

    // Then: 共享双选择器块（-rect, -dot）必须不含 box-sizing（不泄漏到 rect 的盒模型契约）
    const shared = css.match(
      /\.hsn-selection-handle-rect\s*,\s*\.hsn-selection-handle-dot\s*\{([^{}]*)\}/,
    );
    expect(shared).not.toBeNull();
    expect(shared![1]).not.toMatch(/box-sizing/);
  });
});
