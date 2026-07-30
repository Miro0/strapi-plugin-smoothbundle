'use strict';

const pluginId = require('../../../plugin-id');

function toTimestamp(value) {
  const timestamp = Number(value) || 0;
  return timestamp > 0 ? timestamp : 0;
}

function defaultSyncJob() {
  return {
    id: '',
    status: 'idle',
    trigger: '',
    totalRoutes: 0,
    processedRoutes: 0,
    syncedRoutes: 0,
    failedRoutes: 0,
    skippedRoutes: 0,
    currentRoute: '',
    startedAt: '',
    finishedAt: '',
    errorMessage: '',
    failedEntries: [],
  };
}

module.exports = ({ strapi }) => ({
  defaults() {
    return {
      pendingContentChanges: [],
      pendingFlushAfter: 0,
      schedulerLock: {
        owner: '',
        expiresAt: 0,
      },
      syncLock: {
        owner: '',
        expiresAt: 0,
      },
      syncJob: defaultSyncJob(),
    };
  },

  store() {
    return strapi.store({
      type: 'plugin',
      name: pluginId,
      key: 'api-accelerator-runtime-state',
    });
  },

  sanitize(payload = {}) {
    const defaults = this.defaults();
    const schedulerLock = payload.schedulerLock && typeof payload.schedulerLock === 'object'
      ? payload.schedulerLock
      : defaults.schedulerLock;
    const syncLock = payload.syncLock && typeof payload.syncLock === 'object'
      ? payload.syncLock
      : defaults.syncLock;
    const syncJob = payload.syncJob && typeof payload.syncJob === 'object'
      ? payload.syncJob
      : defaults.syncJob;

    return {
      pendingContentChanges: Array.from(
        new Map(
          (Array.isArray(payload.pendingContentChanges) ? payload.pendingContentChanges : [])
            .map((entry) => ({
              uid: String(entry?.uid || '').trim(),
              documentId: String(entry?.documentId || '').trim(),
            }))
            .filter((entry) => entry.uid.startsWith('api::'))
            .map((entry) => [`${entry.uid}:${entry.documentId}`, entry])
        ).values()
      ),
      pendingFlushAfter: toTimestamp(payload.pendingFlushAfter),
      schedulerLock: {
        owner: String(schedulerLock.owner || '').trim(),
        expiresAt: toTimestamp(schedulerLock.expiresAt),
      },
      syncLock: {
        owner: String(syncLock.owner || '').trim(),
        expiresAt: toTimestamp(syncLock.expiresAt),
      },
      syncJob: {
        id: String(syncJob.id || '').trim(),
        status: ['idle', 'running', 'completed', 'failed'].includes(String(syncJob.status || '').trim())
          ? String(syncJob.status || '').trim()
          : 'idle',
        trigger: String(syncJob.trigger || '').trim(),
        totalRoutes: Math.max(0, Number(syncJob.totalRoutes) || 0),
        processedRoutes: Math.max(0, Number(syncJob.processedRoutes) || 0),
        syncedRoutes: Math.max(0, Number(syncJob.syncedRoutes) || 0),
        failedRoutes: Math.max(0, Number(syncJob.failedRoutes) || 0),
        skippedRoutes: Math.max(0, Number(syncJob.skippedRoutes) || 0),
        currentRoute: String(syncJob.currentRoute || '').trim(),
        startedAt: String(syncJob.startedAt || '').trim(),
        finishedAt: String(syncJob.finishedAt || '').trim(),
        errorMessage: String(syncJob.errorMessage || '').trim(),
        failedEntries: Array.isArray(syncJob.failedEntries)
          ? syncJob.failedEntries
              .map((entry) => ({
                route: String(entry?.route || '').trim(),
                message: String(entry?.message || '').trim(),
              }))
              .filter((entry) => entry.route && entry.message)
              .slice(0, 20)
          : [],
      },
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

  async queueContentChanges(entries = [], delayMs = 5000) {
    const normalizedDelay = Math.max(500, Number(delayMs) || 5000);
    const normalizedEntries = Array.from(
      new Map(
        (Array.isArray(entries) ? entries : [])
          .map((entry) => ({
            uid: String(entry?.uid || '').trim(),
            documentId: String(entry?.documentId || '').trim(),
          }))
          .filter((entry) => entry.uid.startsWith('api::'))
          .map((entry) => [`${entry.uid}:${entry.documentId}`, entry])
      ).values()
    );

    if (normalizedEntries.length === 0) {
      return this.get();
    }

    return this.update((current) => ({
      pendingContentChanges: Array.from(
        new Map(
          [...(current.pendingContentChanges || []), ...normalizedEntries]
            .map((entry) => [`${entry.uid}:${entry.documentId}`, entry])
        ).values()
      ),
      pendingFlushAfter: Date.now() + normalizedDelay,
    }));
  },

  async takeDuePendingContentChanges(now = Date.now()) {
    const current = await this.get();

    if (current.pendingContentChanges.length === 0 || current.pendingFlushAfter > now) {
      return [];
    }

    const queued = [...current.pendingContentChanges];
    await this.save({
      ...current,
      pendingContentChanges: [],
      pendingFlushAfter: 0,
    });

    return queued;
  },

  async requeueContentChanges(entries = [], delayMs = 5000) {
    return this.queueContentChanges(entries, delayMs);
  },

  async claimLock(lockKey, owner, ttlMs) {
    const normalizedLockKey = String(lockKey || '').trim();
    if (!['schedulerLock', 'syncLock'].includes(normalizedLockKey)) {
      return false;
    }

    const normalizedOwner = String(owner || '').trim();
    const normalizedTtl = Math.max(1000, Number(ttlMs) || 1000);
    const now = Date.now();
    const current = await this.get();
    const existing = current[normalizedLockKey] || { owner: '', expiresAt: 0 };

    if (existing.owner && existing.owner !== normalizedOwner && existing.expiresAt > now) {
      return false;
    }

    await this.save({
      ...current,
      [normalizedLockKey]: {
        owner: normalizedOwner,
        expiresAt: now + normalizedTtl,
      },
    });

    const confirmed = await this.get();
    return confirmed[normalizedLockKey]?.owner === normalizedOwner;
  },

  async refreshLock(lockKey, owner, ttlMs) {
    const normalizedLockKey = String(lockKey || '').trim();
    const normalizedOwner = String(owner || '').trim();
    const normalizedTtl = Math.max(1000, Number(ttlMs) || 1000);
    const current = await this.get();
    const existing = current[normalizedLockKey] || { owner: '', expiresAt: 0 };

    if (existing.owner !== normalizedOwner) {
      return false;
    }

    await this.save({
      ...current,
      [normalizedLockKey]: {
        owner: normalizedOwner,
        expiresAt: Date.now() + normalizedTtl,
      },
    });

    return true;
  },

  async releaseLock(lockKey, owner) {
    const normalizedLockKey = String(lockKey || '').trim();
    const normalizedOwner = String(owner || '').trim();
    const current = await this.get();
    const existing = current[normalizedLockKey] || { owner: '', expiresAt: 0 };

    if (existing.owner && existing.owner !== normalizedOwner) {
      return false;
    }

    await this.save({
      ...current,
      [normalizedLockKey]: {
        owner: '',
        expiresAt: 0,
      },
    });

    return true;
  },
});
