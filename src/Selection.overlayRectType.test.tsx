/// <reference types="vitest/globals" />

import { fireEvent, render, act } from '@testing-library/react';
import { createRef } from 'react';
import { flushSync } from 'react-dom';
import { Selection } from './Selection';
import type { LinkedSelectionData, SelectionRange, SelectionRef } from './types';

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
});
