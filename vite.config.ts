import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';

// 组件库构建配置（库模式）
// 产物：dist/index.js（ESM）、dist/index.cjs（CJS）、dist/index.css、dist/index.d.ts
export default defineConfig({
  plugins: [
    react(),
    // 自动生成类型声明文件（按源码结构输出多个 .d.ts，与 dist 中其他文件并列）
    dts({
      include: ['src'],
      exclude: ['src/**/*.test.*', 'src/**/*.demo.*'],
      tsconfigPath: './tsconfig.app.json',
      entryRoot: 'src',
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'HamsterSelection',
      fileName: 'index',
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      // react / react-dom 作为 peerDependencies，不打包进产物
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        // 强制 named exports，避免 UMD/CJS 消费者要写 .default
        exports: 'named',
      },
    },
  },
});
