const path = require('node:path');

// PM2 設定：常駐 lycaon server（單埠服務 API + client/dist）。
// 部署前先 `npm run build` 產出 client/dist，PM2 只負責跑 server。
//   pm2 start ecosystem.config.cjs
//   pm2 logs lycaon        # 看即時日誌
//   pm2 restart lycaon     # 改程式碼後重啟
//   pm2 save && pm2 startup # 開機自動拉起
module.exports = {
  apps: [
    {
      name: 'lycaon',
      // 用 tsx 直接執行 TS 源碼（engine 以原始 .ts 匯出，與 npm start 一致）
      // interpreter 必須明確指定 node，否則 PM2 見到 .ts 副檔名會自動選 bun
      script: path.join(__dirname, 'server/src/index.ts'),
      interpreter: 'node',
      node_args: '--import tsx',
      cwd: __dirname,

      // better-sqlite3 單寫入者、單 GM 使用 → 固定 1 個 fork 實例，勿用 cluster
      exec_mode: 'fork',
      instances: 1,

      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '300M',

      env: {
        NODE_ENV: 'production',
        PORT: 5177,
        LYCAON_DB: path.join(__dirname, 'server/data/lycaon.sqlite'),
      },

      // 日誌（./logs 已被 .gitignore 的 *.log 忽略）
      error_file: path.join(__dirname, 'logs/lycaon-error.log'),
      out_file: path.join(__dirname, 'logs/lycaon-out.log'),
      merge_logs: true,
      time: true,
    },
  ],
};
