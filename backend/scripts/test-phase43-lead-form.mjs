/**
 * Phase 4.3 — Lead Form & Data Inheritance (API + wiring checks)
 * Run: node scripts/test-phase43-lead-form.mjs
 */
import mongoose from 'mongoose';
import env from '../src/config/env.config.js';
import Lead from '../src/models/lead.model.js';

const BASE = process.env.API_BASE || 'http://localhost:5000/api/v1';
const SUPER = {
  email: 'admin@flashdigital.com',
  password: 'FlashAdmin_Dev_2026!',
};
const PASS = 'Phase43UiTest123!';
const stamp = Date.now();
const results = [];

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
  const email = `p43.${label}.${stamp}@example.com`.toLowerCase();
  const reg = await req('POST', '/auth/register', {
    body: {
      fullName: `Phase43 ${label}`,
      email,
      phone: `+1444${String(stamp).slice(-6)}${phoneSuffix}`,
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

async function main() {
  console.log(`Base: ${BASE}\n`);

  const health = await req('GET', '/health');
  if (health.status !== 200) {
    throw new Error(`API not healthy: ${health.status}`);
  }

  await mongoose.connect(env.MONGO_URI);

  const superAdmin = await login(SUPER.email, SUPER.password);
  const agent = await ensureUser(superAdmin.token, 'agent', 'sales_agent', '1');
  const closerX = await ensureUser(superAdmin.token, 'closerX', 'closer', '2');
  const closerY = await ensureUser(superAdmin.token, 'closerY', 'closer', '3');
  const tech = await ensureUser(superAdmin.token, 'tech', 'tech_team', '4');

  // —— TC1 Field inheritance (promote → lead payload for LeadForm) ——
  const cbBody = {
    businessName: 'Inherit Biz',
    phone: '+15554330001',
    businessLink: 'https://inherit.example.com',
    callbackAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    notes: 'Promote notes carry over',
  };
  const createdCb = await req('POST', '/callbacks', {
    token: agent.token,
    body: cbBody,
  });
  const callbackId = createdCb.data?.data?.callback?._id;
  const promoted = await req('POST', `/callbacks/${callbackId}/promote`, {
    token: agent.token,
  });
  const inherited = promoted.data?.data?.lead;
  const byId = await req('GET', `/leads/${inherited?._id}`, {
    token: agent.token,
  });
  const leadDoc = byId.data?.data?.lead || inherited;

  const inheritOk =
    promoted.status === 201 &&
    leadDoc?.businessName === cbBody.businessName &&
    leadDoc?.phone === cbBody.phone &&
    leadDoc?.websiteLink === cbBody.businessLink &&
    leadDoc?.notes === cbBody.notes &&
    byId.status === 200;

  if (inheritOk) {
    pass(
      1,
      'Field inheritance',
      'businessName/phone/websiteLink←businessLink/notes pre-filled via promote + GET /leads/:id'
    );
  } else {
    fail(
      1,
      'Field inheritance',
      `promote=${promoted.status} get=${byId.status} lead=${JSON.stringify(leadDoc)?.slice(0, 300)}`
    );
  }

  // —— TC2 Closer dropdown (GET /users?role=closer) ——
  const usersCloser = await req('GET', '/users?role=closer&status=approved', {
    token: agent.token,
  });
  const closers = usersCloser.data?.data?.users || [];
  const allCloserRole =
    usersCloser.status === 200 &&
    closers.length > 0 &&
    closers.every((u) => u.role === 'closer');
  const includesX = closers.some((u) => u._id === closerX.userId || u.email === closerX.email);
  const includesTech = closers.some((u) => u._id === tech.userId || u.email === tech.email);
  const includesAgent = closers.some((u) => u._id === agent.userId || u.email === agent.email);

  if (allCloserRole && includesX && !includesTech && !includesAgent) {
    pass(
      2,
      'Closer dropdown',
      `${closers.length} approved closers only (includes Closer X; excludes agent/tech)`
    );
  } else {
    fail(
      2,
      'Closer dropdown',
      `status=${usersCloser.status} count=${closers.length} allCloser=${allCloserRole} hasX=${includesX} hasTech=${includesTech} hasAgent=${includesAgent}`
    );
  }

  // —— TC3 Follow-up alert wiring (agent + Closer X) ——
  const followLeadCreate = await req('POST', '/leads', {
    token: agent.token,
    body: {
      businessName: 'Follow Up Shared',
      phone: '+15554330002',
      closerId: closerX.userId,
      notes: 'assigned to closer X',
    },
  });
  const followLeadId = followLeadCreate.data?.data?.lead?._id;
  const followAt = new Date(Date.now() + 5.5 * 60 * 1000).toISOString();
  const setFu = await req('PATCH', `/leads/${followLeadId}/follow-up`, {
    token: agent.token,
    body: { callbackAt: followAt, notes: '5.5 min out' },
  });

  const agentMine = await req('GET', '/leads/mine', { token: agent.token });
  const closerAssigned = await req('GET', '/leads/assigned-to-me', {
    token: closerX.token,
  });
  const inAgentList = (agentMine.data?.data?.leads || []).some(
    (l) => l._id === followLeadId && l.followUp?.callbackAt
  );
  const inCloserList = (closerAssigned.data?.data?.leads || []).some(
    (l) => l._id === followLeadId && l.followUp?.callbackAt
  );

  // Both roles can mark follow-up alerts (shared chime path)
  const markAgent = await req(
    'PATCH',
    `/leads/${followLeadId}/follow-up/mark-alert`,
    { token: agent.token, body: { fiveMinFired: true } }
  );
  const markCloser = await req(
    'PATCH',
    `/leads/${followLeadId}/follow-up/mark-alert`,
    { token: closerX.token, body: { exactTimeFired: true } }
  );
  const afterMark = await Lead.findById(followLeadId).lean();
  const flagsOk =
    afterMark?.followUp?.alerts?.fiveMinFired === true &&
    afterMark?.followUp?.alerts?.exactTimeFired === true;

  // notify list semantics used by frontend buildLeadFollowUpReminders
  const notifyWouldIncludeBoth =
    [String(agent.userId), String(closerX.userId)].every((id) =>
      [String(afterMark?.agentId), String(afterMark?.closerId)].includes(id)
    );

  if (
    setFu.status === 200 &&
    inAgentList &&
    inCloserList &&
    markAgent.status === 200 &&
    markCloser.status === 200 &&
    flagsOk &&
    notifyWouldIncludeBoth
  ) {
    pass(
      3,
      'Follow-up alert wiring',
      `follow-up @ ${followAt}; visible on /mine + /assigned-to-me; both mark-alert OK; agentId+closerId notify set`
    );
  } else {
    fail(
      3,
      'Follow-up alert wiring',
      `setFu=${setFu.status} agentList=${inAgentList} closerList=${inCloserList} markA=${markAgent.status} markC=${markCloser.status} flags=${flagsOk} notify=${notifyWouldIncludeBoth}`
    );
  }

  // —— TC4 Closer can close (payment capture) ——
  const closeLeadCreate = await req('POST', '/leads', {
    token: agent.token,
    body: {
      businessName: 'Closer Close Co',
      phone: '+15554330003',
      closerId: closerX.userId,
      salesAmount: 1500,
    },
  });
  const closeLeadId = closeLeadCreate.data?.data?.lead?._id;
  const closerClose = await req('PATCH', `/leads/${closeLeadId}/close`, {
    token: closerX.token,
    body: {
      payment: {
        method: 'via_link',
        linkUrl: 'https://pay.example.com/p43-closer',
      },
    },
  });
  const closedDoc = await Lead.findById(closeLeadId).lean();
  const closerCloseOk =
    closerClose.status === 200 &&
    closedDoc?.stage === 'closed_sale' &&
    closedDoc?.payment?.method === 'via_link' &&
    String(closedDoc?.closedBy) === String(closerX.userId);

  if (closerCloseOk) {
    pass(
      4,
      'Closer can close',
      'assigned closer PATCH /close via_link → closed_sale + payment stored'
    );
  } else {
    fail(
      4,
      'Closer can close',
      `status=${closerClose.status} stage=${closedDoc?.stage} body=${JSON.stringify(closerClose.data)?.slice(0, 250)}`
    );
  }

  // —— TC5 Disqualify ——
  const dqCreate = await req('POST', '/leads', {
    token: agent.token,
    body: {
      businessName: 'Disqualify Me',
      phone: '+15554330004',
      closerId: closerX.userId,
    },
  });
  const dqId = dqCreate.data?.data?.lead?._id;
  const reason = 'Not a fit — budget too low';
  const dq = await req('PATCH', `/leads/${dqId}/disqualify`, {
    token: agent.token,
    body: { disqualifiedReason: reason },
  });
  const dqDoc = await Lead.findById(dqId).lean();
  const mineAfterDq = await req('GET', '/leads/mine', { token: agent.token });
  const assignedAfterDq = await req('GET', '/leads/assigned-to-me', {
    token: closerX.token,
  });
  const goneFromMine = !(mineAfterDq.data?.data?.leads || []).some(
    (l) => l._id === dqId
  );
  const goneFromAssigned = !(assignedAfterDq.data?.data?.leads || []).some(
    (l) => l._id === dqId
  );

  if (
    dq.status === 200 &&
    dqDoc?.stage === 'disqualified' &&
    dqDoc?.disqualifiedReason === reason &&
    goneFromMine &&
    goneFromAssigned
  ) {
    pass(
      5,
      'Disqualify',
      'reason stored; absent from /mine and /assigned-to-me'
    );
  } else {
    fail(
      5,
      'Disqualify',
      `status=${dq.status} stage=${dqDoc?.stage} reason=${dqDoc?.disqualifiedReason} goneMine=${goneFromMine} goneAssigned=${goneFromAssigned}`
    );
  }

  // —— TC6 No closed leads leak on MyLeads (/mine) ——
  const leakCreate = await req('POST', '/leads', {
    token: agent.token,
    body: {
      businessName: 'Leak Probe',
      phone: '+15554330005',
    },
  });
  const leakId = leakCreate.data?.data?.lead?._id;
  await req('PATCH', `/leads/${leakId}/close`, {
    token: agent.token,
    body: {
      payment: {
        method: 'via_card',
        cardLast4: '4242',
        cardReferenceToken: 'tok_p43_opaque',
        cardBrand: 'visa',
      },
    },
  });

  const mineLeak = await req('GET', '/leads/mine', { token: agent.token });
  const mineLeads = mineLeak.data?.data?.leads || [];
  const anyClosedSale = mineLeads.some((l) => l.stage === 'closed_sale');
  const leakStillThere = mineLeads.some((l) => l._id === leakId);
  // Also confirm the previously closed closer lead is absent
  const closedCloserStillThere = mineLeads.some((l) => l._id === closeLeadId);

  if (
    mineLeak.status === 200 &&
    !anyClosedSale &&
    !leakStillThere &&
    !closedCloserStillThere
  ) {
    pass(
      6,
      'No closed leads leak',
      `GET /leads/mine → ${mineLeads.length} rows; zero stage=closed_sale`
    );
  } else {
    fail(
      6,
      'No closed leads leak',
      `anyClosed=${anyClosedSale} leakPresent=${leakStillThere} closerClosedPresent=${closedCloserStillThere} count=${mineLeads.length}`
    );
  }

  // Soft check: unfiltered admin list may still see closed (expected elsewhere)
  const adminAll = await req('GET', '/leads', { token: superAdmin.token });
  const adminSeesClosed = (adminAll.data?.data?.leads || []).some(
    (l) => l._id === leakId && l.stage === 'closed_sale'
  );
  if (adminSeesClosed) {
    console.log(
      '   (info) Admin GET /leads still returns closed_sale — expected; not on MyLeadsPage'
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
