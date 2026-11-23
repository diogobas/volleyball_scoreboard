# Historical matches and first-to-three results

Administrators can use **Matches → Register historical match** (also inside a game day) to enter an older date, team names and set scores. **Include player totals (optional)** opens whole-match player points and opponent errors; it starts unchecked. Players are selected by their registered UUID from dropdowns; names cannot be typed into the match. The final **＋ Add player…** option opens the shared registry dialog, defaults to Sub and also supports Fixed. A successful save updates all dropdowns and selects the new registration in the original row. Cancel and failed/duplicate saves preserve the match draft. The same player cannot be selected twice within one team; cross-team entries remain supported for historical exchanges. Player totals plus opponent errors must equal the sum of all entered set scores for each team. The record can be edited or deleted using the existing match management flow. Creation/edit retries keep the same match and revision identities.

The original image supports only whole-match player totals. These are stored in `match_player_totals`, separately from point events and per-set lineups. Per-set player points, substitutions and chronological point order are not fabricated. When player totals are provided, match details show the usual Top 3, team bars and set scores; expanding a historical set explains that individual points per set were not recorded. Date-only records display their calendar date, without inventing a displayed start time.

## Match outcome

The winner is the first team to win three closed sets, in chronological order. The competitive set score freezes at that point. Every subsequent set is classified as training; its points and participation still enter match and season totals, but cannot reverse the winner. A record with no team reaching three set victories is unfinished and awards no individual match wins.

The historical form offers:

- **Official:** competitive sets 1–4 to 25, fifth to 15, always a two-point lead. Extended sets must end as soon as that lead is reached (26–24, 27–25, 17–15).
- **Recreational:** competitive sets to 25, including a fifth set, or explicit **Ended early** for a manually abbreviated set with a non-tied score.

The live app retains its recreational 25-point auto-close and manual-close controls. Its set tally now freezes at the third victory, the next set is labelled Training, and the same calculation drives saved summaries/local season wins. Undo/replay preserves points and recalculates classifications. Admin/public results and season statistics use the equivalent server calculation.

[FIVB Official Volleyball Rules 2025–2028](https://www.fivb.com/volleyball/the-game/official-volleyball-rules/), rules 6.2 and 6.3, are the reference for the official format. Recreational early closure and continued training are the group-specific rules requested here.

For the 03/11 example: Team 2 won 25–19, 25–22, 25–16, deciding the match **0 × 3**. The remaining 17–25, 17–25, 12–15 sets are training. All six sets total **122 × 121 points**, with individual totals and opponent errors kept only when explicitly supplied. Names in the image must be selected/entered by the administrator; no ambiguous identities were imported into the real group automatically.

## Supabase

Apply `supabase/migrations/20261108000800_historical_matches_and_match_winner.sql` after migration 007 and earlier migrations, followed by `supabase/migrations/20261108000900_optional_historical_player_totals.sql`. It installs aggregate storage, administrator-only create/edit APIs, public aggregate reads and result calculations. It recalculates competitive outcomes of existing matches without deleting their points, sets or original submissions. The migration has not been applied to the remote database from this workspace, which has only a publishable key.

Historical saves are transactional and versioned, with private revision history. Date selection uses the group time zone. A game day is reused or created for that calendar date; no operator code or fictional lineup is generated for imported summaries. Public aggregates obey published-match RLS, so existing individual/day deletion removes them from public results and season statistics.

## Verification

- 214 automated tests cover the current system. PostgreSQL tests execute all migrations and enter the photo's totals, verify 0–3 with three training sets, exact points/attendance/wins, no invented point rows, retries, editing/stale versions, invalid score/total rollback, official/recreational fifth sets, private permissions, public RLS and deletion.
- JavaScript tests cover first-to-three, training points, undo/replay, unfinished matches, official deuce/tie-break endings and season wins.
- Admin browser scenario enters the six-set historical example, catches a mismatched total, saves, checks the training/per-set-data notice, edits totals and deletes the record using fixtures.
- App/public browser scenarios verify existing save/sync/navigation/statistics flows.
- `pnpm run build` and `pnpm run build:public`.

## Score-only entry and the 03/11 import

A score-only summary stores `player_totals_recorded=false`, an empty player list and null opponent errors. It creates no player identities, individual points, lineup or attendance. The group still receives the six scores, 243 points played and the first-to-three result. Individual season statistics explicitly disclose omitted matches; match details omit player rankings and bars. Adding full totals later, or removing totals explicitly, uses the same versioned edit flow and private revision history. Old clients/payloads without the option retain the previous totals-required behavior.

`supabase/maintenance/import-tuesday-2026-11-03.sql` is a separate, repeatable SQL Editor import for the exact Tuesday Volleyball group. Run after migration 009. It records all six screenshot scores for **2026-11-03**, assuming 03/11 means November 3 of the current season. It checks the group UUID/name and existing same-date score sequences, preserves existing edited/deleted imports, and never impersonates an administrator. Its final SELECT verifies all saved sets and training flags. No remote import has been performed from the local workspace.

The user confirmed that Chicó played sets 1–3 for Team 2, then swapped with Carlos for sets 4–6. The per-set rankings credit Chicó 3 + 2 + 0 points for Team 2 and 1 + 2 + 4 for Team 1: 12 overall. The whole-match screenshot's labels (Chicó 7 on Team 1, Carlos 5 on Team 2) must not be used to assign those five early points to Carlos. The import preserves the confirmed exchange and Chicó's per-set source totals in private `match_metadata.submission.import_context`, separately from the editable score-only payload. The match remains a Team 2 victory decided in set 3; all exchanges occur during training. The administrator subsequently confirmed the registered identities: Frlipe → Felipe C., JP → João Paulo, Philip → Phillip. The follow-up repair below imports their points using the existing active UUIDs.

Additional PostgreSQL tests verify score-only public reads, unchanged individual season totals, conversion in both directions, stale retry preservation, rejection of hidden player/error data, and repeated maintenance imports (including detection of a manually entered equivalent result). The browser scenario covers both optional-totals and score-only creation, plus reopening a score-only entry for editing.


## Complete the deployed November 3 import and repair missing references

The earlier score-only import has already been executed on the real group. Its ID is `8deb93c2-b213-4a36-9026-e56117c03113`, version 1. A read-only remote check confirmed that result and the active registrations Felipe C., João Paulo and Phillip. The remote database still lacks readable-reference columns, causing the group list and result RPCs to fail.

Run **the entire `supabase/maintenance/repair-tuesday-2026-11-03.sql` in the Supabase SQL Editor**. It combines migration 010 (idempotent repair of group/player references), migration 011 (historical team changes), migration 012 (attendance statistics), and the specific correction, in one transaction. Do not run the `.sql.in` template directly. Regenerate the combined file after changing its inputs with `node scripts/prepare-november-repair.mjs`.

The correction resolves the user-confirmed names to active registrations; no players, accounts, matches or fictional point events are created. Existing UUIDs/categories, six scores, match winner and original submission remain intact. It adds the 14 team-total rows representing 12 people, including Chicó's 7 + 5 points and Carlos's two zero-point entries. The whole-match roster is the union of players on each team across all six sets, not simultaneous lineups.

Expected individual totals:

| Player | Points | Competitive team |
| --- | ---: | --- |
| Anderson | 19 | Team 2 |
| Diogo | 19 | Team 2 |
| Omer | 19 | Team 1 |
| Phillip | 16 | Team 2 |
| Gaëtan | 15 | Team 2 |
| Felipe C. | 15 | Team 1 |
| João Paulo | 13 | Team 1 |
| Chicó | 12 | Team 2 |
| Dimitri | 10 | Team 1 |
| Kaue | 8 | Team 1 |
| Jota | 6 | Team 2 |
| Carlos | 0 | Team 1 |

Team totals are 72 + 50 opponent errors = 122 and 80 + 41 = 121. The transcription of each set and registered aliases is in `tuesday-2026-11-03-source.json`; it is preserved as private evidence for the correction. This imports whole-match statistics only, with no fabricated point order or per-set playing history in public event tables.

The correction requires the expected, published, unedited score-only result; conflicting edits abort the whole transaction. Private `maintenance_corrections` retains the previous/new snapshots and source transcription without impersonating an administrator. Re-running it preserves subsequent edits and never restores deleted results. Its final SELECT returns the points for all 12 players.

Migration 011 permits one player to have point totals on each team, while still rejecting duplicate rows within a team. `result_team` records the competitive team; both entries must agree. Explicit null means both teams/unknown and grants no individual victory. The historical editor exposes this choice only for players listed on both sides. Seasonal wins use competitive sets only, both for synced events and local matches, so swapping during training cannot remove Chicó's earned victory. Attendance stays one match/day and rankings combine the same player's points across teams.

Additional PostgreSQL coverage simulates missing columns, duplicate tombstones, exact points for all players, Chico/Carlos win attribution, public reads, original-source preservation, owner-correction privacy, retries, edit round-trips, conflicting competitive teams, duplicate same-team rows and deletion. The admin browser scenario edits a historical match to include both exchanged players, preserves the competitive-team selections and displays their points on both teams.


## Registered-player dropdowns

`PlayerSelect` provides native, accessible dropdowns, sorted names, Fixed/Sub labels, a preserved choice for a removed historical identity, and the final Add player action. `PlayerFormDialog` is shared by Player registry and historical entry/editing, so validation, categories and save/retry behavior stay consistent. The player dialog is a sibling of the match dialog, with an independent form, so saving a registration cannot accidentally submit the match. Points, set scores, date and edit reason stay in the existing match draft. No new database migration is required for this UI change.

The admin browser scenario verifies the fields are SELECTs, Add player is the last option, a cancelled registration preserves the selected row and six-set score, duplicate names produce an error, successful registrations default to Sub and are selected automatically, names appear in other dropdowns, same-team duplicates disappear, and separate historical rows preserve an intentional team exchange. It also exercises shared registry creation/editing/deletion and saves/edits the full historical result after creating players inline.


## Win rate and recorded attendance

The shared Player statistics table adds **Win rate** (`wins / matches played`) and **Attendance** (`days attended / attendance_day_count`), showing the attendance fraction alongside its percentage. Percentages use up to one decimal place; no wins or no attendance with a positive denominator gives 0%, while an empty/missing denominator displays a dash. Existing points, played matches and wins stay visible.

Migration `20261108001200_player_attendance_statistics.sql` adds `attendance_day_count` to the season summary RPC. It counts distinct group-local dates with recorded participants over the complete selected season, independent of the displayed match page. Multiple matches on the same date count as one attendance opportunity. Unpublished matches, other seasons and dates with only score-only/unknown rosters do not enter the denominator. All players share this season-wide reference; database registration time is not used as a joining date because historical records can predate registration.

The UI explains the formulas and the treatment of unknown participation. Older servers without the added field continue to show win rates, with a dash for unavailable attendance. Apply migration 012 to enable attendance in the deployed database; no player records or match results are rewritten.

Automated coverage checks zero/unknown denominators, percentage rounding, repeat matches on one date, full-season totals across multiple pages, missing rosters, publication and season filtering. Browser checks assert 2 wins in 4 matches = 50% and 2 attended days out of 3 = 66.7% in both admin and public tables, with the mobile table remaining inside its horizontal scrolling container.

## Explicitly ending an incomplete match as a draw

Apply `20261109000400_historical_draws.sql` after the player-profile migration before publishing this version. The form offers **Finish as draw** while no team had already won before the final set. For an interrupted last set, also select **Ended early**. This allows its recorded score, including a tied score, without awarding a deciding set win from an incomplete set. A completed valid set that already decided the match cannot be overridden by declaring a draw.

For example, `24–26, 25–20, 25–22, 22–21`, with the last set interrupted, is saved as a draw: two completed set wins to one, plus the recorded interrupted set. All 185 points remain recorded. `22–22` is also accepted as that interrupted final set. The match outcome is Draw regardless of an unequal count of completed set wins; no fabricated score or extra set is added. Four fully completed sets ending 2–2 can also be explicitly closed as a draw.

Player points and attendance remain recorded, and no individual victory is awarded. Player points plus opponent errors must still equal the recorded team score totals. Existing unfinished records remain unchanged until explicitly edited to mark a draw. Retries and corrections retain their existing version/revision contracts, and finalized-match deletion remains blocked.

The migration preserves existing read/statistics implementations behind private functions and decorates their scoped results with draw/interrupted-set metadata. Anonymous users cannot call the private functions directly. Group results, match details, both admin match lists and player history use the same outcome. The production schema was verified read-only for the 2026-11-09 release and already exposes draw metadata; this migration was not reapplied.

Validation includes frontend rules and real PostgreSQL tests for the exact score sequence above, score-only and player-total records, tied interrupted sets, official/recreational rules, earned-win protection, totals, authorization, retry/correction behavior, and consistent public/admin/player results. The admin browser test registers the score sequence, marks the draw, saves it, reopens the record and saves a tied last set without changing the other scores.
