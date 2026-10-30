'use strict';

const { createWriteStream } = require('node:fs');
const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const os = require('node:os');
const path = require('node:path');

const THRESHOLD = 90 * 1024 * 1024;
const PART_SIZE = 8 * 1024 * 1024;

async function downloadBody(response) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smoothbundle-upload-'));
  const filePath = path.join(directory, 'asset');
  let size = 0;
  try {
    await pipeline(Readable.fromWeb(response.body), new Transform({
      transform(chunk, encoding, done) {
        size += chunk.length;
        done(size > 5 * 1024 ** 3 ? new Error('Asset exceeds 5 GB') : null, chunk);
      },
    }), createWriteStream(filePath));
    return { filePath, size, temporaryDirectory: directory };
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function cleanupBody(body) {
  if (body?.temporaryDirectory) await fs.rm(body.temporaryDirectory, { recursive: true, force: true });
}

function uploadErrorMessage(payload, status, fallback = 'Could not upload media assets to Smooth Bundle.') {
  const message = [payload?.error?.message, payload?.error, payload?.message]
    .find((value) => typeof value === 'string' && value.trim());
  const detail = message ? message.trim() : fallback;
  return status ? `${detail} (HTTP ${status})` : detail;
}

async function uploadMultipart(baseUrl, accessToken, projectId, asset) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  async function request(endpoint, body, binary = false) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(`${baseUrl}/upload/multipart/${endpoint}`, {
          method: 'POST', headers: { ...headers, 'Content-Type': binary ? 'application/octet-stream' : 'application/json' },
          body: binary ? body : JSON.stringify(body),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload || payload.error || payload.success === false) {
          const error = new Error(uploadErrorMessage(payload, response.status, 'Invalid or unsuccessful multipart upload response.'));
          error.status = response.status;
          throw error;
        }
        return payload;
      } catch (error) {
        lastError = error;
        // Parts can safely be overwritten. Never retry init or an ambiguous completion.
        if (!binary || attempt === 2 || (error.status && error.status < 500 && error.status !== 429)) throw error;
      }
    }
    throw lastError;
  }
  const size = asset.body?.filePath ? asset.body.size : Buffer.byteLength(asset.body);
  const session = await request('init', {
    projectId, fileName: asset.filename, fileSize: size, contentType: asset.contentType,
    path: asset.path, protected: asset.protected, parentAssetId: asset.parentAssetId || undefined,
    meta: asset.meta || {}, skipVariants: true, optimized: 0,
  });
  if (!session.token) throw new Error('Upload session missing');
  const hash = createHash('sha256');
  const parts = [];
  let handle;
  try {
    handle = asset.body?.filePath ? await fs.open(asset.body.filePath, 'r') : null;
    for (let offset = 0; offset < size; offset += PART_SIZE) {
      const length = Math.min(PART_SIZE, size - offset);
      const bytes = Buffer.allocUnsafe(length);
      if (handle) {
        let read = 0;
        while (read < length) {
          const result = await handle.read(bytes, read, length - read, offset + read);
          if (!result.bytesRead) throw new Error('Source file changed during upload');
          read += result.bytesRead;
        }
      } else Buffer.from(asset.body).copy(bytes, 0, offset, offset + length);
      hash.update(bytes);
      const part = await request(`part?token=${encodeURIComponent(session.token)}&partNumber=${parts.length + 1}`, bytes, true);
      if (!part.etag) throw new Error('Upload part missing ETag');
      parts.push({ partNumber: part.partNumber, etag: part.etag });
    }
    return await request('complete', { token: session.token, parts, sha256: hash.digest('hex') });
  } catch (error) {
    await request('abort', { token: session.token }).catch(() => {});
    throw error;
  } finally {
    await handle?.close();
  }
}

module.exports = { THRESHOLD, downloadBody, cleanupBody, uploadMultipart, uploadErrorMessage };
