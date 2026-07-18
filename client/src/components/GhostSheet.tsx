import { useEffect, useState } from 'react';
import type { ShareSettings } from '@lycaon/engine';
import { api, type ShareInfo } from '../api';
import { LinkCard, ToggleRow } from './sheetParts';

/** 陰間設定（GM 端底部彈窗）：死者連結開關、複製/QR、可否開眼 */
export function GhostSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.getShare(id).then(setInfo).catch((e) => setErr((e as Error).message));
  }, [id]);

  const patch = async (p: Partial<ShareSettings>) => {
    if (!info) return;
    setInfo({ ...info, settings: { ...info.settings, ...p } }); // 樂觀更新
    try {
      setInfo(await api.updateShare(id, p));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const s = info?.settings;
  const ghostUrl = info?.ghostToken && s?.ghostEnabled ? `${location.origin}/ghost/${info.ghostToken}` : null;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">👻 陰間</div>
        <div className="panel-hint">給已死玩家的專屬連結；預設與觀戰同視角，開啟「開眼」才能看全部底牌。連結只發給死者。</div>

        {!info ? (
          <p className="muted small">{err ?? '載入中…'}</p>
        ) : (
          <>
            <ToggleRow label="開啟陰間連結" hint="關閉後連結立即失效；重新開啟連結不變" value={s!.ghostEnabled} onChange={(v) => patch({ ghostEnabled: v })} />

            {ghostUrl && <LinkCard title="死者連結" url={ghostUrl} qrHint="掃碼直接進陰間頁" />}

            {s!.ghostEnabled && (
              <ToggleRow
                label="死者可開眼看底牌"
                hint="開啟後死者連結可切換全知視角：全部身分、完整夜晚行動與查驗結果"
                value={s!.ghostCanReveal}
                onChange={(v) => patch({ ghostCanReveal: v })}
              />
            )}
            {err && <p className="small" style={{ color: 'var(--danger)' }}>{err}</p>}
          </>
        )}

        <button className="btn btn-block" style={{ marginTop: 10 }} onClick={onClose}>關閉</button>
      </div>
    </div>
  );
}
