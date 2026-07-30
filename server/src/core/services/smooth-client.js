'use strict';

const path = require('node:path');

const {
  CDN_API_BASE_URL,
  CDN_AUTH_API_BASE_URL,
  CDN_DELETE_URL,
  CDN_PUBLIC_HOST,
  CDN_UPLOAD_URL,
} = require('../../utils/constants');
const { nowIso } = require('../../utils/helpers');
const {
  buildUploadTarget,
  buildUploadTargetsForRouteAssets,
  normalizeRoute,
  safeJsonParse,
  slugify,
} = require('../../utils/helpers');

const DEFAULT_STRAPI_IMAGE_BREAKPOINTS = {
  large: 1000,
  medium: 750,
  small: 500,
};

function extractSlugCandidates(payload = {}) {
  return [
    payload.slug,
    payload.user_slug,
    payload.project_slug,
    payload?.user?.slug,
    payload?.user?.user_slug,
    payload?.project?.slug,
    payload?.project?.project_slug,
    payload?.currentProject?.slug,
    payload?.currentProject?.project_slug,
  ]
    .map((value) => slugify(value || ''))
    .filter(Boolean);
}

function extractUserSlug(payload = {}) {
  return extractSlugCandidates({
    slug: payload.user_slug,
    user: payload.user,
  })[0] || '';
}

function extractProjectSlug(payload = {}) {
  return extractSlugCandidates({
    project_slug: payload.project_slug,
    project: payload.project,
    currentProject: payload.currentProject,
  })[0] || '';
}

function normalizeCustomSubdomain(value) {
  const normalized = String(value || '').trim().toLowerCase();

  if (!normalized) {
    return '';
  }

  const hostCandidate = normalized
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/\.smoothbundle\.com$/i, '')
    .replace(/^\.+|\.+$/g, '');

  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(hostCandidate) ? hostCandidate : '';
}

function getStrapiImageVariants(strapi) {
  const configuredBreakpoints = strapi.config.get('plugin::upload.breakpoints', DEFAULT_STRAPI_IMAGE_BREAKPOINTS);
  const source =
    configuredBreakpoints && typeof configuredBreakpoints === 'object' && !Array.isArray(configuredBreakpoints)
      ? configuredBreakpoints
      : DEFAULT_STRAPI_IMAGE_BREAKPOINTS;
  const variants = {};

  for (const [name, value] of Object.entries(source)) {
    const normalizedName = String(name || '').trim();
    const width = Math.max(0, Number(value) || 0);

    if (!normalizedName || width < 1) {
      continue;
    }

    variants[normalizedName] = width;
  }

  return variants;
}

function extractCustomSubdomain(payload = {}) {
  return normalizeCustomSubdomain(
    payload.customSubdomain ||
      payload.custom_subdomain ||
      payload?.project?.customSubdomain ||
      payload?.project?.custom_subdomain ||
      payload?.currentProject?.customSubdomain ||
      payload?.currentProject?.custom_subdomain ||
      ''
  );
}

function planLabel(plan) {
  switch (Number(plan)) {
    case -1:
      return 'GUEST';
    case 0:
      return 'FREE';
    case 1:
      return 'STARTER';
    case 2:
      return 'PRO';
    case 3:
      return 'ENTERPRISE';
    default:
      return '';
  }
}

function pushMessage(messages, value) {
  const normalized = String(value || '').trim();
  if (normalized) {
    messages.push(normalized);
  }
}

function pushAnyMessage(messages, value) {
  if (typeof value === 'string') {
    pushMessage(messages, value);
    return;
  }

  if (value && typeof value === 'object') {
    pushMessage(messages, value.message);
    pushMessage(messages, value.detail);
    pushMessage(messages, value.title);
  }
}

function extractResponseMessage(payload = {}, status) {
  const messages = [];

  pushMessage(messages, payload?.message);
  pushAnyMessage(messages, payload?.error);
  pushMessage(messages, payload?.error?.message);
  pushMessage(messages, payload?.data?.message);
  pushAnyMessage(messages, payload?.data?.error);
  pushMessage(messages, payload?.data?.error?.message);
  pushMessage(messages, payload?.details);
  pushMessage(messages, payload?.error?.details?.message);
  pushMessage(messages, payload?.data?.details);
  pushMessage(messages, payload?.data?.error?.details?.message);

  const errorLists = [
    payload?.errors,
    payload?.details?.errors,
    payload?.error?.details?.errors,
    payload?.data?.errors,
    payload?.data?.details?.errors,
    payload?.data?.error?.details?.errors,
  ];

  for (const entries of errorLists) {
    if (!Array.isArray(entries)) {
      continue;
    }

    for (const entry of entries) {
      if (typeof entry === 'string') {
        pushMessage(messages, entry);
        continue;
      }

      if (entry && typeof entry === 'object') {
        pushMessage(messages, entry.message);
        pushMessage(messages, entry.detail);
        pushMessage(messages, entry.title);
      }
    }
  }

  const uniqueMessages = Array.from(new Set(messages));

  if (uniqueMessages.length > 0) {
    return uniqueMessages.join(' ');
  }

  return status ? `Smooth Bundle request failed (${status}).` : '';
}

function reconcileModuleProjects(moduleProjects = {}, projects = []) {
  const nextModuleProjects = {};

  for (const [moduleId, project] of Object.entries(moduleProjects || {})) {
    const currentProject = project && typeof project === 'object' ? project : {};
    const matchingProject = projects.find(
      (entry) => String(entry.id || '').trim() === String(currentProject.projectId || '').trim()
    );

    nextModuleProjects[moduleId] = {
      projectId: String(currentProject.projectId || '').trim(),
      projectSlug: matchingProject
        ? String(matchingProject.slug || currentProject.projectSlug || '').trim()
        : String(currentProject.projectSlug || '').trim(),
      projectType: matchingProject
        ? String(matchingProject.type || currentProject.projectType || '').trim()
        : String(currentProject.projectType || '').trim(),
      assetsCount: matchingProject ? Math.max(0, Number(matchingProject.assetsCount) || 0) : 0,
      customSubdomain: matchingProject
        ? extractCustomSubdomain(matchingProject) || String(currentProject.customSubdomain || '').trim()
        : String(currentProject.customSubdomain || '').trim(),
    };
  }

  return nextModuleProjects;
}

function getPrimaryModuleProject(moduleProjects = {}) {
  const entries = Object.entries(moduleProjects || {});

  const preferredEntry = entries.find(
    ([moduleId, project]) => moduleId === 'api-accelerator' && String(project?.projectId || '').trim()
  );

  if (preferredEntry) {
    return preferredEntry[1];
  }

  const firstAvailableEntry = entries.find(([, project]) => String(project?.projectId || '').trim());
  return firstAvailableEntry ? firstAvailableEntry[1] : null;
}

function toAssetArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, entry]) => ({
      key,
      ...(entry && typeof entry === 'object' ? entry : {}),
    }));
  }

  return [];
}

function normalizeUploadedAssetEntry(entry = {}) {
  const responseEntry = entry.response && typeof entry.response === 'object' ? entry.response : {};
  const responseAsset = responseEntry.asset && typeof responseEntry.asset === 'object' ? responseEntry.asset : {};
  const rawPath = String(
    entry.path ||
      entry.uploadPath ||
      entry.upload_path ||
      entry.targetPath ||
      entry.target_path ||
      entry.directory ||
      responseEntry.path ||
      responseEntry.uploadPath ||
      responseEntry.upload_path ||
      responseEntry.targetPath ||
      responseEntry.target_path ||
      responseEntry.directory ||
      responseAsset.path ||
      responseAsset.uploadPath ||
      responseAsset.upload_path ||
      responseAsset.targetPath ||
      responseAsset.target_path ||
      responseAsset.directory ||
      ''
  ).trim();
  const rawFilename = String(
    entry.filename ||
      entry.fileName ||
      entry.file_name ||
      entry.name ||
      entry.originalName ||
      entry.original_name ||
      responseEntry.filename ||
      responseEntry.fileName ||
      responseEntry.file_name ||
      responseEntry.name ||
      responseEntry.originalName ||
      responseEntry.original_name ||
      responseAsset.filename ||
      responseAsset.fileName ||
      responseAsset.file_name ||
      responseAsset.name ||
      responseAsset.originalName ||
      responseAsset.original_name ||
      ''
  ).trim();
  const normalizedPath = rawPath
    ? rawFilename
      ? rawPath
      : path.posix.dirname(rawPath) || '/'
    : '/';

  return {
    assetId: String(
      entry.id ||
        entry.assetId ||
        entry.asset_id ||
        responseEntry.id ||
        responseEntry.assetId ||
        responseEntry.asset_id ||
        responseAsset.id ||
        responseAsset.assetId ||
        responseAsset.asset_id ||
        ''
    ).trim(),
    filename: rawFilename || (rawPath ? path.posix.basename(rawPath) : ''),
    path: normalizedPath === '.' ? '/' : normalizedPath,
    success:
      Object.prototype.hasOwnProperty.call(entry, 'success') || Object.prototype.hasOwnProperty.call(entry, 'ok')
        ? Boolean(entry.success ?? entry.ok)
        : null,
    message: String(
      entry.message ||
        entry.detail ||
        entry.error ||
        responseEntry.message ||
        responseEntry.detail ||
        responseEntry.error ||
        responseAsset.message ||
        responseAsset.detail ||
        responseAsset.error ||
        ''
    ).trim(),
  };
}

function extractUploadedAssetEntries(payload = {}) {
  const buckets = [
    payload.assets,
    payload.data?.assets,
    payload.results,
    payload.data?.results,
    payload.uploaded,
    payload.data?.uploaded,
    payload.files,
    payload.data?.files,
  ];

  const entries = [];

  for (const bucket of buckets) {
    for (const entry of toAssetArray(bucket)) {
      const normalized = normalizeUploadedAssetEntry(entry);

      if (normalized.assetId || normalized.filename) {
        entries.push(normalized);
      }
    }
  }

  return entries;
}

function extractCollectionRows(payload = {}) {
  const buckets = [
    payload,
    payload?.data,
    payload?.rows,
    payload?.accesses,
    payload?.collaborators,
    payload?.assets,
    payload?.usage,
    payload?.results,
  ];

  for (const bucket of buckets) {
    if (Array.isArray(bucket)) {
      return bucket.filter((entry) => entry && typeof entry === 'object');
    }
  }

  return [];
}

function normalizeUploadFocusPoint(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const x = Number(value.x);
  const y = Number(value.y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return {
    x,
    y,
  };
}

function normalizeUploadMeta(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const focus = normalizeUploadFocusPoint(value.focus);

  if (!focus) {
    return null;
  }

  return {
    focus,
  };
}

module.exports = ({ strapi }) => ({
  async requestJson(method, path, options = {}) {
    try {
      const normalizedPath = String(path || '').trim();
      const resolvedPath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
      const baseUrl = resolvedPath.startsWith('/api/') ? CDN_AUTH_API_BASE_URL : CDN_API_BASE_URL;
      const response = await fetch(`${baseUrl}${resolvedPath}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
        body: method === 'GET' ? undefined : JSON.stringify(options.payload || {}),
      });

      const text = await response.text();
      const payload = safeJsonParse(text, {});

      return {
        success: response.ok,
        status: response.status,
        data: payload?.data && typeof payload.data === 'object' ? payload.data : payload,
        payload,
        message: extractResponseMessage(payload, response.status),
        details: payload?.details || '',
      };
    } catch (error) {
      return {
        success: false,
        status: 0,
        data: null,
        payload: null,
        message: String(error?.message || 'Could not reach Smooth Bundle.').trim() || 'Could not reach Smooth Bundle.',
        details: '',
      };
    }
  },

  getProjectLabel(baseUrl) {
    const configuredName = String(strapi.config.get('info.name') || '').trim();
    if (configuredName) {
      return configuredName;
    }

    try {
      const url = new URL(baseUrl);
      return url.hostname;
    } catch (error) {
      const host = String(strapi.config.get('server.host') || '').trim();
      return host || 'Strapi';
    }
  },

  buildProjectName(baseUrl, moduleName = '') {
    const projectLabel = this.getProjectLabel(baseUrl);
    const normalizedModuleName = String(moduleName || '').trim();

    if (normalizedModuleName === 'API Accelerator') {
      return `API Accelerator - ${projectLabel}`;
    }

    return normalizedModuleName ? `${normalizedModuleName} - ${projectLabel}` : projectLabel;
  },

  buildLoginLabel() {
    const host = strapi.config.get('server.host') || 'strapi';
    return `strapi-${host}`;
  },

  buildServerBaseUrl(settings = {}) {
    const configuredPublicBaseUrl = String(settings.publicBaseUrl || '').trim().replace(/\/+$/, '');
    const configuredServerUrl = String(strapi.config.get('server.url') || '').trim().replace(/\/+$/, '');
    const configuredHost = String(strapi.config.get('server.host') || '127.0.0.1').trim();
    const resolvedHost =
      configuredHost && !['0.0.0.0', '::', '[::]'].includes(configuredHost) ? configuredHost : '127.0.0.1';
    const port = strapi.config.get('server.port') || 1337;

    if (configuredPublicBaseUrl) {
      return configuredPublicBaseUrl;
    }

    if (configuredServerUrl) {
      if (/^https?:\/\//i.test(configuredServerUrl)) {
        return configuredServerUrl;
      }

      return `http://${resolvedHost}:${port}${
        configuredServerUrl.startsWith('/') ? configuredServerUrl : `/${configuredServerUrl}`
      }`;
    }

    return `http://${resolvedHost}:${port}`;
  },

  buildAdminPluginUrl(settings = {}) {
    const adminPath = String(strapi.config.get('admin.path') || '/admin').trim() || '/admin';
    const normalizedAdminPath = adminPath.startsWith('/') ? adminPath : `/${adminPath}`;

    return `${this.buildServerBaseUrl(settings)}${normalizedAdminPath.replace(/\/+$/, '')}/plugins/smoothbundle`;
  },

  buildCallbackUrl(pathname = '', settings = {}) {
    const normalizedPathname = String(pathname || '').trim();
    const pathWithLeadingSlash = normalizedPathname.startsWith('/') ? normalizedPathname : `/${normalizedPathname}`;

    return `${this.buildServerBaseUrl(settings)}/smoothbundle${pathWithLeadingSlash}`;
  },

  buildCallbackUrlFromBase(pathname = '', baseUrl = '', params = {}) {
    const normalizedBaseUrl = String(baseUrl || '').trim().replace(/\/+$/, '');

    if (!/^https?:\/\//i.test(normalizedBaseUrl)) {
      return this.buildCallbackUrl(pathname);
    }

    const normalizedPathname = String(pathname || '').trim();
    const pathWithLeadingSlash = normalizedPathname.startsWith('/') ? normalizedPathname : `/${normalizedPathname}`;
    const url = new URL(`/smoothbundle${pathWithLeadingSlash}`, normalizedBaseUrl);

    for (const [key, value] of Object.entries(params || {})) {
      const normalizedValue = String(value || '').trim();
      if (normalizedValue) {
        url.searchParams.set(key, normalizedValue);
      }
    }

    return url.toString();
  },

  buildIntegrateUrl(params = {}) {
    const url = new URL('https://smoothbundle.com/integrate');

    for (const [key, value] of Object.entries(params || {})) {
      const normalizedValue = String(value || '').trim();
      if (normalizedValue) {
        url.searchParams.set(key, normalizedValue);
      }
    }

    return url.toString();
  },

  resolveGuestUrl(current = {}, options = {}) {
    const candidate = String(options.url || current.publicBaseUrl || '').trim().replace(/\/+$/, '');
    if (candidate) {
      return candidate;
    }

    const configuredServerUrl = String(strapi.config.get('server.url') || '').trim().replace(/\/+$/, '');
    if (configuredServerUrl) {
      if (/^https?:\/\//i.test(configuredServerUrl)) {
        return configuredServerUrl;
      }

      const host = strapi.config.get('server.host') || '127.0.0.1';
      const port = strapi.config.get('server.port') || 1337;
      return `http://${host}:${port}${configuredServerUrl.startsWith('/') ? configuredServerUrl : `/${configuredServerUrl}`}`;
    }

    const host = strapi.config.get('server.host') || '127.0.0.1';
    const port = strapi.config.get('server.port') || 1337;
    return `http://${host}:${port}`;
  },

  buildGuestPayload(options = {}, current = {}) {
    const nameCandidate = String(options.name || current.guestName || 'Strapi Guest').trim();
    const urlCandidate = this.resolveGuestUrl(current, options);

    return {
      guest: true,
      name: nameCandidate || 'Strapi Guest',
      url: urlCandidate,
    };
  },

  async createApiKey(sessionToken, label = '') {
    const token = String(sessionToken || '').trim();

    if (!token) {
      return {
        success: false,
        message: 'Missing Smooth Bundle session token.',
      };
    }

    if (token.startsWith('scdn_')) {
      return {
        success: true,
        apiKey: token,
      };
    }

    const response = await this.requestJson('POST', '/api-keys', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      payload: {
        label: String(label || '').trim() || `strapi-${Date.now()}`,
      },
    });

    if (!response.success) {
      return {
        success: false,
        message: response.message || 'Could not generate a Smooth Bundle API key.',
      };
    }

    const data = response.data && typeof response.data === 'object' ? response.data : {};
    const apiKey = String(data.key || data.api_key || data.apiKey || '').trim();

    if (!apiKey) {
      return {
        success: false,
        message: 'Smooth Bundle did not return a valid API key.',
      };
    }

    return {
      success: true,
      apiKey,
    };
  },

  async startLogin(options = {}) {
    const settingsService = strapi.plugin('smoothbundle').service('core-settings');
    const current = await settingsService.get();
    const guestMode = options.guest === true;
    const payload = {
      label: this.buildLoginLabel(),
      ...(guestMode ? this.buildGuestPayload(options, current) : {}),
    };

    if (!guestMode) {
      return {
        success: true,
        status: 'redirect',
        redirectUrl: this.buildIntegrateUrl({
          api_key_name: payload.label,
          callback: this.buildCallbackUrlFromBase('/core/auth/callback', options.callbackBaseUrl, {
            return_url: options.returnUrl,
          }),
        }),
        settings: current,
      };
    }

    const response = await this.requestJson('POST', '/api/auth/cli', {
      payload,
    });

    if (!response.success) {
      return {
        success: false,
        message: response.message || 'Could not start the Smooth Bundle login flow.',
      };
    }

    const data = response.data && typeof response.data === 'object' ? response.data : {};
    const keyId = String(data.key_id || data.keyId || '').trim();
    const verificationUrl = String(data.verification_url || data.verificationUrl || '').trim();
    const status = String(data.status || (guestMode ? 'active' : 'pending')).trim() || 'pending';
    const accessToken = String(data.accessToken || data.api_key || data.apiKey || '').trim();

    if (accessToken) {
      const apiKeyResult = await this.createApiKey(
        accessToken,
        guestMode ? `${payload.label || 'strapi'}-guest` : `${payload.label || 'strapi'}-browser`
      );

      if (!apiKeyResult.success) {
        return {
          success: false,
          message: apiKeyResult.message || 'Could not generate a Smooth Bundle API key.',
        };
      }

      const storedToken = apiKeyResult.apiKey;

      const connectedSettings = await settingsService.markConnected({
        accessToken: storedToken,
      });
      const synced = await this.syncStatus();
      const nextSettings = synced.success ? synced.settings || connectedSettings : connectedSettings;

      return {
        success: true,
        keyId: '',
        verificationUrl,
        status: 'active',
        settings: nextSettings,
        message: synced.success
          ? 'Connected to Smooth Bundle.'
          : 'Connected to Smooth Bundle. Account details will refresh shortly.',
      };
    }

    if (!keyId) {
      return {
        success: false,
        message: 'Smooth Bundle did not return a valid login key.',
      };
    }

    const nextSettings = await settingsService.markPendingAuth({
      authKeyId: keyId,
      authVerificationUrl: verificationUrl,
      authSessionStatus: status,
      authMode: guestMode ? 'guest' : 'browser',
      guestName: payload.name || current.guestName,
    });

    return {
      success: true,
      keyId,
      verificationUrl,
      status,
      settings: nextSettings,
    };
  },

  async completeBrowserLogin(apiKey = '') {
    const settingsService = strapi.plugin('smoothbundle').service('core-settings');
    const normalizedApiKey = String(apiKey || '').trim();

    if (!normalizedApiKey) {
      return {
        success: false,
        message: 'Smooth Bundle did not return an API key.',
      };
    }

    const connectedSettings = await settingsService.markConnected({
      accessToken: normalizedApiKey,
    });
    const synced = await this.syncStatus();

    return {
      success: true,
      status: 'active',
      settings: synced.success ? synced.settings || connectedSettings : connectedSettings,
      message: synced.success
        ? 'Connected to Smooth Bundle.'
        : 'Connected to Smooth Bundle. Account details will refresh shortly.',
    };
  },

  async startProjectIntegration(moduleId, options = {}) {
    const settingsService = strapi.plugin('smoothbundle').service('core-settings');
    const registry = strapi.plugin('smoothbundle').service('module-registry');
    const current = await settingsService.get();
    const definition = await registry.getDefinition(moduleId);

    if (!definition) {
      return {
        success: false,
        message: 'Unknown Smooth Bundle module.',
      };
    }

    if (!current.connected || !current.accessToken) {
      return {
        success: false,
        message: 'Connect to Smooth Bundle before enabling a module.',
      };
    }

    return {
      success: true,
      status: 'redirect',
      moduleId: definition.id,
      redirectUrl: this.buildIntegrateUrl({
        project_type: definition.projectType || 'basic',
        callback: this.buildCallbackUrlFromBase(`/modules/${definition.id}/integrate/callback`, options.callbackBaseUrl, {
          return_url: options.returnUrl,
        }),
      }),
      settings: current,
    };
  },

  async verifyIntegratedProject(moduleId, projectId) {
    const settingsService = strapi.plugin('smoothbundle').service('core-settings');
    const registry = strapi.plugin('smoothbundle').service('module-registry');
    const current = await settingsService.get();
    const definition = await registry.getDefinition(moduleId);
    const normalizedProjectId = String(projectId || '').trim();

    if (!definition) {
      return {
        success: false,
        message: 'Unknown Smooth Bundle module.',
      };
    }

    if (!current.connected || !current.accessToken) {
      return {
        success: false,
        message: 'Connect to Smooth Bundle before enabling a module.',
      };
    }

    if (!normalizedProjectId) {
      return {
        success: false,
        message: 'Smooth Bundle did not return a project ID.',
      };
    }

    const response = await this.requestJson('GET', `/projects/${encodeURIComponent(normalizedProjectId)}`, {
      headers: {
        Authorization: `Bearer ${current.accessToken}`,
      },
    });

    if (!response.success) {
      return {
        success: false,
        message: response.message || 'Could not verify the Smooth Bundle project.',
      };
    }

    const projectData = response.data && typeof response.data === 'object' ? response.data : {};
    const projectType = String(projectData.type || projectData?.project?.type || '').trim();

    if (projectType !== String(definition.projectType || '').trim()) {
      return {
        success: false,
        message: 'The selected Smooth Bundle project has an invalid type for this module.',
      };
    }

    const nextSettings = await settingsService.markProjectCreated(moduleId, {
      projectId: String(projectData.id || projectData.project_id || projectData?.project?.id || normalizedProjectId).trim(),
      projectSlug: extractProjectSlug(projectData),
      projectType,
      assetsCount: Math.max(
        0,
        Number(
          projectData.assetsCount ||
            projectData.assets_count ||
            projectData?.project?.assetsCount ||
            projectData?.project?.assets_count ||
            0
        ) || 0
      ),
      customSubdomain: extractCustomSubdomain(projectData),
    });

    return {
      success: true,
      settings: nextSettings,
      project: await settingsService.getProject(moduleId),
    };
  },

  async syncStatus() {
    const settingsService = strapi.plugin('smoothbundle').service('core-settings');
    const current = await settingsService.get();
    const token = String(current.accessToken || '').trim();

    if (!token) {
      return {
        success: false,
        message: 'Connect to Smooth Bundle first.',
      };
    }

    const response = await this.requestJson('GET', '/status', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.success) {
      if ([401, 403].includes(response.status)) {
        await settingsService.markDisconnected();
      }

      return {
        success: false,
        message: response.message || 'Could not fetch account metadata from Smooth Bundle.',
      };
    }

    const data = response.data && typeof response.data === 'object' ? response.data : {};
    const projects = Array.isArray(data.projects) ? data.projects : [];

    const nextSettings = await settingsService.markStatus({
      connected: true,
      userSlug: extractUserSlug(data) || String(data.slug || '').trim(),
      userName: String(data.name || '').trim(),
      userEmail: String(data.email || '').trim(),
      userPlan: Number.isFinite(Number(data.plan)) ? Number(data.plan) : -1,
      userPlanLabel: planLabel(data.plan),
      moduleProjects: reconcileModuleProjects(current.moduleProjects, projects),
      statusSummary: {
        requests: Number(data?.usage?.requests || 0),
        maxRequests: Number(data?.usage?.maxRequests || data?.limits?.maxRequests || 0),
        bandwidth: Number(data?.usage?.bandwidth || 0),
        maxBandwidth: Number(data?.usage?.maxBandwidth || data?.limits?.bandwidth || 0),
        assetsPerProject: Number(data?.limits?.assetsPerProject || 0),
        periodEnd: String(data?.usage?.periodEnd || '').trim(),
      },
    });

    return {
      success: true,
      settings: nextSettings,
      status: {
        name: nextSettings.userName,
        email: nextSettings.userEmail,
        slug: nextSettings.userSlug,
        plan: nextSettings.userPlan,
        planLabel: nextSettings.userPlanLabel,
        projects,
      },
    };
  },

  async getProjectToken(moduleId) {
    const settingsService = strapi.plugin('smoothbundle').service('core-settings');
    const settings = await settingsService.get();
    const project = await settingsService.getProject(moduleId);

    if (!settings.connected || !settings.accessToken) {
      return {
        success: false,
        message: 'Connect to Smooth Bundle first.',
      };
    }

    if (!project.projectId) {
      return {
        success: false,
        message: 'Create the module project first.',
      };
    }

    const response = await this.requestJson('GET', `/projects/${encodeURIComponent(project.projectId)}`, {
      headers: {
        Authorization: `Bearer ${settings.accessToken}`,
      },
    });

    if (!response.success) {
      return {
        success: false,
        message: response.message || 'Could not fetch the project token.',
      };
    }

    const data = response.data && typeof response.data === 'object' ? response.data : {};
    const token = String(data.token || '').trim();

    if (!token) {
      return {
        success: false,
        message: 'Project token is not available.',
      };
    }

    return {
      success: true,
      token,
      projectId: project.projectId,
    };
  },

  async prepareCreateFreeAccount() {
    const settingsService = strapi.plugin('smoothbundle').service('core-settings');
    const settings = await settingsService.get();

    if (!settings.connected || !settings.accessToken) {
      return {
        success: false,
        message: 'Connect to Smooth Bundle first.',
      };
    }

    if (Number(settings.userPlan) !== -1) {
      return {
        success: false,
        message: 'Create free account is only available for guest accounts.',
      };
    }

    const apiKeyResult = await this.createApiKey(
      settings.accessToken,
      `strapi-guest-upgrade-${Date.now()}`
    );

    if (!apiKeyResult.success) {
      return {
        success: false,
        message: apiKeyResult.message || 'Could not prepare the Smooth Bundle upgrade flow.',
      };
    }
    const apiKey = String(apiKeyResult.apiKey || '').trim();

    if (apiKey && apiKey !== String(settings.accessToken || '').trim()) {
      await settingsService.update({
        accessToken: apiKey,
      });
    }

    return {
      success: true,
      apiKey,
      autoLoginUrl: `${CDN_AUTH_API_BASE_URL}/api/auth/login/auto`,
      next: '/panel/account/plan-billing/upgrade',
    };
  },

  async disconnect() {
    const settings = await strapi.plugin('smoothbundle').service('core-settings').markDisconnected();

    return {
      success: true,
      settings,
    };
  },

  async ensureProject(moduleId) {
    const settingsService = strapi.plugin('smoothbundle').service('core-settings');
    const registry = strapi.plugin('smoothbundle').service('module-registry');
    const current = await settingsService.get();
    const definition = await registry.getDefinition(moduleId);

    if (!definition) {
      return {
        success: false,
        message: 'Unknown Smooth Bundle module.',
      };
    }

    if (!current.connected || !current.accessToken) {
      return {
        success: false,
        message: 'Connect to Smooth Bundle before enabling a module.',
      };
    }

    const currentProject = await settingsService.getProject(moduleId);

    if (currentProject.projectId) {
      const currentProjectResponse = await this.requestJson(
        'GET',
        `/projects/${encodeURIComponent(currentProject.projectId)}`,
        {
          headers: {
            Authorization: `Bearer ${current.accessToken}`,
          },
        }
      );

      if (currentProjectResponse.success) {
        const existingProjectData =
          currentProjectResponse.data && typeof currentProjectResponse.data === 'object'
            ? currentProjectResponse.data
            : {};
        const nextSettings = await settingsService.markProjectCreated(moduleId, {
          projectId: String(
            existingProjectData.id ||
              existingProjectData.project_id ||
              existingProjectData?.project?.id ||
              currentProject.projectId
          ).trim(),
          projectSlug: extractProjectSlug(existingProjectData) || String(currentProject.projectSlug || '').trim(),
          projectType: String(
            existingProjectData.type ||
              existingProjectData?.project?.type ||
              currentProject.projectType ||
              definition.projectType ||
              ''
          ).trim(),
          assetsCount: Math.max(
            0,
            Number(
              existingProjectData.assetsCount ||
                existingProjectData.assets_count ||
                existingProjectData?.project?.assetsCount ||
                existingProjectData?.project?.assets_count ||
                currentProject.assetsCount ||
                0
              )
          ),
          customSubdomain: extractCustomSubdomain(existingProjectData) || currentProject.customSubdomain || '',
        });

        return {
          success: true,
          created: false,
          settings: nextSettings,
        };
      }

      if (currentProjectResponse.status !== 404) {
        return {
          success: false,
          message: currentProjectResponse.message || 'Could not verify the existing Smooth Bundle project.',
        };
      }
    }

    const projectResponse = await this.requestJson('POST', '/projects', {
      headers: {
        Authorization: `Bearer ${current.accessToken}`,
      },
      payload: {
        name: this.buildProjectName(
          current.publicBaseUrl || strapi.config.get('server.url') || 'strapi',
          definition.name
        ),
        type: definition.projectType || 'basic',
        blockBots: false,
        blockHeadless: false,
        failIfExist: false,
        ...(moduleId === 'cdn-connector'
          ? {
              imageVariants: getStrapiImageVariants(strapi),
            }
          : {}),
      },
    });

    if (!projectResponse.success) {
      return {
        success: false,
        message: projectResponse.message || 'Could not create a Smooth Bundle project.',
      };
    }

    const projectData = projectResponse.data && typeof projectResponse.data === 'object' ? projectResponse.data : {};
    const projectId = String(projectData.id || projectData.project_id || projectData?.project?.id || '').trim();
    const projectSlug = extractProjectSlug(projectData) || String(projectData.slug || '').trim();
    const projectType = String(projectData.type || definition.projectType || '').trim();
    const customSubdomain = extractCustomSubdomain(projectData);

    if (!projectId) {
      return {
        success: false,
        message: 'Smooth Bundle project creation did not return a valid project ID.',
      };
    }

    const nextSettings = await settingsService.markProjectCreated(moduleId, {
      projectId,
      projectSlug,
      projectType,
      customSubdomain,
    });

    return {
      success: true,
      created: projectResponse.status === 201,
      settings: nextSettings,
    };
  },

  async updateProjectCustomSubdomain(moduleId, customSubdomain = '') {
    const settingsService = strapi.plugin('smoothbundle').service('core-settings');
    const settings = await settingsService.get();
    let project = await settingsService.getProject(moduleId);
    const normalizedCustomSubdomain = normalizeCustomSubdomain(customSubdomain);

    if (String(customSubdomain || '').trim() && !normalizedCustomSubdomain) {
      return {
        success: false,
        message: 'Provide a valid Smooth Bundle subdomain, for example "my-project".',
      };
    }

    if (!settings.connected || !settings.accessToken) {
      return {
        success: false,
        message: 'Connect to Smooth Bundle before updating the project subdomain.',
      };
    }

    if (!project.projectId) {
      const ensureResult = await this.ensureProject(moduleId);

      if (!ensureResult.success) {
        return ensureResult;
      }

      project = await settingsService.getProject(moduleId);
    }

    if (!project.projectId) {
      return {
        success: false,
        message: 'Create the Smooth Bundle project before updating the custom subdomain.',
      };
    }

    const response = await this.requestJson(
      'PATCH',
      `/projects/${encodeURIComponent(project.projectId)}`,
      {
        headers: {
          Authorization: `Bearer ${settings.accessToken}`,
        },
        payload: {
          customSubdomain: normalizedCustomSubdomain,
        },
      }
    );

    if (!response.success) {
      return {
        success: false,
        message: response.message || 'Could not update the Smooth Bundle project subdomain.',
      };
    }

    const projectData = response.data && typeof response.data === 'object' ? response.data : {};
    const nextSettings = await settingsService.markProjectCreated(moduleId, {
      ...project,
      projectId: String(projectData.id || projectData.project_id || projectData?.project?.id || project.projectId).trim(),
      projectSlug: extractProjectSlug(projectData) || project.projectSlug,
      projectType: String(projectData.type || projectData?.project?.type || project.projectType || '').trim(),
      assetsCount: Math.max(
        0,
        Number(
          projectData.assetsCount ||
            projectData.assets_count ||
            projectData?.project?.assetsCount ||
            projectData?.project?.assets_count ||
            project.assetsCount ||
            0
        )
      ),
      customSubdomain: extractCustomSubdomain(projectData) || normalizedCustomSubdomain,
    });

    return {
      success: true,
      settings: nextSettings,
      customSubdomain: extractCustomSubdomain(projectData) || normalizedCustomSubdomain,
    };
  },

  async getProjectAccesses(moduleId = 'cdn-connector') {
    const settingsService = strapi.plugin('smoothbundle').service('core-settings');
    const settings = await settingsService.get();
    const project = await settingsService.getProject(moduleId);

    if (!settings.connected || !settings.accessToken) {
      return {
        success: false,
        message: 'Connect to Smooth Bundle first.',
        data: [],
      };
    }

    if (!project.projectId) {
      return {
        success: false,
        message: 'Create the module project first.',
        data: [],
      };
    }

    const response = await this.requestJson('GET', `/projects/${encodeURIComponent(project.projectId)}/accesses`, {
      headers: {
        Authorization: `Bearer ${settings.accessToken}`,
      },
    });

    if (!response.success) {
      return {
        success: false,
        message: response.message || 'Could not fetch project accesses from Smooth Bundle.',
        data: extractCollectionRows(response.data),
      };
    }

    return {
      success: true,
      data: extractCollectionRows(response.data),
    };
  },

  async grantProjectAccess(email, assets = true, expiresAt = null, moduleId = 'cdn-connector') {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedExpiresAt = String(expiresAt || '').trim();
    const settingsService = strapi.plugin('smoothbundle').service('core-settings');
    const settings = await settingsService.get();
    const project = await settingsService.getProject(moduleId);

    if (!normalizedEmail) {
      return {
        success: false,
        message: 'Email is required.',
      };
    }

    if (!settings.connected || !settings.accessToken) {
      return {
        success: false,
        message: 'Connect to Smooth Bundle first.',
      };
    }

    if (!project.projectId) {
      return {
        success: false,
        message: 'Create the module project first.',
      };
    }

    const normalizedAssets =
      assets === true
        ? true
        : Array.from(
            new Set(
              (Array.isArray(assets) ? assets : [assets])
                .map((entry) => String(entry || '').trim())
                .filter(Boolean)
            )
          );

    const payload = {
      email: normalizedEmail,
      assets: normalizedAssets === true ? true : normalizedAssets,
      expiresAt: normalizedExpiresAt || null,
    };

    const response = await this.requestJson(
      'POST',
      `/projects/${encodeURIComponent(project.projectId)}/accesses/grant`,
      {
        headers: {
          Authorization: `Bearer ${settings.accessToken}`,
        },
        payload,
      }
    );

    if (!response.success) {
      return {
        success: false,
        message: response.message || 'Could not grant project access.',
      };
    }

    return {
      success: true,
      data: response.data,
    };
  },

  async revokeProjectAccess(accessId, moduleId = 'cdn-connector') {
    const normalizedAccessId = String(accessId || '').trim();

    if (!normalizedAccessId) {
      return {
        success: false,
        message: 'Access ID is missing.',
      };
    }

    const settingsService = strapi.plugin('smoothbundle').service('core-settings');
    const settings = await settingsService.get();
    const project = await settingsService.getProject(moduleId);

    if (!settings.connected || !settings.accessToken) {
      return {
        success: false,
        message: 'Connect to Smooth Bundle first.',
      };
    }

    if (!project.projectId) {
      return {
        success: false,
        message: 'Create the module project first.',
      };
    }

    const response = await this.requestJson(
      'POST',
      `/projects/${encodeURIComponent(project.projectId)}/accesses/${encodeURIComponent(normalizedAccessId)}/revoke`,
      {
        headers: {
          Authorization: `Bearer ${settings.accessToken}`,
        },
      }
    );

    if (!response.success) {
      return {
        success: false,
        message: response.message || 'Could not revoke project access.',
      };
    }

    return {
      success: true,
      data: response.data,
    };
  },

  async getProjectCollaborators(moduleId = 'cdn-connector') {
    const settingsService = strapi.plugin('smoothbundle').service('core-settings');
    const settings = await settingsService.get();
    const project = await settingsService.getProject(moduleId);

    if (!settings.connected || !settings.accessToken) {
      return {
        success: false,
        message: 'Connect to Smooth Bundle first.',
        data: [],
      };
    }

    if (!project.projectId) {
      return {
        success: false,
        message: 'Create the module project first.',
        data: [],
      };
    }

    const response = await this.requestJson('GET', `/projects/${encodeURIComponent(project.projectId)}/collaborators`, {
      headers: {
        Authorization: `Bearer ${settings.accessToken}`,
      },
    });

    if (!response.success) {
      return {
        success: false,
        message: response.message || 'Could not fetch project collaborators from Smooth Bundle.',
        data: extractCollectionRows(response.data),
      };
    }

    return {
      success: true,
      data: extractCollectionRows(response.data),
    };
  },

  async saveProjectCollaborator(email, permissions = {}, collaboratorId = '', moduleId = 'cdn-connector') {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedCollaboratorId = String(collaboratorId || '').trim();
    const settingsService = strapi.plugin('smoothbundle').service('core-settings');
    const settings = await settingsService.get();
    const project = await settingsService.getProject(moduleId);

    if (!normalizedCollaboratorId && !normalizedEmail) {
      return {
        success: false,
        message: 'Email is required.',
      };
    }

    if (!settings.connected || !settings.accessToken) {
      return {
        success: false,
        message: 'Connect to Smooth Bundle first.',
      };
    }

    if (!project.projectId) {
      return {
        success: false,
        message: 'Create the module project first.',
      };
    }

    const protectedAccess = Boolean(permissions.canManageProtected || permissions.canReadProtected);
    const payload = {
      canEditProject: Boolean(permissions.canEditProject),
      canCreateVersions: false,
      canPublishVersions: false,
      canManageProtected: protectedAccess,
      canReadProtected: protectedAccess,
    };
    const method = normalizedCollaboratorId ? 'PATCH' : 'POST';
    const path = normalizedCollaboratorId
      ? `/projects/${encodeURIComponent(project.projectId)}/collaborators/${encodeURIComponent(normalizedCollaboratorId)}`
      : `/projects/${encodeURIComponent(project.projectId)}/collaborators`;

    if (!normalizedCollaboratorId) {
      payload.email = normalizedEmail;
    }

    const response = await this.requestJson(method, path, {
      headers: {
        Authorization: `Bearer ${settings.accessToken}`,
      },
      payload,
    });

    if (!response.success) {
      return {
        success: false,
        message: response.message || 'Could not save collaborator.',
        details: response.details || '',
        data: response.data,
      };
    }

    return {
      success: true,
      data: response.data,
    };
  },

  async removeProjectCollaborator(collaboratorId, moduleId = 'cdn-connector') {
    const normalizedCollaboratorId = String(collaboratorId || '').trim();

    if (!normalizedCollaboratorId) {
      return {
        success: false,
        message: 'Collaborator ID is missing.',
      };
    }

    const settingsService = strapi.plugin('smoothbundle').service('core-settings');
    const settings = await settingsService.get();
    const project = await settingsService.getProject(moduleId);

    if (!settings.connected || !settings.accessToken) {
      return {
        success: false,
        message: 'Connect to Smooth Bundle first.',
      };
    }

    if (!project.projectId) {
      return {
        success: false,
        message: 'Create the module project first.',
      };
    }

    const response = await this.requestJson(
      'DELETE',
      `/projects/${encodeURIComponent(project.projectId)}/collaborators/${encodeURIComponent(normalizedCollaboratorId)}`,
      {
        headers: {
          Authorization: `Bearer ${settings.accessToken}`,
        },
      }
    );

    if (!response.success) {
      return {
        success: false,
        message: response.message || 'Could not remove collaborator.',
        details: response.details || '',
      };
    }

    return {
      success: true,
      data: response.data,
    };
  },

  async getDailyAssetUsage(moduleId = 'cdn-connector') {
    const settingsService = strapi.plugin('smoothbundle').service('core-settings');
    const settings = await settingsService.get();
    const project = await settingsService.getProject(moduleId);

    if (!settings.connected || !settings.accessToken) {
      return {
        success: false,
        message: 'Connect to Smooth Bundle first.',
        data: [],
      };
    }

    if (!project.projectId) {
      return {
        success: false,
        message: 'Create the module project first.',
        data: [],
      };
    }

    const query = new URLSearchParams({
      project_id: project.projectId,
    });
    const response = await this.requestJson('GET', `/usage/assets/daily?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${settings.accessToken}`,
      },
    });

    if (!response.success) {
      return {
        success: false,
        message: response.message || 'Could not fetch daily asset usage from Smooth Bundle.',
        data: extractCollectionRows(response.data),
      };
    }

    return {
      success: true,
      data: extractCollectionRows(response.data),
    };
  },

  async getProjectAssets(moduleId = 'cdn-connector') {
    const settingsService = strapi.plugin('smoothbundle').service('core-settings');
    const settings = await settingsService.get();
    const project = await settingsService.getProject(moduleId);

    if (!settings.connected || !settings.accessToken || !project.projectId) {
      return {
        success: false,
        message: 'Connect to Smooth Bundle and create a project first.',
        data: [],
      };
    }

    const response = await this.requestJson('GET', `/projects/${encodeURIComponent(project.projectId)}/assets`, {
      headers: {
        Authorization: `Bearer ${settings.accessToken}`,
      },
    });

    return {
      success: response.success,
      message: response.message || '',
      data: extractCollectionRows(response.data),
    };
  },

  async uploadAssets(assets = [], moduleId = '', options = {}) {
    const settingsService = strapi.plugin('smoothbundle').service('core-settings');
    const settings = await settingsService.get();
    const project = await settingsService.getProject(moduleId);

    if (!settings.connected || !settings.accessToken || !project.projectId) {
      return {
        success: false,
        message: 'Connect to Smooth Bundle and create a project first.',
        results: {},
      };
    }

    const normalizedAssets = (Array.isArray(assets) ? assets : [])
      .map((asset) => {
        const route = normalizeRoute(asset?.route);
        const hasBody = Object.prototype.hasOwnProperty.call(asset || {}, 'body') && asset.body !== undefined && asset.body !== null;

        if (!route || (!hasBody && (typeof asset?.json !== 'string' || !asset.json))) {
          return null;
        }

        const target = asset.uploadTarget || buildUploadTarget(route);

        return {
          route,
          path: String(target.path || '/'),
          filename: String(asset?.filename || target.filename || 'asset.json'),
          protected: Boolean(asset.protected),
          parentAssetId: String(asset?.parentAssetId || asset?.parent_asset_id || '').trim(),
          meta: normalizeUploadMeta(asset?.meta),
          body: hasBody ? asset.body : String(asset.json),
          contentType: String(asset?.contentType || (hasBody ? 'application/octet-stream' : 'application/json')).trim(),
        };
      })
      .filter(Boolean);

    const batchSize = Math.max(1, Number(options.batchSize) || normalizedAssets.length || 1);
    const groups = new Map();
    for (const asset of normalizedAssets) {
      const key = `${asset.path}|${asset.protected ? '1' : '0'}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key).push(asset);
    }

    const results = {};

    for (const group of groups.values()) {
      for (let startIndex = 0; startIndex < group.length; startIndex += batchSize) {
        const chunk = group.slice(startIndex, startIndex + batchSize);
        const sample = chunk[0];
        const form = new FormData();
        form.set('projectId', project.projectId);
        form.set('path', sample.path);
        form.set('protected', sample.protected ? '1' : '0');
        form.set('force', '0');
        form.set('skipVariants', '1');

        for (const asset of chunk) {
          form.append(
            'assets',
            new Blob([asset.body], { type: asset.contentType || 'application/octet-stream' }),
            asset.filename
          );
          if (asset.parentAssetId) {
            form.append('parent_asset_id', asset.parentAssetId);
          }
          form.append('meta', JSON.stringify(asset.meta || {}));
        }

        let response;
        let payload = {};

        try {
          response = await fetch(CDN_UPLOAD_URL, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${settings.accessToken}`,
            },
            body: form,
          });

          const text = await response.text();
          payload = safeJsonParse(text, {});
        } catch (error) {
          response = {
            ok: false,
          };
          payload = {
            message: String(error?.message || 'Could not reach Smooth Bundle.').trim(),
          };
        }

        const uploadedEntries = extractUploadedAssetEntries(payload);
        const usedIndexes = new Set();

        for (const [assetIndex, asset] of chunk.entries()) {
          let matchedIndex = uploadedEntries.findIndex(
            (entry, entryIndex) => !usedIndexes.has(entryIndex) && entry.filename === asset.filename
          );

          if (matchedIndex < 0 && uploadedEntries.length === chunk.length) {
            matchedIndex = assetIndex;
          }

          const matchedEntry = matchedIndex >= 0 ? uploadedEntries[matchedIndex] || null : null;

          if (matchedIndex >= 0) {
            usedIndexes.add(matchedIndex);
          }

          results[asset.route] = {
            success: matchedEntry?.success ?? response.ok,
            message:
              String(matchedEntry?.message || '').trim() ||
              payload?.message ||
              payload?.error?.message ||
              '',
            details: payload?.details || '',
            assetId: String(matchedEntry?.assetId || '').trim(),
            responsePayload: payload,
            path: sample.path,
            filename: asset.filename,
          };
        }
      }
    }

    return {
      success: Object.values(results).every((result) => result.success),
      results,
      message: Object.values(results).find((result) => !result.success)?.message || '',
    };
  },

  async deleteAssets(targets = [], moduleId = '') {
    const settingsService = strapi.plugin('smoothbundle').service('core-settings');
    const settings = await settingsService.get();
    const project = await settingsService.getProject(moduleId);

    if (!settings.connected || !settings.accessToken || !project.projectId) {
      return {
        success: false,
        message: 'Connect to Smooth Bundle and create a project first.',
      };
    }

    const normalizedTargets = (Array.isArray(targets) ? targets : [])
      .map((entry) => ({
        path: String(entry?.path || '/').trim() || '/',
        filename: String(entry?.filename || '').trim(),
      }))
      .filter((entry) => entry.filename);

    if (normalizedTargets.length === 0) {
      return {
        success: true,
        deleted: 0,
      };
    }

    const groups = new Map();
    for (const target of normalizedTargets) {
      const key = String(target.path || '/').trim() || '/';

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key).push(target);
    }

    let bulkDeleteSucceeded = true;
    let bulkDeleteMessage = '';

    for (const [groupPath, groupTargets] of groups.entries()) {
      const form = new FormData();
      form.set('projectId', project.projectId);
      form.set('path', groupPath);

      for (const target of groupTargets) {
        form.append('assets', target.filename);
      }

      let response;
      let payload = {};

      try {
        response = await fetch(CDN_DELETE_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${settings.accessToken}`,
          },
          body: form,
        });

        const text = await response.text();
        payload = safeJsonParse(text, {});
      } catch (error) {
        response = {
          ok: false,
          status: 0,
        };
        payload = {
          message: String(error?.message || 'Could not reach Smooth Bundle.').trim(),
        };
      }

      if (!response.ok) {
        bulkDeleteSucceeded = false;
        bulkDeleteMessage = extractResponseMessage(payload, response.status) || 'Could not delete assets from Smooth Bundle.';
        break;
      }
    }

    if (bulkDeleteSucceeded) {
      return {
        success: true,
        deleted: normalizedTargets.length,
        message: '',
      };
    }

    const response = await this.requestJson(
      'DELETE',
      `/projects/${encodeURIComponent(project.projectId)}/assets/bulk`,
      {
        headers: {
          Authorization: `Bearer ${settings.accessToken}`,
        },
        payload: {
          assets: normalizedTargets,
        },
      }
    );

    return {
      success: response.success,
      deleted: normalizedTargets.length,
      message: response.success ? response.message : (response.message || bulkDeleteMessage),
    };
  },

  async updateAssetsProtection(assetIds = [], protectedValue = false, moduleId = 'cdn-connector') {
    const settingsService = strapi.plugin('smoothbundle').service('core-settings');
    const settings = await settingsService.get();
    const project = await settingsService.getProject(moduleId);

    if (!settings.connected || !settings.accessToken || !project.projectId) {
      return {
        success: false,
        message: 'Connect to Smooth Bundle and create a project first.',
        updated: 0,
      };
    }

    const normalizedAssetIds = Array.from(
      new Set((Array.isArray(assetIds) ? assetIds : [assetIds]).map((assetId) => String(assetId || '').trim()).filter(Boolean))
    );

    if (normalizedAssetIds.length === 0) {
      return {
        success: false,
        message: 'Asset ID is missing.',
        updated: 0,
      };
    }

    let updated = 0;
    const responses = [];

    for (let startIndex = 0; startIndex < normalizedAssetIds.length; startIndex += 50) {
      const chunk = normalizedAssetIds.slice(startIndex, startIndex + 50);
      const response = await this.requestJson(
        'PATCH',
        `/projects/${encodeURIComponent(project.projectId)}/assets/bulk`,
        {
          headers: {
            Authorization: `Bearer ${settings.accessToken}`,
          },
          payload: {
            asset_ids: chunk,
            protected: Boolean(protectedValue),
          },
        }
      );

      if (!response.success) {
        return {
          success: false,
          message: response.message || 'Could not update asset protection in Smooth Bundle.',
          details: response.details || '',
          updated,
          data: responses,
        };
      }

      updated += chunk.length;
      responses.push(response.data || null);
    }

    return {
      success: true,
      updated,
      data: responses,
    };
  },

  async deleteRouteAssets(routes = [], moduleId = '') {
    const repository = strapi.plugin('smoothbundle').service('api-accelerator-repository');
    const targets = [];

    for (const route of routes) {
      const entry = await repository.get(route);
      if (!entry || entry.syncStatus !== 'uploaded') {
        continue;
      }

      const fileCount = Math.max(1, Number(entry?.syncedFileCount || 1));
      const uploadTargets = buildUploadTargetsForRouteAssets(entry?.assetRoute || route, fileCount);

      for (const target of uploadTargets) {
        targets.push({
          path: target.path,
          filename: target.filename,
        });
      }
    }

    return this.deleteAssets(targets, moduleId);
  },

  async optimizeAsset(assetId = '', moduleId = '', options = {}) {
    const settingsService = strapi.plugin('smoothbundle').service('core-settings');
    const settings = await settingsService.get();
    const project = await settingsService.getProject(moduleId);
    const normalizedAssetId = String(assetId || '').trim();

    if (!settings.connected || !settings.accessToken || !project.projectId) {
      return {
        success: false,
        message: 'Connect to Smooth Bundle and create a project first.',
      };
    }

    if (!normalizedAssetId) {
      return {
        success: false,
        message: 'Missing Smooth Bundle asset ID.',
      };
    }

    const response = await this.requestJson(
      'POST',
      `/projects/${encodeURIComponent(project.projectId)}/assets/${encodeURIComponent(normalizedAssetId)}/optimize`,
      {
        headers: {
          Authorization: `Bearer ${settings.accessToken}`,
        },
        payload: {
          force: options.force === true ? 'true' : 'false',
        },
      }
    );

    return {
      success: response.success,
      message: response.message || '',
      data: response.data || null,
    };
  },

  buildPublicUrlForUploadTarget(path, filename, settings) {
    if (!filename) {
      return '';
    }

    const normalizedPath = String(path || '/').trim() === '/'
      ? ''
      : `/${String(path || '').trim().replace(/^\/+|\/+$/g, '')}`;
    const customSubdomain = normalizeCustomSubdomain(settings.customSubdomain);

    if (customSubdomain) {
      return `https://${customSubdomain}.smoothbundle.com${normalizedPath}/${encodeURIComponent(filename)}`;
    }

    if (!settings.userSlug || !settings.projectSlug) {
      return '';
    }

    return `${CDN_PUBLIC_HOST}/${encodeURIComponent(settings.userSlug)}/${encodeURIComponent(
      settings.projectSlug
    )}${normalizedPath}/${encodeURIComponent(filename)}`;
  },
});
