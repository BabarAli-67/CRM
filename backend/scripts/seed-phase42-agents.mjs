/**
 * Seed two sales agents for Phase 4.2 UI tests. Prints emails/password.
 * Run: node scripts/seed-phase42-agents.mjs
 */
const BASE = process.env.API_BASE || 'http://localhost:5000/api/v1';
const SUPER = {
  email: 'admin@flashdigital.com',
  password: 'FlashAdmin_Dev_2026!',
};
const PASS = 'Phase42UiTest123!';
const stamp = Date.now();

async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

async function login(email, password) {
  const r = await req('POST', '/auth/login', { body: { email, password } });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
  return r.data.data;
}

async function ensure(superToken, label, phoneSuffix) {
  const email = `p42.${label}.${stamp}@example.com`.toLowerCase();
  await req('POST', '/auth/register', {
    body: {
      fullName: `Phase42 ${label}`,
      email,
      phone: `+1313${String(stamp).slice(-6)}${phoneSuffix}`,
      password: PASS,
    },
  });
  const pending = await req('GET', '/admin/users/pending', { token: superToken });
  const u = pending.data.data.users.find((x) => x.email === email);
  if (!u) throw new Error(`pending not found ${email}`);
  if (u.status === 'pending') {
    await req('PATCH', `/admin/users/${u._id}/approve`, {
      token: superToken,
      body: { role: 'sales_agent' },
    });
  }
  return { email, password: PASS, id: u._id };
}

const superAdmin = await login(SUPER.email, SUPER.password);
const agentA = await ensure(superAdmin.token, 'agentA', '1');
const agentB = await ensure(superAdmin.token, 'agentB', '2');

// Seed one callback owned by A for isolation check
const loginA = await login(agentA.email, agentA.password);
await req('POST', '/callbacks', {
  token: loginA.token,
  body: {
    businessName: 'Agent A Only Biz',
    phone: '+15554220001',
    businessLink: 'https://agent-a.example.com',
    callbackAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    notes: 'seed for isolation',
  },
});

console.log(
  JSON.stringify(
    {
      password: PASS,
      superAdmin: SUPER.email,
      agentA: agentA.email,
      agentB: agentB.email,
    },
    null,
    2
  )
);
