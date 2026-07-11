import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Demo 开发/构建配置
// 开发服务器：端口 9536，允许局域网访问
export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'demo'),
  // 将 src 作为别名，方便 demo 中引用组件库源码
  resolve: {
    alias: {
      '@hamster-note/selection': resolve(__dirname, 'src/index.ts'),
    },
  },
  server: {
    host: true, // 允许局域网访问（0.0.0.0）
    port: 9536,
    open: false,
  },
  preview: {
    host: true,
    port: 9536,
  },
  build: {
    outDir: resolve(__dirname, 'dist-demo'),
    emptyOutDir: true,
  },
});
