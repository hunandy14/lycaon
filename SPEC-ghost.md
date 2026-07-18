# 陰間（死者視角）+ GM 聊天監看 SPEC（loop 用）

目標：死者專用連結 `/ghost/:token`——唯讀上帝視角（自選開眼）＋陰陽雙聊天室；
GM 面板加聊天監看視窗（雙分頁、可發言）。

## 不可違反的紀律（每輪必讀）

1. **聊天與 ghost 都不是遊戲事件**：不寫 `events` 表、不經 game reducer、不新增 GameEvent 型別、
   與 undo/redo 無關。
2. **過濾與權限在 server 端**：
   - ghost API 只掛 `/api/ghost/:token/*`（免密碼，token 即憑證）；token 無效或未啟用一律 404。
   - GM 聊天 API 掛 `/api/games/:id/chat*`，一律過既有 `checkAuth` 密碼中介（見 routes/games.ts 用法）。
   - watch token 打 ghost API 必須 404，反之亦然；token 與密碼兩套憑證不交叉。
   - `ghostCanReveal` 關閉時，全知資料**連網路層都不出去**（server 端降級回觀眾等級），不是 client 藏。
3. 陣營/類別判斷一律走 `engine/src/alignment.ts` 的 `factionOf`/`clsOf`，禁止直接查 ROLE_META。
4. 不碰 production：不執行 pm2、不讀寫 `server/data/`、不動主 repo `/srv/www/lycaon`。
   測試 DB 一律 `:memory:`。**絕對禁止**：啟動任何 server / dev server（驗證只靠測試與 tsc）、
   kill 任何行程、碰 5177 埠、git push、rm -rf、刪除 SPEC 之外既有檔案。
5. XSS：client 只用 React 純文字渲染；GM 筆記（note）任何視角都不外流。
6. UI 繁體中文、手機直式、暗色主題；icon 用 lucide-react（已安裝），不用 emoji 當按鈕。
7. 閘門：`npm test && npx tsc -p engine/tsconfig.json && npx tsc -p server/tsconfig.json` 全綠才 commit；
   **該步有動 client/ 加跑 `npx tsc -p client/tsconfig.json`**。engine 邏輯有改必寫測試。
   commit 訊息格式：`ghost step N: <摘要>`。
8. 向後相容：ShareSettings 新欄位一律有預設值（parseShare 以 DEFAULT_SHARE 打底，舊局缺欄自動補）。

## 架構拍板（不要重新發明）

- **DB**（server/src/db.ts）：`games` 加 `ghost_token TEXT`（照 addCol 遷移模式）；
  `chat` 表加 `scope TEXT NOT NULL DEFAULT 'watch'`（'watch'|'ghost'）與 `is_gm INTEGER NOT NULL DEFAULT 0`
  （SQLite 對既有表用 ALTER TABLE ADD COLUMN，比照 games 的 addCol 手法）。
  `ChatMessage` 介面加 `scope`、`isGm`。store：`appendChat` 加 scope/isGm 參數、
  `listChat(gameId, scope, limit)`、`getGameByGhostToken(token)`、`updateGhost(gameId, token)`。
- **engine**（engine/src/watch.ts）：ShareSettings 加 `ghostEnabled: false`、`ghostCanReveal: false`。
  新增 `buildGhostView(state, settings, report?)`：GM 全知等級——全底牌（role/lover/converted 直接給）、
  完整天數投票與時間軸**含夜晚行動與查驗**（state.log 全量、僅過濾 `kind==='note'`）、不拉夜幕
  （stage 照實回 night，但照樣給盤面）、待公佈死亡照給（死者本來就看得到 GM 結算）。
  回傳型別 `GhostView`，帶 `canReveal: boolean`。`ghostCanReveal===false` 時由**route 層**改回
  `buildSpectatorView`（engine 不用做降級邏輯，但 GhostView 與 SpectatorView 需可被 client 區分，
  例如 GhostView 加 `god: true` 旗標）。
- **live.ts**：chat 事件的 message 已含 scope（隨 ChatMessage 型別自動帶到）；
  watch stream 只轉發 `scope==='watch'`；ghost stream 轉發兩個 scope；GM stream 轉發兩個 scope。
- **server 路由**：
  - `server/src/routes/ghost.ts`（新檔，index.ts 掛 `/api/ghost`）：
    `GET /:token`（canReveal ? buildGhostView : buildSpectatorView＋`god:false`）、
    `GET /:token/stream`（SSE，比照 watch）、`GET /:token/chat?scope=`、`POST /:token/chat`
    （body {nick,text,scope}，驗證與 rate limit 沿用 watch.ts 的做法，可把共用邏輯抽到小 helper）。
  - `routes/games.ts` 或新檔掛 GM 聊天：`GET /api/games/:id/chat`（一次回兩房）、
    `POST /api/games/:id/chat`（body {scope,text}，nick 固定 'GM'、isGm=1、**免 rate limit**）、
    `GET /api/games/:id/chat/stream`（SSE）。三條都過 checkAuth。
  - GET /api/games/:id/share 的 ShareInfo 需帶 ghost 連結資訊（ghost_token；首次 ghostEnabled=true 時生成，
    生成後固定，比照 share_token 的做法）。
- **client**：
  - `pages/GhostPage.tsx`（route `/ghost/:token`）：未開眼＝觀眾等級畫面（可複用 WatchPage 的區塊或抽共用）；
    「開天眼」開關存 `localStorage(lycaon:ghosteye:<token>)`；開眼＝全底牌盤面＋全知時間軸。
    底部雙聊天室：👻 陰間＋☀️ 陽間（沿用/改造 components/WatchChat.tsx，傳 scope 與發送端點）。
    canReveal=false 時不顯示開眼開關。
  - `components/ShareSheet.tsx`：第三張卡「👻 陰間」——啟用開關、死者連結（複製＋QR，
    完全比照邀請連結卡的格式與 icon）、「死者可開眼看底牌」開關。皆預設關。
  - GM 聊天 sheet：GamePage 底部列加 lucide `MessageCircle` icon（陽間或陰間聊天啟用時才顯示），
    開底部 sheet、兩分頁（👻 陰間預設、☀️ 陽間）、訊息列表沿用 chat 樣式、GM 發言帶金色「GM」徽章、
    未讀紅點以 `localStorage(lycaon:chatseen:<id>)` 記上次開窗時間。
  - `api.ts` 補對應 API 與型別。
- **關鍵既有檔**：server/src/routes/watch.ts（聊天驗證/rate limit 參考）、server/src/live.ts、
  server/src/auth.ts（checkAuth）、engine/src/watch.ts、client/src/components/WatchChat.tsx、
  ShareSheet.tsx、pages/WatchPage.tsx、pages/GamePage.tsx（底部列）、client/src/api.ts。

## 步驟（依序執行第一個未勾選的，一輪只做一步）

- [x] 1. **DB + store**：ghost_token 欄、chat 的 scope/is_gm 欄、ChatMessage 型別、
      store 方法（appendChat 簽名調整、listChat 分房、getGameByGhostToken、updateGhost）。
      既有呼叫點（watch.ts 聊天路由）同步改到編譯過。
- [x] 2. **engine**：ghostEnabled/ghostCanReveal 設定 + buildGhostView + 測試
      （全知含夜晚行動與查驗、note 不外流、god 旗標、待公佈死亡照給、序列化含 role）。
- [x] 3. **ghost 路由**：routes/ghost.ts 三條 + index.ts 掛載 + share API 帶 ghost 資訊 +
      live 轉發分房（watch 只轉 watch、ghost 全轉）。
- [x] 4. **GM 聊天路由**：/api/games/:id/chat 三條（checkAuth、GM 免 rate limit、isGm 標記）。
- [x] 5. **server 測試**：test/ghost.test.ts——token 隔離（watch token 打 ghost 404、ghost token 打 watch 404）、
      canReveal=false 降級（回應無 role、god:false）、聊天分房（watch 端看不到 ghost 房）、
      GM 通道無密碼 401/403、GM 發言免 rate limit。
- [x] 6. **GhostPage**：路由、開天眼、全知盤面、雙聊天室、canReveal=false 隱藏開眼。
- [x] 7. **同樂面板陰間卡**：啟用/連結+複製+QR/可開眼，比照邀請連結卡格式。
- [x] 8. **GM 聊天 sheet**：底部列 icon、雙分頁、GM 徽章發言、未讀紅點。
- [ ] 9. **文件與總驗**：CLAUDE.md 補 API 表與進度、部署段補「CF bypass 需加 /ghost/* 與 /api/ghost/*（場外待辦）」；
      跑全閘門含 client tsc 與 `npm run build`。

## 已知教訓（卡住時把修正寫在這，給下一輪看）

（空）

## 完成定義

所有步驟勾選、閘門全綠、工作樹乾淨（全部已 commit）。**停在 feat/ghost 分支——絕不合併 main、絕不部署**。
屆時輸出 `RALPH_DONE`。
