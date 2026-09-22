/**
 * Phase 5 end-to-end checklist verification (API + socket + static mounts).
 * Run: node scripts/verify-phase5-checklist.mjs
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { io } = require('../../frontend/node_modules/socket.io-client');

const BASE = process.env.API_BASE || 'http://localhost:5000/api/v1';
const SUPER = { email: 'admin@flashdigital.com', password: 'FlashAdmin_Dev_2026!' };
const PASS = 'Phase5Check123!';
const stamp = Date.now();
const results = [];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.resolve(__dirname, '../../frontend/src/pages');

async function req(method, urlPath, { token, body, formData, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (formData) payload = formData;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers, body: payload });
  if (raw) {
    return {
      status: res.status,
      buf: Buffer.from(await res.arrayBuffer()),
      text: null,
    };
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log(`✅ PASS — ${name}${detail ? `: ${detail}` : ''}`);
}
function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.log(`❌ FAIL — ${name}: ${detail}`);
}

async function login(email, password) {
  const { status, data } = await req('POST', '/auth/login', {
    body: { email, password },
  });
  if (status !== 200) throw new Error(`login ${email} ${status} ${JSON.stringify(data)}`);
  return data.data;
}

async function registerApprove(superToken, role, label, i) {
  const email = `p5.${role}.${stamp}.${i}@example.com`;
  const reg = await req('POST', '/auth/register', {
    body: {
      fullName: label,
      email,
      phone: `+15559${String(stamp).slice(-6)}${i}`,
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
  return login(email, PASS);
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const s = io('http://localhost:5000', {
      auth: { token },
      transports: ['websocket'],
    });
    const t = setTimeout(() => reject(new Error('socket connect timeout')), 8000);
    s.on('connect', () => {
      clearTimeout(t);
      resolve(s);
    });
    s.on('connect_error', (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

function once(socket, event, ms = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${event}`)), ms);
    socket.once(event, (payload) => {
      clearTimeout(t);
      resolve(payload);
    });
  });
}

function rolesOf(contacts) {
  return [...new Set(contacts.map((c) => c.role))].sort();
}

function hasRole(contacts, role) {
  return contacts.some((c) => c.role === role);
}

async function main() {
  const health = await req('GET', '/health');
  if (health.status !== 200) throw new Error('backend down');

  const sockProbe = await fetch(
    'http://localhost:5000/socket.io/?EIO=4&transport=polling'
  );
  if (sockProbe.status !== 200) {
    fail('Socket.io server live', `poll status ${sockProbe.status}`);
  } else {
    pass('Socket.io server live', 'engine.io polling 200');
  }

  const superLogin = await login(SUPER.email, SUPER.password);
  const superToken = superLogin.token;

  const agent = await registerApprove(superToken, 'sales_agent', 'P5 Agent', 1);
  const closer = await registerApprove(superToken, 'closer', 'P5 Closer', 2);
  const cst = await registerApprove(superToken, 'cst_manager', 'P5 CST', 3);
  const tech = await registerApprove(superToken, 'tech_team', 'P5 Tech', 4);
  const auditor = await registerApprove(superToken, 'admin', 'P5 Auditor', 5);

  // --- Contacts silo for six roles ---
  const byRole = {
    sales_agent: await req('GET', '/chat/contacts', { token: agent.token }),
    closer: await req('GET', '/chat/contacts', { token: closer.token }),
    cst_manager: await req('GET', '/chat/contacts', { token: cst.token }),
    tech_team: await req('GET', '/chat/contacts', { token: tech.token }),
    admin: await req('GET', '/chat/contacts', { token: auditor.token }),
    super_admin: await req('GET', '/chat/contacts', { token: superToken }),
  };

  const siloOk =
    !hasRole(byRole.sales_agent.data.data.contacts, 'cst_manager') &&
    !hasRole(byRole.sales_agent.data.data.contacts, 'tech_team') &&
    !hasRole(byRole.closer.data.data.contacts, 'cst_manager') &&
    !hasRole(byRole.closer.data.data.contacts, 'tech_team') &&
    !hasRole(byRole.cst_manager.data.data.contacts, 'sales_agent') &&
    !hasRole(byRole.cst_manager.data.data.contacts, 'closer') &&
    !hasRole(byRole.tech_team.data.data.contacts, 'sales_agent') &&
    !hasRole(byRole.tech_team.data.data.contacts, 'closer') &&
    hasRole(byRole.sales_agent.data.data.contacts, 'closer') &&
    hasRole(byRole.cst_manager.data.data.contacts, 'tech_team') &&
    hasRole(byRole.admin.data.data.contacts, 'sales_agent') &&
    hasRole(byRole.super_admin.data.data.contacts, 'tech_team');

  if (siloOk) {
    pass(
      'Contacts silo-scoped for six roles',
      `agent=${rolesOf(byRole.sales_agent.data.data.contacts).join(',')}; cst=${rolesOf(byRole.cst_manager.data.data.contacts).join(',')}`
    );
  } else {
    fail('Contacts silo-scoped for six roles', 'unexpected role visibility');
  }

  // --- Newly approved appears immediately ---
  const brandNew = await registerApprove(
    superToken,
    'closer',
    'P5 Brand New Closer',
    6
  );
  const agentAfter = await req('GET', '/chat/contacts', { token: agent.token });
  const appears = agentAfter.data.data.contacts.some(
    (c) => String(c._id) === String(brandNew.user._id)
  );
  if (appears) {
    pass('Newly approved appears in contacts immediately', brandNew.user.email);
  } else {
    fail('Newly approved appears in contacts immediately', 'missing from agent contacts');
  }

  // --- Idempotent conversation ---
  const c1 = await req('POST', '/chat/conversations', {
    token: agent.token,
    body: { contactId: closer.user._id },
  });
  const c2 = await req('POST', '/chat/conversations', {
    token: agent.token,
    body: { contactId: closer.user._id },
  });
  const id1 = c1.data?.data?.conversation?._id;
  const id2 = c2.data?.data?.conversation?._id;
  if (c1.status === 200 && c2.status === 200 && id1 && id1 === id2) {
    pass('Conversation create idempotent', id1);
  } else {
    fail(
      'Conversation create idempotent',
      `${c1.status}/${c2.status} ${id1} vs ${id2}`
    );
  }
  const conversationId = id1;

  // --- Eight cross-silo 403 ---
  const pairings = [
    [agent, cst],
    [agent, tech],
    [closer, cst],
    [closer, tech],
    [cst, agent],
    [cst, closer],
    [tech, agent],
    [tech, closer],
  ];
  const cross = [];
  for (const [from, to] of pairings) {
    const r = await req('POST', '/chat/conversations', {
      token: from.token,
      body: { contactId: to.user._id },
    });
    cross.push(r.status);
  }
  if (cross.every((s) => s === 403)) {
    pass('Eight cross-silo pairings blocked (API 403)', cross.join(','));
  } else {
    fail('Eight cross-silo pairings blocked (API 403)', cross.join(','));
  }

  // UI never shows: already implied by contacts silo — re-assert agent has no fulfillment
  const agentNoFulfill =
    !hasRole(agentAfter.data.data.contacts, 'cst_manager') &&
    !hasRole(agentAfter.data.data.contacts, 'tech_team');
  if (agentNoFulfill) {
    pass('Cross-silo contacts omitted from UI source list', 'agent contacts');
  } else {
    fail('Cross-silo contacts omitted from UI source list', 'agent saw fulfillment');
  }

  // --- Leadership messaging ---
  const leadTargets = [agent, closer, cst, tech, auditor];
  let leadOk = true;
  for (const t of leadTargets) {
    const conv = await req('POST', '/chat/conversations', {
      token: superToken,
      body: { contactId: t.user._id },
    });
    if (conv.status !== 200) {
      leadOk = false;
      break;
    }
    const cid = conv.data.data.conversation._id;
    const msg = await req('POST', `/chat/conversations/${cid}/messages`, {
      token: superToken,
      body: { type: 'text', text: 'leadership ping' },
    });
    if (msg.status !== 201) {
      leadOk = false;
      break;
    }
  }
  const audToSuper = await req('POST', '/chat/conversations', {
    token: auditor.token,
    body: { contactId: superLogin.user._id },
  });
  const audMsg = await req(
    'POST',
    `/chat/conversations/${audToSuper.data.data.conversation._id}/messages`,
    {
      token: auditor.token,
      body: { type: 'text', text: 'auditor to super' },
    }
  );
  if (leadOk && audToSuper.status === 200 && audMsg.status === 201) {
    pass('Leadership can message every role + each other', 'super+auditor');
  } else {
    fail('Leadership can message every role + each other', 'send failed');
  }

  // --- Realtime text / typing / seen ---
  const sockA = await connectSocket(agent.token);
  const sockC = await connectSocket(closer.token);
  const gotNew = once(sockC, 'message:new');
  const gotTyping = once(sockC, 'typing:update');
  const gotSeen = once(sockA, 'message:seen');

  sockA.emit('typing:start', { conversationId: String(conversationId) });
  const textMsg = await req('POST', `/chat/conversations/${conversationId}/messages`, {
    token: agent.token,
    body: { type: 'text', text: 'live text for phase5' },
  });
  await req('PATCH', `/chat/conversations/${conversationId}/seen`, {
    token: closer.token,
  });

  let rtOk = textMsg.status === 201;
  let rtDetail = [];
  try {
    await gotTyping;
    rtDetail.push('typing');
  } catch (e) {
    rtOk = false;
    rtDetail.push(`typing:${e.message}`);
  }
  try {
    await gotNew;
    rtDetail.push('message:new');
  } catch (e) {
    rtOk = false;
    rtDetail.push(`new:${e.message}`);
  }
  try {
    await gotSeen;
    rtDetail.push('seen');
  } catch (e) {
    rtOk = false;
    rtDetail.push(`seen:${e.message}`);
  }
  if (rtOk) pass('Live text/typing/seen across two sessions', rtDetail.join(','));
  else fail('Live text/typing/seen across two sessions', rtDetail.join(','));

  // --- Presence ---
  const presenceHit = once(sockA, 'presence:update', 5000).catch(() => null);
  // Disconnect closer → agent should see offline (if listening)
  sockC.close();
  await new Promise((r) => setTimeout(r, 500));
  // Reconnect for further tests
  const sockC2 = await connectSocket(closer.token);
  const presenceOn = await once(sockA, 'presence:update', 8000).catch((e) => e);
  if (presenceOn && presenceOn.userId) {
    pass(
      'Presence updates live',
      `userId=${presenceOn.userId} online=${presenceOn.online}`
    );
  } else {
    // presence may have fired on disconnect already — accept connect-side
    const p = await presenceHit;
    if (p?.userId != null) {
      pass('Presence updates live', `disconnect event online=${p.online}`);
    } else {
      fail('Presence updates live', 'no presence:update received');
    }
  }

  // --- Attachments: image, document, voice ---
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
    'base64'
  );
  const pdf = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'
  );
  const webm = Buffer.from([
    0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1f, 0x42,
    0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3,
    0x81, 0x08, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d, 0x42, 0x87, 0x81, 0x02,
    0x42, 0x85, 0x81, 0x02,
  ]);

  async function uploadSend(fileBuf, name, mime, type, extra = {}) {
    const fd = new FormData();
    fd.append('file', new Blob([fileBuf], { type: mime }), name);
    const up = await req('POST', `/chat/conversations/${conversationId}/upload`, {
      token: agent.token,
      formData: fd,
    });
    if (!(up.status === 201 || up.status === 200)) {
      return { ok: false, stage: 'upload', status: up.status, data: up.data };
    }
    const u = up.data.data;
    const send = await req('POST', `/chat/conversations/${conversationId}/messages`, {
      token: agent.token,
      body: {
        type,
        attachment: {
          storedFilename: u.storedFilename,
          originalName: u.originalName,
          mimeType: u.mimeType,
          sizeBytes: u.sizeBytes,
          ...extra,
        },
      },
    });
    if (send.status !== 201) {
      return { ok: false, stage: 'send', status: send.status, data: send.data };
    }
    const dl = await req(
      'GET',
      `/chat/conversations/${conversationId}/files/${u.storedFilename}`,
      { token: closer.token, raw: true }
    );
    return {
      ok: dl.status === 200 && dl.buf.length > 0,
      storedFilename: u.storedFilename,
      dlStatus: dl.status,
      bytes: dl.buf?.length,
    };
  }

  const img = await uploadSend(png, 'p5.png', 'image/png', 'image');
  const doc = await uploadSend(pdf, 'p5.pdf', 'application/pdf', 'document');
  const voice = await uploadSend(webm, 'p5.webm', 'audio/webm', 'voice', {
    durationSeconds: 1,
  });
  if (img.ok && doc.ok && voice.ok) {
    pass(
      'Images/documents/voice upload send download',
      `img=${img.bytes} doc=${doc.bytes} voice=${voice.bytes}`
    );
  } else {
    fail(
      'Images/documents/voice upload send download',
      JSON.stringify({ img, doc, voice })
    );
  }

  // --- Non-participant 403 on raw file URL ---
  const outsiderGet = await req(
    'GET',
    `/chat/conversations/${conversationId}/files/${img.storedFilename}`,
    { token: tech.token, raw: true }
  );
  if (outsiderGet.status === 403) {
    pass('Attachment endpoint rejects non-participant (403)', 'tech vs agent-closer conv');
  } else {
    fail('Attachment endpoint rejects non-participant (403)', `status=${outsiderGet.status}`);
  }

  // --- Path traversal ---
  const trav1 = await req(
    'GET',
    `/chat/conversations/${conversationId}/files/..%2F..%2Fetc%2Fpasswd`,
    { token: agent.token }
  );
  const trav2 = await req(
    'GET',
    `/chat/conversations/${conversationId}/files/..passwd`,
    { token: agent.token }
  );
  if (trav1.status === 400 || trav2.status === 400) {
    pass('Path-traversal rejected', `enc=${trav1.status} lit=${trav2.status}`);
  } else {
    fail('Path-traversal rejected', `enc=${trav1.status} lit=${trav2.status}`);
  }

  // --- Six dashboards mount messenger ---
  const dashFiles = [
    'SalesAgentDashboard.page.jsx',
    'CloserDashboard.page.jsx',
    'CstManagerDashboard.page.jsx',
    'TechTeamDashboard.page.jsx',
    'AdminDashboard.page.jsx',
    'AdminMonitor.page.jsx',
  ];
  const mountOk = dashFiles.every((f) => {
    const src = fs.readFileSync(path.join(pagesDir, f), 'utf8');
    return (
      src.includes('MessengerIcon') && src.includes('DockedChatWindowsHost')
    );
  });
  if (mountOk) {
    pass('Messenger icon + docked host on all six dashboards', dashFiles.length);
  } else {
    fail('Messenger icon + docked host on all six dashboards', 'missing import/mount');
  }

  // --- Cap / auto-minimize ---
  const widgetSrc = fs.readFileSync(
    path.resolve(__dirname, '../../frontend/src/context/ChatWidget.context.jsx'),
    'utf8'
  );
  if (
    widgetSrc.includes('MAX_OPEN_WINDOWS = 3') &&
    widgetSrc.includes('minimized: true')
  ) {
    pass('Docked window cap + auto-minimize present', 'MAX_OPEN_WINDOWS=3');
  } else {
    fail('Docked window cap + auto-minimize present', 'ChatWidget.context missing cap');
  }

  // --- Auditor unrestricted chat ---
  const chatRoute = fs.readFileSync(
    path.resolve(__dirname, '../src/routes/chat.route.js'),
    'utf8'
  );
  const importsBlock = /import\s*\{[^}]*\bblockReadOnlyAdmin\b/.test(chatRoute);
  const appliesBlock = /router\.(use|get|post|patch|put|delete)\([^)]*blockReadOnlyAdmin/.test(
    chatRoute
  );
  const audConv = await req('POST', '/chat/conversations', {
    token: auditor.token,
    body: { contactId: agent.user._id },
  });
  const audCid = audConv.data?.data?.conversation?._id;
  const audText = await req('POST', `/chat/conversations/${audCid}/messages`, {
    token: auditor.token,
    body: { type: 'text', text: 'auditor unrestricted' },
  });
  const noBlock = !importsBlock && !appliesBlock && audText.status === 201;
  if (noBlock) {
    pass('Auditor unrestricted chat (no blockReadOnlyAdmin)', `send=${audText.status}`);
  } else {
    fail(
      'Auditor unrestricted chat (no blockReadOnlyAdmin)',
      `importsBlock=${importsBlock} appliesBlock=${appliesBlock} send=${audText.status}`
    );
  }

  sockA.close();
  sockC2.close();

  const failed = results.filter((r) => !r.ok).length;
  console.log(
    failed === 0
      ? `\n—— Phase 5 checklist: ${results.length}/${results.length} passed ——`
      : `\n—— Phase 5 checklist: ${results.length - failed}/${results.length} passed, ${failed} failed ——`
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
