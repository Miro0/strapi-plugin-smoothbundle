'use strict';

const { createHash, createHmac, timingSafeEqual } = require('node:crypto');

const NONCE_TTL_MS = 10 * 60 * 1000;

function hashAccessToken(accessToken = '') {
  return createHash('sha256').update(String(accessToken || '')).digest('hex');
}

function decodePayload(token = '') {
  const [encodedPayload = '', signature = ''] = String(token || '').split('.', 2);
  if (!encodedPayload || !signature) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    return {
      encodedPayload,
      payload,
      signature,
    };
  } catch (error) {
    return null;
  }
}

module.exports = ({ strapi }) => ({
  getSecret() {
    const appKeys = Array.isArray(strapi?.server?.app?.keys) ? strapi.server.app.keys : [];
    return appKeys.length > 0 ? appKeys.join('|') : 'smoothcdn-action-nonce';
  },

  create(payload = {}) {
    const nextPayload = {
      action: String(payload.action || '').trim(),
      plan: Number(payload.plan),
      tokenHash: hashAccessToken(payload.accessToken),
      issuedAt: Date.now(),
    };
    const encodedPayload = Buffer.from(JSON.stringify(nextPayload), 'utf8').toString('base64url');
    const signature = createHmac('sha256', this.getSecret()).update(encodedPayload).digest('base64url');

    return `${encodedPayload}.${signature}`;
  },

  verify(token, options = {}) {
    const decoded = decodePayload(token);
    if (!decoded) {
      return false;
    }

    const expectedSignature = createHmac('sha256', this.getSecret())
      .update(decoded.encodedPayload)
      .digest('base64url');

    const providedBuffer = Buffer.from(decoded.signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
      return false;
    }

    if (!decoded.payload || typeof decoded.payload !== 'object') {
      return false;
    }

    if (String(decoded.payload.action || '') !== String(options.action || '')) {
      return false;
    }

    if (Date.now() - Number(decoded.payload.issuedAt || 0) > NONCE_TTL_MS) {
      return false;
    }

    if (Number(decoded.payload.plan) !== Number(options.plan)) {
      return false;
    }

    if (String(decoded.payload.tokenHash || '') !== hashAccessToken(options.accessToken)) {
      return false;
    }

    return true;
  },
});
