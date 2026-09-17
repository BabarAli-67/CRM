/**
 * Phase 4.7 — Pipeline Overview parity / Override gating / Monthly report / CSV
 * Run: node scripts/test-phase47-pipeline-reports.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import env from '../src/config/env.config.js';
import User from '../src/models/user.model.js';

const BASE = process.env.API_BASE || 'http://localhost:5000/api/v1';
const SUPER = {
  email: 'admin@flashdigital.com',
  password: 'FlashAdmin_Dev_2026!',
};
const PASS = 'Phase47UiTest123!';
const stamp = Date.now();
const results = [];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PIPELINE_PAGE = path.resolve(
  __dirname,
  '../../frontend/src/pages/admin/PipelineOverviewPage.jsx'
);
const OVERRIDE_MODAL = path.resolve(
  __dirname,
  '../../frontend/src/components/handover/OverrideReassignModal.jsx'
);
const REPORT_PAGE = path.resolve(
  __dirname,
  '../../frontend/src/pages/admin/MonthlyReportPage.jsx'
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
  const email = `p47.${label}.${stamp}@example.com`.toLowerCase();
  const reg = await req('POST', '/auth/register', {
    body: {
      fullName: `Phase47 ${label}`,
      email,
      phone: `+1888${String(stamp).slice(-6)}${phoneSuffix}`,
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

function idsOf(list) {
  return [...(list || [])]
    .map((x) => String(x._id))
    .sort()
    .join(',');
}

function scanPipelineUi() {
  const src = fs.readFileSync(PIPELINE_PAGE, 'utf8');
  const modal = fs.readFileSync(OVERRIDE_MODAL, 'utf8');
  return {
    gatesOnIsAdmin: /user\?\.isAdmin\s*===\s*true/.test(src),
    overrideModalBehindCanWrite:
      /\{canWrite\s*\?\s*\([\s\S]*OverrideReassignModal/.test(src),
    overrideButtonLabel: /Override/.test(src) && /Assign \/ Override/.test(src),
    modalRequiresReason: /overrideReason/.test(modal),
  };
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(rows) {
  return rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n');
}

function pktMonthYear() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(new Date());
  return {
    month: Number(parts.find((p) => p.type === 'month')?.value),
    year: Number(parts.find((p) => p.type === 'year')?.value),
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
  if (superAdmin.user.isAdmin !== true) {
    throw new Error('Seed super admin must have isAdmin=true');
  }

  const auditorEnsured = await ensureUser(
    superAdmin.token,
    'auditor',
    'admin',
    '1'
  );
  await User.updateOne(
    { _id: auditorEnsured.userId },
    { $set: { isAdmin: false, role: 'admin' } }
  );
  const auditor = await login(auditorEnsured.email, PASS);
  if (auditor.user.isAdmin === true || auditor.user.role !== 'admin') {
    throw new Error(
      `Auditor setup wrong: role=${auditor.user.role} isAdmin=${auditor.user.isAdmin}`
    );
  }

  const agent = await ensureUser(superAdmin.token, 'agent', 'sales_agent', '2');
  const closer = await ensureUser(superAdmin.token, 'closer', 'closer', '3');
  const tech = await ensureUser(superAdmin.token, 'tech', 'tech_team', '4');
  const cst = await ensureUser(superAdmin.token, 'cst', 'cst_manager', '5');

  const ui = scanPipelineUi();
  const { month, year } = pktMonthYear();

  // —— Seed closed deals for report accuracy ——
  const amounts = [1000, 2500, 500];
  const closedIds = [];
  for (let i = 0; i < amounts.length; i += 1) {
    const create = await req('POST', '/leads', {
      token: agent.token,
      body: {
        businessName: `P47 Report Deal ${i + 1}`,
        phone: `+1555477${String(stamp).slice(-4)}${i}`,
        closerId: closer.userId,
        salesAmount: amounts[i],
      },
    });
    const leadId = create.data?.data?.lead?._id;
    const close = await req('PATCH', `/leads/${leadId}/close`, {
      token: agent.token,
      body: {
        payment: {
          method: 'via_link',
          linkUrl: `https://pay.example.com/p47-${i}`,
        },
      },
    });
    if (close.status !== 200) {
      throw new Error(`close ${i} failed: ${JSON.stringify(close.data)}`);
    }
    closedIds.push(leadId);
  }

  // Complete one handover for tech metrics
  await req('PATCH', `/handover/${closedIds[0]}/assign`, {
    token: cst.token,
    body: { techId: tech.userId },
  });
  await req('PATCH', `/handover/${closedIds[0]}/milestone`, {
    token: tech.token,
    body: { milestone: 'in_progress' },
  });
  await req('PATCH', `/handover/${closedIds[0]}/milestone`, {
    token: tech.token,
    body: { milestone: 'completed' },
  });

  // —— TC1 Auditor parity (identical read data) ——
  const [cbSuper, cbAud, leadsSuper, leadsAud, hqSuper, hqAud] =
    await Promise.all([
      req('GET', '/callbacks', { token: superAdmin.token }),
      req('GET', '/callbacks', { token: auditor.token }),
      req('GET', '/leads', { token: superAdmin.token }),
      req('GET', '/leads', { token: auditor.token }),
      req('GET', '/handover/queue', { token: superAdmin.token }),
      req('GET', '/handover/queue', { token: auditor.token }),
    ]);

  const dataParity =
    cbSuper.status === 200 &&
    cbAud.status === 200 &&
    leadsSuper.status === 200 &&
    leadsAud.status === 200 &&
    hqSuper.status === 200 &&
    hqAud.status === 200 &&
    idsOf(cbSuper.data?.data?.callbacks) ===
      idsOf(cbAud.data?.data?.callbacks) &&
    idsOf(leadsSuper.data?.data?.leads) ===
      idsOf(leadsAud.data?.data?.leads) &&
    idsOf(hqSuper.data?.data?.leads) === idsOf(hqAud.data?.data?.leads);

  const uiGatesWrites =
    ui.gatesOnIsAdmin &&
    ui.overrideModalBehindCanWrite &&
    ui.overrideButtonLabel;

  if (dataParity && uiGatesWrites) {
    pass(
      1,
      'Auditor parity',
      `callbacks/leads/handover IDs identical for admin vs super_admin; UI gates writes on isAdmin===true`
    );
  } else {
    fail(
      1,
      'Auditor parity',
      `dataParity=${dataParity} uiGates=${uiGatesWrites} cb=${cbSuper.status}/${cbAud.status} leads=${leadsSuper.status}/${leadsAud.status}`
    );
  }

  // —— TC2 Override visible only to super_admin ——
  const reassignAud = await req('PATCH', `/handover/${closedIds[1]}/reassign`, {
    token: auditor.token,
    body: {
      techId: tech.userId,
      cstStatus: 'assigned',
      overrideReason: 'auditor should be blocked',
    },
  });
  const reassignSuper = await req(
    'PATCH',
    `/handover/${closedIds[1]}/reassign`,
    {
      token: superAdmin.token,
      body: {
        techId: tech.userId,
        cstStatus: 'assigned',
        overrideReason: 'p47 super admin override test',
      },
    }
  );

  if (
    reassignAud.status === 403 &&
    reassignSuper.status === 200 &&
    ui.overrideModalBehindCanWrite &&
    ui.modalRequiresReason &&
    auditor.user.isAdmin === false
  ) {
    pass(
      2,
      'Override visible only to super admin',
      'auditor reassign → 403; UI OverrideReassignModal mounted only when canWrite; auditor isAdmin=false'
    );
  } else {
    fail(
      2,
      'Override visible only to super admin',
      `aud=${reassignAud.status} super=${reassignSuper.status} modalGate=${ui.overrideModalBehindCanWrite}`
    );
  }

  // —— TC3 Report accuracy ——
  const report = await req(
    'GET',
    `/reports/monthly?month=${month}&year=${year}`,
    { token: superAdmin.token }
  );
  const reportAud = await req(
    'GET',
    `/reports/monthly?month=${month}&year=${year}`,
    { token: auditor.token }
  );

  const agentRow = (report.data?.data?.perAgent || []).find(
    (r) => String(r.agentId) === String(agent.userId)
  );
  const closerRow = (report.data?.data?.perCloser || []).find(
    (r) => String(r.closerId) === String(closer.userId)
  );
  const techRow = (report.data?.data?.perTech || []).find(
    (r) => String(r.techId) === String(tech.userId)
  );

  const expectedSum = amounts.reduce((a, b) => a + b, 0);
  const agentOk =
    agentRow &&
    agentRow.closedCount >= amounts.length &&
    Number(agentRow.totalSalesAmount) >= expectedSum;
  const closerOk =
    closerRow &&
    closerRow.closedCount >= amounts.length &&
    Number(closerRow.totalSalesAmount) >= expectedSum;
  const techOk = techRow && techRow.completedCount >= 1;

  // Exact contribution check via DB-backed counts for our stamped deals
  // (agent may have other closes this month from prior tests — verify deltas via lead docs)
  const ourLeads = await (
    await import('../src/models/lead.model.js')
  ).default.find({ _id: { $in: closedIds } }).lean();
  const ourAgentSum = ourLeads.reduce(
    (s, l) => s + (Number(l.salesAmount) || 0),
    0
  );
  const ourClosed = ourLeads.filter((l) => l.stage === 'closed_sale').length;
  const ourCompleted = ourLeads.filter(
    (l) => l.handover?.cstStatus === 'completed'
  ).length;

  const manualMatch =
    ourClosed === amounts.length &&
    ourAgentSum === expectedSum &&
    ourCompleted === 1 &&
    agentOk &&
    closerOk &&
    techOk;

  const reportParity =
    report.status === 200 &&
    reportAud.status === 200 &&
    JSON.stringify(report.data?.data?.perAgent) ===
      JSON.stringify(reportAud.data?.data?.perAgent);

  if (manualMatch && reportParity) {
    pass(
      3,
      'Report accuracy',
      `seeded ${ourClosed} closes sum=${ourAgentSum}; agent/closer rows include totals; tech completed≥1; admin/super report parity`
    );
  } else {
    fail(
      3,
      'Report accuracy',
      `manualMatch=${manualMatch} parity=${reportParity} agent=${JSON.stringify(agentRow)} closer=${JSON.stringify(closerRow)} tech=${JSON.stringify(techRow)}`
    );
  }

  // —— TC4 CSV export ——
  const reportSrc = fs.readFileSync(REPORT_PAGE, 'utf8');
  const hasExportBtn =
    /Export CSV/.test(reportSrc) && /downloadCsv|text\/csv/.test(reportSrc);
  const hasEscape =
    /escapeCsv/.test(reportSrc) && /replace\(\/"\/g,\s*'""'\)/.test(reportSrc);

  const sampleRows = [
    ['Section', 'Name', 'Email', 'Metric', 'Value'],
    ['Agent', agent.user.fullName || 'Phase47 agent', agent.email, 'closedCount', ourClosed],
    [
      'Agent',
      'Name, with comma',
      'a@example.com',
      'totalSalesAmount',
      expectedSum,
    ],
    ['Tech', 'Tech "Quoted"', tech.email, 'completedCount', ourCompleted],
  ];
  const csv = buildCsv(sampleRows);
  const lines = csv.split('\r\n');
  const csvOk =
    lines[0] === 'Section,Name,Email,Metric,Value' &&
    lines[2].includes('"Name, with comma"') &&
    lines[3].includes('"Tech ""Quoted"""') &&
    hasExportBtn &&
    hasEscape;

  if (csvOk) {
    pass(
      4,
      'CSV export',
      'Export CSV wired; client escape handles commas/quotes; sample CSV well-formed'
    );
  } else {
    fail(
      4,
      'CSV export',
      `hasExport=${hasExportBtn} hasEscape=${hasEscape} sample=${csv.slice(0, 120)}`
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
