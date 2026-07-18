# lycaon — 狼人殺 GM 輔助系統

手機直式的 GM 儀表板：夜晚/白天精靈引導輸入，引擎自動結算死亡、追蹤技能、偵測勝利、記錄時間軸。
完整計畫：`~/.claude/plans/majestic-mapping-stonebraker.md`。UI 一律繁體中文。

## 架構（不可違反的紀律）

**事件溯源**：事件只存「GM 手指按下去的輸入」（`GUARD_ACTED`、`EXILE_VOTED`…），衍生結果
（死亡、查驗結果、白癡翻牌、勝負、播報稿、時間軸）一律由 reducer 推導。undo = 回退事件重播。
新增事件型別前先確認它不是衍生事實——這是 undo 一致性的命脈。

- reducer 純函式：**禁用 `Date.now()` / `Math.random()`**；時間戳只在 EventEnvelope 供顯示。
- 所有死亡必須走 `engine/src/day/deaths.ts` 的 `applyDeath()`（技能連鎖與勝利判定的唯一入口）。
- 死亡「結算」（`NIGHT_ENDED` → `pendingDeaths`）與「公佈」（`DEATHS_ANNOUNCED` → 真正標死）分離：
  首日警長競選先於死訊公佈，昨夜死者照常上警投票。
- `actionQueue`（遺言/開槍/警徽）FIFO 嚴格消化；佇列非空時 validate 擋掉其他事件。
- server 是權威方：append 前 replay + validate；client 用同一引擎做本地預檢與樂觀更新。

## Workspaces

- `engine/` — 純函式引擎，零 runtime 依賴，直接匯出 TS 原始碼（不 build）。改邏輯必寫測試。
- `server/` — Hono + better-sqlite3，port 5177（`PORT` 覆寫），DB 在 `server/data/lycaon.sqlite`（`LYCAON_DB` 覆寫）。
- `client/` — React + Vite + TS（尚未建立，見「進度」）。

## 指令

```bash
npm test            # vitest：engine 55 測試（真值表/連鎖/警長/golden replay/一致性）+ server store
npm run dev         # server tsx watch + vite dev（client 建好後）
npx tsc -p engine/tsconfig.json && npx tsc -p server/tsconfig.json   # typecheck（皆 noEmit）
```

新依賴若有 postinstall（如 esbuild/better-sqlite3）需 `npm install-scripts approve <pkg>` 後 `npm rebuild <pkg>`。

## REST API（server/src/routes/games.ts）

```
POST /api/games                → 建局 {id}；body = GameConfig；x-room-password 標頭設管理密碼
GET  /api/games                → 列表（含 progress 進度快照與 locked 旗標；不含事件流，列表本身不擋、靠 CF）
GET  /api/games/:id            → { envelopes, redoCount, locked }；上鎖局進行中需 x-room-password（結束後開放讀）
POST /api/games/:id/events     → { event, expectedSeq }；409=seq 衝突、400=validate 拒絕；寫入永遠需密碼
POST /api/games/:id/undo       → { toSeq? }；建局事件不可撤銷；append 會清掉 redo 分支；需密碼
POST /api/games/:id/redo       → 需密碼
DELETE /api/games/:id          → 需密碼
GET  /api/games/:id/share      → { token, settings }（GM 端同樂設定；需密碼）
POST /api/games/:id/share      → body Partial<ShareSettings>；首次開啟生成 token 後固定；需密碼
GET  /api/watch/:token         → 觀戰過濾快照（統一視角，無 seat 參數）；未開啟=404；不需密碼
GET  /api/watch/:token/stream  → SSE（append/undo/redo/設定變更時推 update，25s 心跳）
GET  /api/roster               → { names }（座位名字自動完成清單）
GET  /api/stats                → { totalGames, players[] }（跨已結束局的玩家勝率/角色分佈聚合）
```

管理密碼（`server/src/auth.ts` scrypt）是 CF Access 之外的**第二道鎖**：`checkAuth` 中介——寫入永遠需密碼、
讀取進行中需密碼結束後開放（報表可分享）；`x-room-password` 標頭傳遞（HTTPS 下明文，定位是「擋一下」非高強度）；
`password_hash` null=不上鎖（舊局相容）。client 建局裝置自動存 `localStorage(lycaon:pass:<id>)`，換裝置走 UnlockGate。

## Client（client/src）

phase 驅動的單頁儀表板，所有畫面手機直式、繁中。

- `pages/`：`HomePage`（列表：進行中含進度、歷史含勝方）、`NewGamePage`（5 步建局精靈，含角色池）、`GamePage`（主儀表板）、`TimelinePage`（時間軸 + 回退到此）、`ReportPage`（終局報表，進行中/中止局也可看）。
- `hooks/useGame.ts`：載入事件 → 本地 `replay` → `dispatch` 樂觀更新（本地先 `validate`，成功才 POST，失敗回滾；409 自動重載）。undo/redo 走 server 後 refetch。
- `panels/PhasePanel.tsx`：依 `state.phase` 與 `actionQueue` 路由到對應面板（**佇列非空時優先 ResolvePanel**，對齊引擎 validate）。面板：`SetupPanel` / `NightWizard`（含 WitchStep、NightComplete 顯示查驗結果）/ `DawnPanel` / `SheriffPanel` / `VotePanel`（+ `InterruptBar` 騎士/自爆）/ `ResolvePanel`（遺言/開槍/警徽 FIFO）/ `DayEndPanel` / `GameOverPanel`。
- `components/`：`SeatGrid`（全 app 目標選擇器，接 `eligibleTargets` 灰化）、`VoteRecorder`（逐票記錄，草稿存 localStorage）、`PickSheet`（底部彈出單選：開槍/決鬥/自爆/警徽）、`PhaseBanner`/`StatusBar`/`SpeechTimer`/`Toast`。
- 用到的引擎 selectors：`buildNightPlan`/`currentNightStep`、`eligibleTargets`、`dashboardStats`、`buildDawnAnnouncement`、`exileVoters`/`electionVoters`、`activeCandidates`、`tally`。
- 樣式：`styles.css` + `components/components.css`，暗色夜晚主題，CSS 變數在 `:root`。`useWakeLock` 主持中防螢幕休眠。

## 進度（2026-07-17）

- ✅ M0–M5 全部完成；已上線 dashboard.werewolfs.win（cloudflared + Zero Trust）。
- ✅ 擴充角色：**邱比特**（首夜連結情侶、殉情級聯走 applyDeath、跨陣營=第三方勝利 `winner.faction==='lovers'`）與**種狼**（夜晚感染刀口轉狼陣營、一局一次）。
  - 陣營/類別判斷一律走 `engine/src/alignment.ts` 的 `factionOf`/`clsOf`/`hasSkills`，**禁止直接查 ROLE_META**（感染會讓陣營在局中改變）。
  - 新規則開關：`lovesickCanShoot`、`seedWolfFirstNight`、`infectedKeepsSkills`（預設皆 false=主流規則）。
  - 感染天亮生效（當夜查驗仍好人）；感染只擋刀不擋毒。
- ✅ 首頁進度（`gameProgress` selector + `games.progress_json` 快照）與**終局報表**（`engine/src/report.ts` 的
  `buildGameReport(envelopes)`：增量 replay 擷取中間態——投票當下陣營、當夜結算名單、歷任警長）。
  投票準確度以「投票當下」的 `factionOf` 計（與查驗語義一致）；第三方情侶不計分、邱比特照計。`npm test` 83 綠。
- ✅ **同樂模式**（觀戰端）：GM 於 GamePage「📡 同樂」開關並取得 `/watch/:token` 邀請連結。
  - **過濾一律在 server 端**（engine/src/watch.ts 的 `buildSpectatorView`，防從網路層扒底牌）；
    觀戰 token 與 game id 分離，觀戰者拿不到 GM API。
  - **統一視角**（無身份、人人同一份）：`buildSpectatorView` 依 `stage`（setup/night/day/ended）——
    **夜晚拉夜幕**（server 對夜間祕密行動不推 SSE，連時機都藏住）、白天**只報今天**
    （votes/timeline 過濾成當前 `state.day`，前一天自己記；盤面生死仍為當前狀態）、終局全攤牌。
  - ShareSettings 開關：`showVotes`/`showDeadRoles`/`showTimeline`；翻牌白癡、自爆狼、翻牌騎士、
    亮牌開槍屬「自曝身分」永遠公開；夜間死因永不下發（白天死因公開）。
  - SSE：server/src/live.ts 單進程訂閱中樞（PM2 fork 單實例前提）；client EventSource + 30s 保底輪詢。
- ✅ **房主管理密碼**（`feat/room-auth-stats`）：建局設 4 位數密碼，CF 之外的第二道鎖（見 API 段與部署段）。
- ✅ **玩家名冊與戰績**：建局座位名字進 `roster` 表（自動完成、未來 Google 綁定錨點）；`/stats` 頁跨已結束局
  用 `buildGameReport` 聚合每位玩家勝率、當好人/當狼分項、角色分佈（同名視為同一人）。`npm test` 93 綠。
- ⬜ 觀戰頁聊天室（可掛在同一 SSE 中樞 + chat 資料表）與 Google 登入（綁定名冊繼承戰績）為未來項目。

## 執行

```bash
npm run dev     # 開發：server:5177 + vite:5173（proxy /api）。手機連 http://<電腦IP>:5173
npm run build   # 產出 client/dist
npm start       # 單埠 production（預設 5177）：一個埠服務 API + 靜態檔 + SPA fallback
pm2 start ecosystem.config.cjs   # 常駐（正式部署用；需先 npm run build）
```

## 部署與網路（重要）

- **server 預設只綁 `127.0.0.1`**（`HOST` env 可改）。這台機器有公網 IP，外部一律走 Cloudflare Tunnel 從同機 localhost 連入，埠不對外開放以免繞過 Zero Trust。改 server 綁定時務必維持這點。
- **同樂模式對外開放時**：CF Access 的 bypass 只能放行 `/watch/*` 與 `/api/watch/*`（觀戰端已在 server 端過濾）。
  **`/api/games/*` 絕不可放行**——它無驗證回傳完整事件流（含夜晚行動）且可寫入，放行等於觀戰者拿到 GM 權限。
- **兩道鎖並存**：房主管理密碼是應用層第二道鎖，但**列表/建局/無密碼舊局仍靠 CF 擋整站**（密碼只保護個別上鎖的局）。
  若未來要完全撤掉 CF Access（讓場外朋友免 Zero Trust 觀戰），需先補「列表與建局也要身分驗證」，否則首頁全裸。
- PM2：`ecosystem.config.cjs`（fork 單實例，因 better-sqlite3 單寫入者）。**關鍵**：script 是 `.ts`，PM2 會依副檔名自動選 `bun`，故設定檔已明確指定 `interpreter: 'node'` + `node_args: '--import tsx'`，勿移除。
- serveStatic 的 root 用 `relative(process.cwd(), clientDist)`：因 `npm start`（cwd=server/）與 PM2（cwd=專案根）的 cwd 不同，這樣兩者都對。
