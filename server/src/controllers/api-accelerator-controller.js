'use strict';

const pluginId = require('../plugin-id');
const { buildUploadTargetsForRouteAssets } = require('../utils/helpers');

function plugin(strapi) {
  return strapi.plugin(pluginId);
}

function buildGrantAccessAssetPath(path = '', filename = '') {
  const normalizedFilename = String(filename || '').trim().replace(/^\/+/, '');
  if (!normalizedFilename) {
    return '';
  }

  const normalizedPath = String(path || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return normalizedPath ? `/${normalizedPath}/${normalizedFilename}` : `/${normalizedFilename}`;
}

function buildGrantAccessAssetOptions(endpoints = []) {
  const options = new Set();

  for (const endpoint of Array.isArray(endpoints) ? endpoints : []) {
    if (!endpoint?.protected || String(endpoint?.syncStatus || '').trim() !== 'uploaded') {
      continue;
    }

    for (const target of buildUploadTargetsForRouteAssets(endpoint.assetRoute || endpoint.route, Math.max(1, Number(endpoint.syncedFileCount) || 1))) {
      const value = buildGrantAccessAssetPath(target.path, target.filename);
      if (value) {
        options.add(value);
      }
    }
  }

  return Array.from(options.values()).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

async function ensureEnabled(strapi, ctx) {
  const enabled = await plugin(strapi).service('module-registry').isEnabled('api-accelerator');
  if (enabled) {
    return true;
  }

  ctx.status = 400;
  ctx.body = {
    error: {
      message: 'Enable the API Accelerator module first.',
    },
  };

  return false;
}

module.exports = ({ strapi }) => ({
  async updateSettings(ctx) {
    const settingsService = plugin(strapi).service('api-accelerator-settings');
    const coreSettingsService = plugin(strapi).service('core-settings');
    const smoothClient = plugin(strapi).service('smooth-client');
    const payload = ctx.request.body || {};
    const previousSettings = await settingsService.get();
    const previousProject = await coreSettingsService.getProject('api-accelerator');
    const nextCustomSubdomain = String(payload.customSubdomain || '').trim();
    const customSubdomainChanged = nextCustomSubdomain !== String(previousProject.customSubdomain || '').trim();

    if (customSubdomainChanged) {
      const projectResult = await smoothClient.updateProjectCustomSubdomain('api-accelerator', nextCustomSubdomain);

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
    const enabled = await plugin(strapi).service('module-registry').isEnabled('api-accelerator');
    const collectionPageSizeChanged =
      Number(previousSettings.collectionSyncPerPage) !== Number(settings.collectionSyncPerPage);
    let discoveryResult = null;
    let syncResult = null;

    if (enabled && collectionPageSizeChanged) {
      await plugin(strapi).service('api-accelerator-sync').forceResetSyncState(
        'Sync state was reset after API Accelerator settings changed.'
      );
    }

    if (enabled && collectionPageSizeChanged) {
      discoveryResult = await plugin(strapi).service('api-accelerator-discovery').discover();
    }

    if (enabled && (collectionPageSizeChanged || customSubdomainChanged)) {
      syncResult = await plugin(strapi).service('api-accelerator-sync').startManualSyncJob([], {
        trigger: 'settings_change',
        forceUpload: customSubdomainChanged,
      });
    }

    const endpoints = enabled
      ? await plugin(strapi).service('api-accelerator-repository').all()
      : [];
    const project = await coreSettingsService.getProject('api-accelerator');

    ctx.body = {
      data: {
        settings: {
          ...settings,
          customSubdomain: project.customSubdomain || '',
        },
        project,
        endpoints,
        discoveryResult,
        syncJob: syncResult?.job || null,
        syncTriggered: Boolean(syncResult?.success && syncResult?.job),
        scanTriggered: Boolean(discoveryResult),
      },
    };
  },

  async discover(ctx) {
    if (!(await ensureEnabled(strapi, ctx))) {
      return;
    }

    const result = await plugin(strapi).service('api-accelerator-discovery').discover({
      contentTypes: ctx.request.body?.contentTypes || [],
    });
    const endpoints = await plugin(strapi).service('api-accelerator-repository').all();

    ctx.body = {
      data: {
        result,
        endpoints,
      },
    };
  },

  async sync(ctx) {
    if (!(await ensureEnabled(strapi, ctx))) {
      return;
    }

    const result = await plugin(strapi).service('api-accelerator-sync').startManualSyncJob(ctx.request.body?.routes || [], {
      trigger: 'manual',
      restrictContentTypes: ctx.request.body?.contentTypes || [],
      forceUpload: Boolean(ctx.request.body?.force || ctx.request.body?.forceUpload),
    });

    ctx.body = {
      data: {
        result,
        job: result.job || null,
      },
    };
    ctx.status = result.success ? 202 : result.busy ? 409 : 400;
  },

  async syncStatus(ctx) {
    if (!(await ensureEnabled(strapi, ctx))) {
      return;
    }

    const job = await plugin(strapi).service('api-accelerator-sync').getSyncJobStatus();

    ctx.body = {
      data: {
        job,
      },
    };
  },

  async setSyncable(ctx) {
    if (!(await ensureEnabled(strapi, ctx))) {
      return;
    }

    const route = ctx.request.body?.route;
    const routes = Array.isArray(ctx.request.body?.routes) ? ctx.request.body.routes : [];
    const syncable = Boolean(ctx.request.body?.syncable);
    const normalizedRoutes = Array.from(
      new Set(
        [...routes, route]
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      )
    );

    if (normalizedRoutes.length === 0) {
      ctx.status = 400;
      ctx.body = {
        error: {
          message: 'Provide at least one endpoint route.',
        },
      };
      return;
    }

    if (!syncable) {
      const purgeResult = await plugin(strapi).service('api-accelerator-sync').purgeRoutes(normalizedRoutes);

      if (!purgeResult.success) {
        ctx.status = 400;
        ctx.body = {
          error: {
            message: purgeResult.message || 'Could not delete synced assets from Smooth Bundle.',
          },
          data: {
            result: purgeResult,
            endpoints: await plugin(strapi).service('api-accelerator-repository').all(),
          },
        };
        return;
      }
    }

    const entries = await plugin(strapi).service('api-accelerator-repository').setSyncableMany(normalizedRoutes, syncable);

    if (entries.length === 0) {
      ctx.status = 404;
      ctx.body = {
        error: {
          message: 'Endpoint not found.',
        },
      };
      return;
    }

    ctx.body = {
      data: {
        entries,
      },
    };
  },

  async setProtection(ctx) {
    if (!(await ensureEnabled(strapi, ctx))) {
      return;
    }

    const route = ctx.request.body?.route;
    const routes = Array.isArray(ctx.request.body?.routes) ? ctx.request.body.routes : [];
    const protectedValue = Boolean(ctx.request.body?.protected);
    const normalizedRoutes = Array.from(
      new Set(
        [...routes, route]
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      )
    );

    if (normalizedRoutes.length === 0) {
      ctx.status = 400;
      ctx.body = {
        error: {
          message: 'Provide at least one endpoint route.',
        },
      };
      return;
    }

    const repository = plugin(strapi).service('api-accelerator-repository');
    const entries = await repository.setProtectedMany(normalizedRoutes, protectedValue);

    if (entries.length === 0) {
      ctx.status = 404;
      ctx.body = {
        error: {
          message: 'Endpoint not found.',
        },
      };
      return;
    }

    const syncResult = await plugin(strapi).service('api-accelerator-sync').startManualSyncJob(normalizedRoutes, {
      trigger: protectedValue ? 'protect' : 'unprotect',
      forceUpload: true,
    });

    ctx.body = {
      data: {
        entries,
        endpoints: await repository.all(),
        result: syncResult,
        job: syncResult.job || null,
      },
    };
    ctx.status = syncResult.success ? 202 : syncResult.busy ? 409 : 400;
  },

  async purge(ctx) {
    if (!(await ensureEnabled(strapi, ctx))) {
      return;
    }

    const routes = ctx.request.body?.routes || [];
    const result = await plugin(strapi).service('api-accelerator-sync').purgeRoutes(routes);
    const endpoints = await plugin(strapi).service('api-accelerator-repository').all();

    ctx.body = {
      data: {
        result,
        endpoints,
      },
    };
    ctx.status = result.success ? 200 : 400;
  },

  async revokeAccess(ctx) {
    if (!(await ensureEnabled(strapi, ctx))) {
      return;
    }

    const accessId = String(ctx.request.body?.accessId || '').trim();
    const result = await plugin(strapi).service('smooth-client').revokeProjectAccess(accessId, 'api-accelerator');

    if (!result.success) {
      ctx.status = 400;
      ctx.body = { error: { message: result.message || 'Could not revoke project access.' } };
      return;
    }

    ctx.body = { data: { result } };
  },

  async grantAccess(ctx) {
    if (!(await ensureEnabled(strapi, ctx))) {
      return;
    }

    const email = String(ctx.request.body?.email || '').trim();
    const expiresAt = String(ctx.request.body?.expiresAt || '').trim();
    const assets = Array.isArray(ctx.request.body?.assets) ? ctx.request.body.assets : [];
    const normalizedAssets = Array.from(new Set(assets.map((entry) => String(entry || '').trim()).filter(Boolean)));
    const endpoints = await plugin(strapi).service('api-accelerator-repository').all();
    const assetOptions = buildGrantAccessAssetOptions(endpoints);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      ctx.status = 400;
      ctx.body = { error: { message: 'Enter a valid email address.' } };
      return;
    }

    if (assetOptions.length === 0) {
      ctx.status = 400;
      ctx.body = { error: { message: 'You have no protected assets in this project to assign access to' } };
      return;
    }

    let normalizedExpiresAt = null;
    if (expiresAt) {
      const localDate = new Date(expiresAt);
      if (!Number.isFinite(localDate.getTime())) {
        ctx.status = 400;
        ctx.body = { error: { message: 'Enter a valid expiration date and time.' } };
        return;
      }
      normalizedExpiresAt = localDate.toISOString();
    }

    const allowedAssets = new Set(assetOptions);
    const selectedAssets = normalizedAssets.filter((entry) => allowedAssets.has(entry));
    const assetsPayload = selectedAssets.length === 0 ? true : selectedAssets;
    const result = await plugin(strapi)
      .service('smooth-client')
      .grantProjectAccess(email, assetsPayload, normalizedExpiresAt, 'api-accelerator');

    if (!result.success) {
      ctx.status = 400;
      ctx.body = { error: { message: result.message || 'Could not grant access.' } };
      return;
    }

    ctx.body = { data: { result } };
  },
});
