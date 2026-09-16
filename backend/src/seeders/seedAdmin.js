import path from 'path';
import { pathToFileURL } from 'url';
import User from '../models/user.model.js';
import env from '../config/env.config.js';
import connectDB from '../config/db.config.js';

const seedAdmin = async () => {
  await User.updateOne({ isAdmin: true, role: 'admin' }, { $set: { role: 'super_admin' } });
  console.log("Migrated legacy Super Admin account to role 'super_admin' (if applicable).");

  const existingAdmin = await User.findOne({ isAdmin: true });

  if (existingAdmin) {
    console.log('Admin account already exists — skipping seed.');
    return;
  }

  await User.create({
    fullName: env.ADMIN_NAME,
    email: env.ADMIN_EMAIL,
    phone: 'N/A',
    password: env.ADMIN_PASSWORD,
    role: 'super_admin',
    status: 'approved',
    isAdmin: true,
  });

  console.log('Super Admin account created successfully.');
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
