# Stage star policy v1

All 68 delivery stages award stars on new attempts, including the first guided
attempt. Complete within the first threshold for 3 stars, within the second for
2 stars, or later for 1 star. Threshold equality is inclusive. A failed attempt
does not create a clear or a time record. A slower retry cannot lower the saved
stars or worsen the best time.

## Time and interface

- Use active play time, including thinking time while the board is playable.
- Pause time during help, menus, pause dialogs, backgrounding and lost storage
  ownership. Resume from the saved accumulated time; time away is not added to
  new attempts. An abrupt browser termination can lose time since the latest
  checkpoint; this is a local game timer, not an anti-cheat clock.
- Continuous orders share one clock across all orders. Order transitions and
  undo do not reset or refund accumulated time.
- Stage selection, the play HUD and results use the same policy. The criteria
  are outside collapsed help in stage selection; the small-screen content area
  scrolls while the start/continue button remains fixed.
- All time and record notices are translated into the existing nine languages.

## Threshold source

`scripts/delivery-manifest.js` publishes `starPolicy.version: 1` and the complete
stage-ID-to-threshold mapping. The original 51 scored stages retain their exact
`starMs`. `star-policy.json` supplies only the 17 formerly unscored stages:

| Stage | 3 stars | 2 stars |
| --- | --- | --- |
| 4 | 00:45 | 01:15 |
| 5 | 01:00 | 01:40 |
| 6 | 00:40 | 01:15 |
| 7–8 | 00:50 | 01:30 |
| 9 | 00:40 | 01:15 |
| 10–12 | 00:45 | 01:25 |
| 61 | 01:10 | 01:50 |
| 62 | 01:20 | 02:05 |
| 63 | 01:50 | 02:50 |
| 64 | 01:30 | 02:20 |
| 65 | 01:20 | 02:05 |
| 66, all orders combined | 02:30 | 03:50 |
| 67, all orders combined | 02:40 | 04:00 |
| 68, all orders combined | 03:00 | 04:30 |

These added thresholds are initial tuning values, not a claim about human
completion-time distributions. Automated route execution proves rules and
accounting, not difficulty or fairness. Human/device timing is still pending.
Changing published thresholds later requires an explicit rating-version and
record-migration design; do not silently edit v1 or recompute existing records.

## Existing saves

The storage key stays `wsurv.delivery.v1`. The envelope becomes schema 3 with
`ratingVersion: 1`; the gameplay pack, IDs, order, engine and pack hash stay exact.

| Existing data | Migration |
| --- | --- |
| Clears, stars and best times | Keep exact values; no retroactive stars or invented times. |
| Board, action log, attempt ID and learning flags | Keep exact values. |
| Unfinished continuous order with stored elapsed time | Retain cumulative time and become eligible for stars at completion. |
| Unfinished untimed practice/first lesson | Continue as `untimed`; preserve the clear on completion. Explain that stars and best time begin on the next fresh attempt. |
| Already completed unscored game | Retain the existing result without retroactive scoring. |
| Existing scored game | Keep its original conservative wall-clock recovery as `legacy-wall`; the next fresh attempt uses active play time. |

Loading validates and migrates in memory without writing. Before the first
schema-upgrade write, store the exact original bytes under
`wsurv.delivery.upgrade.schema2.<packHash>.v1` (or `schema1`). Older pack-prefix
migrations retain their existing `wsurv.delivery.upgrade.<packHash>.v1` key.
Backup failure, a different existing backup, a conflicting tab, or lost writer
ownership must block replacement. Unknown schema, rating version or clock mode
must not reset records.

Older app versions cannot read schema 3. A release rollback must retain this
reader; never delete the user's current progress or blindly restore an old
backup over newer play.

## Verification

Run `node scripts/check-game.js`. Delivery coverage includes all 68 threshold
boundaries, slower retries, 70 frozen routes, 535 action/restoration pairs,
10 order-boundary undos, 23 frozen public-schema saves, older released-pack
prefixes, and storage/concurrency failures. Browser evidence is recorded in
`research/unified-stage-stars/REPORT.md`; it is separate from physical iPhone
Safari testing, which remains deferred.
