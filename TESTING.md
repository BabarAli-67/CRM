# Flash Digital CRM — Testing Checklist

## Follow-ups

- [ ] **PCI / payment processor:** Integrate a real PCI-compliant payment
      processor/tokenizer before any live card data is entered. Until then,
      `payment.cardReferenceToken` is an opaque placeholder only — never store
      raw card numbers or CVV on the Lead document (`cardLast4` + `cardBrand` +
      token are the only allowed card-related fields).

## Phase 3.1 — Callbacks

- [x] Agent creates callback → 201, appears in `GET /api/v1/callbacks/mine`
- [x] Missing required field (`businessLink`) → 400
- [x] Ownership isolation — Agent B does not see Agent A’s callback
- [x] Admin visibility — `super_admin` `GET /api/v1/callbacks` returns all
- [x] Auditor write block — `admin` PATCH → 403
- [x] Promote flow — Lead created; callback `status: promoted`; still admin-fetchable
- [x] Cross-role read block — non–`sales_agent` `GET /mine` → 403

## Phase 3.2 — Leads

- [x] Direct lead creation → 201, `sourceCallbackId: null`
- [x] Vanishing rule — `closed_sale` lead absent from `GET /api/v1/leads/mine`
- [x] Closer visibility — `GET /assigned-to-me` only where `closerId ===` caller
- [x] Cross-role edit block — `tech_team` PATCH → 403
- [x] Disqualify flow — `stage: disqualified`, disappears from `/mine`
- [x] Follow-up shared alert — closer `mark-alert` sets flag; agent re-call stays single `true`
- [x] Auditor parity — `admin` GET matches `super_admin`; PATCH → 403
- [x] `GET /api/v1/leads/:id` — ownership-checked fetch for agent/closer/super_admin;
      `canAccessLead` reads populated `agentId`/`closerId` via `_id` (not `toString()` on
      the populated doc) so promote → LeadEditPage does not 403 the owning agent

## Phase 3.3 — Close Sale + Stats

- [x] Close via link → 200, `stage: closed_sale`
- [x] Close via card → 200; DB has last4 + token only (no raw PAN/CVV)
- [x] Validation — `via_card` without `cardReferenceToken` → 422
- [x] Vanishing confirmed — closed lead absent from `/mine` immediately after close
- [x] Counter increments — `GET /api/v1/stats/my-closed-count` returns `{ count }` only
- [x] Unauthorized close — `tech_team` → 403

## Phase 3.4 — Handover (CST → Tech)

- [x] CST sees queue — closed lead appears with `pending_review` + links/payment
- [x] Assign to tech — `cstStatus: assigned`; tech sees lead in `/my-projects`
- [x] Tech isolation — Tech B does not see Tech A’s assignment
- [x] Milestone forward only — skip `assigned → completed` rejected (400); must step
      `assigned → in_progress → completed`
- [x] Backward block — same-step / reverse milestone → 400 (not permitted; super_admin
      override via `/reassign` only)
- [x] Super admin override — `PATCH /reassign` with `overrideReason` succeeds; `overrideLog`
      entry recorded
- [x] Auditor read-only — `admin` `GET /queue` → 200; `/assign` → 403; `/reassign` → 403
      (`blockReadOnlyAdmin`)

## Phase 3.5 — Month-End Performance Aggregations

- [x] Aggregation correctness — 2 closes this month + 1 last month; current `?month=` shows
      Agent A `closedCount: 2`
- [x] Role block — `sales_agent` `GET /api/v1/reports/monthly` → 403
- [x] Auditor parity — `admin` and `super_admin` return identical monthly payload

## Phase 4.1 — Reminder Chimes & Popups

Verified via `/dev/reminders` harness + API mark-alert (production callback/lead tables
not yet wired to `useReminderScheduler`).

- [x] Beep plays — `playChime('single')` creates 1 sine oscillator (no throw)
- [x] Double vs single distinguishable — `single` → 1 beep; `double` → 2 beeps ~200ms apart
- [x] 5-min alert fires — popup + single-chime path + `fiveMinFired` mark at T−5m window
- [x] Exact-time alert fires — popup + double-chime path + `exactTimeFired` mark
- [x] No duplicate on refresh — items with both alert flags true do not re-fire; API
      `mark-alert` persists `fiveMinFired: true`
- [x] Cross-user isolation — reminder with `notifyUserIds: [agent-b]` does not fire for
      `agent-a`
- [x] Shared lead follow-up — follow-up with `notifyUserIds: [agent-a, closer-a]` fires for
      `agent-a` (dual-browser closer session not run; isolation + shared notify list cover
      the rule)

## Phase 4.2 — My Callbacks UI & Admin Monitor

- [x] Create callback via UI — CallbackForm submit adds row without manual refresh
- [x] Validation errors surfaced — empty `businessLink` blocked (HTML5 required:
      “Please fill out this field.”); no POST sent
- [x] Promote button — `POST /promote` succeeds and navigates to
      `/dashboard/sales-agent/leads/:id/edit` with LeadForm mounted (Phase 4.3)
- [x] Admin sees all — super_admin AllCallbacksPage lists all agents’ callbacks
- [x] Agent isolation on UI — Agent B My Callbacks empty; Agent A’s rows not visible

## Phase 4.3 — Lead Form & Data Inheritance

Verified via `backend/scripts/test-phase43-lead-form.mjs` (6/6) against live API.
Also fixed `canAccessLead` so populated `agentId`/`closerId` on `GET /leads/:id` no longer
403 the owning agent (needed for LeadEditPage after promote).

- [x] Field inheritance — promote callback → lead has `businessName` / `phone` /
      `websiteLink`←`businessLink` / `notes`; `GET /leads/:id` returns the same for the agent
- [x] Closer dropdown — `GET /users?role=closer&status=approved` returns only
      `role: 'closer'` (excludes agent/tech); LeadForm uses this endpoint
- [x] Follow-up alert wiring — follow-up set ~5.5 min out on lead assigned to Closer X;
      visible on agent `/mine` and closer `/assigned-to-me`; both roles can
      `PATCH .../follow-up/mark-alert`; `agentId`+`closerId` feed `useReminderScheduler`
      on MyLeadsPage / AssignedLeadsPage (live dual-browser chime not re-run; same notify
      path as Phase 4.1 shared follow-up)
- [x] Closer can close — assigned closer `PATCH /leads/:id/close` with payment
      (`via_link`) → `stage: closed_sale`; UI “Move to Closed Sale” opens payment capture
      dialog in LeadTable
- [x] Disqualify — `PATCH /disqualify` with reason → `stage: disqualified`, reason stored;
      absent from `/mine` and `/assigned-to-me` (DisqualifyModal requires reason before confirm)
- [x] No closed leads leak — `GET /leads/mine` (MyLeadsPage source) returns zero
      `stage: closed_sale` rows after close; admin `GET /leads` may still list them (expected)

## Phase 4.4 — Payment Capture, Vanishing UI & Counter

Verified via `backend/scripts/test-phase44-close-sale.mjs` (4/4) against live API +
static scan of `CloseSaleModal.jsx` (toast / cache vanish / PCI field surface).

- [x] Close via link — `PATCH /close` with `via_link` → 200, body is `{ closedCount }` only
      (no lead/payment echo); lead absent from `/mine`; CloseSaleModal wires
      `+1 Closed Sale` toast + immediate `setQueryData` removal from `myLeads` /
      `assignedLeads`
- [x] Close via card — same vanishing; DB stores `cardLast4` + `cardReferenceToken` +
      brand only; CloseSaleModal DOM/source has last-4 (`maxLength={4}`), brand select,
      and token — **no** full card-number or CVV `<input>` (helper text may mention CVV)
- [x] Counter increments live — `GET /stats/my-closed-count` rises by 1 after close;
      CloseSaleModal optimistically bumps / invalidates `myClosedCount` (no full page
      reload)
- [x] No re-fetch leak — repeated `GET /leads/mine` after close never returns the closed
      lead or any `stage: closed_sale` row (backend `stage: 'active'` filter holds)

## Phase 4.5 — CST Handover Queue

Verified via `backend/scripts/test-phase45-handover-queue.mjs` (4/4) against live API +
static scan of `HandoverQueuePage.jsx` (ExternalLink / paymentSummary / invalidate).

- [x] Queue populates — agent closes a sale → lead appears on next
      `GET /handover/queue` with `handover.cstStatus: pending_review`
- [x] Assign flow — CST `PATCH /handover/:id/assign` → `cstStatus: assigned`; lead
      absent from pending_review queue; UI invalidates `handoverQueue` on success
- [x] Links open correctly — queue returns exact Yelp/Website/GMB URLs;
      `ExternalLink` uses `target="_blank"` + `rel="noreferrer"`
- [x] Card data not exposed — via_card row summary is `brand · •••• last4` only;
      page never references `cardReferenceToken` (token may exist on API payload but
      is not rendered)

## Phase 4.6 — My Projects & Milestone Tracker

Verified via `backend/scripts/test-phase46-milestones.mjs` (4/4) against live API +
static scan of `MilestoneStepper.jsx` / `MyProjectsPage.jsx`.

- [x] Assignment visibility — after CST assigns a closed sale, techA
      `GET /handover/my-projects` includes the project at `cstStatus: assigned`
- [x] Milestone advance — techA `PATCH .../milestone` `assigned → in_progress`;
      status persists on my-projects refetch + DB; stepper Next is disabled while
      mutation pending
- [x] Isolation — techB my-projects does not include techA’s project; techB
      milestone PATCH → 403
- [x] Completion reflected — advance to `completed` sets `completedAt`; project
      stays completed on my-projects; absent from CST pending_review queue

## Phase 4.7 — Pipeline Overview & Month-End Reports

Verified via `backend/scripts/test-phase47-pipeline-reports.mjs` (4/4) against live API +
static scan of `PipelineOverviewPage.jsx` / `OverrideReassignModal.jsx` /
`MonthlyReportPage.jsx`.

- [x] Auditor parity — `admin` and `super_admin` see identical callback / lead /
      handover queue IDs; write controls gated on `user.isAdmin === true` (Auditor has
      no Override / Assign buttons)
- [x] Override visible only to super admin — Auditor `PATCH /handover/:id/reassign`
      → 403; `OverrideReassignModal` mounts only when `canWrite`; requires
      `overrideReason`
- [x] Report accuracy — seeded 3 closes (amounts 1000+2500+500=4000) appear in
      agent/closer monthly rows; tech completion ≥1 after milestone complete; admin and
      super_admin monthly payloads match
- [x] CSV export — MonthlyReportPage Export CSV button + client-side escaping;
      commas/quotes produce correctly formatted CSV

## Phase 5 — Internal Real-Time Messaging

Verified live against backend + frontend with Socket.io polling `200`, plus
`backend/scripts/verify-phase5-checklist.mjs` (15/15) and the full prior-phase
regression suite (callbacks → reports + hardening + chat API/upload/files) —
all scripts exit 0. Auth rate-limit was skipped in `development`/`test` only
(`rateLimiter.middleware.js`) so the multi-script suite is not blocked by the
production login cap.

- [x] Contacts list is correctly silo-scoped for every one of the six roles
- [x] A newly approved employee appears in the correct existing users' contact lists immediately, with no separate chat-registration step
- [x] Creating a conversation is idempotent — repeated attempts with the same contact never create a duplicate
- [x] All eight disallowed cross-silo pairings are blocked with 403 at the API, and never even shown as an option in the UI
- [x] Leadership (Super Admin, Auditor) can message and be messaged by every role, including each other
- [x] Text messages, typing indicators, and seen receipts all update live across two independent sessions with no manual refresh
- [x] Presence (online/offline) dots update live and correctly reflect actual connection state
- [x] Images, documents, and recorded voice notes all upload, send, render/play, and download correctly
- [x] The raw attachment-serving endpoint rejects a non-participant with 403, confirmed by direct URL access, not just UI behavior
- [x] A path-traversal attempt against the file-serving endpoint is rejected
- [x] The messenger icon and docked-window host are present and functional on all six dashboards
- [x] Multiple docked windows can be open at once, with the documented cap and auto-minimize behavior working correctly
- [x] The Auditor has full, unrestricted chat interactivity — no blockReadOnlyAdmin behavior anywhere in this module
- [x] All Phase 1 / Phase 1.7 / Phase 2 / hardened Phase 3 & 4 flows remain unaffected by the Socket.io server, the new uploads directory, and the six dashboard-page edits
