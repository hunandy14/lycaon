import { useState } from 'react';
import { Link } from 'react-router-dom';

/** 上鎖對局的解鎖畫面：換裝置主持或檢視進行中的局時，輸入房主管理密碼 */
export function UnlockGate({
  busy,
  error,
  onUnlock,
}: {
  busy: boolean;
  error: string | null;
  onUnlock: (pw: string) => void;
}) {
  const [pw, setPw] = useState('');
  return (
    <div className="app">
      <div className="panel unlock-card">
        <div style={{ fontSize: '2.6rem' }}>🔒</div>
        <div className="panel-title" style={{ justifyContent: 'center' }}>需要房主密碼</div>
        <p className="muted small" style={{ marginBottom: 16 }}>
          這是上鎖的對局。輸入房主當初設定的管理密碼即可繼續。
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pw) onUnlock(pw);
          }}
        >
          <input
            className="text-input"
            type="text"
            inputMode="numeric"
            autoFocus
            value={pw}
            placeholder="管理密碼"
            onChange={(e) => setPw(e.target.value)}
            style={{ textAlign: 'center', marginBottom: 12 }}
          />
          <button className="btn btn-primary btn-block" type="submit" disabled={busy || !pw}>
            {busy ? '解鎖中…' : '解鎖'}
          </button>
        </form>
        {error && <p className="small" style={{ color: 'var(--danger)', marginTop: 10 }}>{error}</p>}
        <Link to="/" className="btn btn-ghost btn-block" style={{ marginTop: 12 }}>← 回首頁</Link>
      </div>
    </div>
  );
}
