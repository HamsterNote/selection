/// <reference types="vitest/globals" />

import { fireEvent, render, act } from '@testing-library/react';
import { createRef } from 'react';
import { flushSync } from 'react-dom';
import { Selection } from './Selection';
import type { LinkedSelectionData, SelectionRange, SelectionRef, HandleRenderProps } from './types';

type LinkedItemWithRectType = LinkedSelectionData['items'][number] & { readonly overlayRectType?: 'px' | 'percent' };

const CONTAINER_RECT = new DOMRect(0, 0, 400, 300);
const TEXT_RECT = new DOMRect(40, 30, 80, 24);

function makeDomRectList(rects: readonly DOMRect[]): DOMRectList {
  return Object.assign([...rects], { item: (index: number): DOMRect | null => rects[index] ?? null });
}

function mockGeometry(rect: DOMRect = TEXT_RECT): void {
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: vi.fn() });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: vi.fn() });
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

function linkedItem(data: LinkedSelectionData): LinkedItemWithRectType {
  const item = data.items[0];
  if (item) return item;
  throw new TypeError('Expected linked item');
}

function percentRange(id = 'stored-percent'): SelectionRange {
  return { id, text: 'Deterministic', start: 0, end: 12, createdAt: 1, overlayRectType: 'percent', rects: [{ x: 10, y: 10, width: 20, height: 8 }] };
}

function pxRange(): SelectionRange {
  return { id: 'stored-px', text: 'Deterministic', start: 0, end: 12, createdAt: 1, overlayRectType: 'px', rects: [{ x: 40, y: 30, width: 80, height: 24 }] };
}

describe('Selection overlayRectType', () => {
  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    vi.restoreAllMocks();
  });

  it('selection.linked-percent.stores-percent-and-renders-divs', () => {
    // Given / When / Then: linked percent selection stores 0-100 rects and renders divs.
    mockGeometry();
    const ref = createRef<SelectionRef>();
    const onLinkedDataChange = vi.fn();
    const linkedData: LinkedSelectionData = { items: [], selectedRangeId: null, selectionOrder: [] };
    const { container, rerender } = render(
      <Selection ref={ref} selectionId="page-a" linkedMode={true} linkedData={linkedData} onLinkedDataChange={onLinkedDataChange} overlayRectType="percent" ranges={[]}>
        {content()}
      </Selection>,
    );

    selectAndHighlight(container, ref);

    const nextData = linkedHighlight(onLinkedDataChange);
    const item = linkedItem(nextData);
    expect(item.overlayRectType).toBe('percent');
    expect(item.rectsBySelectionId['page-a']).toEqual([{ x: 10, y: 10, width: 20, height: 8 }]);
    rerender(
      <Selection selectionId="page-a" linkedMode={true} linkedData={nextData} onLinkedDataChange={onLinkedDataChange} overlayRectType="percent" ranges={[]}>
        {content()}
      </Selection>,
    );
    expect(container.querySelectorAll('.hsn-selection-percent-rect')).toHaveLength(1);
    expect(container.querySelectorAll('svg rect[data-range-id]')).toHaveLength(0);
  });

  it('selection.linked-default.missing-data-type-stores-percent', () => {
    // Given / When / Then: linked data 缺省 overlayRectType 时，新建 range 也沿用历史 percent 语义。
    mockGeometry();
    const ref = createRef<SelectionRef>();
    const onLinkedDataChange = vi.fn();
    const linkedData: LinkedSelectionData = { items: [], selectedRangeId: null, selectionOrder: [] };
    const { container } = render(
      <Selection ref={ref} selectionId="page-a" linkedMode={true} linkedData={linkedData} onLinkedDataChange={onLinkedDataChange} ranges={[]}>
        {content()}
      </Selection>,
    );

    selectAndHighlight(container, ref);

    const nextData = linkedHighlight(onLinkedDataChange);
    const item = linkedItem(nextData);
    expect(item.overlayRectType).toBe('percent');
    expect(item.rectsBySelectionId['page-a']).toEqual([{ x: 10, y: 10, width: 20, height: 8 }]);
  });

  it('selection.legacy-px.stores-pixels-and-renders-svg-rects', () => {
    // Given / When / Then: legacy px selection emits pixel rects and renders SVG rects.
    mockGeometry();
    const ref = createRef<SelectionRef>();
    const onSelect = vi.fn();
    const { container } = render(<Selection ref={ref} ranges={[]} onSelect={onSelect} overlayRectType="px">{content()}</Selection>);

    selectAndHighlight(container, ref);

    const range = selectedRange(onSelect);
    expect(range.overlayRectType).toBe('px');
    expect(range.rects).toEqual([{ x: 40, y: 30, width: 80, height: 24 }]);
    render(<Selection ranges={[range]} selectedRangeId={range.id} overlayRectType="px">{content()}</Selection>);
    expect(document.querySelectorAll('svg rect[data-range-id]')).toHaveLength(1);
  });

  it('selection.legacy-percent.stores-percent-and-renders-divs', () => {
    // Given / When / Then: legacy percent selection emits percent rects and renders divs.
    mockGeometry();
    const ref = createRef<SelectionRef>();
    const onSelect = vi.fn();
    const { container } = render(<Selection ref={ref} ranges={[]} onSelect={onSelect} overlayRectType="percent">{content()}</Selection>);

    selectAndHighlight(container, ref);

    const range = selectedRange(onSelect);
    expect(range.overlayRectType).toBe('percent');
    expect(range.rects).toEqual([{ x: 10, y: 10, width: 20, height: 8 }]);
    render(<Selection ranges={[range]} selectedRangeId={range.id} overlayRectType="percent">{content()}</Selection>);
    expect(document.querySelectorAll('.hsn-selection-percent-rect')).toHaveLength(1);
    expect(document.querySelectorAll('svg rect[data-range-id]')).toHaveLength(0);
  });

  it('selection.percent-resize.divs-use-percent-styles', () => {
    // Given / When / Then: percent rect rendering keeps CSS percentages after resize.
    mockGeometry(new DOMRect(80, 60, 160, 48));
    const { container } = render(<Selection ranges={[percentRange()]} selectedRangeId="stored-percent" overlayRectType="percent">{content()}</Selection>);

    expect(container.querySelectorAll('.hsn-selection-percent-rect')).toHaveLength(1);
    expect(container.querySelector('.hsn-selection-percent-rect')).toHaveStyle({ left: '10%', top: '10%', width: '20%', height: '8%' });
  });

  it('selection.linked-backcompat.missing-type-renders-percent-divs', () => {
    // Given / When / Then: linked data without overlayRectType defaults to percent divs.
    mockGeometry();
    const linkedData = { items: [{ id: 'legacy-linked', text: 'Deterministic', start: { selectionId: 'page-a', offset: 0 }, end: { selectionId: 'page-a', offset: 12 }, createdAt: 1, rectsBySelectionId: { 'page-a': [{ x: 10, y: 10, width: 20, height: 8 }] } }], selectedRangeId: 'legacy-linked', selectionOrder: ['page-a'] } satisfies LinkedSelectionData;
    const { container } = render(<Selection selectionId="page-a" linkedMode={true} linkedData={linkedData} ranges={[]}>{content()}</Selection>);

    expect(container.querySelectorAll('.hsn-selection-percent-rect')).toHaveLength(1);
    expect(container.querySelectorAll('svg rect[data-range-id="legacy-linked"]')).toHaveLength(0);
  });

  it('selection.mode-toggle.switches-rendering-surface', () => {
    // Given / When / Then: rerender switches the persistent overlay surface by rect type.
    mockGeometry();
    const { container, rerender } = render(<Selection ranges={[pxRange()]} selectedRangeId="stored-px" overlayRectType="px">{content()}</Selection>);
    expect(container.querySelectorAll('svg rect[data-range-id="stored-px"]')).toHaveLength(1);

    rerender(<Selection ranges={[percentRange()]} selectedRangeId="stored-percent" overlayRectType="percent">{content()}</Selection>);

    expect(container.querySelectorAll('.hsn-selection-percent-rect')).toHaveLength(1);
    expect(container.querySelectorAll('svg rect[data-range-id="stored-percent"]')).toHaveLength(0);
  });

  it('selection.percent-handles.persisted-uses-percent-positioning', () => {
    // Given: percentRange({ x:10, y:10, w:20, h:8 }), start handle at (10, 14), end at (30, 14)
    mockGeometry();
    const captured: HandleRenderProps[] = [];
    const renderHandle = (props: HandleRenderProps) => {
      captured.push(props);
      return <button type="button" data-testid={`handle-${props.type}`} style={props.style} />;
    };

    // When: render persisted percent range with renderHandle
    const { container } = render(
      <Selection
        ranges={[percentRange()]}
        selectedRangeId="stored-percent"
        overlayRectType="percent"
        renderHandle={renderHandle}
      >
        {content()}
      </Selection>,
    );

    // Then: two handles rendered with percent style strings and positionUnit='percent'
    const handles = container.querySelectorAll('button[data-testid^="handle-"]');
    expect(handles).toHaveLength(2);

    const start = captured.find((p) => p.type === 'start');
    const end = captured.find((p) => p.type === 'end');
    expect(start).toBeDefined();
    expect(end).toBeDefined();

    expect(start!.style.left).toBe('10%');
    expect(start!.style.top).toBe('14%');
    expect(start!.position).toEqual({ x: 10, y: 14 });
    expect(start!.positionUnit).toBe('percent');

    expect(end!.style.left).toBe('30%');
    expect(end!.style.top).toBe('14%');
    expect(end!.position).toEqual({ x: 30, y: 14 });
    expect(end!.positionUnit).toBe('percent');
  });

  it('selection.percent-popover.persisted-uses-percent-anchor', () => {
    // Given: percentRange rect { x:10, y:10, w:20, h:8 }, popover anchor = (x+w/2, y) = (20, 10)
    mockGeometry();

    // When: render persisted percent range with popover
    const { container } = render(
      <Selection
        ranges={[percentRange()]}
        selectedRangeId="stored-percent"
        overlayRectType="percent"
        popover={<div data-testid="persisted-popover">Popover</div>}
      >
        {content()}
      </Selection>,
    );

    // Then: .hsn-selection-popover positioned with percent strings
    const popover = container.querySelector('.hsn-selection-popover');
    expect(popover).toBeInTheDocument();
    expect(popover).toHaveStyle({ left: '20%', top: '10%' });
  });

  it('selection.percent-active-handles-and-selection-popover.use-percent-anchor', () => {
    // Given: native selection with TEXT_RECT(40,30,80,24), CONTAINER(400,300)
    // Active percent rects: x=10%, y=10%, w=20%, h=8%
    // Start handle: (10, 14), end handle: (30, 14)
    // selectionPopover anchor: (x+w/2, y) = (20, 10)
    mockGeometry();
    const captured: HandleRenderProps[] = [];
    const renderHandle = (props: HandleRenderProps) => {
      captured.push(props);
      return <button type="button" data-testid={`handle-${props.type}`} style={props.style} />;
    };

    const { container } = render(
      <Selection
        ranges={[]}
        overlayRectType="percent"
        selectionPopover={<div data-testid="active-popover">Active</div>}
        renderHandle={renderHandle}
      >
        {content()}
      </Selection>,
    );

    // When: activate native selection without highlight()
    selectOnly(container);

    // Then: active handles have percent styles
    const handles = container.querySelectorAll('button[data-testid^="handle-"]');
    expect(handles).toHaveLength(2);

    const start = captured.find((p) => p.type === 'start' && p.owner === 'active-selection');
    const end = captured.find((p) => p.type === 'end' && p.owner === 'active-selection');
    expect(start).toBeDefined();
    expect(end).toBeDefined();

    expect(start!.style.left).toBe('10%');
    expect(start!.style.top).toBe('14%');
    expect(start!.position).toEqual({ x: 10, y: 14 });
    expect(start!.positionUnit).toBe('percent');

    expect(end!.style.left).toBe('30%');
    expect(end!.style.top).toBe('14%');
    expect(end!.position).toEqual({ x: 30, y: 14 });
    expect(end!.positionUnit).toBe('percent');

    // Then: selectionPopover anchored with percent strings
    const popover = container.querySelector('.hsn-selection-popover');
    expect(popover).toBeInTheDocument();
    expect(popover).toHaveStyle({ left: '20%', top: '10%' });
  });

  it('selection.px-handles-and-popover.keep-pixel-positioning', () => {
    // Given: pxRange({ x:40, y:30, w:80, h:24 }), start handle at (40, 42), end at (120, 42)
    // Popover anchor: (x+w/2, y) = (80, 30)
    mockGeometry();
    const captured: HandleRenderProps[] = [];
    const renderHandle = (props: HandleRenderProps) => {
      captured.push(props);
      return <button type="button" data-testid={`handle-${props.type}`} style={props.style} />;
    };

    // When: render persisted px range with renderHandle and popover
    const { container } = render(
      <Selection
        ranges={[pxRange()]}
        selectedRangeId="stored-px"
        overlayRectType="px"
        renderHandle={renderHandle}
        popover={<div data-testid="persisted-popover">Popover</div>}
      >
        {content()}
      </Selection>,
    );

    // Then: handles have pixel style strings and positionUnit='px'
    const handles = container.querySelectorAll('button[data-testid^="handle-"]');
    expect(handles).toHaveLength(2);

    const start = captured.find((p) => p.type === 'start');
    const end = captured.find((p) => p.type === 'end');
    expect(start).toBeDefined();
    expect(end).toBeDefined();

    expect(start!.style.left).toBe('40px');
    expect(start!.style.top).toBe('42px');
    expect(start!.position).toEqual({ x: 40, y: 42 });
    expect(start!.positionUnit).toBe('px');

    expect(end!.style.left).toBe('120px');
    expect(end!.style.top).toBe('42px');
    expect(end!.position).toEqual({ x: 120, y: 42 });
    expect(end!.positionUnit).toBe('px');

    // Then: popover positioned with pixel strings
    const popover = container.querySelector('.hsn-selection-popover');
    expect(popover).toBeInTheDocument();
    expect(popover).toHaveStyle({ left: '80px', top: '30px' });
  });

  // S1 — active selection popover hides during drag-select and reappears after mouseup
  it('S1.active-popover.hides-during-drag-select-and-reappears-after-mouseup', () => {
    // Given: render with selectionPopover, establish active selection
    mockGeometry();
    const { container } = render(
      <Selection ranges={[]} overlayRectType="percent" selectionPopover={<div data-testid="active-popover">Active</div>}>
        {content()}
      </Selection>,
    );
    const host = selectionContainer(container);

    // When: establish active selection via selectOnly
    selectOnly(container);

    // Then: popover is in document with correct percent positioning
    const popoverBefore = container.querySelector('.hsn-selection-popover');
    expect(popoverBefore).toBeInTheDocument();
    expect(popoverBefore).toHaveStyle({ left: '20%', top: '10%' });

    // When: fire mouseDown on container outside active rect (180,30 is outside TEXT_RECT 40,30,80,24)
    act(() => {
      fireEvent.mouseDown(host, { clientX: 180, clientY: 30 });
    });

    // Then: popover should hide during drag-select
    const popoverDuringDrag = container.querySelector('.hsn-selection-popover');
    expect(popoverDuringDrag).not.toBeInTheDocument();

    // When: fire mouseUp on document
    act(() => {
      fireEvent.mouseUp(document, { target: host, clientX: 200, clientY: 40 });
    });

    // Then: popover should reappear after mouseup
    const popoverAfter = container.querySelector('.hsn-selection-popover');
    expect(popoverAfter).toBeInTheDocument();
  });

  // S2 — clicking inside selectionPopover does not hide it
  it('S2.active-popover.clicking-inside-popover-does-not-hide', () => {
    // Given: render with selectionPopover as a button, establish active selection
    mockGeometry();
    const { container } = render(
      <Selection ranges={[]} overlayRectType="percent" selectionPopover={<button type="button" data-testid="active-popover-btn">Action</button>}>
        {content()}
      </Selection>,
    );

    // When: establish active selection via selectOnly
    selectOnly(container);

    // Then: popover is in document
    const popover = container.querySelector('.hsn-selection-popover');
    expect(popover).toBeInTheDocument();

    // When: query popover element and fire mouseDown on it
    const popoverBtn = container.querySelector('[data-testid="active-popover-btn"]');
    expect(popoverBtn).toBeInTheDocument();
    act(() => {
      fireEvent.mouseDown(popoverBtn!);
    });

    // Then: popover should still be in document (click inside popover doesn't hide)
    const popoverAfterClick = container.querySelector('.hsn-selection-popover');
    expect(popoverAfterClick).toBeInTheDocument();
  });

  // S3 — persisted range popover hides during new text-selection drag
  it('S3.persisted-popover.hides-during-new-text-selection-drag', () => {
    // Given: render with persisted range and popover
    mockGeometry();
    const { container } = render(
      <Selection ranges={[percentRange()]} selectedRangeId="stored-percent" overlayRectType="percent" popover={<div data-testid="persisted-popover">Popover</div>}>
        {content()}
      </Selection>,
    );
    const host = selectionContainer(container);

    // Then: popover is in document with correct percent positioning
    const popoverBefore = container.querySelector('.hsn-selection-popover');
    expect(popoverBefore).toBeInTheDocument();
    expect(popoverBefore).toHaveStyle({ left: '20%', top: '10%' });

    // When: fire mouseDown on container outside active rect
    act(() => {
      fireEvent.mouseDown(host, { clientX: 180, clientY: 30 });
    });

    // Then: popover should hide during drag-select
    const popoverDuringDrag = container.querySelector('.hsn-selection-popover');
    expect(popoverDuringDrag).not.toBeInTheDocument();
  });
});
