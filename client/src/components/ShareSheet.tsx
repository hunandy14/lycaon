import { useEffect, useState } from 'react';
import type { ShareSettings } from '@lycaon/engine';
import { api, type ShareInfo } from '../api';

/** 同樂模式設定（GM 端底部彈窗）：開關、邀請連結、可視情報項目 */
export function ShareSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      prompt('手動複製連結：', url);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">📡 同樂模式</div>
        <div className="panel-hint">產生觀戰連結給朋友即時看戰況；公開哪些情報由你決定，隨時可改。</div>

        {!info ? (
          <p className="muted small">{err ?? '載入中…'}</p>
        ) : (
          <>
            <Row label="開啟同樂模式" hint="關閉後連結立即失效；重新開啟連結不變" value={s!.enabled} onChange={(v) => patch({ enabled: v })} />

            {url && (
              <div className="card" style={{ padding: 10, marginBottom: 8 }}>
                <div className="small faint" style={{ wordBreak: 'break-all' }}>{url}</div>
                <button className="btn btn-primary btn-sm btn-block" style={{ marginTop: 8 }} onClick={copy}>
                  {copied ? '✅ 已複製' : '📋 複製邀請連結'}
                </button>
              </div>
            )}

            {s!.enabled && (
              <>
                <p className="faint small" style={{ margin: '2px 0 8px' }}>
                  🌙 夜晚拉夜幕、白天只報今天的戰況（前一天的自己記）；人人同一份、無身份。
                </p>
                <Row label="投票明細" hint="每輪票型與棄票（桌上舉手本來就公開；關閉後票型不顯示）" value={s!.showVotes} onChange={(v) => patch({ showVotes: v })} />
                <Row label="死者身分公開" hint="死亡立即亮牌＝「明牌局」玩法，場上剩餘狼數會變成可推算；標準暗牌局請關閉（終局仍會攤牌）" value={s!.showDeadRoles} onChange={(v) => patch({ showDeadRoles: v })} />
                <Row label="公開時間軸" hint="GM 口播等級的事件流（夜晚行動、死因、查驗一律不含）" value={s!.showTimeline} onChange={(v) => patch({ showTimeline: v })} />
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

function Row({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="card" style={{ marginBottom: 8, padding: 12 }} onClick={() => onChange(!value)}>
      <div className="row" style={{ alignItems: 'center' }}>
        <div className="grow">
          <div style={{ fontWeight: 600 }}>{label}</div>
          {hint && <div className="faint small">{hint}</div>}
        </div>
        <div className={`toggle ${value ? 'on' : ''}`}>
          <div className="toggle-knob" />
        </div>
      </div>
    </div>
  );
}
