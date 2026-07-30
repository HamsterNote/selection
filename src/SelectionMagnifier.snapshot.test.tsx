/// <reference types="vitest/globals" />
import { render, waitFor } from '@testing-library/react';
import { SelectionMagnifier } from './SelectionMagnifier';

describe('SelectionMagnifier snapshot lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reuses the snapshot for pointer motion and refreshes once after the selection overlay updates', async () => {
    // Given: 快照源同时包含内容层和 SVG 选框层。
    const source = document.createElement('div');
    source.className = 'hsn-selection-container';
    source.innerHTML =
      '<svg class="hsn-selection-overlay"><rect class="hsn-selection-rect" x="10" /></svg><div class="hsn-selection-content">Observed source</div>';
    document.body.append(source);
    vi.spyOn(source, 'getBoundingClientRect').mockReturnValue(new DOMRect(40, 30, 180, 90));
    const cloneSource = vi.spyOn(source, 'cloneNode');
    const view = render(<SelectionMagnifier point={{ x: 60, y: 42 }} source={source} />);
    const firstSnapshot = document.querySelector(
      '.hsn-selection-magnifier__snapshot > .hsn-selection-container',
    );

    // When: 只有指针坐标改变，选框 DOM 未更新。
    view.rerender(<SelectionMagnifier point={{ x: 72, y: 48 }} source={source} />);
    view.rerender(<SelectionMagnifier point={{ x: 84, y: 54 }} source={source} />);

    // Then: 移动只更新 transform，仍复用首张快照。
    expect(cloneSource).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.hsn-selection-magnifier__snapshot')?.firstElementChild).toBe(
      firstSnapshot,
    );

    // When: React 对应的选框几何在 DOM 中提交更新。
    const overlayRect = source.querySelector('rect');
    if (!(overlayRect instanceof Element)) throw new TypeError('Expected overlay rect');
    overlayRect.setAttribute('x', '24');

    // Then: MutationObserver 在该批选框更新后只生成一张新快照。
    await waitFor(() => expect(cloneSource).toHaveBeenCalledTimes(2));
    expect(
      document.querySelector('.hsn-selection-magnifier__snapshot rect')?.getAttribute('x'),
    ).toBe('24');
    source.remove();
  });
});
