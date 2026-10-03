# Goal improvement work log

## Current checkpoint — 2026-10-03
- Product implementation is complete and verified. Code pushed normally to `origin/main`, https://github.com/Koodattu/wcl-vod-review.git. Backend commit: `616d1d5aee81dcd6afd8a091441f263fa40c3c41`; frontend commit: `067f728e188a12218855d122226e6ecc4034251e`.
- Final checks: 44/44 browser scenarios on the standalone production server; 5/5 URL tests; 11/11 real MongoDB/HTTP integration tests; frontend lint, TypeScript and production build passed. Desktop/mobile screenshots reviewed. No test servers, test database container or task-owned volumes remain.
- GitHub confirms the pushed code revision. Check runs, commit statuses, Actions runs and deployments are empty; aggregate status is `pending` because no statuses exist. No CI gate was bypassed.
- **Deployment remains incomplete:** no established release target, URL, command, credential location or rollback procedure is documented/discoverable. Only local Compose startup is documented. Need the existing destination/procedure; do not provision or invent one. Deployed revision and live health checks are unavailable.
- Runtime npm advisories: frontend 0, backend 0. Five frontend development dependency entries remain in the unpatched `braces` lint chain. The pre-existing admin-route case bypass remains outside the authorized policy-change scope.
- Local run/review instructions: [README](../../README.md#local-verification-with-synthetic-data). Evidence below uses synthetic data and provider/SDK doubles, not live customer records or real-user feedback.

The first sections retain the preceding local-only goal's history. The **Next version** section records the subsequent authorization to develop, commit, push and deploy.

## Starting state
- 2026-10-03; revision `81cc7750b77880f8a3e4a125c1dbd45e160abc28`; staged, unstaged and untracked work all empty.
- One agent; local changes only. No commits, publishing, deployment, policy changes or real integration credentials.
- Git requires per-command `-c safe.directory=C:/Users/Juha/Desktop/Projektit/wcl-vod-review` under the sandbox account.
- Product: English-only Next.js 16 / React 19 web review tool; Express 5 + Mongoose 8 / MongoDB 7 caches. No i18n framework or product/architecture documents. Preserve the dark blue/purple timeline identity.
- Existing journeys: paste report + VOD links; select a boss pull; seek casts/deaths in either video platform; calibrate and restore sync; zoom/pan between fights; recover from unavailable data.

## Baseline
- `cd backend; npm.cmd test`: build and 5 URL parser tests passed.
- `cd frontend; npm.cmd run lint; npx.cmd --no-install tsc --noEmit`: both passed.
- Frontend runs at `http://127.0.0.1:43180` with BACKEND_URL explicitly set to task-local `http://127.0.0.1:43181`. Port 3300 was occupied; left untouched.
- Browser homepage renders; title is the scaffold default. No real reports requested.
- Docker needs escalation under the sandbox user. Created only `wcl-goal-01a1021d-mongo`, MongoDB 7.0.40 (repository-pinned digest), localhost:57117, 512 MB, 1 CPU, no existing volumes.
- Declared node_modules already present. Adding only Playwright as a development dependency for repeatable browser regressions.

## Ranked backlog / acceptance criteria
| Rank | Finding / evidence | Impact, confidence, effort, risk | Acceptance |
| --- | --- | --- | --- |
| 1 | Events pagination uses `startingAfterTime` while startTime stays fixed; errors become empty success; cache omits eventTypes and ignores zero start time | Core correctness, high, medium, medium | Full ordered pages; invalid/non-progressing/partial responses fail visibly; filtered/empty/zero-start results cache correctly; real MongoDB regression tests |
| 2 | Report enhancement resets lastUpdated without refreshing the report | Stale active raids, high, small, low | Cached reads cannot prolong source freshness; refreshed reports expose new fights |
| 3 | Timeline has no retry/back path, hides event/metadata errors, hangs with missing wclCode; async results have no cancellation | Broken recovery, high, medium, medium | Invalid URLs settle; failures have retry; successful data survives unrelated failures; rapid fight changes stay isolated |
| 4 | Canvas-only fight/event selection; 210px labels crowd narrow screens; no manual coarse sync except dragging | Core keyboard/touch task failure, high, medium, medium | Semantic fight/event selection and calibration; desktop and narrow-screen journeys verified; retain expert canvas controls |
| 5 | Player effects depend on their own player state; delayed SDK loading/cleanup and failed embeds need verification | Playback reliability, medium, medium, medium | Both external SDK adapters initialize/seek/clean up reliably and expose actionable failure |
| 6 | Video metadata duplicated between parse warmup and endpoint; concurrent requests can duplicate provider work | Quota/latency waste, high, medium, low | One shared retrieval/cache path; measured request reduction; retained response contracts |
| 7 | Scaffold page metadata, busy homepage chrome and inconsistent form/recovery states | Clarity, high, small, low | Coherent product title, form labels/help/errors/focus, preserved input and responsive layout |

## Design / test decisions
- Scoped operational UI changes, primarily desktop review with keyboard and mobile touch alternatives. Keep video, selected fight, events and sync controls in a clear hierarchy. Existing dark palette, restrained chrome, no new aesthetic direction.
- Apply end-user-ui-ux and impeccable audit, then harden/adapt as needed. Context script run from repository with absolute skill path; absent PRODUCT.md is not blocking.
- TDD seams: public WarcraftLogsClient methods through a local HTTP provider double and real disposable MongoDB; Express HTTP input/output; real browser interactions with synthetic providers/SDKs. No mocks of internal collaborators as sole evidence.
- Architecture decisions stay here. Refactor only duplicated metadata retrieval and lifecycle/test coupling when needed.
- Credentials in backend/.env were not read or used. Every test/runtime overrides external targets and credentials with synthetic values, or uses request interception for external services.

## Coverage / deferred scope
- Assess cache freshness/keying/index use, input validation, external errors/timeouts, concurrency, frontend requests/rendering, player cleanup, keyboard/touch, mobile layout, tests/setup.
- Authentication/authorization/encryption and deployment configuration are out of scope. Admin endpoint exists but frontend proxy already blocks `/api/admin`; no policy changes planned.
- No migrations planned. Production-only metrics and live provider playback require a separate authorized environment.

## Completed batches
### 1. Event completeness and cache freshness
- Red/green MongoDB + local HTTP tests reproduced: paginated result `[]` instead of two events; repeated empty zero-start requests; 10 instead of 12 pages; swallowed provider failure; report still showing old upload at age 61 minutes.
- Cursor now advances via startTime, queries constrain fightIDs, non-progress and the 100-page safety ceiling fail explicitly rather than returning partial success.
- Cache key includes canonical eventTypes and cacheVersion 2. Empty and zero-start results cache; legacy unversioned documents are left intact and regenerated on demand. Existing compound index still covers report/fight/window lookup; no new index or destructive migration.
- Removed unused enhancement cache writes, which both extended source freshness and could overwrite refreshed fight data.
- `cd backend; $env:MONGODB_TEST_URI='mongodb://127.0.0.1:57117/wcl_goal_test_events'; npm.cmd run test:integration`: build + 5 tests passed against MongoDB 7.0.40. The guarded test database is dropped after the run.
- Self-reviewed diff: bounded WCL/client/model changes; no unrelated policy/config changes.
- Browser baseline confirmed `/timeline` stays on “Loading report data...” with no way back; new Playwright regression is red for the intended missing recovery link.
- Next dev generated frontend/AGENTS.md and CLAUDE.md; these were absent at baseline, read as applicable guidance, and will be removed after stopping the task server. Installed Next.js docs read for hooks, route handlers and metadata.
- npm install reported 10 dependency advisories. No upgrades attempted; investigate audit details and record separately (offline audit is not authoritative).

### 2. Review journey and accessible controls
- Incomplete links settle with a New review link. Report/events/video-detail failures have visible retry and retain independent data. Async effects abort on cleanup, review state is keyed by report/video, and empty fights have a distinct explanation.
- Reused API helpers/types for response errors, cancellation and 45-second browser deadlines. Added semantic fight selector, paginated/filterable event list, manual fight-start alignment, fit/zoom/pan buttons, localStorage failure handling, and finite/out-of-range seek checks.
- First fight is selected by default; an explicit fight link takes precedence. YouTube publish time is not used as recording start. Twitch uses createdAt. Manual alignment persists per report/platform/video.
- Kept dark palette and canvas tracks. Removed nested decorative homepage framing, corrected document title, added form hints/focus/error handling. Desktop video and event list now sit side by side; mobile has stacked controls plus a horizontally scrollable canvas.
- `cd frontend; npm.cmd run test:e2e`: 16/16 passed, desktop 1440x1000 and touch-emulated 390x844 Chromium. Includes form failure/retry, invalid links, report retry, event retry/empty, metadata recovery, calibration/reload, unavailable storage, filters, lock/fit/zoom/pan and keyboard seeking. No page errors in the post-interaction visual scenario.
- `npm.cmd run lint` and `npx.cmd --no-install tsc --noEmit` passed; the transient canvasWidth dependency warning was addressed by using the observed width in drawing.
- Inspected `evidence/review-desktop.png`, `evidence/review-mobile.png`, and `evidence/form-recovery-mobile.png`. Two visual passes so far; desktop screenshot after the second pass keeps video and events visible together. Real phones and real provider playback are not verified.

### 3. HTTP / metadata reliability
- Extracted an importable Express app from server bootstrap so tests can run real routes without loading .env, opening a listener or starting background jobs.
- Measured synthetic cold workload: parse one URL plus eight concurrent metadata GETs, repeated three times. Before: provider requests [9,9,9]. Shared VideoMetadataCache after: [1,1,1]; warm reads use MongoDB. This is an 89% reduction in provider request count for this workload, not a production latency claim.
- Cache scope is platform + video ID, freshness seven days, incomplete/expired entries refetch. In-memory entries exist only for pending work and clear on success/failure. Legacy string durations remain readable without migration; write failures preserve successful provider responses.
- HTTP regression reproduced reversed/negative event ranges reaching provider work and malformed JSON returning HTML. Added validation and JSON parser errors; deduplicated identical report route aliases. Added 15-second external HTTP timeouts and stopped converting report/master-data failures to false empty/not-found success.
- Health regression reproduced MongoDB reconnect leaving `/health` stuck at 503 despite a working connection. Removed the redundant boolean connection flag; health now follows Mongoose's actual state, and shutdown always closes reconnect work.
- `npm.cmd run test:integration`: build + 10 tests passed after these changes, including repeated cold metadata bursts, legacy duration read, expiry, failure/retry and real MongoDB disconnect/reconnect.
- Audit: npm frontend audit reports 10 advisories (1 critical, 8 high, 1 moderate), including Next.js 16.3.0. Stack upgrades deferred by explicit scope. npm recommends Next 16.3.8; assess release notes and sharp/tooling advisories in a separate dependency upgrade. References: GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4, GHSA-vcvr-r3jv-pc5j, GHSA-rgj7-g3m4-5g8c. No audit fix run.

### 4. Player lifecycle, build and final integration
- Red/green browser tests reproduced a permanently loading blocked YouTube script and a Twitch navigation crash caused by calling an unsupported destroy method.
- SDK loads are shared across mounts and have a 15-second deadline; failed loads can retry. Player readiness also has a deadline. Cleanup cancels polling, ignores late callbacks, destroys YouTube instances and removes Twitch iframes/listeners without an unsupported destroy call. YouTube errors mark the player unavailable and provide retry/original-video recovery.
- The SDK owns a child inside React's stable host, avoiding replacement of a React-owned node. Callback changes no longer recreate a player. Both adapters seek and navigate away successfully; leaving during SDK loading and returning also works.
- Minimum player heights initially caused an observed 320px overflow; explicitly constrained width fixes it. Twitch retains its 400px minimum inside a scrollable wrapper. Inspected desktop, mobile and 320px screenshots after interaction; long titles, 51 events/pagination, empty filters/reports and reduced motion are exercised.
- Production build initially failed because unused scaffold fonts required a Google download. Removed those downloads; the existing Arial body remains, with system monospace for timing. Build now passes offline.
- Full-stack browser test uses the actual Next proxy, Express handlers/clients and disposable MongoDB. Only provider HTTP and player SDK boundaries are doubled. It checks the synthetic API marker before requests, submits links, selects a fight, aligns/seeks, reloads with saved calibration and warm caches, changes fights and returns home.
- Final `backend` checks: `npm.cmd test` = 5/5; `npm.cmd run test:integration` = 11/11. Includes preserved legacy event documents and refresh after 15-minute expiry.
- Final `frontend` checks with guarded MONGODB_TEST_URI: `npm.cmd run test:e2e` = 26/26; `npm.cmd run lint`, `npx.cmd --no-install tsc --noEmit`, `npm.cmd run build` all passed. Windows sandbox could not terminate the first fixture process; stopped only that verified process via escalation. The approved out-of-sandbox suite then exited normally in 25.2s. No assertions or cleanup checks were disabled.
- MongoDB query-plan assessment: 1,000 synthetic cache documents, exact report/fight/window/types/version lookup. Existing compound index selected (IXSCAN), one key and one document examined, one returned. No added index, migration or storage-saving claim. Details: `evidence/cache-query-plan.json`.

## Final self-review and scope coverage
- Reviewed tracked changes against the clean starting revision plus every new source/test/config file. Standards and goal/spec checks were sequential self-review, not independent reviews. Removed duplicated frontend event types and obsolete API types; kept SDK-specific lifecycle code explicit. Only development dependency added: Playwright; no locked production packages changed.
- Core journeys, errors, empty/partial states, focus, keyboard seeking, touch-emulated layouts, independent retries, cancellation and storage failure are covered. No localization framework exists; maintained English copy consistently.
- Backend review covered validation, shared metadata work, report/event freshness, platform/filter isolation, cache write failures, actual connection health and bounded external calls. Existing public response fields remain; source failures now produce errors instead of misleading empty success. No account/tenant system exists; caches retain the existing application-wide credential scope.
- Data design: existing report, event-window and video indexes support observed access patterns; encounter IDs and boss names already batch/deduplicate. No measured need for additional indexes, transactions, schema redesign, joins or a new service. Existing unused event collection and old cache entries were not deleted. No storage reduction claimed.
- Architecture: extracted the Express app from startup to test real HTTP handlers without .env/background jobs; shared duplicated metadata retrieval; preserved boot behavior and stack. Remaining larger timeline decomposition and encounter enrichment caching are low-priority follow-ups without a demonstrated need in this workload.
- Motion self-review (emil-review-animations): approve the changed motion. Frequent calibration/lock buttons now respond immediately, reduced-motion disables movement, and no entrance/stagger effects were added. The canvas retains direct manipulation and position feedback. No unresolved motion finding.

| Before | After | Why |
| --- | --- | --- |
| Calibration/lock controls scaled on every press with multi-property transitions | Immediate hover/press feedback; visible focus; reduced-motion rule | Frequent and keyboard actions remain quick without movement |

## Remaining findings / limitations
- **Deferred access-control defect (confirmed locally):** Next blocks only the case-sensitive `path[0] === "admin"`; Express's default router matches case-insensitively. With the fixture marker verified, POST `/api/admin/update-achievements` returned 404 while POST `/api/ADMIN/update-achievements` reached the handler and returned 500 because synthetic Blizzard credentials are disabled. No external API calls or production records. This behavior existed at the starting revision. Authorization changes are explicitly outside scope; recommend a separate fix that normalizes/denies admin paths consistently, adds case-variant regression tests and enforces the chosen admin policy at the backend boundary.
- **Deferred dependency updates:** frontend audit has 10 vulnerable package entries (1 critical, 8 high, 1 moderate); backend audit has 2 (Axios high, qs moderate). These are package advisories, not verified exploitability in this app. Recommend a dedicated reviewed dependency update, including Next/sharp and Axios/qs, followed by this regression suite. Do not deploy this result as a security sign-off. No `audit fix` or stack upgrade was run.
- Live Warcraft Logs, Blizzard, YouTube and Twitch accounts/playback were not tested; credentials were neither read nor used. WCL documentation endpoints returned 403; pagination is verified through the synthetic provider contract, not a live report. Twitch origin/HTTPS policy, embed permissions, ads and actual device behavior require authorized provider testing. Primary YouTube/Twitch docs were consulted for publication-time semantics and playback interfaces.
- Browser coverage is desktop Chromium and touch-emulated Pixel 7 at 390px, plus 320px. No physical-device, screen-reader, Safari or Firefox claim. Existing Twitch 4.5s latency estimate remains an estimate; UI asks users to check alignment.
- Compatibility: cache schema adds optional `eventTypes` and `cacheVersion`; old documents remain intact and new reads regenerate them. Legacy string video durations stay readable. No deployment/configuration or destructive migration. Rolling back to the old unscoped event reader requires reviewing derived-cache invalidation first because it cannot distinguish filter/version variants. No production invalidation was performed.
- Per-request timeouts and pagination bounds exist; no production load/latency or memory profile was collected. Request-count improvement is limited to the stated synthetic workload. Remaining proxy-wide deadlines/rate limits and production capacity work need separate requirements.

## Reproduce and inspect
- Root README has complete PowerShell setup/test/debug commands with a dedicated MongoDB container and cleanup.
- Integration URI used here: `mongodb://127.0.0.1:57117/wcl_goal_test_events`. Tests additionally use suffixes `_api` and `_browser`; ad hoc plan/security checks used task-specific `wcl_goal_test_queryplan` and `wcl_goal_test_security_browser` databases in the same disposable container.
- Screenshots: `evidence/review-desktop.png`, `review-mobile.png`, `form-recovery-desktop.png`, `form-recovery-mobile.png`, `narrow-before.png` (reproduced minimum-height overflow), and `narrow-empty-filter.png` (fixed 320px layout). All content is synthetic. Failed-run traces were temporary ignored output; final suite has no failures.
- Cleanup complete: task frontend and synthetic API stopped; no task listeners remain on 43180, 43181 or 57117. Closed the task-created browser tab. Removed task-generated frontend/AGENTS.md and CLAUDE.md after Next stopped. Removed only container `wcl-goal-01a1021d-mongo` (ID b71b6e556bef...) and its two verified anonymous volumes; container/volume listings confirm removal. Installed test dependencies and cached runtimes remain available for repeat runs. No commits, pushes, PRs or deployments.
- `git diff --check` passed. All feasible high-priority findings within the authorized scope are resolved and verified; remaining security-policy/dependency work and live-provider/device verification are explicitly deferred above. Goal complete within that scope; local changes remain uncommitted for review.

## Next version — product implementation verified; deployment prerequisite missing (2026-10-03)

### Baseline and product brief
- Starting revision remains 81cc7750b77880f8a3e4a125c1dbd45e160abc28 on main. The prior completed goal's verified local improvements are inherited, not user edits to overwrite. File hashes are in evidence/version2-start.json. No staged changes at this goal's start.
- Observed: English-only early-stage utility combining a WCL report with a YouTube/Twitch recording. No accounts, feedback/analytics, saved-review library, shared calibration or notes. Existing review journey and 26 browser/16 backend checks passed immediately before this request.
- Documented promise: combine WCL logs and VODs for reviewing. Agent-inferred users: raid leaders and players diagnosing casts/deaths. Their job is to find a moment, understand it, and retain or hand off an actionable observation.
- Strengths: video/log synchronization, fight selection, canvas detail plus accessible event navigation. Missing next step: users must manually retain links, calibration and findings elsewhere. User-value hypothesis, not interview evidence: preserving this context makes repeat reviews and debriefs more useful.

### Bounded research (accessed 2026-10-03)
| Alternative / primary source | Source-supported behavior (not hands-on observation) | Relevance and tradeoff |
| --- | --- | --- |
| [Archon App](https://www.archon.gg/download) | Describes automatic recording and synchronization of videos with combat logs and post-pull review. | Keep the moment and log context together. Desktop recording/cloud storage would add disproportionate operating scope here; do not copy it. WoW help page was HTTP 403. |
| [Wipefest guide](https://www.archon.gg/classic-fresh/articles/help/how-to-improve-your-raid-with-wipefest) | Accepts WCL report/fight links; organizes analysis around mechanics, players and a fight timeline. | Preserve selected-fight context in saved/shared reviews. Do not invent encounter scoring without domain rules/data. |
| [Frame.io V4 comments](https://help.frame.io/en/articles/9105278-comments-panel-overview) | Documents timecode ordering, editing/deleting comments, exact-timestamp links and export. | Attach observations to a moment and make the result portable. Enterprise collaboration/accounts are unnecessary for this tool. |
- Own-app observations and tests are direct evidence. Comparator descriptions above are first-party claims; selected benefits are agent inferences. No accounts/trials, customer data or external contacts used. Research is sufficient to choose the next batch.

### Ranked program and acceptance
1. **Essential outcome: retain and share a review.** Raid reviewers currently lose selected fight/time and cannot transfer sync. High-confidence local gap; expected repeat-use benefit remains a hypothesis. Add bounded browser-only saved reviews and moment links including sync. Accept: reopen exact fight/time/offset, fresh browser follows shared link, explicit save feedback, malformed/unavailable storage and denied clipboard recover. Low operating cost, no backend/accounts.
2. **Worthwhile connected capability: timestamped notes and debrief export.** Current workaround is a separate notes tool plus manual timestamps. Medium confidence of value, high confidence of missing outcome. Accept: capture a fixed moment, persist/revisit/edit/delete/undo, export readable notes with exact links; failed storage keeps the draft. Bounded local records; no silent cloud/privacy commitment.
3. **Release quality: assess supported patch fixes for known dependency advisories.** New goal permits non-major changes. Apply only relevant compatible fixes, verify affected suites; avoid general upgrades.
4. **Deferred boundary: admin path case bypass.** Existing authorization-policy defect evidenced in prior goal; requested scope explicitly excludes changing that policy. Recommendation: agree admin access boundary, normalize proxy matching and enforce it at the backend with regression tests.
5. **Speculative/out of scope:** auto recording, cloud accounts, boss scoring, multi-player collaboration, new hosting. No evidence justifying their ongoing cost.

### Shape/craft decisions (agent-selected)
- Keep the dark operational palette, system sans type, mono timestamps, blue video/purple log tracks. No replacement branding or raster assets required.
- Compared a new dashboard/annotation sidebar with a compact saved list on the existing start page and a notebook beside the player. Choose the compact addition: discovery and return paths without a new route or navigation system.
- Actions live below the player. Starting a note captures its moment immediately; writing does not move its timestamp. Notes retain video/fight/calibration context. Export is a local Markdown download. Saved reviews show source/fight/position and allow removal with undo.
- Preserve the form for first-time users. Saved content appears below it. Notes are bounded and plain text. Failure messages distinguish an unsaved draft from durable storage. Shared links carry context but never note text.
- Existing visual evidence is sufficient to retain the established palette; an image mock would not resolve an open decision. Implement a working local prototype and inspect desktop/mobile post-interaction screenshots, at most three refinement passes.
- Observable test boundary: browser actions, navigation, fresh browser context and downloaded file. External SDK/API doubles remain at genuine boundaries; existing full-stack Mongo scenario will include the new workflow.

### Release discovery
- origin: https://github.com/Koodattu/wcl-vod-review.git; sole/default branch main, unprotected, remote revision equals baseline. Escalated gh authentication and read checks succeeded as Koodattu after sandbox credential/network failure.
- GitHub workflows=0, environments=0, deployments=[], webhooks=[], check runs/statuses=[]; no required CI or push-triggered deployment found. README documents Docker Compose on localhost only. No running WCL deployment found in Docker; unrelated projects left untouched.
- Commit and normal push are authorized. Deployment target/command/access and rollback procedure remain missing. Do not invent a destination or alter deployment configuration. Finish independent product work and push before requesting the exact established deployment procedure.

### Delivered product batch / current verification
- Added browser-local saved reviews, precise moment links, timestamped notes, edit/delete/undo and Markdown debrief export. No new runtime dependency, backend endpoint or schema needed for these capabilities.
- One versioned library is bounded to 20 reviews, 100 notes per review and 2,000 characters per note. New saves read the latest library; storage events refresh other tabs. Damaged/unknown-version data is never overwritten. Full storage leaves drafts intact. Existing sync keys remain compatible; shared/note calibration does not overwrite them.
- Notes attach to the fight actually under the captured video moment, even if a different fight is selected. Opening a note restores video/fight/calibration directly. A regression caught that Next navigation to an unchanged URL did nothing; direct restoration fixes that without re-fetching the report.
- Shared links exclude notes. The UI explains local persistence and original-source access. Removed reviews/notes offer undo; draft text warns before leaving via the main navigation or reloading/closing. Export escapes Markdown/HTML syntax from source titles and plain-text notes.
- First red browser check timed out on the missing Save review action. First implementation passed 8 new scenarios across desktop/mobile. Wider 42-test run: 40 passed, 2 failed for the actual unchanged-URL restoration bug; targeted fix verified on both viewports. Test selector ambiguity and missing explicit SDK readiness wait were corrected without weakening behavior assertions.
- Visual pass 1 inspected notebook desktop/mobile screenshots: coherent typography and clear actions. Added an Adjust sync anchor beside the video so the longer review retains direct access to calibration. Layout detector returned [] for the four new/changed surfaces. New content uses existing color/type hierarchy; no new animation. Full notebook/busy-state and production-build checks pending.
- Lint initially raced Playwright deleting its generated test-results directory. ESLint now ignores only generated Playwright output, retaining all source/test checks. Lint and TypeScript passed after the change.

### Targeted security updates
- Verified current npm advisories and first-party [Next 16.3.8 release](https://github.com/vercel/next.js/releases/tag/v16.3.8) and [Axios 1.20.0 release](https://github.com/axios/axios/releases/tag/v1.20.0). Updated Next 16.3.0 → 16.3.8 plus its matching lint config; Axios 1.19.0 → 1.20.0; qs 6.15.3 → 6.16.0; compatible sharp, brace-expansion, js-yaml and humanfs patches within existing ranges. No major upgrade, override, audit-force or policy/config change.
- Lockfile review: remaining changes are these packages' native binaries/helpers/dependencies plus the previously authorized Playwright dev dependency. Next still requires Node >=20.9.0; existing runtime meets it.
- npm audit: frontend runtime 0 findings (previously Next critical + sharp high); backend all dependencies 0 (previously Axios high + qs moderate). Frontend full tree still has 5 high package entries rooted in unpatched braces through the Next lint plugin. Suggested npm fix is a major downgrade; deferred, no forced downgrade or disabled checks.
- Backend after updates: build, 5 URL tests and 11 real MongoDB/HTTP integration tests passed. Metadata concurrency remains [1,1,1] upstream calls for three nine-request bursts (baseline [9,9,9]).
- Disposable Mongo resource: wcl-next-version-01a1021d, id 7b7039ce8b9e9bfb2aac0c6a251b67ebd55e80513ab578176133a64597fcfef0, task label, localhost:57117, 512 MiB / 1 CPU. Synthetic databases wcl_goal_test_version2* only. Removed with its anonymous volumes after final verification; ports 43180, 43181 and 57117 have no listeners.

### Final product and engineering self-review
- Delivered the feasible high-priority program: reliable complete fight data and recovery (inherited batch), retaining/revisiting a review, calibrated handoff, and a portable debrief. The latter outcomes were unavailable at baseline and are now exercised end to end. Expected raid-review usefulness remains an agent hypothesis requiring actual user feedback.
- Preserved the form, two video providers, dark palette, canvas timeline and sync conventions. No new locale, account, service, production dependency for features, tracking, deployment configuration or policy change. Storage scope/limits and export behavior are explicit. New observations are plain text; no notes are sent to a server or embedded in moment links.
- Reviewed staged/unstaged/new files and the complete release diff. Changes are confined to the selected workflows, provider/cache correctness, lifecycle/recovery, targeted security updates and reproducible verification. Generated Next agent files were removed after the task servers stopped; they were absent at baseline. No secrets, production datasets, build output or Playwright traces staged.
- No database migration is required. Cache fields are additive; legacy records are retained and refreshed on demand, verified with real MongoDB. Rolling back to the old event-cache reader needs a separately planned derived-cache invalidation because it does not distinguish filters/version; no production invalidation performed.
- Local browser verification uses Chromium desktop 1440×1000, touch-emulated mobile 390×844, and a 320px/reduced-motion stress scenario. Busy states include 51 events and 100 notes. Fresh-browser shared links, same-URL note restoration, calibrated reload, all-note export, quota/blocked/corrupt storage, cross-tab updates, undo, draft protection, SDK retry/unmount and the complete Next→Express→Mongo flow pass. Full-stack scenarios recorded zero unexpected page errors or failed HTTP responses.
- Production build passed with Next 16.3.8. Initial optimized-build run passed 44/44 but warned that `next start` is not the standalone entry point. Updated only the test harness to copy public/static assets as the existing Dockerfile does and run `.next/standalone/server.js`; its final run passed **44/44 in 31.5s**. This verifies the Windows standalone server form, not a deployed Linux image or live provider credentials.
- Final commands: `npm.cmd --prefix backend test`; `npm.cmd --prefix backend run test:integration` with guarded disposable URI; frontend `npm.cmd run lint`, `npx.cmd --no-install tsc --noEmit`, `npm.cmd run build`; `MONGODB_TEST_URI=.../wcl_goal_test_version2` and `WCL_TEST_PRODUCTION=1`, then `npm.cmd run test:e2e`. Exact PowerShell setup/cleanup is in README. Backend remains 16/16 after Axios/qs fixes.
- Final visual evidence: `evidence/notebook-desktop.png`, `notebook-mobile.png`, `saved-reviews-desktop.png`, `saved-reviews-mobile.png`; existing recovery/narrow-layout evidence retained. Two visual passes on additions; no further cosmetic iteration needed. Layout detector returned no findings. Existing native focus styles cover the new textarea and scrollable note list.
- Limits: real Twitch/YouTube playback and authenticated WCL contracts, physical devices, Safari/Firefox and screen-reader sessions were not verified. Production workload latency/storage, real user value, hosting/rollback and live health remain unverified. No performance claim beyond the measured synthetic provider-call reduction and query-plan evidence.

### Release evidence
- `616d1d5aee81dcd6afd8a091441f263fa40c3c41` — backend correctness/cache/HTTP tests and Axios/qs fixes.
- `067f728e188a12218855d122226e6ecc4034251e` — frontend workflow/recovery, tests, Next security fixes and README. The verified source matches this committed tree (`git diff --exit-code` passed).
- Normal `git push origin main` succeeded (`81cc775..067f728`). GitHub branch API independently returned `067f728e188a12218855d122226e6ecc4034251e`; branch unprotected. Checks/statuses/Actions/deployments queried for that SHA: 0/0/0/0. No push-triggered release appeared.
- This documentation/evidence checkpoint follows the code commits without changing tested application behavior. Final remote documentation HEAD is reported in the conversation and obtainable with `git log -3 --oneline`.
- Deployment identifier/URL, deployed SHA, live smoke checks and rollback confirmation: **not available**. Next required input is the project's existing release destination and procedure. Authentication-policy remediation is a separate deferred decision, not permission to invent infrastructure.
