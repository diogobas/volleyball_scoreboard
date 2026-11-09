# Group administration navigation

The admin group view now has Overview, Players, Matches, Game days and Access sections. Public and admin results share `GroupResults`, including overview links, player statistics, match cards, top scorers, winner/team colors and `StatisticsView`. Admin match details also open the existing correction tools.

`SectionNavigation` and `ListPagination` are reused for public results, admin results and game-day navigation. Game days and private receipts show five items by default, with options for ten or twenty-five. Creation opens explicitly. Each selected day has Matches, Lineup, Code & publish and History sections; lineup state and mounted receipt editors survive section/page changes.

Run the browser checks against a local dev server with Supabase configuration present:

```sh
BASE_URL=http://127.0.0.1:5197 PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs npm run test:admin:browser
BASE_URL=http://127.0.0.1:5197 PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs npm run test:public:browser
```

All external requests are intercepted with fixtures; browser checks do not modify real groups or accounts. The admin check covers sign-in, isolated sections, overview shortcuts, match pagination and return, season retention, shared statistics, player creation/editing/deletion, Fixed/Sub categories, duplicate-name feedback, search/filter, registry/statistics navigation, access controls, game-day pagination, day sections, preserved lineup drafts, explicit creation/cancellation and mobile overflow. Existing public checks cover scorer calculation/error exclusion/retry, responsive cards, pagination and match statistics.

Validated: 167 automated tests, app and public builds, and both browser scenarios. Screenshots are saved under `artifacts/admin-navigation/` and `artifacts/public-navigation/` (ignored artifacts). No database migration or deployment is included.
