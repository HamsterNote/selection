/// <reference types="vitest/globals" />

import { act, fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import { flushSync } from 'react-dom';
import { Selection } from './Selection';
import type { HandleRenderProps, LinkedSelectionData, SelectionRange, SelectionRect, SelectionRef } from './types';

const CONTAINER_RECT = new DOMRect(0, 0, 400, 300);
const TEXT_RECT = new DOMRect(40, 30, 80, 24);

function makeDomRectList(rects: DOMRect[]): DOMRectList {
  const list: Partial<DOMRectList> & { [index: number]: DOMRect } = {};
  rects.forEach((rect, i) => {
    list[i] = rect;
  });
  Object.defineProperty(list, 'length', { value: rects.length });
  list.item = (i: number) => list[i];
  return list as DOMRectList;
}

function mockContainerGeometry(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(CONTAINER_RECT);
  if (!('getClientRects' in Range.prototype)) {
    Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: vi.fn() });
  }
  vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue(makeDomRectList([TEXT_RECT]));
}

function content(): React.ReactElement {
  return <p>Deterministic paragraph for rectangle drawing.</p>;
}

function selectionContainer(host: HTMLElement): HTMLElement {
  const element = host.querySelector('.hsn-selection-container');
  if (element instanceof HTMLElement) return element;
  throw new TypeError('Expected Selection container');
}

function firstTextNode(container: HTMLElement): Text {
  const paragraph = container.querySelector('p');
  const node = paragraph?.firstChild;
  if (node instanceof Text) return node;
  throw new TypeError('Expected paragraph text node');
}

function installNativeSelection(container: HTMLElement): Selection {
  const range = document.createRange();
  range.setStart(firstTextNode(container), 0);
  range.setEnd(firstTextNode(container), 13);
  const selection = document.getSelection();
  if (!selection) throw new TypeError('Expected document selection');
  selection.removeAllRanges();
  selection.addRange(range);
  if (vi.isMockFunction(window.getSelection)) {
    window.getSelection.mockReturnValue(selection);
    return selection;
  }
  vi.spyOn(window, 'getSelection').mockReturnValue(selection);
  return selection;
}

function selectText(container: HTMLElement): void {
  installNativeSelection(container);
  act(() => {
    fireEvent.mouseDown(container, { clientX: 40, clientY: 30 });
    document.dispatchEvent(new Event('selectionchange'));
    fireEvent.mouseUp(container, { clientX: 90, clientY: 42 });
    flushSync(() => {});
  });
}

function dragRect(container: HTMLElement): void {
  const pointerEvent = (type: string, clientX: number, clientY: number): Event => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    return event;
  };
  act(() => {
    container.dispatchEvent(pointerEvent('pointerdown', 40, 30));
    document.dispatchEvent(pointerEvent('pointermove', 120, 90));
    document.dispatchEvent(pointerEvent('pointerup', 120, 90));
  });
}

const mockPersistedPxRect: SelectionRect = {
  id: 'rect-1',
  createdAt: Date.now(),
  overlayRectType: 'px',
  start: { x: 50, y: 50 },
  end: { x: 150, y: 100 },
  rect: { x: 50, y: 50, width: 100, height: 50 },
};

const mockPersistedPercentRect: SelectionRect = {
  id: 'rect-2',
  createdAt: Date.now(),
  overlayRectType: 'percent',
  start: { x: 40, y: 30 },
  end: { x: 200, y: 150 },
  rect: { x: 10, y: 10, width: 40, height: 40 },
};

const mockTextRange: SelectionRange = {
  id: 'text-1',
  text: 'Deterministic',
  start: 0,
  end: 13,
  createdAt: 1000,
  overlayRectType: 'px',
  rects: [{ x: 40, y: 30, width: 80, height: 24 }],
};

describe('Selection text and rect tool compatibility', () => {
  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    vi.restoreAllMocks();
  });

  it.each([
    ['omitted', undefined],
    ['explicit text', 'text' as const],
  ])('selection.text-backcompat.%s-tool-keeps-text-highlight-and-drag', (_label, tool) => {
    // Given: legacy text callbacks and either omitted/default or explicit text tool.
    mockContainerGeometry();
    const ref = createRef<SelectionRef>();
    const onSelect = vi.fn();
    const onHighlight = vi.fn();
    const onSelectionStart = vi.fn();
    const onSelectionEnd = vi.fn();
    const onSelectRange = vi.fn();
    const { container } = render(
      <Selection
        ref={ref}
        ranges={[]}
        tool={tool}
        onSelect={onSelect}
        onHighlight={onHighlight}
        onSelectionStart={onSelectionStart}
        onSelectionEnd={onSelectionEnd}
        onSelectRange={onSelectRange}
      >
        {content()}
      </Selection>,
    );
    const host = selectionContainer(container);

    // When: the user drags a text selection and caller confirms through legacy highlight().
    selectText(host);
    act(() => {
      ref.current?.highlight();
    });

    // Then: text selection behavior remains intact.
    expect(onSelectionStart).toHaveBeenCalledTimes(1);
    expect(onSelectionEnd).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onHighlight).toHaveBeenCalledTimes(1);
    expect(onSelectRange).toHaveBeenCalledWith(onSelect.mock.lastCall?.[0].id);
  });

  it('selection.rect-mode.drag-isolated-from-text-callbacks', () => {
    // Given: rect mode with every text callback wired.
    mockContainerGeometry();
    const onSelectionStart = vi.fn();
    const onSelectionEnd = vi.fn();
    const onSelect = vi.fn();
    const onHighlight = vi.fn();
    const onUpdateRange = vi.fn();
    const { container } = render(
      <Selection
        ranges={[mockTextRange]}
        tool="rect"
        onSelectionStart={onSelectionStart}
        onSelectionEnd={onSelectionEnd}
        onSelect={onSelect}
        onHighlight={onHighlight}
        onUpdateRange={onUpdateRange}
      >
        {content()}
      </Selection>,
    );

    // When: user creates a rect draft.
    dragRect(selectionContainer(container));

    // Then: text selection lifecycle is untouched.
    expect(onSelectionStart).not.toHaveBeenCalled();
    expect(onSelectionEnd).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onHighlight).not.toHaveBeenCalled();
    expect(onUpdateRange).not.toHaveBeenCalled();
  });

  it('selection.tool-switch.text-to-rect-clears-active-text-and-popover', () => {
    // Given: an active text selection with selectionPopover is visible.
    mockContainerGeometry();
    const ref = createRef<SelectionRef>();
    const onSelect = vi.fn();
    const { container, rerender } = render(
      <Selection ref={ref} ranges={[]} tool="text" onSelect={onSelect} selectionPopover={<button type="button">Text Pop</button>}>
        {content()}
      </Selection>,
    );
    const host = selectionContainer(container);
    selectText(host);
    expect(container.querySelector('.hsn-selection-popover')).toBeInTheDocument();

    // When: caller switches to rect tool and later invokes legacy text highlight().
    rerender(
      <Selection ref={ref} ranges={[]} tool="rect" onSelect={onSelect} selectionPopover={<button type="button">Text Pop</button>}>
        {content()}
      </Selection>,
    );
    act(() => {
      ref.current?.highlight();
    });

    // Then: stale text state is gone and cannot be confirmed accidentally.
    expect(container.querySelector('.hsn-selection-popover')).not.toBeInTheDocument();
    expect(container.querySelector('svg rect.hsn-selection-rect--active')).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('selection.tool-switch.rect-to-text-clears-active-rect-draft', () => {
    // Given: rect mode has an active draft.
    mockContainerGeometry();
    const ref = createRef<SelectionRef>();
    const onCreateRect = vi.fn();
    const { container, rerender } = render(
      <Selection ref={ref} ranges={[]} tool="rect" onCreateRect={onCreateRect}>
        {content()}
      </Selection>,
    );
    dragRect(selectionContainer(container));
    expect(container.querySelector('svg rect.hsn-selection-rect--active')).toBeInTheDocument();

    // When: caller switches back to text and attempts rect confirmation.
    rerender(
      <Selection ref={ref} ranges={[]} tool="text" onCreateRect={onCreateRect}>
        {content()}
      </Selection>,
    );
    act(() => {
      ref.current?.confirmRect();
    });

    // Then: the old rect draft is removed and cannot be confirmed.
    expect(container.querySelector('svg rect.hsn-selection-rect--active')).not.toBeInTheDocument();
    expect(onCreateRect).not.toHaveBeenCalled();
  });

  it('selection.rect-start.clears-selected-text-range', () => {
    // Given: a text range is selected while entering rect mode.
    mockContainerGeometry();
    const onSelectRange = vi.fn();
    const { container } = render(
      <Selection ranges={[mockTextRange]} selectedRangeId="text-1" tool="rect" onSelectRange={onSelectRange}>
        {content()}
      </Selection>,
    );

    // When: rect drawing starts.
    act(() => {
      dispatchPointer(selectionContainer(container), 'pointerdown', 1, 40, 30);
    });

    // Then: selected text range is cleared immediately.
    expect(onSelectRange).toHaveBeenCalledWith(null);
  });

  it('selection.text-start.clears-selected-rect', () => {
    // Given: a rect is selected while text mode is active.
    mockContainerGeometry();
    const onSelectRect = vi.fn();
    const { container } = render(
      <Selection ranges={[]} tool="text" rects={[mockPersistedPxRect]} selectedRectId="rect-1" onSelectRect={onSelectRect}>
        {content()}
      </Selection>,
    );

    // When: a text drag begins.
    act(() => {
      fireEvent.mouseDown(selectionContainer(container), { clientX: 40, clientY: 30 });
    });

    // Then: selected rect is cleared immediately.
    expect(onSelectRect).toHaveBeenCalledWith(null);
  });

  it('selection.linked-rect.create-does-not-corrupt-linked-items', () => {
    // Given: linked mode contains one text item and rect tool is active.
    mockContainerGeometry();
    const ref = createRef<SelectionRef>();
    const onCreateRect = vi.fn();
    const onLinkedDataChange = vi.fn();
    const linkedData = {
      items: [
        {
          id: 'linked-text-1',
          text: 'Deterministic',
          start: { selectionId: 'page-a', offset: 0 },
          end: { selectionId: 'page-a', offset: 13 },
          createdAt: 1,
          overlayRectType: 'percent',
          rectsBySelectionId: { 'page-a': [{ x: 10, y: 10, width: 20, height: 8 }] },
        },
      ],
      selectedRangeId: null,
      selectionOrder: ['page-a'],
    } satisfies LinkedSelectionData;
    const originalLength = linkedData.items.length;
    const { container } = render(
      <Selection
        ref={ref}
        selectionId="page-a"
        linkedMode={true}
        linkedData={linkedData}
        onLinkedDataChange={onLinkedDataChange}
        ranges={[]}
        tool="rect"
        onCreateRect={onCreateRect}
      >
        {content()}
      </Selection>,
    );

    // When: user creates and confirms a rectangle.
    dragRect(selectionContainer(container));
    act(() => {
      ref.current?.confirmRect();
    });

    // Then: rect emits locally but linked text items are not appended or shape-corrupted.
    expect(onCreateRect).toHaveBeenCalledTimes(1);
    expect(linkedData.items).toHaveLength(originalLength);
    expect(linkedData.items).toEqual([
      expect.objectContaining({ id: 'linked-text-1', rectsBySelectionId: expect.any(Object) }),
    ]);
    expect(linkedData.items.some((item) => 'rect' in item || 'overlayRectType' in item && !('rectsBySelectionId' in item))).toBe(false);
    expect(onLinkedDataChange.mock.calls.every((call) => call[0]?.items?.length === originalLength)).toBe(true);
  });
});

describe('Selection rect tool active drawing', () => {

  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    vi.restoreAllMocks();
  });

  it('selection.rect-draft.drag-shows-active-rect-and-selection-popover', () => {
    // Given: rect tool with active selection popover.
    mockContainerGeometry();
    const { container } = render(
      <Selection ranges={[]} tool="rect" selectionPopover={<button type="button">Confirm</button>}>
        {content()}
      </Selection>,
    );
    const host = selectionContainer(container);

    // When: user drags a creatable rectangle.
    dragRect(host);

    // Then: the active rect stays visible and uses the existing selectionPopover path.
    const rect = container.querySelector('svg rect.hsn-selection-rect--active');
    expect(rect).toBeInTheDocument();
    expect(rect).toHaveAttribute('x', '40');
    expect(rect).toHaveAttribute('y', '30');
    expect(rect).toHaveAttribute('width', '80');
    expect(rect).toHaveAttribute('height', '60');
    expect(container.querySelector('.hsn-selection-popover')).toBeInTheDocument();
  });

  it('selection.rect-confirm.popover-button-ref-confirm-creates-rect-without-text-callbacks', () => {
    // Given: rect tool with callbacks for both rect and text surfaces.
    mockContainerGeometry();
    const ref = createRef<SelectionRef>();
    const onCreateRect = vi.fn();
    const onSelectRect = vi.fn();
    const onSelect = vi.fn();
    const onHighlight = vi.fn();
    const onSelectionStart = vi.fn();
    const onSelectionEnd = vi.fn();
    const { container } = render(
      <Selection
        ref={ref}
        ranges={[]}
        tool="rect"
        onCreateRect={onCreateRect}
        onSelectRect={onSelectRect}
        onSelect={onSelect}
        onHighlight={onHighlight}
        onSelectionStart={onSelectionStart}
        onSelectionEnd={onSelectionEnd}
        selectionPopover={
          <button type="button" data-testid="confirm-rect" onClick={() => ref.current?.confirm()}>
            Confirm
          </button>
        }
      >
        {content()}
      </Selection>,
    );
    const host = selectionContainer(container);
    dragRect(host);

    // When: caller uses the existing popover button to call ref.confirm().
    const button = container.querySelector('[data-testid="confirm-rect"]');
    if (!(button instanceof HTMLElement)) throw new TypeError('Expected confirm button');
    act(() => {
      fireEvent.click(button);
    });

    // Then: one SelectionRect is emitted, selected, and no text callbacks fire.
    expect(onCreateRect).toHaveBeenCalledTimes(1);
    const newRect = onCreateRect.mock.lastCall?.[0];
    expect(newRect).toMatchObject({
      overlayRectType: 'px',
      start: { x: 40, y: 30 },
      end: { x: 120, y: 90 },
      rect: { x: 40, y: 30, width: 80, height: 60 },
    });
    expect(onSelectRect).toHaveBeenCalledWith(newRect.id);
    expect(container.querySelector('svg rect.hsn-selection-rect--active')).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onHighlight).not.toHaveBeenCalled();
    expect(onSelectionStart).not.toHaveBeenCalled();
    expect(onSelectionEnd).not.toHaveBeenCalled();
  });

  it('selection.rect-confirm.confirmRect-confirms-active-rect', () => {
    // Given: active rect draft exists.
    mockContainerGeometry();
    const ref = createRef<SelectionRef>();
    const onCreateRect = vi.fn();
    const onSelectRect = vi.fn();
    const { container } = render(
      <Selection ref={ref} ranges={[]} tool="rect" onCreateRect={onCreateRect} onSelectRect={onSelectRect}>
        {content()}
      </Selection>,
    );
    dragRect(selectionContainer(container));

    // When: caller uses the rect-only convenience API.
    act(() => {
      ref.current?.confirmRect();
    });

    // Then: rect is created and selected.
    expect(onCreateRect).toHaveBeenCalledTimes(1);
    const newRect = onCreateRect.mock.lastCall?.[0];
    expect(onSelectRect).toHaveBeenCalledWith(newRect.id);
  });

  it('selection.rect-confirm.highlight-is-text-only-and-does-not-confirm-rects', () => {
    // Given: active rect draft exists.
    mockContainerGeometry();
    const ref = createRef<SelectionRef>();
    const onCreateRect = vi.fn();
    const { container } = render(
      <Selection ref={ref} ranges={[]} tool="rect" onCreateRect={onCreateRect}>
        {content()}
      </Selection>,
    );
    dragRect(selectionContainer(container));

    // When: caller invokes legacy text-only highlight().
    act(() => {
      ref.current?.highlight();
    });

    // Then: no rect is confirmed and the active draft remains available.
    expect(onCreateRect).not.toHaveBeenCalled();
    expect(container.querySelector('svg rect.hsn-selection-rect--active')).toBeInTheDocument();
  });
});

// jsdom's PointerEvent does not forward clientX/clientY through fireEvent;
// use MouseEvent with Object.defineProperty for pointerId (same as dragRect helper).
function dispatchPointer(target: EventTarget, type: string, pointerId: number, clientX: number, clientY: number): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  target.dispatchEvent(event);
}

describe('Selection rect tool handles', () => {
  beforeEach(() => {
    mockContainerGeometry();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const persistedRects: SelectionRect[] = [
    {
      id: 'rect-1',
      createdAt: 1000,
      start: { x: 50, y: 50 },
      end: { x: 150, y: 150 },
      rect: { x: 50, y: 50, width: 100, height: 100 },
      overlayRectType: 'px',
      selectionId: undefined,
    },
  ];

  it('renders handles for active drawing and persisted selected rect', () => {
    const renderHandle = vi.fn((props: HandleRenderProps) => {
      void props;
      return <div data-testid="custom-handle" />;
    });
    const { rerender, baseElement } = render(
      <Selection
        ranges={[]}
        tool="rect"
        rects={persistedRects}
        selectedRectId={undefined}
        renderHandle={renderHandle}
      >
        <div />
      </Selection>
    );

    // No active rect, no selected rect -> no handles
    expect(renderHandle).not.toHaveBeenCalled();

    // Select persisted rect -> 2 handles
    rerender(
      <Selection
        ranges={[]}
        tool="rect"
        rects={persistedRects}
        selectedRectId="rect-1"
        renderHandle={renderHandle}
      >
        <div />
      </Selection>
    );

    expect(renderHandle).toHaveBeenCalledTimes(2);
    expect(renderHandle).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'start',
        owner: 'persisted-range',
        target: 'rect',
        rectId: 'rect-1',
        position: { x: 50, y: 50 },
        positionUnit: 'px',
      })
    );
    expect(renderHandle).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'end',
        owner: 'persisted-range',
        target: 'rect',
        rectId: 'rect-1',
        position: { x: 150, y: 150 },
        positionUnit: 'px',
      })
    );

    renderHandle.mockClear();

    // Active drawing -> 2 handles
    const container = baseElement.querySelector('.hsn-selection-container')!;
    
    renderHandle.mockClear();
    
    rerender(
      <Selection
        ranges={[]}
        tool="rect"
        rects={persistedRects}
        selectedRectId={undefined}
        renderHandle={renderHandle}
      >
        <div />
      </Selection>
    );
    renderHandle.mockClear();
    
    act(() => {
      dispatchPointer(container, 'pointerdown', 1, 200, 200);
      dispatchPointer(document, 'pointermove', 1, 250, 280);
    });
    
    const calls = renderHandle.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    
    const startCall = calls[calls.length - 2];
    const endCall = calls[calls.length - 1];

    expect(startCall[0]).toEqual(
      expect.objectContaining({
        type: 'start',
        owner: 'active-selection',
        target: 'rect',
        rectId: null,
        position: { x: 200, y: 200 },
        positionUnit: 'px',
      })
    );
    expect(endCall[0]).toEqual(
      expect.objectContaining({
        type: 'end',
        owner: 'active-selection',
        target: 'rect',
        rectId: null,
        position: { x: 250, y: 280 },
        positionUnit: 'px',
      })
    );
  });

  it('drags rect handle to resize persisted rect', () => {
    const onUpdateRect = vi.fn();
    const onUpdateRange = vi.fn();
    const { baseElement } = render(
      <Selection
        ranges={[]}
        tool="rect"
        rects={persistedRects}
        selectedRectId="rect-1"
        onUpdateRect={onUpdateRect}
        onUpdateRange={onUpdateRange}
      >
        <div />
      </Selection>
    );

    const handles = baseElement.querySelectorAll('.hsn-selection-handle-rect');
    expect(handles.length).toBe(2);

    const endHandle = handles[1] as HTMLElement;
    act(() => {
      dispatchPointer(endHandle, 'pointerdown', 1, 150, 150);
      // Drag end handle from (150, 150) to (200, 200)
      dispatchPointer(document, 'pointermove', 1, 200, 200);
    });
    
    expect(onUpdateRect).toHaveBeenCalledTimes(1);
    expect(onUpdateRect).toHaveBeenCalledWith(expect.objectContaining({
      id: 'rect-1',
      start: { x: 50, y: 50 },
      end: { x: 200, y: 200 },
      rect: { x: 50, y: 50, width: 150, height: 150 },
    }));
    expect(onUpdateRange).not.toHaveBeenCalled();

    // Drag past the start anchor to invert
    act(() => {
      dispatchPointer(document, 'pointermove', 1, 30, 40);
    });
    expect(onUpdateRect).toHaveBeenCalledWith(expect.objectContaining({
      id: 'rect-1',
      start: { x: 50, y: 50 }, // start stays anchored
      end: { x: 30, y: 40 }, // end moved
      rect: { x: 30, y: 40, width: 20, height: 10 }, // normalized rect
    }));

    act(() => {
      dispatchPointer(document, 'pointerup', 1, 0, 0);
    });
  });

  it('drags active rect handle', () => {
    const { baseElement } = render(<Selection ranges={[]} tool="rect"><div /></Selection>);

    const container = baseElement.querySelector('.hsn-selection-container')!;
    
    Object.assign(window, { innerWidth: 1000, innerHeight: 1000 });
    
    act(() => {
      dispatchPointer(container, 'pointerdown', 1, 100, 100);
      dispatchPointer(document, 'pointermove', 1, 150, 150);
      dispatchPointer(document, 'pointerup', 1, 150, 150);
    });

    const handles = baseElement.querySelectorAll('.hsn-selection-handle-rect');
    expect(handles.length).toBe(2);

    const startHandle = handles[0] as HTMLElement;
    act(() => {
      dispatchPointer(startHandle, 'pointerdown', 2, 100, 100);
      dispatchPointer(document, 'pointermove', 2, 120, 110);
    });
    
    const activeRect = baseElement.querySelector('.hsn-selection-rect--active');
    expect(activeRect).toHaveAttribute('x', '120');
    expect(activeRect).toHaveAttribute('y', '110');
    expect(activeRect).toHaveAttribute('width', '30'); // 150 - 120
    expect(activeRect).toHaveAttribute('height', '40'); // 150 - 110
    
    act(() => {
      dispatchPointer(document, 'pointerup', 2, 0, 0);
    });
  });
});

describe('Selection rect tool persisted and hit-testing', () => {
  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    vi.restoreAllMocks();
  });

  it('selection.rect-persisted.px-renders-as-svg', () => {
    mockContainerGeometry();
    const { container } = render(
      <Selection ranges={[]} tool="rect" rects={[mockPersistedPxRect]} selectedRectId="rect-1">
        {content()}
      </Selection>,
    );

    const svgRect = container.querySelector('svg rect.hsn-selection-rect--selected');
    expect(svgRect).toBeInTheDocument();
    expect(svgRect).toHaveAttribute('data-rect-id', 'rect-1');
    expect(svgRect).toHaveAttribute('x', '50');
    expect(svgRect).toHaveAttribute('y', '50');
    expect(svgRect).toHaveAttribute('width', '100');
    expect(svgRect).toHaveAttribute('height', '50');
  });

  it('selection.rect-persisted.percent-renders-as-div', () => {
    mockContainerGeometry();
    const { container } = render(
      <Selection ranges={[]} tool="rect" overlayRectType="percent" rects={[mockPersistedPercentRect]} selectedRectId="rect-2">
        {content()}
      </Selection>,
    );

    const divRect = container.querySelector('.hsn-selection-percent-rect.hsn-selection-percent-rect-selected');
    if (!(divRect instanceof HTMLElement)) throw new TypeError('Expected percent rect element');
    expect(divRect).toBeInTheDocument();
    expect(divRect.style.left).toBe('10%');
    expect(divRect.style.top).toBe('10%');
    expect(divRect.style.width).toBe('40%');
    expect(divRect.style.height).toBe('40%');
  });

  it('selection.rect-active.percent-renders-as-div', () => {
    mockContainerGeometry();
    const { container } = render(
      <Selection ranges={[]} tool="rect" overlayRectType="percent">
        {content()}
      </Selection>,
    );
    dragRect(selectionContainer(container));

    const divRect = container.querySelector('.hsn-selection-percent-rect-active');
    if (!(divRect instanceof HTMLElement)) throw new TypeError('Expected active percent rect element');
    expect(divRect).toBeInTheDocument();
    expect(divRect.style.left).toBe('10%'); // 40 / 400
    expect(divRect.style.top).toBe('10%'); // 30 / 300
    expect(divRect.style.width).toBe('20%'); // 80 / 400
    expect(divRect.style.height).toBe('20%'); // 60 / 300
  });

  it('selection.rect-hit-test.selects-persisted-rect-and-toggles', () => {
    mockContainerGeometry();
    const onSelectRect = vi.fn();
    const { container, rerender } = render(
      <Selection ranges={[]} tool="rect" rects={[mockPersistedPxRect]} selectedRectId={null} onSelectRect={onSelectRect}>
        {content()}
      </Selection>,
    );

    const host = selectionContainer(container);
    
    act(() => {
      fireEvent.click(host, { clientX: 100, clientY: 75 });
    });

    expect(onSelectRect).toHaveBeenCalledWith('rect-1');

    rerender(
      <Selection ranges={[]} tool="rect" rects={[mockPersistedPxRect]} selectedRectId="rect-1" onSelectRect={onSelectRect}>
        {content()}
      </Selection>,
    );

    act(() => {
      fireEvent.click(host, { clientX: 100, clientY: 75 });
    });

    expect(onSelectRect).toHaveBeenCalledWith(null);
  });

  it('selection.rect-hit-test.outside-click-clears-selection', () => {
    mockContainerGeometry();
    const onSelectRect = vi.fn();
    const onSelectRange = vi.fn();
    const { container } = render(
      <Selection ranges={[]} tool="rect" rects={[mockPersistedPxRect]} selectedRectId="rect-1" onSelectRect={onSelectRect} onSelectRange={onSelectRange}>
        {content()}
      </Selection>,
    );

    const host = selectionContainer(container);
    
    act(() => {
      fireEvent.click(host, { clientX: 300, clientY: 200 });
    });

    expect(onSelectRect).toHaveBeenCalledWith(null);
    expect(onSelectRange).toHaveBeenCalledWith(null);
  });

  it('selection.rect-popover.anchors-top-center', () => {
    mockContainerGeometry();
    const { container } = render(
      <Selection ranges={[]} tool="rect" rects={[mockPersistedPxRect]} selectedRectId="rect-1" popover={<div>Pop</div>}>
        {content()}
      </Selection>,
    );

    const popover = container.querySelector('.hsn-selection-popover');
    if (!(popover instanceof HTMLElement)) throw new TypeError('Expected popover element');
    
    expect(popover.style.left).toBe('100px'); // 50 + 100/2
    expect(popover.style.top).toBe('50px');
  });

  it('selection.rect-popover.click-protection', () => {
    mockContainerGeometry();
    const onSelectRect = vi.fn();
    const { container } = render(
      <Selection ranges={[]} tool="rect" rects={[mockPersistedPxRect]} selectedRectId="rect-1" onSelectRect={onSelectRect} popover={<button type="button" data-testid="pop-btn">Pop</button>}>
        {content()}
      </Selection>,
    );

    const popBtn = container.querySelector('[data-testid="pop-btn"]');
    if (!(popBtn instanceof HTMLElement)) throw new TypeError('Expected popover button');
    
    act(() => {
      fireEvent.click(popBtn);
    });

    expect(onSelectRect).not.toHaveBeenCalled();
  });

  it('creates percent rects with % start/end values and correctly formatted rects', () => {
    mockContainerGeometry();

    const onCreateRect = vi.fn();
    const ref = createRef<SelectionRef>();
    const { container } = render(
      <Selection
        ref={ref}
        overlayRectType="percent"
        tool="rect"
        onCreateRect={onCreateRect}
        rects={[]}
        ranges={[]}
      >
        <div />
      </Selection>
    );

    const host = selectionContainer(container);
    dragRect(host);
    
    const activeDivs = container.querySelectorAll('.hsn-selection-percent-rect-active');
    expect(activeDivs.length).toBe(1); 
    
    const div = activeDivs[0] as HTMLElement;
    expect(div.style.left).toBe('10%');
    expect(div.style.top).toBe('10%');

    act(() => {
      ref.current?.confirmRect();
    });

    expect(onCreateRect).toHaveBeenCalledTimes(1);
    const rect = onCreateRect.mock.calls[0][0] as SelectionRect;
    
    expect(rect.overlayRectType).toBe('percent');
    expect(rect.start).toEqual({ x: 10, y: 10 });
    expect(rect.end).toEqual({ x: 30, y: 30 });
  });

  it('selection.rect-hit-test.mutual-exclusion-with-text-range', () => {
    mockContainerGeometry();
    const onSelectRect = vi.fn();
    const onSelectRange = vi.fn();
    
    const textRange = {
      id: 'text-1',
      text: 'Deterministic',
      start: 0,
      end: 13,
      createdAt: Date.now(),
      overlayRectType: 'px' as const,
      rects: [{ x: 10, y: 10, width: 20, height: 20 }],
    };

    const { container, rerender } = render(
      <Selection ranges={[textRange]} tool="text" rects={[mockPersistedPxRect]} selectedRectId="rect-1" onSelectRect={onSelectRect} onSelectRange={onSelectRange}>
        {content()}
      </Selection>,
    );

    const host = selectionContainer(container);
    
    act(() => {
      fireEvent.click(host, { clientX: 20, clientY: 20 });
    });

    expect(onSelectRange).toHaveBeenCalledWith('text-1');
    expect(onSelectRect).toHaveBeenCalledWith(null);

    vi.clearAllMocks();

    rerender(
      <Selection ranges={[textRange]} selectedRangeId="text-1" tool="text" rects={[mockPersistedPxRect]} selectedRectId={null} onSelectRect={onSelectRect} onSelectRange={onSelectRange}>
        {content()}
      </Selection>,
    );

    act(() => {
      fireEvent.click(host, { clientX: 100, clientY: 75 });
    });

    expect(onSelectRect).toHaveBeenCalledWith('rect-1');
    expect(onSelectRange).toHaveBeenCalledWith(null);
  });
});
