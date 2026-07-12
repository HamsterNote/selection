import type { LinkedSelectionData, SelectionEndpoint } from './types';

export type RegisteredLinkedContainer = {
  readonly selectionId: string;
  readonly element: HTMLElement;
};

const linkedContainers = new Map<string, HTMLElement>();

function isDev(): boolean {
  return import.meta.env.DEV;
}

function warnDuplicateSelectionId(selectionId: string): void {
  if (!isDev()) return;
  console.warn(
    `Duplicate linked Selection selectionId "${selectionId}" detected. The later container is ignored.`,
  );
}

function compareContainers(a: RegisteredLinkedContainer, b: RegisteredLinkedContainer): number {
  if (a.element === b.element) return 0;
  const position = a.element.compareDocumentPosition(b.element);
  if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  return 0;
}

function getPlainTextOffset(container: HTMLElement, node: Node, offset: number): number | null {
  if (!container.contains(node)) return null;
  const range = document.createRange();
  range.selectNodeContents(container);
  try {
    range.setEnd(node, offset);
  } catch (error) {
    if (error instanceof Error) return null;
    throw error;
  }
  return range.toString().length;
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

export function registerLinkedContainer(selectionId: string, element: HTMLElement): () => void {
  const existing = linkedContainers.get(selectionId);
  if (existing && existing !== element) {
    warnDuplicateSelectionId(selectionId);
    return () => undefined;
  }

  linkedContainers.set(selectionId, element);
  return () => {
    if (linkedContainers.get(selectionId) === element) {
      linkedContainers.delete(selectionId);
    }
  };
}

export function getRegisteredContainers(): RegisteredLinkedContainer[] {
  return Array.from(linkedContainers, ([selectionId, element]) => ({
    selectionId,
    element,
  })).sort(compareContainers);
}

export function resolveEndpoint(node: Node, offset: number): SelectionEndpoint | null {
  for (const entry of getRegisteredContainers()) {
    const localOffset = getPlainTextOffset(entry.element, node, offset);
    if (localOffset === null) continue;
    return { selectionId: entry.selectionId, offset: localOffset };
  }
  return null;
}

export function syncSelectionOrder(
  data: LinkedSelectionData | undefined,
  order: readonly string[],
  onChange: ((next: LinkedSelectionData) => void) | undefined,
): void {
  if (!data || !onChange) return;
  if (arraysEqual(data.selectionOrder, order)) return;
  onChange({ ...data, selectionOrder: [...order] });
}
