import { Hono } from 'hono';
import type { RoleId } from '@lycaon/engine';
import { buildGameReport } from '@lycaon/engine';
import type { EventStore } from '../db';

export interface PlayerStat {
  name: string;
  /** 已分勝負（finished）的參與局數 */
  games: number;
  wins: number;
  winRate: number;
  /** 各角色被發到幾次 */
  byRole: Partial<Record<RoleId, number>>;
  /** 依開局陣營拆分（當好人 / 當狼） */
  asGood: { games: number; wins: number };
  asWolf: { games: number; wins: number };
}

/** 名冊（自動完成）與跨局戰績聚合。皆為 GM 自己的資料、置於 CF Access 後。 */
export function statsRoutes(store: EventStore): Hono {
  const app = new Hono();

  app.get('/roster', (c) => c.json({ names: store.listRoster() }));

  app.get('/stats', (c) => {
    const agg = new Map<string, PlayerStat>();
    let totalGames = 0;

    for (const g of store.listGames()) {
      if (g.status !== 'finished') continue; // 只計已分勝負的局
      let report;
      try {
        report = buildGameReport(store.loadEnvelopes(g.id));
      } catch {
        continue;
      }
      const winner = report.result.winner?.faction;
      if (!winner) continue;
      totalGames += 1;

      for (const p of report.players) {
        if (!p.name) continue; // 無名座位不列入
        const won =
          (winner === 'good' && p.finalCamp === 'good') ||
          (winner === 'wolf' && p.finalCamp === 'wolf') ||
          (winner === 'lovers' && p.finalCamp === 'third');
        const st =
          agg.get(p.name) ??
          { name: p.name, games: 0, wins: 0, winRate: 0, byRole: {}, asGood: { games: 0, wins: 0 }, asWolf: { games: 0, wins: 0 } };
        st.games += 1;
        if (won) st.wins += 1;
        st.byRole[p.role] = (st.byRole[p.role] ?? 0) + 1;
        const bucket = p.originalFaction === 'wolf' ? st.asWolf : st.asGood;
        bucket.games += 1;
        if (won) bucket.wins += 1;
        agg.set(p.name, st);
      }
    }

    const players = [...agg.values()]
      .map((s) => ({ ...s, winRate: s.games ? s.wins / s.games : 0 }))
      .sort((a, b) => b.games - a.games || b.winRate - a.winRate || a.name.localeCompare(b.name));

    return c.json({ totalGames, players });
  });

  return app;
}
