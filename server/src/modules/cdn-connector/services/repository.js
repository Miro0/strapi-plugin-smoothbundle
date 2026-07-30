'use strict';

const pluginId = require('../../../plugin-id');

function normalizeSyncedEntry(entry = {}) {
  return {
    key: String(entry.key || '').trim(),
    label: String(entry.label || '').trim(),
    projectAssetId: String(entry.projectAssetId || '').trim(),
    optimizeStatus: ['waiting', 'optimized', 'failed'].includes(String(entry.optimizeStatus || '').trim())
      ? String(entry.optimizeStatus || '').trim()
      : 'waiting',
    optimizeError: String(entry.optimizeError || '').trim(),
    path: String(entry.path || '/').trim() || '/',
    filename: String(entry.filename || '').trim(),
    mime: String(entry.mime || '').trim(),
    width: Math.max(0, Number(entry.width) || 0),
    height: Math.max(0, Number(entry.height) || 0),
    size: Math.max(0, Number(entry.size) || 0),
  };
}

function deriveProtected(entry = {}, current = {}) {
  if (Object.prototype.hasOwnProperty.call(entry, 'protected')) {
    return Boolean(entry.protected);
  }

  if (Object.prototype.hasOwnProperty.call(current, 'protected')) {
    return Boolean(current.protected);
  }

  return false;
}

function deriveSyncable(entry = {}, current = {}) {
  if (Object.prototype.hasOwnProperty.call(entry, 'syncable')) {
    return Boolean(entry.syncable);
  }

  if (Object.prototype.hasOwnProperty.call(current, 'syncable')) {
    return Boolean(current.syncable);
  }

  const syncStatus = String(entry.syncStatus || current.syncStatus || '').trim();
  const syncedEntries = Array.isArray(entry.syncedEntries)
    ? entry.syncedEntries
    : Array.isArray(current.syncedEntries)
      ? current.syncedEntries
      : [];

  return syncStatus === 'uploaded' || syncStatus === 'upload_failed' || syncedEntries.length > 0;
}

module.exports = ({ strapi }) => ({
  store() {
    return strapi.store({
      type: 'plugin',
      name: pluginId,
      key: 'cdn-connector-repository',
    });
  },

  normalizeEntry(entry = {}, previous = null) {
    const current = previous || {};

    return {
      fileId: String(entry.fileId || current.fileId || '').trim(),
      syncable: deriveSyncable(entry, current),
      protected: deriveProtected(entry, current),
      syncStatus: ['not_synced', 'uploaded', 'upload_failed'].includes(String(entry.syncStatus || current.syncStatus || '').trim())
        ? String(entry.syncStatus || current.syncStatus || '').trim()
        : 'not_synced',
      lastSyncedAt: String(
        Object.prototype.hasOwnProperty.call(entry, 'lastSyncedAt') ? entry.lastSyncedAt : current.lastSyncedAt || ''
      ).trim(),
      lastSourceSignature: String(
        Object.prototype.hasOwnProperty.call(entry, 'lastSourceSignature')
          ? entry.lastSourceSignature
          : current.lastSourceSignature || ''
      ).trim(),
      lastError: String(
        Object.prototype.hasOwnProperty.call(entry, 'lastError') ? entry.lastError : current.lastError || ''
      ).trim(),
      syncedEntries: Array.isArray(entry.syncedEntries)
        ? entry.syncedEntries.map(normalizeSyncedEntry).filter((item) => item.filename)
        : Array.isArray(current.syncedEntries)
          ? current.syncedEntries.map(normalizeSyncedEntry).filter((item) => item.filename)
          : [],
    };
  },

  async all() {
    const stored = (await this.store().get()) || [];

    if (!Array.isArray(stored)) {
      return [];
    }

    return stored
      .map((entry) => this.normalizeEntry(entry))
      .filter((entry) => entry.fileId);
  },

  async save(entries) {
    await this.store().set({ value: entries });
    return entries;
  },

  async get(fileId) {
    const normalizedFileId = String(fileId || '').trim();
    return (await this.all()).find((entry) => entry.fileId === normalizedFileId) || null;
  },

  async upsert(entry) {
    return this.upsertMany([entry]);
  },

  async upsertMany(entries = []) {
    const items = await this.all();
    const index = new Map(items.map((item, itemIndex) => [item.fileId, itemIndex]));

    for (const entry of Array.isArray(entries) ? entries : []) {
      const normalizedFileId = String(entry?.fileId || '').trim();

      if (!normalizedFileId) {
        continue;
      }

      const itemIndex = index.get(normalizedFileId);
      const previous = typeof itemIndex === 'number' ? items[itemIndex] : null;
      const next = this.normalizeEntry(entry, previous);

      if (typeof itemIndex === 'number') {
        items[itemIndex] = next;
      } else {
        items.push(next);
        index.set(normalizedFileId, items.length - 1);
      }
    }

    await this.save(items);
    return items;
  },

  async removeMany(fileIds = []) {
    const removable = new Set(
      (Array.isArray(fileIds) ? fileIds : [fileIds])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    );

    if (removable.size === 0) {
      return this.all();
    }

    const next = (await this.all()).filter((entry) => !removable.has(entry.fileId));
    await this.save(next);
    return next;
  },
});
