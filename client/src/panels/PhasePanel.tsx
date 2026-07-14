import type { PanelProps } from './types';
import { SetupPanel } from './SetupPanel';
import { NightWizard } from './NightWizard';
import { DawnPanel } from './DawnPanel';
import { SheriffPanel } from './SheriffPanel';
import { ResolvePanel } from './ResolvePanel';
import { VotePanel } from './VotePanel';
import { DayEndPanel } from './DayEndPanel';
import { GameOverPanel } from './GameOverPanel';
import { SeatGrid } from '../components/SeatGrid';

export function PhasePanel(props: PanelProps) {
  const { state } = props;

  if (state.phase.t === 'ended') return <GameOverPanel {...props} />;
  if (state.phase.t === 'setup') return <SetupPanel {...props} />;

  // 待辦佇列優先：佇列非空時引擎擋掉其他事件，必須先消化
  if (state.actionQueue.length > 0) return <ResolvePanel {...props} />;

  if (state.phase.t === 'night') return <NightWizard {...props} />;

  if (state.phase.t === 'day') {
    switch (state.phase.stage) {
      case 'sheriff':
        return <SheriffPanel {...props} />;
      case 'announce':
        return <DawnPanel {...props} />;
      case 'speech':
      case 'pk':
        return <VotePanel {...props} />;
      case 'dayEnd':
        return <DayEndPanel {...props} />;
    }
  }
  // 後備：顯示盤面
  return <SeatGrid state={state} />;
}
