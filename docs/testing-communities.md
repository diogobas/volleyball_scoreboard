# Communities and administrative scope

Apply migrations in order, including `20261109000100_season_periods_and_finalized_match_protection.sql`, then `20261109000200_communities_and_scoped_public_access.sql`, before publishing this frontend. The production schema was verified read-only for the 2026-11-09 release; migrations were already present and were not reapplied. See publishing-4.3.md for the release record.

The community migration creates **Montreal Volleyball Community**, region **Montreal**, reference **C-1**, and attaches existing groups to it. Existing group administrators retain their own group permissions. Only the confirmed account `diogovvb@gmail.com` receives initial community administration. If that account does not yet exist or is unconfirmed, its first verified sign-in and community-access load claims the initial role. Other emails cannot claim it. Membership IDs, match IDs, scores and history are preserved.

Do not rerun the historical November repair SQL after this migration: that old maintenance bundle restores older public function definitions. Complete any required historical repair before rolling out communities. The current public functions explicitly filter published results and expose only the requested group or community.

## Roles

- Community administrators manage every group in their community, including game days, players, corrections and group access. They create groups within that community, manage its administrators, and can browse and add community players to a group.
- Group administrators retain administration of their specific groups. They cannot browse the community player catalog, add community administrators or administer sibling groups. An account may explicitly administer several groups without becoming a community administrator.
- Community access is inherited. Removing that role removes access to its groups unless the account also holds a separate group role. Creating a group as a community administrator does not silently create a permanent group role.
- The community keeps at least one administrator. New administrators must have confirmed email accounts. The general directory is not public; the signed-in workspace lists only communities and groups the account administers.

## Reuse players

In a community's Groups tab, create a group, then open **Players → Registry → Add from community**. Search, select players and choose their category in the destination group. The same flow is available to a community administrator opening a group from My groups.

A community person has a stable identity, with a separate player membership UUID in each group. Points, wins, attendance, category, local display name and deletion remain group-local. Importing is atomic and idempotent. Reimporting a removed membership restores that same UUID; it does not change a membership already active. Equal names are not automatically merged. A same-name conflict asks the administrator to review the identities rather than silently linking different people. Existing registrations are backfilled individually because matching names alone do not prove that two players are the same person.

## Public pages

- `#/communities/C-1` shows Montreal and only its groups.
- `#/groups/G-1` opens that group's published statistics; UUID links continue working.
- Group pages link back to their community. Match pages retain their group, period and pagination context.
- The homepage, `#/groups` and `#/communities` give visitors instructions to use a shared link, without querying or listing all communities.
- Anonymous direct table reads are revoked. Group and community discovery use RPCs with an explicit reference. Signed-in direct table reads are restricted by administrative scope. Community role lists, email addresses and the community-wide player catalog are never returned by public RPCs.

These pages are public to anyone with the corresponding community or group reference; removing the directory does not make the individual result pages private.

## Validation

- `npm test` executes real PostgreSQL semantics through PGlite. Community coverage includes migration preservation, owner bootstrap, inherited permissions, sibling/cross-community denials, player import/retry/restore/conflict/rollback, revocation, confirmed accounts, direct-table RLS and public-only publication filters.
- `npm run test:communities:browser` verifies the private-directory landing, public community/group navigation, community group creation, adding an existing player and the group-only administrator experience with fixtures.
- Existing admin, public and court browser checks cover the shared components and offline/sync flow.
- Build both `npm run build` and `npm run build:public`.
- After deployment, `COMMUNITY_REF=C-1 npm run verify:remote` checks the scoped public RPCs and rejects global anonymous table reads. It performs no writes.
