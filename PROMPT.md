你在 Ralph loop 的一輪裡，工作目錄是 git worktree `/srv/www/lycaon-chat`（分支 feat/watch-chat）。

1. 讀 `SPEC-chat.md`（含「不可違反的紀律」「架構拍板」「已知教訓」全部）。
2. 找「步驟」清單裡**第一個未勾選**的項目，**只做那一步**，不要多做。
3. 完成後跑閘門：`npm test && npx tsc -p server/tsconfig.json`。
   - 全綠：把該步驟勾選（`- [ ]` → `- [x]`），`git add -A && git commit -m "chat step N: <摘要>"`，然後結束這一輪。
   - 紅：修到綠。若同一個問題嘗試 3 次仍失敗，把狀況與你學到的教訓寫進 SPEC 的
     「已知教訓」區、revert 未 commit 的變更（`git checkout -- .` 但保留 SPEC-chat.md 的教訓），然後結束這一輪。
4. 若所有步驟都已勾選且工作樹乾淨，只輸出 `RALPH_DONE` 然後結束。

規則：不問問題、不等待輸入；不動 `/srv/www/lycaon`（主 repo）；不執行 pm2 或任何部署指令；不 push。
**絕對禁止**：不啟動任何 server / dev server（驗證一律靠測試與 tsc，不靠手動跑起來）；
不 kill 任何行程、不對 5177 埠做任何事（production 正在上面跑）；不執行 rm -rf、不刪 SPEC 之外的檔案。
