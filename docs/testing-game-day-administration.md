# Game-day administration

Game days now supports create, edit, delete and search for group administrators.

- `GameDayList` reuses `ListPagination`, searches across all loaded days by ISO date or either team name, filters Open/Closed and keeps search, filter and page when returning from a day. Cards show received, pending and published counts with Open, Edit and Delete actions.
- Edit opens Details to change the scheduled date. The existing Lineup editor handles team/player changes for open days; closed days must be reopened before changing lineups. Updating the scheduled date leaves recorded match dates, season statistics, operator codes and lineup snapshots unchanged. Edits require a reason, record an audit entry and check the expected version.
- Delete requires a confirmation and reason. It removes the day, received matches/reviews, lineup versions, published match rows/points and associated result history. The code stops working. Registered players, group access and other days remain intact. Minimal private deletion metadata records the administrator, reason and previous day metadata without the code hash.
- Concurrent uploads/reviews/publication use the same group/day lock order; a changed version prevents editing/deleting stale data. Repeating a completed deletion is harmless. Deleting a day frees its date for a new day.

## Supabase

Execute the entire `supabase/migrations/20261108000600_game_day_administration.sql` after the existing game-day schema. This migration updates the day list and installs edit/delete RPCs with authenticated administrator checks. It does not reset or modify current days and does not alter access-code generation.

The remote migration has not been applied from this workspace; only a public Supabase key is available here.

## Verification

- `pnpm test`: 177 tests passed, including PostgreSQL integration coverage for access permissions, cross-group rejection, duplicate dates, invalid input, stale versions, preserved code/lineup/statistics on date edits, deletion of an actual published day, public-total removal, old-code rejection, deletion retry, retained player registry/other day and private deletion metadata permissions.
- `pnpm run test:admin:browser`: mocked creation with twelve distinct players, five-character code display, date/team search, status filters, duplicate-date feedback, date editing, lineup changes, search retention after return, deletion cancellation/confirmation and mobile layout. No real group/account changes.
- `pnpm run build` and `pnpm run build:public`.

Browser tests use `BASE_URL` and `PLAYWRIGHT_MODULE`. The game-day list screenshot is in ignored `artifacts/admin-navigation/game-days-mobile.png`.
