# 聊天室浮動球（FAB）統一改版 SPEC（loop 用）

目標：把三處聊天介面統一成「右下角浮動圓球」模式（現代網站客服窗風格，如 Intercom/Messenger）：
圓球固定右下、未讀紅點數字、點開浮出聊天面板。觀戰頁 1 球（陽間）、陰間頁 2 球（陰間+陽間）、
GM 主持頁 2 球（陰間+陽間，走 GM 通道）。**純 client UI 改版，不動 server 與 engine。**

## 不可違反的紀律（每輪必讀）

1. **不動 server/、不動 engine/**（API 與資料流完全沿用現有的）。改到就是做錯了。
2. 不碰 production：不執行 pm2、不讀寫 server/data/、不動主 repo `/srv/www/lycaon`。
   **絕對禁止**：啟動任何 server / dev server（驗證只靠 tsc 與 build）、kill 任何行程、碰 5177 埠、
   git push、合併 main、rm -rf、刪除 SPEC 之外既有檔案。
3. XSS：訊息一律 React 純文字渲染。UI 繁體中文、手機直式優先、暗色主題（CSS 變數在 styles.css :root）。
4. icon 用 lucide-react（已安裝）：聊天球 `MessageCircle`、陰間球 `Ghost`、關閉 `X`。
5. 閘門：`npm test && npx tsc -p client/tsconfig.json && npm run build` 全綠才 commit。
   commit 訊息格式：`fab step N: <摘要>`。
6. 舊元件替換後要刪乾淨：不留死碼（WatchChat 內嵌版與 GmChatSheet 最終要被取代移除，
   含 GamePage 底部列的 💬 聊天按鈕與其未讀輪詢邏輯——搬進新元件，不是複製一份）。

## 設計拍板（不要重新發明）

- **`components/ChatFab.tsx`（新，共用殼）**：
  - props：`icon`（lucide 元件）、`label`（無障礙/tooltip 用）、`accent`（球的主色，陰間紫 `#a78bfa`、
    陽間用主題 accent）、`unread`（數字，0 不顯示）、`open`、`onToggle`、`children`（面板內容）。
  - 圓球：`position: fixed`，直徑 52px，圓形、投影、icon 置中；未讀時右上角紅色數字徽章（9+ 顯示「9+」）。
  - 多球同頁由 `slot` prop（0,1,…）決定位置：`bottom: calc(18px + slot*64px)`，`right: 14px`，直向堆疊。
  - 點球開面板：面板 `position: fixed`，手機直式＝貼底部整寬、高 68vh、圓角上緣、滑入動畫（transform+opacity，
    CSS transition 即可）；寬 ≥ 480px 時改右下角浮窗（寬 360px、高 480px，錨在球上方）。
    面板 header：icon + 標題 + X 關閉鈕。開面板時球變 X（或隱藏），同頁同時只開一個面板
    （父層管 state：開 B 自動關 A）。z-index 高於 sheet（現有 QR dialog 用 60，球用 55、面板用 58）。
  - CSS 寫在 components.css，class 前綴 `fab-`。
- **`components/ChatRoom.tsx`（新，共用聊天內容）**：從現有 WatchChat.tsx 抽出「訊息列表＋輸入列＋
  SSE/輪詢＋暱稱 localStorage＋黏底捲動＋GM 徽章＋429/400 Toast」的內容層（不含外框標題）。
  props 沿用 WatchChat 現有參數（token、base、scope、live、disabled）＋`gm` 模式
  （gm=true 時走 api.getGmChat/sendGmChat、無暱稱輸入、輪詢 3 秒——邏輯從 GmChatSheet 搬過來）。
- **未讀數**：各房以 `localStorage(lycaon:seen:<key>)` 記最後已讀訊息 id（key=token+scope 或 gm+id+scope），
  未讀＝目前訊息列表中 id 大於已讀值的數量；面板開著時持續更新已讀。GamePage 現有的 15 秒
  getShare 輪詢與未讀邏輯搬進新實作（per-room 分開計）。
- **各頁配置**：
  - `WatchPage`：移除內嵌 `<WatchChat>`；`settings.showChat` 時右下 1 球（MessageCircle、slot 0）。
  - `GhostPage`：移除兩個內嵌 `<WatchChat>`；slot 0＝👻 陰間球（永遠有）、slot 1＝☀️ 陽間球
    （settings.showChat 時才有）。
  - `GamePage`：移除底部列 💬 按鈕與 GmChatSheet；陰間球（ghostEnabled 時）＋陽間球（showChat 時），
    走 gm 模式。頁面底部原有操作按鈕與 FAB 重疊風險：面板開啟時不遮 header 即可，球本身
    避開底部列（bottom 18px 起跳已在按鈕列之上，可接受）。
  - `WatchChat.tsx` 與 `GmChatSheet.tsx` 移除（功能全數由 ChatFab+ChatRoom 取代）；
    components.css 裡孤兒樣式（.chat-* 仍被 ChatRoom 用就留著，sheet 專屬的刪掉）。
- **關鍵既有檔**：client/src/components/WatchChat.tsx、GmChatSheet.tsx、components.css、
  pages/WatchPage.tsx、GhostPage.tsx、GamePage.tsx、api.ts（API 不改，只是呼叫）。

## 步驟（依序執行第一個未勾選的，一輪只做一步）

- [x] 1. **ChatFab 殼 + ChatRoom 內容元件**：兩個新元件 + fab- CSS（含手機/寬螢幕兩種面板版型、
      滑入動畫、未讀徽章、slot 堆疊）。此步先不接頁面（元件能編譯即可）。
- [ ] 2. **WatchPage 接 1 球**：移除內嵌聊天，接 ChatFab(slot 0)+ChatRoom；未讀數邏輯上線。
- [ ] 3. **GhostPage 接 2 球**：移除兩個內嵌聊天，陰間/陽間雙球；同頁單面板互斥。
- [ ] 4. **GamePage GM 雙球**：移除 💬 按鈕與 GmChatSheet 引用，gm 模式雙球（含原 15s 輪詢
      顯示條件與未讀搬遷）；刪除 WatchChat.tsx、GmChatSheet.tsx 與孤兒 CSS。
- [ ] 5. **收尾總驗**：CLAUDE.md client 段更新（聊天 FAB 描述）；全閘門 + `npm run build`；
      grep 確認無殘留 import WatchChat/GmChatSheet。

## 已知教訓（卡住時把修正寫在這，給下一輪看）

（空）

## 完成定義

所有步驟勾選、閘門全綠、工作樹乾淨。**停在 feat/chat-fab 分支——絕不合併 main、絕不部署**。
屆時輸出 `RALPH_DONE`。
