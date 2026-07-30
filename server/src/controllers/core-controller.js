'use strict';

const {
  buildProjectDashboardUrl,
  buildProjectPanelPath,
  buildUploadTargetsForRouteAssets,
  escapeHtml,
} = require('../utils/helpers');
const pluginId = require('../plugin-id');

function plugin(strapi) {
  return strapi.plugin(pluginId);
}

function buildModuleProject(settings, moduleId) {
  const project = settings.moduleProjects?.[moduleId];

  if (!project) {
    return null;
  }

  return {
    projectId: project.projectId || '',
    projectSlug: project.projectSlug || '',
    projectType: project.projectType || '',
    assetsCount: Math.max(0, Number(project.assetsCount) || 0),
    customSubdomain: project.customSubdomain || '',
    dashboardUrl: buildProjectDashboardUrl(settings.userSlug, project.projectSlug),
  };
}

function buildModules(settings, modules = []) {
  return modules.map((module) => ({
    ...module,
    project: buildModuleProject(settings, module.id),
  }));
}

function buildAccount(settings) {
  return {
    connected: Boolean(settings.connected),
    authKeyId: settings.authKeyId,
    authVerificationUrl: settings.authVerificationUrl,
    authSessionStatus: settings.authSessionStatus,
    authMode: settings.authMode,
    userSlug: settings.userSlug,
    userName: settings.userName,
    userEmail: settings.userEmail,
    userPlan: settings.userPlan,
    userPlanLabel: settings.userPlanLabel,
    statusSummary: settings.statusSummary || null,
    lastConnectionAt: settings.lastConnectionAt,
    lastStatusSyncAt: settings.lastStatusSyncAt,
    lastProjectCreationAt: settings.lastProjectCreationAt,
    lastAuthStartedAt: settings.lastAuthStartedAt,
    moduleProjects: Object.keys(settings.moduleProjects || {}).reduce((acc, moduleId) => {
      acc[moduleId] = buildModuleProject(settings, moduleId);
      return acc;
    }, {}),
  };
}

function buildAccountResponse(strapi, settings) {
  const account = buildAccount(settings);

  if (Boolean(settings.connected) && Number(settings.userPlan) === -1 && String(settings.accessToken || '').trim()) {
    account.planAction = {
      action: 'create_free_account',
      nonce: plugin(strapi).service('action-nonce').create({
        action: 'create_free_account',
        plan: settings.userPlan,
        accessToken: settings.accessToken,
      }),
    };
  } else {
    account.planAction = null;
  }

  return account;
}

function extractListRows(payload) {
  if (Array.isArray(payload)) {
    return payload.filter((entry) => entry && typeof entry === 'object');
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const buckets = [payload.data, payload.rows, payload.accesses, payload.assets, payload.usage, payload.results];

  for (const bucket of buckets) {
    if (Array.isArray(bucket)) {
      return bucket.filter((entry) => entry && typeof entry === 'object');
    }
  }

  return [];
}

function parseDateValue(value) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function summarizeAccessAssets(assets = []) {
  const normalizedAssets = (Array.isArray(assets) ? assets : [])
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);

  if (normalizedAssets.length === 0) {
    return 'All protected assets';
  }

  if (normalizedAssets.length === 1) {
    return normalizedAssets[0];
  }

  return `${normalizedAssets[0]} +${normalizedAssets.length - 1} more`;
}

function extractAccessAssets(item = {}) {
  if (Array.isArray(item.assets)) {
    return item.assets
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry;
        }

        if (entry && typeof entry === 'object') {
          return String(
            entry.label || entry.name || entry.fileName || entry.file_name || entry.assetName || entry.asset_name || entry.id || ''
          ).trim();
        }

        return '';
      })
      .filter(Boolean);
  }

  return [];
}

function normalizeAccessRow(item = {}) {
  const assets = extractAccessAssets(item);

  return {
    id: String(item.id || item.accessId || item.access_id || item.uuid || '').trim(),
    email: String(item.email || item.userEmail || item.user_email || item?.user?.email || '').trim() || 'Unknown email',
    assets,
    assetsLabel: summarizeAccessAssets(assets),
    expiresAt: String(item.expiresAt || item.expires_at || item.expiration || item.expireAt || item.expire_at || '').trim(),
    updatedAt: String(item.updatedAt || item.updated_at || '').trim(),
    createdAt: String(item.createdAt || item.created_at || '').trim(),
  };
}

function buildAccessRows(response = {}) {
  return extractListRows(response.data).map((item) => normalizeAccessRow(item));
}

function buildUsageByAssetMap(response = {}) {
  const usageByAsset = new Map();

  for (const row of extractListRows(response.data)) {
    const assetId = String(row.assetId || row.asset_id || '').trim();

    if (!assetId) {
      continue;
    }

    const previous = usageByAsset.get(assetId);
    const previousTimestamp = parseDateValue(previous?.updatedAt || previous?.updated_at || previous?.date || '');
    const nextTimestamp = parseDateValue(row.updatedAt || row.updated_at || row.date || '');

    if (!previous || nextTimestamp >= previousTimestamp) {
      usageByAsset.set(assetId, row);
    }
  }

  return usageByAsset;
}

function isUnusedAssetEntrySynced(entry = {}) {
  const syncedEntries = Array.isArray(entry?.syncedEntries) ? entry.syncedEntries : [];
  const syncStatus = String(entry?.syncStatus || '').trim();
  const hasProjectAssetId = syncedEntries.some((item) => String(item?.projectAssetId || item?.assetId || item?.asset_id || '').trim());

  return syncStatus === 'uploaded' && hasProjectAssetId;
}

function resolveUnusedAssetLabel(entry = {}, mediaByFileId = new Map()) {
  const fileId = String(entry?.fileId || '').trim();
  const matchedMediaItem = fileId ? mediaByFileId.get(fileId) : null;

  if (matchedMediaItem?.name) {
    return String(matchedMediaItem.name).trim();
  }

  const firstSyncedEntry = Array.isArray(entry?.syncedEntries) ? entry.syncedEntries[0] : null;
  const fallbackPath = buildGrantAccessAssetPath(firstSyncedEntry?.path, firstSyncedEntry?.filename);

  return fallbackPath || `Asset ${fileId || 'unknown'}`;
}

function buildUnusedAssetRows(repositoryEntries = [], mediaItems = [], usageResponse = {}) {
  const usageByAsset = buildUsageByAssetMap(usageResponse);
  const mediaByFileId = new Map(
    (Array.isArray(mediaItems) ? mediaItems : [])
      .map((item) => [String(item?.fileId || '').trim(), item])
      .filter(([fileId]) => fileId)
  );

  return (Array.isArray(repositoryEntries) ? repositoryEntries : []).flatMap((entry) => {
    if (!isUnusedAssetEntrySynced(entry)) {
      return [];
    }

    const syncedEntries = Array.isArray(entry?.syncedEntries) ? entry.syncedEntries : [];
    const assetIds = Array.from(
      new Set(
        syncedEntries
          .map((entry) => String(entry?.projectAssetId || entry?.assetId || entry?.asset_id || '').trim())
          .filter(Boolean)
      )
    );
    const matchedUsageRows = assetIds
      .map((assetId) => usageByAsset.get(assetId))
      .filter(Boolean)
      .sort((left, right) => {
        const rightTimestamp = parseDateValue(right?.updatedAt || right?.updated_at || right?.date || '');
        const leftTimestamp = parseDateValue(left?.updatedAt || left?.updated_at || left?.date || '');
        return rightTimestamp - leftTimestamp;
      });
    const usageRow = matchedUsageRows[0] || null;
    const fallbackAssetId = assetIds[0] || buildGrantAccessAssetPath(syncedEntries[0]?.path, syncedEntries[0]?.filename);

    return [
      {
        id: String(entry.fileId || fallbackAssetId).trim(),
        assetId: fallbackAssetId,
        asset: resolveUnusedAssetLabel(entry, mediaByFileId),
        updatedAt: String(usageRow?.updatedAt || usageRow?.updated_at || usageRow?.date || '').trim(),
        hasUsageRecord: Boolean(usageRow),
      },
    ];
  });
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
  const options = new Map();

  for (const item of Array.isArray(mediaItems) ? mediaItems : []) {
    if (!item?.protected || !String(item?.mime || '').toLowerCase().startsWith('image/')) {
      continue;
    }

    const originalEntry = findOriginalSyncedEntry(item);
    const value = buildGrantAccessAssetPath(originalEntry?.path, originalEntry?.filename);

    if (!value) {
      continue;
    }

    options.set(value, {
      value,
      label: value,
    });
  }

  return Array.from(options.values()).sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }));
}

function buildApiAcceleratorGrantAccessAssetOptions(endpoints = []) {
  const options = new Map();

  for (const endpoint of Array.isArray(endpoints) ? endpoints : []) {
    if (!endpoint?.protected || String(endpoint?.syncStatus || '').trim() !== 'uploaded') {
      continue;
    }

    const uploadTargets = buildUploadTargetsForRouteAssets(
      endpoint.assetRoute || endpoint.route,
      Math.max(1, Number(endpoint.syncedFileCount) || 1)
    );

    for (const target of uploadTargets) {
      const value = buildGrantAccessAssetPath(target.path, target.filename);
      if (value) {
        options.set(value, { value, label: value });
      }
    }
  }

  return Array.from(options.values()).sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }));
}

function getUnusedAssetsRetentionLabel(plan) {
  switch (Number(plan)) {
    case -1:
      return '1 day';
    case 1:
      return '90 days';
    case 2:
    case 3:
      return '365 days';
    case 0:
    default:
      return '30 days';
  }
}

function renderAutoSubmitPage({ actionUrl, fields, title }) {
  const hiddenFields = Object.entries(fields || {})
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`
    )
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        margin: 0;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f6f6f9;
        color: #181826;
      }
      main {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        box-sizing: border-box;
      }
      section {
        width: 100%;
        max-width: 440px;
        background: #ffffff;
        border: 1px solid #dcdce4;
        border-radius: 12px;
        padding: 24px;
        box-sizing: border-box;
        box-shadow: 0 8px 24px rgba(24, 24, 38, 0.08);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 20px;
        line-height: 1.3;
      }
      p {
        margin: 0 0 16px;
        line-height: 1.5;
      }
      button {
        appearance: none;
        border: 0;
        border-radius: 8px;
        padding: 10px 14px;
        font: inherit;
        font-weight: 600;
        background: #4945ff;
        color: #ffffff;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>${escapeHtml(title)}</h1>
        <p>Redirecting you to Smooth Bundle…</p>
        <form id="smoothcdn-auto-login" method="POST" action="${escapeHtml(actionUrl)}">
          ${hiddenFields}
          <button type="submit">Continue</button>
        </form>
      </section>
    </main>
    <script>
      window.setTimeout(function () {
        var form = document.getElementById('smoothcdn-auto-login');
        if (form) {
          form.submit();
        }
      }, 0);
    </script>
  </body>
</html>`;
}

function renderRedirectPage({ redirectUrl, title, message }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="0;url=${escapeHtml(redirectUrl)}" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body>
    <p>${escapeHtml(message || 'Redirecting back to Strapi.')}</p>
    <p><a href="${escapeHtml(redirectUrl)}">Continue to Strapi</a></p>
    <script>window.location.replace(${JSON.stringify(redirectUrl)});</script>
  </body>
</html>`;
}

function getRequestOrigin(ctx) {
  const protocol = String(ctx.protocol || 'http').trim() || 'http';
  const host = String(ctx.host || '').trim();

  return host ? `${protocol}://${host}` : '';
}

function getSafeReturnUrl(ctx, fallbackUrl) {
  const requested = String(ctx.query?.return_url || ctx.query?.returnUrl || '').trim();

  if (!requested) {
    return fallbackUrl;
  }

  try {
    const requestedUrl = new URL(requested);
    const requestOrigin = getRequestOrigin(ctx);

    if (requestOrigin && requestedUrl.origin === requestOrigin) {
      return requestedUrl.toString();
    }
  } catch (error) {
    return fallbackUrl;
  }

  return fallbackUrl;
}

function respondWithResult(ctx, result, account) {
  if (result.success) {
    ctx.body = {
      data: {
        ...result,
        account,
      },
    };
    ctx.status = 200;
    return;
  }

  ctx.body = {
    error: {
      message: result.message || 'Request failed.',
    },
    data: {
      ...result,
      account,
    },
  };
  ctx.status = 400;
}

async function runModulePostEnable(strapi, moduleId) {
  const result = {
    initialScanResult: null,
    initialScanError: '',
    cdnConnectorSyncResult: null,
  };

  if (moduleId === 'api-accelerator') {
    try {
      result.initialScanResult = await plugin(strapi).service('api-accelerator-discovery').discover();
    } catch (error) {
      result.initialScanError = error.message || 'Could not scan endpoints after enabling the module.';
    }
  }

  if (moduleId === 'cdn-connector') {
    await plugin(strapi).service('cdn-connector-settings').update({
      autoSyncUploads: true,
    });
    result.cdnConnectorSyncResult = await plugin(strapi).service('cdn-connector-sync').startSyncJob([], {
      trigger: 'module_enable',
      force: true,
      markSyncable: true,
    });
  }

  return result;
}

module.exports = ({ strapi }) => ({
  async bootstrap(ctx) {
    const coreSettings = await plugin(strapi).service('core-settings').get();
    const modules = buildModules(coreSettings, await plugin(strapi).service('module-registry').list());
    const apiAcceleratorSettings = await plugin(strapi).service('api-accelerator-settings').get();
    const cdnConnectorSettings = await plugin(strapi).service('cdn-connector-settings').get();
    const repository = plugin(strapi).service('api-accelerator-repository');
    const runtimeState = await plugin(strapi).service('api-accelerator-runtime-state').get();
    const cdnConnectorRuntimeState = await plugin(strapi).service('cdn-connector-runtime-state').get();
    const cdnConnectorMediaItems = await plugin(strapi).service('cdn-connector-sync').listMediaItems();
    const cdnConnectorRepositoryEntries = await plugin(strapi).service('cdn-connector-repository').all();
    const apiAcceleratorAccessesResponse = await plugin(strapi).service('smooth-client').getProjectAccesses('api-accelerator');
    const accessesResponse = await plugin(strapi).service('smooth-client').getProjectAccesses('cdn-connector');
    const dailyAssetUsageResponse = await plugin(strapi).service('smooth-client').getDailyAssetUsage('cdn-connector');
    const cdnProject = buildModuleProject(coreSettings, 'cdn-connector');

    ctx.body = {
      data: {
        core: {
          settings: coreSettings,
          account: buildAccountResponse(strapi, coreSettings),
        },
        modules,
        apiAccelerator: {
          settings: apiAcceleratorSettings,
          endpoints: await repository.all(),
          stats: await repository.stats(),
          accesses: buildAccessRows(apiAcceleratorAccessesResponse),
          accessesMessage: apiAcceleratorAccessesResponse.success ? '' : String(apiAcceleratorAccessesResponse.message || '').trim(),
          grantAccessAssetOptions: buildApiAcceleratorGrantAccessAssetOptions(await repository.all()),
          syncJob: runtimeState.syncJob || null,
        },
        cdnConnector: {
          settings: cdnConnectorSettings,
          mediaItems: cdnConnectorMediaItems,
          accesses: buildAccessRows(accessesResponse),
          accessesMessage: accessesResponse.success ? '' : String(accessesResponse.message || '').trim(),
          unusedAssets: buildUnusedAssetRows(
            cdnConnectorRepositoryEntries,
            cdnConnectorMediaItems,
            dailyAssetUsageResponse
          ),
          unusedAssetsMessage: dailyAssetUsageResponse.success ? '' : String(dailyAssetUsageResponse.message || '').trim(),
          unusedAssetsRetentionLabel: getUnusedAssetsRetentionLabel(coreSettings.userPlan),
          grantAccessAssetOptions: buildGrantAccessAssetOptions(cdnConnectorMediaItems),
          dashboardAccessesUrl:
            cdnProject?.projectId ? `${buildProjectPanelPath(cdnProject.projectId)}/accesses` : '',
          syncJob: cdnConnectorRuntimeState.syncJob || null,
        },
      },
    };
  },

  async updateSettings(ctx) {
    const settings = await plugin(strapi).service('core-settings').update(ctx.request.body || {});
    ctx.body = {
      data: {
        settings,
        account: buildAccountResponse(strapi, settings),
      },
    };
  },

  async startLogin(ctx) {
    const result = await plugin(strapi).service('smooth-client').startLogin(ctx.request.body || {});
    const nextSettings = result.settings || (await plugin(strapi).service('core-settings').get());
    respondWithResult(ctx, result, buildAccountResponse(strapi, nextSettings));
  },

  async authCallback(ctx) {
    const result = await plugin(strapi).service('smooth-client').completeBrowserLogin(
      ctx.query?.api_key || ctx.query?.apiKey
    );
    const settings = result.settings || (await plugin(strapi).service('core-settings').get());
    const redirectUrl = getSafeReturnUrl(ctx, plugin(strapi).service('smooth-client').buildAdminPluginUrl(settings));

    ctx.status = result.success ? 200 : 400;
    ctx.type = 'html';
    ctx.body = renderRedirectPage({
      redirectUrl,
      title: result.success ? 'Smooth Bundle connected' : 'Smooth Bundle connection failed',
      message: result.message || (result.success ? 'Smooth Bundle connected.' : 'Smooth Bundle connection failed.'),
    });
  },

  async syncStatus(ctx) {
    const result = await plugin(strapi).service('smooth-client').syncStatus();
    const nextSettings = result.settings || (await plugin(strapi).service('core-settings').get());
    respondWithResult(ctx, result, buildAccountResponse(strapi, nextSettings));
  },

  async disconnect(ctx) {
    const result = await plugin(strapi).service('smooth-client').disconnect();
    const nextSettings = result.settings || (await plugin(strapi).service('core-settings').get());

    ctx.body = {
      data: {
        ...result,
        account: buildAccountResponse(strapi, nextSettings),
      },
    };
  },

  async purgePluginData(ctx) {
    const apiSyncJob = await plugin(strapi).service('api-accelerator-sync').getSyncJobStatus();
    const cdnSyncJob = await plugin(strapi).service('cdn-connector-sync').getSyncJobStatus();

    if (apiSyncJob?.status === 'running' || cdnSyncJob?.status === 'running') {
      ctx.status = 409;
      ctx.body = {
        error: {
          message: 'Stop running sync jobs before purging plugin data.',
        },
        data: {
          apiSyncJob,
          cdnSyncJob,
        },
      };
      return;
    }

    const coreSettingsService = plugin(strapi).service('core-settings');
    const registry = plugin(strapi).service('module-registry');
    const apiAcceleratorSettings = plugin(strapi).service('api-accelerator-settings');
    const apiAcceleratorRuntimeState = plugin(strapi).service('api-accelerator-runtime-state');
    const apiAcceleratorRepository = plugin(strapi).service('api-accelerator-repository');
    const cdnConnectorSettings = plugin(strapi).service('cdn-connector-settings');
    const cdnConnectorRuntimeState = plugin(strapi).service('cdn-connector-runtime-state');
    const cdnConnectorRepository = plugin(strapi).service('cdn-connector-repository');
    const cdnConnectorOptimizeQueue = plugin(strapi).service('cdn-connector-optimize-queue');

    await registry.saveState(registry.defaults());
    await apiAcceleratorSettings.update(apiAcceleratorSettings.defaults());
    await apiAcceleratorRuntimeState.save(apiAcceleratorRuntimeState.defaults());
    await apiAcceleratorRepository.save([]);
    await cdnConnectorSettings.update(cdnConnectorSettings.defaults());
    await cdnConnectorRuntimeState.save(cdnConnectorRuntimeState.defaults());
    await cdnConnectorRepository.save([]);
    await cdnConnectorOptimizeQueue.save(cdnConnectorOptimizeQueue.defaults());

    const nextSettings = await coreSettingsService.resetPluginDataPreservingAccount();
    const nextModules = buildModules(nextSettings, await registry.list());

    ctx.body = {
      data: {
        success: true,
        message: 'Plugin data purged. Smooth Bundle login session preserved.',
        core: {
          settings: nextSettings,
          account: buildAccountResponse(strapi, nextSettings),
        },
        account: buildAccountResponse(strapi, nextSettings),
        modules: nextModules,
        apiAccelerator: {
          settings: await apiAcceleratorSettings.get(),
          endpoints: [],
          accesses: [],
          accessesMessage: '',
          grantAccessAssetOptions: [],
          syncJob: (await apiAcceleratorRuntimeState.get()).syncJob || null,
        },
        cdnConnector: {
          settings: await cdnConnectorSettings.get(),
          mediaItems: [],
          accesses: [],
          accessesMessage: '',
          unusedAssets: [],
          unusedAssetsMessage: '',
          unusedAssetsRetentionLabel: getUnusedAssetsRetentionLabel(nextSettings.userPlan),
          restorableAssets: [],
          restorableAssetsMessage: '',
          grantAccessAssetOptions: [],
          syncJob: (await cdnConnectorRuntimeState.get()).syncJob || null,
        },
      },
    };
  },

  async getProjectToken(ctx) {
    const moduleId = String(ctx.params?.moduleId || '').trim();
    const result = await plugin(strapi).service('smooth-client').getProjectToken(moduleId);
    const nextSettings = await plugin(strapi).service('core-settings').get();

    respondWithResult(ctx, result, buildAccountResponse(strapi, nextSettings));
  },

  async createFreeAccount(ctx) {
    const settings = await plugin(strapi).service('core-settings').get();
    const nonce = String(ctx.request.body?.nonce || '').trim();
    const isValidNonce = plugin(strapi).service('action-nonce').verify(nonce, {
      action: 'create_free_account',
      plan: settings.userPlan,
      accessToken: settings.accessToken,
    });

    if (!isValidNonce) {
      ctx.status = 403;
      ctx.type = 'html';
      ctx.body = '<p>Invalid or expired action token.</p>';
      return;
    }

    const result = await plugin(strapi).service('smooth-client').prepareCreateFreeAccount();

    if (!result.success) {
      ctx.status = 400;
      ctx.type = 'html';
      ctx.body = `<p>${escapeHtml(result.message || 'Request failed.')}</p>`;
      return;
    }

    ctx.status = 200;
    ctx.type = 'html';
    ctx.set('Cache-Control', 'no-store');
    ctx.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action https://smoothcdn.com; base-uri 'none'");
    ctx.set('Referrer-Policy', 'no-referrer');
    ctx.body = renderAutoSubmitPage({
      actionUrl: result.autoLoginUrl,
      title: 'Continue to Smooth Bundle',
      fields: {
        api_key: result.apiKey,
        next: result.next,
      },
    });
  },

  async toggleModule(ctx) {
    const moduleId = String(ctx.params?.moduleId || '').trim();
    const enabled = Boolean(ctx.request.body?.enabled);
    const registry = plugin(strapi).service('module-registry');
    const definition = await registry.getDefinition(moduleId);

    if (!definition) {
      ctx.status = 404;
      ctx.body = {
        error: {
          message: 'Module not found.',
        },
      };
      return;
    }

    if (enabled) {
      const result = await plugin(strapi).service('smooth-client').startProjectIntegration(moduleId, ctx.request.body || {});
      const coreSettings = await plugin(strapi).service('core-settings').get();

      ctx.status = result.success ? 200 : 400;
      ctx.body = {
        data: {
          ...result,
          account: buildAccountResponse(strapi, coreSettings),
          modules: buildModules(coreSettings, await registry.list()),
        },
      };

      if (!result.success) {
        ctx.body.error = {
          message: result.message || 'Could not start Smooth Bundle integration.',
        };
      }

      return;
    }

    const moduleEntry = await registry.setEnabled(moduleId, false);

    if (moduleId === 'cdn-connector') {
      plugin(strapi).service('cdn-connector-offload').invalidateCache();
    }

    const coreSettings = await plugin(strapi).service('core-settings').get();
    const modules = buildModules(coreSettings, await registry.list());
    const apiAcceleratorEndpoints = moduleId === 'api-accelerator'
      ? await plugin(strapi).service('api-accelerator-repository').all()
      : [];
    const cdnConnectorMediaItems = moduleId === 'cdn-connector'
      ? await plugin(strapi).service('cdn-connector-sync').listMediaItems()
      : [];

    ctx.body = {
      data: {
        module: {
          ...moduleEntry,
          project: buildModuleProject(coreSettings, moduleEntry.id),
        },
        modules,
        account: buildAccountResponse(strapi, coreSettings),
        projectCreated: false,
        projectCreationError: '',
        initialScanResult: null,
        initialScanError: '',
        endpoints: apiAcceleratorEndpoints,
        mediaItems: cdnConnectorMediaItems,
        syncResult: null,
        syncJob: null,
        syncTriggered: false,
      },
    };
  },

  async moduleProjectCallback(ctx) {
    const moduleId = String(ctx.params?.moduleId || '').trim();
    const projectId = String(ctx.query?.project_id || ctx.query?.projectId || '').trim();
    const verification = await plugin(strapi).service('smooth-client').verifyIntegratedProject(moduleId, projectId);
    let message = verification.message || '';

    if (verification.success) {
      await plugin(strapi).service('module-registry').setEnabled(moduleId, true);

      if (moduleId === 'cdn-connector') {
        plugin(strapi).service('cdn-connector-offload').invalidateCache();
      }

      const postEnable = await runModulePostEnable(strapi, moduleId);

      if (postEnable.initialScanError) {
        message = postEnable.initialScanError;
      } else if (postEnable.cdnConnectorSyncResult?.message) {
        message = postEnable.cdnConnectorSyncResult.message;
      } else {
        message = 'Smooth Bundle module enabled.';
      }
    }

    const settings = verification.settings || (await plugin(strapi).service('core-settings').get());
    const redirectUrl = getSafeReturnUrl(ctx, plugin(strapi).service('smooth-client').buildAdminPluginUrl(settings));

    ctx.status = verification.success ? 200 : 400;
    ctx.type = 'html';
    ctx.body = renderRedirectPage({
      redirectUrl,
      title: verification.success ? 'Smooth Bundle module enabled' : 'Smooth Bundle module setup failed',
      message,
    });
  },
});
