'use strict';

const { randomUUID } = require('node:crypto');

const { CDN_CONNECTOR_OPTIMIZE_POLL_MS, CDN_CONNECTOR_UPLOAD_BATCH_SIZE } = require('../../../utils/constants');
const pluginId = require('../../../plugin-id');

function toTimestamp(value) {
  const timestamp = Number(value) || 0;
  return timestamp > 0 ? timestamp : 0;
}

module.exports = ({ strapi }) => {
  const instanceId = randomUUID();
  let schedulerHandle = null;
  let pendingTickTimeout = null;

  function isModuleEnabled() {
    return strapi.plugin(pluginId).service('module-registry').isEnabled('cdn-connector');
  }

  function defaultState() {
    return {
      pendingDeleteFileIds: [],
      pendingDeleteFlushAfter: 0,
      pendingSyncFileIds: [],
      pendingSyncFlushAfter: 0,
      optimizeQueue: [],
      optimizeLock: {
        owner: '',
        expiresAt: 0,
      },
    };
  }

  function normalizeQueueEntry(entry = {}) {
    const moduleId = String(entry.moduleId || 'cdn-connector').trim() || 'cdn-connector';
    const assetId = String(entry.assetId || '').trim();

    return {
      key: `${moduleId}:${assetId}`,
      moduleId,
      assetId,
      fileId: String(entry.fileId || '').trim(),
      attemptCount: Math.max(0, Number(entry.attemptCount) || 0),
      queuedAt: toTimestamp(entry.queuedAt || Date.now()),
      nextRunAt: toTimestamp(entry.nextRunAt || Date.now()),
    };
  }

  function retryDelayMs(attemptCount = 0) {
    return Math.min(30 * 60 * 1000, Math.max(1, Number(attemptCount) || 0) * CDN_CONNECTOR_OPTIMIZE_POLL_MS);
  }

  async function updateOptimizeResult(fileId, assetId, status, errorMessage = '') {
    const normalizedFileId = String(fileId || '').trim();
    const normalizedAssetId = String(assetId || '').trim();

    if (!normalizedFileId || !normalizedAssetId) {
      return null;
    }

    const repository = strapi.plugin(pluginId).service('cdn-connector-repository');
    const current = await repository.get(normalizedFileId);

    if (!current) {
      return null;
    }

    const nextSyncedEntries = (Array.isArray(current.syncedEntries) ? current.syncedEntries : []).map((entry) => {
      if (String(entry?.projectAssetId || '').trim() !== normalizedAssetId) {
        return entry;
      }

      return {
        ...entry,
        optimizeStatus: status,
        optimizeError: status === 'failed' ? String(errorMessage || '').trim() : '',
      };
    });

    return repository.upsert({
      fileId: normalizedFileId,
      syncedEntries: nextSyncedEntries,
    });
  }

  return {
    defaults() {
      return defaultState();
    },

    store() {
      return strapi.store({
        type: 'plugin',
        name: pluginId,
        key: 'cdn-connector-optimize-queue',
      });
    },

    sanitize(payload = {}) {
      const defaults = defaultState();
      const optimizeLock = payload.optimizeLock && typeof payload.optimizeLock === 'object'
        ? payload.optimizeLock
        : defaults.optimizeLock;

      return {
        pendingDeleteFileIds: Array.from(
          new Set(
            (Array.isArray(payload.pendingDeleteFileIds) ? payload.pendingDeleteFileIds : [])
              .map((value) => String(value || '').trim())
              .filter(Boolean)
          )
        ),
        pendingDeleteFlushAfter: toTimestamp(payload.pendingDeleteFlushAfter),
        pendingSyncFileIds: Array.from(
          new Set(
            (Array.isArray(payload.pendingSyncFileIds) ? payload.pendingSyncFileIds : [])
              .map((value) => String(value || '').trim())
              .filter(Boolean)
          )
        ),
        pendingSyncFlushAfter: toTimestamp(payload.pendingSyncFlushAfter),
        optimizeQueue: Array.from(
          new Map(
            (Array.isArray(payload.optimizeQueue) ? payload.optimizeQueue : [])
              .map((entry) => normalizeQueueEntry(entry))
              .filter((entry) => entry.assetId)
              .map((entry) => [entry.key, entry])
          ).values()
        ).sort((left, right) => left.nextRunAt - right.nextRunAt),
        optimizeLock: {
          owner: String(optimizeLock.owner || '').trim(),
          expiresAt: toTimestamp(optimizeLock.expiresAt),
        },
      };
    },

    async get() {
      const stored = (await this.store().get()) || {};
      return this.sanitize(stored);
    },

    async save(nextState = {}) {
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

    scheduleSoon(delayMs = 0) {
      const normalizedDelay = Math.max(0, Number(delayMs) || 0);

      if (pendingTickTimeout) {
        clearTimeout(pendingTickTimeout);
      }

      pendingTickTimeout = setTimeout(() => {
        pendingTickTimeout = null;
        this.tickScheduler().catch((error) => {
          strapi.log.error(`[smoothbundle] Immediate queue tick failed: ${error.message}`);
        });
      }, normalizedDelay);
    },

    async queueAssets(entries = [], delayMs = 0) {
      const normalizedDelay = Math.max(0, Number(delayMs) || 0);
      const queuedAt = Date.now();
      const queuedEntries = (Array.isArray(entries) ? entries : [entries])
        .map((entry) =>
          normalizeQueueEntry({
            ...entry,
            queuedAt,
            nextRunAt: queuedAt + normalizedDelay,
          })
        )
        .filter((entry) => entry.assetId);

      if (queuedEntries.length === 0) {
        return this.get();
      }

      const state = await this.update((current) => ({
        optimizeQueue: Array.from(
          new Map(
            [...(current.optimizeQueue || []), ...queuedEntries].map((entry) => [entry.key, entry])
          ).values()
        ),
      }));

      this.scheduleSoon(normalizedDelay);
      return state;
    },

    async queueMediaFiles(fileIds = [], delayMs = 5000) {
      const normalizedDelay = Math.max(0, Number(delayMs) || 0);
      const normalizedIds = Array.from(
        new Set(
          (Array.isArray(fileIds) ? fileIds : [fileIds])
            .map((value) => String(value || '').trim())
            .filter(Boolean)
        )
      );

      if (normalizedIds.length === 0) {
        return this.get();
      }

      const state = await this.update((current) => ({
        pendingSyncFileIds: Array.from(new Set([...(current.pendingSyncFileIds || []), ...normalizedIds])),
        pendingSyncFlushAfter: Date.now() + normalizedDelay,
      }));

      this.scheduleSoon(normalizedDelay);
      return state;
    },

    async queueDeletedMediaFiles(fileIds = [], delayMs = 0) {
      const normalizedDelay = Math.max(0, Number(delayMs) || 0);
      const normalizedIds = Array.from(
        new Set(
          (Array.isArray(fileIds) ? fileIds : [fileIds])
            .map((value) => String(value || '').trim())
            .filter(Boolean)
        )
      );

      if (normalizedIds.length === 0) {
        return this.get();
      }

      const state = await this.update((current) => ({
        pendingDeleteFileIds: Array.from(new Set([...(current.pendingDeleteFileIds || []), ...normalizedIds])),
        pendingDeleteFlushAfter: Date.now() + normalizedDelay,
        pendingSyncFileIds: (current.pendingSyncFileIds || []).filter((fileId) => !normalizedIds.includes(fileId)),
      }));

      this.scheduleSoon(normalizedDelay);
      return state;
    },

    async takeDueDeletedMediaFiles(limit = CDN_CONNECTOR_UPLOAD_BATCH_SIZE, now = Date.now()) {
      const normalizedLimit = Math.max(1, Number(limit) || 1);
      const current = await this.get();

      if ((current.pendingDeleteFileIds || []).length === 0 || current.pendingDeleteFlushAfter > now) {
        return [];
      }

      const ready = current.pendingDeleteFileIds.slice(0, normalizedLimit);
      const remaining = current.pendingDeleteFileIds.slice(normalizedLimit);

      await this.save({
        ...current,
        pendingDeleteFileIds: remaining,
        pendingDeleteFlushAfter: remaining.length > 0 ? now + CDN_CONNECTOR_OPTIMIZE_POLL_MS : 0,
      });

      return ready;
    },

    async requeueDeletedMediaFiles(fileIds = [], delayMs = CDN_CONNECTOR_OPTIMIZE_POLL_MS) {
      return this.queueDeletedMediaFiles(fileIds, delayMs);
    },

    async takeDueMediaFiles(limit = CDN_CONNECTOR_UPLOAD_BATCH_SIZE, now = Date.now()) {
      const normalizedLimit = Math.max(1, Number(limit) || 1);
      const current = await this.get();

      if ((current.pendingSyncFileIds || []).length === 0 || current.pendingSyncFlushAfter > now) {
        return [];
      }

      const ready = current.pendingSyncFileIds.slice(0, normalizedLimit);
      const remaining = current.pendingSyncFileIds.slice(normalizedLimit);

      await this.save({
        ...current,
        pendingSyncFileIds: remaining,
        pendingSyncFlushAfter: remaining.length > 0 ? now + CDN_CONNECTOR_OPTIMIZE_POLL_MS : 0,
      });

      return ready;
    },

    async requeueMediaFiles(fileIds = [], delayMs = CDN_CONNECTOR_OPTIMIZE_POLL_MS) {
      return this.queueMediaFiles(fileIds, delayMs);
    },

    async removeFileReferences(fileIds = []) {
      const removable = new Set(
        (Array.isArray(fileIds) ? fileIds : [fileIds])
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      );

      if (removable.size === 0) {
        return this.get();
      }

      return this.update((current) => ({
        pendingDeleteFileIds: (current.pendingDeleteFileIds || []).filter((fileId) => !removable.has(fileId)),
        pendingSyncFileIds: (current.pendingSyncFileIds || []).filter((fileId) => !removable.has(fileId)),
        optimizeQueue: (current.optimizeQueue || []).filter((entry) => !removable.has(String(entry.fileId || '').trim())),
      }));
    },

    async clearPendingSync(fileIds = []) {
      const normalizedIds = Array.from(
        new Set(
          (Array.isArray(fileIds) ? fileIds : [fileIds])
            .map((value) => String(value || '').trim())
            .filter(Boolean)
        )
      );

      if (normalizedIds.length === 0) {
        return this.update(() => ({
          pendingSyncFileIds: [],
          pendingSyncFlushAfter: 0,
        }));
      }

      const removable = new Set(normalizedIds);

      return this.update((current) => ({
        pendingSyncFileIds: (current.pendingSyncFileIds || []).filter((fileId) => !removable.has(fileId)),
        pendingSyncFlushAfter: 0,
      }));
    },

    async takeDueAssets(limit = 1, now = Date.now()) {
      const normalizedLimit = Math.max(1, Number(limit) || 1);
      const current = await this.get();
      const ready = [];
      const pending = [];

      for (const entry of current.optimizeQueue || []) {
        if (ready.length < normalizedLimit && entry.nextRunAt <= now) {
          ready.push(entry);
        } else {
          pending.push(entry);
        }
      }

      if (ready.length > 0) {
        await this.save({
          ...current,
          optimizeQueue: pending,
        });
      }

      return ready;
    },

    async requeueAssets(entries = []) {
      const now = Date.now();
      const normalizedEntries = (Array.isArray(entries) ? entries : [entries])
        .map((entry) => normalizeQueueEntry(entry))
        .filter((entry) => entry.assetId)
        .map((entry) => ({
          ...entry,
          queuedAt: entry.queuedAt || now,
          nextRunAt: now + retryDelayMs(entry.attemptCount),
        }));

      if (normalizedEntries.length === 0) {
        return this.get();
      }

      return this.update((current) => ({
        optimizeQueue: Array.from(
          new Map(
            [...(current.optimizeQueue || []), ...normalizedEntries].map((entry) => [entry.key, entry])
          ).values()
        ),
      }));
    },

    async claimLock(owner, ttlMs = CDN_CONNECTOR_OPTIMIZE_POLL_MS) {
      const normalizedOwner = String(owner || '').trim();
      const normalizedTtl = Math.max(1000, Number(ttlMs) || 1000);
      const current = await this.get();
      const existing = current.optimizeLock || { owner: '', expiresAt: 0 };

      if (existing.owner && existing.owner !== normalizedOwner && existing.expiresAt > Date.now()) {
        return false;
      }

      await this.save({
        ...current,
        optimizeLock: {
          owner: normalizedOwner,
          expiresAt: Date.now() + normalizedTtl,
        },
      });

      const confirmed = await this.get();
      return confirmed.optimizeLock?.owner === normalizedOwner;
    },

    async releaseLock(owner) {
      const normalizedOwner = String(owner || '').trim();
      const current = await this.get();

      if (current.optimizeLock?.owner && current.optimizeLock.owner !== normalizedOwner) {
        return false;
      }

      await this.save({
        ...current,
        optimizeLock: {
          owner: '',
          expiresAt: 0,
        },
      });

      return true;
    },

    async tickScheduler() {
      const lockOwner = `${instanceId}:optimize:${Date.now()}`;
      const lockClaimed = await this.claimLock(lockOwner, Math.max(5000, CDN_CONNECTOR_OPTIMIZE_POLL_MS - 1000));

      if (!lockClaimed) {
        return;
      }

      try {
        if (!(await isModuleEnabled())) {
          return;
        }

        const pendingDeleteFileIds = await this.takeDueDeletedMediaFiles(CDN_CONNECTOR_UPLOAD_BATCH_SIZE);

        if (pendingDeleteFileIds.length > 0) {
          const cdnConnectorSettings = await strapi.plugin(pluginId).service('cdn-connector-settings').get();

          if (!cdnConnectorSettings.deleteCdnAssetsWithMediaItems) {
            return;
          }

          const result = await strapi
            .plugin(pluginId)
            .service('cdn-connector-sync')
            .removeDeletedMediaItems(pendingDeleteFileIds);

          if (!result?.success) {
            await this.requeueDeletedMediaFiles(pendingDeleteFileIds);
          }

          return;
        }

        const pendingFileIds = await this.takeDueMediaFiles(CDN_CONNECTOR_UPLOAD_BATCH_SIZE);

        if (pendingFileIds.length > 0) {
          const cdnConnectorSettings = await strapi.plugin(pluginId).service('cdn-connector-settings').get();
          const result = await strapi.plugin(pluginId).service('cdn-connector-sync').startSyncJob(pendingFileIds, {
            trigger: 'content_change',
            force: false,
            markSyncable: Boolean(cdnConnectorSettings.autoSyncUploads),
          });

          if (!result?.success) {
            await this.requeueMediaFiles(pendingFileIds);
          }

          return;
        }
      } finally {
        await this.releaseLock(lockOwner);
      }
    },

    startScheduler() {
      if (schedulerHandle) {
        return;
      }

      schedulerHandle = setInterval(() => {
        this.tickScheduler().catch((error) => {
          strapi.log.error(`[smoothbundle] CDN Connector queue failed: ${error.message}`);
        });
      }, CDN_CONNECTOR_OPTIMIZE_POLL_MS);

      this.tickScheduler().catch((error) => {
        strapi.log.error(`[smoothbundle] Initial CDN Connector queue tick failed: ${error.message}`);
      });
    },

    stopScheduler() {
      if (pendingTickTimeout) {
        clearTimeout(pendingTickTimeout);
        pendingTickTimeout = null;
      }

      if (schedulerHandle) {
        clearInterval(schedulerHandle);
        schedulerHandle = null;
      }
    },
  };
};
