import { useEffect, useState } from 'react';
import { Check, Copy, QrCode as QrIcon } from 'lucide-react';
import QRCode from 'qrcode';

/** 設定面板共用：開關列 */
export function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
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

/** 設定面板共用：連結卡（標題＋灰字連結＋複製/QR icon＋QR 置中 dialog） */
export function LinkCard({ title, url, qrHint }: { title: string; url: string; qrHint: string }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  // QR 純前端生成
  useEffect(() => {
    if (showQr) {
      QRCode.toDataURL(url, { width: 440, margin: 1 }).then(setQr).catch(() => setQr(null));
    }
  }, [url, showQr]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      prompt('手動複製連結：', url);
    }
  };

  return (
    <>
      <div className="card" style={{ padding: 12, marginBottom: 8 }}>
        <div className="row" style={{ alignItems: 'center', gap: 8 }}>
          <div className="grow" style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{title}</div>
            <div className="faint small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</div>
          </div>
          <button className="btn btn-sm" onClick={copy} aria-label={`複製${title}`} style={{ display: 'inline-flex', padding: 9 }}>
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
            <img src={qr} alt={`${title} QR Code`} style={{ width: 'min(64vw, 280px)', height: 'auto', borderRadius: 12, background: '#fff', padding: 10 }} />
            <div className="faint small" style={{ marginTop: 8 }}>{qrHint}</div>
            <button className="btn btn-sm btn-block" style={{ marginTop: 10 }} onClick={() => setShowQr(false)}>關閉</button>
          </div>
        </div>
      )}
    </>
  );
}
