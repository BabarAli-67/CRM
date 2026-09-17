/**
 * Phase 3 Callback API — manual test cases 1–7
 * Run: node scripts/test-callbacks.mjs
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const BASE = process.env.API_BASE || 'http://localhost:5000/api/v1';
const SUPER = {
  email: 'admin@flashdigital.com',
  password: 'FlashAdmin_Dev_2026!',
};
const PASS = 'CallbackTest123!';
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

async function ensureAgent(superToken, label) {
  // emails are lowercased by the User schema
  const email = `cb.${label}.${stamp}@example.com`.toLowerCase();
  const phone = `+1555${String(stamp).slice(-6)}${label === 'agentA' ? '1' : '2'}`;
  const reg = await req('POST', '/auth/register', {
    body: {
      fullName: `Callback ${label}`,
      email,
      phone,
      password: PASS,
    },
  });
  if (![201, 409].includes(reg.status)) {
    throw new Error(`Register ${label} failed: ${reg.status} ${JSON.stringify(reg.data)}`);
  }

  const user = await findUserByEmail(superToken, email);
  if (!user) {
    throw new Error(
      `Could not find registered user ${email} (reg=${reg.status} ${JSON.stringify(reg.data)?.slice(0, 200)})`
    );
  }

  if (user.status === 'pending') {
    const approve = await req('PATCH', `/admin/users/${user._id}/approve`, {
      token: superToken,
      body: { role: 'sales_agent' },
    });
    if (approve.status !== 200) {
      throw new Error(`Approve ${label} failed: ${approve.status} ${JSON.stringify(approve.data)}`);
    }
  }

  return login(email, PASS);
}

async function ensureAuditor(superToken) {
  const email = `cb.auditor.${stamp}@example.com`.toLowerCase();
  const reg = await req('POST', '/auth/register', {
    body: {
      fullName: 'Callback Auditor',
      email,
      phone: `+1666${String(stamp).slice(-7)}`,
      password: PASS,
    },
  });
  if (![201, 409].includes(reg.status)) {
    throw new Error(`Register auditor failed: ${reg.status} ${JSON.stringify(reg.data)}`);
  }

  const user = await findUserByEmail(superToken, email);
  if (!user) throw new Error(`Auditor user not found ${email}`);

  if (user.status === 'pending') {
    const approve = await req('PATCH', `/admin/users/${user._id}/approve`, {
      token: superToken,
      body: { role: 'admin' },
    });
    if (approve.status !== 200) {
      throw new Error(`Approve auditor failed: ${approve.status} ${JSON.stringify(approve.data)}`);
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

  const superAdmin = await login(SUPER.email, SUPER.password);
  const agentA = await ensureAgent(superAdmin.token, 'agentA');
  const agentB = await ensureAgent(superAdmin.token, 'agentB');
  const auditor = await ensureAuditor(superAdmin.token);

  const callbackAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const validPayload = {
    businessName: 'Acme Plumbing',
    phone: '+15551230001',
    businessLink: 'https://acme.example.com',
    callbackAt,
    notes: 'Ask for Mike',
  };

  // —— TC1 Agent creates callback ——
  const create = await req('POST', '/callbacks', {
    token: agentA.token,
    body: validPayload,
  });
  const createdId = create.data?.data?.callback?._id;
  if (create.status === 201 && createdId) {
    const mine = await req('GET', '/callbacks/mine', { token: agentA.token });
    const found = mine.data?.data?.callbacks?.some((c) => c._id === createdId);
    if (mine.status === 200 && found) {
      pass(1, 'Agent creates callback', `201 + visible in /mine id=${createdId}`);
    } else {
      fail(1, 'Agent creates callback', `created but not in /mine: ${mine.status}`);
    }
  } else {
    fail(1, 'Agent creates callback', `${create.status} ${JSON.stringify(create.data)}`);
  }

  // —— TC2 Missing required field ——
  const missing = await req('POST', '/callbacks', {
    token: agentA.token,
    body: {
      businessName: 'No Link Co',
      phone: '+15551230002',
      callbackAt,
    },
  });
  if (missing.status === 400) {
    pass(2, 'Missing required field', `400 — ${missing.data?.message || 'ok'}`);
  } else {
    fail(2, 'Missing required field', `expected 400 got ${missing.status} ${JSON.stringify(missing.data)}`);
  }

  // —— TC3 Ownership isolation ——
  const mineB = await req('GET', '/callbacks/mine', { token: agentB.token });
  const leaked = mineB.data?.data?.callbacks?.some((c) => c._id === createdId);
  if (mineB.status === 200 && !leaked) {
    pass(3, 'Ownership isolation', 'Agent B does not see Agent A callback');
  } else {
    fail(3, 'Ownership isolation', `leaked=${!!leaked} status=${mineB.status}`);
  }

  // —— TC4 Admin visibility ——
  const all = await req('GET', '/callbacks', { token: superAdmin.token });
  const inAll = all.data?.data?.callbacks?.some((c) => c._id === createdId);
  if (all.status === 200 && inAll) {
    pass(4, 'Admin visibility', `super_admin sees all (${all.data.data.callbacks.length} total)`);
  } else {
    fail(4, 'Admin visibility', `${all.status} inAll=${!!inAll} ${JSON.stringify(all.data)?.slice(0, 200)}`);
  }

  // —— TC5 Auditor write block ——
  const auditorPatch = await req('PATCH', `/callbacks/${createdId}`, {
    token: auditor.token,
    body: { notes: 'auditor should not write' },
  });
  // Expected: 403 from blockReadOnlyAdmin. Current route also restrictTo sales_agent|super_admin,
  // so admin may hit restrictTo 403 first — still a write block.
  const msg = auditorPatch.data?.message || '';
  if (
    auditorPatch.status === 403 &&
    (msg.includes('read-only') || msg.includes('permission'))
  ) {
    pass(
      5,
      'Auditor write block',
      `403 — ${msg.includes('read-only') ? 'blockReadOnlyAdmin' : 'restrictTo (admin not on allowlist)'}`
    );
  } else {
    fail(5, 'Auditor write block', `expected 403 got ${auditorPatch.status} ${msg}`);
  }

  // —— TC6 Promote flow ——
  const promote = await req('POST', `/callbacks/${createdId}/promote`, {
    token: agentA.token,
  });
  const leadId = promote.data?.data?.lead?._id;
  const afterPromote = await req('GET', '/callbacks', { token: superAdmin.token });
  const cbRow = afterPromote.data?.data?.callbacks?.find((c) => c._id === createdId);
  const stillFetchable = !!cbRow;
  const statusPromoted = cbRow?.status === 'promoted';
  const leadOk = promote.status === 201 && !!leadId;

  // Agent /mine should hide promoted by default
  const mineAfter = await req('GET', '/callbacks/mine', { token: agentA.token });
  const hiddenFromMine = !mineAfter.data?.data?.callbacks?.some((c) => c._id === createdId);

  if (leadOk && stillFetchable && statusPromoted) {
    pass(
      6,
      'Promote flow',
      `lead=${leadId}, status=promoted, admin-fetchable, hiddenFromMine=${hiddenFromMine}`
    );
  } else {
    fail(
      6,
      'Promote flow',
      `promote=${promote.status} leadOk=${leadOk} fetchable=${stillFetchable} status=${cbRow?.status} ${JSON.stringify(promote.data)?.slice(0, 300)}`
    );
  }

  // —— TC7 Cross-role read block ——
  const cross = await req('GET', '/callbacks/mine', { token: auditor.token });
  if (cross.status === 403) {
    pass(7, 'Cross-role read block', `403 — ${cross.data?.message || 'restricted to sales_agent'}`);
  } else {
    fail(7, 'Cross-role read block', `expected 403 got ${cross.status}`);
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n—— Summary: ${passed}/${results.length} passed, ${failed} failed ——`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err.message || err);
  process.exit(1);
});
