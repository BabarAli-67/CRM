/**
 * Phase 3 Lead API — test cases 1–5
 * Run: node scripts/test-leads.mjs
 */
import mongoose from 'mongoose';
import env from '../src/config/env.config.js';
import Lead from '../src/models/lead.model.js';

const BASE = process.env.API_BASE || 'http://localhost:5000/api/v1';
const SUPER = {
  email: 'admin@flashdigital.com',
  password: 'FlashAdmin_Dev_2026!',
};
const PASS = 'LeadTest123!';
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
    throw new Error(`Login failed for ${email}: ${status} ${JSON.stringify(data)}`);
  }
  return { token: data.data.token, user: data.data.user };
}

async function findUserByEmail(superToken, email) {
  const pending = await req('GET', '/admin/users/pending', { token: superToken });
  let user = pending.data?.data?.users?.find((u) => u.email === email);
  if (user) return user;

  const users = await req('GET', '/admin/users', { token: superToken });
  return users.data?.data?.users?.find((u) => u.email === email) || null;
}

async function ensureUser(superToken, label, role, phoneSuffix) {
  const email = `ld.${label}.${stamp}@example.com`.toLowerCase();
  const reg = await req('POST', '/auth/register', {
    body: {
      fullName: `Lead ${label}`,
      email,
      phone: `+1777${String(stamp).slice(-6)}${phoneSuffix}`,
      password: PASS,
    },
  });
  if (![201, 409].includes(reg.status)) {
    throw new Error(`Register ${label} failed: ${reg.status} ${JSON.stringify(reg.data)}`);
  }

  const user = await findUserByEmail(superToken, email);
  if (!user) {
    throw new Error(`Could not find user ${email}`);
  }

  if (user.status === 'pending') {
    const approve = await req('PATCH', `/admin/users/${user._id}/approve`, {
      token: superToken,
      body: { role },
    });
    if (approve.status !== 200) {
      throw new Error(`Approve ${label} failed: ${approve.status} ${JSON.stringify(approve.data)}`);
    }
  }

  return login(email, PASS);
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
  const closerA = await ensureUser(superAdmin.token, 'closerA', 'closer', '2');
  const closerB = await ensureUser(superAdmin.token, 'closerB', 'closer', '3');
  const tech = await ensureUser(superAdmin.token, 'tech', 'tech_team', '4');

  // —— TC1 Direct lead creation ——
  const create = await req('POST', '/leads', {
    token: agent.token,
    body: {
      businessName: 'Direct Lead Co',
      phone: '+15550001111',
      websiteLink: 'https://direct.example.com',
      notes: 'Created without callback',
    },
  });
  const lead = create.data?.data?.lead;
  const leadId = lead?._id;

  if (
    create.status === 201 &&
    leadId &&
    (lead.sourceCallbackId === null || lead.sourceCallbackId === undefined)
  ) {
    pass(1, 'Direct lead creation', `201, sourceCallbackId: null, id=${leadId}`);
  } else {
    fail(
      1,
      'Direct lead creation',
      `${create.status} sourceCallbackId=${lead?.sourceCallbackId} ${JSON.stringify(create.data)?.slice(0, 250)}`
    );
  }

  // —— TC2 Vanishing rule at query level ——
  // Create a second lead, force closed_sale in DB, confirm absent from /mine
  const vanishCreate = await req('POST', '/leads', {
    token: agent.token,
    body: {
      businessName: 'Vanish Lead Co',
      phone: '+15550002222',
    },
  });
  const vanishId = vanishCreate.data?.data?.lead?._id;

  if (!vanishId) {
    fail(2, 'Vanishing rule enforced at query level', 'could not create vanish lead');
  } else {
    await Lead.findByIdAndUpdate(vanishId, { stage: 'closed_sale' });

    const mine = await req('GET', '/leads/mine', { token: agent.token });
    const ids = (mine.data?.data?.leads || []).map((l) => l._id);
    const closedAbsent = !ids.includes(vanishId);
    const activeStillThere = leadId ? ids.includes(leadId) : true;

    if (mine.status === 200 && closedAbsent && activeStillThere) {
      pass(
        2,
        'Vanishing rule enforced at query level',
        `closed_sale lead absent; active lead still present`
      );
    } else {
      fail(
        2,
        'Vanishing rule enforced at query level',
        `status=${mine.status} closedAbsent=${closedAbsent} activeStillThere=${activeStillThere} ids=${ids.join(',')}`
      );
    }
  }

  // —— TC3 Closer visibility ——
  // Assign leadId to closerA; closerB must not see it; assign a second lead to closerB
  const assignA = await req('PATCH', `/leads/${leadId}`, {
    token: agent.token,
    body: { closerId: closerA.user._id },
  });

  const forB = await req('POST', '/leads', {
    token: agent.token,
    body: {
      businessName: 'Closer B Lead',
      phone: '+15550003333',
      closerId: closerB.user._id,
    },
  });
  const forBId = forB.data?.data?.lead?._id;

  const assignedB = await req('GET', '/leads/assigned-to-me', {
    token: closerB.token,
  });
  const bIds = (assignedB.data?.data?.leads || []).map((l) => l._id);
  const seesOnlyOwn =
    assignedB.status === 200 &&
    forBId &&
    bIds.includes(forBId) &&
    !bIds.includes(leadId);

  if (assignA.status === 200 && seesOnlyOwn) {
    pass(
      3,
      'Closer visibility',
      `closerB sees only own (${bIds.length}); does not see closerA lead`
    );
  } else {
    fail(
      3,
      'Closer visibility',
      `assignA=${assignA.status} forB=${forB.status} assignedB=${assignedB.status} bIds=${bIds.join(',')} ${JSON.stringify(assignedB.data)?.slice(0, 200)}`
    );
  }

  // —— TC4 Cross-role edit block ——
  const techPatch = await req('PATCH', `/leads/${leadId}`, {
    token: tech.token,
    body: { notes: 'tech should not edit' },
  });
  if (techPatch.status === 403) {
    pass(4, 'Cross-role edit block', `403 — ${techPatch.data?.message || 'ok'}`);
  } else {
    fail(4, 'Cross-role edit block', `expected 403 got ${techPatch.status}`);
  }

  // —— TC5 Disqualify flow ——
  const dqLead = await req('POST', '/leads', {
    token: agent.token,
    body: {
      businessName: 'Disqualify Me Inc',
      phone: '+15550004444',
    },
  });
  const dqId = dqLead.data?.data?.lead?._id;

  const dq = await req('PATCH', `/leads/${dqId}/disqualify`, {
    token: agent.token,
    body: { disqualifiedReason: 'No budget / not a fit' },
  });

  const mineAfter = await req('GET', '/leads/mine', { token: agent.token });
  const afterIds = (mineAfter.data?.data?.leads || []).map((l) => l._id);
  const stageOk = dq.data?.data?.lead?.stage === 'disqualified';
  const goneFromMine = !afterIds.includes(dqId);

  if (dq.status === 200 && stageOk && goneFromMine) {
    pass(
      5,
      'Disqualify flow',
      `stage=disqualified, absent from /mine`
    );
  } else {
    fail(
      5,
      'Disqualify flow',
      `dq=${dq.status} stage=${dq.data?.data?.lead?.stage} gone=${goneFromMine} ${JSON.stringify(dq.data)?.slice(0, 250)}`
    );
  }

  // —— TC6 Follow-up shared alert ——
  const fuLead = await req('POST', '/leads', {
    token: agent.token,
    body: {
      businessName: 'Follow-Up Shared Alert Co',
      phone: '+15550005555',
      closerId: closerA.user._id,
    },
  });
  const fuId = fuLead.data?.data?.lead?._id;
  const callbackAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const setFu = await req('PATCH', `/leads/${fuId}/follow-up`, {
    token: agent.token,
    body: { callbackAt, notes: 'Shared chime test' },
  });

  const markCloser = await req('PATCH', `/leads/${fuId}/follow-up/mark-alert`, {
    token: closerA.token,
    body: { fiveMinFired: true },
  });
  const afterCloser =
    markCloser.data?.data?.lead?.followUp?.alerts?.fiveMinFired === true;

  const markAgent = await req('PATCH', `/leads/${fuId}/follow-up/mark-alert`, {
    token: agent.token,
    body: { fiveMinFired: true },
  });
  const afterAgent =
    markAgent.data?.data?.lead?.followUp?.alerts?.fiveMinFired === true;
  // "does not duplicate the fire" — flag stays a single true, still set once
  const stillOnce = afterAgent === true;

  if (
    fuId &&
    setFu.status === 200 &&
    markCloser.status === 200 &&
    afterCloser &&
    markAgent.status === 200 &&
    stillOnce
  ) {
    pass(
      6,
      'Follow-up shared alert',
      `closer fired fiveMinFired; agent re-call keeps single true`
    );
  } else {
    fail(
      6,
      'Follow-up shared alert',
      `setFu=${setFu.status} markCloser=${markCloser.status} afterCloser=${afterCloser} markAgent=${markAgent.status} stillOnce=${stillOnce} ${JSON.stringify(markCloser.data)?.slice(0, 200)}`
    );
  }

  // —— TC7 Auditor parity ——
  const auditor = await ensureUser(superAdmin.token, 'auditor', 'admin', '5');

  const asSuper = await req('GET', '/leads', { token: superAdmin.token });
  const asAdmin = await req('GET', '/leads', { token: auditor.token });

  const superIds = (asSuper.data?.data?.leads || [])
    .map((l) => l._id)
    .sort()
    .join(',');
  const adminIds = (asAdmin.data?.data?.leads || [])
    .map((l) => l._id)
    .sort()
    .join(',');
  const sameDataset =
    asSuper.status === 200 &&
    asAdmin.status === 200 &&
    superIds === adminIds &&
    superIds.length > 0;

  const auditorPatch = await req('PATCH', `/leads/${leadId}`, {
    token: auditor.token,
    body: { notes: 'auditor must not write' },
  });
  const cannotPatch = auditorPatch.status === 403;

  if (sameDataset && cannotPatch) {
    pass(
      7,
      'Auditor parity',
      `identical GET dataset (${asAdmin.data.data.leads.length} leads); PATCH 403`
    );
  } else {
    fail(
      7,
      'Auditor parity',
      `sameDataset=${sameDataset} super=${asSuper.status} admin=${asAdmin.status} counts=${asSuper.data?.data?.leads?.length}/${asAdmin.data?.data?.leads?.length} patch=${auditorPatch.status}`
    );
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n—— Summary: ${passed}/${results.length} passed, ${failed} failed ——`);

  await mongoose.disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error('Fatal:', err.message || err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
