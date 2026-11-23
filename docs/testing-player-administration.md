# Player administration and Tuesday roster

Players → Registry supports creation, rename/category editing and deletion, with search, Fixed/Sub filters and pagination. New players default to Sub. Players → Statistics uses the shared season statistics. Registry changes refresh those statistics and update names in the current editable lineup. Ordinary deletion preserves recorded match snapshots and historical statistics, removes the player from the active registry and blocks synchronization using the deleted UUID. Names can be reused for a new identity.

## Apply to Supabase

The local environment contains a publishable key only. The remote database has **not** been changed. In the Supabase SQL Editor, execute these complete files in order:

1. `supabase/migrations/20261108000100_player_administration.sql`
2. `supabase/maintenance/reset-tuesday-volleyball.sql`

The second file is a separate, one-time destructive operation, not an automatic schema migration. It validates both the ID `653c2c8d-9903-4410-b109-c66320f7300c` and exact name `Tuesday Volleyball ‐ 7:30PM-10PM`. It removes this group's published matches, points, sets, private receipts/reviews, game days, lineup versions and operator codes. It removes existing players from the active registry and seeds these 13 players as Fixed:

Anderson, Carlos, Chicó, Diogo, Diego, Geraldo, Jota, KJ, Gaëtan, Phillip, Omer, Kaue, Dimitri.

The group, administrators, accounts and other groups are preserved. The transaction retains deleted player UUID tombstones to prevent old devices recreating those identities and records a maintenance marker to reject repeat execution. After the reset the active registry contains 13 Fixed players; matches, points, participants and game days have zero totals. Refresh the admin after applying SQL; create a fresh game day and operator code. Device-local archived matches are not erased by server maintenance.

## Verification

- `pnpm test`: PostgreSQL tests execute all migrations and the actual maintenance script against fixtures, including permissions, duplicate/invalid names, category defaults, version conflicts, retries, historical snapshot preservation, old UUID rejection, group isolation, all reset totals and repeat protection. Offline cache tests verify categories, renames and tombstone removal.
- `pnpm run test:admin:browser`: mocked server checks create/edit/category changes, duplicate-name feedback without losing the form, search/filter, delete/cancel, the 13-name roster, separate registry/statistics and existing administration flows. No real account or group mutations.
- `pnpm run test:public:browser`: existing public navigation, statistics, top scorers and pagination.
- `pnpm run build` and `pnpm run build:public`.

Browser scripts accept `BASE_URL` and `PLAYWRIGHT_MODULE`. Screenshots are saved in ignored `artifacts/admin-navigation/`.
