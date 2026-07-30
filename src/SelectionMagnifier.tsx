import { forwardRef, memo, useCallback, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const LENS_SIZE = 120;
const LENS_SCALE = 2;
const VIEWPORT_GAP = 18;
const VIEWPORT_EDGE_GAP = 8;

export type SelectionMagnifierPoint = {
  readonly x: number;
  readonly y: number;
};

export type SelectionMagnifierTarget = {
  readonly point: SelectionMagnifierPoint;
  readonly source: HTMLDivElement;
};

type SelectionMagnifierProps = {
  readonly point: SelectionMagnifierPoint;
  readonly source: HTMLDivElement;
};

export type SelectionMagnifierHandle = {
  readonly source: HTMLDivElement;
  readonly moveLens: (point: SelectionMagnifierPoint) => void;
};

type MagnifierElements = {
  readonly lens: HTMLDivElement;
  readonly snapshot: HTMLDivElement;
  readonly point: SelectionMagnifierPoint;
  readonly sourceRect: DOMRect;
};

function getLensTransform(point: SelectionMagnifierPoint): string {
  const preferredTop = point.y - LENS_SIZE - VIEWPORT_GAP;
  const top =
    preferredTop >= VIEWPORT_EDGE_GAP
      ? preferredTop
      : Math.min(window.innerHeight - LENS_SIZE - VIEWPORT_EDGE_GAP, point.y + VIEWPORT_GAP);
  const left = Math.min(
    window.innerWidth - LENS_SIZE - VIEWPORT_EDGE_GAP,
    Math.max(VIEWPORT_EDGE_GAP, point.x - LENS_SIZE / 2),
  );
  return `translate3d(${left}px, ${top}px, 0)`;
}

function applyPoint({ lens, snapshot, point, sourceRect }: MagnifierElements): void {
  lens.style.transform = getLensTransform(point);
  snapshot.style.transform = `translate3d(${LENS_SIZE / 2 - (point.x - sourceRect.left) * LENS_SCALE}px, ${LENS_SIZE / 2 - (point.y - sourceRect.top) * LENS_SCALE}px, 0) scale(${LENS_SCALE})`;
}

const SelectionMagnifierComponent = forwardRef<SelectionMagnifierHandle, SelectionMagnifierProps>(
  function SelectionMagnifier({ point, source }, ref): React.ReactElement {
    const lensRef = useRef<HTMLDivElement>(null);
    const snapshotRef = useRef<HTMLDivElement>(null);
    const measuredSourceRef = useRef<HTMLDivElement | null>(null);
    const sourceRectRef = useRef<DOMRect | null>(null);
    const isSourceGeometryDirtyRef = useRef(false);

    const captureSnapshot = useCallback((): void => {
      const snapshot = snapshotRef.current;
      if (!snapshot) return;

      const sourceRect = source.getBoundingClientRect();
      measuredSourceRef.current = source;
      sourceRectRef.current = sourceRect;
      isSourceGeometryDirtyRef.current = false;

      const clone = source.cloneNode(true);
      if (!(clone instanceof HTMLDivElement)) return;
      clone.removeAttribute('id');
      clone.querySelectorAll('[id]').forEach((element) => {
        element.removeAttribute('id');
      });
      clone.setAttribute('aria-hidden', 'true');
      const sourceStyle = window.getComputedStyle(source);
      for (let index = 0; index < sourceStyle.length; index += 1) {
        const property = sourceStyle.item(index);
        clone.style.setProperty(
          property,
          sourceStyle.getPropertyValue(property),
          sourceStyle.getPropertyPriority(property),
        );
      }
      clone.style.position = 'absolute';
      clone.style.left = '0';
      clone.style.top = '0';
      clone.style.width = `${sourceRect.width}px`;
      clone.style.height = `${sourceRect.height}px`;
      clone.style.pointerEvents = 'none';
      snapshot.replaceChildren(clone);
    }, [source]);

    useImperativeHandle(
      ref,
      () => ({
        source,
        moveLens(nextPoint) {
          const lens = lensRef.current;
          const snapshot = snapshotRef.current;
          if (!lens || !snapshot) return;
          if (isSourceGeometryDirtyRef.current) {
            sourceRectRef.current = source.getBoundingClientRect();
            isSourceGeometryDirtyRef.current = false;
            const clone = snapshot.firstElementChild;
            if (clone instanceof HTMLElement) {
              clone.style.width = `${sourceRectRef.current.width}px`;
              clone.style.height = `${sourceRectRef.current.height}px`;
            }
          }
          const currentSourceRect = sourceRectRef.current;
          if (!currentSourceRect) return;
          applyPoint({
            lens,
            snapshot,
            point: nextPoint,
            sourceRect: currentSourceRect,
          });
        },
      }),
      [source],
    );

    useLayoutEffect(() => {
      const markSourceGeometryDirty = (): void => {
        isSourceGeometryDirtyRef.current = true;
      };
      document.addEventListener('scroll', markSourceGeometryDirty, true);
      window.addEventListener('resize', markSourceGeometryDirty);
      let hasObservedInitialSize = false;
      const resizeObserver =
        typeof ResizeObserver === 'undefined'
          ? null
          : new ResizeObserver(() => {
              if (!hasObservedInitialSize) {
                hasObservedInitialSize = true;
                return;
              }
              markSourceGeometryDirty();
            });
      resizeObserver?.observe(source);
      return () => {
        document.removeEventListener('scroll', markSourceGeometryDirty, true);
        window.removeEventListener('resize', markSourceGeometryDirty);
        resizeObserver?.disconnect();
      };
    }, [source]);

    useLayoutEffect(() => captureSnapshot(), [captureSnapshot]);

    useLayoutEffect(() => {
      if (typeof MutationObserver === 'undefined') return;
      const overlays = source.querySelectorAll(
        '.hsn-selection-overlay, .hsn-selection-percent-overlay',
      );
      if (overlays.length === 0) return;

      const observer = new MutationObserver(() => captureSnapshot());
      overlays.forEach((overlay) => {
        observer.observe(overlay, {
          attributes: true,
          childList: true,
          subtree: true,
        });
      });
      return () => observer.disconnect();
    }, [captureSnapshot, source]);

    useLayoutEffect(() => {
      const lens = lensRef.current;
      const snapshot = snapshotRef.current;
      const sourceRect = sourceRectRef.current;
      if (!lens || !snapshot || !sourceRect || measuredSourceRef.current !== source) return;
      applyPoint({ lens, snapshot, point, sourceRect });
    }, [point, source]);

    return createPortal(
      <div
        ref={lensRef}
        className="hsn-selection-magnifier"
        aria-hidden="true"
        style={{ transform: getLensTransform(point) }}
      >
        <div ref={snapshotRef} className="hsn-selection-magnifier__snapshot" />
        <span className="hsn-selection-magnifier__point" />
      </div>,
      document.body,
    );
  },
);

export const SelectionMagnifier = memo(SelectionMagnifierComponent);
