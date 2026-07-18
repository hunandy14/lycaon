#!/usr/bin/env bash
# Ralph loop：每輪開一個全新 claude 實例做 SPEC 的下一步。
# 權限走 .claude/settings.local.json 白名單（headless 下未授權動作自動拒絕，不會卡住）。
# 用法：./ralph.sh [最大輪數]（預設 15）
set -u
cd "$(dirname "$0")"

MAX="${1:-15}"
MODEL="${RALPH_MODEL:-sonnet}"

for i in $(seq 1 "$MAX"); do
  echo "=============== ROUND $i / $MAX ($(date +%H:%M:%S)) ===============" | tee -a ralph.log

  claude -p "$(cat PROMPT.md)" \
    --model "$MODEL" \
    2>&1 | tee -a ralph.log

  # 全部勾完（或模型宣告完成）就停
  if ! grep -q '^- \[ \]' SPEC-chat.md; then
    echo "=== 所有步驟完成，迴圈結束（round $i）===" | tee -a ralph.log
    break
  fi
  if tail -n 5 ralph.log | grep -q 'RALPH_DONE'; then
    echo "=== 模型宣告 RALPH_DONE，迴圈結束（round $i）===" | tee -a ralph.log
    break
  fi
done

echo "=== ralph.sh 結束。看 ralph.log 與 git log --oneline 檢視成果 ==="
