import type { ReactNode } from 'react';
import { CAUSE_LABEL, loversAreThirdParty, type GameState, type SeatId } from '@lycaon/engine';
import { factionColor, roleShort } from '../ui/roleStyle';

interface Props {
  state: GameState;
  /** 可選取的座位；未提供 = 全部可點（純顯示時不傳 onPick 即可） */
  eligible?: SeatId[];
  /** 已選中的座位 */
  selected?: SeatId[];
  onPick?: (seat: SeatId) => void;
  /** 每個座位額外標記（如「昨夜死亡」） */
  markers?: Partial<Record<SeatId, ReactNode>>;
  /** 是否顯示角色（GM 工具預設顯示） */
  showRoles?: boolean;
}

export function SeatGrid({ state, eligible, selected, onPick, markers, showRoles = true }: Props) {
  const selectable = !!onPick;
  const selectedSet = new Set(selected ?? []);
  const eligibleSet = eligible ? new Set(eligible) : null;

  // 預言家查驗結果：座位 → 結果
  const checks = new Map<SeatId, 'wolf' | 'good'>();
  for (const c of state.seerChecks) checks.set(c.target, c.result);

  const pendingDead = new Set(state.pendingDeaths.map((d) => d.seat));

  const lovers = new Set<SeatId>(state.lovers ?? []);
  // 跨陣營情侶 = 第三方：情侶 + 邱比特框成一組（粉色外框）
  const thirdParty = new Set<SeatId>();
  if (loversAreThirdParty(state)) {
    for (const s of lovers) thirdParty.add(s);
    const cupid = state.players.find((x) => x.role === 'cupid');
    if (cupid) thirdParty.add(cupid.seat);
  }

  return (
    <div className="seatgrid">
      {state.players.map((p) => {
        const dead = !p.alive;
        const isEligible = eligibleSet ? eligibleSet.has(p.seat) : true;
        const disabled = selectable && (!isEligible || dead);
        const chosen = selectedSet.has(p.seat);
        const check = checks.get(p.seat);
        return (
          <button
            key={p.seat}
            className={[
              'seat',
              thirdParty.has(p.seat) ? 'seat-third' : '',
              dead ? 'seat-dead' : '',
              chosen ? 'seat-chosen' : '',
              selectable && !disabled ? 'seat-tappable' : '',
              disabled ? 'seat-disabled' : '',
            ].join(' ')}
            style={{ '--seat-color': p.converted ? 'var(--wolf)' : factionColor(p.role) } as React.CSSProperties}
            onClick={() => onPick && isEligible && !dead && onPick(p.seat)}
            disabled={disabled}
          >
            <div className="seat-top">
              <span className="seat-num">{p.seat}</span>
              {state.sheriff === p.seat && <span className="seat-badge" title="警長">★</span>}
            </div>
            {showRoles && <div className="seat-role">{roleShort(p.role)}</div>}
            {p.name && <div className="seat-name">{p.name}</div>}
            <div className="seat-marks">
              {lovers.has(p.seat) && <span className="chip chip-lover">💘{thirdParty.size > 0 ? '三方' : ''}</span>}
              {thirdParty.has(p.seat) && !lovers.has(p.seat) && <span className="chip chip-lover">三方</span>}
              {p.converted && <span className="chip chip-wolf">感染</span>}
              {p.wolfKingPending && (
                <span className="chip chip-wolf" title="已轉為狼王，下一夜才正式加入刀人">
                  狼王・尚未生效
                </span>
              )}
              {check && <span className={`chip chip-${check}`}>{check === 'wolf' ? '查殺' : '金水'}</span>}
              {p.idiotRevealed && <span className="chip chip-idiot">白癡</span>}
              {pendingDead.has(p.seat) && !dead && <span className="chip chip-pending">待公佈</span>}
              {markers?.[p.seat]}
            </div>
            {dead && (
              <div className="seat-death">
                <span className="seat-x">✕</span>
                <span className="seat-cause">{p.death ? CAUSE_LABEL[p.death.cause] : ''}</span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
