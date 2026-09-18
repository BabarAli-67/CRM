/**
 * Phase 5.2 chat API verification — 7 cases
 * Run: node scripts/verify-chat-api.mjs
 */
import mongoose from 'mongoose';
import env from '../src/config/env.config.js';
import Conversation from '../src/models/conversation.model.js';
import Message from '../src/models/message.model.js';

const BASE = process.env.API_BASE || 'http://localhost:5000/api/v1';
const SUPER = {
  email: 'admin@flashdigital.com',
  password: 'FlashAdmin_Dev_2026!',
};
const PASS = 'ChatVerify123!';
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
    throw new Error(`Login failed for ${email}: ${status} ${JSON.stringify(data)}`);
  }
  return {
    token: data.data.token,
    user: data.data.user,
  };
}

async function registerAndApprove(superToken, { fullName, email, role }) {
  const reg = await req('POST', '/auth/register', {
    body: {
      fullName,
      email,
      phone: `+1555${String(stamp).slice(-7)}`,
      password: PASS,
    },
  });
  if (reg.status !== 201) {
    throw new Error(`Register failed ${email}: ${reg.status} ${JSON.stringify(reg.data)}`);
  }
  const userId = reg.data?.data?.user?._id;
  const approve = await req('PATCH', `/admin/users/${userId}/approve`, {
    token: superToken,
    body: { role },
  });
  if (approve.status !== 200) {
    throw new Error(`Approve failed ${email}: ${approve.status} ${JSON.stringify(approve.data)}`);
  }
  return login(email, PASS);
}

async function main() {
  const health = await req('GET', '/health');
  if (health.status !== 200) {
    throw new Error('Backend not reachable on /health');
  }

  const { token: superToken } = await login(SUPER.email, SUPER.password);

  const agent = await registerAndApprove(superToken, {
    fullName: 'Chat Agent',
    email: `chat.agent.${stamp}@example.com`,
    role: 'sales_agent',
  });
  const closer = await registerAndApprove(superToken, {
    fullName: 'Chat Closer',
    email: `chat.closer.${stamp}@example.com`,
    role: 'closer',
  });
  const tech = await registerAndApprove(superToken, {
    fullName: 'Chat Tech',
    email: `chat.tech.${stamp}@example.com`,
    role: 'tech_team',
  });
  const outsider = await registerAndApprove(superToken, {
    fullName: 'Chat Outsider',
    email: `chat.outsider.${stamp}@example.com`,
    role: 'sales_agent',
  });

  // 1. Contacts silo filter
  {
    const { status, data } = await req('GET', '/chat/contacts', {
      token: agent.token,
    });
    const contacts = data?.data?.contacts || [];
    const roles = contacts.map((c) => c.role);
    const hasSalesOrLeadership = roles.some((r) =>
      ['sales_agent', 'closer', 'super_admin', 'admin'].includes(r)
    );
    const hasFulfillment = roles.some((r) =>
      ['cst_manager', 'tech_team'].includes(r)
    );
    const includesCloser = contacts.some((c) => c._id === closer.user._id);
    if (
      status === 200 &&
      hasSalesOrLeadership &&
      !hasFulfillment &&
      includesCloser
    ) {
      pass(
        1,
        'Agent contacts silo',
        `${contacts.length} contacts; includes closer; no fulfillment`
      );
    } else {
      fail(
        1,
        'Agent contacts silo',
        `status=${status} count=${contacts.length} roles=${[...new Set(roles)].join(',')}`
      );
    }
  }

  // 2. Create conversation with closer
  let conversationId;
  {
    const { status, data } = await req('POST', '/chat/conversations', {
      token: agent.token,
      body: { contactId: closer.user._id },
    });
    conversationId = data?.data?.conversation?._id;
    if (status === 200 && conversationId) {
      pass(2, 'Create conversation with closer', `id=${conversationId}`);
    } else {
      fail(2, 'Create conversation with closer', `${status} ${JSON.stringify(data)}`);
    }
  }

  // 3. Idempotent create + DB count
  {
    const { status, data } = await req('POST', '/chat/conversations', {
      token: agent.token,
      body: { contactId: closer.user._id },
    });
    const id2 = data?.data?.conversation?._id;
    await mongoose.connect(env.MONGO_URI);
    const key = [String(agent.user._id), String(closer.user._id)].sort().join('_');
    const dbCount = await Conversation.countDocuments({ participantsKey: key });
    if (status === 200 && id2 === conversationId && dbCount === 1) {
      pass(3, 'Idempotent conversation upsert', `same id; dbCount=1`);
    } else {
      fail(
        3,
        'Idempotent conversation upsert',
        `status=${status} id2=${id2} expected=${conversationId} dbCount=${dbCount}`
      );
    }
  }

  // 4. Cross-silo blocked
  {
    const { status, data } = await req('POST', '/chat/conversations', {
      token: agent.token,
      body: { contactId: tech.user._id },
    });
    if (status === 403) {
      pass(4, 'Agent→Tech conversation blocked', data?.message || '403');
    } else {
      fail(4, 'Agent→Tech conversation blocked', `${status} ${JSON.stringify(data)}`);
    }
  }

  // 5. Send + list messages
  let messageId;
  {
    const send = await req('POST', `/chat/conversations/${conversationId}/messages`, {
      token: agent.token,
      body: { type: 'text', text: 'Hello closer from agent' },
    });
    messageId = send.data?.data?.message?._id;
    const list = await req('GET', `/chat/conversations/${conversationId}/messages`, {
      token: agent.token,
    });
    const messages = list.data?.data?.messages || [];
    const found = messages.some((m) => m._id === messageId);
    if (send.status === 201 && list.status === 200 && found) {
      pass(5, 'Send + list text message', `messageId=${messageId}`);
    } else {
      fail(
        5,
        'Send + list text message',
        `send=${send.status} list=${list.status} found=${found}`
      );
    }
  }

  // 6. Non-participant 403
  {
    const { status } = await req(
      'GET',
      `/chat/conversations/${conversationId}/messages`,
      { token: outsider.token }
    );
    if (status === 403) {
      pass(6, 'Non-participant messages blocked', '403');
    } else {
      fail(6, 'Non-participant messages blocked', `status=${status}`);
    }
  }

  // 7. Closer marks seen + DB
  {
    const { status, data } = await req(
      'PATCH',
      `/chat/conversations/${conversationId}/seen`,
      { token: closer.token }
    );
    const msg = await Message.findById(messageId).lean();
    if (status === 200 && msg?.seenAt) {
      pass(
        7,
        'Closer mark seen',
        `updatedCount=${data?.data?.updatedCount}; seenAt=${msg.seenAt}`
      );
    } else {
      fail(
        7,
        'Closer mark seen',
        `status=${status} seenAt=${msg?.seenAt} body=${JSON.stringify(data)}`
      );
    }
  }

  await mongoose.disconnect().catch(() => {});

  const failed = results.filter((r) => !r.ok).length;
  console.log(
    failed === 0
      ? `\n—— Chat API: ${results.length}/${results.length} passed ——`
      : `\n—— Chat API: ${results.length - failed}/${results.length} passed, ${failed} failed ——`
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
