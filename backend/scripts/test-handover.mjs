/**
 * Phase 3.4 Handover — test cases 1–5
 * Run: node scripts/test-handover.mjs
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
  const email = `ho.${label}.${stamp}@example.com`.toLowerCase();
  const reg = await req('POST', '/auth/register', {
    body: {
      fullName: `Handover ${label}`,
      email,
      phone: `+1999${String(stamp).slice(-6)}${phoneSuffix}`,
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

  const superAdmin = await login(SUPER.email, SUPER.password);
  const agent = await ensureUser(superAdmin.token, 'agent', 'sales_agent', '1');
  const cst = await ensureUser(superAdmin.token, 'cst', 'cst_manager', '2');
  const techA = await ensureUser(superAdmin.token, 'techA', 'tech_team', '3');
  const techB = await ensureUser(superAdmin.token, 'techB', 'tech_team', '4');

  // Close a lead as agent → pending_review
  const created = await req('POST', '/leads', {
    token: agent.token,
    body: {
      businessName: 'Handover Queue Co',
      phone: '+15558001111',
      yelpLink: 'https://yelp.example.com/biz',
      websiteLink: 'https://handover.example.com',
      gmbLink: 'https://maps.example.com/biz',
    },
  });
  const leadId = created.data?.data?.lead?._id;
  if (!leadId) {
    throw new Error(`Create lead failed: ${JSON.stringify(created.data)}`);
  }

  const closed = await req('PATCH', `/leads/${leadId}/close`, {
    token: agent.token,
    body: {
      payment: {
        method: 'via_link',
        linkUrl: 'https://pay.example.com/ho-1',
      },
    },
  });
  if (closed.status !== 200) {
    throw new Error(`Close failed: ${closed.status} ${JSON.stringify(closed.data)}`);
  }

  // —— TC1 CST sees queue ——
  const queue = await req('GET', '/handover/queue', { token: cst.token });
  const inQueue = (queue.data?.data?.leads || []).find((l) => l._id === leadId);
  if (
    queue.status === 200 &&
    inQueue &&
    inQueue.handover?.cstStatus === 'pending_review' &&
    inQueue.payment &&
    (inQueue.yelpLink || inQueue.websiteLink || inQueue.gmbLink)
  ) {
    pass(
      1,
      'CST sees queue',
      `pending_review lead with links/payment visible`
    );
  } else {
    fail(
      1,
      'CST sees queue',
      `status=${queue.status} found=${!!inQueue} cstStatus=${inQueue?.handover?.cstStatus}`
    );
  }

  // —— TC2 Assign to tech ——
  const assign = await req('PATCH', `/handover/${leadId}/assign`, {
    token: cst.token,
    body: { techId: techA.user._id },
  });
  const afterAssign = assign.data?.data?.lead;
  const myA = await req('GET', '/handover/my-projects', { token: techA.token });
  const seenByA = (myA.data?.data?.leads || []).some((l) => l._id === leadId);

  if (
    assign.status === 200 &&
    afterAssign?.handover?.cstStatus === 'assigned' &&
    afterAssign?.handover?.assignedTechId?.toString?.() ===
      techA.user._id.toString() &&
    myA.status === 200 &&
    seenByA
  ) {
    pass(2, 'Assign to tech', `cstStatus=assigned; techA sees in /my-projects`);
  } else {
    // assignedTechId may be ObjectId string in JSON
    const assignedId =
      afterAssign?.handover?.assignedTechId?._id ||
      afterAssign?.handover?.assignedTechId;
    const idMatch = String(assignedId) === String(techA.user._id);
    if (assign.status === 200 && afterAssign?.handover?.cstStatus === 'assigned' && idMatch && seenByA) {
      pass(2, 'Assign to tech', `cstStatus=assigned; techA sees in /my-projects`);
    } else {
      fail(
        2,
        'Assign to tech',
        `assign=${assign.status} status=${afterAssign?.handover?.cstStatus} seenByA=${seenByA} ${JSON.stringify(assign.data)?.slice(0, 250)}`
      );
    }
  }

  // —— TC3 Tech isolation ——
  const myB = await req('GET', '/handover/my-projects', { token: techB.token });
  const seenByB = (myB.data?.data?.leads || []).some((l) => l._id === leadId);
  if (myB.status === 200 && !seenByB) {
    pass(3, 'Tech isolation', `Tech B does not see Tech A's assignment`);
  } else {
    fail(3, 'Tech isolation', `seenByB=${seenByB} status=${myB.status}`);
  }

  // —— TC4 Milestone forward only (skip rejected) ——
  // Implemented rule: assigned → in_progress → completed (no skipping)
  const skip = await req('PATCH', `/handover/${leadId}/milestone`, {
    token: techA.token,
    body: { milestone: 'completed' },
  });
  if (skip.status === 400) {
    pass(
      4,
      'Milestone forward only',
      `skip assigned→completed rejected (${skip.status}); step rule enforced`
    );
  } else if (skip.status === 200 && skip.data?.data?.lead?.handover?.cstStatus === 'completed') {
    fail(
      4,
      'Milestone forward only',
      `skip was allowed but implementation forbids skipping`
    );
  } else {
    fail(
      4,
      'Milestone forward only',
      `expected 400 skip reject, got ${skip.status} ${JSON.stringify(skip.data)?.slice(0, 200)}`
    );
  }

  // Valid forward step then attempt used for TC5 setup
  const toProgress = await req('PATCH', `/handover/${leadId}/milestone`, {
    token: techA.token,
    body: { milestone: 'in_progress' },
  });
  if (toProgress.status !== 200) {
    fail(
      4,
      'Milestone forward only',
      `valid assigned→in_progress failed: ${toProgress.status}`
    );
  }

  // —— TC5 Backward block ——
  const backward = await req('PATCH', `/handover/${leadId}/milestone`, {
    token: techA.token,
    body: { milestone: 'in_progress' }, // already in_progress → not forward
  });
  // Also try forcing via a status that would go back — tech can only send in_progress|completed
  // Move to completed then try... tech can't send 'assigned'. So duplicate in_progress is backward/same.
  const toDone = await req('PATCH', `/handover/${leadId}/milestone`, {
    token: techA.token,
    body: { milestone: 'completed' },
  });
  const backFromDone = await req('PATCH', `/handover/${leadId}/milestone`, {
    token: techA.token,
    body: { milestone: 'in_progress' },
  });

  const backwardBlocked =
    [400, 403].includes(backward.status) &&
    toDone.status === 200 &&
    [400, 403].includes(backFromDone.status);

  if (backwardBlocked) {
    pass(
      5,
      'Backward block',
      `same-step ${backward.status}; after completed, in_progress → ${backFromDone.status}`
    );
  } else {
    fail(
      5,
      'Backward block',
      `backward=${backward.status} toDone=${toDone.status} backFromDone=${backFromDone.status}`
    );
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n—— Summary: ${passed}/${results.length} passed, ${failed} failed ——`);

  // Write machine-readable results for TESTING.md update
  const out = {
    passed,
    failed,
    results,
    leadId,
  };
  console.log('\nJSON_RESULTS=' + JSON.stringify(out));

  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err.message || err);
  process.exit(1);
});
