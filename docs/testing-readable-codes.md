# Readable game-day codes and public references

Apply `supabase/migrations/20261108000200_readable_codes_and_references.sql` after the player administration migration. Then apply `supabase/migrations/20261108000300_shorter_day_codes.sql` and `supabase/migrations/20261108000400_five_character_day_codes.sql` in order for the five-character format. This is a schema/function update only; it does not reset any data or rotate existing access codes. It has not been applied to the remote Supabase project from this checkout, which has only a public key.

- Newly created or regenerated game-day codes have five random characters without separators, such as `AB7K9`, replacing the former 64-character string. The alphabet excludes 0, 1, I and O. Generation uses PostgreSQL cryptographic randomness and SHA-256; five base-32 symbols provide 25 bits. The database stores only a hash, and code generation remains private to administrator RPCs.
- Entry accepts uppercase/lowercase, optional hyphens and whitespace. Both lineup lookup and match upload use the same normalization. Previously issued 8-, 12- and 64-character codes continue to work until rotated or revoked. No code is returned from history or day lookup.
- Groups receive a stable unique reference such as `G-1`; players receive `P-13`. UUID relationships and all existing data remain intact. References come from database identities, are never derived from array positions, and remain stable through renames and deletion. Numbers are globally unique within each entity type and may have gaps.
- Administration and public results display the short references. Registry search accepts player names or references. Public group links use `#/groups/G-1`; existing UUID links remain valid. The public client resolves references to UUIDs before calling the existing read RPCs.

Verification:

- `npm test`: migrations execute in PostgreSQL, testing existing UUID/reference stability, uniqueness, new registrations, code format, normalization for lookup and actual match receipt/retry, rotation/revocation, old-code compatibility and anonymous permission boundaries. Public client tests cover short-route parsing, UUID resolution and missing groups.
- `npm run test:admin:browser`: displays short references and searches by `P-13`, alongside the existing player and game-day workflows.
- `npm run test:public:browser`: opens `G-1` and exercises overview links, seasons, pagination, per-match scorers and details.
- `npm run build` and `npm run build:public`.

## Repair when newly created days still issue long codes

If only the five-character helper migration was applied, the original `create_game_day` and `change_game_day` may still generate 64-character tokens directly. Execute the entire `supabase/migrations/20261108000500_repair_day_code_generation.sql` in the SQL Editor. This repeatable repair installs the generator, normalizer, creation/rotation RPCs and both code-consuming RPCs together; it works from the original game-day schema without the intervening short-code migrations. It does not apply the separate group/player reference schema.

It preserves existing days, lineups, receipts, permissions and issued codes. To replace a code already issued for an existing day, open **Code & publish**, enter a reason, then choose **Generate new code**. New days and rotated codes return exactly five characters. The SQL verifies that the public entry points use the generator/normalizer before committing.

`supabase/dayCodeRepair.test.js` reproduces the long-code failure after applying only the five-character helper migration, tests repair without pre-existing helpers and repeated execution, then verifies actual day creation, rotation, lowercase lookup, upload/retry, revocation and data preservation.


If a partially migrated database reports `column groups.display_id does not exist` (or `p.display_id`), migration `20261108001000_repair_readable_references.sql` adds only the missing group/player reference columns and reloads the PostgREST schema cache. It preserves existing UUIDs, references and the five-character code generator. It can be executed repeatedly. For the November 3 match, use the combined repair described in `testing-historical-matches.md` to repair references and add the missing points together.
