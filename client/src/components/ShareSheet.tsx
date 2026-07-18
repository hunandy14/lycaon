import { useEffect, useState } from 'react';
import { Check, Copy, QrCode as QrIcon } from 'lucide-react';
import QRCode from 'qrcode';
import type { ShareSettings } from '@lycaon/engine';
import { api, type ShareInfo } from '../api';

/** 同樂模式設定（GM 端底部彈窗）：開關、邀請連結、可視情報項目 */
export function ShareSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

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

  // QR 純前端生成（掃了直接進觀戰頁）
  useEffect(() => {
    if (url && showQr) {
      QRCode.toDataURL(url, { width: 440, margin: 1 }).then(setQr).catch(() => setQr(null));
    }
  }, [url, showQr]);

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
              <div className="card" style={{ padding: 12, marginBottom: 8 }}>
                <div className="row" style={{ alignItems: 'center', gap: 8 }}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>邀請連結</div>
                    <div className="faint small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</div>
                  </div>
                  <button className="btn btn-sm" onClick={copy} aria-label="複製邀請連結" style={{ display: 'inline-flex', padding: 9 }}>
                    {copied ? <Check size={17} /> : <Copy size={17} />}
                  </button>
                  <button
                    className={`btn btn-sm ${showQr ? 'btn-primary' : ''}`}
                    onClick={() => setShowQr((v) => !v)}
                    aria-label="顯示 QR Code"
                    style={{ display: 'inline-flex', padding: 9 }}
                  >
                    <QrIcon size={17} />
                  </button>
                </div>
              </div>
            )}

            {showQr && qr && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setShowQr(false);
                }}
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 60,
                  background: 'rgba(0,0,0,0.65)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div className="panel center" style={{ padding: 18 }} onClick={(e) => e.stopPropagation()}>
                  <img src={qr} alt="觀戰連結 QR Code" style={{ width: 'min(64vw, 280px)', height: 'auto', borderRadius: 12, background: '#fff', padding: 10 }} />
                  <div className="faint small" style={{ marginTop: 8 }}>掃碼直接進觀戰頁</div>
                  <button className="btn btn-sm btn-block" style={{ marginTop: 10 }} onClick={() => setShowQr(false)}>關閉</button>
                </div>
              </div>
            )}

            {s!.enabled && (
              <>
                <p className="faint small" style={{ margin: '2px 0 8px' }}>
                  🌙 夜晚拉夜幕、白天只報今天的戰況（前一天的自己記）；人人同一份、無身份。
                </p>
                <Row label="投票明細" hint="每輪票型與棄票（桌上舉手本來就公開；關閉後票型不顯示）" value={s!.showVotes} onChange={(v) => patch({ showVotes: v })} />
                <Row label="公開時間軸" hint="GM 口播等級的事件流（夜晚行動、死因、查驗一律不含）" value={s!.showTimeline} onChange={(v) => patch({ showTimeline: v })} />
                <Row label="陽間聊天室" hint="觀戰頁的公開聊天區（人人可見可發言）；關閉後不顯示也不能發言" value={s!.showChat} onChange={(v) => patch({ showChat: v })} />
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
