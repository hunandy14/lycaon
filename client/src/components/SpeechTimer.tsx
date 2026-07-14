import { useEffect, useRef, useState } from 'react';

/** 純前端發言計時器（count-up），不進入事件流 */
export function SpeechTimer() {
  const [sec, setSec] = useState(0);
  const [running, setRunning] = useState(false);
  const ref = useRef<number | null>(null);

  useEffect(() => {
    if (running) {
      ref.current = window.setInterval(() => setSec((s) => s + 1), 1000);
      return () => { if (ref.current) window.clearInterval(ref.current); };
    }
  }, [running]);

  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');

  return (
    <div style={{ marginBottom: 12 }}>
      <div className={`timer ${sec >= 60 ? 'low' : ''}`}>{mm}:{ss}</div>
      <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
        <button className="btn btn-sm" onClick={() => setRunning((r) => !r)}>{running ? '暫停' : '開始'}</button>
        <button className="btn btn-sm btn-ghost" onClick={() => { setRunning(false); setSec(0); }}>重置</button>
      </div>
    </div>
  );
}
