const path = require('path');
const dotenv = require('dotenv');

// Load environment from both root and server directory if present
dotenv.config({ path: path.resolve(__dirname, '../../../.env'), override: false });
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: false });
dotenv.config({ override: false });

const { z } = require('zod');
const dns = require('dns');

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {}

// Accept MONGO_URI as an alias for MONGODB_URI
if (!process.env.MONGODB_URI && process.env.MONGO_URI) process.env.MONGODB_URI = process.env.MONGO_URI;

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/quizmaster'),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters')
    .default('quizmaster_super_secure_jwt_token_secret_key_2026_at_least_32_chars'),
  JWT_EXPIRES_HOURS: z.coerce.number().min(0.25).max(72).default(8),
  CLIENT_URL: z.string().default('http://localhost:3000'),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_DOMAIN: z.string().optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(10),
  SUBMIT_GRACE_SECONDS: z.coerce.number().min(0).max(30).default(5),
  MAX_LOGIN_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
  LOCKOUT_MINUTES: z.coerce.number().min(1).max(240).default(15),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('\n[config] Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  console.error('\nSee server/.env.example\n');
  process.exit(1);
}

const env = parsed.data;
env.isProd = env.NODE_ENV === 'production';
env.clientOrigins = env.CLIENT_URL.split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

module.exports = env;
