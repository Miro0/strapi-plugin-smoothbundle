'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const CACHE_TTL_MS = 5000;
const PROTECTED_ASSET_PREVIEW_SVG = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg
   width="48"
   height="80"
   viewBox="0 0 48 80"
   fill="none"
   stroke="currentColor"
   stroke-width="2"
   stroke-linecap="round"
   stroke-linejoin="round"
   version="1.1"
   xmlns="http://www.w3.org/2000/svg">
  <path
     d="M 6.6315574,21.378933 V 7.947356 A 4.6315783,4.6315783 0 0 1 11.263135,3.3157778 h 18.526314 a 5.557894,5.557894 0 0 1 3.950736,1.6349471 l 8.309051,8.3090521 a 5.557894,5.557894 0 0 1 1.634947,3.950736 v 27.78947 a 4.6315783,4.6315783 0 0 1 -4.631578,4.631578 h -6.947366"
     style="stroke-width:4.63157" />
  <path
     d="M 29.789449,3.3157778 V 14.894724 a 2.3157892,2.3157892 0 0 0 2.31579,2.315789 h 11.578944"
     style="stroke-width:4.63157" />
  <path
     d="m 18.210503,38.052616 v -4.63158 a 4.6315786,4.6315786 0 0 0 -9.2631564,0 v 4.63158"
     style="stroke-width:4.63157" />
  <rect
     width="18.526314"
     height="11.578945"
     x="4.3157682"
     y="38.052612"
     rx="2.3157892"
     style="stroke-width:4.63157" />
  <text
     xml:space="preserve"
     style="font-size:6px;line-height:1;font-family:Arial;fill:#000000;stroke:none;paint-order:stroke markers fill"
     x="23.791992"
     y="66.473038"
     text-anchor="middle"><tspan
       x="23.791992"
       y="66.473038">PROTECTED BY</tspan><tspan
       x="23.791992"
       y="72.473038">SMOOTH BUNDLE</tspan></text>
</svg>`;
const PROTECTED_ASSET_PREVIEW_DATA_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(PROTECTED_ASSET_PREVIEW_SVG)}`;

function plugin(strapi) {
  return strapi.plugin('smoothcdn');
}

function normalizeFileId(value) {
  return String(value || '').trim();
}

function normalizePath(value) {
  return String(value || '/').trim() || '/';
}

function resolvePublicDirectory(strapi) {
  const configuredPublicDir = strapi.dirs?.static?.public || strapi.dirs?.public;
  const appRoot = strapi.dirs?.app?.root || process.cwd();
  return path.resolve(configuredPublicDir || path.join(appRoot, 'public'));
}

function toLocalPublicFilePath(publicDirectory, value) {
  const normalized = String(value || '').trim();

  if (!normalized || /^https?:\/\//i.test(normalized) || normalized.startsWith('data:')) {
    return '';
  }

  const withoutQuery = normalized.split('?')[0].split('#')[0].trim();
  if (!withoutQuery) {
    return '';
  }

  const normalizedUrlPath = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  const absolutePath = path.resolve(publicDirectory, `.${normalizedUrlPath}`);
  const protectedPrefix = publicDirectory.endsWith(path.sep) ? publicDirectory : `${publicDirectory}${path.sep}`;

  if (absolutePath !== publicDirectory && !absolutePath.startsWith(protectedPrefix)) {
    return '';
  }

  return absolutePath;
}

function collectSyncedEntries(entry = {}) {
  return Array.isArray(entry.syncedEntries) ? entry.syncedEntries.filter((item) => item?.filename) : [];
}

function findOriginalSyncedEntry(entry = {}) {
  const syncedEntries = collectSyncedEntries(entry);

  return syncedEntries.find((item) => String(item?.key || '').trim() === 'original') || syncedEntries[0] || null;
}

function buildLocalFilePaths(fileEntry = {}, publicDirectory) {
  const sources = [fileEntry?.url];
  const formats = fileEntry?.formats && typeof fileEntry.formats === 'object' ? fileEntry.formats : {};

  for (const variant of Object.values(formats)) {
    sources.push(variant?.url);
  }

  return Array.from(
    new Set(
      sources
        .map((source) => toLocalPublicFilePath(publicDirectory, source))
        .filter(Boolean)
    )
  );
}

function buildLocalFilePathMap(fileEntry = {}, publicDirectory) {
  const entries = new Map();
  const originalPath = toLocalPublicFilePath(publicDirectory, fileEntry?.url);

  if (originalPath) {
    entries.set('original', originalPath);
  }

  const formats = fileEntry?.formats && typeof fileEntry.formats === 'object' ? fileEntry.formats : {};

  for (const [variantKey, variant] of Object.entries(formats)) {
    const normalizedKey = String(variantKey || '').trim();
    const variantPath = toLocalPublicFilePath(publicDirectory, variant?.url);

    if (!normalizedKey || !variantPath) {
      continue;
    }

    entries.set(normalizedKey, variantPath);
  }

  return entries;
}

function isUploadFilePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }

  return (
    Object.prototype.hasOwnProperty.call(payload, 'id') &&
    (Object.prototype.hasOwnProperty.call(payload, 'url') || Object.prototype.hasOwnProperty.call(payload, 'formats'))
  );
}

function rewriteArrayPayload(items, state, rewriteFilePayload) {
  let changed = false;
  const nextItems = items.map((item) => {
    const nextItem = rewriteFilePayload(item, state);
    if (nextItem !== item) {
      changed = true;
    }

    return nextItem;
  });

  return changed ? nextItems : items;
}

function isImageLikeFilePayload(file = {}) {
  const mime = String(file?.mime || '').trim().toLowerCase();
  if (mime.startsWith('image/')) {
    return true;
  }

  const ext = String(file?.ext || '').trim().toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg'].includes(ext);
}

function stripUpdatedAtParamFromUrl(urlValue) {
  const normalized = String(urlValue || '').trim();

  if (!normalized || !normalized.includes('updatedAt=')) {
    return normalized;
  }

  try {
    const resolved = /^https?:\/\//i.test(normalized)
      ? new URL(normalized)
      : new URL(normalized, 'http://smoothcdn-local');

    resolved.searchParams.delete('updatedAt');
    const next = resolved.toString();

    if (/^https?:\/\//i.test(normalized)) {
      return next;
    }

    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch (error) {
    return normalized
      .replace(/([?&])updatedAt=[^&#]*(&?)/, (match, leading, trailing) => {
        if (leading === '?' && trailing) {
          return '?';
        }

        return trailing ? leading : '';
      })
      .replace(/\?$/, '')
      .replace(/\?&/, '?');
  }
}

function stripUpdatedAtParamFromFilePayload(file = {}) {
  if (!isUploadFilePayload(file) || !isImageLikeFilePayload(file)) {
    return file;
  }

  let changed = false;
  const nextFile = {
    ...file,
  };

  if (typeof file.url === 'string') {
    const nextUrl = stripUpdatedAtParamFromUrl(file.url);
    if (nextUrl !== file.url) {
      changed = true;
      nextFile.url = nextUrl;
    }
  }

  if (file.formats && typeof file.formats === 'object') {
    let formatChanged = false;
    const nextFormats = { ...file.formats };

    for (const [variantKey, variantValue] of Object.entries(file.formats)) {
      if (!variantValue || typeof variantValue !== 'object' || typeof variantValue.url !== 'string') {
        continue;
      }

      const nextVariantUrl = stripUpdatedAtParamFromUrl(variantValue.url);
      if (nextVariantUrl === variantValue.url) {
        continue;
      }

      formatChanged = true;
      nextFormats[variantKey] = {
        ...variantValue,
        url: nextVariantUrl,
      };
    }

    if (formatChanged) {
      changed = true;
      nextFile.formats = nextFormats;
    }
  }

  return changed ? nextFile : file;
}

function stripUpdatedAtParamFromSignedPayload(payload) {
  if (!payload) {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map((item) => stripUpdatedAtParamFromFilePayload(item));
  }

  return stripUpdatedAtParamFromFilePayload(payload);
}

function addNoUsageLogsParamToUrl(urlValue) {
  const normalized = String(urlValue || '').trim();

  if (!normalized) {
    return normalized;
  }

  try {
    const resolved = /^https?:\/\//i.test(normalized)
      ? new URL(normalized)
      : new URL(normalized, 'http://smoothcdn-local');

    resolved.searchParams.set('no-usage-logs', '1');
    const next = resolved.toString();

    if (/^https?:\/\//i.test(normalized)) {
      return next;
    }

    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch (error) {
    const separator = normalized.includes('?') ? '&' : '?';
    return `${normalized}${separator}no-usage-logs=1`;
  }
}

function addNoUsageLogsParamToFilePayload(file = {}) {
  if (!isUploadFilePayload(file) || !isImageLikeFilePayload(file)) {
    return file;
  }

  let changed = false;
  const nextFile = {
    ...file,
  };

  if (typeof file.url === 'string') {
    const nextUrl = addNoUsageLogsParamToUrl(file.url);
    if (nextUrl !== file.url) {
      changed = true;
      nextFile.url = nextUrl;
    }
  }

  if (file.formats && typeof file.formats === 'object') {
    let formatChanged = false;
    const nextFormats = { ...file.formats };

    for (const [variantKey, variantValue] of Object.entries(file.formats)) {
      if (!variantValue || typeof variantValue !== 'object' || typeof variantValue.url !== 'string') {
        continue;
      }

      const nextVariantUrl = addNoUsageLogsParamToUrl(variantValue.url);
      if (nextVariantUrl === variantValue.url) {
        continue;
      }

      formatChanged = true;
      nextFormats[variantKey] = {
        ...variantValue,
        url: nextVariantUrl,
      };
    }

    if (formatChanged) {
      changed = true;
      nextFile.formats = nextFormats;
    }
  }

  return changed ? nextFile : file;
}

function isAdminRequestContext(strapi) {
  const ctx = strapi?.requestContext?.get?.();
  return ctx?.state?.route?.info?.type === 'admin';
}

module.exports = ({ strapi }) => {
  let rewriteCache = {
    refreshedAt: 0,
    enabled: false,
    settings: null,
    entriesByFileId: new Map(),
  };
  let uploadRewriteHookInstalled = false;

  function invalidateCache() {
    rewriteCache = {
      refreshedAt: 0,
      enabled: false,
      settings: null,
      entriesByFileId: new Map(),
    };
  }

  async function getRewriteState(options = {}) {
    const forceRefresh = Boolean(options.force);

    if (!forceRefresh && Date.now() - rewriteCache.refreshedAt < CACHE_TTL_MS) {
      return rewriteCache;
    }

    try {
      const settings = await plugin(strapi).service('cdn-connector-settings').getResolved();
      const offloadEnabled = Boolean(settings.offloadLocalFiles);

      if (!offloadEnabled) {
        invalidateCache();
        rewriteCache.refreshedAt = Date.now();
        rewriteCache.settings = settings;
        return rewriteCache;
      }

      const entries = await plugin(strapi).service('cdn-connector-repository').all();
      const entriesByFileId = new Map();

      for (const entry of entries) {
        if (String(entry?.syncStatus || '').trim() !== 'uploaded') {
          continue;
        }

        const fileId = normalizeFileId(entry?.fileId);
        if (!fileId) {
          continue;
        }

        entriesByFileId.set(fileId, entry);
      }

      rewriteCache = {
        refreshedAt: Date.now(),
        enabled: true,
        settings,
        entriesByFileId,
      };
    } catch (error) {
      strapi.log.warn(`[smoothcdn] CDN Connector URL rewrite cache refresh failed: ${error.message}`);
      invalidateCache();
      rewriteCache.refreshedAt = Date.now();
    }

    return rewriteCache;
  }

  function buildPublicUrlForSyncedEntry(entry, settings) {
    if (!entry?.filename) {
      return '';
    }

    return plugin(strapi).service('smooth-client').buildPublicUrlForUploadTarget(
      normalizePath(entry.path),
      String(entry.filename || '').trim(),
      settings
    );
  }

  async function fetchRemoteAsset(url, projectToken = '') {
    try {
      const normalizedProjectToken = String(projectToken || '').trim();
      const response = await fetch(url, {
        headers: normalizedProjectToken
          ? {
              Authorization: `Bearer ${normalizedProjectToken}`,
            }
          : undefined,
      });

      if (!response.ok) {
        return {
          success: false,
          message: `Could not fetch ${url}.`,
        };
      }

      const arrayBuffer = await response.arrayBuffer();

      return {
        success: true,
        body: Buffer.from(arrayBuffer),
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || `Could not fetch ${url}.`,
      };
    }
  }

  function rewriteFilePayload(file, state) {
    if (!isUploadFilePayload(file) || !state?.enabled) {
      return file;
    }

    const fileId = normalizeFileId(file.id);
    const synced = state.entriesByFileId.get(fileId);

    if (!synced) {
      return file;
    }

    if (synced.protected && isAdminRequestContext(strapi)) {
      const nextFile = {
        ...file,
        url: PROTECTED_ASSET_PREVIEW_DATA_URL,
        previewUrl: PROTECTED_ASSET_PREVIEW_DATA_URL,
      };
      const currentFormats = file.formats && typeof file.formats === 'object' ? file.formats : null;

      if (!currentFormats) {
        return nextFile;
      }

      nextFile.formats = Object.fromEntries(
        Object.entries(currentFormats).map(([variantKey, variantValue]) => [
          variantKey,
          variantValue && typeof variantValue === 'object'
            ? {
                ...variantValue,
                url: PROTECTED_ASSET_PREVIEW_DATA_URL,
              }
            : variantValue,
        ])
      );

      return nextFile;
    }

    const originalEntry = findOriginalSyncedEntry(synced);
    const rewrittenOriginalUrl = buildPublicUrlForSyncedEntry(originalEntry, state.settings);

    if (!rewrittenOriginalUrl) {
      return file;
    }

    const nextFile = {
      ...file,
      url: rewrittenOriginalUrl,
    };

    const currentFormats = file.formats && typeof file.formats === 'object' ? file.formats : null;
    if (!currentFormats) {
      return nextFile;
    }

    const nextFormats = { ...currentFormats };
    let changedFormats = false;
    const syncedEntries = collectSyncedEntries(synced);

    for (const [variantKey, variantValue] of Object.entries(currentFormats)) {
      if (!variantValue || typeof variantValue !== 'object') {
        continue;
      }

      const syncedEntry = syncedEntries.find((item) => String(item?.key || '').trim() === String(variantKey || '').trim());
      const rewrittenVariantUrl = buildPublicUrlForSyncedEntry(syncedEntry, state.settings);

      if (!rewrittenVariantUrl) {
        continue;
      }

      changedFormats = true;
      nextFormats[variantKey] = {
        ...variantValue,
        url: rewrittenVariantUrl,
      };
    }

    if (changedFormats) {
      nextFile.formats = nextFormats;
    }

    if (!isAdminRequestContext(strapi)) {
      return nextFile;
    }

    return addNoUsageLogsParamToFilePayload(nextFile);
  }

  function rewriteSignedFileUrlsPayload(payload, state) {
    if (!state?.enabled || !payload) {
      return payload;
    }

    if (Array.isArray(payload)) {
      return rewriteArrayPayload(payload, state, rewriteFilePayload);
    }

    if (isUploadFilePayload(payload)) {
      return rewriteFilePayload(payload, state);
    }

    return payload;
  }

  return {
    invalidateCache,

    async installUploadUrlRewriteHook() {
      if (uploadRewriteHookInstalled) {
        return {
          installed: true,
        };
      }

      const uploadPlugin = strapi.plugin('upload');
      const fileService = uploadPlugin?.service('file');

      if (!fileService || typeof fileService.signFileUrls !== 'function') {
        return {
          installed: false,
          reason: 'Upload file service is unavailable.',
        };
      }

      const originalSignFileUrls = fileService.signFileUrls.bind(fileService);

      fileService.signFileUrls = async (payload, ...args) => {
        const bypassRewrite = args.some(
          (arg) => arg && typeof arg === 'object' && arg.__smoothcdnBypassRewrite === true
        );
        const normalizedArgs = args.map((arg) => {
          if (
            !arg ||
            typeof arg !== 'object' ||
            Array.isArray(arg) ||
            !Object.prototype.hasOwnProperty.call(arg, '__smoothcdnBypassRewrite')
          ) {
            return arg;
          }

          const { __smoothcdnBypassRewrite, ...rest } = arg;
          return rest;
        });
        const signed = await originalSignFileUrls(payload, ...normalizedArgs);
        const sanitizedSigned = stripUpdatedAtParamFromSignedPayload(signed);

        if (bypassRewrite) {
          return sanitizedSigned;
        }

        const state = await getRewriteState();

        if (!state.enabled) {
          return sanitizedSigned;
        }

        return rewriteSignedFileUrlsPayload(sanitizedSigned, state);
      };

      uploadRewriteHookInstalled = true;

      return {
        installed: true,
      };
    },

    async offloadLocalMediaFile(fileId, options = {}) {
      const normalizedFileId = normalizeFileId(fileId);

      if (!normalizedFileId) {
        return {
          success: false,
          message: 'Missing media file ID.',
          deletedFiles: 0,
        };
      }

      const settings =
        options.settings && typeof options.settings === 'object'
          ? options.settings
          : await plugin(strapi).service('cdn-connector-settings').getResolved();

      if (!settings.offloadLocalFiles) {
        return {
          success: true,
          skipped: true,
          deletedFiles: 0,
        };
      }

      const fileEntry = await strapi.db.query('plugin::upload.file').findOne({
        where: {
          id: /^\d+$/.test(normalizedFileId) ? Number(normalizedFileId) : normalizedFileId,
        },
      });

      if (!fileEntry) {
        return {
          success: true,
          skipped: true,
          deletedFiles: 0,
        };
      }

      const provider = String(fileEntry?.provider || 'local').trim().toLowerCase();
      if (provider && provider !== 'local') {
        return {
          success: true,
          skipped: true,
          deletedFiles: 0,
        };
      }

      const publicDirectory = resolvePublicDirectory(strapi);
      const localFiles = buildLocalFilePaths(fileEntry, publicDirectory);

      if (localFiles.length === 0) {
        return {
          success: true,
          skipped: true,
          deletedFiles: 0,
        };
      }

      const deletionFailures = [];
      let deletedFiles = 0;

      for (const localFile of localFiles) {
        try {
          await fs.unlink(localFile);
          deletedFiles += 1;
        } catch (error) {
          if (error.code === 'ENOENT') {
            continue;
          }

          deletionFailures.push(localFile);
        }
      }

      if (deletionFailures.length > 0) {
        return {
          success: false,
          message: `Could not delete ${deletionFailures.length} local media file(s).`,
          deletedFiles,
        };
      }

      return {
        success: true,
        deletedFiles,
      };
    },

    async restoreLocalMediaFile(fileId, options = {}) {
      const normalizedFileId = normalizeFileId(fileId);

      if (!normalizedFileId) {
        return {
          success: false,
          message: 'Missing media file ID.',
          restoredFiles: 0,
        };
      }

      const settings =
        options.settings && typeof options.settings === 'object'
          ? options.settings
          : await plugin(strapi).service('cdn-connector-settings').getResolved();
      const repositoryEntry =
        options.repositoryEntry && typeof options.repositoryEntry === 'object'
          ? options.repositoryEntry
          : await plugin(strapi).service('cdn-connector-repository').get(normalizedFileId);

      if (!repositoryEntry || String(repositoryEntry.syncStatus || '').trim() !== 'uploaded') {
        return {
          success: true,
          skipped: true,
          restoredFiles: 0,
        };
      }

      const fileEntry = await strapi.db.query('plugin::upload.file').findOne({
        where: {
          id: /^\d+$/.test(normalizedFileId) ? Number(normalizedFileId) : normalizedFileId,
        },
      });

      if (!fileEntry) {
        return {
          success: false,
          message: 'Media file does not exist in Strapi anymore.',
          restoredFiles: 0,
        };
      }

      const provider = String(fileEntry?.provider || 'local').trim().toLowerCase();
      if (provider && provider !== 'local') {
        return {
          success: true,
          skipped: true,
          restoredFiles: 0,
        };
      }

      const publicDirectory = resolvePublicDirectory(strapi);
      const localPathMap = buildLocalFilePathMap(fileEntry, publicDirectory);
      const syncedEntries = collectSyncedEntries(repositoryEntry);
      let projectToken = '';

      if (repositoryEntry.protected) {
        const tokenResponse = await plugin(strapi).service('smooth-client').getProjectToken('cdn-connector');

        if (!tokenResponse.success || !String(tokenResponse.token || '').trim()) {
          return {
            success: false,
            message: tokenResponse.message || 'Could not fetch the Smooth Bundle project token for protected assets.',
            restoredFiles: 0,
          };
        }

        projectToken = String(tokenResponse.token || '').trim();
      }

      const restorableTargets = syncedEntries
        .map((entry) => ({
          key: String(entry?.key || '').trim() || 'original',
          localPath: localPathMap.get(String(entry?.key || '').trim() || 'original') || '',
          remoteUrl: buildPublicUrlForSyncedEntry(entry, settings),
        }))
        .filter((entry) => entry.localPath && entry.remoteUrl);

      if (restorableTargets.length === 0) {
        return {
          success: false,
          message: 'Could not map synced CDN assets back to local upload paths.',
          restoredFiles: 0,
        };
      }

      let restoredFiles = 0;
      const failures = [];

      for (const target of restorableTargets) {
        const fetched = await fetchRemoteAsset(target.remoteUrl, projectToken);

        if (!fetched.success) {
          failures.push(fetched.message || `Could not fetch ${target.remoteUrl}.`);
          continue;
        }

        try {
          await fs.mkdir(path.dirname(target.localPath), { recursive: true });
          await fs.writeFile(target.localPath, fetched.body);
          restoredFiles += 1;
        } catch (error) {
          failures.push(error.message || `Could not write ${target.localPath}.`);
        }
      }

      if (failures.length > 0) {
        return {
          success: false,
          message: failures[0] || 'Could not restore local media files from Smooth Bundle.',
          restoredFiles,
        };
      }

      return {
        success: true,
        restoredFiles,
      };
    },
  };
};
