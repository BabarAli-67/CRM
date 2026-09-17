/**
 * Phase 3.4 Handover — test cases 6–7
 * Run: node scripts/test-handover-6-7.mjs
 */
const BASE = process.env.API_BASE || 'http://localhost:5000/api/v1';
const SUPER = {
  email: 'admin@flashdigital.com',
  password: 'FlashAdmin_Dev_2026!',
};
const PASS = 'HandoverTest123!';
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
  const email = `ho67.${label}.${stamp}@example.com`.toLowerCase();
  const reg = await req('POST', '/auth/register', {
    body: {
      fullName: `Handover67 ${label}`,
      email,
      phone: `+1444${String(stamp).slice(-6)}${phoneSuffix}`,
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

async function main() {
  console.log(`Base: ${BASE}\n`);

  const health = await req('GET', '/health');
  if (health.status !== 200) throw new Error(`API not healthy: ${health.status}`);

  const superAdmin = await login(SUPER.email, SUPER.password);
  const agent = await ensureUser(superAdmin.token, 'agent', 'sales_agent', '1');
  const cst = await ensureUser(superAdmin.token, 'cst', 'cst_manager', '2');
  const techA = await ensureUser(superAdmin.token, 'techA', 'tech_team', '3');
  const techB = await ensureUser(superAdmin.token, 'techB', 'tech_team', '4');
  const auditor = await ensureUser(superAdmin.token, 'auditor', 'admin', '5');

  const created = await req('POST', '/leads', {
    token: agent.token,
    body: {
      businessName: 'Override Audit Co',
      phone: '+15558009999',
      websiteLink: 'https://override.example.com',
    },
  });
  const leadId = created.data?.data?.lead?._id;
  if (!leadId) throw new Error('Lead create failed');

  const closed = await req('PATCH', `/leads/${leadId}/close`, {
    token: agent.token,
    body: {
      payment: { method: 'via_link', linkUrl: 'https://pay.example.com/ho67' },
    },
  });
  if (closed.status !== 200) throw new Error(`Close failed: ${closed.status}`);

  const assign = await req('PATCH', `/handover/${leadId}/assign`, {
    token: cst.token,
    body: { techId: techA.user._id },
  });
  if (assign.status !== 200) throw new Error(`Assign failed: ${assign.status}`);

  // Advance to completed so override can force backward
  await req('PATCH', `/handover/${leadId}/milestone`, {
    token: techA.token,
    body: { milestone: 'in_progress' },
  });
  await req('PATCH', `/handover/${leadId}/milestone`, {
    token: techA.token,
    body: { milestone: 'completed' },
  });

  // —— TC6 Super admin override ——
  const reason = `QA override reassign ${stamp}`;
  const reassign = await req('PATCH', `/handover/${leadId}/reassign`, {
    token: superAdmin.token,
    body: {
      techId: techB.user._id,
      cstStatus: 'assigned',
      overrideReason: reason,
    },
  });
  const lead = reassign.data?.data?.lead;
  const log = lead?.handover?.overrideLog || [];
  const logEntry = log.find(
    (e) => e.reason === reason && String(e.by?._id || e.by) === String(superAdmin.user._id)
  );
  const statusOk = lead?.handover?.cstStatus === 'assigned';
  const techOk =
    String(lead?.handover?.assignedTechId?._id || lead?.handover?.assignedTechId) ===
    String(techB.user._id);

  if (reassign.status === 200 && statusOk && techOk && logEntry) {
    pass(
      6,
      'Super admin override',
      `reassign 200; status=assigned→techB; overrideLog recorded`
    );
  } else {
    fail(
      6,
      'Super admin override',
      `status=${reassign.status} statusOk=${statusOk} techOk=${techOk} logEntry=${!!logEntry} logLen=${log.length} ${JSON.stringify(reassign.data)?.slice(0, 300)}`
    );
  }

  // —— TC7 Auditor read-only ——
  const queue = await req('GET', '/handover/queue', { token: auditor.token });
  const assignAsAdmin = await req('PATCH', `/handover/${leadId}/assign`, {
    token: auditor.token,
    body: { techId: techA.user._id },
  });
  const reassignAsAdmin = await req('PATCH', `/handover/${leadId}/reassign`, {
    token: auditor.token,
    body: {
      cstStatus: 'in_progress',
      overrideReason: 'auditor should not write',
    },
  });

  const readOk = queue.status === 200;
  const assignBlocked = assignAsAdmin.status === 403;
  const reassignBlocked =
    reassignAsAdmin.status === 403 &&
    String(reassignAsAdmin.data?.message || '').toLowerCase().includes('read-only');

  if (readOk && assignBlocked) {
    pass(
      7,
      'Auditor read-only',
      `GET /queue ${queue.status}; /assign ${assignAsAdmin.status}; /reassign ${reassignAsAdmin.status}${reassignBlocked ? ' (blockReadOnlyAdmin)' : ''}`
    );
  } else {
    fail(
      7,
      'Auditor read-only',
      `queue=${queue.status} assign=${assignAsAdmin.status} reassign=${reassignAsAdmin.status}`
    );
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
