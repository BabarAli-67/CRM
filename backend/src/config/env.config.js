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
  CORS_ORIGIN: str(),
});

export default env;
