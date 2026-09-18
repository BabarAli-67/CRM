/**
 * Phase 5.4 chat upload/serve verification
 * Run: node scripts/verify-chat-upload.mjs
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const BASE = process.env.API_BASE || 'http://localhost:5000/api/v1';
const SUPER = {
  email: 'admin@flashdigital.com',
  password: 'FlashAdmin_Dev_2026!',
};
const PASS = 'ChatUpload123!';
const stamp = Date.now();
const results = [];

async function req(method, urlPath, { token, body, formData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: payload,
  });
  const contentType = res.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    const buf = Buffer.from(await res.arrayBuffer());
    data = { bytes: buf.length, contentType };
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
    throw new Error(`Login failed for ${email}: ${status}`);
  }
  return { token: data.data.token, user: data.data.user };
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
    throw new Error(`Register failed ${email}: ${reg.status}`);
  }
  const userId = reg.data?.data?.user?._id;
  const approve = await req('PATCH', `/admin/users/${userId}/approve`, {
    token: superToken,
    body: { role },
  });
  if (approve.status !== 200) {
    throw new Error(`Approve failed ${email}: ${approve.status}`);
  }
  return login(email, PASS);
}

/** Minimal 1x1 PNG */
function writeTestPng() {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  const filePath = path.join(os.tmpdir(), `chat-upload-${stamp}.png`);
  fs.writeFileSync(filePath, png);
  return filePath;
}

async function main() {
  const health = await req('GET', '/health');
  if (health.status !== 200) throw new Error('Backend not reachable');

  const { token: superToken } = await login(SUPER.email, SUPER.password);
  const agent = await registerAndApprove(superToken, {
    fullName: 'Upload Agent',
    email: `upload.agent.${stamp}@example.com`,
    role: 'sales_agent',
  });
  const closer = await registerAndApprove(superToken, {
    fullName: 'Upload Closer',
    email: `upload.closer.${stamp}@example.com`,
    role: 'closer',
  });
  const outsider = await registerAndApprove(superToken, {
    fullName: 'Upload Outsider',
    email: `upload.outsider.${stamp}@example.com`,
    role: 'sales_agent',
  });

  const convo = await req('POST', '/chat/conversations', {
    token: agent.token,
    body: { contactId: closer.user._id },
  });
  const conversationId = convo.data?.data?.conversation?._id;
  if (convo.status !== 200 || !conversationId) {
    throw new Error('Failed to create conversation');
  }

  const pngPath = writeTestPng();
  const form = new FormData();
  const blob = new Blob([fs.readFileSync(pngPath)], { type: 'image/png' });
  form.append('file', blob, 'test-pixel.png');

  // 1. Upload
  const upload = await req('POST', `/chat/conversations/${conversationId}/upload`, {
    token: agent.token,
    formData: form,
  });
  const meta = upload.data?.data;
  if (upload.status === 201 && meta?.storedFilename) {
    pass(1, 'Upload image', `storedFilename=${meta.storedFilename}`);
  } else {
    fail(1, 'Upload image', `${upload.status} ${JSON.stringify(upload.data)}`);
  }

  // 2. Post image message with attachment metadata
  const send = await req('POST', `/chat/conversations/${conversationId}/messages`, {
    token: agent.token,
    body: {
      type: 'image',
      attachment: {
        storedFilename: meta?.storedFilename,
        originalName: meta?.originalName,
        mimeType: meta?.mimeType,
        sizeBytes: meta?.sizeBytes,
      },
    },
  });
  if (send.status === 201 && send.data?.data?.message?.type === 'image') {
    pass(2, 'Post image message', `id=${send.data.data.message._id}`);
  } else {
    fail(2, 'Post image message', `${send.status} ${JSON.stringify(send.data)}`);
  }

  // 3. Participant can download
  const download = await req(
    'GET',
    `/chat/conversations/${conversationId}/files/${meta?.storedFilename}`,
    { token: agent.token }
  );
  if (download.status === 200 && download.data?.bytes > 0) {
    pass(
      3,
      'Agent download attachment',
      `${download.data.bytes} bytes (${download.data.contentType})`
    );
  } else {
    fail(3, 'Agent download attachment', `${download.status}`);
  }

  // 4. Path traversal rejected
  const traversal = await req(
    'GET',
    `/chat/conversations/${conversationId}/files/..%2F..%2Fpackage.json`,
    { token: agent.token }
  );
  // Express may decode; also try raw pattern that includes ..
  const traversal2 = await req(
    'GET',
    `/chat/conversations/${conversationId}/files/..\\secret.png`,
    { token: agent.token }
  );
  if (traversal.status === 400 || traversal2.status === 400) {
    pass(4, 'Path traversal blocked', `statuses=${traversal.status},${traversal2.status}`);
  } else {
    // If Express rejects route match with 404, still acceptable as not served
    fail(
      4,
      'Path traversal blocked',
      `expected 400, got ${traversal.status}/${traversal2.status}`
    );
  }

  // 5. Non-participant blocked
  const blocked = await req(
    'GET',
    `/chat/conversations/${conversationId}/files/${meta?.storedFilename}`,
    { token: outsider.token }
  );
  if (blocked.status === 403) {
    pass(5, 'Non-participant download blocked', '403');
  } else {
    fail(5, 'Non-participant download blocked', `status=${blocked.status}`);
  }

  // 6. Closer (participant) can download
  const closerDl = await req(
    'GET',
    `/chat/conversations/${conversationId}/files/${meta?.storedFilename}`,
    { token: closer.token }
  );
  if (closerDl.status === 200 && closerDl.data?.bytes > 0) {
    pass(6, 'Closer download attachment', `${closerDl.data.bytes} bytes`);
  } else {
    fail(6, 'Closer download attachment', `status=${closerDl.status}`);
  }

  try {
    fs.unlinkSync(pngPath);
  } catch {
    /* ignore */
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(
    failed === 0
      ? `\n—— Chat upload/serve: ${results.length}/${results.length} passed ——`
      : `\n—— Chat upload/serve: ${results.length - failed}/${results.length} passed, ${failed} failed ——`
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
