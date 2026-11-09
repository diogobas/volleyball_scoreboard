# Player profiles and statistics

Apply `supabase/migrations/20261109000300_player_profiles_and_statistics.sql` after the community migration and before publishing this frontend. The production schema was verified read-only for the 2026-11-09 release and already includes this migration; it was not reapplied.

## Registration and permissions

The shared Add/Edit player form now includes optional Sex (Female, Male, Other, or Not specified) and multiple preferred positions:

- Setter (S)
- Middle Blocker (MB)
- Outside Hitter (O)
- Opposite Hitter (OH)
- Libero (LB)

Existing players keep their IDs, names, categories and histories. Sex defaults to null and preferred positions to an empty list; neither is inferred from names. Positions are validated against the fixed list, reject duplicates/null entries and are stored in the fixed display order. These are multiple preferences, not a ranking.

`save_group_player_profile` validates authorization and version conflicts and saves all fields atomically. Repeating the same save is idempotent. The existing `save_group_player` RPC remains compatible and cannot clear new attributes. Community administrators can edit memberships throughout their community; group administrators can edit only memberships in their own groups.

When an existing community person is added to another group, that new membership copies profile attributes from its earliest active membership. The new group then maintains its own profile, category and statistics. Editing one group's player cannot change another group's data. Restoring a previously removed membership retains its own saved attributes.

## Player pages

Each player has a public page scoped to their group, e.g. `#/groups/G-1/players/P-1?season=2026&period=fall`. UUID links also work. Open it from the player name in the public group statistics table or Profile in the administrative registry. The registry cards offer Profile and Delete. Editing is available as Edit player on the profile page only when the signed-in web or app account administers that group; the form loads the current membership and version before editing. Saving refreshes the profile. Anonymous visitors and accounts without group/community access see no edit action.

Pages show the name/reference, category, sex, preferred positions, statistics and paginated match history. Year and season selection survive reloads and pagination; Back to players returns to that group's statistics with the same year and season.

Stats include points, matches, wins, win rate, attendance and points per match. They use the same participation and victory rules as group statistics: zero-point participants count; opponent errors do not count as player points; training points count but training does not change the winner; competitive participation for both teams grants no individual win. For historical totals with no assigned competitive team, the page states that no individual win is assigned. Attendance uses the group's distinct dates with recorded participants as its denominator.

Player history lists only published matches with recorded participation for that player, preserving the complete history totals across pagination. Score-only matches do not fabricate participation. Empty periods show zero totals and dashes where percentages lack a denominator. Removed players with published history retain their profile and statistics; removed registrations without published participation are not exposed. Player references are always checked within the requested group. Community identities, account emails and private audit records are not included.

The global directory and player table remain inaccessible to anonymous readers. Public profiles do not combine another group's data, even if it links to the same community person.

## Validation

- `npm test`: PostgreSQL execution of registration/versioning/authorization, legacy compatibility, defaults, invalid fields, community reuse, historical/live statistics, training/team changes, same-day attendance, pagination, filters, unpublished matches and removed profiles; route/client validation.
- `npm run test:admin:browser`: saving and reopening sex and multiple positions, including distinct Outside Hitter (O) and Opposite Hitter (OH) selections, in the shared registration form.
- `npm run test:public:browser`: player table links, individual pages, profile metadata, match pagination/reload, year/period filters, empty periods, returning to the group, and mobile/desktop layouts.
- `npm run test:communities:browser`: community player reuse retains profile data and group-only admins cannot browse the community catalog.
- Build both app and public site. After migration/deployment, `COMMUNITY_REF=C-1 npm run verify:remote` also checks player points against group statistics without writes.
