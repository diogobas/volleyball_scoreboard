import { useState } from 'react';
import { Button, Chip, Paper, Stack, TextField, Typography } from '@mui/material';
import ListPagination from './ListPagination';
import { normalizeName } from '../game/registry';

export default function GameDayList({
  days,
  busy,
  loading,
  onCreate,
  onRefresh,
  onOpen,
  onEdit,
  onDelete,
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const filtered = days.filter(
    (day) =>
      (status === 'all' || day.state === status) &&
      normalizeName(
        [day.play_date, day.team_a_name, day.team_b_name].filter(Boolean).join(' '),
      ).includes(normalizeName(query)),
  );
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
        <Button variant="contained" disabled={busy || loading} onClick={onCreate}>
          Create game day
        </Button>
        <Button disabled={busy || loading} onClick={onRefresh}>
          Refresh game days
        </Button>
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          size="small"
          label="Search game days"
          placeholder="Date or team name"
          value={query}
          sx={{ flex: 1 }}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
        />
        <TextField
          size="small"
          select
          label="Day status"
          value={status}
          sx={{ minWidth: 150 }}
          slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="all">All days</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </TextField>
      </Stack>
      {loading ? (
        <Typography role="status">Loading game days…</Typography>
      ) : (
        <>
          <ListPagination
            total={filtered.length}
            page={currentPage}
            pageSize={pageSize}
            count={visible.length}
            label="Game days"
            disabled={busy}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
          {!visible.length && (
            <Typography>
              {days.length
                ? 'No game days match this search.'
                : 'No game days yet. Create one to prepare a lineup and operator code.'}
            </Typography>
          )}
          {visible.map((day) => (
            <Paper key={day.id} variant="outlined" sx={{ p: 2 }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                sx={{ justifyContent: 'space-between', gap: 1 }}
              >
                <Stack spacing={1} sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Typography sx={{ fontWeight: 700 }}>{day.play_date}</Typography>
                    <Chip size="small" label={day.state === 'open' ? 'Open' : 'Closed'} />
                  </Stack>
                  {(day.team_a_name || day.team_b_name) && (
                    <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                      {day.team_a_name} × {day.team_b_name}
                    </Typography>
                  )}
                  <Typography variant="body2" color="text.secondary">
                    {day.published_count ?? 0} finalized matches
                  </Typography>
                </Stack>
                <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button disabled={busy} onClick={() => onOpen(day)}>
                    Open day
                  </Button>
                  <Button
                    disabled={busy}
                    aria-label={`Edit day ${day.play_date}`}
                    onClick={() => onEdit(day)}
                  >
                    Edit
                  </Button>
                  <Button
                    color="warning"
                    disabled={busy || day.published_count > 0}
                    aria-label={`Delete day ${day.play_date}`}
                    onClick={() => onDelete(day)}
                  >
                    Delete
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          ))}
        </>
      )}
    </Stack>
  );
}
