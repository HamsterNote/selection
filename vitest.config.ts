import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Vitest 测试配置
// 使用 jsdom 环境，支持 React 组件测试
export default defineConfig({
  resolve: {
    alias: {
      '@hamster-note/selection': resolve(__dirname, './src/index.ts'),
    },
  },
  test: {
    // 使用 jsdom 环境，提供浏览器 API（window、document 等）
    environment: 'jsdom',

    // 全局启用 expect 的 jest-dom 匹配器
    globals: true,

    // 设置文件，在每个测试文件运行前执行
    setupFiles: ['./src/test-setup.ts'],

    // 包含的测试文件模式
    include: ['src/**/*.{test,spec}.{ts,tsx}'],

    // 排除 node_modules 和 dist 目录
    exclude: ['node_modules', 'dist'],

    // 覆盖率配置（可选，按需启用）
    // coverage: {
    //   provider: 'v8',
    //   reporter: ['text', 'json', 'html'],
    //   include: ['src/**/*.{ts,tsx}'],
    //   exclude: ['src/**/*.{test,spec}.*', 'src/test-setup.ts'],
    // },
  },
});
