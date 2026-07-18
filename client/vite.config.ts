import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // engine 以原始 TS 匯出，不預先打包，交給 Vite 即時轉譯
  optimizeDeps: { exclude: ['@lycaon/engine'] },
  server: {
    host: true, // 讓手機同網段可連
    port: 5173,
    proxy: {
      // 代理目標埠跟著 PORT（與 server 同一個 env）：正式站 PM2 佔 5177 時，
      // worktree 可用 `PORT=5188 npm run dev` 並存，不必停正式站。
      '/api': `http://localhost:${process.env.PORT ?? 5177}`,
    },
  },
});
