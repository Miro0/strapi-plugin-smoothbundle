'use strict';

const pluginId = require('../../../plugin-id');

function defaultSyncJob() {
  return {
    id: '',
    status: 'idle',
    trigger: '',
    totalItems: 0,
    processedItems: 0,
    syncedItems: 0,
    failedItems: 0,
    skippedItems: 0,
    currentItem: '',
    startedAt: '',
    finishedAt: '',
    errorMessage: '',
    failedEntries: [],
  };
}

function defaultSyncLock() {
  return {
    owner: '',
    expiresAt: 0,
  };
}

module.exports = ({ strapi }) => ({
  defaults() {
    return {
      syncJob: defaultSyncJob(),
      syncLock: defaultSyncLock(),
      restoredAssetKeys: [],
    };
  },

  store() {
    return strapi.store({
      type: 'plugin',
      name: pluginId,
      key: 'cdn-connector-runtime-state',
    });
  },

  sanitize(payload = {}) {
    const defaults = this.defaults();
    const syncJob = payload.syncJob && typeof payload.syncJob === 'object'
      ? payload.syncJob
      : defaults.syncJob;
    const syncLock = payload.syncLock && typeof payload.syncLock === 'object'
      ? payload.syncLock
      : defaults.syncLock;

    return {
      syncJob: {
        id: String(syncJob.id || '').trim(),
        status: ['idle', 'running', 'completed', 'failed'].includes(String(syncJob.status || '').trim())
          ? String(syncJob.status || '').trim()
          : 'idle',
        trigger: String(syncJob.trigger || '').trim(),
        totalItems: Math.max(0, Number(syncJob.totalItems) || 0),
        processedItems: Math.max(0, Number(syncJob.processedItems) || 0),
        syncedItems: Math.max(0, Number(syncJob.syncedItems) || 0),
        failedItems: Math.max(0, Number(syncJob.failedItems) || 0),
        skippedItems: Math.max(0, Number(syncJob.skippedItems) || 0),
        currentItem: String(syncJob.currentItem || '').trim(),
        startedAt: String(syncJob.startedAt || '').trim(),
        finishedAt: String(syncJob.finishedAt || '').trim(),
        errorMessage: String(syncJob.errorMessage || '').trim(),
        failedEntries: Array.isArray(syncJob.failedEntries)
          ? syncJob.failedEntries
              .map((entry) => ({
                fileId: String(entry?.fileId || '').trim(),
                message: String(entry?.message || '').trim(),
              }))
              .filter((entry) => entry.fileId && entry.message)
              .slice(0, 20)
          : [],
      },
      syncLock: {
        owner: String(syncLock.owner || '').trim(),
        expiresAt: Math.max(0, Number(syncLock.expiresAt) || 0),
      },
      restoredAssetKeys: Array.from(
        new Set(
          (Array.isArray(payload.restoredAssetKeys) ? payload.restoredAssetKeys : [])
            .map((value) => String(value || '').trim())
            .filter(Boolean)
        )
      ),
    };
  },

  async get() {
    const stored = (await this.store().get()) || {};
    return this.sanitize(stored);
  },

  async save(nextState) {
    const sanitized = this.sanitize(nextState);
    await this.store().set({ value: sanitized });
    return sanitized;
  },

  async update(updater) {
    const current = await this.get();
    const patch = typeof updater === 'function' ? await updater(current) : updater;

    return this.save({
      ...current,
      ...(patch || {}),
    });
  },

  async claimLock(owner, ttlMs = 5 * 60 * 1000) {
    const normalizedOwner = String(owner || '').trim();
    const normalizedTtl = Math.max(1000, Number(ttlMs) || 1000);

    if (!normalizedOwner) {
      return false;
    }

    const current = await this.get();
    const existing = current.syncLock || defaultSyncLock();

    if (existing.owner && existing.owner !== normalizedOwner && existing.expiresAt > Date.now()) {
      return false;
    }

    await this.save({
      ...current,
      syncLock: {
        owner: normalizedOwner,
        expiresAt: Date.now() + normalizedTtl,
      },
    });

    const confirmed = await this.get();
    return confirmed.syncLock?.owner === normalizedOwner;
  },

  async refreshLock(owner, ttlMs = 5 * 60 * 1000) {
    const normalizedOwner = String(owner || '').trim();
    const normalizedTtl = Math.max(1000, Number(ttlMs) || 1000);
    const current = await this.get();

    if (!normalizedOwner || current.syncLock?.owner !== normalizedOwner) {
      return false;
    }

    await this.save({
      ...current,
      syncLock: {
        owner: normalizedOwner,
        expiresAt: Date.now() + normalizedTtl,
      },
    });

    return true;
  },

  async releaseLock(owner) {
    const normalizedOwner = String(owner || '').trim();
    const current = await this.get();

    if (current.syncLock?.owner && current.syncLock.owner !== normalizedOwner) {
      return false;
    }

    await this.save({
      ...current,
      syncLock: defaultSyncLock(),
    });

    return true;
  },

  async markAssetRestored(assetKey) {
    const normalizedKey = String(assetKey || '').trim();

    if (!normalizedKey) {
      return this.get();
    }

    return this.update((current) => ({
      restoredAssetKeys: Array.from(new Set([...(current.restoredAssetKeys || []), normalizedKey])),
    }));
  },
});
