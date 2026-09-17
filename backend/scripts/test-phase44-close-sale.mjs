/**
 * Phase 4.4 — Payment Capture Modal / Vanishing Rule / Counter
 * Run: node scripts/test-phase44-close-sale.mjs
 *
 * Covers API vanishing + counter; static-scans CloseSaleModal for PCI-safe fields.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import env from '../src/config/env.config.js';
import Lead from '../src/models/lead.model.js';

const BASE = process.env.API_BASE || 'http://localhost:5000/api/v1';
const SUPER = {
  email: 'admin@flashdigital.com',
  password: 'FlashAdmin_Dev_2026!',
};
const PASS = 'Phase44UiTest123!';
const stamp = Date.now();
const results = [];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLOSE_MODAL_PATH = path.resolve(
  __dirname,
  '../../frontend/src/components/leads/CloseSaleModal.jsx'
);

async function req(method, urlPath, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

function pass(id, name, detail) {
  results.push({ id, name, ok: true, detail });
  console.log(`✅ TC${id} PASS — ${name}${detail ? `: ${detail}` : ''}`);
}

function fail(id, name, detail) {
  results.push({ id, name, ok: false, detail });
  console.log(`❌ TC${id} FAIL — ${name}: ${detail}`);
}

async function login(email, password) {
  const { status, data } = await req('POST', '/auth/login', {
    body: { email, password },
  });
  if (status !== 200 || !data?.data?.token) {
    throw new Error(
      `Login failed for ${email}: ${status} ${JSON.stringify(data)}`
    );
  }
  return { token: data.data.token, user: data.data.user };
}

async function findUserByEmail(superToken, email) {
  const pending = await req('GET', '/admin/users/pending', {
    token: superToken,
  });
  let user = pending.data?.data?.users?.find((u) => u.email === email);
  if (user) return user;
  const users = await req('GET', '/admin/users', { token: superToken });
  return users.data?.data?.users?.find((u) => u.email === email) || null;
}

async function ensureUser(superToken, label, role, phoneSuffix) {
  const email = `p44.${label}.${stamp}@example.com`.toLowerCase();
  const reg = await req('POST', '/auth/register', {
    body: {
      fullName: `Phase44 ${label}`,
      email,
      phone: `+1555${String(stamp).slice(-6)}${phoneSuffix}`,
      password: PASS,
    },
  });
  if (![201, 409].includes(reg.status)) {
    throw new Error(
      `Register ${label} failed: ${reg.status} ${JSON.stringify(reg.data)}`
    );
  }
  const user = await findUserByEmail(superToken, email);
  if (!user) throw new Error(`Could not find user ${email}`);
  if (user.status === 'pending') {
    const approve = await req('PATCH', `/admin/users/${user._id}/approve`, {
      token: superToken,
      body: { role },
    });
    if (approve.status !== 200) {
      throw new Error(
        `Approve ${label} failed: ${approve.status} ${JSON.stringify(approve.data)}`
      );
    }
  }
  const session = await login(email, PASS);
  return { ...session, email, userId: session.user._id };
}

async function createLead(token, body) {
  const res = await req('POST', '/leads', { token, body });
  if (res.status !== 201) {
    throw new Error(`create lead failed: ${res.status} ${JSON.stringify(res.data)}`);
  }
  return res.data.data.lead;
}

function inMine(leads, id) {
  return (leads || []).some((l) => l._id === id);
}

function hasClosedSale(leads) {
  return (leads || []).some((l) => l.stage === 'closed_sale');
}

/** Static PCI / toast / vanish wiring checks on CloseSaleModal source */
function scanCloseSaleModal() {
  const src = fs.readFileSync(CLOSE_MODAL_PATH, 'utf8');
  const findings = {
    toast: src.includes('+1 Closed Sale'),
    vanishMine: src.includes("['myLeads']") && src.includes('setQueryData'),
    vanishAssigned: src.includes("['assignedLeads']"),
    counterBump: src.includes("['myClosedCount']"),
    hasLast4: /Last 4 digits|cardLast4|maxLength=\{4\}/.test(src),
    hasToken: /cardReferenceToken|Card reference token/.test(src),
    hasBrandSelect: /Card brand|CARD_BRANDS/.test(src),
    hasViaLink: /via_link/.test(src),
    hasViaCard: /via_card/.test(src),
    // Dangerous: full PAN / CVV *input fields* (helper text may mention CVV — that is OK)
    hasPanInput: (() => {
      const inputTags = src.match(/<input\b[^>]*>/gi) || [];
      return inputTags.some((tag) =>
        /card.?number|cc-number|name=["']pan["']|autocomplete=["']cc-number["']/i.test(
          tag
        )
      );
    })(),
    hasCvvInput: (() => {
      const inputTags = src.match(/<input\b[^>]*>/gi) || [];
      return inputTags.some((tag) =>
        /name=["']cvv["']|name=["']cvc["']|autocomplete=["']cc-csc["']|cvv|cvc/i.test(
          tag
        )
      );
    })(),
    // maxLength must not allow full PAN (>4) on last4 field — last4 is maxLength 4
    last4MaxOk: /maxLength=\{4\}/.test(src),
    // Confirm no 13–19 digit card-number collection pattern in controlled inputs
    noFullPanPlaceholder: !/<input[^>]*placeholder=["']\d{13,19}/i.test(src),
  };
  return findings;
}

async function main() {
  console.log(`Base: ${BASE}\n`);

  const health = await req('GET', '/health');
  if (health.status !== 200) {
    throw new Error(`API not healthy: ${health.status}`);
  }

  await mongoose.connect(env.MONGO_URI);

  const superAdmin = await login(SUPER.email, SUPER.password);
  const agent = await ensureUser(superAdmin.token, 'agent', 'sales_agent', '1');

  const ui = scanCloseSaleModal();

  // —— TC1 Close via link ——
  const linkLead = await createLead(agent.token, {
    businessName: 'P44 Link Close',
    phone: '+15554440001',
  });
  const beforeMine1 = await req('GET', '/leads/mine', { token: agent.token });
  const wasInMine = inMine(beforeMine1.data?.data?.leads, linkLead._id);

  const closeLink = await req('PATCH', `/leads/${linkLead._id}/close`, {
    token: agent.token,
    body: {
      payment: {
        method: 'via_link',
        linkUrl: 'https://pay.example.com/p44-link',
      },
    },
  });
  const payload = closeLink.data?.data;
  const afterMine1 = await req('GET', '/leads/mine', { token: agent.token });
  const gone1 = !inMine(afterMine1.data?.data?.leads, linkLead._id);
  const noClosed1 = !hasClosedSale(afterMine1.data?.data?.leads);
  const privacyPayload =
    payload &&
    typeof payload.closedCount === 'number' &&
    !payload.lead &&
    !payload.payment;

  if (
    wasInMine &&
    closeLink.status === 200 &&
    gone1 &&
    noClosed1 &&
    privacyPayload &&
    ui.toast &&
    ui.vanishMine &&
    ui.hasViaLink
  ) {
    pass(
      1,
      'Close via link',
      '200 + closedCount-only body; vanished from /mine; CloseSaleModal toast + setQueryData wired'
    );
  } else {
    fail(
      1,
      'Close via link',
      `status=${closeLink.status} wasInMine=${wasInMine} gone=${gone1} privacy=${privacyPayload} toast=${ui.toast} vanish=${ui.vanishMine} body=${JSON.stringify(payload)}`
    );
  }

  // —— TC2 Close via card (PCI-safe DOM/source) ——
  const cardLead = await createLead(agent.token, {
    businessName: 'P44 Card Close',
    phone: '+15554440002',
  });
  const closeCard = await req('PATCH', `/leads/${cardLead._id}/close`, {
    token: agent.token,
    body: {
      payment: {
        method: 'via_card',
        cardLast4: '4242',
        cardReferenceToken: 'tok_p44_opaque_only',
        cardBrand: 'visa',
      },
    },
  });
  const cardDoc = await Lead.findById(cardLead._id).lean();
  const afterMine2 = await req('GET', '/leads/mine', { token: agent.token });
  const gone2 = !inMine(afterMine2.data?.data?.leads, cardLead._id);
  const pciDbOk =
    cardDoc?.payment?.cardLast4 === '4242' &&
    cardDoc?.payment?.cardReferenceToken === 'tok_p44_opaque_only' &&
    !cardDoc?.payment?.cardNumber &&
    !JSON.stringify(cardDoc?.payment || {}).includes('411111111111');

  const pciUiOk =
    ui.hasLast4 &&
    ui.hasToken &&
    ui.hasBrandSelect &&
    ui.last4MaxOk &&
    ui.noFullPanPlaceholder &&
    !ui.hasPanInput &&
    !ui.hasCvvInput;

  if (
    closeCard.status === 200 &&
    gone2 &&
    pciDbOk &&
    pciUiOk &&
    ui.toast &&
    ui.vanishMine
  ) {
    pass(
      2,
      'Close via card',
      'vanished from /mine; DB last4+token only; CloseSaleModal has no full card-number/CVV input (maxLength=4 last4 + token)'
    );
  } else {
    fail(
      2,
      'Close via card',
      `status=${closeCard.status} gone=${gone2} pciDb=${pciDbOk} pciUi=${pciUiOk} panInput=${ui.hasPanInput} cvv=${ui.hasCvvInput}`
    );
  }

  // —— TC3 Counter increments live ——
  const beforeCount = await req('GET', '/stats/my-closed-count', {
    token: agent.token,
  });
  const countBefore = beforeCount.data?.data?.count;

  const counterLead = await createLead(agent.token, {
    businessName: 'P44 Counter',
    phone: '+15554440003',
  });
  const closeForCount = await req('PATCH', `/leads/${counterLead._id}/close`, {
    token: agent.token,
    body: {
      payment: {
        method: 'via_link',
        linkUrl: 'https://pay.example.com/p44-counter',
      },
    },
  });
  const afterCount = await req('GET', '/stats/my-closed-count', {
    token: agent.token,
  });
  const countAfter = afterCount.data?.data?.count;

  if (
    beforeCount.status === 200 &&
    afterCount.status === 200 &&
    closeForCount.status === 200 &&
    typeof countBefore === 'number' &&
    countAfter === countBefore + 1 &&
    ui.counterBump
  ) {
    pass(
      3,
      'Counter increments live',
      `${countBefore} → ${countAfter}; CloseSaleModal invalidates/bumps myClosedCount (no full page reload needed)`
    );
  } else {
    fail(
      3,
      'Counter increments live',
      `before=${countBefore} after=${countAfter} close=${closeForCount.status} bumpWired=${ui.counterBump}`
    );
  }

  // —— TC4 No re-fetch leak ——
  const leakLead = await createLead(agent.token, {
    businessName: 'P44 Leak Probe',
    phone: '+15554440004',
  });
  await req('PATCH', `/leads/${leakLead._id}/close`, {
    token: agent.token,
    body: {
      payment: {
        method: 'via_link',
        linkUrl: 'https://pay.example.com/p44-leak',
      },
    },
  });

  // Simulate manual re-trigger of mine query (devtools refetch)
  const refetch1 = await req('GET', '/leads/mine', { token: agent.token });
  const refetch2 = await req('GET', '/leads/mine', { token: agent.token });
  const stillGone =
    !inMine(refetch1.data?.data?.leads, leakLead._id) &&
    !inMine(refetch2.data?.data?.leads, leakLead._id);
  const stillNoClosed =
    !hasClosedSale(refetch1.data?.data?.leads) &&
    !hasClosedSale(refetch2.data?.data?.leads);

  // Also ensure earlier closed ids stay gone
  const earlierGone =
    !inMine(refetch2.data?.data?.leads, linkLead._id) &&
    !inMine(refetch2.data?.data?.leads, cardLead._id) &&
    !inMine(refetch2.data?.data?.leads, counterLead._id);

  if (
    refetch1.status === 200 &&
    refetch2.status === 200 &&
    stillGone &&
    stillNoClosed &&
    earlierGone
  ) {
    pass(
      4,
      'No re-fetch leak',
      `double GET /leads/mine → ${refetch2.data?.data?.leads?.length ?? 0} rows; closed ids stay absent (backend stage=active filter)`
    );
  } else {
    fail(
      4,
      'No re-fetch leak',
      `stillGone=${stillGone} noClosed=${stillNoClosed} earlierGone=${earlierGone}`
    );
  }

  await mongoose.disconnect();

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n—— Summary: ${results.length - failed.length}/${results.length} passed ——`
  );
  if (failed.length) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
