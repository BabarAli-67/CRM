import path from 'path';
import { pathToFileURL } from 'url';
import User from '../models/user.model.js';
import env from '../config/env.config.js';
import connectDB from '../config/db.config.js';

const usernameFromEmail = (email) => {
  const local = String(email || '')
    .trim()
    .toLowerCase()
    .split('@')[0]
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 28);
  return local.length >= 3 ? local : '';
};

const resolveUsername = (explicit, emailFallback, defaultName) => {
  const fromExplicit = String(explicit || '')
    .trim()
    .toLowerCase();
  if (fromExplicit) return fromExplicit;
  const fromEmail = usernameFromEmail(emailFallback);
  if (fromEmail) return fromEmail;
  return defaultName;
};

/**
 * Upsert an env-controlled privileged account (password synced from .env on startup).
 */
const ensureEnvProvisionedUser = async ({
  username,
  fullName,
  password,
  role,
  isAdmin = false,
  email = null,
}) => {
  const uname = String(username || '')
    .trim()
    .toLowerCase();
  if (!uname || !password) {
    console.warn(
      `Skipping env seed for role '${role}' — username/password not configured.`
    );
    return;
  }

  let user =
    (await User.findOne({ username: uname }).select('+password')) ||
    (await User.findOne({ role, isAdmin }).select('+password'));

  if (!user) {
    await User.create({
      fullName: fullName || role,
      username: uname,
      phone: 'N/A',
      email: email || undefined,
      password,
      role,
      requestedRole: role,
      status: 'approved',
      isAdmin: Boolean(isAdmin),
    });
    console.log(
      `Env-provisioned ${role} created (username: ${uname}).`
    );
    return;
  }

  user.fullName = fullName || user.fullName;
  user.username = uname;
  user.password = password;
  user.role = role;
  user.status = 'approved';
  user.isAdmin = Boolean(isAdmin);
  if (email) user.email = String(email).trim().toLowerCase();
  await user.save();
  console.log(
    `Env-provisioned ${role} synced from .env (username: ${uname}).`
  );
};

const seedAdmin = async () => {
  await User.updateOne(
    { isAdmin: true, role: 'admin' },
    { $set: { role: 'super_admin' } }
  );
  console.log(
    "Migrated legacy Super Admin account to role 'super_admin' (if applicable)."
  );

  try {
    await User.collection.dropIndex('email_1');
    console.log('Dropped legacy email_1 index.');
  } catch {
    /* index may not exist */
  }

  const adminUsername = (env.ADMIN_USERNAME || 'admin').toLowerCase().trim();

  const existingAdmin =
    (await User.findOne({ username: adminUsername })) ||
    (await User.findOne({ role: 'super_admin' })) ||
    (await User.findOne({ isAdmin: true })) ||
    (await User.collection.findOne({ email: env.ADMIN_EMAIL }));

  if (existingAdmin) {
    const id = existingAdmin._id;
    const hasUsername = Boolean(existingAdmin.username);

    if (!hasUsername) {
      await User.collection.updateOne(
        { _id: id },
        {
          $set: {
            username: adminUsername,
            role: 'super_admin',
            status: 'approved',
            isAdmin: true,
          },
          $unset: { email: 1 },
        }
      );
      console.log(
        `Assigned username "${adminUsername}" to existing Super Admin.`
      );
    } else {
      // Keep Super Admin password in sync with .env (exclusive bootstrap).
      const sa = await User.findById(id).select('+password');
      if (sa) {
        sa.fullName = env.ADMIN_NAME || sa.fullName;
        sa.username = adminUsername;
        sa.password = env.ADMIN_PASSWORD;
        sa.role = 'super_admin';
        sa.status = 'approved';
        sa.isAdmin = true;
        await sa.save();
        console.log(
          `Super Admin synced from .env (username: ${adminUsername}).`
        );
      }
    }
  } else {
    await User.create({
      fullName: env.ADMIN_NAME,
      username: adminUsername,
      phone: 'N/A',
      password: env.ADMIN_PASSWORD,
      role: 'super_admin',
      status: 'approved',
      isAdmin: true,
    });
    console.log(
      `Super Admin account created successfully (username: ${adminUsername}).`
    );
  }

  // Admin (Auditor) — never public register
  await ensureEnvProvisionedUser({
    username: resolveUsername(
      env.AUDITOR_USERNAME,
      env.AUDITOR_EMAIL,
      'auditor'
    ),
    fullName: env.AUDITOR_NAME,
    password: env.AUDITOR_PASSWORD,
    role: 'admin',
    isAdmin: false,
    email: env.AUDITOR_EMAIL || null,
  });

  // Tech Head — never public register; creates Tech specialists in-app
  await ensureEnvProvisionedUser({
    username: resolveUsername(
      env.TECH_HEAD_USERNAME,
      env.TECH_HEAD_EMAIL,
      'techhead'
    ),
    fullName: env.TECH_HEAD_NAME,
    password: env.TECH_HEAD_PASSWORD,
    role: 'tech_head',
    isAdmin: false,
    email: env.TECH_HEAD_EMAIL || null,
  });
};

export default seedAdmin;

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  try {
    await connectDB();
    await seedAdmin();
    process.exit(0);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
