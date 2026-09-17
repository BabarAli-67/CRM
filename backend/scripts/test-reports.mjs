/**
 * Phase 3.5 Monthly Reports — test cases 1–3
 * Run: node scripts/test-reports.mjs
 */
const BASE = process.env.API_BASE || 'http://localhost:5000/api/v1';
const SUPER = {
  email: 'admin@flashdigital.com',
  password: 'FlashAdmin_Dev_2026!',
};
const PASS = 'ReportTest123!';
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
  const email = `rp.${label}.${stamp}@example.com`.toLowerCase();
  const reg = await req('POST', '/auth/register', {
    body: {
      fullName: `Report ${label}`,
      email,
      phone: `+1333${String(stamp).slice(-6)}${phoneSuffix}`,
      password: PASS,
    },
  });
  if (![201, 409].includes(reg.status)) {
    throw new Error(`Register ${label} failed: ${reg.status} ${JSON.stringify(reg.data)}`);
  }
  const user = await findUserByEmail(superToken, email);
  if (!user) throw new Error(`Could not find user ${email}`);
  if (user.status === 'pending') {
    const approve = await req('PATCH', `/admin/users/${user._id}/approve`, {
      token: superToken,
      body: { role },
    });
    if (approve.status !== 200) {
      throw new Error(`Approve ${label} failed: ${approve.status}`);
    }
  }
  return login(email, PASS);
}

async function createAndClose(agentToken, name, phone, salesAmount) {
  const created = await req('POST', '/leads', {
    token: agentToken,
    body: { businessName: name, phone, salesAmount },
  });
  const leadId = created.data?.data?.lead?._id;
  if (created.status !== 201 || !leadId) {
    throw new Error(`Create lead failed: ${created.status}`);
  }
  // salesAmount may need a PATCH if create ignores it
  if (salesAmount !== undefined) {
    await req('PATCH', `/leads/${leadId}`, {
      token: agentToken,
      body: { salesAmount },
    });
  }
  const closed = await req('PATCH', `/leads/${leadId}/close`, {
    token: agentToken,
    body: {
      payment: {
        method: 'via_link',
        linkUrl: `https://pay.example.com/${phone.replace(/\D/g, '')}`,
      },
    },
  });
  if (closed.status !== 200) {
    throw new Error(`Close failed: ${closed.status} ${JSON.stringify(closed.data)}`);
  }
  return leadId;
}

async function main() {
  console.log(`Base: ${BASE}\n`);

  const health = await req('GET', '/health');
  if (health.status !== 200) throw new Error(`API not healthy: ${health.status}`);

  // Resolve current PKT month via the reports endpoint itself
  const superAdmin = await login(SUPER.email, SUPER.password);
  const probe = await req('GET', '/reports/monthly', { token: superAdmin.token });
  if (probe.status !== 200) {
    throw new Error(`Reports probe failed: ${probe.status} ${JSON.stringify(probe.data)}`);
  }
  const { month, year } = probe.data.data.period;
  const lastMonthDate = new Date(Date.UTC(year, month - 2, 15)); // rough; we backdate via DB-less approach
  // For last-month close: close normally then backdate closedAt through a temporary API-less path.
  // Use Mongo via dynamic import only if needed — prefer admin-visible count delta.

  const agentA = await ensureUser(superAdmin.token, 'agentA', 'sales_agent', '1');
  const auditor = await ensureUser(superAdmin.token, 'auditor', 'admin', '2');

  const before = await req(
    'GET',
    `/reports/monthly?month=${month}&year=${year}`,
    { token: superAdmin.token }
  );
  const beforeRow = (before.data?.data?.perAgent || []).find(
    (r) => String(r.agentId) === String(agentA.user._id)
  );
  const beforeCount = beforeRow?.closedCount || 0;

  // Close 2 leads this month for Agent A
  await createAndClose(agentA.token, 'Report Current 1', '+15559001111', 1000);
  await createAndClose(agentA.token, 'Report Current 2', '+15559002222', 2000);

  // Close 1 lead then backdate closedAt to previous PKT month via mongoose
  const lastMonthLeadId = await createAndClose(
    agentA.token,
    'Report Prior Month',
    '+15559003333',
    500
  );

  const { default: mongoose } = await import('mongoose');
  const env = (await import('../src/config/env.config.js')).default;
  const Lead = (await import('../src/models/lead.model.js')).default;
  const dayjs = (await import('dayjs')).default;
  const utc = (await import('dayjs/plugin/utc.js')).default;
  const timezone = (await import('dayjs/plugin/timezone.js')).default;
  dayjs.extend(utc);
  dayjs.extend(timezone);
  const { TZ } = await import('../src/utils/shiftTime.util.js');

  await mongoose.connect(env.MONGO_URI);
  const priorStart = dayjs
    .tz(`${year}-${String(month).padStart(2, '0')}-01`, TZ)
    .subtract(1, 'month')
    .add(5, 'day')
    .toDate();
  await Lead.findByIdAndUpdate(lastMonthLeadId, { closedAt: priorStart });
  await mongoose.disconnect();

  // —— TC1 Aggregation correctness ——
  const current = await req(
    'GET',
    `/reports/monthly?month=${month}&year=${year}`,
    { token: superAdmin.token }
  );
  const row = (current.data?.data?.perAgent || []).find(
    (r) => String(r.agentId) === String(agentA.user._id)
  );
  const count = row?.closedCount;
  const expected = beforeCount + 2;

  if (current.status === 200 && count === expected) {
    pass(
      1,
      'Aggregation correctness',
      `?month=${month}&year=${year} Agent A closedCount=${count} (was ${beforeCount}, +2 this month; prior month excluded)`
    );
  } else {
    fail(
      1,
      'Aggregation correctness',
      `expected ${expected} got ${count} status=${current.status} row=${JSON.stringify(row)}`
    );
  }

  // Sanity: prior month includes the backdated lead
  const priorMonth = month === 1 ? 12 : month - 1;
  const priorYear = month === 1 ? year - 1 : year;
  const priorReport = await req(
    'GET',
    `/reports/monthly?month=${priorMonth}&year=${priorYear}`,
    { token: superAdmin.token }
  );
  const priorRow = (priorReport.data?.data?.perAgent || []).find(
    (r) => String(r.agentId) === String(agentA.user._id)
  );
  if (!priorRow || priorRow.closedCount < 1) {
    console.log(
      `⚠️  note: prior-month row count=${priorRow?.closedCount ?? 0} (expected ≥1)`
    );
  }

  // —— TC2 Role block ——
  const agentReport = await req('GET', '/reports/monthly', {
    token: agentA.token,
  });
  if (agentReport.status === 403) {
    pass(2, 'Role block', `sales_agent → 403`);
  } else {
    fail(2, 'Role block', `expected 403 got ${agentReport.status}`);
  }

  // —— TC3 Auditor parity ——
  const asSuper = await req(
    'GET',
    `/reports/monthly?month=${month}&year=${year}`,
    { token: superAdmin.token }
  );
  const asAdmin = await req(
    'GET',
    `/reports/monthly?month=${month}&year=${year}`,
    { token: auditor.token }
  );

  const normalize = (value) => {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map(normalize);
    if (typeof value === 'object') {
      const out = {};
      for (const key of Object.keys(value).sort()) {
        out[key] = normalize(value[key]);
      }
      return out;
    }
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return new Date(value).toISOString();
    }
    return value;
  };

  const identical =
    asSuper.status === 200 &&
    asAdmin.status === 200 &&
    JSON.stringify(normalize(asSuper.data?.data)) ===
      JSON.stringify(normalize(asAdmin.data?.data));

  if (identical) {
    pass(
      3,
      'Auditor parity',
      `admin and super_admin identical monthly payload`
    );
  } else {
    fail(
      3,
      'Auditor parity',
      `super=${asSuper.status} admin=${asAdmin.status} equal=${identical}`
    );
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n—— Summary: ${passed}/${results.length} passed, ${failed} failed ——`);
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error('Fatal:', err.message || err);
  try {
    const mongoose = (await import('mongoose')).default;
    if (mongoose.connection.readyState) await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
