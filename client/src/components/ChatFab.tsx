import { X, type LucideIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

/** 右下角浮動聊天球（共用殼）：icon 球 + 未讀徽章，點開滑出面板（手機貼底、寬螢幕浮窗右下）。
 *  多球同頁由 slot 決定堆疊位置（0 在最下面）。內容（訊息列表/輸入列）由呼叫端經 children 傳入
 *  （見 ChatRoom.tsx），此殼只管「球＋面板框＋開關」。 */
export function ChatFab({
  icon: Icon,
  label,
  accent,
  unread = 0,
  open,
  onToggle,
  slot = 0,
  children,
}: {
  icon: LucideIcon;
  label: string;
  accent: string;
  unread?: number;
  open: boolean;
  onToggle: () => void;
  slot?: number;
  children: ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        className="fab-ball"
        style={{ '--fab-slot': slot, background: accent } as CSSProperties}
        aria-label={open ? `關閉${label}` : `開啟${label}`}
        title={label}
        onClick={onToggle}
      >
        {open ? <X size={22} /> : <Icon size={22} />}
        {!open && unread > 0 && <span className="fab-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="fab-panel" style={{ '--fab-slot': slot } as CSSProperties}>
          <div className="fab-panel-header">
            <span className="fab-panel-title">
              <Icon size={16} /> {label}
            </span>
            <button type="button" className="fab-panel-close" aria-label="關閉" onClick={onToggle}>
              <X size={18} />
            </button>
          </div>
          <div className="fab-panel-body">{children}</div>
        </div>
      )}
    </>
  );
}
