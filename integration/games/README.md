# Cold War automatic reward verification

The Web game randomly selects one of 128 published maze layouts. The original 400 questions, question-bank version, five question types, question selection, fog, doors, chests, towers, shortcut questions and lamp mechanics are retained. The finite pool can repeat; this is not unlimited procedural generation. Desktop/offline builds retain their original generator.

`rules-game/1` creates a student-bound session and run. Immutable route events contain at most two adjacent cells. Rules check geometry and closed doors, and derive the three collected-file flags. An answer is bound to a published object at the current/adjacent cell and the existing immutable question validator. Completion must pair the session transition with a verified run at the exit with all three files.

Settlement keeps `coinAccounts/{studentId}/entries/S5_ColdWar_Maze`. It reads the current CMS rule, global activation, game policy and published maze version. Positive credits are immutable. A legacy zero may receive its first valid positive credit. CMS tiers use incremental Rules-checked highest-threshold probes, matching the assessment approach; up to 20 existing tiers are retained. Dispatching by ledger kind avoids evaluating unrelated assessment/game branches within the Rules expression budget.

Old sessions, old positive credits and the original game catalogue remain valid. Old browser-only completions are not converted into new verified runs or automatically backfilled. Legacy Functions return `protocol-owned` for these new sessions and are not deployed for this feature.

Run the suites against disposable `demo-*` projects only:

- `node integration/games/build-rules.mjs --apply`
- `firebase emulators:exec --project demo-cold-war-rules --only firestore --config integration/games/emulator.json "vitest run --config integration/games/vitest.config.ts && vitest run --config integration/assessment/vitest.config.ts"`
- `FIRESTORE_EMULATOR_HOST=127.0.0.1:8185 node --experimental-strip-types --test functions/test/browserDraw.integration.test.ts`
- `FIRESTORE_EMULATOR_HOST=127.0.0.1:8191 node --experimental-strip-types --test functions/test/rewards.integration.test.ts`

Release order: verify compatible Rules against the current live baseline; publish immutable layouts, then their manifest with a server timestamp; publish both exact site commits; verify both live artifacts; enable only the Cold War game reward policy. Retain the existing CMS amount/metric, roles, global activation time, ledger keys, draw settings, IAM, billing and disabled Functions service. Publication must not overwrite a concurrent release or a different existing map/policy.

Emulator/browser tests are synthetic validation. A real new award requires an actual eligible account's new game session. An already-claimed 100 credit must not be reset for acceptance.
