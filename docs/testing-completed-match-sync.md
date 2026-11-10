# Finalized matches on sync

The current flow is **Save & sync → finalized match in results**, without pending administrator approval or a publication step when closing the game day. Offline matches remain saved locally until explicitly synced. The client removes the archive only after an exact receipt confirms publication (or confirms that an administrator already deleted that same match).

## Supabase rollout

Apply the complete `supabase/migrations/20261108000700_completed_match_sync_and_management.sql` after migrations 001–006. It requires the existing player categories/deletion metadata and game-day code helpers. The remote database has not been changed from this workspace, which has only a public key. Deploy/build the updated app and administration UI after applying SQL.

The migration also finalizes existing valid pending receipts. Excluded/deleted matches remain excluded. Everything runs in a transaction: invalid submissions fail without partially publishing results or creating players. Recorded names, substitutions and opponent errors are preserved; existing identities match by group and normalized full name, never a partial first-name match. A new name is registered as Sub. Each recorded active lineup must identify twelve different players.

Anonymous operators using the day code can submit a match, but cannot list administrative data, edit/delete results, or directly invoke finalization helpers. There is no fabricated administrator author for anonymous sync. Submitted bytes remain immutable for retries; subsequent edits do not cause an old upload to overwrite corrections.

Closing/reopening a game day now only changes its state and does not publish or rebuild matches. Late uploads still finalize immediately while their code remains valid. Revoking or deleting a day invalidates its code as before.

## Match management

`MatchManager` is reused in the group Matches tab and inside each game day. It provides:

- Server-side search by played date, scheduled date, team or recorded player name, with season selection, day scope and pagination.
- Shared `MatchCard` presentation: winner colors, set scores, top scorers and shared Statistics details.
- Edit from the group Matches tab using the existing versioned correction editor, now saving directly to results. Team names, participants, points and set boundaries can be corrected; match identity and recorded timestamps remain stable. Corrections require a reason and preserve revision history.
- Game-day matches are read-only. Finalized matches cannot be deleted from either location, including through legacy deletion RPCs. Days with finalized results cannot be deleted. Empty days can still be removed. Apply migration `20261109000100_season_periods_and_finalized_match_protection.sql` before deploying this interface.
- Year and calendar-month Season filters apply to the full match list and statistics, including pagination and attendance denominators. The default is the current northern season.

## Validation

- `pnpm test`: 190 tests, including PostgreSQL execution of the migration against existing pending data; automatic completion with substitutions and newly registered Subs; exact receipt retries; immediate corrections, version conflicts and immutable original submissions; search/filter/pagination/permissions; closed-day uploads; individual deletion without resurrection; legacy upload compatibility; invalid-data rollback; and retaining local archives when an old server has not confirmed completion.
- `pnpm run test:court:browser`: offline play/save/delete/restart, manual sync and immediate finalized match details in the admin, without the old association/approval/publication steps.
- `pnpm run test:admin:browser`: search, edit team name with correction confirmation, deletion protection, pagination, year/period filters and existing player/day administration.
- `pnpm run test:public:browser`: public navigation, shared cards, scorer calculations, pagination and Statistics.
- `pnpm run build` and `pnpm run build:public`.

The browser scenarios use fixtures and make no real account/group changes. Existing docs about pending private reviews describe the earlier workflow, superseded by migration 007.
