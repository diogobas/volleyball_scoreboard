# Group administration navigation

The admin group view now has Overview, Players, Matches, Game days and Access sections. Public and admin results share `GroupResults`, including overview links, player statistics, match cards, top scorers, winner/team colors and `StatisticsView`. Admin match details also open the existing correction tools.

Workspace navigation (My groups / My communities) uses a vertical sidebar from the `md` breakpoint. On smaller screens it opens from an Administration button that displays the current workspace and collapses after selection. Group sections remain horizontal. Browser checks verify the mobile disclosure, vertical workspace orientation, desktop placement beside the content and absence of page overflow.

Primary community and group tabs occupy the top of the content column, before context headings, links and alerts, and stick to the viewport top during scrolling. Opening a group inside a community replaces the community header and tabs; returning to the group list restores them. Checks cover matching community/group tab positions, sticky scrolling and return navigation.

Administration page headers share the same title typography and spacing. Back actions appear above the title; public links and refresh actions align on the right on wider screens and wrap on mobile. The signed-in avatar in the upper-right opens an account menu with the email and Sign out. The admin browser check covers menu opening, email visibility, sign-out and public-link alignment.

`SectionNavigation` and `ListPagination` are reused for public results, admin results and game-day navigation. Game days and private receipts show five items by default, with options for ten or twenty-five. Creation opens explicitly. Each selected day has Matches, Lineup, Code & publish and History sections; lineup state and mounted receipt editors survive section/page changes.

Run the browser checks against a local dev server with Supabase configuration present:

```sh
BASE_URL=http://127.0.0.1:5197 PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs pnpm run test:admin:browser
BASE_URL=http://127.0.0.1:5197 PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs pnpm run test:public:browser
```

All external requests are intercepted with fixtures; browser checks do not modify real groups or accounts. The admin check covers sign-in, isolated sections, overview shortcuts, match pagination and return, season retention, shared statistics, player creation/editing/deletion, Fixed/Sub categories, duplicate-name feedback, search/filter, registry/statistics navigation, access controls, game-day pagination, day sections, preserved lineup drafts, explicit creation/cancellation and mobile overflow. Existing public checks cover scorer calculation/error exclusion/retry, responsive cards, pagination and match statistics.

Validated: 167 automated tests, app and public builds, and both browser scenarios. Screenshots are saved under `artifacts/admin-navigation/` and `artifacts/public-navigation/` (ignored artifacts). No database migration or deployment is included.

## Direct lineup replacement

Game-day lineup fields search the full group registry by name or player ID, including Fixed players and Subs. Assigned players remain visible but disabled, with their team and position shown. Choose another available player directly without clearing the current selection. “Add player…” opens the shared registration dialog, defaults to Sub, and selects the saved player in the original position. Cancelling preserves the previous player and the lineup draft.

Saving a lineup requires a reason and keeps the game-day code. The success message instructs the operator to load that code again before starting a new match: editing the administrator lineup does not change the scoreboard's offline snapshot or previously recorded matches. The sync regression in `supabase/completedMatchSync.test.js` exercises Phillip → Mejdi, same-code redemption, both old and refreshed snapshots, final scorer identities and no duplicate Sub registration. The admin browser check exercises direct replacement, disabled assigned players, cancellation, quick registration and persistence after saving.
