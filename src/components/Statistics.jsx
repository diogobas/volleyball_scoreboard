import { matchResult } from '../game/matchResult';
import { matchPlayerStats, setRanking, teamMatchPlayers } from '../game/match';
import StatisticsView from './StatisticsView';

export default function Statistics({ state, teamOrder }) {
  const topPlayers = matchPlayerStats(state)
    .filter((player) => player.matchPoints > 0)
    .sort((a, b) => b.matchPoints - a.matchPoints)
    .slice(0, 3)
    .map((player) => ({
      ...player,
      id: player.personId ?? `${player.teamId}-${player.id}`,
      points: player.matchPoints,
    }));
  const teams = teamOrder.map((id) => ({
    id,
    name: state.teams[id].name,
    players: teamMatchPlayers(state, id).map((player) => ({
      ...player,
      points: player.matchPoints,
    })),
  }));
  const sets = state.log
    .filter((entry) => entry.type === 'set')
    .map((entry) => ({ ...entry, ranking: setRanking(state, entry.setNumber) }));
  return <StatisticsView topPlayers={topPlayers} teams={teams} sets={matchResult(sets).sets} />;
}
