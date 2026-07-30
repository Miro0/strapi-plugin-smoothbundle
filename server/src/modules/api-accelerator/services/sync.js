'use strict';

const { randomUUID } = require('node:crypto');

const {
  API_ACCELERATOR_UPLOAD_BATCH_SIZE,
  MAX_SYNC_PAGES,
  SCHEDULER_POLL_MS,
} = require('../../../utils/constants');
const {
  buildUploadTarget,
  md5,
  nowIso,
  parseIntervalFrequency,
  pathToContentApiRoute,
} = require('../../../utils/helpers');

module.exports = ({ strapi }) => {
  const instanceId = randomUUID();
  let schedulerHandle = null;
  let isRunning = false;

  async function isModuleEnabled() {
    return strapi.plugin('smoothbundle').service('module-registry').isEnabled('api-accelerator');
  }

function collectionPageTarget(route, page) {
    const manifestTarget = buildUploadTarget(route);
    const baseName = manifestTarget.filename.replace(/\.json$/i, '');
    const pagePath = manifestTarget.path === '/'
      ? `/${baseName}`
      : `${manifestTarget.path}/${baseName}`;

    return {
      path: pagePath,
      filename: `page-${page}.json`,
    };
  }

  function extractRelationId(value) {
    if (!value || typeof value !== 'object') {
      return value;
    }

    if (
      Object.prototype.hasOwnProperty.call(value, 'documentId') &&
      value.documentId !== undefined &&
      value.documentId !== null &&
      value.documentId !== ''
    ) {
      return value.documentId;
    }

    if (Object.prototype.hasOwnProperty.call(value, 'id') && value.id !== undefined && value.id !== null && value.id !== '') {
      return value.id;
    }

    return value;
  }

  function normalizeRelationValue(value) {
    if (Array.isArray(value)) {
      return value.map((item) => extractRelationId(item));
    }

    return extractRelationId(value);
  }

  function normalizeEntityForSync(uid, value, level = 1) {
    if (Array.isArray(value)) {
      return value.map((item) => normalizeEntityForSync(uid, item, level));
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    const model = typeof strapi.getModel === 'function' ? strapi.getModel(uid) : strapi.contentTypes?.[uid] || strapi.components?.[uid];
    if (!model || typeof model !== 'object' || !model.attributes || level > 6) {
      return value;
    }

    const next = {};

    for (const [key, nested] of Object.entries(value)) {
      const attribute = model.attributes[key];

      if (!attribute || typeof attribute !== 'object') {
        next[key] = nested;
        continue;
      }

      switch (attribute.type) {
        case 'relation':
        case 'media':
          next[key] = normalizeRelationValue(nested);
          break;
        case 'component':
          if (Array.isArray(nested)) {
            next[key] = nested.map((item) => normalizeEntityForSync(attribute.component, item, level + 1));
          } else {
            next[key] = normalizeEntityForSync(attribute.component, nested, level + 1);
          }
          break;
        case 'dynamiczone':
          next[key] = Array.isArray(nested)
            ? nested.map((item) => {
                if (!item || typeof item !== 'object') {
                  return item;
                }

                const componentUid = item.__component;
                return componentUid ? normalizeEntityForSync(componentUid, item, level + 1) : item;
              })
            : nested;
          break;
        default:
          next[key] = nested;
          break;
      }
    }

    return next;
  }

  function normalizeApiResponseDataForSync(uid, payload) {
    if (Array.isArray(payload)) {
      return payload.map((item) => normalizeEntityForSync(uid, item));
    }

    return normalizeEntityForSync(uid, payload);
  }

  function pruneEmptyJson(value) {
    if (Array.isArray(value)) {
      return value
        .map(pruneEmptyJson)
        .filter((entry) => entry !== undefined);
    }

    if (value === null || value === undefined || value === '') {
      return undefined;
    }

    if (typeof value !== 'object') {
      return value;
    }

    const next = {};

    for (const [key, nested] of Object.entries(value)) {
      const pruned = pruneEmptyJson(nested);

      if (pruned === undefined) {
        continue;
      }

      if (Array.isArray(pruned) && pruned.length === 0) {
        continue;
      }

      if (pruned && typeof pruned === 'object' && !Array.isArray(pruned) && Object.keys(pruned).length === 0) {
        continue;
      }

      next[key] = pruned;
    }

    return next;
  }

  function serializeJson(payload) {
    const normalized = pruneEmptyJson(payload);
    return JSON.stringify(normalized === undefined ? null : normalized);
  }

  function trimFailedEntries(entries = []) {
    return (Array.isArray(entries) ? entries : [])
      .map((entry) => ({
        route: String(entry?.route || '').trim(),
        message: String(entry?.message || '').trim(),
      }))
      .filter((entry) => entry.route && entry.message)
      .slice(-20);
  }

  function buildUploadFailureMessage(upload, assets = []) {
    const results = upload && typeof upload === 'object' && upload.results && typeof upload.results === 'object'
      ? upload.results
      : {};
    const messages = [];

    for (const asset of Array.isArray(assets) ? assets : []) {
      const route = String(asset?.route || '').trim();
      const result = route ? results[route] : null;
      const message = String(result?.message || result?.details || '').trim();

      if (!route || !message) {
        continue;
      }

      messages.push(`${route}: ${message}`);
    }

    if (messages.length > 0) {
      return Array.from(new Set(messages)).join(' ');
    }

    return String(upload?.message || '').trim() || 'Could not upload assets to Smooth Bundle.';
  }

  async function updateSyncJob(jobId, patch) {
    if (!jobId) {
      return null;
    }

    const runtimeState = strapi.plugin('smoothbundle').service('api-accelerator-runtime-state');
    const state = await runtimeState.update((current) => {
      const existing = current.syncJob || {};

      if (existing.id && existing.id !== jobId && existing.status === 'running') {
        return {};
      }

      return {
        syncJob: {
          ...existing,
          id: jobId,
          ...(patch || {}),
        },
      };
    });

    return state.syncJob || null;
  }

  async function reconcileStaleSyncState() {
    const runtimeState = strapi.plugin('smoothbundle').service('api-accelerator-runtime-state');
    const state = await runtimeState.get();
    const currentJob = state.syncJob || null;
    const syncLock = state.syncLock || { owner: '', expiresAt: 0 };
    const lockActive = Boolean(syncLock.owner) && Number(syncLock.expiresAt || 0) > Date.now();

    if (currentJob?.status !== 'running' || lockActive) {
      return {
        state,
        staleCleared: false,
      };
    }

    const nextState = await runtimeState.update((current) => ({
      syncLock: {
        owner: '',
        expiresAt: 0,
      },
      syncJob: {
        ...(current.syncJob || currentJob),
        status: 'failed',
        finishedAt: nowIso(),
        currentRoute: '',
        errorMessage: 'Previous sync timed out or was interrupted.',
      },
    }));

    return {
      state: nextState,
      staleCleared: true,
    };
  }

  async function buildCollectionAssets(entry, settings) {
    const originFetcher = strapi.plugin('smoothbundle').service('api-accelerator-origin-fetcher');
    const smoothClient = strapi.plugin('smoothbundle').service('smooth-client');
    const pageSize = settings.collectionSyncPerPage;
    const pages = [];
    const pageUrls = [];

    for (let page = 1; page <= MAX_SYNC_PAGES; page += 1) {
      const response = await originFetcher.fetchJson(entry.route, {
        settings,
        query: {
          'pagination[page]': page,
          'pagination[pageSize]': pageSize,
        },
      });

      if (!response.success) {
        return {
          success: false,
          message: response.errorMessage || `Could not fetch ${entry.route}.`,
          httpStatus: response.status,
        };
      }

      const data = Array.isArray(response.data) ? response.data : [];
      if (data.length === 0) {
        break;
      }

      const target = collectionPageTarget(entry.route, page);
      const normalizedData = normalizeApiResponseDataForSync(entry.contentTypeUid, data);

      pages.push({
        route: `${entry.route}#page-${page}`,
        uploadTarget: target,
        json: serializeJson({
          data: normalizedData,
          meta: response.meta || {},
        }),
      });

      const publicUrl = smoothClient.buildPublicUrlForUploadTarget(target.path, target.filename, settings);
      pageUrls.push(publicUrl || `${target.path}/${target.filename}`);

      const pageCount = Number(response.meta?.pagination?.pageCount || 1);
      if (page >= pageCount || data.length < pageSize) {
        break;
      }
    }

    if (pages.length === 0) {
      return {
        success: false,
        message: `Collection ${entry.route} returned no data.`,
        httpStatus: 404,
      };
    }

    const manifestTarget = buildUploadTarget(entry.route);
    const manifest = serializeJson({
      per_page: pageSize,
      total_pages: pages.length,
      pages: pageUrls,
    });

    return {
      success: true,
      httpStatus: 200,
      assets: [
        {
          route: entry.route,
          uploadTarget: manifestTarget,
          json: manifest,
        },
        ...pages,
      ],
      jsonHash: md5([manifest, ...pages.map((asset) => asset.json)].join(':')),
      jsonSize: pages.reduce((sum, asset) => sum + Buffer.byteLength(asset.json), Buffer.byteLength(manifest)),
      syncedFileCount: pages.length + 1,
    };
  }

  async function buildSingleAsset(entry, settings) {
    const originFetcher = strapi.plugin('smoothbundle').service('api-accelerator-origin-fetcher');
    const response = await originFetcher.fetchJson(entry.route, { settings });

    if (!response.success) {
      return {
        success: false,
        message: response.errorMessage || `Could not fetch ${entry.route}.`,
        httpStatus: response.status,
      };
    }

    const json = serializeJson(normalizeApiResponseDataForSync(entry.contentTypeUid, response.data ?? null));

    return {
      success: true,
      httpStatus: response.status,
      assets: [
        {
          route: entry.route,
          uploadTarget: buildUploadTarget(entry.assetRoute || entry.route),
          json,
        },
      ],
      jsonHash: md5(json),
      jsonSize: Buffer.byteLength(json),
      syncedFileCount: 1,
    };
  }

  async function purgeRemovedRoutes(discoverySummary) {
    const uploadedRemovedRoutes = (discoverySummary.removed || [])
      .filter((entry) => entry.syncStatus === 'uploaded')
      .map((entry) => entry.route);

    if (uploadedRemovedRoutes.length === 0) {
      return;
    }

    await strapi.plugin('smoothbundle').service('smooth-client').deleteRouteAssets(uploadedRemovedRoutes, 'api-accelerator');
  }

  function buildRoutesForContentChange(change) {
    const uid = String(change?.uid || '').trim();
    const documentId = String(change?.documentId || '').trim();
    const contentType = strapi.contentTypes?.[uid];

    if (!contentType) {
      return [];
    }

    const base = pathToContentApiRoute(contentType);

    if (base.type === 'singleType') {
      return [base.route];
    }

    if (!documentId) {
      return [base.route];
    }

    return [base.route, `${base.route}/${documentId}`];
  }

  return {
    async forceResetSyncState(reason = 'Sync state was reset.') {
      const runtimeState = strapi.plugin('smoothbundle').service('api-accelerator-runtime-state');
      isRunning = false;

      const nextState = await runtimeState.update((current) => {
        const currentJob = current.syncJob || {};
        const wasRunning = currentJob.status === 'running';

        return {
          syncLock: {
            owner: '',
            expiresAt: 0,
          },
          syncJob: {
            ...currentJob,
            status: wasRunning ? 'failed' : 'idle',
            currentRoute: '',
            finishedAt: nowIso(),
            errorMessage: reason,
          },
        };
      });

      return nextState.syncJob || null;
    },

    async getSyncJobStatus() {
      const { state } = await reconcileStaleSyncState();
      return state.syncJob || null;
    },

    async startManualSyncJob(routes = [], options = {}) {
      if (!(await isModuleEnabled())) {
        return {
          success: false,
          message: 'Enable the API Accelerator module first.',
        };
      }

      const runtimeState = strapi.plugin('smoothbundle').service('api-accelerator-runtime-state');
      const { state } = await reconcileStaleSyncState();
      const currentJob = state.syncJob || null;
      const currentLock = state.syncLock || { owner: '', expiresAt: 0 };
      const lockActive = Boolean(currentLock.owner) && Number(currentLock.expiresAt || 0) > Date.now();

      if (currentJob?.status === 'running' && lockActive) {
        return {
          success: false,
          busy: true,
          message: 'Sync is already running.',
          job: currentJob,
        };
      }

      const jobId = randomUUID();
      const job = await updateSyncJob(jobId, {
        status: 'running',
        trigger: options.trigger || 'manual',
        totalRoutes: 0,
        processedRoutes: 0,
        syncedRoutes: 0,
        failedRoutes: 0,
        skippedRoutes: 0,
        currentRoute: '',
        startedAt: nowIso(),
        finishedAt: '',
        errorMessage: '',
      });

      setImmediate(() => {
        this.syncRoutes(routes, {
          ...options,
          trigger: options.trigger || 'manual',
          syncJobId: jobId,
        }).catch(async (error) => {
          strapi.log.error(`[smoothbundle] API Accelerator sync job failed: ${error.message}`);
          await updateSyncJob(jobId, {
            status: 'failed',
            finishedAt: nowIso(),
            currentRoute: '',
            errorMessage: error.message || 'Sync failed.',
          });
        });
      });

      return {
        success: true,
        job,
      };
    },

    async discoverAndSync(options = {}) {
      if (!(await isModuleEnabled())) {
        return {
          success: false,
          message: 'Enable the API Accelerator module first.',
          processed: 0,
          synced: 0,
          failed: 0,
        };
      }

      const discovery = await strapi.plugin('smoothbundle').service('api-accelerator-discovery').discover(options);
      await purgeRemovedRoutes(discovery);
      return this.syncRoutes([], {
        ...options,
        trigger: options.trigger || 'manual',
        restrictContentTypes: options.contentTypes || [],
      });
    },

    async syncRoutes(routes = [], options = {}) {
      const syncJobId = String(options.syncJobId || '').trim();
      const forceUpload = options.forceUpload === true;

      if (!(await isModuleEnabled())) {
        await updateSyncJob(syncJobId, {
          status: 'failed',
          finishedAt: nowIso(),
          currentRoute: '',
          errorMessage: 'Enable the API Accelerator module first.',
        });
        return {
          success: false,
          message: 'Enable the API Accelerator module first.',
          processed: 0,
          synced: 0,
          failed: 0,
        };
      }

      if (isRunning) {
        await updateSyncJob(syncJobId, {
          status: 'failed',
          finishedAt: nowIso(),
          currentRoute: '',
          errorMessage: 'Sync is already running.',
        });
        return {
          success: false,
          message: 'Sync is already running.',
          processed: 0,
          synced: 0,
          failed: 0,
        };
      }

      const runtimeState = strapi.plugin('smoothbundle').service('api-accelerator-runtime-state');
      const lockOwner = `${instanceId}:sync:${Date.now()}`;
      const lockClaimed = await runtimeState.claimLock('syncLock', lockOwner, 15 * 60 * 1000);

      if (!lockClaimed) {
        await updateSyncJob(syncJobId, {
          status: 'failed',
          finishedAt: nowIso(),
          currentRoute: '',
          errorMessage: 'Sync is already running.',
        });
        return {
          success: false,
          busy: true,
          message: 'Sync is already running.',
          processed: 0,
          synced: 0,
          failed: 0,
        };
      }

      isRunning = true;

      try {
        const settings = await strapi.plugin('smoothbundle').service('api-accelerator-settings').getResolved();
        const repository = strapi.plugin('smoothbundle').service('api-accelerator-repository');
        const smoothClient = strapi.plugin('smoothbundle').service('smooth-client');

        if (!settings.connected) {
          await updateSyncJob(syncJobId, {
            status: 'failed',
            finishedAt: nowIso(),
            currentRoute: '',
            errorMessage: 'Connect to Smooth Bundle first.',
          });
          return {
            success: false,
            message: 'Connect to Smooth Bundle first.',
            processed: 0,
            synced: 0,
            failed: 0,
          };
        }

        const requestedRoutes = Array.isArray(routes) ? routes.filter(Boolean) : [];
        let candidates = await repository.findSyncable({
          routes: requestedRoutes.length > 0 ? requestedRoutes : undefined,
        });

        if (Array.isArray(options.restrictContentTypes) && options.restrictContentTypes.length > 0) {
          const allowed = new Set(options.restrictContentTypes);
          candidates = candidates.filter((entry) => allowed.has(entry.contentTypeUid));
        }

        const summary = {
          success: true,
          processed: candidates.length,
          synced: 0,
          failed: 0,
          skipped: 0,
        };
        const failedEntries = [];
        const pendingUploads = [];

        const pendingAssetCount = () =>
          pendingUploads.reduce((sum, item) => sum + item.result.assets.length, 0);

        const updateSummaryProgress = () =>
          updateSyncJob(syncJobId, {
            processedRoutes: summary.synced + summary.failed + summary.skipped,
            syncedRoutes: summary.synced,
            failedRoutes: summary.failed,
            skippedRoutes: summary.skipped,
            failedEntries: trimFailedEntries(failedEntries),
          });

        const markUploadFailure = async (entry, result, upload) => {
          const uploadFailureMessage = buildUploadFailureMessage(upload, result.assets);
          failedEntries.push({
            route: entry.route,
            message: uploadFailureMessage,
          });
          await repository.upsert({
            ...entry,
            status: 'error',
            syncStatus: 'upload_failed',
            httpStatus: result.httpStatus,
            jsonSize: result.jsonSize,
            syncedFileCount: result.syncedFileCount,
            lastError: uploadFailureMessage,
          });
          summary.failed += 1;
          summary.success = false;
          await updateSummaryProgress();
        };

        const markUploadSuccess = async (entry, result) => {
          await repository.upsert({
            ...entry,
            status: 'ready',
            syncStatus: 'uploaded',
            httpStatus: result.httpStatus,
            jsonSize: result.jsonSize,
            syncedFileCount: result.syncedFileCount,
            lastSyncedHash: result.jsonHash,
            lastSyncedAt: nowIso(),
            lastError: '',
          });
          summary.synced += 1;
          await updateSummaryProgress();
        };

        const flushPendingUploads = async () => {
          if (pendingUploads.length === 0) {
            return;
          }

          const currentBatch = pendingUploads.splice(0, pendingUploads.length);
          const upload = await smoothClient.uploadAssets(
            currentBatch.flatMap(({ result }) =>
              result.assets.map((asset) => ({
                ...asset,
                protected: Boolean(asset.protected),
              }))
            ),
            'api-accelerator',
            {
              batchSize: API_ACCELERATOR_UPLOAD_BATCH_SIZE,
            }
          );

          for (const batchEntry of currentBatch) {
            await runtimeState.refreshLock('syncLock', lockOwner, 15 * 60 * 1000);
            await updateSyncJob(syncJobId, {
              currentRoute: batchEntry.entry.route,
            });

            const hasUploadFailure = batchEntry.result.assets.some((asset) => {
              const result = upload?.results?.[asset.route];
              return !result || result.success !== true;
            });

            if (hasUploadFailure) {
              await markUploadFailure(batchEntry.entry, batchEntry.result, upload);
              continue;
            }

            await markUploadSuccess(batchEntry.entry, batchEntry.result);
          }
        };

        await updateSyncJob(syncJobId, {
          status: 'running',
          totalRoutes: candidates.length,
          processedRoutes: 0,
          syncedRoutes: 0,
          failedRoutes: 0,
          skippedRoutes: 0,
          currentRoute: '',
          errorMessage: '',
          failedEntries: [],
        });

        for (const entry of candidates) {
          await runtimeState.refreshLock('syncLock', lockOwner, 15 * 60 * 1000);
          await updateSyncJob(syncJobId, {
            currentRoute: entry.route,
          });

          const result = entry.kind === 'collection'
            ? await buildCollectionAssets(entry, settings)
            : await buildSingleAsset(entry, settings);

          if (!result.success) {
            failedEntries.push({
              route: entry.route,
              message: result.message,
            });
            await repository.upsert({
              ...entry,
              status: 'error',
              syncStatus: 'fetch_failed',
              httpStatus: result.httpStatus || 500,
              lastError: result.message,
            });
            summary.failed += 1;
            summary.success = false;
            await updateSummaryProgress();
            continue;
          }

          if (!forceUpload && entry.lastSyncedHash && entry.lastSyncedHash === result.jsonHash) {
            await repository.upsert({
              ...entry,
              status: 'ready',
              syncStatus: 'uploaded',
              httpStatus: result.httpStatus,
              jsonSize: result.jsonSize,
              syncedFileCount: result.syncedFileCount,
              lastError: '',
            });
            summary.skipped += 1;
            await updateSummaryProgress();
            continue;
          }

          pendingUploads.push({
            entry,
            result: {
              ...result,
              assets: result.assets.map((asset) => ({
                ...asset,
                protected: Boolean(entry.protected),
              })),
            },
          });

          if (pendingAssetCount() >= API_ACCELERATOR_UPLOAD_BATCH_SIZE) {
            await flushPendingUploads();
          }
        }

        await flushPendingUploads();

        const completedAt = nowIso();
        await strapi.plugin('smoothbundle').service('api-accelerator-settings').update({
          lastSyncAt: completedAt,
          ...(options.trigger === 'scheduled' ? { lastAutoSyncAt: completedAt } : {}),
        });

        await updateSyncJob(syncJobId, {
          status: summary.success ? 'completed' : 'failed',
          processedRoutes: summary.synced + summary.failed + summary.skipped,
          syncedRoutes: summary.synced,
          failedRoutes: summary.failed,
          skippedRoutes: summary.skipped,
          currentRoute: '',
          finishedAt: completedAt,
          errorMessage: summary.success ? '' : 'Some endpoints failed during sync.',
          failedEntries: trimFailedEntries(failedEntries),
        });

        return summary;
      } catch (error) {
        await updateSyncJob(syncJobId, {
          status: 'failed',
          finishedAt: nowIso(),
          currentRoute: '',
          errorMessage: error.message || 'Sync failed.',
        });
        throw error;
      } finally {
        isRunning = false;
        await runtimeState.releaseLock('syncLock', lockOwner);
      }
    },

    async queueContentChange(uid, documentId = '') {
      if (!(await isModuleEnabled())) {
        return;
      }

      const normalizedUid = String(uid || '').trim();
      if (!normalizedUid.startsWith('api::')) {
        return;
      }

      const settings = await strapi.plugin('smoothbundle').service('api-accelerator-settings').get();
      await strapi.plugin('smoothbundle').service('api-accelerator-runtime-state').queueContentChanges(
        [
          {
            uid: normalizedUid,
            documentId: String(documentId || '').trim(),
          },
        ],
        settings.debounceMs
      );
    },

    async flushPendingContentChanges() {
      if (!(await isModuleEnabled())) {
        return {
          processed: 0,
        };
      }

      const settings = await strapi.plugin('smoothbundle').service('api-accelerator-settings').getResolved();
      const runtimeState = strapi.plugin('smoothbundle').service('api-accelerator-runtime-state');
      const changes = await runtimeState.takeDuePendingContentChanges();

      if (changes.length === 0) {
        return {
          processed: 0,
        };
      }

      try {
        const contentTypes = Array.from(new Set(changes.map((entry) => String(entry.uid || '').trim()).filter(Boolean)));
        const specificRoutes = Array.from(
          new Set(
            changes.flatMap((change) => buildRoutesForContentChange(change))
          )
        );
        const genericContentTypes = Array.from(
          new Set(
            changes
              .filter((change) => {
                const uid = String(change?.uid || '').trim();
                const contentType = strapi.contentTypes?.[uid];

                if (!contentType) {
                  return false;
                }

                const base = pathToContentApiRoute(contentType);
                return base.type === 'collection' && !String(change?.documentId || '').trim();
              })
              .map((change) => String(change.uid || '').trim())
              .filter(Boolean)
          )
        );
        const discovery = await strapi.plugin('smoothbundle').service('api-accelerator-discovery').discover({
          settings,
          contentTypes,
        });
        await purgeRemovedRoutes(discovery);

        const syncResults = [];

        if (specificRoutes.length > 0) {
          syncResults.push(await this.syncRoutes(specificRoutes, {
            trigger: 'content_change',
          }));
        }

        if (genericContentTypes.length > 0) {
          syncResults.push(await this.syncRoutes([], {
            trigger: 'content_change',
            restrictContentTypes: genericContentTypes,
          }));
        }

        const busyResult = syncResults.find((result) => result?.busy);
        if (busyResult) {
          await runtimeState.requeueContentChanges(changes, settings.debounceMs);
        }

        return {
          processed: changes.length,
          syncResults,
        };
      } catch (error) {
        await runtimeState.requeueContentChanges(changes, settings.debounceMs);
        throw error;
      }
    },

    async runScheduledSync() {
      if (!(await isModuleEnabled())) {
        return;
      }

      const settings = await strapi.plugin('smoothbundle').service('api-accelerator-settings').getResolved();
      const intervalMs = parseIntervalFrequency(settings.autoSyncFrequency);

      if (!intervalMs) {
        return;
      }

      const lastRun = settings.lastAutoSyncAt ? new Date(settings.lastAutoSyncAt).getTime() : 0;
      if (Date.now() - lastRun < intervalMs) {
        return;
      }

      const discovery = await strapi.plugin('smoothbundle').service('api-accelerator-discovery').discover({ settings });
      await purgeRemovedRoutes(discovery);
      await this.syncRoutes([], {
        trigger: 'scheduled',
      });
    },

    async tickScheduler() {
      if (!(await isModuleEnabled())) {
        return;
      }

      const runtimeState = strapi.plugin('smoothbundle').service('api-accelerator-runtime-state');
      const lockOwner = `${instanceId}:scheduler:${Date.now()}`;
      const lockClaimed = await runtimeState.claimLock(
        'schedulerLock',
        lockOwner,
        Math.max(5000, SCHEDULER_POLL_MS - 1000)
      );

      if (!lockClaimed) {
        return;
      }

      try {
        await this.flushPendingContentChanges();
        await this.runScheduledSync();
      } finally {
        await runtimeState.releaseLock('schedulerLock', lockOwner);
      }
    },

    startScheduler() {
      if (schedulerHandle) {
        return;
      }

      schedulerHandle = setInterval(() => {
        this.tickScheduler().catch((error) => {
          strapi.log.error(`[smoothbundle] Scheduled sync failed: ${error.message}`);
        });
      }, SCHEDULER_POLL_MS);

      this.tickScheduler().catch((error) => {
        strapi.log.error(`[smoothbundle] Initial scheduler tick failed: ${error.message}`);
      });
    },

    stopScheduler() {
      if (schedulerHandle) {
        clearInterval(schedulerHandle);
        schedulerHandle = null;
      }
    },

    async purgeRoutes(routes = []) {
      if (!(await isModuleEnabled())) {
        return {
          success: false,
          message: 'Enable the API Accelerator module first.',
          deleted: 0,
        };
      }

      const repository = strapi.plugin('smoothbundle').service('api-accelerator-repository');
      const normalizedRoutes = Array.isArray(routes) ? routes.filter(Boolean) : [];
      const deletion = await strapi.plugin('smoothbundle').service('smooth-client').deleteRouteAssets(
        normalizedRoutes,
        'api-accelerator'
      );

      for (const route of normalizedRoutes) {
        const current = await repository.get(route);
        if (!current) {
          continue;
        }

        await repository.upsert({
          ...current,
          syncStatus: 'detected',
          syncedFileCount: 0,
          lastSyncedHash: '',
          lastSyncedAt: '',
          lastError: '',
        });
      }

      return deletion;
    },
  };
};
