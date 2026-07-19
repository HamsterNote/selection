/// <reference types="vitest/globals" />

import { fireEvent, render, act } from '@testing-library/react';
import { createRef } from 'react';
import { flushSync } from 'react-dom';
import { Selection } from './Selection';
import type { LinkedSelectionData, SelectionRange, SelectionRef, HandleRenderProps } from './types';

type LinkedItemWithRectType = LinkedSelectionData['items'][number] & {
  readonly overlayRectType?: 'px' | 'percent';
};

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
  if (vi.isMockFunction(window.getSelection)) {
    window.getSelection.mockReturnValue(selection);
    return;
  }
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

function stubCoarsePointer(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(pointer: coarse)',
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
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
  return {
    id,
    text: 'Deterministic',
    start: 0,
    end: 12,
    createdAt: 1,
    overlayRectType: 'percent',
    rects: [{ x: 10, y: 10, width: 20, height: 8 }],
  };
}

function pxRange(): SelectionRange {
  return {
    id: 'stored-px',
    text: 'Deterministic',
    start: 0,
    end: 12,
    createdAt: 1,
    overlayRectType: 'px',
    rects: [{ x: 40, y: 30, width: 80, height: 24 }],
  };
}

describe('Selection overlayRectType', () => {
  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('selection.linked-percent.stores-percent-and-renders-divs', () => {
    // Given / When / Then: linked percent selection stores 0-100 rects and renders divs.
    mockGeometry();
    const ref = createRef<SelectionRef>();
    const onLinkedDataChange = vi.fn();
    const linkedData: LinkedSelectionData = {
      items: [],
      selectedRangeId: null,
      selectionOrder: [],
    };
    const { container, rerender } = render(
      <Selection
        ref={ref}
        selectionId="page-a"
        linkedMode={true}
        linkedData={linkedData}
        onLinkedDataChange={onLinkedDataChange}
        overlayRectType="percent"
        ranges={[]}
      >
        {content()}
      </Selection>,
    );

    selectAndHighlight(container, ref);

    const nextData = linkedHighlight(onLinkedDataChange);
    const item = linkedItem(nextData);
    expect(item.overlayRectType).toBe('percent');
    expect(item.rectsBySelectionId['page-a']).toEqual([{ x: 10, y: 10, width: 20, height: 8 }]);
    rerender(
      <Selection
        selectionId="page-a"
        linkedMode={true}
        linkedData={nextData}
        onLinkedDataChange={onLinkedDataChange}
        overlayRectType="percent"
        ranges={[]}
      >
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
    const linkedData: LinkedSelectionData = {
      items: [],
      selectedRangeId: null,
      selectionOrder: [],
    };
    const { container } = render(
      <Selection
        ref={ref}
        selectionId="page-a"
        linkedMode={true}
        linkedData={linkedData}
        onLinkedDataChange={onLinkedDataChange}
        ranges={[]}
      >
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
    const { container } = render(
      <Selection ref={ref} ranges={[]} onSelect={onSelect} overlayRectType="px">
        {content()}
      </Selection>,
    );

    selectAndHighlight(container, ref);

    const range = selectedRange(onSelect);
    expect(range.overlayRectType).toBe('px');
    expect(range.rects).toEqual([{ x: 40, y: 30, width: 80, height: 24 }]);
    render(
      <Selection ranges={[range]} selectedRangeId={range.id} overlayRectType="px">
        {content()}
      </Selection>,
    );
    expect(document.querySelectorAll('svg rect[data-range-id]')).toHaveLength(1);
  });

  it('selection.legacy-percent.stores-percent-and-renders-divs', () => {
    // Given / When / Then: legacy percent selection emits percent rects and renders divs.
    mockGeometry();
    const ref = createRef<SelectionRef>();
    const onSelect = vi.fn();
    const { container } = render(
      <Selection ref={ref} ranges={[]} onSelect={onSelect} overlayRectType="percent">
        {content()}
      </Selection>,
    );

    selectAndHighlight(container, ref);

    const range = selectedRange(onSelect);
    expect(range.overlayRectType).toBe('percent');
    expect(range.rects).toEqual([{ x: 10, y: 10, width: 20, height: 8 }]);
    render(
      <Selection ranges={[range]} selectedRangeId={range.id} overlayRectType="percent">
        {content()}
      </Selection>,
    );
    expect(document.querySelectorAll('.hsn-selection-percent-rect')).toHaveLength(1);
    expect(document.querySelectorAll('svg rect[data-range-id]')).toHaveLength(0);
  });

  it('selection.percent-resize.divs-use-percent-styles', () => {
    // Given / When / Then: percent rect rendering keeps CSS percentages after resize.
    mockGeometry(new DOMRect(80, 60, 160, 48));
    const { container } = render(
      <Selection
        ranges={[percentRange()]}
        selectedRangeId="stored-percent"
        overlayRectType="percent"
      >
        {content()}
      </Selection>,
    );

    expect(container.querySelectorAll('.hsn-selection-percent-rect')).toHaveLength(1);
    expect(container.querySelector('.hsn-selection-percent-rect')).toHaveStyle({
      left: '10%',
      top: '10%',
      width: '20%',
      height: '8%',
    });
  });

  it('selection.linked-backcompat.missing-type-renders-percent-divs', () => {
    // Given / When / Then: linked data without overlayRectType defaults to percent divs.
    mockGeometry();
    const linkedData = {
      items: [
        {
          id: 'legacy-linked',
          text: 'Deterministic',
          start: { selectionId: 'page-a', offset: 0 },
          end: { selectionId: 'page-a', offset: 12 },
          createdAt: 1,
          rectsBySelectionId: { 'page-a': [{ x: 10, y: 10, width: 20, height: 8 }] },
        },
      ],
      selectedRangeId: 'legacy-linked',
      selectionOrder: ['page-a'],
    } satisfies LinkedSelectionData;
    const { container } = render(
      <Selection selectionId="page-a" linkedMode={true} linkedData={linkedData} ranges={[]}>
        {content()}
      </Selection>,
    );

    expect(container.querySelectorAll('.hsn-selection-percent-rect')).toHaveLength(1);
    expect(container.querySelectorAll('svg rect[data-range-id="legacy-linked"]')).toHaveLength(0);
  });

  it('selection.mode-toggle.switches-rendering-surface', () => {
    // Given / When / Then: rerender switches the persistent overlay surface by rect type.
    mockGeometry();
    const { container, rerender } = render(
      <Selection ranges={[pxRange()]} selectedRangeId="stored-px" overlayRectType="px">
        {content()}
      </Selection>,
    );
    expect(container.querySelectorAll('svg rect[data-range-id="stored-px"]')).toHaveLength(1);

    rerender(
      <Selection
        ranges={[percentRange()]}
        selectedRangeId="stored-percent"
        overlayRectType="percent"
      >
        {content()}
      </Selection>,
    );

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
      <Selection
        ranges={[]}
        overlayRectType="percent"
        selectionPopover={<div data-testid="active-popover">Active</div>}
      >
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

  it('S1.active-popover.stays-hidden-when-reselecting-before-mouseup', () => {
    // Given: an active native selection already shows its selectionPopover.
    mockGeometry();
    const originalAddEventListener = document.addEventListener.bind(document);
    const selectionChangeRef: { current: EventListener | null } = { current: null };
    vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
      if (type === 'selectionchange' && typeof listener === 'function') {
        selectionChangeRef.current = listener;
      }
      originalAddEventListener(type, listener, options);
    });
    const { container } = render(
      <Selection
        ranges={[]}
        overlayRectType="percent"
        selectionPopover={<div data-testid="active-popover">Active</div>}
      >
        {content()}
      </Selection>,
    );
    const host = selectionContainer(container);
    const handleSelectionChange = selectionChangeRef.current;
    if (!handleSelectionChange) throw new TypeError('Expected selectionchange listener');
    installNativeSelection(host);
    act(() => {
      fireEvent.mouseDown(host, { clientX: 40, clientY: 30 });
      handleSelectionChange(new Event('selectionchange'));
      fireEvent.mouseUp(document, { target: host, clientX: 90, clientY: 42 });
      flushSync(() => {});
    });
    expect(container.querySelector('.hsn-selection-popover')).toBeInTheDocument();

    // When: the user starts a second drag without clearing the first selection.
    // Browsers first clear the previous selection, then emit a new non-empty selectionchange while the mouse is still down.
    const getSelection = window.getSelection;
    if (!vi.isMockFunction(getSelection)) throw new TypeError('Expected mocked getSelection');
    act(() => {
      fireEvent.mouseDown(host, { clientX: 180, clientY: 30 });
      getSelection.mockReturnValue(null);
      handleSelectionChange(new Event('selectionchange'));
      flushSync(() => {});
    });
    expect(container.querySelector('.hsn-selection-popover')).not.toBeInTheDocument();

    act(() => {
      installNativeSelection(host);
      handleSelectionChange(new Event('selectionchange'));
      flushSync(() => {});
    });

    // Then: the active selectionPopover remains hidden until mouseup commits the current drag.
    expect(container.querySelector('.hsn-selection-popover')).not.toBeInTheDocument();

    act(() => {
      fireEvent.mouseUp(document, { target: host, clientX: 200, clientY: 40 });
      flushSync(() => {});
    });
    expect(container.querySelector('.hsn-selection-popover')).toBeInTheDocument();
  });

  // S2 — clicking inside selectionPopover does not hide it
  it('S2.active-popover.clicking-inside-popover-does-not-hide', () => {
    // Given: render with selectionPopover as a button, establish active selection
    mockGeometry();
    const { container } = render(
      <Selection
        ranges={[]}
        overlayRectType="percent"
        selectionPopover={
          <button type="button" data-testid="active-popover-btn">
            Action
          </button>
        }
      >
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
      <Selection
        ranges={[percentRange()]}
        selectedRangeId="stored-percent"
        overlayRectType="percent"
        popover={<div data-testid="persisted-popover">Popover</div>}
      >
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

  it('selection.persisted-popover.button-clicks-after-mousedown', () => {
    // Given: persisted popover contains a delete/action button.
    mockGeometry();
    const onDelete = vi.fn();
    const { container } = render(
      <Selection
        ranges={[percentRange()]}
        selectedRangeId="stored-percent"
        overlayRectType="percent"
        popover={
          <button type="button" data-testid="delete-popover" onClick={onDelete}>
            Delete
          </button>
        }
      >
        {content()}
      </Selection>,
    );
    const button = container.querySelector('[data-testid="delete-popover"]');
    if (!(button instanceof HTMLElement)) throw new TypeError('Expected persisted popover button');

    // When: pointer interaction begins inside the popover before the click fires.
    act(() => {
      fireEvent.mouseDown(button);
      fireEvent.click(button);
    });

    // Then: container mousedown does not unmount the popover before the button click.
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="delete-popover"]')).toBeInTheDocument();
  });

  it('selection.linked-persisted-popover.renders-only-in-start-container', () => {
    // Given: one linked persisted range spans page-a to page-b.
    mockGeometry();
    const linkedData = {
      items: [
        {
          id: 'linked-cross-page',
          text: 'Deterministic paragraph one.Deterministic paragraph one.',
          start: { selectionId: 'page-a', offset: 0 },
          end: { selectionId: 'page-b', offset: 12 },
          createdAt: 1,
          overlayRectType: 'percent',
          rectsBySelectionId: {
            'page-a': [{ x: 10, y: 10, width: 20, height: 8 }],
            'page-b': [{ x: 10, y: 10, width: 20, height: 8 }],
          },
        },
      ],
      selectedRangeId: 'linked-cross-page',
      selectionOrder: ['page-a', 'page-b'],
    } satisfies LinkedSelectionData;

    // When: both linked containers render the same selected linked data.
    const { container } = render(
      <>
        <Selection
          selectionId="page-a"
          linkedMode={true}
          linkedData={linkedData}
          ranges={[]}
          popover={<div data-testid="persisted-popover">A</div>}
        >
          {content()}
        </Selection>
        <Selection
          selectionId="page-b"
          linkedMode={true}
          linkedData={linkedData}
          ranges={[]}
          popover={<div data-testid="persisted-popover">B</div>}
        >
          {content()}
        </Selection>
      </>,
    );

    // Then: only the start container owns the shared persisted popover.
    const popovers = container.querySelectorAll('[data-testid="persisted-popover"]');
    expect(popovers).toHaveLength(1);
    expect(popovers[0]).toHaveTextContent('A');
  });

  it('selection.linked-active-range.renders-both-overlays-and-one-popover', () => {
    // Given: shared mobile active range spans page-a to page-b before highlight confirmation.
    mockGeometry();
    const linkedData = {
      items: [],
      selectedRangeId: null,
      selectionOrder: ['page-a', 'page-b'],
      activeRange: {
        id: 'active-cross-page',
        text: 'Deterministic paragraph one.Deterministic paragraph one.',
        start: { selectionId: 'page-a', offset: 0 },
        end: { selectionId: 'page-b', offset: 12 },
        createdAt: 1,
        overlayRectType: 'percent',
        rectsBySelectionId: {
          'page-a': [{ x: 10, y: 10, width: 20, height: 8 }],
          'page-b': [{ x: 10, y: 10, width: 20, height: 8 }],
        },
      },
    } satisfies LinkedSelectionData;

    // When: both linked containers render the shared active range.
    const { container } = render(
      <>
        <Selection
          selectionId="page-a"
          linkedMode={true}
          linkedData={linkedData}
          ranges={[]}
          selectionPopover={<div data-testid="active-popover">A</div>}
        >
          {content()}
        </Selection>
        <Selection
          selectionId="page-b"
          linkedMode={true}
          linkedData={linkedData}
          ranges={[]}
          selectionPopover={<div data-testid="active-popover">B</div>}
        >
          {content()}
        </Selection>
      </>,
    );

    // Then: both pages draw active overlay rects, but only the start page owns the popover.
    expect(container.querySelectorAll('.hsn-selection-percent-rect')).toHaveLength(2);
    const popovers = container.querySelectorAll('[data-testid="active-popover"]');
    expect(popovers).toHaveLength(1);
    expect(popovers[0]).toHaveTextContent('A');
  });

  it('selection.linked-active-range.blank-click-clears-after-unconsumed-selection-click-skip', () => {
    // Given: a cross-page active range is visible, and a previous valid mouseup left no matching click behind.
    mockGeometry();
    const onChange = vi.fn();
    const linkedData = {
      items: [],
      selectedRangeId: null,
      selectionOrder: ['page-a', 'page-b'],
      activeRange: {
        id: 'active-cross-page',
        text: 'Deterministic paragraph one.Deterministic paragraph one.',
        start: { selectionId: 'page-a', offset: 0 },
        end: { selectionId: 'page-b', offset: 12 },
        createdAt: 1,
        overlayRectType: 'percent',
        rectsBySelectionId: {
          'page-a': [{ x: 10, y: 10, width: 20, height: 8 }],
          'page-b': [{ x: 10, y: 10, width: 20, height: 8 }],
        },
      },
    } satisfies LinkedSelectionData;

    const { container } = render(
      <Selection
        selectionId="page-a"
        linkedMode={true}
        linkedData={linkedData}
        ranges={[]}
        onLinkedDataChange={onChange}
        selectionPopover={<div data-testid="active-popover">A</div>}
      >
        {content()}
      </Selection>,
    );
    const host = selectionContainer(container);
    installNativeSelection(host);

    act(() => {
      fireEvent.mouseUp(host, { clientX: 90, clientY: 42 });
      fireEvent.click(host, { clientX: 200, clientY: 120 });
    });

    // Then: the first later blank click is not swallowed by the stale skip marker.
    const finalData = onChange.mock.lastCall?.[0];
    expect(finalData?.activeRange).toBeNull();
  });

  it('selection.linked-active-range.highlight-keeps-appended-item-in-final-update', () => {
    // Given: linked mobile active range is already shared before confirmation.
    mockGeometry();
    const ref = createRef<SelectionRef>();
    const onChange = vi.fn();
    const activeRange = {
      id: 'active-same-page',
      text: 'Deterministic',
      start: { selectionId: 'page-a', offset: 0 },
      end: { selectionId: 'page-a', offset: 12 },
      createdAt: 1,
      overlayRectType: 'percent',
      rectsBySelectionId: {
        'page-a': [{ x: 10, y: 10, width: 20, height: 8 }],
      },
    } satisfies LinkedSelectionData['activeRange'];
    const linkedData = {
      items: [],
      selectedRangeId: null,
      selectionOrder: ['page-a'],
      activeRange,
    } satisfies LinkedSelectionData;

    render(
      <Selection
        ref={ref}
        selectionId="page-a"
        linkedMode={true}
        linkedData={linkedData}
        ranges={[]}
        onLinkedDataChange={onChange}
      >
        {content()}
      </Selection>,
    );

    // When: caller confirms the active linked selection.
    act(() => {
      ref.current?.highlight();
    });

    // Then: the final controlled update keeps the appended item and clears activeRange once.
    const finalData = onChange.mock.lastCall?.[0];
    expect(finalData?.items).toHaveLength(1);
    expect(finalData?.items[0]?.id).toBe('active-same-page');
    expect(finalData?.selectedRangeId).toBe('active-same-page');
    expect(finalData?.activeRange).toBeNull();
  });

  it('selection.mobile-linked-range.publishes-active-range-without-native-selection', () => {
    // Given: coarse-pointer long press resolves a word through setFromRange,
    // while the browser-native Selection remains collapsed and empty.
    vi.useFakeTimers();
    try {
      mockGeometry();
      stubCoarsePointer();
      const onChange = vi.fn();
      const linkedData = {
        items: [],
        selectedRangeId: null,
        selectionOrder: ['page-a'],
        activeRange: null,
      } satisfies LinkedSelectionData;
      const { container } = render(
        <Selection
          selectionId="page-a"
          linkedMode={true}
          linkedData={linkedData}
          ranges={[]}
          onLinkedDataChange={onChange}
        >
          {content()}
        </Selection>,
      );
      const host = selectionContainer(container);
      const paragraph = container.querySelector('[data-testid="first-paragraph"]');
      if (!paragraph) throw new TypeError('Expected first paragraph fixture');
      const textNode = textNodeFrom(paragraph);
      const caretRange = document.createRange();
      caretRange.setStart(textNode, 5);
      caretRange.collapse(true);
      Object.defineProperty(document, 'caretRangeFromPoint', {
        configurable: true,
        value: vi.fn(() => caretRange),
      });
      document.getSelection()?.removeAllRanges();

      // When: the mobile long-press timer selects a word without creating a
      // browser-native Selection.
      act(() => {
        fireEvent.touchStart(host, { touches: [{ clientX: 80, clientY: 42 }] });
        vi.advanceTimersByTime(450);
      });

      // Then: linked consumers still receive the complete active range needed
      // by an external popover's confirm action.
      const activeUpdate = onChange.mock.calls
        .map((call) => call[0] as LinkedSelectionData)
        .find((data) => data.activeRange !== null);
      expect(document.getSelection()?.toString()).toBe('');
      expect(activeUpdate?.activeRange).toMatchObject({
        text: 'Deterministic',
        start: { selectionId: 'page-a', offset: 0 },
        end: { selectionId: 'page-a', offset: 13 },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('selection.mobile-active-selection.tap-inside-container-clears', () => {
    // Given: coarse pointer device with an active selection shown inside the component.
    mockGeometry();
    stubCoarsePointer();
    const { container } = render(
      <Selection
        ranges={[]}
        overlayRectType="percent"
        selectionPopover={<div data-testid="active-popover">Active</div>}
      >
        {content()}
      </Selection>,
    );
    const host = selectionContainer(container);
    selectOnly(container);
    expect(container.querySelector('[data-testid="active-popover"]')).toBeInTheDocument();

    // When: user performs a quick tap inside Selection, not on handles or popovers.
    act(() => {
      fireEvent.touchStart(host, { touches: [{ clientX: 160, clientY: 80 }] });
      fireEvent.touchEnd(host);
    });

    // Then: mobile active selection is cleared from inside the component.
    expect(container.querySelector('[data-testid="active-popover"]')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.hsn-selection-handle')).toHaveLength(0);
  });

  it('selection.mobile-active-selection.two-finger-touch-preserves-selection', () => {
    // Given: coarse pointer device with an active selection shown inside the component.
    mockGeometry();
    stubCoarsePointer();
    const { container } = render(
      <Selection
        ranges={[]}
        overlayRectType="percent"
        selectionPopover={<div data-testid="active-popover">Active</div>}
      >
        {content()}
      </Selection>,
    );
    const host = selectionContainer(container);
    selectOnly(container);

    // When: user performs a two-finger gesture, then the browser emits its synthetic click.
    act(() => {
      fireEvent.touchStart(host, {
        touches: [
          { clientX: 160, clientY: 80 },
          { clientX: 180, clientY: 100 },
        ],
      });
      fireEvent.touchEnd(host, { changedTouches: [{ clientX: 180, clientY: 100 }] });
      fireEvent.click(host, { clientX: 180, clientY: 100 });
    });

    // Then: pinch/zoom-style non-single-finger touch does not cancel the active selection.
    expect(container.querySelector('[data-testid="active-popover"]')).toBeInTheDocument();
    expect(container.querySelectorAll('.hsn-selection-handle')).toHaveLength(2);
  });

  it('selection.mobile-active-selection.single-finger-drag-preserves-selection', () => {
    // Given: coarse pointer device with an active selection shown inside the component.
    mockGeometry();
    stubCoarsePointer();
    const { container } = render(
      <Selection
        ranges={[]}
        overlayRectType="percent"
        selectionPopover={<div data-testid="active-popover">Active</div>}
      >
        {content()}
      </Selection>,
    );
    const host = selectionContainer(container);
    selectOnly(container);

    // When: user drags with one finger, then the browser emits its synthetic click.
    act(() => {
      fireEvent.touchStart(host, { touches: [{ clientX: 160, clientY: 80 }] });
      fireEvent.touchMove(host, { touches: [{ clientX: 190, clientY: 110 }] });
      fireEvent.touchEnd(host, { changedTouches: [{ clientX: 190, clientY: 110 }] });
      fireEvent.click(host, { clientX: 190, clientY: 110 });
    });

    // Then: movement is treated as drag/scroll intent, not as a tap-to-clear action.
    expect(container.querySelector('[data-testid="active-popover"]')).toBeInTheDocument();
    expect(container.querySelectorAll('.hsn-selection-handle')).toHaveLength(2);
  });
});
