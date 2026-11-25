import 'dotenv/config';
import { cleanEnv, port, str, email } from 'envalid';

const env = cleanEnv(process.env, {
  PORT: port(),
  NODE_ENV: str({ choices: ['development', 'production', 'test'] }),
  MONGO_URI: str(),
  JWT_SECRET: str(),
  JWT_EXPIRES_IN: str(),
  ADMIN_NAME: str(),
  /** Login username for the seeded Super Admin (case-insensitive). */
  ADMIN_USERNAME: str({ default: 'admin' }),
  /** Legacy seed lookup only — auth no longer uses email. */
  ADMIN_EMAIL: email({ default: 'admin@flashdigital.com' }),
  ADMIN_PASSWORD: str(),
  /**
   * Admin (Auditor) — env-provisioned only (never public register).
   * Prefer AUDITOR_USERNAME; AUDITOR_EMAIL local-part used as fallback username.
   */
  AUDITOR_NAME: str({ default: 'Admin Auditor' }),
  AUDITOR_USERNAME: str({ default: '' }),
  AUDITOR_EMAIL: str({ default: '' }),
  AUDITOR_PASSWORD: str(),
  /**
   * Tech Head — env-provisioned only (never public register).
   * Prefer TECH_HEAD_USERNAME; TECH_HEAD_EMAIL local-part used as fallback username.
   */
  TECH_HEAD_NAME: str({ default: 'Tech Head' }),
  TECH_HEAD_USERNAME: str({ default: '' }),
  TECH_HEAD_EMAIL: str({ default: '' }),
  TECH_HEAD_PASSWORD: str(),
  CORS_ORIGIN: str(),
});

export default env;
