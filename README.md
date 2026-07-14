# 🐺 狼人殺 GM 輔助系統（lycaon）

手機直式的狼人殺主持人控場儀表板。GM 用實體牌發牌後在手機上輸入座位角色，之後由夜晚／白天精靈一步步引導，系統自動結算死亡（守／救／毒交互）、追蹤技能狀態、偵測勝利條件、記錄完整可回溯的時間軸。

## 特色

- **三個內建板子**：預女獵白、狼王守衛、白狼王騎士（另支援 6–18 人自訂配置）
- **夜晚精靈**：守衛→狼人→女巫→預言家，即時驗證非法操作（連守、重複用藥、查驗結果即時顯示）
- **白天流程**：警長競選（1.5 票、警徽流）、逐票記錄放逐投票、平票 PK
- **技能連鎖**：獵人／黑狼王開槍、白狼王自爆帶人、騎士決鬥、白癡翻牌，全部自動連鎖並即時判定勝負
- **隨時撤銷**：輸錯一步可撤銷／重做，或從時間軸「回退到此」
- **斷線恢復**：關掉瀏覽器重開，對局狀態完整還原

## 技術架構

事件溯源（event sourcing）：事件流只存「GM 的輸入」，遊戲狀態由純函式引擎推導，因此撤銷＝回退事件重播、時間軸＝事件流本身。三個 workspace：

- `engine/` — 純函式規則引擎（前後端共用，55 個測試涵蓋真值表／技能連鎖／警長／整局 golden replay／回放一致性）
- `server/` — Hono + SQLite 事件儲存與 REST API
- `client/` — React + Vite 手機直式 UI

## 開發

```bash
npm install
npm run dev      # server:5177 + vite:5173，手機連 http://<你的電腦IP>:5173
npm test         # 引擎測試
```

## 部署（PM2 常駐 + Cloudflare Tunnel → werewolfs.win）

server 預設**只綁 127.0.0.1**，不對區網／公網開放；外部一律走 Cloudflare Tunnel（同機 localhost 連入），避免有人直連埠繞過 Zero Trust 驗證。

```bash
npm run build                    # 打包 client/dist（PM2 只跑 server，需要 dist 才能單埠服務）
pm2 start ecosystem.config.cjs   # 常駐，預設 127.0.0.1:5177，單一程序服務 API + 靜態檔 + SPA
pm2 logs lycaon                  # 看即時日誌
pm2 restart lycaon               # 改程式碼後重啟
pm2 save && pm2 startup          # 開機自動拉起（照 pm2 startup 印出的指令再跑一次）

# Cloudflare Tunnel 綁網域（cloudflared 從同機連 localhost:5177）：
cloudflared tunnel create lycaon
#   在 ~/.cloudflared/config.yml：ingress: hostname werewolfs.win → service http://localhost:5177
cloudflared tunnel route dns lycaon werewolfs.win
cloudflared tunnel run lycaon
```

環境變數：`PORT`（預設 5177）、`HOST`（預設 `127.0.0.1`；要區網直連測試才設 `0.0.0.0`）、`LYCAON_DB`（預設 `server/data/lycaon.sqlite`）。

> 開發用 `npm run dev` 的 Vite（:5173）為了手機同 wifi 測試預設開放區網（`host: true`）。這台機器有公網 IP，dev server 開著時區網／公網可直連——只在需要時開，用完關掉；正式服務請走上面的 PM2 + Tunnel。
