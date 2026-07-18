import { useEffect, useState } from 'react';
import type { ShareSettings } from '@lycaon/engine';
import { api, type ShareInfo } from '../api';
import { LinkCard, ToggleRow } from './sheetParts';

/** 同樂模式設定（GM 端底部彈窗）：開關、邀請連結、可視情報項目 */
export function ShareSheet({ id, onClose }: { id: string; onClose: () => void }) {
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
  const url = info?.token && s?.enabled ? `${location.origin}/watch/${info.token}` : null;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">📡 同樂模式</div>
        <div className="panel-hint">產生觀戰連結給朋友即時看戰況；公開哪些情報由你決定，隨時可改。</div>

        {!info ? (
          <p className="muted small">{err ?? '載入中…'}</p>
        ) : (
          <>
            <ToggleRow label="開啟同樂模式" hint="關閉後連結立即失效；重新開啟連結不變" value={s!.enabled} onChange={(v) => patch({ enabled: v })} />

            {url && <LinkCard title="邀請連結" url={url} qrHint="掃碼直接進觀戰頁" />}

            {s!.enabled && (
              <>
                <ToggleRow label="投票明細" hint="每輪票型與棄票（桌上舉手本來就公開；關閉後票型不顯示）" value={s!.showVotes} onChange={(v) => patch({ showVotes: v })} />
                <div className="card" style={{ marginBottom: 8, padding: 12 }}>
                  <div className="row" style={{ alignItems: 'center' }} onClick={() => patch({ showTimeline: !s!.showTimeline })}>
                    <div className="grow">
                      <div style={{ fontWeight: 600 }}>公開時間軸</div>
                      <div className="faint small">GM 口播等級的事件流（夜晚行動、死因、查驗一律不含）</div>
                    </div>
                    <div className={`toggle ${s!.showTimeline ? 'on' : ''}`}>
                      <div className="toggle-knob" />
                    </div>
                  </div>
                  <div
                    className="row"
                    style={{ alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}
                    onClick={() => patch({ showAllDays: !s!.showAllDays })}
                  >
                    <div className="grow">
                      <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>全程戰況</div>
                      <div className="faint small">從第 1 天到現在的投票與事件都看得到；關閉時只報今天（前一天的自己記）</div>
                    </div>
                    <div className={`toggle ${s!.showAllDays ? 'on' : ''}`}>
                      <div className="toggle-knob" />
                    </div>
                  </div>
                </div>
                <ToggleRow label="陽間聊天室" hint="觀戰頁的公開聊天區（人人可見可發言）；關閉後不顯示也不能發言" value={s!.showChat} onChange={(v) => patch({ showChat: v })} />
                <ToggleRow label="死亡時間與死因" hint="死者格顯示哪一天死、白天死因（夜間死因一律不含；終局一律顯示）" value={s!.showDeathInfo} onChange={(v) => patch({ showDeathInfo: v })} />
              </>
            )}
            {err && <p className="small" style={{ color: 'var(--danger)' }}>{err}</p>}
          </>
        )}

        <button className="btn btn-block" style={{ marginTop: 10 }} onClick={onClose}>關閉</button>
      </div>
    </div>
  );
}
