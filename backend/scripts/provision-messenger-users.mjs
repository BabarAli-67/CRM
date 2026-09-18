/**
 * Provision one approved user per department role for messenger UI checks.
 * Run: node scripts/provision-messenger-users.mjs
 */
const BASE = process.env.API_BASE || 'http://localhost:5000/api/v1';
const SUPER = { email: 'admin@flashdigital.com', password: 'FlashAdmin_Dev_2026!' };
const PASS = 'MessengerUi123!';
const stamp = Date.now();

async function req(method, urlPath, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function login(email, password) {
  const { status, data } = await req('POST', '/auth/login', { body: { email, password } });
  if (status !== 200) throw new Error(`login ${email} ${status}`);
  return data.data;
}

async function ensure(superToken, role, label, i) {
  const email = `msg.${role}.${stamp}@example.com`;
  const reg = await req('POST', '/auth/register', {
    body: {
      fullName: label,
      email,
      phone: `+15551${String(stamp).slice(-6)}${i}`,
      password: PASS,
    },
  });
  if (reg.status !== 201) throw new Error(`reg ${email} ${reg.status}`);
  const id = reg.data.data.user._id;
  const ap = await req('PATCH', `/admin/users/${id}/approve`, {
    token: superToken,
    body: { role },
  });
  if (ap.status !== 200) throw new Error(`approve ${email} ${ap.status}`);
  return { email, password: PASS, role, path: {
    sales_agent: '/dashboard/sales-agent',
    closer: '/dashboard/closer',
    cst_manager: '/dashboard/cst-manager',
    tech_team: '/dashboard/tech-team',
    admin: '/admin/monitor',
  }[role] };
}

const { token } = await login(SUPER.email, SUPER.password);
const users = [
  await ensure(token, 'sales_agent', 'Msg Agent', 1),
  await ensure(token, 'closer', 'Msg Closer', 2),
  await ensure(token, 'cst_manager', 'Msg CST', 3),
  await ensure(token, 'tech_team', 'Msg Tech', 4),
  await ensure(token, 'admin', 'Msg Auditor', 5),
];

console.log(JSON.stringify({
  super_admin: { email: SUPER.email, password: SUPER.password, path: '/admin' },
  users,
}, null, 2));
