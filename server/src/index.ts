import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, EventStore } from './db';
import { gamesRoutes } from './routes/games';
import { watchRoutes } from './routes/watch';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.LYCAON_DB ?? join(__dirname, '../data/lycaon.sqlite');
const port = Number(process.env.PORT ?? 5177);
// 預設只綁 127.0.0.1：外部一律走 Cloudflare Tunnel（同機 localhost 連入），
// 這個埠不對區網/公網開放，避免繞過 Zero Trust 驗證直連。
// 若真要區網直連測試，設 HOST=0.0.0.0。
const host = process.env.HOST ?? '127.0.0.1';

const store = new EventStore(openDb(dbPath));
const app = new Hono();

app.route('/api/games', gamesRoutes(store));
app.route('/api/watch', watchRoutes(store));
app.get('/api/health', (c) => c.json({ ok: true }));

// production：服務 client 打包後的靜態檔（SPA fallback 到 index.html）
// serveStatic 的 root 是相對於 process.cwd()，而 cwd 隨啟動方式而異
// （npm start 在 server/、PM2 在專案根）；用 relative(cwd, dist) 讓兩者都正確。
const clientDist = join(__dirname, '../../client/dist');
if (existsSync(clientDist)) {
  const root = relative(process.cwd(), clientDist) || '.';
  app.use('*', serveStatic({ root }));
  app.get('*', serveStatic({ path: join(root, 'index.html') }));
}

serve({ fetch: app.fetch, port, hostname: host }, (info) => {
  console.log(`lycaon server listening on http://${host}:${info.port} (db: ${dbPath})`);
});
