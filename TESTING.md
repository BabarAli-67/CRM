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

## Phase 3.3 — Close Sale + Stats

- [x] Close via link → 200, `stage: closed_sale`
- [x] Close via card → 200; DB has last4 + token only (no raw PAN/CVV)
- [x] Validation — `via_card` without `cardReferenceToken` → 422
- [x] Vanishing confirmed — closed lead absent from `/mine` immediately after close
- [x] Counter increments — `GET /api/v1/stats/my-closed-count` returns `{ count }` only
- [x] Unauthorized close — `tech_team` → 403
