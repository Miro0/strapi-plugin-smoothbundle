'use strict';

const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { extname } = require('node:path');
const { URL } = require('node:url');

const { CDN_CONNECTOR_UPLOAD_BATCH_SIZE } = require('../../../utils/constants');
const { nowIso, parseIntervalFrequency } = require('../../../utils/helpers');

const SYNC_LOCK_TTL_MS = 5 * 60 * 1000;

function plugin(strapi) {
  return strapi.plugin('smoothbundle');
}

function normalizeMediaId(value) {
  const normalized = String(value || '').trim();
  return normalized || '';
}

function formatVariantLabel(key) {
  const normalized = String(key || '').trim();

  if (!normalized || normalized === 'original') {
    return 'Original';
  }

  return normalized
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

const PAID_PLAN_ARCHIVE_EXTENSIONS = ['.zip', '.7z', '.rar', '.tar', '.gz', '.tgz', '.bz2', '.xz'];
const ALLOWED_VIDEO_EXTENSIONS = ['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi', '.mpeg', '.mpg', '.ogv', '.3gp', '.3g2', '.wmv', '.flv'];

function resolveExt(value, fallbackUrl = '', mime = '') {
  const direct = String(value || '').trim();
  if (direct) {
    return direct.startsWith('.') ? direct : `.${direct}`;
  }

  const fromUrl = extname(String(fallbackUrl || '').split('?')[0] || '');
  if (fromUrl) {
    const normalizedFromUrl = fromUrl.toLowerCase();

    if (ALLOWED_VIDEO_EXTENSIONS.includes(normalizedFromUrl)) {
      return normalizedFromUrl;
    }

    return fromUrl;
  }

  switch (String(mime || '').trim()) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/avif':
      return '.avif';
    case 'image/gif':
      return '.gif';
    case 'image/svg+xml':
      return '.svg';
    case 'video/mp4':
      return '.mp4';
    case 'video/x-m4v':
      return '.m4v';
    case 'video/quicktime':
      return '.mov';
    case 'video/webm':
      return '.webm';
    case 'video/x-matroska':
      return '.mkv';
    case 'video/x-msvideo':
      return '.avi';
    case 'video/mpeg':
      return '.mpeg';
    case 'video/ogg':
      return '.ogv';
    case 'video/3gpp':
      return '.3gp';
    case 'video/3gpp2':
      return '.3g2';
    case 'video/x-ms-wmv':
      return '.wmv';
    case 'video/x-flv':
      return '.flv';
    default:
      return '';
  }
}

function bytesToKbytes(bytes) {
  return Math.round((Math.max(0, Number(bytes) || 0) / 1000) * 100) / 100;
}

function normalizeRestoredMime(value = '', ext = '') {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized.includes('/')) {
    return normalized;
  }

  switch (normalized || String(ext || '').trim().replace(/^\./, '').toLowerCase()) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'avif':
      return 'image/avif';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    default:
      return normalized || 'application/octet-stream';
  }
}

async function getRestoredImageDimensions(strapi, localPath, fileMeta = {}) {
  const imageManipulation = strapi.plugin('upload')?.service('image-manipulation');

  if (!imageManipulation || typeof imageManipulation.getDimensions !== 'function') {
    return {
      width: null,
      height: null,
    };
  }

  try {
    return await imageManipulation.getDimensions({
      ...fileMeta,
      filepath: localPath,
      getStream: () => require('node:fs').createReadStream(localPath),
    });
  } catch (error) {
    return {
      width: null,
      height: null,
    };
  }
}

async function generateRestoredImageFormats(strapi, originalEntry = {}, publicPrefix = '', restorePath = '/') {
  const imageManipulation = strapi.plugin('upload')?.service('image-manipulation');

  if (
    !imageManipulation ||
    typeof imageManipulation.isResizableImage !== 'function' ||
    typeof imageManipulation.generateThumbnail !== 'function' ||
    typeof imageManipulation.generateResponsiveFormats !== 'function'
  ) {
    return [];
  }

  const tmpWorkingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'smoothbundle-restore-'));

  try {
    const baseFile = {
      name: originalEntry.filename,
      hash: path.basename(originalEntry.filename, originalEntry.ext) || path.basename(originalEntry.filename),
      ext: originalEntry.ext,
      mime: originalEntry.mime,
      width: originalEntry.width,
      height: originalEntry.height,
      size: originalEntry.size,
      sizeInBytes: originalEntry.sizeInBytes,
      filepath: originalEntry.localPath,
      path: null,
      tmpWorkingDirectory,
      getStream: () => require('node:fs').createReadStream(originalEntry.localPath),
    };

    if (!(await imageManipulation.isResizableImage(baseFile))) {
      return [];
    }

    const generatedEntries = [];
    const thumbnail = await imageManipulation.generateThumbnail(baseFile);

    if (thumbnail) {
      generatedEntries.push({
        key: 'thumbnail',
        file: thumbnail,
      });
    }

    const responsiveFormats = await imageManipulation.generateResponsiveFormats(baseFile);
    for (const responsiveFormat of Array.isArray(responsiveFormats) ? responsiveFormats : []) {
      if (responsiveFormat?.key && responsiveFormat?.file) {
        generatedEntries.push(responsiveFormat);
      }
    }

    const restoredFormats = [];
    const normalizedRestorePath = normalizeAssetPath(restorePath);
    const relativeDirectory = normalizedRestorePath === '/' ? '' : normalizedRestorePath.replace(/^\/+|\/+$/g, '');

    for (const generatedEntry of generatedEntries) {
      const generatedFile = generatedEntry.file;
      const generatedFilename = `${generatedFile.hash}${generatedFile.ext || originalEntry.ext}`;
      const relativePath = `${relativeDirectory}/${generatedFilename}`.replace(/^\/+/, '');
      const localPath = path.resolve(path.dirname(originalEntry.localPath), generatedFilename);

      if (!localPath.startsWith(publicPrefix)) {
        continue;
      }

      await fs.copyFile(generatedFile.filepath, localPath);

      restoredFormats.push({
        key: String(generatedEntry.key || '').trim(),
        filename: generatedFilename,
        path: normalizedRestorePath,
        relativePath,
        localPath,
        ext: generatedFile.ext || originalEntry.ext,
        mime: generatedFile.mime || originalEntry.mime,
        width: generatedFile.width || null,
        height: generatedFile.height || null,
        sizeInBytes: Math.max(0, Number(generatedFile.sizeInBytes) || 0),
        size: Math.max(0, Number(generatedFile.size) || 0),
      });
    }

    return restoredFormats;
  } finally {
    await fs.rm(tmpWorkingDirectory, { recursive: true, force: true });
  }
}

function isPaidPlanArchiveAsset(filename = '', ext = '') {
  const normalizedFilename = String(filename || '').trim().toLowerCase();
  const normalizedExt = String(ext || '').trim().toLowerCase();

  return PAID_PLAN_ARCHIVE_EXTENSIONS.some((archiveExt) => (
    normalizedExt === archiveExt || normalizedFilename.endsWith(archiveExt)
  ));
}

function normalizeTimestamp(value) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeAssetPath(value = '/') {
  const normalized = String(value || '/')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/');
  const withoutTrailing = normalized.replace(/\/+$/g, '');
  const withLeading = withoutTrailing.startsWith('/') ? withoutTrailing : `/${withoutTrailing}`;

  return withLeading === '' ? '/' : withLeading;
}

function normalizeAssetFilename(value = '') {
  return String(value || '').trim().replace(/^\/+/g, '');
}

function buildAssetComparisonKey(assetPath = '/', filename = '') {
  const normalizedFilename = normalizeAssetFilename(filename);

  if (!normalizedFilename) {
    return '';
  }

  return `${normalizeAssetPath(assetPath)}::${normalizedFilename}`.toLowerCase();
}

function getCdnAssetFilename(asset = {}) {
  return normalizeAssetFilename(asset.fileName || asset.filename || asset.file_name || asset.name || '');
}

function getCdnAssetPath(asset = {}) {
  return normalizeAssetPath(asset.path || asset.directory || asset.uploadPath || asset.upload_path || '/');
}

function getCdnAssetKey(asset = {}) {
  return buildAssetComparisonKey(getCdnAssetPath(asset), getCdnAssetFilename(asset));
}

function getCdnAssetTimestamp(asset = {}) {
  return Math.max(
    normalizeTimestamp(asset.updatedAt || asset.updated_at || asset.modifiedAt || asset.modified_at),
    normalizeTimestamp(asset.createdAt || asset.created_at)
  );
}

function getCdnAssetId(asset = {}) {
  return String(asset.id || asset.assetId || asset.asset_id || '').trim();
}

function isCdnSubAsset(asset = {}) {
  return Boolean(
    asset.parentAssetId ||
      asset.parent_asset_id ||
      asset.parentId ||
      asset.parent_id ||
      asset.parent ||
      asset.isVariant ||
      asset.is_variant
  );
}

function isPluginAssetPath(asset = {}) {
  const normalizedPath = getCdnAssetPath(asset).toLowerCase();
  const filename = getCdnAssetFilename(asset).toLowerCase();

  return normalizedPath.includes('/smoothbundle') || filename.startsWith('smoothbundle-');
}

function normalizeStrapiFolderPath(value = '/') {
  const normalized = String(value || '/')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');

  if (!normalized || normalized === '.') {
    return '/';
  }

  return `/${normalized}`;
}

function normalizeFocusAxis(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  const normalized = Number.parseFloat(raw.replace('%', ''));
  if (!Number.isFinite(normalized)) {
    return null;
  }

  const usesPercentSyntax = raw.includes('%');
  const percentValue = !usesPercentSyntax && normalized >= 0 && normalized <= 1 ? normalized * 100 : normalized;

  return Math.round(Math.max(0, Math.min(100, percentValue)));
}

function normalizeFocusPoint(value) {
  if (Array.isArray(value) && value.length >= 2) {
    const x = normalizeFocusAxis(value[0]);
    const y = normalizeFocusAxis(value[1]);

    if (x === null || y === null) {
      return null;
    }

    return {
      x,
      y,
    };
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const x = normalizeFocusAxis(
    value.x ??
    value.left ??
    value.leftPercent ??
    value.leftPercentage ??
    value.percentX ??
    value.percentageX ??
    value.focusX ??
    value.focus_x ??
    value.cx
  );
  const y = normalizeFocusAxis(
    value.y ??
    value.top ??
    value.topPercent ??
    value.topPercentage ??
    value.percentY ??
    value.percentageY ??
    value.focusY ??
    value.focus_y ??
    value.cy
  );

  if (x === null || y === null) {
    return null;
  }

  return {
    x,
    y,
  };
}

function parseJsonObject(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    return null;
  }
}

function extractFocusPointFromUnknownValue(value) {
  if (!value) {
    return null;
  }

  const direct = normalizeFocusPoint(value);
  if (direct) {
    return direct;
  }

  const parsedObject = parseJsonObject(value);
  if (parsedObject) {
    return extractFocusPointFromUnknownValue(parsedObject);
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const nestedCandidates = [
    value.focus,
    value.focalPoint,
    value.focusPoint,
    value.focus_point,
    value.focal_point,
  ];

  for (const candidate of nestedCandidates) {
    const normalized = extractFocusPointFromUnknownValue(candidate);
    if (normalized) {
      return normalized;
    }
  }

  for (const nestedValue of Object.values(value)) {
    if (!nestedValue || typeof nestedValue !== 'object') {
      continue;
    }

    const normalized = extractFocusPointFromUnknownValue(nestedValue);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function resolveFocusPoint(signedFile = {}, rawFile = {}) {
  const candidates = [
    signedFile?.focalPoint,
    rawFile?.focalPoint,
    signedFile?.focusPoint,
    rawFile?.focusPoint,
    signedFile?.focus,
    rawFile?.focus,
    signedFile?.metadata?.focus,
    rawFile?.metadata?.focus,
    signedFile?.metadata,
    rawFile?.metadata,
    signedFile?.provider_metadata?.focus,
    rawFile?.provider_metadata?.focus,
    signedFile?.provider_metadata,
    rawFile?.provider_metadata,
    signedFile?.formats,
    rawFile?.formats,
    signedFile,
    rawFile,
  ];

  for (const candidate of candidates) {
    const normalized = extractFocusPointFromUnknownValue(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function buildUploadTargetFromSourceUrl(sourceUrl = '', fallbackFilename = 'asset', folderPath = '/') {
  const normalizedUrl = String(sourceUrl || '').trim();
  const targetPath = normalizeStrapiFolderPath(folderPath);

  if (!normalizedUrl) {
    const filename = fallbackFilename.replace(/^\/+/, '');

    return {
      route: `${targetPath === '/' ? '' : targetPath}/${filename}`,
      path: targetPath,
      filename,
    };
  }

  try {
    const parsedUrl = new URL(normalizedUrl);
    const pathname = decodeURIComponent(String(parsedUrl.pathname || '').trim()) || `/${fallbackFilename}`;
    const segments = pathname.split('/').filter(Boolean);
    const filename = segments[segments.length - 1] || fallbackFilename;

    return {
      route: `${targetPath === '/' ? '' : targetPath}/${filename}`,
      path: targetPath,
      filename,
    };
  } catch (error) {
    const fallbackPath = String(normalizedUrl.split('?')[0] || '').trim();
    const normalizedPath = fallbackPath.startsWith('/') ? fallbackPath : `/${fallbackPath}`;
    const segments = normalizedPath.split('/').filter(Boolean);
    const filename = segments[segments.length - 1] || fallbackFilename;

    return {
      route: `${targetPath === '/' ? '' : targetPath}/${filename}`,
      path: targetPath,
      filename,
    };
  }
}

function buildUploadFailureMessage(upload = {}, assets = []) {
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

  return String(upload?.message || '').trim() || 'Could not upload media assets to Smooth Bundle.';
}

function findSyncedEntryByKey(currentEntry = {}, key = '') {
  const entries = Array.isArray(currentEntry?.syncedEntries) ? currentEntry.syncedEntries : [];
  const normalizedKey = String(key || '').trim();

  if (normalizedKey) {
    const matched = entries.find((entry) => String(entry?.key || '').trim() === normalizedKey);
    if (matched) {
      return matched;
    }
  }

  if (!normalizedKey || normalizedKey === 'original') {
    return entries.find((entry) => String(entry?.key || '').trim() === 'original') || entries[0] || null;
  }

  return null;
}

function isSyncableEntry(entry = {}) {
  return Boolean(entry?.syncable);
}

function isExpectedOffloadedMissingSource(message = '') {
  const normalized = String(message || '').trim().toLowerCase();

  return normalized.includes('local asset file is missing');
}

module.exports = ({ strapi }) => {
  let schedulerHandle = null;
  let activeSyncPromise = null;

  async function refreshActiveSyncLock(options = {}) {
    const owner = String(options.syncLockOwner || '').trim();

    if (!owner) {
      return false;
    }

    return plugin(strapi).service('cdn-connector-runtime-state').refreshLock(owner, SYNC_LOCK_TTL_MS);
  }

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

  async function updateSyncJob(jobId, patch = {}) {
    if (!jobId) {
      return null;
    }

    const runtimeState = plugin(strapi).service('cdn-connector-runtime-state');
    const state = await runtimeState.update((current) => {
      const existing = current.syncJob || defaultSyncJob();

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
    const runtimeState = plugin(strapi).service('cdn-connector-runtime-state');
    const state = await runtimeState.get();
    const currentJob = state.syncJob || null;
    const currentLock = state.syncLock || { owner: '', expiresAt: 0 };
    const lockActive = Boolean(currentLock.owner) && Number(currentLock.expiresAt || 0) > Date.now();

    if (currentJob?.status !== 'running' || activeSyncPromise) {
      return {
        state,
        staleCleared: false,
      };
    }

    if (lockActive) {
      return {
        state,
        staleCleared: false,
      };
    }

    const nextState = await runtimeState.update((current) => ({
      syncJob: {
        ...(current.syncJob || currentJob),
        status: 'failed',
        finishedAt: nowIso(),
        currentItem: '',
        errorMessage: 'Previous sync timed out or was interrupted.',
      },
      syncLock: {
        owner: '',
        expiresAt: 0,
      },
    }));

    return {
      state: nextState,
      staleCleared: true,
    };
  }

  async function isModuleEnabled() {
    return plugin(strapi).service('module-registry').isEnabled('cdn-connector');
  }

  function buildBaseUrl(settings = {}) {
    const configuredServerUrl = String(strapi.config.get('server.url') || '').trim().replace(/\/+$/, '');
    const configuredHost = String(strapi.config.get('server.host') || '127.0.0.1').trim();
    const resolvedHost =
      configuredHost && !['0.0.0.0', '::', '[::]'].includes(configuredHost) ? configuredHost : '127.0.0.1';
    const port = strapi.config.get('server.port') || 1337;

    if (settings.publicBaseUrl) {
      return String(settings.publicBaseUrl).replace(/\/+$/, '');
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
  }

  function resolveAssetUrl(url, settings = {}) {
    const normalizedUrl = String(url || '').trim();

    if (!normalizedUrl) {
      return '';
    }

    if (/^https?:\/\//i.test(normalizedUrl)) {
      return normalizedUrl;
    }

    return new URL(normalizedUrl, `${buildBaseUrl(settings)}/`).toString();
  }

  async function listSourceMediaItems(filterIds = null) {
    const signedFileService = strapi.plugin('upload').service('file');
    const settings = await plugin(strapi).service('cdn-connector-settings').getResolved();
    const rawFiles = await strapi.db.query('plugin::upload.file').findMany({
      orderBy: {
        updatedAt: 'desc',
      },
    });
    const filterSet = filterIds instanceof Set ? filterIds : null;
    const items = [];

    for (const rawFile of Array.isArray(rawFiles) ? rawFiles : []) {
      const fileId = normalizeMediaId(rawFile?.id);
      if (!fileId) {
        continue;
      }

      if (filterSet && !filterSet.has(fileId)) {
        continue;
      }

      const signedFile = await signedFileService.signFileUrls(rawFile, {
        __smoothbundleBypassRewrite: true,
      });
      const formats = signedFile?.formats && typeof signedFile.formats === 'object' ? signedFile.formats : {};
      const signatureFormats = rawFile?.formats && typeof rawFile.formats === 'object' ? rawFile.formats : formats;
      const focusPoint = resolveFocusPoint(signedFile, rawFile);
      const isImage = String(signedFile?.mime || '').toLowerCase().startsWith('image/');
      const sourceSignature = JSON.stringify({
        updatedAt: rawFile?.updatedAt || signedFile?.updatedAt || '',
        hash: rawFile?.hash || signedFile?.hash || '',
        url: rawFile?.url || signedFile?.url || '',
        formats: signatureFormats,
        focusPoint: focusPoint || null,
      });

      items.push({
        id: `media:${fileId}`,
        fileId,
        name: String(signedFile?.name || rawFile?.name || '').trim(),
        alternativeText: String(signedFile?.alternativeText || rawFile?.alternativeText || '').trim(),
        mime: String(signedFile?.mime || rawFile?.mime || '').trim(),
        ext: resolveExt(signedFile?.ext || rawFile?.ext, signedFile?.url || rawFile?.url, signedFile?.mime || rawFile?.mime),
        size: Math.max(0, Number(signedFile?.size ?? rawFile?.size ?? 0) || 0),
        width: Math.max(0, Number(signedFile?.width ?? rawFile?.width ?? 0) || 0),
        height: Math.max(0, Number(signedFile?.height ?? rawFile?.height ?? 0) || 0),
        updatedAt: String(signedFile?.updatedAt || rawFile?.updatedAt || '').trim(),
        createdAt: String(signedFile?.createdAt || rawFile?.createdAt || '').trim(),
        sourceUrl: resolveAssetUrl(signedFile?.url || rawFile?.url || '', settings),
        folderPath: normalizeStrapiFolderPath(signedFile?.folderPath || rawFile?.folderPath || '/'),
        isImage,
        focusPoint,
        formatCount: isImage ? Object.keys(formats).length : 0,
        formats,
        sourceSignature,
      });
    }

    return items.sort((left, right) => normalizeTimestamp(right.updatedAt) - normalizeTimestamp(left.updatedAt));
  }

  function buildSyncPlan(mediaItem, settings = {}) {
    const variants = [
      {
        key: 'original',
        label: 'Original',
        sourceUrl: mediaItem.sourceUrl,
        mime: mediaItem.mime,
        width: mediaItem.width,
        height: mediaItem.height,
        size: mediaItem.size,
        ext: mediaItem.ext,
        folderPath: mediaItem.folderPath,
        meta: mediaItem.isImage && mediaItem.focusPoint
          ? {
              focus: mediaItem.focusPoint,
            }
          : null,
      },
    ];

    if (mediaItem.isImage) {
      for (const [variantKey, variant] of Object.entries(mediaItem.formats || {})) {
        if (!variant || typeof variant !== 'object' || !variant.url) {
          continue;
        }

        variants.push({
          key: String(variantKey || '').trim(),
          label: formatVariantLabel(variantKey),
          sourceUrl: resolveAssetUrl(variant.url, settings),
          mime: String(variant.mime || mediaItem.mime || '').trim(),
          width: Math.max(0, Number(variant.width) || 0),
          height: Math.max(0, Number(variant.height) || 0),
          size: Math.max(0, Number(variant.size) || 0),
          ext: resolveExt(variant.ext || mediaItem.ext, variant.url, variant.mime || mediaItem.mime),
          folderPath: mediaItem.folderPath,
          meta: mediaItem.isImage && mediaItem.focusPoint
            ? {
                focus: mediaItem.focusPoint,
              }
            : null,
        });
      }
    }

    return variants.map((variant) => {
      const uploadTarget = buildUploadTargetFromSourceUrl(
        variant.sourceUrl,
        `${variant.key || 'asset'}${variant.ext || ''}`,
        variant.folderPath
      );

      return {
        key: variant.key,
        label: variant.label,
        sourceUrl: variant.sourceUrl,
        mime: variant.mime || 'application/octet-stream',
        width: variant.width,
        height: variant.height,
        size: variant.size,
        meta: variant.meta,
        route: uploadTarget.route,
        path: uploadTarget.path,
        filename: uploadTarget.filename,
      };
    });
  }

  async function fetchBinaryAsset(url, projectToken = '') {
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
        contentType: String(response.headers.get('content-type') || '').trim(),
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || `Could not fetch ${url}.`,
      };
    }
  }

  async function listCdnMainAssets() {
    const response = await plugin(strapi).service('smooth-client').getProjectAssets('cdn-connector');

    if (!response.success) {
      return response;
    }

    return {
      success: true,
      data: (Array.isArray(response.data) ? response.data : [])
        .filter((asset) => getCdnAssetFilename(asset))
        .filter((asset) => !isCdnSubAsset(asset)),
    };
  }

  function buildCdnAssetsByKey(cdnAssets = []) {
    const byKey = new Map();

    for (const asset of Array.isArray(cdnAssets) ? cdnAssets : []) {
      const key = getCdnAssetKey(asset);

      if (!key) {
        continue;
      }

      const previous = byKey.get(key);
      if (!previous || getCdnAssetTimestamp(asset) > getCdnAssetTimestamp(previous)) {
        byKey.set(key, asset);
      }
    }

    return byKey;
  }

  function buildLocalOriginalAssetIndex(sourceItems = [], settings = {}) {
    const byKey = new Map();

    for (const item of Array.isArray(sourceItems) ? sourceItems : []) {
      const original = buildSyncPlan(item, settings).find((entry) => entry.key === 'original') || null;
      const key = original ? buildAssetComparisonKey(original.path, original.filename) : '';

      if (key) {
        byKey.set(key, item);
      }
    }

    return byKey;
  }

  async function mergeMediaItems(sourceItems) {
    const settings = await plugin(strapi).service('cdn-connector-settings').getResolved();
    const repository = plugin(strapi).service('cdn-connector-repository');
    const storedEntries = await repository.all();
    const storedById = new Map(storedEntries.map((entry) => [entry.fileId, entry]));

    return sourceItems.map((item) => {
      const stored = storedById.get(item.fileId) || null;

      return {
        id: item.id,
        fileId: item.fileId,
        syncable: Boolean(stored?.syncable),
        protected: Boolean(stored?.protected),
        name: item.name,
        alternativeText: item.alternativeText,
        mime: item.mime,
        ext: item.ext,
        size: item.size,
        width: item.width,
        height: item.height,
        updatedAt: item.updatedAt,
        createdAt: item.createdAt,
        sourceUrl: item.sourceUrl,
        isImage: item.isImage,
        formatCount: item.formatCount,
        syncStatus: stored?.syncStatus || 'not_synced',
        lastSyncedAt: stored?.lastSyncedAt || '',
        lastError: stored?.lastError || '',
        syncedEntries: Array.isArray(stored?.syncedEntries)
          ? stored.syncedEntries.map((entry) => ({
              ...entry,
              publicUrl: plugin(strapi).service('smooth-client').buildPublicUrlForUploadTarget(
                entry.path,
                entry.filename,
                settings
              ),
            }))
          : [],
      };
    });
  }

  async function reconcileRemovedItems(currentItems = []) {
    const repository = plugin(strapi).service('cdn-connector-repository');
    const offloadService = plugin(strapi).service('cdn-connector-offload');
    const currentIds = new Set(currentItems.map((item) => item.fileId));
    const removedEntries = (await repository.all()).filter((entry) => !currentIds.has(entry.fileId));

    if (removedEntries.length === 0) {
      return {
        removed: 0,
      };
    }

    const targets = removedEntries.flatMap((entry) =>
      (Array.isArray(entry.syncedEntries) ? entry.syncedEntries : [])
        .filter((asset) => asset.filename)
        .map((asset) => ({
          path: asset.path,
          filename: asset.filename,
        }))
    );

    const settings = await plugin(strapi).service('cdn-connector-settings').get();

    if (settings.deleteCdnAssetsWithMediaItems && targets.length > 0) {
      await plugin(strapi).service('smooth-client').deleteAssets(targets, 'cdn-connector');
    }

    await repository.removeMany(removedEntries.map((entry) => entry.fileId));
    offloadService.invalidateCache();

    return {
      removed: removedEntries.length,
    };
  }

  async function performSync(jobId, mediaIds = [], options = {}) {
    if (!(await isModuleEnabled())) {
      await updateSyncJob(jobId, {
        status: 'failed',
        finishedAt: nowIso(),
        currentItem: '',
        errorMessage: 'Enable the CDN Connector module first.',
      });

      return {
        success: false,
        message: 'Enable the CDN Connector module first.',
      };
    }

    const settingsService = plugin(strapi).service('cdn-connector-settings');
    const coreSettingsService = plugin(strapi).service('core-settings');
    const offloadService = plugin(strapi).service('cdn-connector-offload');
    const repository = plugin(strapi).service('cdn-connector-repository');
    const smoothClient = plugin(strapi).service('smooth-client');
    const settings = await settingsService.getResolved();
    const coreSettings = await coreSettingsService.get();
    const hasPaidPlan = Number(coreSettings.userPlan) > 0;
    const normalizedIds = Array.from(
      new Set((Array.isArray(mediaIds) ? mediaIds : [mediaIds]).map(normalizeMediaId).filter(Boolean))
    );
    const filterSet = normalizedIds.length > 0 ? new Set(normalizedIds) : null;
    const sourceItems = await listSourceMediaItems(filterSet);
    const storedEntries = await repository.all();
    const persistedById = new Map(storedEntries.map((entry) => [entry.fileId, entry]));
    const storedById = new Map(storedEntries.map((entry) => [entry.fileId, entry]));
    const markSyncable = Boolean(options.markSyncable);
    const hasProtectedOverride = Object.prototype.hasOwnProperty.call(options, 'protectedOverride');
    let protectedProjectToken = '';

    if (normalizedIds.length === 0) {
      await reconcileRemovedItems(sourceItems);
    }

    if (markSyncable) {
      const targetIds = normalizedIds.length > 0 ? normalizedIds : sourceItems.map((item) => item.fileId).filter(Boolean);

      if (targetIds.length > 0) {
        await repository.upsertMany(
          targetIds.map((fileId) => ({
            fileId,
            syncable: true,
          }))
        );

        for (const fileId of targetIds) {
          const current = storedById.get(fileId) || { fileId };
          storedById.set(fileId, {
            ...current,
            syncable: true,
            protected: hasProtectedOverride ? Boolean(options.protectedOverride) : Boolean(current.protected),
          });
        }
      }
    }

    const sourceCandidates = sourceItems.filter((item) => {
      if (markSyncable) {
        return true;
      }

      return isSyncableEntry(storedById.get(item.fileId));
    });
    const lastSyncTimestamp = normalizeTimestamp(settings.lastSyncAt);
    const cdnResponse = await listCdnMainAssets();

    if (!cdnResponse.success) {
      await updateSyncJob(jobId, {
        status: 'failed',
        finishedAt: nowIso(),
        currentItem: '',
        errorMessage: cdnResponse.message || 'Could not list Smooth Bundle assets.',
      });

      return {
        success: false,
        message: cdnResponse.message || 'Could not list Smooth Bundle assets.',
      };
    }

    const cdnAssets = Array.isArray(cdnResponse.data) ? cdnResponse.data : [];
    const cdnAssetsByKey = buildCdnAssetsByKey(cdnAssets);
    const localOriginalAssetsByKey = buildLocalOriginalAssetIndex(sourceItems, settings);
    const uploadCandidates = [];
    let plannedSkipped = 0;

    for (const item of sourceCandidates) {
      const syncPlan = buildSyncPlan(item, settings);
      const originalEntry = syncPlan.find((entry) => entry.key === 'original') || syncPlan[0] || null;
      const originalKey = originalEntry ? buildAssetComparisonKey(originalEntry.path, originalEntry.filename) : '';
      const matchingCdnAsset = originalKey ? cdnAssetsByKey.get(originalKey) : null;
      const localUpdatedAt = normalizeTimestamp(item.updatedAt || item.createdAt);
      const cdnUpdatedAt = matchingCdnAsset ? getCdnAssetTimestamp(matchingCdnAsset) : 0;

      if (matchingCdnAsset && cdnUpdatedAt > lastSyncTimestamp) {
        plannedSkipped += 1;
        continue;
      }

      if (matchingCdnAsset && localUpdatedAt <= lastSyncTimestamp) {
        plannedSkipped += 1;
        continue;
      }

      uploadCandidates.push({
        item,
        syncPlan,
      });
    }

    const downloadCandidates = cdnAssets.filter((asset) => {
      const key = getCdnAssetKey(asset);

      return key && !localOriginalAssetsByKey.has(key) && getCdnAssetTimestamp(asset) > lastSyncTimestamp;
    });

    await updateSyncJob(jobId, {
      totalItems: uploadCandidates.length + downloadCandidates.length + plannedSkipped,
      processedItems: 0,
      syncedItems: 0,
      failedItems: 0,
      skippedItems: plannedSkipped,
      currentItem: '',
      errorMessage: '',
      failedEntries: [],
    });

    if (uploadCandidates.length === 0 && downloadCandidates.length === 0) {
      if (options.trigger === 'scheduled') {
        await settingsService.touch('lastAutoSyncAt');
        await settingsService.touch('lastSyncAt');
      } else {
        await settingsService.touch('lastSyncAt');
      }

      await updateSyncJob(jobId, {
        status: 'completed',
        processedItems: plannedSkipped,
        syncedItems: 0,
        failedItems: 0,
        skippedItems: plannedSkipped,
        currentItem: '',
        finishedAt: nowIso(),
        errorMessage: '',
        failedEntries: [],
      });

      return {
        success: true,
        synced: 0,
        skipped: plannedSkipped,
        failed: 0,
      };
    }

    let synced = 0;
    let skipped = plannedSkipped;
    let failed = 0;
    const failures = [];
    const pendingBatch = [];

    const markFailedItem = async (item, failureMessage) => {
      failed += 1;
      failures.push({
        fileId: item.fileId,
        message: failureMessage,
      });

      await repository.upsert({
        fileId: item.fileId,
        syncable: true,
        protected: hasProtectedOverride ? Boolean(options.protectedOverride) : Boolean(storedById.get(item.fileId)?.protected),
        syncStatus: 'upload_failed',
        lastError: failureMessage,
      });
      offloadService.invalidateCache();

      await updateSyncJob(jobId, {
        processedItems: synced + failed + skipped,
        failedItems: failed,
        failedEntries: failures,
      });
    };

    const markSkippedUploadedItem = async (item, protectedValue) => {
      skipped += 1;

      await repository.upsert({
        fileId: item.fileId,
        syncable: true,
        protected: Boolean(protectedValue),
        syncStatus: 'uploaded',
        lastError: '',
      });
      offloadService.invalidateCache();

      await updateSyncJob(jobId, {
        processedItems: synced + failed + skipped,
        skippedItems: skipped,
      });
    };

    const shouldSkipExpectedOffloadedMissingSource = (entry, failureMessage) => (
      settings.offloadLocalFiles &&
      entry?.current?.syncStatus === 'uploaded' &&
      Boolean(entry?.persistedCurrent) &&
      Boolean(entry?.current?.syncedEntries?.length) &&
      Boolean(entry?.persistedCurrent?.protected) === Boolean(entry?.protected) &&
      isExpectedOffloadedMissingSource(failureMessage)
    );

    const markUploadedItem = async (batchEntry, upload) => {
      const uploadResults = upload && typeof upload.results === 'object' ? upload.results : {};
      const nextSyncedEntries = batchEntry.syncPlan.map((entry) => {
        const uploadResult = uploadResults[entry.route] && typeof uploadResults[entry.route] === 'object'
          ? uploadResults[entry.route]
          : {};

        return {
          key: entry.key,
          label: entry.label,
          projectAssetId: String(
            uploadResult.projectAssetId || uploadResult.assetId || uploadResult.asset_id || ''
          ).trim(),
          path: entry.path,
          filename: entry.filename,
          mime: entry.mime,
          width: entry.width,
          height: entry.height,
          size: entry.size,
        };
      });
      const previousTargets = Array.isArray(batchEntry.current?.syncedEntries) ? batchEntry.current.syncedEntries : [];
      const nextTargetKeys = new Set(nextSyncedEntries.map((entry) => `${entry.path}:${entry.filename}`));
      const obsoleteTargets = previousTargets
        .filter((entry) => entry.filename && !nextTargetKeys.has(`${entry.path}:${entry.filename}`))
        .map((entry) => ({
          path: entry.path,
          filename: entry.filename,
        }));

      if (obsoleteTargets.length > 0) {
        await smoothClient.deleteAssets(obsoleteTargets, 'cdn-connector');
      }

      await repository.upsert({
        fileId: batchEntry.item.fileId,
        syncable: true,
        protected: Boolean(batchEntry.protected),
        syncStatus: 'uploaded',
        lastSyncedAt: nowIso(),
        lastSourceSignature: batchEntry.syncSignature,
        lastError: '',
        syncedEntries: nextSyncedEntries,
      });
      offloadService.invalidateCache();

      if (settings.offloadLocalFiles) {
        const offloadResult = await offloadService.offloadLocalMediaFile(batchEntry.item.fileId, {
          settings,
        });

        if (!offloadResult.success) {
          strapi.log.warn(
            `[smoothbundle] CDN Connector offload could not remove local files for media ${batchEntry.item.fileId}: ${
              offloadResult.message || 'Unknown error.'
            }`
          );
        }
      }

      synced += 1;
      await updateSyncJob(jobId, {
        processedItems: synced + failed + skipped,
        syncedItems: synced,
      });
    };

    const flushPendingBatch = async () => {
      if (pendingBatch.length === 0) {
        return;
      }

      const currentBatch = pendingBatch.splice(0, pendingBatch.length);
      const originalAssets = currentBatch
        .map((entry) => entry.uploadAssets.find((asset) => asset.key === 'original') || null)
        .filter(Boolean);
      const originalUpload = await smoothClient.uploadAssets(originalAssets, 'cdn-connector', {
        batchSize: CDN_CONNECTOR_UPLOAD_BATCH_SIZE,
      });
      await refreshActiveSyncLock(options);
      const variantAssets = [];
      const variantFailuresByFileId = new Map();

      for (const entry of currentBatch) {
        const originalAsset = entry.uploadAssets.find((asset) => asset.key === 'original') || null;
        const originalResult = originalAsset ? originalUpload?.results?.[originalAsset.route] || null : null;
        const originalAssetId = String(
          originalResult?.projectAssetId || originalResult?.assetId || originalResult?.asset_id || ''
        ).trim();

        if (!originalAsset || !originalResult || originalResult.success !== true) {
          continue;
        }

        const dependentAssets = entry.uploadAssets.filter((asset) => asset.key !== 'original');

        if (dependentAssets.length > 0 && !originalAssetId) {
          variantFailuresByFileId.set(entry.item.fileId, 'Could not determine the uploaded original asset ID.');
          continue;
        }

        for (const asset of dependentAssets) {
          variantAssets.push({
            ...asset,
            parentAssetId: originalAssetId,
          });
        }
      }

      const variantUpload = variantAssets.length > 0
        ? await smoothClient.uploadAssets(variantAssets, 'cdn-connector', {
            batchSize: CDN_CONNECTOR_UPLOAD_BATCH_SIZE,
          })
        : { results: {} };
      await refreshActiveSyncLock(options);
      const upload = {
        results: {
          ...(originalUpload?.results || {}),
          ...(variantUpload?.results || {}),
        },
      };

      for (const entry of currentBatch) {
        await updateSyncJob(jobId, {
          currentItem: entry.item.name || entry.item.fileId,
        });

        const variantFailureMessage = variantFailuresByFileId.get(entry.item.fileId) || '';
        const hasEntryFailure = entry.uploadAssets.some((asset) => {
          const result = upload?.results?.[asset.route];
          return !result || result.success !== true;
        });

        if (variantFailureMessage) {
          if (shouldSkipExpectedOffloadedMissingSource(entry, variantFailureMessage)) {
            await markSkippedUploadedItem(entry.item, entry.protected);
            continue;
          }

          await markFailedItem(entry.item, variantFailureMessage);
          continue;
        }

        if (hasEntryFailure) {
          const uploadFailureMessage = buildUploadFailureMessage(upload, entry.uploadAssets);

          if (shouldSkipExpectedOffloadedMissingSource(entry, uploadFailureMessage)) {
            await markSkippedUploadedItem(entry.item, entry.protected);
            continue;
          }

          await markFailedItem(entry.item, uploadFailureMessage);
          continue;
        }

        await markUploadedItem(entry, upload);
      }
    };

    for (const uploadCandidate of uploadCandidates) {
      const { item, syncPlan } = uploadCandidate;

      await updateSyncJob(jobId, {
        currentItem: item.name || item.fileId,
      });
      await refreshActiveSyncLock(options);

      const current = storedById.get(item.fileId) || null;
      const persistedCurrent = persistedById.get(item.fileId) || null;
      const targetProtected = hasProtectedOverride ? Boolean(options.protectedOverride) : Boolean(current?.protected);
      const syncSignature = JSON.stringify({
        source: item.sourceSignature,
        protectedAssets: targetProtected,
        syncAllFormats: Boolean(settings.syncAllFormats),
        entries: syncPlan.map((entry) => `${entry.key}:${entry.filename}:${JSON.stringify(entry.meta || {})}`),
      });

      if (!options.force && current?.syncStatus === 'uploaded' && current.lastSourceSignature === syncSignature) {
        skipped += 1;
        await updateSyncJob(jobId, {
          processedItems: synced + failed + skipped,
          skippedItems: skipped,
        });
        continue;
      }

      const uploadAssets = [];
      let failureMessage = '';

      if (isPaidPlanArchiveAsset(item.name, item.ext) && !hasPaidPlan) {
        failureMessage = 'Archive uploads require a paid Smooth Bundle plan.';
      }

      for (const plannedEntry of failureMessage ? [] : syncPlan) {
        if (!plannedEntry.sourceUrl) {
          failureMessage = 'The source media URL is missing.';
          break;
        }

        const previousSyncedEntry = findSyncedEntryByKey(current, plannedEntry.key);
        let preferredSourceUrl = plannedEntry.sourceUrl;
        let fallbackSourceUrl = previousSyncedEntry?.filename
          ? smoothClient.buildPublicUrlForUploadTarget(previousSyncedEntry.path, previousSyncedEntry.filename, settings)
          : '';

        if (settings.offloadLocalFiles && current?.syncStatus === 'uploaded' && fallbackSourceUrl) {
          preferredSourceUrl = fallbackSourceUrl;
        }

        const previousRemoteAssetWasProtected = Boolean(persistedCurrent?.protected);
        const ensureProtectedProjectToken = async () => {
          if (!previousRemoteAssetWasProtected || protectedProjectToken) {
            return true;
          }

          const tokenResponse = await smoothClient.getProjectToken('cdn-connector');

          if (!tokenResponse.success || !String(tokenResponse.token || '').trim()) {
            failureMessage = tokenResponse.message || 'Could not fetch the Smooth Bundle project token for protected assets.';
            return false;
          }

          protectedProjectToken = String(tokenResponse.token || '').trim();
          return true;
        };

        if (
          previousRemoteAssetWasProtected &&
          preferredSourceUrl &&
          fallbackSourceUrl &&
          preferredSourceUrl === fallbackSourceUrl &&
          !(await ensureProtectedProjectToken())
        ) {
          break;
        }

        const preferredSourceToken =
          previousRemoteAssetWasProtected &&
          preferredSourceUrl &&
          fallbackSourceUrl &&
          preferredSourceUrl === fallbackSourceUrl
            ? protectedProjectToken
            : '';
        let fetched = await fetchBinaryAsset(preferredSourceUrl, preferredSourceToken);

        if (!fetched.success && settings.offloadLocalFiles && current?.syncStatus === 'uploaded') {
          if (fallbackSourceUrl && fallbackSourceUrl !== preferredSourceUrl) {
            if (previousRemoteAssetWasProtected && !(await ensureProtectedProjectToken())) {
              break;
            }

            const fallbackFetched = await fetchBinaryAsset(fallbackSourceUrl, protectedProjectToken);

            if (fallbackFetched.success) {
              fetched = fallbackFetched;
            } else {
              fetched = {
                success: false,
                message: `${fetched.message || 'Could not fetch the source media file.'} ${
                  fallbackFetched.message || ''
                }`.trim(),
              };
            }
          }
        }

        if (!fetched.success) {
          failureMessage = fetched.message || 'Could not fetch the source media file.';
          break;
        }

        uploadAssets.push({
          key: plannedEntry.key,
          route: plannedEntry.route,
          uploadTarget: {
            path: plannedEntry.path,
            filename: plannedEntry.filename,
          },
          filename: plannedEntry.filename,
          protected: targetProtected,
          meta: plannedEntry.meta || null,
          body: fetched.body,
          contentType: plannedEntry.mime || fetched.contentType || 'application/octet-stream',
        });
      }

      if (failureMessage) {
        if (shouldSkipExpectedOffloadedMissingSource({
          current,
          persistedCurrent,
          protected: targetProtected,
        }, failureMessage)) {
          await markSkippedUploadedItem(item, targetProtected);
          continue;
        }

        await markFailedItem(item, failureMessage);
        continue;
      }

      pendingBatch.push({
        item,
        current,
        persistedCurrent,
        protected: targetProtected,
        syncPlan,
        syncSignature,
        uploadAssets,
      });

      if (pendingBatch.length >= CDN_CONNECTOR_UPLOAD_BATCH_SIZE) {
        await flushPendingBatch();
      }
    }

    await flushPendingBatch();

    for (const asset of downloadCandidates) {
      const filename = getCdnAssetFilename(asset);

      await updateSyncJob(jobId, {
        currentItem: filename || getCdnAssetId(asset),
      });
      await refreshActiveSyncLock(options);

      const restoreResult = await restoreCdnMediaAsset(asset, { settings });

      if (!restoreResult.success) {
        failed += 1;
        failures.push({
          fileId: getCdnAssetId(asset) || filename,
          message: restoreResult.message || 'Could not download media asset from Smooth Bundle.',
        });

        await updateSyncJob(jobId, {
          processedItems: synced + failed + skipped,
          failedItems: failed,
          failedEntries: failures,
        });
        continue;
      }

      synced += 1;
      await updateSyncJob(jobId, {
        processedItems: synced + failed + skipped,
        syncedItems: synced,
      });
    }

    if (options.trigger === 'scheduled') {
      await settingsService.touch('lastAutoSyncAt');
      await settingsService.touch('lastSyncAt');
    } else {
      await settingsService.touch('lastSyncAt');
    }

    const result = {
      success: failed === 0,
      synced,
      skipped,
      failed,
      failures,
      message:
        failed > 0
          ? `Synced ${synced} media item${synced === 1 ? '' : 's'}, ${failed} failed.`
          : `Synced ${synced} media item${synced === 1 ? '' : 's'}.`,
    };

    await updateSyncJob(jobId, {
      status: failed > 0 ? 'failed' : 'completed',
      processedItems: synced + failed + skipped,
      syncedItems: synced,
      failedItems: failed,
      skippedItems: skipped,
      currentItem: '',
      finishedAt: nowIso(),
      errorMessage: failed > 0 ? result.message : '',
      failedEntries: failures,
    });

    return result;
  }

  async function restoreCdnMediaAsset(asset = {}, options = {}) {
    const settings = options.settings || (await plugin(strapi).service('cdn-connector-settings').getResolved());
    const smoothClient = plugin(strapi).service('smooth-client');
    const filename = getCdnAssetFilename(asset);
    const assetPath = getCdnAssetPath(asset);

    if (!filename) {
      return {
        success: false,
        message: 'The selected CDN asset is missing a filename.',
      };
    }

    const publicDirectory = path.resolve(
      strapi.dirs?.static?.public || strapi.dirs?.public || path.join(strapi.dirs?.app?.root || process.cwd(), 'public')
    );
    const publicPrefix = publicDirectory.endsWith(path.sep) ? publicDirectory : `${publicDirectory}${path.sep}`;
    const restoredEntries = [];
    const assetsToRestore = [
      {
        key: 'original',
        asset,
      },
    ];

    for (const restoreEntry of assetsToRestore) {
      const restoreAsset = restoreEntry.asset;
      const restoreFilename = getCdnAssetFilename(restoreAsset);
      const restorePath = getCdnAssetPath(restoreAsset.path ? restoreAsset : { ...restoreAsset, path: assetPath });
      const normalizedRelativePath = `${restorePath === '/' ? '' : restorePath.replace(/^\/+|\/+$/g, '')}/${restoreFilename}`.replace(/^\/+/, '');
      const localPath = path.resolve(publicDirectory, normalizedRelativePath);

      if (!localPath.startsWith(publicPrefix)) {
        return {
          success: false,
          message: 'Could not determine a safe local restore path for this CDN asset.',
        };
      }

      let body = null;
      let fetchedContentType = '';

      if (!settings.offloadLocalFiles) {
        const restoreUrl = smoothClient.buildPublicUrlForUploadTarget(restorePath, restoreFilename, settings);
        let projectToken = '';

        if (asset.protected || restoreAsset.protected) {
          const tokenResponse = await smoothClient.getProjectToken('cdn-connector');

          if (!tokenResponse.success || !String(tokenResponse.token || '').trim()) {
            return {
              success: false,
              message: tokenResponse.message || 'Could not fetch the Smooth Bundle project token for protected assets.',
            };
          }

          projectToken = String(tokenResponse.token || '').trim();
        }

        const fetched = await fetchBinaryAsset(
          `${restoreUrl}${restoreUrl.includes('?') ? '&' : '?'}original=1`,
          projectToken
        );

        if (!fetched.success) {
          return fetched;
        }

        body = fetched.body;
        fetchedContentType = fetched.contentType;

        await fs.mkdir(path.dirname(localPath), { recursive: true });
        await fs.writeFile(localPath, body);
      }

      const ext = resolveExt('', restoreFilename, restoreAsset.contentType || restoreAsset.mime);
      const mime = normalizeRestoredMime(restoreAsset.contentType || restoreAsset.mime || fetchedContentType, ext);
      const dimensions = mime.startsWith('image/') && !settings.offloadLocalFiles
        ? await getRestoredImageDimensions(strapi, localPath, {
            name: restoreFilename,
            hash: path.basename(restoreFilename, ext) || path.basename(restoreFilename),
            ext,
            mime,
          })
        : {
            width: Math.max(0, Number(restoreAsset.width) || 0) || null,
            height: Math.max(0, Number(restoreAsset.height) || 0) || null,
          };
      const sizeInBytes = body
        ? body.length
        : Math.max(0, Number(restoreAsset.sizeInBytes || restoreAsset.size_in_bytes || restoreAsset.bytes) || 0);

      restoredEntries.push({
        key: restoreEntry.key,
        asset: restoreAsset,
        filename: restoreFilename,
        path: restorePath,
        relativePath: normalizedRelativePath,
        localPath,
        ext,
        mime,
        width: dimensions.width,
        height: dimensions.height,
        sizeInBytes,
        size: sizeInBytes > 0 ? bytesToKbytes(sizeInBytes) : Math.max(0, Number(restoreAsset.size) || 0),
      });
    }

    const originalRestoredEntry = restoredEntries.find((entry) => entry.key === 'original');
    if (!originalRestoredEntry) {
      return {
        success: false,
        message: 'Could not restore the original CDN asset.',
      };
    }

    if (!settings.offloadLocalFiles && originalRestoredEntry.mime.startsWith('image/')) {
      const generatedFormats = await generateRestoredImageFormats(
        strapi,
        originalRestoredEntry,
        publicPrefix,
        originalRestoredEntry.path
      );
      const originalAssetId = getCdnAssetId(asset);
      const generatedFormatUploads = [];

      if (generatedFormats.length > 0 && !originalAssetId) {
        return {
          success: false,
          message: 'Could not determine the original CDN asset ID for generated image variants.',
        };
      }

      for (const generatedFormat of generatedFormats) {
        restoredEntries.push({
          ...generatedFormat,
          label: formatVariantLabel(generatedFormat.key),
          asset: {},
        });

        generatedFormatUploads.push({
          key: generatedFormat.key,
          route: `/${generatedFormat.relativePath}`,
          uploadTarget: {
            path: generatedFormat.path,
            filename: generatedFormat.filename,
          },
          filename: generatedFormat.filename,
          protected: Boolean(asset.protected),
          parentAssetId: originalAssetId,
          body: await fs.readFile(generatedFormat.localPath),
          contentType: generatedFormat.mime || 'application/octet-stream',
        });
      }

      if (generatedFormatUploads.length > 0) {
        const variantUpload = await smoothClient.uploadAssets(generatedFormatUploads, 'cdn-connector', {
          batchSize: CDN_CONNECTOR_UPLOAD_BATCH_SIZE,
        });

        if (!variantUpload.success) {
          return {
            success: false,
            message: variantUpload.message || 'Could not upload generated image variants to Smooth Bundle.',
          };
        }

        const projectAssetIdsByRoute = new Map(
          generatedFormatUploads.map((uploadAsset) => {
            const uploadResult = variantUpload.results?.[uploadAsset.route] || {};
            return [
              uploadAsset.route,
              String(uploadResult.projectAssetId || uploadResult.assetId || uploadResult.asset_id || '').trim(),
            ];
          })
        );

        for (const restoredEntry of restoredEntries) {
          if (restoredEntry.key === 'original') {
            continue;
          }

          const route = `/${restoredEntry.relativePath}`;
          restoredEntry.projectAssetId = projectAssetIdsByRoute.get(route) || '';
        }
      }
    }

    const formats = restoredEntries
      .filter((entry) => entry.key && entry.key !== 'original')
      .reduce((acc, entry) => {
        acc[entry.key] = {
          name: entry.filename,
          hash: path.basename(entry.filename, entry.ext) || path.basename(entry.filename),
          ext: entry.ext,
          mime: entry.mime,
          path: null,
          width: entry.width,
          height: entry.height,
          size: entry.size,
          sizeInBytes: entry.sizeInBytes,
          url: `/${entry.relativePath}`,
        };
        return acc;
      }, {});

    const ext = originalRestoredEntry.ext;
    const hash = path.basename(filename, ext) || path.basename(filename);
    const created = await strapi.db.query('plugin::upload.file').create({
      data: {
        name: filename,
        alternativeText: null,
        caption: null,
        width: originalRestoredEntry.width,
        height: originalRestoredEntry.height,
        formats: Object.keys(formats).length > 0 ? formats : null,
        hash,
        ext,
        mime: originalRestoredEntry.mime,
        size: originalRestoredEntry.size,
        sizeInBytes: originalRestoredEntry.sizeInBytes,
        url: `/${originalRestoredEntry.relativePath}`,
        previewUrl: null,
        provider: 'local',
        provider_metadata: null,
        folderPath: '/',
      },
    });

    const fileId = normalizeMediaId(created?.id);
    const syncedEntries = restoredEntries.map((entry) => ({
      key: entry.key,
      label: formatVariantLabel(entry.key),
      projectAssetId: getCdnAssetId(entry.asset) || String(entry.projectAssetId || '').trim(),
      path: entry.path,
      filename: entry.filename,
      mime: entry.mime,
      width: entry.width,
      height: entry.height,
      size: entry.size,
    }));

    await plugin(strapi).service('cdn-connector-repository').upsert({
      fileId,
      syncable: true,
      protected: Boolean(asset.protected),
      syncStatus: 'uploaded',
      lastSyncedAt: nowIso(),
      lastSourceSignature: '',
      lastError: '',
      syncedEntries,
    });
    await plugin(strapi).service('cdn-connector-runtime-state').markAssetRestored(getCdnAssetKey(asset));
    plugin(strapi).service('cdn-connector-offload').invalidateCache();

    return {
      success: true,
      message: 'Asset restored from Smooth Bundle.',
      fileId,
      syncedEntries,
    };
  }

  return {
    async listMediaItems() {
      const sourceItems = await listSourceMediaItems();
      return mergeMediaItems(sourceItems);
    },

    async removeDeletedMediaItems(fileIds = []) {
      const normalizedIds = Array.from(
        new Set((Array.isArray(fileIds) ? fileIds : [fileIds]).map(normalizeMediaId).filter(Boolean))
      );

      if (normalizedIds.length === 0) {
        return {
          success: true,
          deleted: 0,
        };
      }

      const repository = plugin(strapi).service('cdn-connector-repository');
      const offloadService = plugin(strapi).service('cdn-connector-offload');
      const entries = await Promise.all(normalizedIds.map((fileId) => repository.get(fileId)));
      const targets = entries.flatMap((entry) =>
        (Array.isArray(entry?.syncedEntries) ? entry.syncedEntries : [])
          .filter((asset) => asset.filename)
          .map((asset) => ({
            path: asset.path,
            filename: asset.filename,
          }))
      );

      const settings = await plugin(strapi).service('cdn-connector-settings').get();

      if (settings.deleteCdnAssetsWithMediaItems && targets.length > 0) {
        const deletion = await plugin(strapi).service('smooth-client').deleteAssets(targets, 'cdn-connector');

        if (!deletion.success) {
          return {
            success: false,
            message: deletion.message || 'Could not delete synced media assets from Smooth Bundle.',
            deleted: 0,
          };
        }
      }

      await repository.removeMany(normalizedIds);
      offloadService.invalidateCache();

      return {
        success: true,
        deleted: normalizedIds.length,
      };
    },

    async listRestorableMediaAssets() {
      const response = await listCdnMainAssets();

      if (!response.success) {
        return response;
      }

      const settings = await plugin(strapi).service('cdn-connector-settings').getResolved();
      const runtimeState = await plugin(strapi).service('cdn-connector-runtime-state').get();
      const sourceItems = await listSourceMediaItems();
      const existingLocalKeys = buildLocalOriginalAssetIndex(sourceItems, settings);
      const repositoryEntries = await plugin(strapi).service('cdn-connector-repository').all();
      const knownSyncedKeys = new Set();
      const restoredAssetKeys = new Set(runtimeState.restoredAssetKeys || []);
      const lastSyncTimestamp = normalizeTimestamp(settings.lastSyncAt);

      for (const entry of repositoryEntries) {
        for (const syncedEntry of Array.isArray(entry.syncedEntries) ? entry.syncedEntries : []) {
          const key = buildAssetComparisonKey(syncedEntry.path, syncedEntry.filename);

          if (key) {
            knownSyncedKeys.add(key);
          }
        }
      }

      const data = (Array.isArray(response.data) ? response.data : [])
        .filter((asset) => !asset?.protected)
        .filter((asset) => !isPluginAssetPath(asset))
        .filter((asset) => {
          const key = getCdnAssetKey(asset);

          if (!key || existingLocalKeys.has(key) || knownSyncedKeys.has(key) || restoredAssetKeys.has(key)) {
            return false;
          }

          return lastSyncTimestamp > 0 && getCdnAssetTimestamp(asset) < lastSyncTimestamp;
        });

      return {
        success: true,
        data,
      };
    },

    async restoreMediaAssetFromCdn(assetId = '') {
      const normalizedAssetId = String(assetId || '').trim();
      const settings = await plugin(strapi).service('cdn-connector-settings').getResolved();
      const response = await this.listRestorableMediaAssets();
      const asset = Array.isArray(response.data)
        ? response.data.find((entry) => getCdnAssetId(entry) === normalizedAssetId)
        : null;

      if (!response.success) {
        return response;
      }

      if (!asset) {
        return {
          success: false,
          message: 'The selected CDN asset is no longer available for restore.',
        };
      }

      return restoreCdnMediaAsset(asset, { settings });
    },

    async unsyncMediaItems(fileIds = [], options = {}) {
      if (!(await isModuleEnabled())) {
        return {
          success: false,
          message: 'Enable the CDN Connector module first.',
          unsynced: 0,
        };
      }

      const normalizedIds = Array.from(
        new Set((Array.isArray(fileIds) ? fileIds : [fileIds]).map(normalizeMediaId).filter(Boolean))
      );
      const settings = await plugin(strapi).service('cdn-connector-settings').getResolved();
      const repository = plugin(strapi).service('cdn-connector-repository');
      const offloadService = plugin(strapi).service('cdn-connector-offload');
      const syncJobId = String(options.syncJobId || '').trim();
      const requestedEntries = normalizedIds.length > 0
        ? await Promise.all(normalizedIds.map((fileId) => repository.get(fileId)))
        : await repository.all();
      const entries = requestedEntries.filter((entry) => entry && isSyncableEntry(entry));
      const uploadedEntries = entries.filter((entry) => String(entry.syncStatus || '').trim() === 'uploaded');

      if (entries.length === 0) {
        return {
          success: true,
          message: 'No selected media items to unsync.',
          unsynced: 0,
        };
      }

      if (syncJobId) {
        await updateSyncJob(syncJobId, {
          totalItems: entries.length,
          processedItems: 0,
          syncedItems: 0,
          failedItems: 0,
          skippedItems: 0,
          currentItem: '',
          errorMessage: '',
          failedEntries: [],
        });
      }

      const restoreFailures = [];
      let processedItems = 0;

      const markProcessed = async (entry, failureMessage = '') => {
        processedItems += 1;

        if (!syncJobId) {
          return;
        }

        const patch = {
          processedItems,
          currentItem: entry?.fileId || '',
        };

        if (failureMessage) {
          patch.failedItems = restoreFailures.length;
          patch.failedEntries = restoreFailures;
          patch.errorMessage = failureMessage;
        }

        await updateSyncJob(syncJobId, patch);
      };

      for (const entry of uploadedEntries) {
        if (syncJobId) {
          await updateSyncJob(syncJobId, {
            currentItem: entry.fileId,
          });
        }

        const restoreResult = await offloadService.restoreLocalMediaFile(entry.fileId, {
          settings,
          repositoryEntry: entry,
        });

        if (!restoreResult.success) {
          restoreFailures.push({
            fileId: entry.fileId,
            message: restoreResult.message || 'Could not restore local media files from Smooth Bundle.',
          });
          await markProcessed(entry, restoreResult.message || 'Could not restore local media files from Smooth Bundle.');
          continue;
        }

        await markProcessed(entry);
      }

      if (restoreFailures.length > 0) {
        if (syncJobId) {
          await updateSyncJob(syncJobId, {
            status: 'failed',
            finishedAt: nowIso(),
            currentItem: '',
            processedItems,
            failedItems: restoreFailures.length,
            failedEntries: restoreFailures,
            errorMessage: restoreFailures[0].message,
          });
        }

        return {
          success: false,
          message: restoreFailures[0].message,
          unsynced: 0,
          failures: restoreFailures,
        };
      }

      const targets = uploadedEntries.flatMap((entry) =>
        (Array.isArray(entry?.syncedEntries) ? entry.syncedEntries : [])
          .filter((asset) => asset.filename)
          .map((asset) => ({
            path: asset.path,
            filename: asset.filename,
          }))
      );

      if (targets.length > 0) {
        const deletion = await plugin(strapi).service('smooth-client').deleteAssets(targets, 'cdn-connector');

        if (!deletion.success) {
          if (syncJobId) {
            await updateSyncJob(syncJobId, {
              status: 'failed',
              finishedAt: nowIso(),
              currentItem: '',
              processedItems,
              failedItems: 1,
              failedEntries: [
                {
                  fileId: uploadedEntries[0]?.fileId || '',
                  message: deletion.message || 'Could not delete synced media assets from Smooth Bundle.',
                },
              ],
              errorMessage: deletion.message || 'Could not delete synced media assets from Smooth Bundle.',
            });
          }

          return {
            success: false,
            message: deletion.message || 'Could not delete synced media assets from Smooth Bundle.',
            unsynced: 0,
          };
        }
      }

      await repository.upsertMany(
        entries.map((entry) => ({
          fileId: entry.fileId,
          syncable: false,
          protected: false,
          syncStatus: 'not_synced',
          lastSyncedAt: '',
          lastSourceSignature: '',
          lastError: '',
          syncedEntries: [],
        }))
      );
      offloadService.invalidateCache();

      if (syncJobId) {
        await updateSyncJob(syncJobId, {
          status: 'completed',
          finishedAt: nowIso(),
          currentItem: '',
          processedItems: entries.length,
          syncedItems: entries.length,
          failedItems: 0,
          skippedItems: 0,
          errorMessage: '',
          failedEntries: [],
        });
      }

      return {
        success: true,
        message:
          entries.length === 1
            ? 'Media item was removed from Smooth Bundle.'
            : `${entries.length} media items were removed from Smooth Bundle.`,
        unsynced: entries.length,
      };
    },

    async startUnsyncJob(fileIds = [], options = {}) {
      await reconcileStaleSyncState();
      const runtimeState = plugin(strapi).service('cdn-connector-runtime-state');
      const currentJob = (await runtimeState.get()).syncJob || defaultSyncJob();

      if (currentJob.status === 'running') {
        return {
          success: false,
          busy: true,
          message: 'Media sync is already running.',
          job: currentJob,
        };
      }

      await plugin(strapi).service('cdn-connector-optimize-queue').clearPendingSync(fileIds);

      const jobId = randomUUID();
      const lockOwner = `${jobId}:${String(options.trigger || 'unsync').trim() || 'unsync'}`;
      const lockClaimed = await runtimeState.claimLock(lockOwner, SYNC_LOCK_TTL_MS);

      if (!lockClaimed) {
        return {
          success: false,
          busy: true,
          message: 'Media sync is already running.',
          job: currentJob,
        };
      }

      const initialJob = await updateSyncJob(jobId, {
        status: 'running',
        trigger: String(options.trigger || 'unsync').trim(),
        totalItems: 0,
        processedItems: 0,
        syncedItems: 0,
        failedItems: 0,
        skippedItems: 0,
        currentItem: '',
        startedAt: nowIso(),
        finishedAt: '',
        errorMessage: '',
        failedEntries: [],
      });

      const jobPromise = this.unsyncMediaItems(fileIds, {
        ...options,
        syncJobId: jobId,
      }).catch(async (error) => {
        await updateSyncJob(jobId, {
          status: 'failed',
          finishedAt: nowIso(),
          currentItem: '',
          errorMessage: error.message || 'Media unsync failed.',
        });

        throw error;
      }).finally(() => {
        activeSyncPromise = null;
        runtimeState.releaseLock(lockOwner).catch(() => null);
      });
      activeSyncPromise = jobPromise;

      setImmediate(() => {
        jobPromise.catch(() => null);
      });

      return {
        success: true,
        job: initialJob,
      };
    },

    async syncMediaItems(mediaIds = [], options = {}) {
      if (activeSyncPromise) {
        return {
          success: false,
          busy: true,
          message: 'Media sync is already running.',
        };
      }

      const jobId = randomUUID();
      const runtimeState = plugin(strapi).service('cdn-connector-runtime-state');
      const lockOwner = `${jobId}:${String(options.trigger || 'sync').trim() || 'sync'}`;
      const lockClaimed = await runtimeState.claimLock(lockOwner, SYNC_LOCK_TTL_MS);

      if (!lockClaimed) {
        return {
          success: false,
          busy: true,
          message: 'Media sync is already running.',
        };
      }

      await updateSyncJob(jobId, {
        status: 'running',
        trigger: String(options.trigger || '').trim(),
        totalItems: 0,
        processedItems: 0,
        syncedItems: 0,
        failedItems: 0,
        skippedItems: 0,
        currentItem: '',
        startedAt: nowIso(),
        finishedAt: '',
        errorMessage: '',
        failedEntries: [],
      });

      const jobPromise = performSync(jobId, mediaIds, {
        ...options,
        syncLockOwner: lockOwner,
      }).catch(async (error) => {
        await updateSyncJob(jobId, {
          status: 'failed',
          finishedAt: nowIso(),
          currentItem: '',
          errorMessage: error.message || 'Media sync failed.',
        });

        throw error;
      });
      activeSyncPromise = jobPromise;

      try {
        return await jobPromise;
      } finally {
        activeSyncPromise = null;
        await runtimeState.releaseLock(lockOwner);
      }
    },

    async startSyncJob(mediaIds = [], options = {}) {
      await reconcileStaleSyncState();
      const runtimeState = plugin(strapi).service('cdn-connector-runtime-state');
      const currentJob = (await runtimeState.get()).syncJob || defaultSyncJob();

      if (currentJob.status === 'running') {
        return {
          success: false,
          busy: true,
          message: 'Media sync is already running.',
          job: currentJob,
        };
      }

      const jobId = randomUUID();
      const lockOwner = `${jobId}:${String(options.trigger || 'sync').trim() || 'sync'}`;
      const lockClaimed = await runtimeState.claimLock(lockOwner, SYNC_LOCK_TTL_MS);

      if (!lockClaimed) {
        return {
          success: false,
          busy: true,
          message: 'Media sync is already running.',
          job: currentJob,
        };
      }

      const initialJob = await updateSyncJob(jobId, {
        status: 'running',
        trigger: String(options.trigger || '').trim(),
        totalItems: 0,
        processedItems: 0,
        syncedItems: 0,
        failedItems: 0,
        skippedItems: 0,
        currentItem: '',
        startedAt: nowIso(),
        finishedAt: '',
        errorMessage: '',
        failedEntries: [],
      });

      const jobPromise = performSync(jobId, mediaIds, {
        ...options,
        syncLockOwner: lockOwner,
      }).catch(async (error) => {
        await updateSyncJob(jobId, {
          status: 'failed',
          finishedAt: nowIso(),
          currentItem: '',
          errorMessage: error.message || 'Media sync failed.',
        });

        throw error;
      }).finally(() => {
        activeSyncPromise = null;
        runtimeState.releaseLock(lockOwner).catch(() => null);
      });
      activeSyncPromise = jobPromise;

      setImmediate(() => {
        jobPromise.catch(() => null);
      });

      return {
        success: true,
        job: initialJob,
      };
    },

    async getSyncJobStatus() {
      const result = await reconcileStaleSyncState();
      return result.state?.syncJob || defaultSyncJob();
    },

    async runScheduledSync() {
      await reconcileStaleSyncState();
      if (!(await isModuleEnabled())) {
        return;
      }

      const settings = await plugin(strapi).service('cdn-connector-settings').get();
      const intervalMs = parseIntervalFrequency(settings.autoSyncFrequency);

      if (!intervalMs) {
        return;
      }

      const lastRun = settings.lastAutoSyncAt ? new Date(settings.lastAutoSyncAt).getTime() : 0;

      if (Date.now() - lastRun < intervalMs) {
        return;
      }

      await this.syncMediaItems([], {
        trigger: 'scheduled',
      });
    },

    startScheduler() {
      if (schedulerHandle) {
        return;
      }

      schedulerHandle = setInterval(() => {
        this.runScheduledSync().catch((error) => {
          strapi.log.error(`[smoothbundle] CDN Connector scheduled sync failed: ${error.message}`);
        });
      }, 60 * 1000);
    },

    stopScheduler() {
      if (schedulerHandle) {
        clearInterval(schedulerHandle);
        schedulerHandle = null;
      }
    },
  };
};
