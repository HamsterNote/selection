import { act, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../demo/src/App';

const CONTAINER_RECT = new DOMRect(0, 0, 400, 300);
const TEXT_RECT = new DOMRect(40, 30, 120, 24);

function makeDomRectList(rects: DOMRect[]): DOMRectList {
  const list: Partial<DOMRectList> & { [index: number]: DOMRect } = {};
  rects.forEach((rect, index) => {
    list[index] = rect;
  });
  Object.defineProperty(list, 'length', { value: rects.length });
  list.item = (index: number) => list[index];
  return list as DOMRectList;
}

function mockGeometry(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(CONTAINER_RECT);
  if (!('getClientRects' in Range.prototype)) {
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: vi.fn(),
    });
  }
  vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue(makeDomRectList([TEXT_RECT]));
}

function selectionContainer(host: HTMLElement, index: number): HTMLElement {
  const element = host.querySelectorAll('.hsn-selection-container')[index];
  if (element instanceof HTMLElement) return element;
  throw new TypeError(`Expected Selection container at index ${index}`);
}

function firstTextNode(container: HTMLElement): Text {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  const currentNode = walker.nextNode();
  if (currentNode instanceof Text) return currentNode;
  throw new TypeError('Expected a text node inside Selection container');
}

function installNativeSelection(container: HTMLElement): Selection {
  const range = document.createRange();
  const textNode = firstTextNode(container);
  range.setStart(textNode, 0);
  range.setEnd(textNode, Math.min(8, textNode.textContent?.length ?? 0));
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
    fireEvent.mouseUp(container, { clientX: 110, clientY: 42 });
  });
}

describe('Demo app selection mutual exclusion', () => {
  beforeEach(() => {
    mockGeometry();
  });

  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    vi.restoreAllMocks();
  });

  it('clicking linked and legacy text highlights keeps only the latest selected item', () => {
    const { container } = render(<App />);

    const showLegacyToggle = screen.getByLabelText(/显示 legacy 兼容面板/i);
    fireEvent.click(showLegacyToggle);

    const linkedContainer = selectionContainer(container, 0);
    selectText(linkedContainer);
    fireEvent.click(screen.getByRole('button', { name: '高亮选中（page-a）' }));

    const legacyContainer = selectionContainer(container, 2);
    selectText(legacyContainer);
    fireEvent.click(screen.getByRole('button', { name: '高亮选中（legacy）' }));

    const linkedHeading = screen.getByRole('heading', { name: /联动高亮（1）/i });
    const linkedList = linkedHeading.nextElementSibling;
    if (!(linkedList instanceof HTMLElement)) {
      throw new TypeError('Expected linked highlight list');
    }
    const linkedItemButton = within(linkedList).getByRole('button', { name: /「React/u });

    const legacyHeading = screen.getByRole('heading', { name: /Legacy 高亮（1）/i });
    const legacyList = legacyHeading.nextElementSibling;
    if (!(legacyList instanceof HTMLElement)) {
      throw new TypeError('Expected legacy highlight list');
    }
    const legacyItemButton = within(legacyList).getByRole('button', { name: /「此面板使用旧版/u });

    fireEvent.click(linkedItemButton);
    expect(within(linkedList).getByText('已选中')).toBeInTheDocument();
    expect(within(legacyList).queryByText('已选中')).not.toBeInTheDocument();

    fireEvent.click(legacyItemButton);
    expect(within(legacyList).getByText('已选中')).toBeInTheDocument();
    expect(within(linkedList).queryByText('已选中')).not.toBeInTheDocument();
  });
});
