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
      '/api': 'http://localhost:5177',
    },
  },
});
