# 觀戰頁聊天室 SPEC（Ralph loop 用）

目標：觀戰者在 `/watch/:token` 頁面可以取暱稱聊天。聊天掛在既有 SSE 中樞上即時推送。

## 不可違反的紀律（每輪必讀）

1. **聊天訊息不是遊戲事件**。它是獨立的 `chat` 資料表，**絕不**寫進 `events` 表、
   絕不經過 game reducer、與 undo/redo 完全無關。不新增任何 GameEvent 型別。
2. **過濾與權限在 server 端**：聊天 API 只掛在 `/api/watch/:token/*` 下（觀戰端、免密碼），
   token 無效或同樂未開啟一律 404。**不**在 `/api/games/*` 下新增任何聊天端點。
3. 不動 engine/ workspace（聊天與遊戲邏輯無關）。
4. 不碰 production：不執行 pm2、不讀寫 `server/data/`、不動主 repo `/srv/www/lycaon`。
   測試 DB 一律 `:memory:`（跟 server/test/store.test.ts 一樣）。
5. XSS：client 只用 React 純文字渲染（不用 dangerouslySetInnerHTML）；server 存原文即可。
6. UI 繁體中文、手機直式，沿用既有暗色主題 CSS 變數。
7. 每步完成後閘門：`npm test && npx tsc -p server/tsconfig.json` 全綠才 commit。
   commit 訊息格式：`chat step N: <摘要>`。

## 架構拍板（不要重新發明）

- 資料表：`chat (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id TEXT NOT NULL, nick TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL)`，
  index `(game_id, id)`。在 `server/src/db.ts` 的 `openDb` 建表（照既有 CREATE TABLE IF NOT EXISTS 風格）。
- SSE 推送：擴充 `server/src/live.ts` 的 `notify`/`subscribe` 讓 listener 可收到
  `{ kind: 'update' } | { kind: 'chat', message: ChatMessage }`（既有呼叫點改為 `{kind:'update'}`，
  觀戰 stream 收到 chat 時 writeSSE `event: 'chat', data: JSON.stringify(message)`，
  收到 update 時維持現行為）。client 收到 chat 事件直接 append，不重拉快照。
- 限制：nick 1–12 字、text 1–200 字（trim 後）、同一 token 每 IP 每 3 秒最多 1 則
  （in-memory Map 即可，單進程前提同 live.ts）。超限回 400/429。
- 歷史：GET 回傳最近 50 則（依 id 升冪）。

## 步驟（依序執行第一個未勾選的，一輪只做一步）

- [x] 1. **資料表 + store 層**：db.ts 建 `chat` 表；EventStore 加 `appendChat(gameId, nick, text, now): ChatMessage`
      與 `listChat(gameId, limit=50): ChatMessage[]`（ChatMessage 介面定義在 db.ts 並 export）。
- [x] 2. **live.ts 擴充**：listener payload 改為上述 union；更新所有既有 notify 呼叫點
      （routes/games.ts 等）為 `{kind:'update'}`；watch stream 的 subscribe 對應轉發（update 照舊、chat 先忽略）。
- [x] 3. **聊天路由**：routes/watch.ts 加 `GET /:token/chat`（最近 50 則）與
      `POST /:token/chat`（body `{nick, text}`，驗證長度與 rate limit，成功後 appendChat + notify chat）。
- [ ] 4. **server 測試**：server/test/chat.test.ts —— 覆蓋：存取歷史、長度驗證、token 無效 404、
      同樂關閉後拒收、rate limit。照 store.test.ts 的 `:memory:` 寫法。
- [ ] 5. **client 觀戰頁 UI**：WatchPage 底部聊天區——訊息列表（暱稱+內容+時間）、輸入框與送出、
      暱稱首次輸入後存 `localStorage(lycaon:chatnick)`；進頁 GET 歷史、EventSource 監聽 `chat` 事件 append。
      樣式進 components.css，沿用暗色主題。
- [ ] 6. **邊界收尾**：終局（stage=ended）聊天維持可用；同樂關閉時 UI 顯示禁用；
      送出失敗（429/400）Toast 提示；訊息列表自動捲到底但使用者上捲時不搶捲動。
- [ ] 7. **文件與總驗**：更新 CLAUDE.md 的 API 清單與進度區（聊天室打勾）；
      跑 `npm test && npx tsc -p server/tsconfig.json && npx tsc -p client/tsconfig.json`（若 client 無獨立 tsconfig 則以 `npm run build` 代替）全綠。

## 已知教訓（卡住時把修正寫在這，給下一輪看）

（空）

## 完成定義

所有步驟勾選、閘門全綠、工作樹乾淨（全部已 commit）。屆時輸出 `RALPH_DONE`。
