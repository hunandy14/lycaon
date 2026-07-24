/**
 * 零依賴 .env 載入器。
 * 用 import.meta.url 定位 server/.env（與 process.cwd 無關——npm start 在 server/、PM2 在專案根）。
 * 逐行解析 KEY=VALUE（跳過 # 註解與空行），只在 process.env 該 key「尚未定義」時寫入
 * （真實環境變數優先，方便部署覆寫）；檔案不存在則靜默略過。
 * 在 index.ts 最頂端 import 使其於任何讀 process.env 的模組之前先執行。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function loadEnv(): void {
  let raw: string;
  try {
    raw = readFileSync(fileURLToPath(new URL('../.env', import.meta.url)), 'utf8');
  } catch {
    return; // 檔案不存在（例如正式環境改用真實環境變數）→ 靜默略過
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || key in process.env) continue; // 已定義者不覆蓋
    let value = trimmed.slice(eq + 1).trim();
    // 去掉成對的引號（單/雙）
    if (value.length >= 2 && ((value[0] === '"' && value.at(-1) === '"') || (value[0] === "'" && value.at(-1) === "'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnv();
