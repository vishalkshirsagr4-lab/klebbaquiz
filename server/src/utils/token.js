const jwt = require('jsonwebtoken');
const env = require('../config/env');

const COOKIE_NAME = 'qm_token';

const cookieOptions = (req) => {
  const isHttps = Boolean(
    req?.secure ||
    req?.headers?.['x-forwarded-proto'] === 'https' ||
    env.isProd ||
    env.COOKIE_SAMESITE === 'none'
  );
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : env.COOKIE_SAMESITE || 'lax',
    path: '/',
    domain: env.COOKIE_DOMAIN || undefined,
  };
};

function issueSession(res, user, req) {
  const seconds = Math.floor(env.JWT_EXPIRES_HOURS * 3600);
  const token = jwt.sign({ sub: String(user._id), role: user.role, tv: user.tokenVersion }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: seconds,
  });
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(req), maxAge: seconds * 1000 });
  return token;
}

const clearSession = (res, req) => res.clearCookie(COOKIE_NAME, cookieOptions(req));

const verifyToken = (token) => jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });

module.exports = { COOKIE_NAME, issueSession, clearSession, verifyToken };
