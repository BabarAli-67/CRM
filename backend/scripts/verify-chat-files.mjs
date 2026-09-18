/**
 * Phase 5.4.3 chat attachment serve verification
 * Run: node scripts/verify-chat-files.mjs
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const BASE = process.env.API_BASE || 'http://localhost:5000/api/v1';
const SUPER = {
  email: 'admin@flashdigital.com',
  password: 'FlashAdmin_Dev_2026!',
};
const PASS = 'ChatFileVerify123!';
const stamp = Date.now();
const results = [];

async function req(method, urlPath, { token, body, formData, raw } = {}) {
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
  if (raw) {
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, buf, contentType: res.headers.get('content-type') };
  }
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
    throw new Error(`Login failed ${email}: ${status} ${JSON.stringify(data)}`);
  }
  return { token: data.data.token, user: data.data.user };
}

async function registerAndApprove(superToken, { fullName, email, role, phoneSuffix }) {
  const reg = await req('POST', '/auth/register', {
    body: {
      fullName,
      email,
      phone: `+1555${phoneSuffix}`,
      password: PASS,
    },
  });
  if (reg.status !== 201) {
    throw new Error(`Register ${email}: ${reg.status} ${JSON.stringify(reg.data)}`);
  }
  const userId = reg.data?.data?.user?._id;
  const approve = await req('PATCH', `/admin/users/${userId}/approve`, {
    token: superToken,
    body: { role },
  });
  if (approve.status !== 200) {
    throw new Error(`Approve ${email}: ${approve.status} ${JSON.stringify(approve.data)}`);
  }
  return login(email, PASS);
}

/** Minimal valid 1x1 JPEG */
function writeTinyJpeg(filePath) {
  const jpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z',
    'base64'
  );
  fs.writeFileSync(filePath, jpeg);
  return jpeg.length;
}

async function main() {
  const health = await req('GET', '/health');
  if (health.status !== 200) throw new Error('Backend not up');

  const { token: superToken } = await login(SUPER.email, SUPER.password);
  const agent = await registerAndApprove(superToken, {
    fullName: 'File Agent',
    email: `file.agent.${stamp}@example.com`,
    role: 'sales_agent',
    phoneSuffix: String(stamp).slice(-7),
  });
  const closer = await registerAndApprove(superToken, {
    fullName: 'File Closer',
    email: `file.closer.${stamp}@example.com`,
    role: 'closer',
    phoneSuffix: String(Number(String(stamp).slice(-7)) + 1).padStart(7, '0').slice(-7),
  });
  const outsider = await registerAndApprove(superToken, {
    fullName: 'File Outsider',
    email: `file.outsider.${stamp}@example.com`,
    role: 'sales_agent',
    phoneSuffix: String(Number(String(stamp).slice(-7)) + 2).padStart(7, '0').slice(-7),
  });

  const created = await req('POST', '/chat/conversations', {
    token: agent.token,
    body: { contactId: closer.user._id },
  });
  const conversationId = created.data?.data?.conversation?._id;
  if (!conversationId) {
    throw new Error(`No conversation: ${JSON.stringify(created)}`);
  }

  const tmp = path.join(os.tmpdir(), `chat-test-${stamp}.jpg`);
  const sizeBytes = writeTinyJpeg(tmp);

  // 1. Upload
  let storedFilename;
  {
    const form = new FormData();
    const blob = new Blob([fs.readFileSync(tmp)], { type: 'image/jpeg' });
    form.append('file', blob, 'test.jpg');
    const { status, data } = await req(
      'POST',
      `/chat/conversations/${conversationId}/upload`,
      { token: agent.token, formData: form }
    );
    storedFilename = data?.data?.storedFilename;
    if (status === 201 && storedFilename) {
      pass(1, 'Agent upload image', `storedFilename=${storedFilename}`);
    } else {
      fail(1, 'Agent upload image', `${status} ${JSON.stringify(data)}`);
    }
  }

  // 2. Send image message
  {
    const { status, data } = await req(
      'POST',
      `/chat/conversations/${conversationId}/messages`,
      {
        token: agent.token,
        body: {
          type: 'image',
          attachment: {
            storedFilename,
            originalName: 'test.jpg',
            mimeType: 'image/jpeg',
            sizeBytes,
          },
        },
      }
    );
    if (status === 201 && data?.data?.message?.type === 'image') {
      pass(2, 'Agent post image message', `id=${data.data.message._id}`);
    } else {
      fail(2, 'Agent post image message', `${status} ${JSON.stringify(data)}`);
    }
  }

  // 3. Closer downloads
  {
    const { status, buf, contentType } = await req(
      'GET',
      `/chat/conversations/${conversationId}/files/${storedFilename}`,
      { token: closer.token, raw: true }
    );
    if (status === 200 && buf?.length > 0) {
      pass(
        3,
        'Closer GET file',
        `bytes=${buf.length}; content-type=${contentType}`
      );
    } else {
      fail(3, 'Closer GET file', `status=${status} bytes=${buf?.length}`);
    }
  }

  // 4. Outsider blocked
  {
    const { status } = await req(
      'GET',
      `/chat/conversations/${conversationId}/files/${storedFilename}`,
      { token: outsider.token, raw: true }
    );
    if (status === 403) {
      pass(4, 'Non-participant GET file blocked', '403');
    } else {
      fail(4, 'Non-participant GET file blocked', `status=${status}`);
    }
  }

  // 5. Path traversal
  {
    const { status, data } = await req(
      'GET',
      `/chat/conversations/${conversationId}/files/..%2F..%2Fetc%2Fpasswd`,
      { token: agent.token }
    );
    // Also try a filename that clearly includes ".."
    const alt = await req(
      'GET',
      `/chat/conversations/${conversationId}/files/..passwd`,
      { token: agent.token }
    );
    if (status === 400 || alt.status === 400) {
      pass(
        5,
        'Path traversal rejected',
        `encoded=${status}; literalDotDot=${alt.status}`
      );
    } else {
      fail(
        5,
        'Path traversal rejected',
        `encoded=${status} ${JSON.stringify(data)}; literal=${alt.status}`
      );
    }
  }

  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(
    failed === 0
      ? `\n—— Chat files: ${results.length}/${results.length} passed ——`
      : `\n—— Chat files: ${results.length - failed}/${results.length} passed, ${failed} failed ——`
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
