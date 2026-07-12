/// <reference types="vitest/globals" />
/**
 * Selection.stylePersistence.test.tsx — 样式持久化 RED 测试
 *
 * 在实现产品代码之前，先锁定下列行为：
 * 1. 新创建的 legacy / linked range 必须携带 markerStyle / selectionStyle 快照；
 * 2. props 变化后，旧 range 仍使用自身存储的样式；
 * 3. 活跃选区使用当前 selectionStyle；
 * 4. 手柄颜色跟随其所属状态（活跃选区用 selectionStyle，已确认 range 用 markerStyle）；
 * 5. 无样式的旧数据回退到当前 props / CSS 默认；
 * 6. 仅传入旧版颜色 props 时，新数据也能生成稳定快照。
 */
import { fireEvent, render, act } from '@testing-library/react';
import { createRef } from 'react';
import { flushSync } from 'react-dom';
import type { CSSProperties } from 'react';
import { Selection } from './Selection';
import type { LinkedSelectionData, SelectionRange, SelectionRef } from './types';

// ---------------------------------------------------------------------------
// 固定测试夹具（与 Selection.overlayRectType.test.tsx 保持一致）
// ---------------------------------------------------------------------------

const CONTAINER_RECT = new DOMRect(0, 0, 400, 300);
const TEXT_RECT = new DOMRect(40, 30, 80, 24);

function makeDomRectList(rects: readonly DOMRect[]): DOMRectList {
  return Object.assign([...rects], {
    item: (index: number): DOMRect | null => rects[index] ?? null,
  });
}

function mockGeometry(rect: DOMRect = TEXT_RECT): void {
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: vi.fn() });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(CONTAINER_RECT);
  vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue(makeDomRectList([rect]));
  vi.spyOn(Range.prototype, 'getBoundingClientRect').mockReturnValue(rect);
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

function selectAndHighlight(host: HTMLElement, ref: React.RefObject<SelectionRef | null>): void {
  const container = selectionContainer(host);
  installNativeSelection(container);
  act(() => {
    fireEvent.mouseDown(container, { clientX: 40, clientY: 30 });
    document.dispatchEvent(new Event('selectionchange'));
    fireEvent.mouseUp(document, { target: container, clientX: 90, clientY: 42 });
    flushSync(() => {});
    ref.current?.highlight();
  });
}

function activateSelection(host: HTMLElement): void {
  const container = selectionContainer(host);
  installNativeSelection(container);
  act(() => {
    fireEvent.mouseDown(container, { clientX: 40, clientY: 30 });
    document.dispatchEvent(new Event('selectionchange'));
    fireEvent.mouseUp(document, { target: container, clientX: 90, clientY: 42 });
    flushSync(() => {});
  });
}

function selectedRange(onSelect: ReturnType<typeof vi.fn>): SelectionRange {
  const range = onSelect.mock.lastCall?.[0];
  if (range) return range;
  throw new TypeError('Expected onSelect range');
}

function linkedHighlight(onChange: ReturnType<typeof vi.fn>): LinkedSelectionData {
  const data = onChange.mock.calls.map((call) => call[0]).find((item) => item?.items?.length > 0);
  if (data) return data;
  throw new TypeError('Expected linked highlight data');
}

function linkedItem(data: LinkedSelectionData) {
  const item = data.items[0];
  if (item) return item;
  throw new TypeError('Expected linked item');
}

// ---------------------------------------------------------------------------
// RED 测试
// ---------------------------------------------------------------------------

describe('Selection style persistence', () => {
  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    vi.restoreAllMocks();
  });

  it('legacy-px.snapshots-styles-and-renders-stored-svg-style', () => {
    // Given
    mockGeometry();
    const ref = createRef<SelectionRef>();
    const onSelect = vi.fn();
    const markerStyle: CSSProperties = {
      backgroundColor: 'rgba(64,156,255,0.25)',
      borderColor: '#1c7ed6',
      borderWidth: 2,
    };
    const selectionStyle: CSSProperties = { backgroundColor: 'rgba(244,114,182,0.45)' };
    const { container, rerender } = render(
      <Selection
        ref={ref}
        ranges={[]}
        onSelect={onSelect}
        overlayRectType="px"
        markerStyle={markerStyle}
        selectionStyle={selectionStyle}
      >
        {content()}
      </Selection>,
    );

    // When: 选区 + 高亮
    selectAndHighlight(container, ref);
    const range = selectedRange(onSelect);

    // Then: 数据快照包含传入样式
    expect(range.markerStyle).toEqual(markerStyle);
    expect(range.selectionStyle).toEqual(selectionStyle);

    // When: 用新颜色 props 重新渲染同一 range
    const nextMarkerStyle: CSSProperties = {
      backgroundColor: 'rgba(0,255,0,0.3)',
      borderColor: '#000',
      borderWidth: 5,
    };
    rerender(
      <Selection
        ref={ref}
        ranges={[range]}
        selectedRangeId={range.id}
        onSelect={onSelect}
        overlayRectType="px"
        markerStyle={nextMarkerStyle}
        selectionStyle={{ backgroundColor: 'rgba(0,0,255,0.5)' }}
      >
        {content()}
      </Selection>,
    );

    // Then: SVG 仍使用旧存储样式
    const rect = container.querySelector('svg rect[data-range-id]');
    expect(rect).not.toBeNull();
    expect(rect).toHaveStyle({
      fill: 'rgba(64,156,255,0.25)',
      stroke: '#1c7ed6',
      strokeWidth: '2',
    });
  });

  it('legacy-percent.snapshots-styles-and-renders-stored-div-style', () => {
    // Given
    mockGeometry();
    const ref = createRef<SelectionRef>();
    const onSelect = vi.fn();
    const markerStyle: CSSProperties = {
      backgroundColor: 'rgba(64,156,255,0.25)',
      borderColor: '#1c7ed6',
      borderWidth: 2,
    };
    const selectionStyle: CSSProperties = { backgroundColor: 'rgba(244,114,182,0.45)' };
    const { container, rerender } = render(
      <Selection
        ref={ref}
        ranges={[]}
        onSelect={onSelect}
        overlayRectType="percent"
        markerStyle={markerStyle}
        selectionStyle={selectionStyle}
      >
        {content()}
      </Selection>,
    );

    // When
    selectAndHighlight(container, ref);
    const range = selectedRange(onSelect);

    // Then: 数据快照包含传入样式
    expect(range.markerStyle).toEqual(markerStyle);
    expect(range.selectionStyle).toEqual(selectionStyle);

    // When: props 改变
    rerender(
      <Selection
        ref={ref}
        ranges={[range]}
        selectedRangeId={range.id}
        onSelect={onSelect}
        overlayRectType="percent"
        markerStyle={{ backgroundColor: 'green' }}
        selectionStyle={{ backgroundColor: 'purple' }}
      >
        {content()}
      </Selection>,
    );

    // Then: div 仍使用旧存储样式
    const div = container.querySelector('.hsn-selection-percent-rect');
    expect(div).not.toBeNull();
    expect(div).toHaveStyle({
      backgroundColor: 'rgba(64,156,255,0.25)',
      borderColor: '#1c7ed6',
      borderWidth: '2px',
    });
  });

  it('linked.snapshots-styles-into-linked-range', () => {
    // Given
    mockGeometry();
    const ref = createRef<SelectionRef>();
    const onLinkedDataChange = vi.fn();
    const linkedData: LinkedSelectionData = {
      items: [],
      selectedRangeId: null,
      selectionOrder: [],
    };
    const markerStyle: CSSProperties = {
      backgroundColor: 'rgba(64,156,255,0.25)',
      borderColor: '#1c7ed6',
      borderWidth: 2,
    };
    const selectionStyle: CSSProperties = { backgroundColor: 'rgba(244,114,182,0.45)' };
    const { container, rerender } = render(
      <Selection
        ref={ref}
        selectionId="page-a"
        linkedMode={true}
        linkedData={linkedData}
        onLinkedDataChange={onLinkedDataChange}
        overlayRectType="percent"
        markerStyle={markerStyle}
        selectionStyle={selectionStyle}
        ranges={[]}
      >
        {content()}
      </Selection>,
    );

    // When
    selectAndHighlight(container, ref);
    const nextData = linkedHighlight(onLinkedDataChange);
    const item = linkedItem(nextData);

    // Then
    expect(item.markerStyle).toEqual(markerStyle);
    expect(item.selectionStyle).toEqual(selectionStyle);

    // When: 用新 props 重新渲染同一 linkedData
    rerender(
      <Selection
        ref={ref}
        selectionId="page-a"
        linkedMode={true}
        linkedData={nextData}
        onLinkedDataChange={onLinkedDataChange}
        overlayRectType="percent"
        markerStyle={{ backgroundColor: 'green' }}
        selectionStyle={{ backgroundColor: 'purple' }}
        ranges={[]}
      >
        {content()}
      </Selection>,
    );

    // Then: 旧 linked range 仍使用旧样式
    const div = container.querySelector('.hsn-selection-percent-rect');
    expect(div).not.toBeNull();
    expect(div).toHaveStyle({
      backgroundColor: 'rgba(64,156,255,0.25)',
      borderColor: '#1c7ed6',
      borderWidth: '2px',
    });
  });

  it('active-selection.uses-current-selection-style', () => {
    // Given
    mockGeometry();
    const ref = createRef<SelectionRef>();
    const selectionStyle: CSSProperties = { backgroundColor: 'rgba(244,114,182,0.45)' };
    const { container, rerender } = render(
      <Selection ref={ref} ranges={[]} overlayRectType="px" selectionStyle={selectionStyle}>
        {content()}
      </Selection>,
    );

    // When: 只激活，不确认
    activateSelection(container);

    // Then
    const rect = container.querySelector('svg rect.hsn-selection-rect--active');
    expect(rect).not.toBeNull();
    expect(rect).toHaveStyle({ fill: 'rgba(244,114,182,0.45)' });

    // When: 更换 selectionStyle 且仍保持活跃
    rerender(
      <Selection
        ref={ref}
        ranges={[]}
        overlayRectType="px"
        selectionStyle={{ backgroundColor: 'rgba(0,255,0,0.5)' }}
      >
        {content()}
      </Selection>,
    );

    // Then: 活跃选区应使用新样式（未被持久化）
    expect(container.querySelector('svg rect.hsn-selection-rect--active')).toHaveStyle({
      fill: 'rgba(0,255,0,0.5)',
    });
  });

  it('handles.use-selection-style-for-active-and-marker-style-for-persisted', () => {
    // Given
    mockGeometry();
    const ref = createRef<SelectionRef>();
    const capturedHandles: Array<{ owner: string; rangeId: string | null; style: CSSProperties }> =
      [];
    const renderHandle = vi.fn(
      (props: {
        owner: 'active-selection' | 'persisted-range';
        rangeId: string | null;
        style: CSSProperties;
      }) => {
        capturedHandles.push({ owner: props.owner, rangeId: props.rangeId, style: props.style });
        return <button type="button" data-testid="custom-handle" />;
      },
    );
    const markerStyle: CSSProperties = {
      backgroundColor: 'rgba(64,156,255,0.25)',
      borderColor: '#1c7ed6',
      borderWidth: 2,
    };
    const selectionStyle: CSSProperties = { backgroundColor: 'rgba(244,114,182,0.45)' };
    const onSelect = vi.fn();
    let selectedRangeId: string | null = null;
    const { container, rerender } = render(
      <Selection
        ref={ref}
        ranges={[]}
        overlayRectType="px"
        markerStyle={markerStyle}
        selectionStyle={selectionStyle}
        renderHandle={renderHandle}
        onSelect={onSelect}
        onSelectRange={(id) => {
          selectedRangeId = id;
        }}
      >
        {content()}
      </Selection>,
    );

    // When: 激活选区
    activateSelection(container);

    // Then: 活跃手柄应使用 selectionStyle 颜色
    const activeHandles = capturedHandles.filter((h) => h.owner === 'active-selection');
    expect(activeHandles.length).toBeGreaterThan(0);
    expect(activeHandles[0]?.style.background).toBe('rgba(244,114,182,0.45)');

    // When: 确认高亮
    act(() => {
      ref.current?.highlight();
    });
    const range = selectedRange(onSelect);

    // 选中刚创建的 range 以渲染 persisted 手柄
    rerender(
      <Selection
        ref={ref}
        ranges={[range]}
        selectedRangeId={range.id}
        overlayRectType="px"
        markerStyle={markerStyle}
        selectionStyle={selectionStyle}
        renderHandle={renderHandle}
        onSelect={onSelect}
        onSelectRange={(id) => {
          selectedRangeId = id;
        }}
      >
        {content()}
      </Selection>,
    );

    // Then: 已确认 range 的手柄应使用 markerStyle 颜色
    const persistedHandles = capturedHandles.filter(
      (h) => h.owner === 'persisted-range' && h.rangeId !== null,
    );
    expect(persistedHandles.length).toBeGreaterThan(0);
    expect(persistedHandles[0]?.style.background).toBe('rgba(64,156,255,0.25)');
    expect(persistedHandles[0]?.style.borderColor).toBe('#1c7ed6');
    expect(selectedRangeId).toBe(range.id);
  });

  it('backcompat.unstyled-range-falls-back-to-current-props', () => {
    // Given: 一个无 markerStyle 的旧 range
    mockGeometry();
    const oldRange: SelectionRange = {
      id: 'old',
      text: 'Deterministic',
      start: 0,
      end: 12,
      createdAt: 1,
      overlayRectType: 'px',
      rects: [{ x: 40, y: 30, width: 80, height: 24 }],
    };
    const markerStyle: CSSProperties = {
      backgroundColor: 'rgba(64,156,255,0.25)',
      borderColor: '#1c7ed6',
      borderWidth: 2,
    };

    // When
    const { container } = render(
      <Selection
        ranges={[oldRange]}
        selectedRangeId={oldRange.id}
        overlayRectType="px"
        markerStyle={markerStyle}
      >
        {content()}
      </Selection>,
    );

    // Then: 使用当前 props 渲染
    const rect = container.querySelector('svg rect[data-range-id="old"]');
    expect(rect).not.toBeNull();
    expect(rect).toHaveStyle({ fill: 'rgba(64,156,255,0.25)', stroke: '#1c7ed6' });
  });

  it('legacy-selected-highlight.applies-to-selected-svg-and-percent-ranges', () => {
    // Given: 仅使用旧版 markerColors API，未存 markerStyle 的旧数据应能区分普通/选中高亮色。
    mockGeometry();
    const pxRange: SelectionRange = {
      id: 'old-px',
      text: 'Deterministic',
      start: 0,
      end: 12,
      createdAt: 1,
      overlayRectType: 'px',
      rects: [{ x: 40, y: 30, width: 80, height: 24 }],
    };
    const percentRange: SelectionRange = {
      id: 'old-percent',
      text: 'Deterministic',
      start: 0,
      end: 12,
      createdAt: 1,
      overlayRectType: 'percent',
      rects: [{ x: 10, y: 10, width: 20, height: 8 }],
    };

    // When: 渲染被选中的 px range。
    const { container, rerender } = render(
      <Selection
        ranges={[pxRange]}
        selectedRangeId={pxRange.id}
        overlayRectType="px"
        markerColors={{
          highlight: { fill: 'rgba(64,156,255,0.25)' },
          selectedHighlight: { fill: 'rgba(255,193,7,0.45)' },
        }}
      >
        {content()}
      </Selection>,
    );

    // Then: SVG 选中态使用 selectedHighlight。
    expect(container.querySelector('svg rect[data-range-id="old-px"]')).toHaveStyle({
      fill: 'rgba(255,193,7,0.45)',
    });

    // When: 渲染被选中的 percent range。
    rerender(
      <Selection
        ranges={[percentRange]}
        selectedRangeId={percentRange.id}
        overlayRectType="percent"
        markerColors={{
          highlight: { fill: 'rgba(64,156,255,0.25)' },
          selectedHighlight: { fill: 'rgba(255,193,7,0.45)' },
        }}
      >
        {content()}
      </Selection>,
    );

    // Then: percent overlay 同样使用 selectedHighlight。
    expect(container.querySelector('.hsn-selection-percent-rect')).toHaveStyle({
      backgroundColor: 'rgba(255,193,7,0.45)',
    });
  });

  it('handles.preserve-string-border-width', () => {
    // Given: 用户传入合法 CSS 字符串 borderWidth。
    mockGeometry();
    const capturedHandles: Array<{ owner: string; rangeId: string | null; style: CSSProperties }> =
      [];
    const renderHandle = vi.fn(
      (props: {
        owner: 'active-selection' | 'persisted-range';
        rangeId: string | null;
        style: CSSProperties;
      }) => {
        capturedHandles.push({ owner: props.owner, rangeId: props.rangeId, style: props.style });
        return <button type="button" data-testid="custom-handle" />;
      },
    );
    const range: SelectionRange = {
      id: 'styled',
      text: 'Deterministic',
      start: 0,
      end: 12,
      createdAt: 1,
      overlayRectType: 'px',
      rects: [{ x: 40, y: 30, width: 80, height: 24 }],
      markerStyle: {
        backgroundColor: 'rgba(64,156,255,0.25)',
        borderColor: '#1c7ed6',
        borderWidth: '0.125rem',
      },
    };

    // When
    render(
      <Selection
        ranges={[range]}
        selectedRangeId={range.id}
        overlayRectType="px"
        renderHandle={renderHandle}
      >
        {content()}
      </Selection>,
    );

    // Then: 字符串 borderWidth 原样传给手柄，不追加 px。
    const persistedHandle = capturedHandles.find(
      (h) => h.owner === 'persisted-range' && h.rangeId === range.id,
    );
    expect(persistedHandle?.style.borderWidth).toBe('0.125rem');
  });

  it('legacy-color-props.create-stable-style-snapshots', () => {
    // Given
    mockGeometry();
    const ref = createRef<SelectionRef>();
    const onSelect = vi.fn();
    const { container, rerender } = render(
      <Selection
        ref={ref}
        ranges={[]}
        onSelect={onSelect}
        overlayRectType="px"
        highlightColor="rgba(64,156,255,0.25)"
        selectionColor="rgba(244,114,182,0.45)"
      >
        {content()}
      </Selection>,
    );

    // When
    selectAndHighlight(container, ref);
    const range = selectedRange(onSelect);

    // Then: 旧 props 被转换为等价的 style 快照
    expect(range.markerStyle).toEqual({ backgroundColor: 'rgba(64,156,255,0.25)' });
    expect(range.selectionStyle).toEqual({ backgroundColor: 'rgba(244,114,182,0.45)' });

    // When: 更换旧 props
    rerender(
      <Selection
        ref={ref}
        ranges={[range]}
        selectedRangeId={range.id}
        onSelect={onSelect}
        overlayRectType="px"
        highlightColor="green"
        selectionColor="purple"
      >
        {content()}
      </Selection>,
    );

    // Then: 旧 range 仍使用原快照
    const rect = container.querySelector('svg rect[data-range-id]');
    expect(rect).toHaveStyle({ fill: 'rgba(64,156,255,0.25)' });
  });
});
