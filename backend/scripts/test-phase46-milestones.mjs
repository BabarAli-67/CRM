/**
 * Phase 4.6 — My Projects & Milestone Tracker
 * Run: node scripts/test-phase46-milestones.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import env from '../src/config/env.config.js';
import Lead from '../src/models/lead.model.js';

const BASE = process.env.API_BASE || 'http://localhost:5000/api/v1';
const SUPER = {
  email: 'admin@flashdigital.com',
  password: 'FlashAdmin_Dev_2026!',
};
const PASS = 'Phase46UiTest123!';
const stamp = Date.now();
const results = [];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STEPPER_PATH = path.resolve(
  __dirname,
  '../../frontend/src/components/handover/MilestoneStepper.jsx'
);
const PROJECTS_PATH = path.resolve(
  __dirname,
  '../../frontend/src/pages/tech-team/MyProjectsPage.jsx'
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
  const email = `p46.${label}.${stamp}@example.com`.toLowerCase();
  const reg = await req('POST', '/auth/register', {
    body: {
      fullName: `Phase46 ${label}`,
      email,
      phone: `+1777${String(stamp).slice(-6)}${phoneSuffix}`,
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

function scanUi() {
  const stepper = fs.readFileSync(STEPPER_PATH, 'utf8');
  const projects = fs.readFileSync(PROJECTS_PATH, 'utf8');
  return {
    fetchesMyProjects: /getMyProjects|my-projects/.test(projects),
    hasNextButton: /Next/.test(stepper) && /mutation\.mutate\(nextMilestone\)/.test(stepper),
    disablesWhilePending: /disabled=\{mutation\.isPending/.test(stepper),
    stepsAssignedInProgressCompleted:
      /assigned/.test(stepper) &&
      /in_progress/.test(stepper) &&
      /completed/.test(stepper),
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
  const agent = await ensureUser(superAdmin.token, 'agent', 'sales_agent', '1');
  const cst = await ensureUser(superAdmin.token, 'cst', 'cst_manager', '2');
  const techA = await ensureUser(superAdmin.token, 'techA', 'tech_team', '3');
  const techB = await ensureUser(superAdmin.token, 'techB', 'tech_team', '4');

  const ui = scanUi();

  // Seed: agent creates + closes → CST assigns to techA
  const create = await req('POST', '/leads', {
    token: agent.token,
    body: {
      businessName: 'P46 Milestone Co',
      phone: '+15554660001',
      websiteLink: 'https://p46.example.com',
    },
  });
  const leadId = create.data?.data?.lead?._id;
  await req('PATCH', `/leads/${leadId}/close`, {
    token: agent.token,
    body: {
      payment: {
        method: 'via_link',
        linkUrl: 'https://pay.example.com/p46',
      },
    },
  });
  const assign = await req('PATCH', `/handover/${leadId}/assign`, {
    token: cst.token,
    body: { techId: techA.userId },
  });

  // —— TC1 Assignment visibility ——
  const projectsA = await req('GET', '/handover/my-projects', {
    token: techA.token,
  });
  const visible = (projectsA.data?.data?.leads || []).find(
    (l) => l._id === leadId
  );
  const assignedOk =
    assign.status === 200 &&
    projectsA.status === 200 &&
    visible &&
    visible.handover?.cstStatus === 'assigned' &&
    ui.fetchesMyProjects;

  if (assignedOk) {
    pass(
      1,
      'Assignment visibility',
      'after CST assign, techA GET /my-projects includes project at cstStatus=assigned'
    );
  } else {
    fail(
      1,
      'Assignment visibility',
      `assign=${assign.status} projects=${projectsA.status} found=${Boolean(visible)} status=${visible?.handover?.cstStatus}`
    );
  }

  // —— TC2 Milestone advance (Next through stepper) ——
  const toInProgress = await req('PATCH', `/handover/${leadId}/milestone`, {
    token: techA.token,
    body: { milestone: 'in_progress' },
  });
  const afterIp = await req('GET', '/handover/my-projects', {
    token: techA.token,
  });
  const ipRow = (afterIp.data?.data?.leads || []).find((l) => l._id === leadId);
  const dbIp = await Lead.findById(leadId).lean();

  const advanceOk =
    toInProgress.status === 200 &&
    toInProgress.data?.data?.lead?.handover?.cstStatus === 'in_progress' &&
    ipRow?.handover?.cstStatus === 'in_progress' &&
    dbIp?.handover?.cstStatus === 'in_progress' &&
    ui.hasNextButton &&
    ui.disablesWhilePending &&
    ui.stepsAssignedInProgressCompleted;

  if (advanceOk) {
    pass(
      2,
      'Milestone advance',
      'assigned → in_progress via PATCH; persists on my-projects refetch + DB; Next disabled while pending'
    );
  } else {
    fail(
      2,
      'Milestone advance',
      `patch=${toInProgress.status} row=${ipRow?.handover?.cstStatus} db=${dbIp?.handover?.cstStatus}`
    );
  }

  // —— TC3 Isolation ——
  const projectsB = await req('GET', '/handover/my-projects', {
    token: techB.token,
  });
  const leak = (projectsB.data?.data?.leads || []).some(
    (l) => l._id === leadId
  );
  const foreignMilestone = await req('PATCH', `/handover/${leadId}/milestone`, {
    token: techB.token,
    body: { milestone: 'completed' },
  });

  if (
    projectsB.status === 200 &&
    !leak &&
    foreignMilestone.status === 403
  ) {
    pass(
      3,
      'Isolation',
      'techB my-projects excludes techA project; techB milestone PATCH → 403'
    );
  } else {
    fail(
      3,
      'Isolation',
      `leak=${leak} foreignStatus=${foreignMilestone.status} projectsB=${projectsB.status}`
    );
  }

  // —— TC4 Completion reflected ——
  const toCompleted = await req('PATCH', `/handover/${leadId}/milestone`, {
    token: techA.token,
    body: { milestone: 'completed' },
  });
  const dbDone = await Lead.findById(leadId).lean();
  const queue = await req('GET', '/handover/queue', { token: cst.token });
  const stillPending = (queue.data?.data?.leads || []).some(
    (l) => l._id === leadId
  );
  const projectsDone = await req('GET', '/handover/my-projects', {
    token: techA.token,
  });
  const doneRow = (projectsDone.data?.data?.leads || []).find(
    (l) => l._id === leadId
  );

  // Super admin can still see lead via all leads; verify completed status on document
  // CST pending queue must not include it; my-projects still lists assigned projects
  // including completed ones (getMyProjects filters by assignedTechId only)
  const completionOk =
    toCompleted.status === 200 &&
    dbDone?.handover?.cstStatus === 'completed' &&
    Boolean(dbDone?.handover?.completedAt) &&
    doneRow?.handover?.cstStatus === 'completed' &&
    !stillPending;

  if (completionOk) {
    pass(
      4,
      'Completion reflected',
      'cstStatus=completed (+ completedAt); absent from CST pending_review queue; persists on my-projects'
    );
  } else {
    fail(
      4,
      'Completion reflected',
      `patch=${toCompleted.status} db=${dbDone?.handover?.cstStatus} row=${doneRow?.handover?.cstStatus} stillPending=${stillPending}`
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
