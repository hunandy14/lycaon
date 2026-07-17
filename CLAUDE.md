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
POST /api/games                → 建局 {id}；body = GameConfig
GET  /api/games                → 列表
GET  /api/games/:id            → { envelopes, redoCount }，client 自行 replay
POST /api/games/:id/events     → { event, expectedSeq }；409=seq 衝突、400=validate 拒絕（繁中 reason）
POST /api/games/:id/undo       → { toSeq? }；建局事件不可撤銷；append 會清掉 redo 分支
POST /api/games/:id/redo
DELETE /api/games/:id
```

## Client（client/src）

phase 驅動的單頁儀表板，所有畫面手機直式、繁中。

- `pages/`：`HomePage`（列表：進行中/歷史）、`NewGamePage`（4 步建局精靈）、`GamePage`（主儀表板）、`TimelinePage`（時間軸 + 回退到此）。
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
  - 感染天亮生效（當夜查驗仍好人）；感染只擋刀不擋毒；`npm test` 72 綠。
- ⬜ 玩家端（SSE 廣播 + secret 過濾）仍為未來項目。

## 執行

```bash
npm run dev     # 開發：server:5177 + vite:5173（proxy /api）。手機連 http://<電腦IP>:5173
npm run build   # 產出 client/dist
npm start       # 單埠 production（預設 5177）：一個埠服務 API + 靜態檔 + SPA fallback
pm2 start ecosystem.config.cjs   # 常駐（正式部署用；需先 npm run build）
```

## 部署與網路（重要）

- **server 預設只綁 `127.0.0.1`**（`HOST` env 可改）。這台機器有公網 IP，外部一律走 Cloudflare Tunnel 從同機 localhost 連入，埠不對外開放以免繞過 Zero Trust。改 server 綁定時務必維持這點。
- PM2：`ecosystem.config.cjs`（fork 單實例，因 better-sqlite3 單寫入者）。**關鍵**：script 是 `.ts`，PM2 會依副檔名自動選 `bun`，故設定檔已明確指定 `interpreter: 'node'` + `node_args: '--import tsx'`，勿移除。
- serveStatic 的 root 用 `relative(process.cwd(), clientDist)`：因 `npm start`（cwd=server/）與 PM2（cwd=專案根）的 cwd 不同，這樣兩者都對。
