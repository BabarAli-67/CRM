import path from 'path';
import { pathToFileURL } from 'url';
import User from '../models/user.model.js';
import env from '../config/env.config.js';
import connectDB from '../config/db.config.js';

const seedAdmin = async () => {
  await User.updateOne({ isAdmin: true, role: 'admin' }, { $set: { role: 'super_admin' } });
  console.log("Migrated legacy Super Admin account to role 'super_admin' (if applicable).");

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
      console.log(`Assigned username "${adminUsername}" to existing Super Admin.`);
    } else {
      // Ensure legacy email field is cleared so unique email index issues cannot return.
      await User.collection.updateOne({ _id: id }, { $unset: { email: 1 } });
      console.log('Admin account already exists — skipping seed.');
    }
    return;
  }

  await User.create({
    fullName: env.ADMIN_NAME,
    username: adminUsername,
    phone: 'N/A',
    password: env.ADMIN_PASSWORD,
    role: 'super_admin',
    status: 'approved',
    isAdmin: true,
  });

  console.log(`Super Admin account created successfully (username: ${adminUsername}).`);
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
