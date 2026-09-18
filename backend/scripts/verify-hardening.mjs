/**
 * Hardening verification — race guards, post-vanish writes, alert ownership
 * Run: node scripts/verify-hardening.mjs
 */
import mongoose from 'mongoose';
import env from '../src/config/env.config.js';
import Lead from '../src/models/lead.model.js';

const BASE = process.env.API_BASE || 'http://localhost:5000/api/v1';
const SUPER = {
  email: 'admin@flashdigital.com',
  password: 'FlashAdmin_Dev_2026!',
};
const PASS = 'HardenVerify123!';
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
  console.log(`✅ V${id} PASS — ${name}${detail ? `: ${detail}` : ''}`);
}

function fail(id, name, detail) {
  results.push({ id, name, ok: false, detail });
  console.log(`❌ V${id} FAIL — ${name}: ${detail}`);
}

async function login(email, password) {
  const { status, data } = await req('POST', '/auth/login', {
    body: { email, password },
  });
  if (status !== 200 || !data?.data?.token) {
    throw new Error(`Login ${email}: ${status} ${JSON.stringify(data)}`);
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
  const email = `hd.${label}.${stamp}@example.com`.toLowerCase();
  await req('POST', '/auth/register', {
    body: {
      fullName: `Harden ${label}`,
      email,
      phone: `+1999${String(stamp).slice(-6)}${phoneSuffix}`,
      password: PASS,
    },
  });
  const user = await findUserByEmail(superToken, email);
  if (!user) throw new Error(`missing ${email}`);
  if (user.status === 'pending') {
    const approve = await req('PATCH', `/admin/users/${user._id}/approve`, {
      token: superToken,
      body: { role },
    });
    if (approve.status !== 200) {
      throw new Error(`approve ${label}: ${approve.status}`);
    }
  }
  const session = await login(email, PASS);
  return { ...session, email, userId: session.user._id };
}

async function createLead(token, body) {
  const r = await req('POST', '/leads', { token, body });
  if (r.status !== 201) throw new Error(`create lead: ${r.status}`);
  return r.data.data.lead;
}

const payLink = {
  payment: { method: 'via_link', linkUrl: 'https://pay.example.com/harden' },
};

async function main() {
  console.log(`Base: ${BASE}\n`);
  const health = await req('GET', '/health');
  if (health.status !== 200) throw new Error('API down');

  await mongoose.connect(env.MONGO_URI);

  const superAdmin = await login(SUPER.email, SUPER.password);
  const agent = await ensureUser(superAdmin.token, 'agent', 'sales_agent', '1');
  const closer = await ensureUser(superAdmin.token, 'closer', 'closer', '2');
  const agentB = await ensureUser(superAdmin.token, 'agentB', 'sales_agent', '3');
  const cstA = await ensureUser(superAdmin.token, 'cstA', 'cst_manager', '4');
  const cstB = await ensureUser(superAdmin.token, 'cstB', 'cst_manager', '5');
  const tech = await ensureUser(superAdmin.token, 'tech', 'tech_team', '6');

  // —— V1 Race close vs disqualify ——
  const raceLead = await createLead(agent.token, {
    businessName: 'Harden Race CloseDq',
    phone: '+15558000001',
    closerId: closer.userId,
  });
  const [closeR, dqR] = await Promise.all([
    req('PATCH', `/leads/${raceLead._id}/close`, {
      token: agent.token,
      body: payLink,
    }),
    req('PATCH', `/leads/${raceLead._id}/disqualify`, {
      token: closer.token,
      body: { disqualifiedReason: 'race lose' },
    }),
  ]);
  const statuses1 = [closeR.status, dqR.status].sort();
  const one200one409 =
    statuses1[0] === 200 && statuses1[1] === 409;
  if (one200one409) {
    pass(1, 'Race close/disqualify', `statuses=${closeR.status},${dqR.status}`);
  } else {
    fail(1, 'Race close/disqualify', `got ${closeR.status},${dqR.status}`);
  }

  // —— V2 Race assign ——
  const assignLead = await createLead(agent.token, {
    businessName: 'Harden Race Assign',
    phone: '+15558000002',
  });
  await req('PATCH', `/leads/${assignLead._id}/close`, {
    token: agent.token,
    body: payLink,
  });
  const [a1, a2] = await Promise.all([
    req('PATCH', `/handover/${assignLead._id}/assign`, {
      token: cstA.token,
      body: { techId: tech.userId },
    }),
    req('PATCH', `/handover/${assignLead._id}/assign`, {
      token: cstB.token,
      body: { techId: tech.userId },
    }),
  ]);
  const assignSorted = [a1.status, a2.status].sort();
  if (assignSorted[0] === 200 && assignSorted[1] === 409) {
    pass(2, 'Race assign', `statuses=${a1.status},${a2.status}`);
  } else {
    fail(2, 'Race assign', `got ${a1.status},${a2.status}`);
  }

  // —— V3 Post-vanish agent PATCH ——
  const vanishLead = await createLead(agent.token, {
    businessName: 'Harden Vanish',
    phone: '+15558000003',
    closerId: closer.userId,
  });
  await req('PATCH', `/leads/${vanishLead._id}/close`, {
    token: agent.token,
    body: payLink,
  });
  const agentPatch = await req('PATCH', `/leads/${vanishLead._id}`, {
    token: agent.token,
    body: { notes: 'should fail' },
  });
  if (agentPatch.status === 404) {
    pass(3, 'Post-vanish agent PATCH', '404');
  } else {
    fail(3, 'Post-vanish agent PATCH', `status=${agentPatch.status}`);
  }

  // —— V4 Post-vanish closer PATCH ——
  const closerPatch = await req('PATCH', `/leads/${vanishLead._id}`, {
    token: closer.token,
    body: { notes: 'should fail' },
  });
  if (closerPatch.status === 404) {
    pass(4, 'Post-vanish closer PATCH', '404');
  } else {
    fail(4, 'Post-vanish closer PATCH', `status=${closerPatch.status}`);
  }

  // —— V5 Super admin can still PATCH closed lead ——
  const superPatch = await req('PATCH', `/leads/${vanishLead._id}`, {
    token: superAdmin.token,
    body: { notes: 'super ok' },
  });
  if (superPatch.status === 200) {
    pass(5, 'Super Admin PATCH closed lead', '200');
  } else {
    fail(5, 'Super Admin PATCH closed lead', `status=${superPatch.status} ${JSON.stringify(superPatch.data)?.slice(0, 200)}`);
  }

  // —— V6 Follow-up post-vanish ——
  const fuPatch = await req('PATCH', `/leads/${vanishLead._id}/follow-up`, {
    token: agent.token,
    body: { callbackAt: new Date(Date.now() + 3600000).toISOString() },
  });
  if (fuPatch.status === 404) {
    pass(6, 'Follow-up post-vanish', '404');
  } else {
    fail(6, 'Follow-up post-vanish', `status=${fuPatch.status}`);
  }

  // —— V7 Cross-agent mark-alert ——
  const cbA = await req('POST', '/callbacks', {
    token: agent.token,
    body: {
      businessName: 'Harden CB A',
      phone: '+15558000004',
      businessLink: 'https://a.example.com',
      callbackAt: new Date(Date.now() + 3600000).toISOString(),
    },
  });
  const cbId = cbA.data?.data?.callback?._id;
  const tamper = await req('PATCH', `/callbacks/${cbId}/mark-alert`, {
    token: agentB.token,
    body: { fiveMinFired: true },
  });
  if (tamper.status === 404) {
    pass(7, 'Cross-agent mark-alert', '404');
  } else {
    fail(7, 'Cross-agent mark-alert', `status=${tamper.status}`);
  }

  // —— V8 Stale-timer flags on close ——
  const timerLead = await createLead(agent.token, {
    businessName: 'Harden Timer',
    phone: '+15558000005',
  });
  await req('PATCH', `/leads/${timerLead._id}/follow-up`, {
    token: agent.token,
    body: {
      callbackAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      notes: 'future',
    },
  });
  await req('PATCH', `/leads/${timerLead._id}/close`, {
    token: agent.token,
    body: payLink,
  });
  const doc = await Lead.findById(timerLead._id).lean();
  const flagsOk =
    doc?.followUp?.alerts?.fiveMinFired === true &&
    doc?.followUp?.alerts?.exactTimeFired === true;
  if (flagsOk) {
    pass(8, 'Stale-timer flags', 'both alert flags true after close');
  } else {
    fail(
      8,
      'Stale-timer flags',
      `alerts=${JSON.stringify(doc?.followUp?.alerts)}`
    );
  }

  await mongoose.disconnect();

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n—— Hardening: ${results.length - failed.length}/${results.length} passed ——`
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
