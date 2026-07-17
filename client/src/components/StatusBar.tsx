import { dashboardStats, type GameState } from '@lycaon/engine';

export function StatusBar({ state }: { state: GameState }) {
  const s = dashboardStats(state);
  const hasWitch = state.config.seats.some((x) => x.role === 'witch');
  const hasGuard = state.config.seats.some((x) => x.role === 'guard');
  const hasSeedWolf = state.config.seats.some((x) => x.role === 'seedWolf');
  const lastGuard = state.lastGuardTarget;

  return (
    <div className="statusbar" style={{ margin: '10px 0' }}>
      <span className="stat stat-wolf">狼 <b>{s.wolves}</b></span>
      <span className="stat stat-god">神 <b>{s.gods}</b></span>
      <span className="stat stat-villager">民 <b>{s.villagers}</b></span>
      <span className="stat">存活 <b>{s.aliveTotal}</b></span>
      {hasWitch && (
        <span className="stat">
          <span className={state.potions.antidote ? '' : 'potion-used'}>解🧪</span>
          <span className={state.potions.poison ? '' : 'potion-used'}>毒☠️</span>
        </span>
      )}
      {hasGuard && lastGuard !== null && <span className="stat">昨守 <b>{lastGuard}</b></span>}
      {hasSeedWolf && (
        <span className="stat">
          <span className={state.seedWolfUsedOnNight === null ? '' : 'potion-used'}>感染🦠</span>
        </span>
      )}
    </div>
  );
}
