import type { TextFieldProps } from '@mui/material';
import { TextField } from '@mui/material';

const ADD_PLAYER = '__add_player__';
interface SelectablePlayer {
  id: string;
  name: string;
  category?: string;
}
export type PlayerSelectProps<T extends SelectablePlayer> = Omit<
  TextFieldProps,
  'onChange' | 'value'
> & {
  players: T[];
  player?: { id: string | null; name: string } | null;
  excludedIds?: (string | null)[];
  onChange: (player: T | null) => void;
  onAddPlayer: () => void;
};
export const PlayerSelect = <T extends SelectablePlayer>({
  players,
  player,
  excludedIds = [],
  onChange,
  onAddPlayer,
  ...props
}: PlayerSelectProps<T>) => {
  const available = players
    .filter((p) => p.id === player?.id || !excludedIds.includes(p.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' }));
  const missing = player?.id && !players.some((p) => p.id === player.id);
  return (
    <TextField
      {...props}
      select
      value={player?.id ?? ''}
      slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
      onChange={(event) => {
        if (event.target.value === ADD_PLAYER) onAddPlayer();
        else onChange(players.find((p) => p.id === event.target.value) ?? null);
      }}
    >
      <option value="">Select player</option>
      {missing && <option value={player.id!}>{player.name} · Removed</option>}
      {available.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
          {p.category === 'fixed' ? ' · Fixed' : ' · Sub'}
        </option>
      ))}
      <option value={ADD_PLAYER}>＋ Add player…</option>
    </TextField>
  );
};
