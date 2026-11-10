import { Tab, Tabs } from '@mui/material';
import type { SyntheticEvent } from 'react';

export type MatchView = 0 | 1;
export interface MatchViewTabsProps {
  tab: MatchView;
  onChange: (event: SyntheticEvent, value: MatchView) => void;
}

export const MatchViewTabs = ({ tab, onChange }: MatchViewTabsProps) => {
  return (
    <Tabs
      value={tab}
      onChange={onChange}
      variant="fullWidth"
      className="tabs"
      aria-label="Match view"
    >
      <Tab id="game-tab" aria-controls="game-panel" label="Game" />
      <Tab id="stats-tab" aria-controls="stats-panel" label="Statistics" />
    </Tabs>
  );
};
