/**
 * Phase 4.5 — CST Handover Queue UI wiring
 * Run: node scripts/test-phase45-handover-queue.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import env from '../src/config/env.config.js';

const BASE = process.env.API_BASE || 'http://localhost:5000/api/v1';
const SUPER = {
  email: 'admin@flashdigital.com',
  password: 'FlashAdmin_Dev_2026!',
};
const PASS = 'Phase45UiTest123!';
const stamp = Date.now();
const results = [];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_PAGE = path.resolve(
  __dirname,
  '../../frontend/src/pages/cst-manager/HandoverQueuePage.jsx'
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
  const email = `p45.${label}.${stamp}@example.com`.toLowerCase();
  const reg = await req('POST', '/auth/register', {
    body: {
      fullName: `Phase45 ${label}`,
      email,
      phone: `+1666${String(stamp).slice(-6)}${phoneSuffix}`,
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

/** Mirror of HandoverQueuePage paymentSummary — must never include token/PAN */
function paymentSummary(payment) {
  if (!payment?.method) return '—';
  if (payment.method === 'via_link') {
    return payment.linkUrl ? `Link · ${payment.linkUrl}` : 'Via link';
  }
  if (payment.method === 'via_card') {
    const brand = payment.cardBrand || 'Card';
    const last4 = payment.cardLast4 ? `•••• ${payment.cardLast4}` : '••••';
    return `${brand} · ${last4}`;
  }
  return payment.method;
}

function scanQueuePage() {
  const src = fs.readFileSync(QUEUE_PAGE, 'utf8');
  return {
    externalBlank: /target="_blank"/.test(src) && /rel="noreferrer"/.test(src),
    yelpLink: /yelpLink/.test(src) && /label="Yelp"/.test(src),
    websiteLink: /websiteLink/.test(src) && /label="Website"/.test(src),
    gmbLink: /gmbLink/.test(src) && /label="GMB"/.test(src),
    paymentSummaryFn: /function paymentSummary/.test(src),
    neverRendersToken:
      !/payment\.cardReferenceToken/.test(src) &&
      !/\{[^}]*cardReferenceToken/.test(src),
    invalidatesOnAssign: /invalidateQueries\(\{\s*queryKey:\s*\['handoverQueue'\]/.test(
      src
    ),
    pendingFilter: /pending_review/.test(src),
  };
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
  const cst = await ensureUser(superAdmin.token, 'cst', 'cst_manager', '2');
  const tech = await ensureUser(superAdmin.token, 'tech', 'tech_team', '3');

  const ui = scanQueuePage();

  const yelp = 'https://yelp.com/biz/p45-queue-test';
  const website = 'https://p45-queue.example.com';
  const gmb = 'https://maps.google.com/?cid=p45queue';

  // —— TC1 Queue populates ——
  const create = await req('POST', '/leads', {
    token: agent.token,
    body: {
      businessName: 'P45 Queue Biz',
      phone: '+15554550001',
      yelpLink: yelp,
      websiteLink: website,
      gmbLink: gmb,
    },
  });
  const leadId = create.data?.data?.lead?._id;

  const close = await req('PATCH', `/leads/${leadId}/close`, {
    token: agent.token,
    body: {
      payment: {
        method: 'via_link',
        linkUrl: 'https://pay.example.com/p45-queue',
      },
    },
  });

  // Simulate one refetch cycle (HandoverQueuePage refetchInterval / invalidate)
  const queue1 = await req('GET', '/handover/queue', { token: cst.token });
  const inQueue = (queue1.data?.data?.leads || []).find((l) => l._id === leadId);
  const pendingOk =
    Boolean(inQueue) && inQueue.handover?.cstStatus === 'pending_review';

  if (close.status === 200 && queue1.status === 200 && pendingOk) {
    pass(
      1,
      'Queue populates',
      'closed sale appears in GET /handover/queue as pending_review on next fetch'
    );
  } else {
    fail(
      1,
      'Queue populates',
      `close=${close.status} queue=${queue1.status} found=${Boolean(inQueue)} status=${inQueue?.handover?.cstStatus}`
    );
  }

  // —— TC3 Links open correctly (API URLs + UI target=_blank wiring) ——
  // Run before assign while lead still in queue
  const linksMatch =
    inQueue?.yelpLink === yelp &&
    inQueue?.websiteLink === website &&
    inQueue?.gmbLink === gmb;
  const linksUiOk =
    ui.externalBlank && ui.yelpLink && ui.websiteLink && ui.gmbLink;

  if (linksMatch && linksUiOk) {
    pass(
      3,
      'Links open correctly',
      'queue returns exact Yelp/Website/GMB URLs; ExternalLink uses target=_blank rel=noreferrer'
    );
  } else {
    fail(
      3,
      'Links open correctly',
      `urlsMatch=${linksMatch} ui=${JSON.stringify({
        blank: ui.externalBlank,
        yelp: ui.yelpLink,
        web: ui.websiteLink,
        gmb: ui.gmbLink,
      })}`
    );
  }

  // —— TC2 Assign flow ——
  const techList = await req('GET', '/handover/tech-list', { token: cst.token });
  const techOk = (techList.data?.data?.techs || []).some(
    (t) => t._id === tech.userId
  );
  const assign = await req('PATCH', `/handover/${leadId}/assign`, {
    token: cst.token,
    body: { techId: tech.userId },
  });
  const queue2 = await req('GET', '/handover/queue', { token: cst.token });
  const stillInPending = (queue2.data?.data?.leads || []).some(
    (l) =>
      l._id === leadId && l.handover?.cstStatus === 'pending_review'
  );
  const assignedStatus =
    assign.data?.data?.lead?.handover?.cstStatus === 'assigned';

  if (
    techList.status === 200 &&
    techOk &&
    assign.status === 200 &&
    assignedStatus &&
    !stillInPending &&
    ui.invalidatesOnAssign &&
    ui.pendingFilter
  ) {
    pass(
      2,
      'Assign flow',
      'PATCH assign → cstStatus=assigned; absent from pending_review queue; UI invalidates handoverQueue'
    );
  } else {
    fail(
      2,
      'Assign flow',
      `techList=${techList.status} techOk=${techOk} assign=${assign.status} assigned=${assignedStatus} stillPending=${stillInPending}`
    );
  }

  // —— TC4 Card data not exposed ——
  const cardCreate = await req('POST', '/leads', {
    token: agent.token,
    body: {
      businessName: 'P45 Card Queue',
      phone: '+15554550002',
      yelpLink: yelp,
    },
  });
  const cardLeadId = cardCreate.data?.data?.lead?._id;
  const secretToken = 'tok_p45_must_never_render_in_ui';
  await req('PATCH', `/leads/${cardLeadId}/close`, {
    token: agent.token,
    body: {
      payment: {
        method: 'via_card',
        cardLast4: '9999',
        cardBrand: 'mastercard',
        cardReferenceToken: secretToken,
      },
    },
  });

  const queueCard = await req('GET', '/handover/queue', { token: cst.token });
  const cardRow = (queueCard.data?.data?.leads || []).find(
    (l) => l._id === cardLeadId
  );
  const summary = paymentSummary(cardRow?.payment);
  const summarySafe =
    summary.includes('mastercard') &&
    summary.includes('9999') &&
    !summary.includes(secretToken) &&
    !summary.includes('4111111111111111') &&
    !/\d{13,19}/.test(summary);

  // API may still carry token for CST ops — UI must not render it
  const uiNeverToken = ui.neverRendersToken && ui.paymentSummaryFn;

  if (cardRow && summarySafe && uiNeverToken) {
    pass(
      4,
      'Card data not exposed',
      `paymentSummary → "${summary}"; page never references cardReferenceToken`
    );
  } else {
    fail(
      4,
      'Card data not exposed',
      `row=${Boolean(cardRow)} summary=${summary} uiNeverToken=${uiNeverToken}`
    );
  }

  // cleanup: assign card row so queue stays tidy (optional)
  await req('PATCH', `/handover/${cardLeadId}/assign`, {
    token: cst.token,
    body: { techId: tech.userId },
  });

  await mongoose.disconnect();

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n—— Summary: ${results.length - failed.length}/${results.length} passed ——`
  );
  // Keep TC order in output: we ran 1,3,2,4 — sort for summary clarity
  results.sort((a, b) => a.id - b.id);
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
