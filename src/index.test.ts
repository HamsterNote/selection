/**
 * 占位测试文件
 * 用于验证测试工具链配置是否正确
 */

import { describe, it, expect } from 'vitest';

// 基础测试：验证测试环境配置
describe('测试环境配置', () => {
  it('应该正确配置 jsdom 环境', () => {
    // 验证 jsdom 环境已正确设置
    expect(window).toBeDefined();
    expect(document).toBeDefined();
  });

  it('应该支持 React 组件测试', () => {
    // 创建一个简单的 DOM 元素
    const element = document.createElement('div');
    element.textContent = 'Hello World';
    document.body.appendChild(element);

    // 验证元素已添加到 DOM
    expect(element).toBeInTheDocument();
    expect(element.textContent).toBe('Hello World');

    // 清理
    document.body.removeChild(element);
  });
});
