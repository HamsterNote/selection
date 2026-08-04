/// <reference types="vitest/globals" />
import { act, render } from '@testing-library/react';
import { Selection } from './Selection';
import type { LinkedSelectionData } from './types';

function selectionContainer(host: HTMLElement): HTMLElement {
  const container = host.querySelector('.hsn-selection-container');
  if (container instanceof HTMLElement) return container;
  throw new TypeError('Expected Selection container');
}

function createMouseMove(): MouseEvent {
  return new MouseEvent('mousemove', {
    bubbles: true,
    cancelable: true,
    clientX: 180,
    clientY: 120,
  });
}

describe('Selection native drag boundary', () => {
  it('blocks native selection updates when the pointer hits text outside a selection container', () => {
    // Given: 鼠标从 Selection 容器内开始拖选，页面外部另有普通文字。
    const view = render(
      <div>
        <Selection ranges={[]}>
          <span>Selectable text</span>
        </Selection>
        <p data-testid="outside-text">Outside text</p>
      </div>,
    );
    const container = selectionContainer(view.container);
    const outsideText = view.getByTestId('outside-text');
    act(() => {
      container.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    });

    // When: 拖动落点进入不属于任何 selection container 的文字。
    const moveEvent = createMouseMove();
    act(() => {
      outsideText.dispatchEvent(moveEvent);
    });

    // Then: 阻止浏览器把原生选区吸附到外部文字或容器首字符。
    expect(moveEvent?.defaultPrevented).toBe(true);
  });

  it('allows native selection updates over absolute-positioned text inside the same container', () => {
    // Given: Selection 内容全部使用绝对定位，鼠标仍从容器内部开始拖选。
    const view = render(
      <Selection ranges={[]}>
        <span data-testid="absolute-text" style={{ position: 'absolute', left: 120, top: 80 }}>
          Absolute text
        </span>
      </Selection>,
    );
    const container = selectionContainer(view.container);
    const absoluteText = view.getByTestId('absolute-text');
    act(() => {
      container.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    });

    // When: 拖动落点仍在 selection container 层级下的文字上。
    const moveEvent = createMouseMove();
    act(() => {
      absoluteText.dispatchEvent(moveEvent);
    });

    // Then: 保留浏览器原生拖选行为。
    expect(moveEvent?.defaultPrevented).toBe(false);
  });

  it('allows native selection updates when dragging into another selection container', () => {
    // Given: 页面包含两个可联动拖选的 Selection 容器，手势从第一个容器开始。
    const view = render(
      <div>
        <Selection ranges={[]}>
          <span>First page</span>
        </Selection>
        <Selection ranges={[]}>
          <span>Second page</span>
        </Selection>
      </div>,
    );
    const containers = view.container.querySelectorAll('.hsn-selection-container');
    const firstContainer = containers.item(0);
    const secondContainer = containers.item(1);
    if (!(firstContainer instanceof HTMLElement) || !(secondContainer instanceof HTMLElement)) {
      throw new TypeError('Expected two Selection containers');
    }
    act(() => {
      firstContainer.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
      );
    });

    // When: 拖动进入另一个 Selection 容器。
    const moveEvent = createMouseMove();
    act(() => {
      secondContainer.dispatchEvent(moveEvent);
    });

    // Then: 允许浏览器继续更新跨容器原生选区。
    expect(moveEvent.defaultPrevented).toBe(false);
  });

  it('allows the first linked selection drag to cross the gap between containers', () => {
    // Given: 两个联动 Selection 之间存在不属于任何 Selection 容器的布局间隙。
    const linkedData = {
      items: [],
      selectedRangeId: null,
      selectionOrder: ['page-a', 'page-b'],
    } satisfies LinkedSelectionData;
    const view = render(
      <div>
        <Selection selectionId="page-a" linkedMode={true} linkedData={linkedData} ranges={[]}>
          <span>First page</span>
        </Selection>
        <div data-testid="container-gap" />
        <Selection selectionId="page-b" linkedMode={true} linkedData={linkedData} ranges={[]}>
          <span>Second page</span>
        </Selection>
      </div>,
    );
    const firstContainer = selectionContainer(view.container);
    const gap = view.getByTestId('container-gap');
    act(() => {
      firstContainer.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
      );
    });

    // When: 第一次原生拖选连续移动到两个容器之间的间隙。
    const moveEvent = createMouseMove();
    act(() => {
      gap.dispatchEvent(moveEvent);
    });

    // Then: 联动模式保留浏览器的原生选区更新，使手势能继续进入下一个容器。
    expect(moveEvent.defaultPrevented).toBe(false);
  });
});
