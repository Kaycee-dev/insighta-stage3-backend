const crypto = require('crypto');

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlJson(value) {
  return base64Url(JSON.stringify(value));
}

function fromBase64Url(value) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function sign(data, secret) {
  return base64Url(crypto.createHmac('sha256', secret).update(data).digest());
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function signJwt(payload, secret, ttlSeconds, now = new Date()) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const iat = Math.floor(now.getTime() / 1000);
  const body = {
    ...payload,
    iat,
    exp: iat + ttlSeconds,
  };
  const unsigned = `${base64UrlJson(header)}.${base64UrlJson(body)}`;
  return `${unsigned}.${sign(unsigned, secret)}`;
}

function verifyJwt(token, secret, now = new Date()) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, signature] = parts;
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const expected = sign(unsigned, secret);
  if (!safeEqual(signature, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(fromBase64Url(encodedPayload).toString('utf8'));
  } catch (err) {
    return null;
  }
  if (!payload.exp || payload.exp <= Math.floor(now.getTime() / 1000)) {
    return null;
  }
  return payload;
}

function randomToken(bytes = 32) {
  return base64Url(crypto.randomBytes(bytes));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function pkceChallenge(verifier) {
  return base64Url(crypto.createHash('sha256').update(verifier).digest());
}

module.exports = {
  base64Url,
  pkceChallenge,
  randomToken,
  sha256,
  signJwt,
  verifyJwt,
};
