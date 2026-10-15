# Execution ledger — docs/superpowers/plans/2026-10-14-studio-text.md

Base: b9ae52a, branch feat/studio-02-text-editor, isolated sibling worktree n392-studio-02. Native worktree tool unavailable for the project mirror; git worktree fallback created outside the repository to avoid altering the original checkout.

Pre-flight: #82 supplies identity isolation consumed by Studio persistence/editor. #4 changes only checkout access and its frontend opening flow. Document version and layer limits shared by frontend normalization and backend DTO require matching boundary tests.

Baseline: frontend 35 tests green; backend 183 tests green against temporary PostgreSQL 16 on localhost port 55432. Default sandbox blocks Vitest cache rename; tests run with approved escalation. Backend unit command alone needs environment; complete npm test loads .env.test.

Task 1: initial regression tests RED (private draft survives logout; late A response shown for B), then GREEN. Added mounted Studio reset, anonymous draft preservation and unknown-owner migration. Late 401 regression RED (logged B out); API handler now checks the identity used by the request before affecting the active session.

Task 2: three integration cases RED (anonymous 200; non-owner 200; shared identifier returned both accounts), then GREEN after routerGuard and usuario_id filter. Frontend sends Authorization through API fetch, checks checkout origin/path, and opens HTML in a sandboxed iframe.

Decision: obsolete unowned caches are discarded instead of assigned to whoever next logs in. Known anonymous workspaces are preserved. Cost: old local-only unowned designs cannot be recovered automatically; ambiguity cannot safely identify an owner.

Task 3: full configuration and artwork document version 1 saved in optional JSONB. Round-trip integration tests confirm remote recovery without local cache, legacy records and input validation. Local pending edits take precedence over remote snapshots; synced records use the remote document.

Task 4: real geometry tests cover all four silhouettes and both rims/temples. The renderer projects only onto frame meshes, fits the footprint to their surfaces, and disposes resources. Studio adds the Artwork step, controls, six-layer limit and clear factory-validation restriction. Gallery, cart context and order DTO also block artwork purchases.

Independent review: one reviewer inspected the uncommitted change. Six findings were addressed in one fix pass: cross-tab token/owner mismatch, opaque iframe Origin rejected by CORS, remote snapshots losing pending edits, thin cat-eye rim clipping, gallery cart bypass, and legacy edits being ignored by modern config. Cross-tab, offline merge, geometry, gallery and legacy-update regressions were reproduced before fixes. Existing webhook/confirmation authorization issues assigned elsewhere are not declared fixed.

Browser QA: text appeared on the temple and front. Created a synthetic account only in the preview database, saved a design remotely, logged out (clearing private local cache), logged in and reopened the full artwork from the account. At 390x844, found the legacy body overflow lock clipping the editor; scoped mobile CSS unlocks scrolling and keeps content within the viewport. A temporary ignored iframe harness used actual local billing HTML with the same Cart sandbox policy. Its form returned to the frontend payment-success screen. Harness removed after testing; no real payment or production database was used.

Final verification: frontend 58/58, backend 197/197, both typechecks and builds green. Artwork panel 3/3 rerun after explicit accessible labels; final frontend suite/build also repeated successfully after the mobile CSS change. git diff --check clean; local environment files and QA harness directory are ignored. Vite reports existing >500kB chunks, not a build failure.

Known preview limitation: the existing AuthProvider requests the staff users endpoint for a client during reload and can show a dismissible 403 notice. This unrelated API-authorization UX is not changed here. Studio checkout without artwork also still uses the existing nonnumeric factory-demo ID, incompatible with the current order DTO; the checkout sandbox itself was verified with valid local fixture IDs, not claimed as an end-to-end fix for that existing contract.

Delivery: branch kept isolated from the original checkout and based on dev b9ae52a. README documents use, migration order, legacy cache behavior and production restrictions. No PR or merge has been performed.
