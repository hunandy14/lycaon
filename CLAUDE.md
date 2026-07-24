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
GET  /api/watch/:token/stream  → SSE（update：append/undo/redo/設定變更，25s 心跳；chat：新聊天訊息即時推送）
GET  /api/watch/:token/chat    → { messages }（最近 50 則，依 id 升冪）；未開啟=404；不需密碼
POST /api/watch/:token/chat    → body { nick, text }；nick 1–12 字、text 1–200 字（trim 後）；
                                  同 IP 每 token 3 秒 1 則（429）；400=長度不符、404=未開啟/連結無效；不需密碼
GET  /api/games/:id/chat        → { watch: messages[], ghost: messages[] }（兩房各 50 則）；需密碼
POST /api/games/:id/chat        → body { scope: 'watch'|'ghost', text }；nick 固定 'GM'、isGm=1、
                                   免 rate limit（已過密碼驗證非匿名觀眾）；需密碼
GET  /api/games/:id/chat/stream → SSE（update 心跳 + chat：兩房訊息都轉發）；需密碼
GET  /api/games/:id/ai-chat     → { enabled, messages }（GM AI 規則問答歷史，scope 'ai' 獨立房）；需密碼
POST /api/games/:id/ai-chat     → body { text }（trim 後 1–500 字，否則 400）；200 { question, reply }；
                                  502=AI 上游失敗（GM 問題已入歷史）、503=AI 未設定（AI_* 環境變數缺）；需密碼
GET  /api/roster               → { names }（座位名字自動完成清單）
GET  /api/stats                → { totalGames, players[] }（跨已結束局的玩家勝率/角色分佈聚合）
```

## 陰間端 API（server/src/routes/ghost.ts，掛 `/api/ghost`）

```
GET  /api/ghost/:token         → ghostCanReveal ? buildGhostView（全底牌 god:true） : buildSpectatorView（god:false 降級）；
                                  陰間模式未開啟或連結無效=404；不需密碼（token 即憑證）
GET  /api/ghost/:token/stream  → SSE（update 心跳；chat：陰陽雙房都轉發，比對照 watch 只轉 watch 房）
GET  /api/ghost/:token/chat    → { messages }（?scope=watch|ghost，預設 ghost；watch 房若 showChat 未開回空陣列）
POST /api/ghost/:token/chat    → body { nick, text, scope }；驗證/rate limit 同 watch 聊天（clientIp+rateLimited
                                  helper 抽在 server/src/routes/chatUtil.ts 共用）；不需密碼
```

`ghost_token` 生成時機與固定規則同 `share_token`：`POST /api/games/:id/share` 首次 `ghostEnabled=true`
時生成（`updateGhost`），之後不隨開關重生；`GET/POST /api/games/:id/share` 回應體帶 `ghostToken`。
watch token 與 ghost token 是兩套獨立憑證，互打對方端點一律 404（`getGameByGhostToken` 只認 ghost_token）。

管理密碼（`server/src/auth.ts` scrypt）是 CF Access 之外的**第二道鎖**：`checkAuth` 中介——寫入永遠需密碼、
讀取進行中需密碼結束後開放（報表可分享）；`x-room-password` 標頭傳遞（HTTPS 下明文，定位是「擋一下」非高強度）；
`password_hash` null=不上鎖（舊局相容）。client 建局裝置自動存 `localStorage(lycaon:pass:<id>)`，換裝置走 UnlockGate。

## Client（client/src）

phase 驅動的單頁儀表板，所有畫面手機直式、繁中。

- `pages/`：`HomePage`（列表：進行中含進度、歷史含勝方）、`NewGamePage`（5 步建局精靈，含角色池）、`GamePage`（主儀表板）、`TimelinePage`（時間軸 + 回退到此）、`ReportPage`（終局報表，進行中/中止局也可看）、`WatchPage`（觀戰統一視角＋聊天室）、`GhostPage`（`/ghost/:token`，死者視角：未開眼＝觀眾等級畫面、開天眼＝全底牌盤面＋全知時間軸＋陰陽雙聊天室；`canReveal=false` 不顯示開眼開關）。
- `hooks/useGame.ts`：載入事件 → 本地 `replay` → `dispatch` 樂觀更新（本地先 `validate`，成功才 POST，失敗回滾；409 自動重載）。undo/redo 走 server 後 refetch。
- `panels/PhasePanel.tsx`：依 `state.phase` 與 `actionQueue` 路由到對應面板（**佇列非空時優先 ResolvePanel**，對齊引擎 validate）。面板：`SetupPanel` / `NightWizard`（含 WitchStep、NightComplete 顯示查驗結果）/ `DawnPanel` / `SheriffPanel` / `VotePanel`（+ `InterruptBar` 騎士/自爆）/ `ResolvePanel`（遺言/開槍/警徽 FIFO）/ `DayEndPanel` / `GameOverPanel`。
- `components/`：`SeatGrid`（全 app 目標選擇器，接 `eligibleTargets` 灰化）、`VoteRecorder`（逐票記錄，草稿存 localStorage）、`PickSheet`（底部彈出單選：開槍/決鬥/自爆/警徽）、`PhaseBanner`/`StatusBar`/`SpeechTimer`/`Toast`。
- **聊天室浮動球**：`ChatFab.tsx`（共用殼：右下角圓球 + 未讀徽章，點開滑出面板——手機貼底整寬、寬螢幕
  ≥480px 右下浮窗；多球同頁用 `slot` 決定堆疊、同頁同時只開一面板）+ `ChatRoom.tsx`（共用內容層：訊息列表/
  輸入列/SSE 或輪詢/暱稱 localStorage/黏底捲動/GM 徽章，`gm=true` 走 `api.getGmChat`/`sendGmChat`）。
  各頁配置：`WatchPage` 1 球（陽間）、`GhostPage` 2 球（陰間 `Ghost` 永遠有＋陽間 `showChat` 時才有）、
  `GamePage` GM 雙球（陰間 `ghostEnabled`＋陽間 `showChat`，走 gm 模式，取代舊的 💬 按鈕/`GmChatSheet`）。
  未讀數以 `localStorage(lycaon:seen:<key>)` 記最後已讀訊息 id 計算。舊的 `WatchChat.tsx` 內嵌版與
  `GmChatSheet.tsx` 已移除。
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
- ✅ **觀戰頁聊天室**：獨立 `chat` 資料表（`server/src/db.ts` 的 `appendChat`/`listChat`），**不進 events 表、不經
  reducer、與 undo/redo 無關**。掛在 `/api/watch/:token/chat`（GET 歷史 50 則、POST 送出），免密碼、token 無效或
  同樂未開啟一律 404。`server/src/live.ts` 的 `LiveEvent` 擴充為 `{kind:'update'} | {kind:'chat', message}`——
  聊天走 `notifyChat`，觀戰 SSE 收到 `chat` 事件直接 append（不重拉快照）；`update` 行為不變。
  Rate limit：同 token 同 IP 每 3 秒 1 則（in-memory Map，單進程前提同 live.ts）。WatchPage 底部聊天區，
  暱稱存 `localStorage(lycaon:chatnick)`，XSS 靠 React 純文字渲染（不用 dangerouslySetInnerHTML）。
- ✅ **陰間（死者視角）+ GM 聊天監看**（`feat/ghost`）：死者專用連結 `/ghost/:token`——`ghostEnabled` 開啟後
  未開眼＝觀眾等級（複用 `buildSpectatorView`）、開眼（`ghostCanReveal`）＝GM 全知視角：`engine/src/watch.ts`
  的 `buildGhostView` 全底牌（role/lover/converted）、完整天數投票與時間軸含夜晚行動與查驗（`state.log` 全量，
  僅過濾 `kind==='note'`）、不拉夜幕（`stage` 照實回 `night` 但照樣給盤面）、待公佈死亡照給；回傳型別 `GhostView`
  帶 `god: true`（`canReveal=false` 時**route 層**降級回 `buildSpectatorView` 並補 `god:false`，engine 不做降級邏輯）。
  - 聊天室擴充為雙房：`chat` 表加 `scope`（'watch'|'ghost'）與 `is_gm`（server/src/db.ts `addCol` 遷移模式）；
    `appendChat`/`listChat` 依 scope 分房；GM 端 `/api/games/:id/chat*` 兩房都能看/發、免 rate limit、
    `nick` 固定 `'GM'`、`isGm=1`（client 顯示金色徽章）。
  - token 與密碼兩套憑證不交叉：watch token 打 ghost API、ghost token 打 watch API 一律 404。
  - `GamePage` 底部列 `MessageCircle` icon（陽間或陰間聊天啟用時才顯示）開 GM 聊天 sheet（雙分頁，
    未讀紅點存 `localStorage(lycaon:chatseen:<id>)`）；`ShareSheet` 第三張卡「👻 陰間」（啟用開關、
    死者連結複製＋QR、「死者可開眼看底牌」開關，皆預設關，格式比照邀請連結卡）；`GhostPage` 開天眼開關存
    `localStorage(lycaon:ghosteye:<token>)`。`npm test` 綠（含 `server/test/ghost.test.ts` 覆蓋 token 隔離/
    canReveal 降級/聊天分房/GM 密碼與 rate limit）。
- ✅ **AI 規則問答（GM 專用）**（`feat/ai-rules-chat`）：後端串 Cloudflare Workers AI 的 OpenAI 相容端點
  （`server/src/ai.ts` 的 `aiEnabled`/`askAi`，AbortController 60s 逾時、錯誤絕不含 token）。金鑰放 `server/.env`
  （gitignored，樣板見 `server/.env.example`），由零依賴載入器 `server/src/env.ts` 於 `index.ts` 最頂端載入
  （`import.meta.url` 定位、只補未定義的 key）。system prompt（`server/src/aiPrompt.ts`）＝繁中指示＋九支引擎規則檔
  原文（模組層快取，唯一規則權威、未定義即由 GM 裁定）＋`engine/src/summary.ts` 的 `buildSituationSummary`
  組出的 GM 全知戰況；chat 走 `scope='ai'` 獨立房（不進 watch/ghost SSE、與 undo 無關）。client 端 GamePage
  以聊天球呈現（一問一答、GM/AI 徽章）。`npm test` 綠（含 `server/test/ai-chat.test.ts` 與 `engine/test/summary.test.ts`）。
- ⬜ Google 登入（綁定名冊繼承戰績）為未來項目。
- ⬜ 場外待辦：CF Access bypass 清單需補 `/ghost/*` 與 `/api/ghost/*`（陰間端已在 server 端過濾，比照
  `/watch/*` 與 `/api/watch/*` 的放行原則；`/api/games/*` 依然絕不可放行）。

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
- **陰間模式對外開放時（場外待辦，尚未在 CF 上設定）**：bypass 清單需比照同樣原則加 `/ghost/*` 與
  `/api/ghost/*`——`ghostCanReveal` 的降級把關在 server 端（`routes/ghost.ts` 的 `resolve`/`buildGhostView`
  分支），放行這兩條不會外流未開眼的底牌。`/api/games/:id/chat*`（GM 聊天監看）過 `checkAuth`，仍歸在
  `/api/games/*` 的「絕不可放行」規則內，不隨陰間模式放寬。
- **兩道鎖並存**：房主管理密碼是應用層第二道鎖，但**列表/建局/無密碼舊局仍靠 CF 擋整站**（密碼只保護個別上鎖的局）。
  若未來要完全撤掉 CF Access（讓場外朋友免 Zero Trust 觀戰），需先補「列表與建局也要身分驗證」，否則首頁全裸。
- **AI 金鑰**：`server/.env` 放 `AI_BASE_URL`/`AI_TOKEN`/`AI_MODEL`（Cloudflare Workers AI 的 OpenAI 相容端點；
  gitignored，樣板見 `server/.env.example`）。三者齊備 `aiEnabled()` 才為真，缺任一則 AI 規則問答回 503。
  `server/src/env.ts` 於 `index.ts` 最頂端載入，只補 `process.env` 未定義的 key（真實環境變數優先，方便部署覆寫）。
- PM2：`ecosystem.config.cjs`（fork 單實例，因 better-sqlite3 單寫入者）。**關鍵**：script 是 `.ts`，PM2 會依副檔名自動選 `bun`，故設定檔已明確指定 `interpreter: 'node'` + `node_args: '--import tsx'`，勿移除。
- serveStatic 的 root 用 `relative(process.cwd(), clientDist)`：因 `npm start`（cwd=server/）與 PM2（cwd=專案根）的 cwd 不同，這樣兩者都對。
