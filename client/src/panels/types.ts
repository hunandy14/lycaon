import type { GameEvent, GameState } from '@lycaon/engine';

export interface PanelProps {
  state: GameState;
  dispatch: (event: GameEvent) => Promise<boolean>;
  busy: boolean;
}
