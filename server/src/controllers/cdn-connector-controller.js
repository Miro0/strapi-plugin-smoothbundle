'use strict';

const pluginId = require('../plugin-id');

function plugin(strapi) {
  return strapi.plugin(pluginId);
}

function buildGrantAccessAssetPath(path = '', filename = '') {
  const normalizedFilename = String(filename || '').trim().replace(/^\/+/, '');

  if (!normalizedFilename) {
    return '';
  }

  const normalizedPath = String(path || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');

  return normalizedPath ? `/${normalizedPath}/${normalizedFilename}` : `/${normalizedFilename}`;
}

function findOriginalSyncedEntry(entry = {}) {
  const syncedEntries = Array.isArray(entry?.syncedEntries) ? entry.syncedEntries : [];

  return syncedEntries.find((item) => String(item?.key || '').trim() === 'original') || syncedEntries[0] || null;
}

function buildGrantAccessAssetOptions(mediaItems = []) {
  const options = new Set();

  for (const item of Array.isArray(mediaItems) ? mediaItems : []) {
    if (!item?.protected || !String(item?.mime || '').toLowerCase().startsWith('image/')) {
      continue;
    }

    const originalEntry = findOriginalSyncedEntry(item);
    const value = buildGrantAccessAssetPath(originalEntry?.path, originalEntry?.filename);

    if (value) {
      options.add(value);
    }
  }

  return Array.from(options.values()).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

async function ensureEnabled(strapi, ctx) {
  const enabled = await plugin(strapi).service('module-registry').isEnabled('cdn-connector');

  if (enabled) {
    return true;
  }

  ctx.status = 400;
  ctx.body = {
    error: {
      message: 'Enable the CDN Connector module first.',
    },
  };

  return false;
}

module.exports = ({ strapi }) => ({
  async updateSettings(ctx) {
    const settingsService = plugin(strapi).service('cdn-connector-settings');
    const coreSettingsService = plugin(strapi).service('core-settings');
    const smoothClient = plugin(strapi).service('smooth-client');
    const syncService = plugin(strapi).service('cdn-connector-sync');
    const offloadService = plugin(strapi).service('cdn-connector-offload');
    const payload = ctx.request.body || {};
    const previousSettings = await settingsService.get();
    const previousProject = await coreSettingsService.getProject('cdn-connector');
    const nextCustomSubdomain = String(payload.customSubdomain || '').trim();
    const customSubdomainChanged = nextCustomSubdomain !== String(previousProject.customSubdomain || '').trim();

    if (customSubdomainChanged) {
      const projectResult = await smoothClient.updateProjectCustomSubdomain('cdn-connector', nextCustomSubdomain);

      if (!projectResult.success) {
        ctx.status = 400;
        ctx.body = {
          error: {
            message: projectResult.message || 'Could not update the Smooth Bundle project subdomain.',
          },
        };
        return;
      }
    }

    const settings = await settingsService.update(payload);
    const enabled = await plugin(strapi).service('module-registry').isEnabled('cdn-connector');
    const shouldResync =
      previousSettings.offloadLocalFiles !== settings.offloadLocalFiles && settings.offloadLocalFiles;
    let syncResult = null;

    offloadService.invalidateCache();

    if (enabled && shouldResync) {
      syncResult = await syncService.startSyncJob([], {
        trigger: 'settings_change',
        force: true,
      });
    }

    const project = await coreSettingsService.getProject('cdn-connector');

    ctx.body = {
      data: {
        settings: {
          ...settings,
          customSubdomain: project.customSubdomain || '',
        },
        project,
        mediaItems: await syncService.listMediaItems(),
        syncResult,
        syncJob: syncResult?.job || null,
        syncTriggered: Boolean(syncResult?.success && syncResult?.job),
      },
    };
  },

  async sync(ctx) {
    if (!(await ensureEnabled(strapi, ctx))) {
      return;
    }

    const settingsService = plugin(strapi).service('cdn-connector-settings');
    const fileIds = Array.isArray(ctx.request.body?.fileIds)
      ? ctx.request.body.fileIds
      : ctx.request.body?.fileId
        ? [ctx.request.body.fileId]
        : [];
    const normalizedFileIds = fileIds.map((value) => String(value || '').trim()).filter(Boolean);
    const result = await plugin(strapi).service('cdn-connector-sync').startSyncJob(fileIds, {
      trigger: 'manual',
      force: Boolean(ctx.request.body?.force),
      markSyncable: true,
    });

    if (result?.success && normalizedFileIds.length === 0) {
      await settingsService.update({
        autoSyncUploads: true,
      });
    }

    ctx.body = {
      data: {
        result,
        job: result.job || null,
        mediaItems: await plugin(strapi).service('cdn-connector-sync').listMediaItems(),
      },
    };
    ctx.status = result.success ? 202 : result.busy ? 409 : 400;
  },

  async unsync(ctx) {
    if (!(await ensureEnabled(strapi, ctx))) {
      return;
    }

    const settingsService = plugin(strapi).service('cdn-connector-settings');
    const fileIds = Array.isArray(ctx.request.body?.fileIds)
      ? ctx.request.body.fileIds
      : ctx.request.body?.fileId
        ? [ctx.request.body.fileId]
        : [];
    const normalizedFileIds = fileIds.map((value) => String(value || '').trim()).filter(Boolean);
    const result = await plugin(strapi).service('cdn-connector-sync').startUnsyncJob(fileIds, {
      trigger: 'unsync',
    });

    if (result?.success && normalizedFileIds.length === 0) {
      await settingsService.update({
        autoSyncUploads: false,
      });
    }

    ctx.body = {
      data: {
        result,
        job: result.job || null,
        mediaItems: await plugin(strapi).service('cdn-connector-sync').listMediaItems(),
      },
    };
    ctx.status = result.success ? 202 : result.busy ? 409 : 400;
  },

  async setProtection(ctx) {
    if (!(await ensureEnabled(strapi, ctx))) {
      return;
    }

    const fileIds = Array.isArray(ctx.request.body?.fileIds)
      ? ctx.request.body.fileIds
      : ctx.request.body?.fileId
        ? [ctx.request.body.fileId]
        : [];
    const protectedValue = Boolean(ctx.request.body?.protected);
    const result = await plugin(strapi).service('cdn-connector-sync').startSyncJob(fileIds, {
      trigger: protectedValue ? 'protect' : 'unprotect',
      force: true,
      markSyncable: true,
      protectedOverride: protectedValue,
    });

    ctx.body = {
      data: {
        result,
        job: result.job || null,
        mediaItems: await plugin(strapi).service('cdn-connector-sync').listMediaItems(),
      },
    };
    ctx.status = result.success ? 202 : result.busy ? 409 : 400;
  },

  async revokeAccess(ctx) {
    if (!(await ensureEnabled(strapi, ctx))) {
      return;
    }

    const accessId = String(ctx.request.body?.accessId || '').trim();
    const result = await plugin(strapi).service('smooth-client').revokeProjectAccess(accessId, 'cdn-connector');

    if (!result.success) {
      ctx.status = 400;
      ctx.body = {
        error: {
          message: result.message || 'Could not revoke project access.',
        },
      };
      return;
    }

    ctx.body = {
      data: {
        result,
      },
    };
  },

  async grantAccess(ctx) {
    if (!(await ensureEnabled(strapi, ctx))) {
      return;
    }

    const email = String(ctx.request.body?.email || '').trim();
    const expiresAt = String(ctx.request.body?.expiresAt || '').trim();
    const assets = Array.isArray(ctx.request.body?.assets) ? ctx.request.body.assets : [];
    const normalizedAssets = Array.from(new Set(assets.map((entry) => String(entry || '').trim()).filter(Boolean)));
    const mediaItems = await plugin(strapi).service('cdn-connector-sync').listMediaItems();
    const assetOptions = buildGrantAccessAssetOptions(mediaItems);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      ctx.status = 400;
      ctx.body = {
        error: {
          message: 'Enter a valid email address.',
        },
      };
      return;
    }

    if (assetOptions.length === 0) {
      ctx.status = 400;
      ctx.body = {
        error: {
          message: 'You have no protected assets in this project to assign access to',
        },
      };
      return;
    }

    let normalizedExpiresAt = null;

    if (expiresAt) {
      const localDate = new Date(expiresAt);

      if (!Number.isFinite(localDate.getTime())) {
        ctx.status = 400;
        ctx.body = {
          error: {
            message: 'Enter a valid expiration date and time.',
          },
        };
        return;
      }

      normalizedExpiresAt = localDate.toISOString();
    }

    const allowedAssets = new Set(assetOptions);
    const selectedAssets = normalizedAssets.filter((entry) => allowedAssets.has(entry));
    const assetsPayload = selectedAssets.length === 0 ? true : selectedAssets;
    const result = await plugin(strapi)
      .service('smooth-client')
      .grantProjectAccess(email, assetsPayload, normalizedExpiresAt, 'cdn-connector');

    if (!result.success) {
      ctx.status = 400;
      ctx.body = {
        error: {
          message: result.message || 'Could not grant access.',
        },
      };
      return;
    }

    ctx.body = {
      data: {
        result,
      },
    };
  },

  async syncStatus(ctx) {
    if (!(await ensureEnabled(strapi, ctx))) {
      return;
    }

    const job = await plugin(strapi).service('cdn-connector-sync').getSyncJobStatus();

    ctx.body = {
      data: {
        job,
      },
    };
  },

  async listRestorableAssets(ctx) {
    if (!(await ensureEnabled(strapi, ctx))) {
      return;
    }

    const settings = await plugin(strapi).service('cdn-connector-settings').get();
    if (settings.deleteCdnAssetsWithMediaItems) {
      ctx.body = { data: { assets: [] } };
      return;
    }

    const result = await plugin(strapi).service('cdn-connector-sync').listRestorableMediaAssets();
    ctx.body = {
      data: {
        assets: result.success ? result.data : [],
        message: result.success ? '' : result.message || '',
      },
    };
    ctx.status = result.success ? 200 : 400;
  },

  async restoreAsset(ctx) {
    if (!(await ensureEnabled(strapi, ctx))) {
      return;
    }

    const settings = await plugin(strapi).service('cdn-connector-settings').get();
    if (settings.deleteCdnAssetsWithMediaItems) {
      ctx.status = 400;
      ctx.body = {
        error: {
          message: 'Restore from CDN is available only when automatic CDN deletion is disabled.',
        },
      };
      return;
    }

    const result = await plugin(strapi).service('cdn-connector-sync').restoreMediaAssetFromCdn(ctx.request.body?.assetId);
    ctx.body = {
      data: {
        result,
        mediaItems: await plugin(strapi).service('cdn-connector-sync').listMediaItems(),
      },
    };
    ctx.status = result.success ? 200 : 400;
  },
});
