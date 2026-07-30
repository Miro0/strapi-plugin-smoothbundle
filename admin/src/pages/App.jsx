import React from 'react';
import styled from 'styled-components';
import { Page, Layouts, SubNav, useFetchClient } from '@strapi/strapi/admin';
import {
  Alert,
  Badge,
  BaseLink,
  Box,
  Button,
  Divider,
  Field,
  Flex,
  Grid,
  SingleSelect,
  SingleSelectOption,
  Table,
  Tbody,
  Td,
  TextInput,
  Th,
  Thead,
  Toggle,
  Tr,
  Typography,
} from '@strapi/design-system';
import pluginId from '../pluginId';

const CORE_VIEW_ID = 'settings/core';
const RESTORE_ASSETS_VIEW_ID = 'tools/restore-assets';
const UNUSED_ASSETS_VIEW_ID = 'tools/unused-assets';
const CDN_PUBLIC_HOST = 'https://cdn.smoothbundle.com';
const PLUGIN_SIDE_NAV_WIDTH = '23.2rem';
const TABLE_PAGE_SIZE = 10;

function defaultApiAcceleratorSettings() {
  return {
    protectedAssets: false,
    blockGetMode: 'no',
    collectionSyncPerPage: 50,
    autoSyncFrequency: 'hourly',
    lastDiscoveryAt: '',
    lastSyncAt: '',
    lastAutoSyncAt: '',
    customSubdomain: '',
  };
}

function defaultCdnConnectorSettings() {
  return {
    offloadLocalFiles: false,
    deleteCdnAssetsWithMediaItems: false,
    autoSyncFrequency: 'hourly',
    syncAllFormats: true,
    lastSyncAt: '',
    lastAutoSyncAt: '',
    customSubdomain: '',
  };
}

function defaultAccount() {
  return {
    connected: false,
    authKeyId: '',
    authVerificationUrl: '',
    authSessionStatus: 'idle',
    authMode: '',
    userSlug: '',
    userName: '',
    userEmail: '',
    userPlan: -1,
    userPlanLabel: '',
    planAction: null,
    moduleProjects: {},
    statusSummary: {
      requests: 0,
      maxRequests: 0,
      bandwidth: 0,
      maxBandwidth: 0,
      assetsPerProject: 0,
      periodEnd: '',
    },
    lastConnectionAt: '',
    lastStatusSyncAt: '',
    lastProjectCreationAt: '',
    lastAuthStartedAt: '',
  };
}

function defaultApiAcceleratorSyncJob() {
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

function defaultCdnConnectorSyncJob() {
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

function normalizeApiAcceleratorForSubmit(settings) {
  return {
    protectedAssets: Boolean(settings.protectedAssets),
    blockGetMode: String(settings.blockGetMode || 'no'),
    collectionSyncPerPage: Number(settings.collectionSyncPerPage) || 50,
    autoSyncFrequency: String(settings.autoSyncFrequency || 'hourly'),
    customSubdomain: String(settings.customSubdomain || '').trim(),
  };
}

function normalizeCdnConnectorSyncJob(job = {}) {
  const defaults = defaultCdnConnectorSyncJob();

  return {
    ...defaults,
    id: String(job.id || '').trim(),
    status: ['idle', 'running', 'completed', 'failed'].includes(String(job.status || '').trim())
      ? String(job.status || '').trim()
      : defaults.status,
    trigger: String(job.trigger || '').trim(),
    totalItems: Math.max(0, Number(job.totalItems) || 0),
    processedItems: Math.max(0, Number(job.processedItems) || 0),
    syncedItems: Math.max(0, Number(job.syncedItems) || 0),
    failedItems: Math.max(0, Number(job.failedItems) || 0),
    skippedItems: Math.max(0, Number(job.skippedItems) || 0),
    currentItem: String(job.currentItem || '').trim(),
    startedAt: String(job.startedAt || '').trim(),
    finishedAt: String(job.finishedAt || '').trim(),
    errorMessage: String(job.errorMessage || '').trim(),
    failedEntries: Array.isArray(job.failedEntries)
      ? job.failedEntries
          .map((entry) => ({
            fileId: String(entry?.fileId || '').trim(),
            message: String(entry?.message || '').trim(),
          }))
          .filter((entry) => entry.fileId && entry.message)
          .slice(0, 20)
      : [],
  };
}

function normalizeApiAcceleratorSyncJob(job = {}) {
  const defaults = defaultApiAcceleratorSyncJob();

  return {
    ...defaults,
    id: String(job.id || '').trim(),
    status: ['idle', 'running', 'completed', 'failed'].includes(String(job.status || '').trim())
      ? String(job.status || '').trim()
      : defaults.status,
    trigger: String(job.trigger || '').trim(),
    totalRoutes: Math.max(0, Number(job.totalRoutes) || 0),
    processedRoutes: Math.max(0, Number(job.processedRoutes) || 0),
    syncedRoutes: Math.max(0, Number(job.syncedRoutes) || 0),
    failedRoutes: Math.max(0, Number(job.failedRoutes) || 0),
    skippedRoutes: Math.max(0, Number(job.skippedRoutes) || 0),
    currentRoute: String(job.currentRoute || '').trim(),
    startedAt: String(job.startedAt || '').trim(),
    finishedAt: String(job.finishedAt || '').trim(),
    errorMessage: String(job.errorMessage || '').trim(),
    failedEntries: Array.isArray(job.failedEntries)
      ? job.failedEntries
          .map((entry) => ({
            route: String(entry?.route || '').trim(),
            message: String(entry?.message || '').trim(),
          }))
          .filter((entry) => entry.route && entry.message)
          .slice(0, 20)
      : [],
  };
}

function normalizeCdnConnectorForSubmit(settings) {
  return {
    offloadLocalFiles: Boolean(settings.offloadLocalFiles),
    deleteCdnAssetsWithMediaItems: Boolean(settings.deleteCdnAssetsWithMediaItems),
    autoSyncFrequency: String(settings.autoSyncFrequency || 'hourly'),
    syncAllFormats: Boolean(settings.syncAllFormats),
    customSubdomain: String(settings.customSubdomain || '').trim(),
  };
}

function normalizeApiAcceleratorSettings(settings = {}) {
  const defaults = defaultApiAcceleratorSettings();
  const blockGetMode = String(settings.blockGetMode || defaults.blockGetMode);
  const autoSyncFrequency = String(settings.autoSyncFrequency || defaults.autoSyncFrequency);
  const collectionSyncPerPage = Number(settings.collectionSyncPerPage) || defaults.collectionSyncPerPage;

  return {
    ...defaults,
    protectedAssets: Boolean(settings.protectedAssets),
    blockGetMode: ['no', 'all', 'synced'].includes(blockGetMode) ? blockGetMode : defaults.blockGetMode,
    collectionSyncPerPage: [10, 25, 50, 100, 250, 500].includes(collectionSyncPerPage)
      ? collectionSyncPerPage
      : defaults.collectionSyncPerPage,
    autoSyncFrequency: ['hourly', 'daily', 'weekly', 'off'].includes(autoSyncFrequency)
      ? autoSyncFrequency
      : defaults.autoSyncFrequency,
    lastDiscoveryAt: String(settings.lastDiscoveryAt || '').trim(),
    lastSyncAt: String(settings.lastSyncAt || '').trim(),
    lastAutoSyncAt: String(settings.lastAutoSyncAt || '').trim(),
    customSubdomain: String(settings.customSubdomain || '').trim(),
  };
}

function normalizeCdnConnectorSettings(settings = {}) {
  const defaults = defaultCdnConnectorSettings();
  const autoSyncFrequency = String(settings.autoSyncFrequency || defaults.autoSyncFrequency);

  return {
    ...defaults,
    offloadLocalFiles: Object.prototype.hasOwnProperty.call(settings, 'offloadLocalFiles')
      ? Boolean(settings.offloadLocalFiles)
      : defaults.offloadLocalFiles,
    deleteCdnAssetsWithMediaItems: Object.prototype.hasOwnProperty.call(settings, 'deleteCdnAssetsWithMediaItems')
      ? Boolean(settings.deleteCdnAssetsWithMediaItems)
      : defaults.deleteCdnAssetsWithMediaItems,
    autoSyncFrequency: ['hourly', 'daily', 'weekly', 'off'].includes(autoSyncFrequency)
      ? autoSyncFrequency
      : defaults.autoSyncFrequency,
    syncAllFormats: Object.prototype.hasOwnProperty.call(settings, 'syncAllFormats')
      ? Boolean(settings.syncAllFormats)
      : defaults.syncAllFormats,
    lastSyncAt: String(settings.lastSyncAt || '').trim(),
    lastAutoSyncAt: String(settings.lastAutoSyncAt || '').trim(),
    customSubdomain: String(settings.customSubdomain || '').trim(),
  };
}

function normalizeCdnConnectorMediaItem(item = {}) {
  return {
    id: String(item.id || `media:${item.fileId || ''}`).trim(),
    fileId: String(item.fileId || '').trim(),
    syncable: Boolean(item.syncable),
    protected: Boolean(item.protected),
    name: String(item.name || '').trim(),
    alternativeText: String(item.alternativeText || '').trim(),
    mime: String(item.mime || '').trim(),
    ext: String(item.ext || '').trim(),
    size: Math.max(0, Number(item.size) || 0),
    width: Math.max(0, Number(item.width) || 0),
    height: Math.max(0, Number(item.height) || 0),
    updatedAt: String(item.updatedAt || '').trim(),
    createdAt: String(item.createdAt || '').trim(),
    sourceUrl: String(item.sourceUrl || '').trim(),
    isImage: Boolean(item.isImage),
    formatCount: Math.max(0, Number(item.formatCount) || 0),
    syncStatus: ['not_synced', 'uploaded', 'upload_failed'].includes(String(item.syncStatus || '').trim())
      ? String(item.syncStatus || '').trim()
      : 'not_synced',
    lastSyncedAt: String(item.lastSyncedAt || '').trim(),
    lastError: Object.prototype.hasOwnProperty.call(item, 'lastError') ? item.lastError : '',
    syncedEntries: Array.isArray(item.syncedEntries)
      ? item.syncedEntries
          .map((entry) => ({
            key: String(entry?.key || '').trim(),
            label: String(entry?.label || '').trim(),
            path: String(entry?.path || '/').trim() || '/',
            filename: String(entry?.filename || '').trim(),
            mime: String(entry?.mime || '').trim(),
            width: Math.max(0, Number(entry?.width) || 0),
            height: Math.max(0, Number(entry?.height) || 0),
            size: Math.max(0, Number(entry?.size) || 0),
            publicUrl: String(entry?.publicUrl || '').trim(),
          }))
          .filter((entry) => entry.filename)
      : [],
  };
}

function buildCdnConnectorAssetOpenUrl(item = {}, entry = {}) {
  const publicUrl = String(entry?.publicUrl || '').trim();

  if (!publicUrl) {
    return '';
  }

  if (!item?.protected) {
    return publicUrl;
  }

  const fileId = encodeURIComponent(String(item.fileId || '').trim());
  const key = encodeURIComponent(String(entry?.key || 'original').trim() || 'original');

  if (!fileId) {
    return '';
  }

  return `/${pluginId}/modules/cdn-connector/media/${fileId}/open?key=${key}`;
}

function openExternalUrl(url) {
  const normalizedUrl = String(url || '').trim();

  if (normalizedUrl) {
    window.open(normalizedUrl, '_blank', 'noopener,noreferrer');
  }
}

function normalizeCdnConnectorAccess(item = {}) {
  return {
    id: String(item.id || item.accessId || item.access_id || item.uuid || '').trim(),
    email: String(item.email || item.userEmail || item.user_email || item?.user?.email || '').trim() || 'Unknown email',
    assets: Array.isArray(item.assets)
      ? item.assets
          .map((entry) =>
            typeof entry === 'string'
              ? entry
              : String(
                  entry?.label || entry?.name || entry?.fileName || entry?.file_name || entry?.assetName || entry?.asset_name || entry?.id || ''
                ).trim()
          )
          .filter(Boolean)
      : [],
    assetsLabel: String(item.assetsLabel || item.assets_label || '').trim(),
    expiresAt: String(item.expiresAt || item.expires_at || item.expiration || item.expireAt || item.expire_at || '').trim(),
    updatedAt: String(item.updatedAt || item.updated_at || '').trim(),
    createdAt: String(item.createdAt || item.created_at || '').trim(),
  };
}

function normalizeCdnConnectorUnusedAsset(item = {}) {
  return {
    id: String(item.id || item.assetId || item.asset_id || item.asset || '').trim(),
    assetId: String(item.assetId || item.asset_id || '').trim(),
    asset: String(item.asset || item.fileName || item.file_name || item.assetName || item.asset_name || '').trim() || 'Unknown asset',
    updatedAt: String(item.updatedAt || item.updated_at || item.date || '').trim(),
    hasUsageRecord: Object.prototype.hasOwnProperty.call(item, 'hasUsageRecord')
      ? Boolean(item.hasUsageRecord)
      : Object.prototype.hasOwnProperty.call(item, 'has_usage_record')
        ? Boolean(item.has_usage_record)
        : Boolean(String(item.updatedAt || item.updated_at || item.date || '').trim()),
  };
}

function normalizeCdnConnectorRestorableAsset(item = {}) {
  return {
    id: String(item.id || '').trim(),
    fileName: String(item.fileName || item.file_name || '').trim(),
    path: String(item.path || '/').trim() || '/',
    contentType: String(item.contentType || item.content_type || '').trim(),
    size: Math.max(0, Number(item.size) || 0),
    protected: Boolean(item.protected),
  };
}

function normalizeGrantAccessAssetOption(item = {}) {
  return {
    value: String(item.value || item.id || '').trim(),
    label: String(item.label || item.value || item.id || '').trim(),
  };
}

function normalizeErrorLines(value) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeErrorLines(entry));
  }

  if (value && typeof value === 'object') {
    if (Array.isArray(value.errors)) {
      return normalizeErrorLines(value.errors);
    }

    return normalizeErrorLines(value.message || value.detail || value.title || '');
  }

  const text = String(value || '').trim();
  if (!text) {
    return [];
  }

  if (text.includes('\n')) {
    return text
      .split(/\r?\n/)
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
  }

  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return normalizeErrorLines(parsed);
      }
    } catch (error) {
      // Keep the original message when it's not valid JSON.
    }
  }

  if (text.includes(',') && !text.includes(', ')) {
    const commaSeparated = text
      .split(',')
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);

    if (commaSeparated.length > 1) {
      return commaSeparated;
    }
  }

  return [text];
}

function renderErrorLines(lines = []) {
  return lines.map((line, index) => (
    <React.Fragment key={`${index}:${line}`}>
      {index > 0 ? <br /> : null}
      {line}
    </React.Fragment>
  ));
}

function toSearchableErrorText(value) {
  return normalizeErrorLines(value).join(' ');
}

function formatDateTime(value) {
  if (!value) {
    return 'Not available';
  }

  try {
    return new Date(value).toLocaleString();
  } catch (error) {
    return value;
  }
}

function formatOptionalDateTime(value, fallback = '-') {
  return value ? formatDateTime(value) : fallback;
}

function formatAccessExpiration(value) {
  return value ? formatDateTime(value) : '- no expiry';
}

function formatUnusedAssetLastUsed(item = {}) {
  return item?.hasUsageRecord ? formatDateTime(item.updatedAt) : 'Never';
}

function extractErrorMessage(error, fallback = 'Request failed.') {
  const payload = error?.response?.data;

  return (
    payload?.error?.message ||
    payload?.data?.message ||
    payload?.data?.result?.message ||
    payload?.message ||
    error?.message ||
    fallback
  );
}

function buildModuleViewId(moduleId) {
  return `modules/${moduleId}`;
}

function getRequestedViewId() {
  if (typeof window === 'undefined') {
    return CORE_VIEW_ID;
  }

  return String(window.location.hash || '').replace(/^#/, '').trim() || CORE_VIEW_ID;
}

function syncViewHash(viewId) {
  if (typeof window === 'undefined') {
    return;
  }

  const nextHash = `#${viewId}`;

  if (window.location.hash === nextHash) {
    return;
  }

  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${nextHash}`);
}

function buildIntegrationReturnPayload() {
  if (typeof window === 'undefined') {
    return {};
  }

  return {
    callbackBaseUrl: window.location.origin,
    returnUrl: `${window.location.origin}${window.location.pathname}${window.location.search}${window.location.hash}`,
  };
}

function getModuleProject(module) {
  return module?.project || null;
}

function mergeModulesWithAccountProjects(currentModules = [], nextAccount = {}) {
  const accountProjects =
    nextAccount?.moduleProjects && typeof nextAccount.moduleProjects === 'object' ? nextAccount.moduleProjects : {};

  return currentModules.map((module) => ({
    ...module,
    project: accountProjects[module.id] || module.project || null,
  }));
}

function mergeModuleProject(currentModules = [], moduleId, project = {}) {
  const normalizedModuleId = String(moduleId || '').trim();

  if (!normalizedModuleId || !project || typeof project !== 'object') {
    return currentModules;
  }

  return currentModules.map((module) =>
    module.id === normalizedModuleId
      ? {
          ...module,
          project: {
            ...(module.project || {}),
            ...project,
          },
        }
      : module
  );
}

function getOverviewProjectModule(modules = []) {
  const withProject = modules.filter((module) => module?.project?.projectId);
  return (
    withProject.find((module) => module.id === 'cdn-connector') ||
    withProject.find((module) => module.id === 'api-accelerator') ||
    withProject[0] ||
    modules.find((module) => module.id === 'cdn-connector') ||
    modules.find((module) => module.id === 'api-accelerator') ||
    modules[0] ||
    null
  );
}

function formatCompactNumber(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return '-';
  }

  const absolute = Math.abs(normalized);
  const units = [
    { value: 1e12, suffix: 'T' },
    { value: 1e9, suffix: 'B' },
    { value: 1e6, suffix: 'M' },
    { value: 1e3, suffix: 'k' },
  ];

  for (const unit of units) {
    if (absolute < unit.value) {
      continue;
    }

    const shortened = normalized / unit.value;
    const precision = Math.abs(shortened) >= 100 ? 0 : Math.abs(shortened) >= 10 ? 1 : 2;
    return `${Number(shortened.toFixed(precision))}${unit.suffix}`;
  }

  return String(Math.round(normalized));
}

function formatBytes(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) {
    return '-';
  }

  if (normalized === 0) {
    return '0B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const exponent = Math.min(Math.floor(Math.log(normalized) / Math.log(1024)), units.length - 1);
  const amount = normalized / (1024 ** exponent);
  const precision = amount >= 100 || exponent === 0 ? 0 : amount >= 10 ? 1 : 2;

  return `${amount.toFixed(precision)}${units[exponent]}`;
}

function formatUserPlan(account) {
  const label = String(account?.userPlanLabel || '').trim();
  if (label) {
    return label.charAt(0) + label.slice(1).toLowerCase();
  }

  switch (Number(account?.userPlan)) {
    case -1:
      return 'Guest';
    case 0:
      return 'Free';
    case 1:
      return 'Starter';
    case 2:
      return 'Pro';
    default:
      return '-';
  }
}

function getPlanAction(account) {
  if (account?.planAction?.action === 'create_free_account' && account?.planAction?.nonce) {
    return {
      type: 'form',
      label: 'Create free Smooth Bundle account',
      nonce: String(account.planAction.nonce || ''),
    };
  }

  switch (Number(account?.userPlan)) {
    case -1:
      return null;
    case 0:
      return {
        type: 'link',
        label: 'Upgrade Smooth Bundle account',
        href: 'https://smoothbundle.com/panel/account/plan-billing/upgrade',
      };
    default:
      return null;
  }
}

function buildBackendUrl(path) {
  if (typeof window === 'undefined') {
    return path;
  }

  const backendUrl = String(window.strapi?.backendURL || window.location.origin).replace(/\/+$/, '');
  return `${backendUrl}${path}`;
}

function matchesMediaSearch(item, searchTerm) {
  const normalizedSearch = String(searchTerm || '').trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  const haystack = [
    item?.name,
    item?.alternativeText,
    item?.mime,
    item?.ext,
    item?.syncStatus,
    item?.syncable ? 'selected' : 'not selected',
    toSearchableErrorText(item?.lastError),
    item?.fileId,
    ...(Array.isArray(item?.syncedEntries)
      ? item.syncedEntries.flatMap((entry) => [
          entry?.label,
          entry?.filename,
          entry?.mime,
        ])
      : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalizedSearch);
}

function buildMediaDisplayRows(items = [], searchTerm = '') {
  return items.filter((item) => matchesMediaSearch(item, searchTerm));
}

function buildAccessDisplayRows(items = [], searchTerm = '') {
  const normalizedSearch = String(searchTerm || '').trim().toLowerCase();

  return (Array.isArray(items) ? items : []).filter((item) => {
    if (!normalizedSearch) {
      return true;
    }

    return [
      item?.email,
      item?.assetsLabel,
      ...(Array.isArray(item?.assets) ? item.assets : []),
      item?.expiresAt,
      item?.updatedAt,
      item?.createdAt,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearch);
  });
}

function buildUnusedAssetDisplayRows(items = [], searchTerm = '', filter = 'all') {
  const normalizedSearch = String(searchTerm || '').trim().toLowerCase();
  const normalizedFilter = filter === 'never' ? 'never' : 'all';

  return (Array.isArray(items) ? items : [])
    .filter((item) => {
      if (normalizedFilter === 'never' && item?.hasUsageRecord) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [item?.asset, item?.assetId, item?.updatedAt, item?.hasUsageRecord ? 'used' : 'never']
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch);
    })
    .sort((left, right) => {
      const leftTimestamp = left?.hasUsageRecord ? new Date(left.updatedAt || '').getTime() : Number.NEGATIVE_INFINITY;
      const rightTimestamp = right?.hasUsageRecord ? new Date(right.updatedAt || '').getTime() : Number.NEGATIVE_INFINITY;
      const normalizedLeft = Number.isFinite(leftTimestamp) ? leftTimestamp : Number.NEGATIVE_INFINITY;
      const normalizedRight = Number.isFinite(rightTimestamp) ? rightTimestamp : Number.NEGATIVE_INFINITY;

      if (normalizedLeft !== normalizedRight) {
        return normalizedLeft - normalizedRight;
      }

      return String(left?.asset || '').localeCompare(String(right?.asset || ''), undefined, { numeric: true });
    });
}

function clampPage(page, totalPages) {
  const normalizedTotalPages = Math.max(1, Number(totalPages) || 1);
  return Math.min(normalizedTotalPages, Math.max(1, Number(page) || 1));
}

function paginateRows(rows = [], page = 1, pageSize = TABLE_PAGE_SIZE) {
  const totalItems = Array.isArray(rows) ? rows.length : 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize) || 1);
  const currentPage = clampPage(page, totalPages);
  const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex = totalItems === 0 ? 0 : Math.min(totalItems, currentPage * pageSize);

  return {
    rows: (Array.isArray(rows) ? rows : []).slice((currentPage - 1) * pageSize, currentPage * pageSize),
    totalItems,
    totalPages,
    currentPage,
    startIndex,
    endIndex,
  };
}

function matchesEndpointSearch(entry, searchTerm) {
  const normalizedSearch = String(searchTerm || '').trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  const haystack = [
    entry?.route,
    entry?.routeTemplate,
    entry?.kind,
    entry?.contentTypeUid,
    entry?.status,
    entry?.syncStatus,
    toSearchableErrorText(entry?.lastError),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalizedSearch);
}

function normalizeEndpointRoute(route) {
  const raw = String(route || '').trim();

  if (!raw) {
    return '';
  }

  const normalized = `/${raw.replace(/^\/+/, '')}`.replace(/\/{2,}/g, '/');
  return normalized === '/' ? normalized : normalized.replace(/\/+$/, '');
}

function getCollectionVariantEndpoints(collectionEntry, endpoints = []) {
  const collectionRoute = normalizeEndpointRoute(collectionEntry?.route);
  const prefix = `${collectionRoute}/`;

  return endpoints.filter((entry) => {
    if (entry?.kind !== 'single') {
      return false;
    }

    if (collectionEntry?.contentTypeUid && entry?.contentTypeUid !== collectionEntry.contentTypeUid) {
      return false;
    }

    return normalizeEndpointRoute(entry?.route).startsWith(prefix);
  });
}

function getDetectedEntrypointsCount(entry, endpoints = []) {
  if (entry?.kind !== 'collection') {
    return Math.max(0, Number(entry?.detectedEntrypoints) || 0);
  }

  const variants = getCollectionVariantEndpoints(entry, endpoints);
  return Math.max(variants.length, Math.max(0, Number(entry?.detectedEntrypoints) || 0));
}

function buildEndpointDisplayRows(endpoints = [], searchTerm = '', synced = false) {
  return endpoints
    .filter((entry) => entry?.kind !== 'single')
    .filter((entry) => {
      if (entry?.kind !== 'collection') {
        return synced ? Boolean(entry?.syncable) : !entry?.syncable;
      }

      const variants = getCollectionVariantEndpoints(entry, endpoints);
      const hasSyncedVariants = variants.some((variant) => variant?.syncable);

      return synced ? Boolean(entry?.syncable || hasSyncedVariants) : !entry?.syncable && !hasSyncedVariants;
    })
    .filter((entry) => {
      if (matchesEndpointSearch(entry, searchTerm)) {
        return true;
      }

      if (entry?.kind !== 'collection') {
        return false;
      }

      return getCollectionVariantEndpoints(entry, endpoints).some((variant) => matchesEndpointSearch(variant, searchTerm));
    });
}

function buildUploadTargetForRoute(route) {
  const normalized = normalizeEndpointRoute(route);
  const segments = normalized.split('/').filter(Boolean);

  if (segments.length === 0) {
    return {
      path: '/',
      filename: 'index.json',
    };
  }

  return {
    path: segments.length === 1 ? '/' : `/${segments.slice(0, -1).join('/')}`,
    filename: `${segments[segments.length - 1]}.json`,
  };
}

function buildUploadTargetsForRouteAssets(route, fileCount) {
  const normalizedCount = Math.max(0, Number(fileCount) || 0);

  if (normalizedCount === 0) {
    return [];
  }

  const target = buildUploadTargetForRoute(route);

  if (normalizedCount === 1) {
    return [target];
  }

  const baseName = target.filename.replace(/\.json$/i, '');
  const pagesPath = target.path === '/' ? `/${baseName}` : `${target.path}/${baseName}`;
  const targets = [target];

  for (let page = 1; page < normalizedCount; page += 1) {
    targets.push({
      path: pagesPath,
      filename: `page-${page}.json`,
    });
  }

  return targets;
}

function buildGrantAccessAssetPath(path = '', filename = '') {
  const normalizedFilename = String(filename || '').trim().replace(/^\/+/, '');
  if (!normalizedFilename) {
    return '';
  }

  const normalizedPath = String(path || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return normalizedPath ? `/${normalizedPath}/${normalizedFilename}` : `/${normalizedFilename}`;
}

function buildApiAcceleratorGrantAccessAssetOptions(endpoints = []) {
  const options = new Map();

  for (const endpoint of Array.isArray(endpoints) ? endpoints : []) {
    if (!endpoint?.protected || String(endpoint?.syncStatus || '').trim() !== 'uploaded') {
      continue;
    }

    for (const target of buildUploadTargetsForRouteAssets(
      endpoint.assetRoute || endpoint.route,
      Math.max(1, Number(endpoint.syncedFileCount) || 1)
    )) {
      const value = buildGrantAccessAssetPath(target.path, target.filename);
      if (value) {
        options.set(value, { value, label: value });
      }
    }
  }

  return Array.from(options.values()).sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }));
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

function buildPublicJsonUrlForTarget(target, userSlug, projectSlug, customSubdomain = '') {
  const normalizedUserSlug = String(userSlug || '').trim();
  const normalizedProjectSlug = String(projectSlug || '').trim();
  const normalizedCustomSubdomain = normalizeCustomSubdomain(customSubdomain);
  const normalizedPath = String(target.path || '/').trim() === '/'
    ? ''
    : `/${String(target.path || '').trim().replace(/^\/+|\/+$/g, '')}`;

  if (normalizedCustomSubdomain) {
    return `https://${normalizedCustomSubdomain}.smoothbundle.com${normalizedPath}/${encodeURIComponent(target.filename)}`;
  }

  if (!normalizedUserSlug || !normalizedProjectSlug) {
    return '';
  }

  return `${CDN_PUBLIC_HOST}/${encodeURIComponent(normalizedUserSlug)}/${encodeURIComponent(
    normalizedProjectSlug
  )}${normalizedPath}/${encodeURIComponent(target.filename)}`;
}

function buildPublicJsonUrl(route, userSlug, projectSlug, customSubdomain = '') {
  return buildPublicJsonUrlForTarget(buildUploadTargetForRoute(route), userSlug, projectSlug, customSubdomain);
}

function toggleRouteSelection(currentRoutes = [], route, checked) {
  const next = new Set(currentRoutes);

  if (checked) {
    next.add(route);
  } else {
    next.delete(route);
  }

  return Array.from(next);
}

function normalizeStringList(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [values])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );
}

function normalizeRouteList(routes) {
  return normalizeStringList(routes);
}

function formatEndpointSyncStatus(value) {
  const normalized = String(value || '').trim();

  switch (normalized) {
    case 'upload_failed':
    case 'fetch_failed':
      return 'failed';
    case '':
      return 'unknown';
    default:
      return normalized;
  }
}

function formatMediaSyncStatus(item = {}) {
  if (!item?.syncable) {
    return 'not selected';
  }

  const normalized = String(item?.syncStatus || '').trim();

  switch (normalized) {
    case 'uploaded':
      return 'synced';
    case 'upload_failed':
      return 'failed';
    case 'not_synced':
      return 'selected';
    default:
      return normalized || 'selected';
  }
}

function getCdnConnectorJobCopy(job = {}) {
  const trigger = String(job?.trigger || '').trim();

  if (trigger === 'unsync') {
    return {
      title: 'Unsync in progress',
      preparing: 'Preparing media items for unsync',
    };
  }

  if (trigger === 'protect') {
    return {
      title: 'Protect in progress',
      preparing: 'Preparing media items for protection',
    };
  }

  if (trigger === 'unprotect') {
    return {
      title: 'Unprotect in progress',
      preparing: 'Preparing media items for unprotection',
    };
  }

  return {
    title: 'Sync in progress',
    preparing: 'Preparing media items for upload',
  };
}

function TablePagination({ itemLabel, totalItems, currentPage, totalPages, startIndex, endIndex, onPageChange }) {
  if (totalItems <= 0) {
    return null;
  }

  return (
    <Flex justifyContent="space-between" alignItems="center" gap={3} wrap="wrap">
      <Typography variant="pi" textColor="neutral600">
        Showing {startIndex}-{endIndex} of {totalItems} {itemLabel}
      </Typography>
      {totalPages > 1 ? (
        <Flex gap={2} alignItems="center" wrap="nowrap">
          <Button size="S" variant="tertiary" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1}>
            Previous
          </Button>
          <Typography variant="pi" textColor="neutral600">
            Page {currentPage} of {totalPages}
          </Typography>
          <Button
            size="S"
            variant="tertiary"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            Next
          </Button>
        </Flex>
      ) : null}
    </Flex>
  );
}

function findOriginalSyncedEntry(item) {
  return (
    item?.syncedEntries?.find((entry) => String(entry?.key || '').trim() === 'original') ||
    item?.syncedEntries?.[0] ||
    null
  );
}

const PluginNavButton = styled.button`
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 32px;
  border: none;
  background: transparent;
  color: ${({ theme, $active, $disabled }) =>
    $disabled ? theme.colors.neutral500 : $active ? theme.colors.primary700 : theme.colors.neutral800};
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  padding: 0;
  text-align: left;
  opacity: ${({ $disabled }) => ($disabled ? 0.6 : 1)};

  > div {
    background-color: ${({ theme, $active, $disabled }) =>
      $disabled ? 'transparent' : $active ? theme.colors.primary100 : 'transparent'};
    font-weight: ${({ $active, $disabled }) => ($active && !$disabled ? 500 : 400)};
    transition: background-color 0.2s ease;
  }

  &:hover > div {
    background-color: ${({ theme, $active }) => ($active ? theme.colors.primary100 : theme.colors.neutral100)};
  }

  &:disabled:hover > div {
    background-color: transparent;
  }

  &:focus-visible {
    outline-offset: -2px;
  }
`;

const PluginSideNavMain = styled(SubNav.Main)`
  ${({ theme }) => theme.breakpoints.medium} {
    width: 100%;
    height: 100%;
    min-height: 0;
    max-height: none;
    align-self: stretch;
  }
`;

const PluginSideNavContent = styled(SubNav.Content)`
  flex: 1;
  min-height: 0;

  > div {
    height: 100%;
  }
`;

const PluginSideNavShell = styled.div`
  ${({ theme }) => theme.breakpoints.medium} {
    width: ${PLUGIN_SIDE_NAV_WIDTH};
    min-width: ${PLUGIN_SIDE_NAV_WIDTH};
    flex: 0 0 ${PLUGIN_SIDE_NAV_WIDTH};
    align-self: flex-start;
  }
`;

const AlertLink = styled(BaseLink)`
  color: ${({ theme }) => theme.colors.primary700} !important;
  font-weight: 600;
  text-decoration: underline;
  text-decoration-color: currentColor;

  &:hover,
  &:focus {
    color: ${({ theme }) => theme.colors.primary700} !important;
  }
`;

const StyledAlert = styled(Alert)`
  button {
    cursor: pointer;
  }
`;

const ToggleMaxWidth = styled.div`
  width: 100%;
  max-width: 200px;
`;

const ProgressTrack = styled.div`
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.neutral150};
  overflow: hidden;
`;

const ProgressFill = styled.div`
  height: 100%;
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.primary600};
  transition: width 0.2s ease;
  width: ${({ $progress }) => `${Math.max(0, Math.min(100, Number($progress) || 0))}%`};
`;

const CompactActionList = styled.div`
  width: 100%;
  border: 1px solid ${({ theme }) => theme.colors.neutral200};
  border-radius: 4px;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.neutral0};
`;

const CompactActionRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 6px 8px;

  & + & {
    border-top: 1px solid ${({ theme }) => theme.colors.neutral200};
  }
`;

const CompactActionText = styled(Typography)`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ProtectedLockIcon = styled.svg`
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  color: ${({ theme }) => theme.colors.neutral700};
`;

function LockIcon() {
  return (
    <ProtectedLockIcon
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </ProtectedLockIcon>
  );
}

const MiniActionButton = styled.button`
  appearance: none;
  border: 1px solid ${({ theme }) => theme.colors.neutral200};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.neutral0};
  color: ${({ theme, disabled }) => (disabled ? theme.colors.neutral500 : theme.colors.neutral800)};
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  font: inherit;
  font-size: 12px;
  line-height: 1;
  padding: 4px 6px;
`;

const CheckboxList = styled.div`
  width: 100%;
  max-height: 220px;
  overflow: auto;
  border: 1px solid ${({ theme }) => theme.colors.neutral200};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.neutral0};
`;

const CheckboxListItem = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  cursor: pointer;

  & + & {
    border-top: 1px solid ${({ theme }) => theme.colors.neutral150};
  }
`;

function SideNavLink({ label, active, disabled = false, onClick, endAction = null }) {
  return (
    <PluginNavButton type="button" $active={active} $disabled={disabled} disabled={disabled} onClick={onClick}>
      <Box width="100%" paddingLeft={3} paddingRight={3} borderRadius={1}>
        <Flex justifyContent="space-between" width="100%" gap={2}>
          <Typography
            tag="div"
            lineHeight="32px"
            width="100%"
            overflow="hidden"
            style={{
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </Typography>
          {endAction ? <Flex gap={2}>{endAction}</Flex> : null}
        </Flex>
      </Box>
    </PluginNavButton>
  );
}

function PluginSideNav({ activeViewId, modules, canAccessModules, cdnConnectorDeleteAssetsEnabled, onSelect }) {
  const shellRef = React.useRef(null);
  const [fixedStyle, setFixedStyle] = React.useState(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const updatePosition = () => {
      if (!shellRef.current || window.innerWidth < 768) {
        setFixedStyle(null);
        return;
      }

      const rect = shellRef.current.getBoundingClientRect();
      const top = Math.max(rect.top, 0);
      const height = Math.max(window.innerHeight - top, 240);

      setFixedStyle({
        position: 'fixed',
        left: `${rect.left}px`,
        top: `${top}px`,
        width: `${rect.width}px`,
        height: `${height}px`,
        zIndex: 2,
      });
    };

    updatePosition();

    const resizeObserver =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            updatePosition();
          })
        : null;

    if (resizeObserver && shellRef.current) {
      resizeObserver.observe(shellRef.current);
    }

    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('resize', updatePosition);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, []);

  return (
    <PluginSideNavShell ref={shellRef}>
      <div style={fixedStyle || undefined}>
        <PluginSideNavMain aria-label="Smooth Bundle">
          <SubNav.Header label="Smooth Bundle" />
          <Divider background="neutral150" />
          <PluginSideNavContent>
            <SubNav.Sections>
              <SubNav.Section label="Settings" sectionId="smoothbundle-settings">
                {[
                  <SideNavLink
                    key={CORE_VIEW_ID}
                    label="Overview"
                    active={activeViewId === CORE_VIEW_ID}
                    onClick={() => onSelect(CORE_VIEW_ID)}
                  />,
                ]}
              </SubNav.Section>
              <SubNav.Section
                label="Modules"
                sectionId="smoothbundle-modules"
              >
                {modules.map((module) => (
                  <SideNavLink
                    key={module.id}
                    label={module.name}
                    active={activeViewId === buildModuleViewId(module.id)}
                    disabled={!canAccessModules}
                    onClick={() => onSelect(buildModuleViewId(module.id))}
                    endAction={<Badge textColor="#ffffff" backgroundColor={module.enabled ? 'oklch(52.7% 0.154 150.069)' : 'oklch(50.5% 0.213 27.518)'}>{module.enabled ? 'On' : 'Off'}</Badge>}
                  />
                ))}
              </SubNav.Section>
              {canAccessModules && modules.some((module) => module.id === 'cdn-connector' && module.enabled) ? (
                <SubNav.Section label="Tools" sectionId="smoothbundle-tools">
                  {!cdnConnectorDeleteAssetsEnabled ? (
                    <SideNavLink
                      key={RESTORE_ASSETS_VIEW_ID}
                      label="Restore assets"
                      active={activeViewId === RESTORE_ASSETS_VIEW_ID}
                      onClick={() => onSelect(RESTORE_ASSETS_VIEW_ID)}
                    />
                  ) : null}
                  <SideNavLink
                    key={UNUSED_ASSETS_VIEW_ID}
                    label="Unused assets"
                    active={activeViewId === UNUSED_ASSETS_VIEW_ID}
                    onClick={() => onSelect(UNUSED_ASSETS_VIEW_ID)}
                  />
                </SubNav.Section>
              ) : null}
            </SubNav.Sections>
          </PluginSideNavContent>
        </PluginSideNavMain>
      </div>
    </PluginSideNavShell>
  );
}

function MetricCard({ label, value, hint }) {
  return (
    <Box background="neutral0" hasRadius shadow="filterShadow" padding={5}>
      <Flex direction="column" gap={1} alignItems="stretch">
        <Typography variant="sigma" textColor="neutral600">
          {label}
        </Typography>
        <Typography variant="beta" tag="p">
          {value}
        </Typography>
        {hint ? (
          <Typography variant="pi" textColor="neutral600">
            {hint}
          </Typography>
        ) : null}
      </Flex>
    </Box>
  );
}

function BorderMetricCard({ label, value, hint }) {
  return (
    <Box background="neutral0" hasRadius borderColor="neutral200" padding={5} width="100%" textAlign="center">
      <Flex direction="column" gap={1} alignItems="stretch">
        <Typography variant="sigma" textColor="neutral600">
          {label}
        </Typography>
        <Typography variant="beta" tag="p">
          {value}
        </Typography>
        {hint ? (
          <Typography variant="pi" textColor="neutral600">
            {hint}
          </Typography>
        ) : null}
      </Flex>
    </Box>
  );
}

function SectionCard({ title, subtitle, badge, actions, children }) {
  return (
    <Box background="neutral0" hasRadius shadow="filterShadow" padding={7}>
      <Flex direction="column" gap={6} alignItems="stretch">
        <Flex justifyContent="space-between" alignItems="flex-start" gap={4} wrap="wrap">
          <Flex direction="column" gap={1} alignItems="stretch">
            <Typography variant="delta" tag="h2">
              {title}
            </Typography>
            {subtitle ? (
              <Typography variant="pi" textColor="neutral600">
                {subtitle}
              </Typography>
            ) : null}
          </Flex>
          <Flex gap={2} alignItems="center" wrap="wrap">
            {badge ? <Badge>{badge}</Badge> : null}
            {actions}
          </Flex>
        </Flex>
        {children}
      </Flex>
    </Box>
  );
}

function TextField({ label, hint, ...props }) {
  return (
    <Field.Root hint={hint}>
      <Field.Label>{label}</Field.Label>
      <TextInput {...props} />
      {hint ? <Field.Hint /> : null}
    </Field.Root>
  );
}

function SelectField({ label, hint, children, ...props }) {
  return (
    <Field.Root hint={hint}>
      <Field.Label>{label}</Field.Label>
      <SingleSelect {...props}>{children}</SingleSelect>
      {hint ? <Field.Hint /> : null}
    </Field.Root>
  );
}

function EndpointTableCard({
  title,
  subtitle,
  totalCount,
  filteredCount,
  allEndpoints,
  endpoints,
  searchValue,
  onSearchChange,
  currentPage,
  totalPages,
  startIndex,
  endIndex,
  onPageChange,
  selectedRoutes,
  onToggleRoute,
  onToggleAll,
  onBulkAction,
  bulkActionLabel,
  rowActionLabel,
  onRowAction,
  renderRowActions,
  emptyMessage,
  emptySearchMessage,
  isBusy,
}) {
  const selectedRouteSet = new Set(selectedRoutes);
  const endpointLookup = Array.isArray(allEndpoints) && allEndpoints.length > 0 ? allEndpoints : endpoints;
  const visibleRoutes = endpoints.map((entry) => entry.route).filter(Boolean);
  const allVisibleSelected = visibleRoutes.length > 0 && visibleRoutes.every((route) => selectedRouteSet.has(route));
  const hasSearchResults = filteredCount > 0;
  const hasAnyEndpoints = totalCount > 0;

  return (
    <SectionCard title={title} subtitle={subtitle}>
      <Flex direction="column" gap={4} alignItems="stretch">
        <Flex justifyContent="space-between" alignItems="flex-end" gap={4} wrap="wrap">
          <Box minWidth="280px" width="100%" style={{ maxWidth: '420px' }}>
            <TextField
              label="Search endpoints"
              placeholder="Search by route or status"
              name={`${title.toLowerCase().replace(/\s+/g, '-')}-search`}
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </Box>
          <Button variant="secondary" onClick={onBulkAction} disabled={isBusy || selectedRoutes.length === 0}>
            {bulkActionLabel}
          </Button>
        </Flex>

        {!hasSearchResults ? (
          <Typography variant="pi" textColor="neutral600">
            {hasAnyEndpoints ? emptySearchMessage : emptyMessage}
          </Typography>
        ) : (
          <>
            <Table colCount={4} rowCount={endpoints.length + 1}>
              <Thead>
                <Tr>
                  <Th>
                    <Flex gap={2} alignItems="center">
                      <input
                        type="checkbox"
                        aria-label={`Select all routes in ${title}`}
                        checked={allVisibleSelected}
                        onChange={(event) => onToggleAll(visibleRoutes, event.target.checked)}
                        disabled={isBusy || visibleRoutes.length === 0}
                      />
                      <Typography variant="sigma" textColor="neutral600">
                        Route
                      </Typography>
                    </Flex>
                  </Th>
                  <Th>
                    <Typography variant="sigma" textColor="neutral600">
                      Sync status
                    </Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma" textColor="neutral600">
                      Updated
                    </Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma" textColor="neutral600">
                      Actions
                    </Typography>
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {endpoints.map((entry) => {
                  const route = String(entry.route || '').trim();
                  const displayErrorLines = normalizeErrorLines(entry.lastError);
                  const collectionVariantError =
                    entry.kind === 'collection'
                      ? getCollectionVariantEndpoints(entry, endpointLookup).find(
                          (variant) => normalizeErrorLines(variant.lastError).length > 0
                        )?.lastError
                      : '';
                  const fallbackErrorLines = normalizeErrorLines(collectionVariantError);
                  const resolvedErrorLines = displayErrorLines.length > 0 ? displayErrorLines : fallbackErrorLines;

                  return (
                    <Tr key={entry.id || route}>
                      <Td>
                        <Flex direction="column" gap={1} alignItems="stretch">
                          <Flex gap={2} alignItems="center">
                            <input
                              type="checkbox"
                              aria-label={`Select ${route}`}
                              checked={selectedRouteSet.has(route)}
                              onChange={(event) => onToggleRoute(route, event.target.checked)}
                              disabled={isBusy || !route}
                            />
                            {entry.protected ? <LockIcon /> : null}
                            <Typography textColor="neutral800">{route || '-'}</Typography>
                          </Flex>
                          {entry.kind === 'collection' && entry.entryRouteTemplate ? (
                            <Typography variant="pi" textColor="neutral600">
                              Template: {entry.entryRouteTemplate}
                            </Typography>
                          ) : null}
                          {entry.kind === 'collection' ? (
                            <Typography variant="pi" textColor="neutral600">
                              Detected entrypoints: {getDetectedEntrypointsCount(entry, endpointLookup)}
                            </Typography>
                          ) : null}
                        </Flex>
                      </Td>
                      <Td>
                        <Flex direction="column" gap={1} alignItems="stretch">
                          <Typography textColor="neutral800">{formatEndpointSyncStatus(entry.syncStatus)}</Typography>
                          {resolvedErrorLines.length > 0 ? (
                            <Typography
                              variant="pi"
                              textColor="danger600"
                              style={{
                                whiteSpace: 'normal',
                                wordBreak: 'break-word',
                              }}
                            >
                              {renderErrorLines(resolvedErrorLines)}
                            </Typography>
                          ) : null}
                        </Flex>
                      </Td>
                      <Td>
                        <Typography textColor="neutral800">{formatDateTime(entry.updatedAt)}</Typography>
                      </Td>
                      <Td>
                        {typeof renderRowActions === 'function' ? (
                          renderRowActions(entry)
                        ) : (
                          <Flex justifyContent="flex-end">
                            <Button size="S" variant="secondary" onClick={() => onRowAction(route)} disabled={isBusy || !route}>
                              {rowActionLabel}
                            </Button>
                          </Flex>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
            <TablePagination
              itemLabel="endpoints"
              totalItems={filteredCount}
              currentPage={currentPage}
              totalPages={totalPages}
              startIndex={startIndex}
              endIndex={endIndex}
              onPageChange={onPageChange}
            />
          </>
        )}
      </Flex>
    </SectionCard>
  );
}

function MediaTableCard({
  title,
  subtitle,
  totalCount,
  filteredCount,
  items,
  searchValue,
  onSearchChange,
  currentPage,
  totalPages,
  startIndex,
  endIndex,
  onPageChange,
  hasSyncedItems,
  onBulkSyncAll,
  onBulkUnsyncAll,
  onSyncOne,
  onUnsyncOne,
  onProtectOne,
  onUnprotectOne,
  onCopyUrl,
  copiedKey,
  expandedItemIds,
  onToggleExpanded,
  isOffloadEnabled = false,
  isBusy,
}) {
  const hasSearchResults = filteredCount > 0;
  const hasAnyItems = totalCount > 0;

  return (
    <SectionCard title={title} subtitle={subtitle}>
      <Flex direction="column" gap={4} alignItems="stretch">
        <Flex justifyContent="space-between" alignItems="flex-end" gap={4} wrap="wrap">
          <Box minWidth="280px" width="100%" style={{ maxWidth: '420px' }}>
            <TextField
              label="Search media items"
              placeholder="Search by name, mime type, or sync state"
              name="media-items-search"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </Box>
          <Flex gap={2} wrap="wrap">
            {hasSyncedItems ? (
              <Button variant="danger-light" onClick={onBulkUnsyncAll} disabled={isBusy}>
                Unsync all Media items
              </Button>
            ) : (
              <Button onClick={onBulkSyncAll} disabled={isBusy || !hasAnyItems}>
                Sync all Media items
              </Button>
            )}
          </Flex>
        </Flex>

        {!hasSearchResults ? (
          <Typography variant="pi" textColor="neutral600">
            {hasAnyItems ? 'No media items match this search.' : 'No media items found in the Strapi media library.'}
          </Typography>
        ) : (
          <>
            <Table colCount={5} rowCount={items.length + 1}>
              <Thead>
                <Tr>
                  <Th>
                    <Typography variant="sigma" textColor="neutral600">
                      Media item
                    </Typography>
                  </Th>
                  <Th>
                      <Typography variant="sigma" textColor="neutral600">
                        MIME
                      </Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma" textColor="neutral600">
                      Status sync
                    </Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma" textColor="neutral600">
                      Updated
                    </Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma" textColor="neutral600">
                      Actions
                    </Typography>
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {items.map((item) => {
                  const originalEntry = findOriginalSyncedEntry(item);
                  const variantEntries = Array.isArray(item.syncedEntries)
                    ? item.syncedEntries.filter((entry) => String(entry?.key || '').trim() !== 'original')
                    : [];
                  const visibleVariantEntries = variantEntries.filter((entry) => entry.publicUrl);
                  const expanded = expandedItemIds.includes(item.fileId);
                  const itemErrorLines = normalizeErrorLines(item.lastError);
                  const canSync = !isBusy && Boolean(item.fileId) && String(item.syncStatus || '').trim() !== 'uploaded';
                  const canUnsync = !isBusy && Boolean(item.fileId) && Boolean(item.syncable);
                  const canProtect = !isBusy && Boolean(item.fileId) && String(item.syncStatus || '').trim() === 'uploaded' && !item.protected;
                  const canUnprotect = !isBusy && Boolean(item.fileId) && String(item.syncStatus || '').trim() === 'uploaded' && item.protected;
                  const originalOpenUrl = buildCdnConnectorAssetOpenUrl(item, originalEntry);
                  const canOpenOriginal = Boolean(originalOpenUrl);
                  const canCopyOriginal = Boolean(originalEntry?.publicUrl);
                  const visiblePublicVariantEntries = visibleVariantEntries;
                  const canToggleExpanded = !isBusy && visiblePublicVariantEntries.length > 0;

                  return (
                    <Tr key={item.id || item.fileId}>
                      <Td>
                        <Flex direction="column" gap={1} alignItems="stretch">
                          <Flex gap={2} alignItems="center">
                            {item.protected ? <LockIcon /> : null}
                            <Typography textColor="neutral800">{item.name || `Media #${item.fileId}`}</Typography>
                          </Flex>
                          {item.alternativeText ? (
                            <Typography variant="pi" textColor="neutral600">
                              {item.alternativeText}
                            </Typography>
                          ) : null}
                        </Flex>
                      </Td>
                    <Td>
                      <Flex direction="column" gap={1} alignItems="stretch">
                        <Typography textColor="neutral800">{item.mime || '-'}</Typography>
                      </Flex>
                    </Td>
                      <Td>
                        <Flex direction="column" gap={1} alignItems="stretch">
                          <Typography textColor="neutral800">{formatMediaSyncStatus(item)}</Typography>
                          {itemErrorLines.length > 0 ? (
                            <Typography
                              variant="pi"
                              textColor="danger600"
                              style={{
                                whiteSpace: 'normal',
                                wordBreak: 'break-word',
                              }}
                            >
                              {renderErrorLines(itemErrorLines)}
                            </Typography>
                          ) : null}
                        </Flex>
                      </Td>
                      <Td>
                        <Typography textColor="neutral800">{formatDateTime(item.updatedAt || item.createdAt)}</Typography>
                      </Td>
                      <Td>
                        <Flex direction="column" alignItems="flex-end" gap={2}>
                          {canSync ? (
                            <Button
                              size="S"
                              variant="secondary"
                              onClick={() => onSyncOne(item.fileId)}
                            >
                              Sync
                            </Button>
                          ) : null}
                          {canUnsync ? (
                            <Button
                              size="S"
                              variant="danger-light"
                              onClick={() => onUnsyncOne(item.fileId)}
                            >
                              Unsync
                            </Button>
                          ) : null}
                          {canProtect ? (
                            <Button
                              size="S"
                              variant="secondary"
                              onClick={() => onProtectOne(item.fileId)}
                            >
                              Protect
                            </Button>
                          ) : null}
                          {canUnprotect ? (
                            <Button
                              size="S"
                              variant="secondary"
                              onClick={() => onUnprotectOne(item.fileId)}
                            >
                              Unprotect
                            </Button>
                          ) : null}
                          {canCopyOriginal ? (
                            <Flex gap={1} justifyContent="flex-end" wrap="nowrap">
                              {canOpenOriginal ? (
                                <MiniActionButton
                                  type="button"
                                  onClick={() => openExternalUrl(originalOpenUrl)}
                                >
                                  Open
                                </MiniActionButton>
                              ) : null}
                              <MiniActionButton
                                type="button"
                                onClick={() => onCopyUrl(originalEntry.publicUrl, `cdn:${item.fileId}:original`)}
                              >
                                {copiedKey === `cdn:${item.fileId}:original` ? 'Copied' : 'Copy'}
                              </MiniActionButton>
                            </Flex>
                          ) : null}
                          {visiblePublicVariantEntries.length > 0 ? (
                            <>
                              {canToggleExpanded ? (
                                <Button
                                  size="S"
                                  variant="tertiary"
                                  onClick={() => onToggleExpanded(item.fileId)}
                                >
                                  {visiblePublicVariantEntries.length} synced entr{visiblePublicVariantEntries.length === 1 ? 'y' : 'ies'}
                                </Button>
                              ) : null}
                              {expanded ? (
                                <CompactActionList>
                                  {visiblePublicVariantEntries.map((entry) => (
                                    <CompactActionRow key={`${item.fileId}:${entry.path}:${entry.filename}`}>
                                      <Flex direction="column" gap={1} alignItems="stretch">
                                        <CompactActionText variant="pi" textColor="neutral800">
                                          {entry.label || entry.filename}
                                        </CompactActionText>
                                        <CompactActionText variant="pi" textColor="neutral600">
                                          {`${entry.path === '/' ? '' : entry.path}/${entry.filename}`.startsWith('/')
                                            ? `${entry.path === '/' ? '' : entry.path}/${entry.filename}`
                                            : `/${entry.path === '/' ? '' : entry.path}/${entry.filename}`}
                                        </CompactActionText>
                                      </Flex>
                                      <Flex gap={1} justifyContent="flex-end" wrap="nowrap">
                                        <MiniActionButton
                                          type="button"
                                          onClick={() => openExternalUrl(buildCdnConnectorAssetOpenUrl(item, entry))}
                                        >
                                          Open
                                        </MiniActionButton>
                                        <MiniActionButton
                                          type="button"
                                          onClick={() =>
                                            onCopyUrl(
                                              entry.publicUrl,
                                              `cdn:${item.fileId}:${entry.key || entry.path}:${entry.filename}`
                                            )
                                          }
                                        >
                                          {copiedKey === `cdn:${item.fileId}:${entry.key || entry.path}:${entry.filename}`
                                            ? 'Copied'
                                            : 'Copy'}
                                        </MiniActionButton>
                                      </Flex>
                                    </CompactActionRow>
                                  ))}
                                </CompactActionList>
                              ) : null}
                            </>
                          ) : null}
                        </Flex>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
            <TablePagination
              itemLabel="media items"
              totalItems={filteredCount}
              currentPage={currentPage}
              totalPages={totalPages}
              startIndex={startIndex}
              endIndex={endIndex}
              onPageChange={onPageChange}
            />
          </>
        )}
      </Flex>
    </SectionCard>
  );
}

function AccessesTableCard({
  totalCount,
  filteredCount,
  items,
  searchValue,
  onSearchChange,
  currentPage,
  totalPages,
  startIndex,
  endIndex,
  onPageChange,
  onGrantToggle,
  isGrantFormOpen,
  grantEmail,
  onGrantEmailChange,
  grantAssets,
  onGrantAssetsChange,
  grantExpiresAt,
  onGrantExpiresAtChange,
  grantAssetOptions,
  onGrantSubmit,
  onRevokeOne,
  isBusy,
  message = '',
}) {
  const hasSearchResults = filteredCount > 0;
  const hasAnyItems = totalCount > 0;
  const hasGrantAssetOptions = grantAssetOptions.length > 0;
  const selectedGrantAssets = new Set(grantAssets);

  return (
    <SectionCard
      title="Accesses"
      subtitle="Project accesses granted for protected CDN assets."
      actions={
        <Button onClick={onGrantToggle} disabled={isBusy}>
          {isGrantFormOpen ? 'Hide form' : 'Grant access'}
        </Button>
      }
    >
      <Flex direction="column" gap={4} alignItems="stretch">
        {isGrantFormOpen ? (
          <Box background="neutral100" hasRadius padding={5}>
            <Flex direction="column" gap={4} alignItems="stretch">
              {!hasGrantAssetOptions ? (
                <Typography variant="pi" textColor="warning600">
                  You have no protected assets in this project to assign access to
                </Typography>
              ) : (
                <>
                  <Typography variant="pi" textColor="neutral700">
                    Grant access to selected protected assets for a specific email address.
                  </Typography>
                  <TextField
                    label="Email"
                    name="grant-access-email"
                    type="email"
                    value={grantEmail}
                    onChange={(event) => onGrantEmailChange(event.target.value)}
                  />
                  <Field.Root hint="Leave this empty to grant access to all protected assets in the project.">
                    <Field.Label>Assets</Field.Label>
                    <CheckboxList>
                      {grantAssetOptions.map((option) => (
                        <CheckboxListItem key={option.value}>
                          <input
                            type="checkbox"
                            checked={selectedGrantAssets.has(option.value)}
                            disabled={isBusy}
                            onChange={(event) => {
                              const nextAssets = event.target.checked
                                ? [...grantAssets, option.value]
                                : grantAssets.filter((value) => value !== option.value);

                              onGrantAssetsChange(nextAssets);
                            }}
                          />
                          <Typography variant="pi" textColor="neutral800">
                            {option.label}
                          </Typography>
                        </CheckboxListItem>
                      ))}
                    </CheckboxList>
                    <Field.Hint />
                  </Field.Root>
                  <TextField
                    label="expiresAt"
                    hint="Leave empty to grant access without expiration."
                    name="grant-access-expires-at"
                    type="datetime-local"
                    value={grantExpiresAt}
                    onChange={(event) => onGrantExpiresAtChange(event.target.value)}
                  />
                  <Flex justifyContent="flex-end" gap={2}>
                    <Button variant="secondary" onClick={onGrantToggle} disabled={isBusy}>
                      Cancel
                    </Button>
                    <Button onClick={onGrantSubmit} disabled={isBusy || !hasGrantAssetOptions}>
                      Grant access
                    </Button>
                  </Flex>
                </>
              )}
            </Flex>
          </Box>
        ) : null}

        <Box minWidth="280px" width="100%" style={{ maxWidth: '420px' }}>
          <TextField
            label="Search accesses"
            placeholder="Search by email or asset"
            name="accesses-search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </Box>

        {message ? (
          <Typography variant="pi" textColor="danger600">
            {message}
          </Typography>
        ) : null}

        {!hasSearchResults ? (
          <Typography variant="pi" textColor="neutral600">
            {hasAnyItems ? 'No accesses match this search.' : 'No accesses found.'}
          </Typography>
        ) : (
          <>
            <Table colCount={6} rowCount={items.length + 1}>
              <Thead>
                <Tr>
                  <Th><Typography variant="sigma" textColor="neutral600">Email</Typography></Th>
                  <Th><Typography variant="sigma" textColor="neutral600">Assets</Typography></Th>
                  <Th><Typography variant="sigma" textColor="neutral600">Expiration</Typography></Th>
                  <Th><Typography variant="sigma" textColor="neutral600">Updated</Typography></Th>
                  <Th><Typography variant="sigma" textColor="neutral600">Created</Typography></Th>
                  <Th><Typography variant="sigma" textColor="neutral600">Actions</Typography></Th>
                </Tr>
              </Thead>
              <Tbody>
                {items.map((item) => (
                  <Tr key={item.id || item.email}>
                    <Td><Typography textColor="neutral800">{item.email}</Typography></Td>
                    <Td>
                      <Flex direction="column" gap={1} alignItems="stretch">
                        <Typography textColor="neutral800">{item.assetsLabel || 'All protected assets'}</Typography>
                        {item.assets.length > 1 ? (
                          <Typography variant="pi" textColor="neutral600">
                            {item.assets.join(', ')}
                          </Typography>
                        ) : null}
                      </Flex>
                    </Td>
                    <Td><Typography textColor="neutral800">{formatAccessExpiration(item.expiresAt)}</Typography></Td>
                    <Td><Typography textColor="neutral800">{formatOptionalDateTime(item.updatedAt)}</Typography></Td>
                    <Td><Typography textColor="neutral800">{formatOptionalDateTime(item.createdAt)}</Typography></Td>
                    <Td>
                      <Flex justifyContent="flex-end">
                        <Button
                          size="S"
                          variant="danger-light"
                          onClick={() => onRevokeOne(item.id)}
                          disabled={isBusy || !item.id}
                        >
                          Revoke
                        </Button>
                      </Flex>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            <TablePagination
              itemLabel="accesses"
              totalItems={filteredCount}
              currentPage={currentPage}
              totalPages={totalPages}
              startIndex={startIndex}
              endIndex={endIndex}
              onPageChange={onPageChange}
            />
          </>
        )}
      </Flex>
    </SectionCard>
  );
}

function UnusedAssetsTableCard({
  totalCount,
  filteredCount,
  items,
  searchValue,
  onSearchChange,
  filterValue,
  onFilterChange,
  currentPage,
  totalPages,
  startIndex,
  endIndex,
  onPageChange,
  retentionLabel,
  message = '',
}) {
  const hasSearchResults = filteredCount > 0;
  const hasAnyItems = totalCount > 0;

  return (
    <SectionCard
      title="Unused assets"
      subtitle="Synced CDN assets cross-checked against Smooth Bundle usage logs."
    >
      <Flex direction="column" gap={4} alignItems="stretch">
        <Flex justifyContent="space-between" alignItems="flex-end" gap={4} wrap="wrap">
          <Box minWidth="280px" width="100%" style={{ maxWidth: '420px' }}>
            <TextField
              label="Search unused assets"
              placeholder="Search by asset name"
              name="unused-assets-search"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </Box>
          <Box minWidth="220px" width="100%" style={{ maxWidth: '280px' }}>
            <SelectField
              label="Last used filter"
              value={filterValue}
              onChange={onFilterChange}
            >
              <SingleSelectOption value="all">Used anytime</SingleSelectOption>
              <SingleSelectOption value="never">Never used</SingleSelectOption>
            </SelectField>
          </Box>
        </Flex>

        {message ? (
          <Typography variant="pi" textColor="danger600">
            {message}
          </Typography>
        ) : null}

        {!hasSearchResults ? (
          <Typography variant="pi" textColor="neutral600">
            {hasAnyItems
              ? filterValue === 'never'
                ? 'No assets match the selected filter.'
                : 'No assets match this search.'
              : 'No assets found.'}
          </Typography>
        ) : (
          <>
            <Table colCount={2} rowCount={items.length + 1}>
              <Thead>
                <Tr>
                  <Th><Typography variant="sigma" textColor="neutral600">Asset</Typography></Th>
                  <Th><Typography variant="sigma" textColor="neutral600">Last used</Typography></Th>
                </Tr>
              </Thead>
              <Tbody>
                {items.map((item) => (
                  <Tr key={item.id || item.assetId || item.asset}>
                    <Td><Typography textColor="neutral800">{item.asset}</Typography></Td>
                    <Td><Typography textColor="neutral800">{formatUnusedAssetLastUsed(item)}</Typography></Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            <TablePagination
              itemLabel="assets"
              totalItems={filteredCount}
              currentPage={currentPage}
              totalPages={totalPages}
              startIndex={startIndex}
              endIndex={endIndex}
              onPageChange={onPageChange}
            />
          </>
        )}

        {retentionLabel ? (
          <Typography variant="pi" textColor="neutral600">
            Asset usage logs are reset on a rolling basis. Your current plan keeps these logs for {retentionLabel}.
          </Typography>
        ) : null}
      </Flex>
    </SectionCard>
  );
}

function RestoreAssetsTableCard({ items, message = '', onRestore, isBusy }) {
  return (
    <SectionCard
      title="Restore assets"
      subtitle="Assets still present in Smooth Bundle but missing from the Strapi Media Library."
    >
      <Flex direction="column" gap={4} alignItems="stretch">
        {message ? <Typography variant="pi" textColor="danger600">{message}</Typography> : null}
        {items.length === 0 ? (
          <Typography variant="pi" textColor="neutral600">No restorable CDN assets found.</Typography>
        ) : (
          <Table colCount={4} rowCount={items.length + 1}>
            <Thead>
              <Tr>
                <Th><Typography variant="sigma" textColor="neutral600">File</Typography></Th>
                <Th><Typography variant="sigma" textColor="neutral600">Path</Typography></Th>
                <Th><Typography variant="sigma" textColor="neutral600">Size</Typography></Th>
                <Th><Typography variant="sigma" textColor="neutral600">Action</Typography></Th>
              </Tr>
            </Thead>
            <Tbody>
              {items.map((item) => (
                <Tr key={item.id}>
                  <Td><Typography textColor="neutral800">{item.fileName}</Typography></Td>
                  <Td><Typography textColor="neutral800">{item.path}</Typography></Td>
                  <Td><Typography textColor="neutral800">{formatBytes(item.size)}</Typography></Td>
                  <Td>
                    <Flex justifyContent="flex-end">
                      <Button size="S" variant="secondary" onClick={() => onRestore(item.id)} disabled={isBusy || !item.id}>
                        Restore
                      </Button>
                    </Flex>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Flex>
    </SectionCard>
  );
}

export default function App() {
  const client = useFetchClient();
  const [isReady, setIsReady] = React.useState(false);
  const [activeViewId, setActiveViewId] = React.useState(() => getRequestedViewId());
  const [account, setAccount] = React.useState(defaultAccount());
  const [modules, setModules] = React.useState([]);
  const [apiAcceleratorSettings, setApiAcceleratorSettings] = React.useState(defaultApiAcceleratorSettings());
  const [apiAcceleratorEndpoints, setApiAcceleratorEndpoints] = React.useState([]);
  const [apiAcceleratorAccesses, setApiAcceleratorAccesses] = React.useState([]);
  const [apiAcceleratorGrantAccessAssetOptions, setApiAcceleratorGrantAccessAssetOptions] = React.useState([]);
  const [apiAcceleratorSyncJob, setApiAcceleratorSyncJob] = React.useState(defaultApiAcceleratorSyncJob());
  const [cdnConnectorSettings, setCdnConnectorSettings] = React.useState(defaultCdnConnectorSettings());
  const [cdnConnectorMediaItems, setCdnConnectorMediaItems] = React.useState([]);
  const [cdnConnectorAccesses, setCdnConnectorAccesses] = React.useState([]);
  const [cdnConnectorUnusedAssets, setCdnConnectorUnusedAssets] = React.useState([]);
  const [cdnConnectorRestorableAssets, setCdnConnectorRestorableAssets] = React.useState([]);
  const [cdnConnectorGrantAccessAssetOptions, setCdnConnectorGrantAccessAssetOptions] = React.useState([]);
  const [cdnConnectorSyncJob, setCdnConnectorSyncJob] = React.useState(defaultCdnConnectorSyncJob());
  const [cdnConnectorSearch, setCdnConnectorSearch] = React.useState('');
  const [apiAcceleratorAccessesSearch, setApiAcceleratorAccessesSearch] = React.useState('');
  const [cdnConnectorAccessesSearch, setCdnConnectorAccessesSearch] = React.useState('');
  const [cdnConnectorUnusedAssetsSearch, setCdnConnectorUnusedAssetsSearch] = React.useState('');
  const [cdnConnectorUnusedAssetsFilter, setCdnConnectorUnusedAssetsFilter] = React.useState('all');
  const [isApiAcceleratorGrantAccessFormOpen, setIsApiAcceleratorGrantAccessFormOpen] = React.useState(false);
  const [apiAcceleratorGrantAccessEmail, setApiAcceleratorGrantAccessEmail] = React.useState('');
  const [apiAcceleratorGrantAccessAssets, setApiAcceleratorGrantAccessAssets] = React.useState([]);
  const [apiAcceleratorGrantAccessExpiresAt, setApiAcceleratorGrantAccessExpiresAt] = React.useState('');
  const [isGrantAccessFormOpen, setIsGrantAccessFormOpen] = React.useState(false);
  const [grantAccessEmail, setGrantAccessEmail] = React.useState('');
  const [grantAccessAssets, setGrantAccessAssets] = React.useState([]);
  const [grantAccessExpiresAt, setGrantAccessExpiresAt] = React.useState('');
  const [apiAcceleratorAccessesMessage, setApiAcceleratorAccessesMessage] = React.useState('');
  const [cdnConnectorAccessesMessage, setCdnConnectorAccessesMessage] = React.useState('');
  const [cdnConnectorUnusedAssetsMessage, setCdnConnectorUnusedAssetsMessage] = React.useState('');
  const [cdnConnectorUnusedAssetsRetentionLabel, setCdnConnectorUnusedAssetsRetentionLabel] = React.useState('');
  const [cdnConnectorRestorableAssetsMessage, setCdnConnectorRestorableAssetsMessage] = React.useState('');
  const [expandedCdnConnectorItemIds, setExpandedCdnConnectorItemIds] = React.useState([]);
  const [syncedEndpointSearch, setSyncedEndpointSearch] = React.useState('');
  const [otherEndpointSearch, setOtherEndpointSearch] = React.useState('');
  const [syncedEndpointPage, setSyncedEndpointPage] = React.useState(1);
  const [otherEndpointPage, setOtherEndpointPage] = React.useState(1);
  const [apiAcceleratorAccessesPage, setApiAcceleratorAccessesPage] = React.useState(1);
  const [cdnConnectorPage, setCdnConnectorPage] = React.useState(1);
  const [cdnConnectorAccessesPage, setCdnConnectorAccessesPage] = React.useState(1);
  const [cdnConnectorUnusedAssetsPage, setCdnConnectorUnusedAssetsPage] = React.useState(1);
  const [selectedSyncedRoutes, setSelectedSyncedRoutes] = React.useState([]);
  const [selectedOtherRoutes, setSelectedOtherRoutes] = React.useState([]);
  const [expandedSyncedVariantRoutes, setExpandedSyncedVariantRoutes] = React.useState([]);
  const [expandedSyncedFileRoutes, setExpandedSyncedFileRoutes] = React.useState([]);
  const [message, setMessage] = React.useState(null);
  const [busyAction, setBusyAction] = React.useState('');
  const [copiedKey, setCopiedKey] = React.useState('');
  const [overviewNoticeDismissed, setOverviewNoticeDismissed] = React.useState(false);
  const [projectToken, setProjectToken] = React.useState('');
  const [projectTokenModuleId, setProjectTokenModuleId] = React.useState('');
  const [loadingProjectToken, setLoadingProjectToken] = React.useState(false);
  const apiSyncPollingTimerRef = React.useRef(null);
  const cdnSyncPollingTimerRef = React.useRef(null);
  const copiedKeyTimerRef = React.useRef(null);

  const isBusy = Boolean(busyAction);
  const isInteractionBusy = isBusy;
  const apiAcceleratorModule = modules.find((module) => module.id === 'api-accelerator') || null;
  const cdnConnectorModule = modules.find((module) => module.id === 'cdn-connector') || null;
  const activeModule = modules.find((module) => buildModuleViewId(module.id) === activeViewId) || null;
  const overviewProjectModule = getOverviewProjectModule(modules);
  const connectionState = account.connected ? 'Connected' : account.authKeyId ? 'Pending' : 'Disconnected';
  const isModuleToggleBusy = busyAction === 'Enabling module' || busyAction === 'Disabling module';
  const isApiSyncRunning = apiAcceleratorSyncJob.status === 'running';
  const isCdnSyncRunning = cdnConnectorSyncJob.status === 'running';
  const isApiAcceleratorBusy = isInteractionBusy || isApiSyncRunning;
  const isCdnConnectorBusy = isInteractionBusy || isCdnSyncRunning;
  const allSyncedEndpoints = buildEndpointDisplayRows(apiAcceleratorEndpoints, '', true);
  const allOtherEndpoints = buildEndpointDisplayRows(apiAcceleratorEndpoints, '', false);
  const allApiAcceleratorAccesses = buildAccessDisplayRows(apiAcceleratorAccesses, '');
  const effectiveApiAcceleratorGrantAccessAssetOptions = buildApiAcceleratorGrantAccessAssetOptions(apiAcceleratorEndpoints);
  const allCdnConnectorItems = buildMediaDisplayRows(cdnConnectorMediaItems, '');
  const hasSyncedCdnConnectorItems = allCdnConnectorItems.some((item) => item.syncable);
  const allCdnConnectorAccesses = buildAccessDisplayRows(cdnConnectorAccesses, '');
  const allCdnConnectorUnusedAssets = buildUnusedAssetDisplayRows(cdnConnectorUnusedAssets, '', 'all');
  const syncedEndpoints = buildEndpointDisplayRows(apiAcceleratorEndpoints, syncedEndpointSearch, true);
  const otherEndpoints = buildEndpointDisplayRows(apiAcceleratorEndpoints, otherEndpointSearch, false);
  const apiAcceleratorAccessRows = buildAccessDisplayRows(apiAcceleratorAccesses, apiAcceleratorAccessesSearch);
  const cdnConnectorItems = buildMediaDisplayRows(cdnConnectorMediaItems, cdnConnectorSearch);
  const cdnConnectorAccessRows = buildAccessDisplayRows(cdnConnectorAccesses, cdnConnectorAccessesSearch);
  const cdnConnectorUnusedAssetRows = buildUnusedAssetDisplayRows(
    cdnConnectorUnusedAssets,
    cdnConnectorUnusedAssetsSearch,
    cdnConnectorUnusedAssetsFilter
  );
  const syncedEndpointPageData = paginateRows(syncedEndpoints, syncedEndpointPage);
  const otherEndpointPageData = paginateRows(otherEndpoints, otherEndpointPage);
  const apiAcceleratorAccessesPageData = paginateRows(apiAcceleratorAccessRows, apiAcceleratorAccessesPage);
  const cdnConnectorPageData = paginateRows(cdnConnectorItems, cdnConnectorPage);
  const cdnConnectorAccessesPageData = paginateRows(cdnConnectorAccessRows, cdnConnectorAccessesPage);
  const cdnConnectorUnusedAssetsPageData = paginateRows(cdnConnectorUnusedAssetRows, cdnConnectorUnusedAssetsPage);
  const apiSyncProgress =
    apiAcceleratorSyncJob.totalRoutes > 0
      ? Math.round((apiAcceleratorSyncJob.processedRoutes / apiAcceleratorSyncJob.totalRoutes) * 100)
      : 0;
  const cdnSyncProgress =
    cdnConnectorSyncJob.totalItems > 0
      ? Math.round((cdnConnectorSyncJob.processedItems / cdnConnectorSyncJob.totalItems) * 100)
      : 0;
  const cdnConnectorJobCopy = getCdnConnectorJobCopy(cdnConnectorSyncJob);

  React.useEffect(() => {
    if (syncedEndpointPage !== syncedEndpointPageData.currentPage) {
      setSyncedEndpointPage(syncedEndpointPageData.currentPage);
    }
  }, [syncedEndpointPage, syncedEndpointPageData.currentPage]);

  React.useEffect(() => {
    if (otherEndpointPage !== otherEndpointPageData.currentPage) {
      setOtherEndpointPage(otherEndpointPageData.currentPage);
    }
  }, [otherEndpointPage, otherEndpointPageData.currentPage]);

  React.useEffect(() => {
    if (apiAcceleratorAccessesPage !== apiAcceleratorAccessesPageData.currentPage) {
      setApiAcceleratorAccessesPage(apiAcceleratorAccessesPageData.currentPage);
    }
  }, [apiAcceleratorAccessesPage, apiAcceleratorAccessesPageData.currentPage]);

  React.useEffect(() => {
    if (cdnConnectorPage !== cdnConnectorPageData.currentPage) {
      setCdnConnectorPage(cdnConnectorPageData.currentPage);
    }
  }, [cdnConnectorPage, cdnConnectorPageData.currentPage]);

  React.useEffect(() => {
    if (cdnConnectorAccessesPage !== cdnConnectorAccessesPageData.currentPage) {
      setCdnConnectorAccessesPage(cdnConnectorAccessesPageData.currentPage);
    }
  }, [cdnConnectorAccessesPage, cdnConnectorAccessesPageData.currentPage]);

  React.useEffect(() => {
    if (cdnConnectorUnusedAssetsPage !== cdnConnectorUnusedAssetsPageData.currentPage) {
      setCdnConnectorUnusedAssetsPage(cdnConnectorUnusedAssetsPageData.currentPage);
    }
  }, [cdnConnectorUnusedAssetsPage, cdnConnectorUnusedAssetsPageData.currentPage]);

  React.useEffect(() => {
    if (
      activeViewId === RESTORE_ASSETS_VIEW_ID &&
      account.connected &&
      cdnConnectorModule?.enabled &&
      !cdnConnectorSettings.deleteCdnAssetsWithMediaItems
    ) {
      loadRestorableAssets();
    }
  }, [
    activeViewId,
    account.connected,
    cdnConnectorModule?.enabled,
    cdnConnectorSettings.deleteCdnAssetsWithMediaItems,
  ]);

  const hydrate = React.useCallback((payload) => {
    const nextAccount = payload?.core?.account || defaultAccount();
    const moduleProjects =
      nextAccount?.moduleProjects && typeof nextAccount.moduleProjects === 'object' ? nextAccount.moduleProjects : {};
    const nextApiAccelerator = normalizeApiAcceleratorSettings({
      ...(payload?.apiAccelerator?.settings || {}),
      customSubdomain: moduleProjects?.['api-accelerator']?.customSubdomain || '',
    });
    const nextCdnConnector = normalizeCdnConnectorSettings({
      ...(payload?.cdnConnector?.settings || {}),
      customSubdomain: moduleProjects?.['cdn-connector']?.customSubdomain || '',
    });

    setAccount({
      ...defaultAccount(),
      ...nextAccount,
    });
    setModules(Array.isArray(payload?.modules) ? payload.modules : []);
    setApiAcceleratorSettings(nextApiAccelerator);
    setApiAcceleratorEndpoints(Array.isArray(payload?.apiAccelerator?.endpoints) ? payload.apiAccelerator.endpoints : []);
    setApiAcceleratorAccesses(
      Array.isArray(payload?.apiAccelerator?.accesses)
        ? payload.apiAccelerator.accesses.map((item) => normalizeCdnConnectorAccess(item))
        : []
    );
    setApiAcceleratorGrantAccessAssetOptions(
      Array.isArray(payload?.apiAccelerator?.grantAccessAssetOptions)
        ? payload.apiAccelerator.grantAccessAssetOptions.map((item) => normalizeGrantAccessAssetOption(item)).filter((item) => item.value)
        : []
    );
    setApiAcceleratorAccessesMessage(String(payload?.apiAccelerator?.accessesMessage || '').trim());
    setApiAcceleratorSyncJob(normalizeApiAcceleratorSyncJob(payload?.apiAccelerator?.syncJob || {}));
    setCdnConnectorSettings(nextCdnConnector);
    setCdnConnectorMediaItems(
      Array.isArray(payload?.cdnConnector?.mediaItems)
        ? payload.cdnConnector.mediaItems.map((item) => normalizeCdnConnectorMediaItem(item))
        : []
    );
    setCdnConnectorAccesses(
      Array.isArray(payload?.cdnConnector?.accesses)
        ? payload.cdnConnector.accesses.map((item) => normalizeCdnConnectorAccess(item))
        : []
    );
    setCdnConnectorUnusedAssets(
      Array.isArray(payload?.cdnConnector?.unusedAssets)
        ? payload.cdnConnector.unusedAssets.map((item) => normalizeCdnConnectorUnusedAsset(item))
        : []
    );
    setCdnConnectorGrantAccessAssetOptions(
      Array.isArray(payload?.cdnConnector?.grantAccessAssetOptions)
        ? payload.cdnConnector.grantAccessAssetOptions.map((item) => normalizeGrantAccessAssetOption(item)).filter((item) => item.value)
        : []
    );
    setCdnConnectorAccessesMessage(String(payload?.cdnConnector?.accessesMessage || '').trim());
    setCdnConnectorUnusedAssetsMessage(String(payload?.cdnConnector?.unusedAssetsMessage || '').trim());
    setCdnConnectorUnusedAssetsRetentionLabel(String(payload?.cdnConnector?.unusedAssetsRetentionLabel || '').trim());
    setCdnConnectorRestorableAssets(
      Array.isArray(payload?.cdnConnector?.restorableAssets) ? payload.cdnConnector.restorableAssets : []
    );
    setCdnConnectorRestorableAssetsMessage(String(payload?.cdnConnector?.restorableAssetsMessage || '').trim());
    setCdnConnectorSyncJob(normalizeCdnConnectorSyncJob(payload?.cdnConnector?.syncJob || {}));
  }, []);

  const load = React.useCallback(async () => {
    setBusyAction('Loading');

    try {
      const response = await client.get(`/${pluginId}/bootstrap`);
      hydrate(response.data?.data || {});
    } catch (error) {
      setMessage({
        type: 'danger',
        text: extractErrorMessage(error, 'Could not load the Smooth Bundle plugin data.'),
      });
    } finally {
      setBusyAction('');
      setIsReady(true);
    }
  }, [client, hydrate]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const onHashChange = () => {
      const requestedViewId = getRequestedViewId();
      setActiveViewId((current) => (current === requestedViewId ? current : requestedViewId));
    };

    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  React.useEffect(() => {
    if (!isReady) {
      return;
    }

    const hasEnabledCdnConnector = modules.some((module) => module.id === 'cdn-connector' && module.enabled);
    const isValidToolView =
      (activeViewId === RESTORE_ASSETS_VIEW_ID &&
        hasEnabledCdnConnector &&
        !cdnConnectorSettings.deleteCdnAssetsWithMediaItems) ||
      (activeViewId === UNUSED_ASSETS_VIEW_ID && hasEnabledCdnConnector);
    const hasValidView =
      activeViewId === CORE_VIEW_ID ||
      isValidToolView ||
      modules.some((module) => buildModuleViewId(module.id) === activeViewId);
    const canAccessActiveView = activeViewId === CORE_VIEW_ID || (account.connected && hasValidView);
    const nextViewId = canAccessActiveView ? activeViewId : CORE_VIEW_ID;

    if (nextViewId !== activeViewId) {
      setActiveViewId(nextViewId);
      return;
    }

    syncViewHash(nextViewId);
  }, [account.connected, activeViewId, cdnConnectorSettings.deleteCdnAssetsWithMediaItems, isReady, modules]);

  const refresh = React.useCallback(async () => {
    const response = await client.get(`/${pluginId}/bootstrap`);
    hydrate(response.data?.data || {});
  }, [client, hydrate]);

  const runAction = React.useCallback(
    async (label, callback, successMessage) => {
      setBusyAction(label);
      setMessage(null);

      try {
        const result = await callback();
        const resolvedSuccessMessage =
          typeof successMessage === 'function' ? successMessage(result) : successMessage;

        if (resolvedSuccessMessage) {
          setMessage({
            type: 'success',
            text: resolvedSuccessMessage,
          });
        }

        await refresh();
        return result;
      } catch (error) {
        setMessage({
          type: 'danger',
          text: extractErrorMessage(error),
        });
        throw error;
      } finally {
        setBusyAction('');
      }
    },
    [refresh]
  );

  const syncStatus = React.useCallback(
    async (silent = false) => {
      if (!account.connected) {
        return null;
      }

      try {
        const response = await client.post(`/${pluginId}/core/status-sync`, {});

        if (response.data?.data?.account) {
          const nextAccount = response.data.data.account;

          setAccount((current) => ({
            ...current,
            ...nextAccount,
          }));
          setModules((current) => mergeModulesWithAccountProjects(current, nextAccount));
        }

        return response.data?.data || null;
      } catch (error) {
        if (!silent) {
          setMessage({
            type: 'danger',
            text: extractErrorMessage(error, 'Could not refresh account status.'),
          });
        }

        return null;
      }
    },
    [account.connected, client]
  );

  const stopApiSyncPolling = React.useCallback(() => {
    if (apiSyncPollingTimerRef.current) {
      window.clearTimeout(apiSyncPollingTimerRef.current);
      apiSyncPollingTimerRef.current = null;
    }
  }, []);

  const pollApiSyncStatus = React.useCallback(
    async (silent = false) => {
      try {
        const response = await client.get(`/${pluginId}/modules/api-accelerator/sync/status`);
        const nextJob = normalizeApiAcceleratorSyncJob(response.data?.data?.job || {});

        setApiAcceleratorSyncJob(nextJob);

        if (nextJob.status === 'running') {
          return nextJob;
        }

        stopApiSyncPolling();

        if (nextJob.status === 'completed' || nextJob.status === 'failed') {
          if (!silent) {
            await refresh();
            const failedDebugText =
              nextJob.failedEntries.length > 0
                ? ` ${nextJob.failedEntries
                    .slice(0, 3)
                    .map((entry) => `${entry.route}: ${entry.message}`)
                    .join(' ')}`
                : '';
            setMessage({
              type: nextJob.failedRoutes > 0 || nextJob.status === 'failed' ? 'danger' : 'success',
              text:
                nextJob.failedRoutes > 0 || nextJob.status === 'failed'
                  ? `${nextJob.errorMessage || `Sync finished with ${nextJob.failedRoutes} failed endpoint${nextJob.failedRoutes === 1 ? '' : 's'}.`}${failedDebugText}`
                  : `Sync finished. ${nextJob.syncedRoutes} endpoint${nextJob.syncedRoutes === 1 ? '' : 's'} uploaded.`,
            });
          }
        }

        return nextJob;
      } catch (error) {
        stopApiSyncPolling();

        if (!silent) {
          setMessage({
            type: 'danger',
            text: extractErrorMessage(error, 'Could not refresh the sync status.'),
          });
        }

        return null;
      }
    },
    [client, refresh, stopApiSyncPolling]
  );

  const startApiSyncPolling = React.useCallback(() => {
    stopApiSyncPolling();

    const tick = async () => {
      const result = await pollApiSyncStatus(true).catch(() => null);

      if (result?.status === 'running') {
        apiSyncPollingTimerRef.current = window.setTimeout(tick, 1000);
        return;
      }

      await pollApiSyncStatus(false).catch(() => null);
    };

    tick();
  }, [pollApiSyncStatus, stopApiSyncPolling]);

  React.useEffect(() => {
    if (apiAcceleratorSyncJob.status !== 'running') {
      stopApiSyncPolling();
      return undefined;
    }

    startApiSyncPolling();

    return () => {
      stopApiSyncPolling();
    };
  }, [apiAcceleratorSyncJob.status, startApiSyncPolling, stopApiSyncPolling]);

  React.useEffect(() => () => stopApiSyncPolling(), [stopApiSyncPolling]);

  const stopCdnSyncPolling = React.useCallback(() => {
    if (cdnSyncPollingTimerRef.current) {
      window.clearTimeout(cdnSyncPollingTimerRef.current);
      cdnSyncPollingTimerRef.current = null;
    }
  }, []);

  const pollCdnSyncStatus = React.useCallback(
    async (silent = false) => {
      try {
        const response = await client.get(`/${pluginId}/modules/cdn-connector/sync/status`);
        const nextJob = normalizeCdnConnectorSyncJob(response.data?.data?.job || {});

        setCdnConnectorSyncJob(nextJob);

        if (nextJob.status === 'running') {
          return nextJob;
        }

        stopCdnSyncPolling();

        if (nextJob.status === 'completed' || nextJob.status === 'failed') {
          if (!silent) {
            await refresh();
            const failedDebugText =
              nextJob.failedEntries.length > 0
                ? ` ${nextJob.failedEntries
                    .slice(0, 3)
                    .map((entry) => `${entry.fileId}: ${entry.message}`)
                    .join(' ')}`
                : '';

            setMessage({
              type: nextJob.failedItems > 0 || nextJob.status === 'failed' ? 'danger' : 'success',
              text:
                nextJob.failedItems > 0 || nextJob.status === 'failed'
                  ? `${nextJob.errorMessage || `Sync finished with ${nextJob.failedItems} failed media item${nextJob.failedItems === 1 ? '' : 's'}.`}${failedDebugText}`
                  : `Sync finished. ${nextJob.syncedItems} media item${nextJob.syncedItems === 1 ? '' : 's'} uploaded.`,
            });
          }
        }

        return nextJob;
      } catch (error) {
        stopCdnSyncPolling();

        if (!silent) {
          setMessage({
            type: 'danger',
            text: extractErrorMessage(error, 'Could not refresh the media sync status.'),
          });
        }

        return null;
      }
    },
    [client, refresh, stopCdnSyncPolling]
  );

  const startCdnSyncPolling = React.useCallback(() => {
    stopCdnSyncPolling();

    const tick = async () => {
      const result = await pollCdnSyncStatus(true).catch(() => null);

      if (result?.status === 'running') {
        cdnSyncPollingTimerRef.current = window.setTimeout(tick, 1000);
        return;
      }

      await pollCdnSyncStatus(false).catch(() => null);
    };

    tick();
  }, [pollCdnSyncStatus, stopCdnSyncPolling]);

  React.useEffect(() => {
    if (cdnConnectorSyncJob.status !== 'running') {
      stopCdnSyncPolling();
      return undefined;
    }

    startCdnSyncPolling();

    return () => {
      stopCdnSyncPolling();
    };
  }, [cdnConnectorSyncJob.status, startCdnSyncPolling, stopCdnSyncPolling]);

  React.useEffect(() => () => stopCdnSyncPolling(), [stopCdnSyncPolling]);

  React.useEffect(() => () => {
    if (copiedKeyTimerRef.current && typeof window !== 'undefined') {
      window.clearTimeout(copiedKeyTimerRef.current);
      copiedKeyTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    if (!account.connected) {
      return undefined;
    }

    syncStatus(true).catch(() => null);
    const interval = window.setInterval(() => {
      syncStatus(true).catch(() => null);
    }, 60000);

    return () => {
      window.clearInterval(interval);
    };
  }, [account.connected, syncStatus]);

  React.useEffect(() => {
    setOverviewNoticeDismissed(false);
  }, [account.connected, account.authKeyId]);

  React.useEffect(() => {
    if (!overviewProjectModule?.id) {
      setProjectToken('');
      setProjectTokenModuleId('');
      return;
    }

    if (projectTokenModuleId && projectTokenModuleId !== overviewProjectModule.id) {
      setProjectToken('');
      setProjectTokenModuleId('');
    }
  }, [overviewProjectModule?.id, projectTokenModuleId]);

  React.useEffect(() => {
    const syncableRoutes = new Set(
      syncedEndpoints
        .map((entry) => String(entry.route || '').trim())
        .filter(Boolean)
    );
    const nonSyncableRoutes = new Set(
      otherEndpoints
        .map((entry) => String(entry.route || '').trim())
        .filter(Boolean)
    );

    setSelectedSyncedRoutes((current) => current.filter((route) => syncableRoutes.has(route)));
    setSelectedOtherRoutes((current) => current.filter((route) => nonSyncableRoutes.has(route)));
    setExpandedSyncedVariantRoutes((current) => current.filter((route) => syncableRoutes.has(route)));
    setExpandedSyncedFileRoutes((current) => current.filter((route) => syncableRoutes.has(route)));
  }, [otherEndpoints, syncedEndpoints]);

  React.useEffect(() => {
    const availableItemIds = new Set(
      cdnConnectorMediaItems
        .map((item) => String(item.fileId || '').trim())
        .filter(Boolean)
    );

    setExpandedCdnConnectorItemIds((current) => current.filter((fileId) => availableItemIds.has(fileId)));
  }, [cdnConnectorMediaItems]);

  function updateApiAcceleratorField(key, value) {
    setApiAcceleratorSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateCdnConnectorField(key, value) {
    setCdnConnectorSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function selectView(viewId) {
    setActiveViewId(viewId);
    syncViewHash(viewId);
  }

  async function startBrowserLogin() {
    const result = await runAction(
      'Starting browser login',
      async () => {
        const response = await client.post(`/${pluginId}/core/auth/start`, {
          guest: false,
          ...buildIntegrationReturnPayload(),
        });

        if (response.data?.data?.account) {
          setAccount((current) => ({
            ...current,
            ...response.data.data.account,
          }));
        }

        return response.data?.data || null;
      },
      (data) => {
        if (data?.redirectUrl) {
          return 'Redirecting to Smooth Bundle.';
        }

        return data?.status === 'active' || data?.account?.connected
          ? data?.message || 'Connected to Smooth Bundle.'
          : 'Browser login started.';
      }
    );

    if (result?.redirectUrl) {
      window.location.assign(result.redirectUrl);
    }
  }

  async function startGuestLogin() {
    await runAction(
      'Starting guest login',
      async () => {
        const response = await client.post(`/${pluginId}/core/auth/start`, {
          guest: true,
        });

        if (response.data?.data?.account) {
          setAccount((current) => ({
            ...current,
            ...response.data.data.account,
          }));
        }

        return response.data?.data || null;
      },
      (data) =>
        data?.status === 'active' || data?.account?.connected
          ? data?.message || 'Connected to Smooth Bundle.'
          : 'Guest login started.'
    );
  }

  async function disconnect() {
    await runAction(
      'Disconnecting',
      async () => {
        const response = await client.post(`/${pluginId}/core/disconnect`, {});

        if (response.data?.data?.account) {
          setAccount((current) => ({
            ...current,
            ...response.data.data.account,
          }));
        }

        setProjectToken('');
        setProjectTokenModuleId('');
      },
      'Disconnected from Smooth Bundle.'
    );
  }

  async function purgePluginData() {
    const shouldPurge =
      typeof window === 'undefined'
        ? true
        : window.confirm(
            'This will remove all Smooth Bundle plugin data (module settings, sync state, and cached entries) while keeping your current Smooth Bundle login session. Continue?'
          );

    if (!shouldPurge) {
      return;
    }

    await runAction(
      'Purging plugin data',
      async () => {
        const response = await client.post(`/${pluginId}/core/purge-plugin-data`, {});
        setProjectToken('');
        setProjectTokenModuleId('');
        setSelectedSyncedRoutes([]);
        setSelectedOtherRoutes([]);
        setExpandedSyncedVariantRoutes([]);
        setExpandedSyncedFileRoutes([]);
        setExpandedCdnConnectorItemIds([]);
        setApiAcceleratorAccessesPage(1);
        setCdnConnectorPage(1);
        setCdnConnectorAccessesPage(1);
        setCdnConnectorUnusedAssetsPage(1);
        hydrate(response.data?.data || {});
        return response.data?.data || null;
      },
      (data) => data?.message || 'Plugin data purged. Smooth Bundle login session preserved.'
    );
  }

  async function loadProjectToken(moduleId) {
    if (!moduleId) {
      return;
    }

    setLoadingProjectToken(true);

    try {
      const response = await client.get(`/${pluginId}/modules/${moduleId}/project-token`);
      const token = String(response.data?.data?.token || '').trim();

      setProjectToken(token);
      setProjectTokenModuleId(moduleId);
    } catch (error) {
      setMessage({
        type: 'danger',
        text: extractErrorMessage(error, 'Could not fetch the project token.'),
      });
    } finally {
      setLoadingProjectToken(false);
    }
  }

  async function refreshStatus() {
    await runAction(
      'Refreshing status',
      async () => {
        const response = await client.post(`/${pluginId}/core/status-sync`, {});
        const nextAccount = response.data?.data?.account || null;

        if (nextAccount) {
          setAccount((current) => ({
            ...current,
            ...nextAccount,
          }));
          setModules((current) => mergeModulesWithAccountProjects(current, nextAccount));
        }

        return response.data?.data || null;
      },
      'Status refreshed.'
    );
  }

  async function toggleModule(moduleId, enabled) {
    const response = await runAction(
      enabled ? 'Enabling module' : 'Disabling module',
      async () => {
        const result = await client.post(`/${pluginId}/modules/${moduleId}/toggle`, {
          enabled,
          ...(enabled ? buildIntegrationReturnPayload() : {}),
        });

        if (result.data?.data?.modules) {
          setModules(result.data.data.modules);
        }

        if (moduleId === 'api-accelerator' && Array.isArray(result.data?.data?.endpoints)) {
          setApiAcceleratorEndpoints(result.data.data.endpoints);
        }

        if (moduleId === 'cdn-connector' && Array.isArray(result.data?.data?.mediaItems)) {
          setCdnConnectorMediaItems(result.data.data.mediaItems.map((item) => normalizeCdnConnectorMediaItem(item)));
        }

        if (moduleId === 'cdn-connector' && result.data?.data?.syncJob) {
          const nextJob = normalizeCdnConnectorSyncJob(result.data.data.syncJob);
          setCdnConnectorSyncJob(nextJob);

          if (nextJob.status === 'running') {
            startCdnSyncPolling();
          }
        }

        if (result.data?.data?.account) {
          setAccount((current) => ({
            ...current,
            ...result.data.data.account,
          }));
        }

        return result.data?.data || null;
      },
      (data) => {
        if (enabled && data?.redirectUrl) {
          return 'Redirecting to Smooth Bundle.';
        }

        return enabled ? 'Module enabled.' : 'Module disabled.';
      }
    );

    if (enabled && response?.redirectUrl) {
      window.location.assign(response.redirectUrl);
      return;
    }

    if (enabled && moduleId === 'api-accelerator' && response?.projectCreated) {
      setMessage({
        type: 'success',
        text: response?.initialScanError
          ? 'Module enabled and the initial Smooth Bundle project was created, but the first scan failed.'
          : 'Module enabled, the initial Smooth Bundle project was created, and the first scan started automatically.',
      });
    } else if (enabled && response?.projectCreated) {
      setMessage({
        type: 'success',
        text: response?.syncTriggered
          ? 'Module enabled, the dedicated Smooth Bundle project was created, and all Media items sync started automatically.'
          : 'Module enabled and the dedicated Smooth Bundle project was created.',
      });
    } else if (enabled && response?.projectCreationError) {
      setMessage({
        type: 'warning',
        text: `Module enabled, but the Smooth Bundle project could not be created automatically. ${response.projectCreationError}`,
      });
    } else if (enabled && moduleId === 'cdn-connector' && response?.syncTriggered) {
      setMessage({
        type: 'success',
        text: 'Module enabled and all Media items sync started automatically.',
      });
    } else if (enabled && moduleId === 'api-accelerator' && response?.initialScanError) {
      setMessage({
        type: 'warning',
        text: `Module enabled, but the initial scan failed. ${response.initialScanError}`,
      });
    }
  }

  async function saveApiAcceleratorSettings() {
    await runAction(
      'Saving API Accelerator',
      async () => {
        const response = await client.put(
          `/${pluginId}/modules/api-accelerator/settings`,
          normalizeApiAcceleratorForSubmit(apiAcceleratorSettings)
        );

        if (response.data?.data?.settings) {
          setApiAcceleratorSettings(normalizeApiAcceleratorSettings(response.data.data.settings));
        }

        if (response.data?.data?.project) {
          setModules((current) => mergeModuleProject(current, 'api-accelerator', response.data.data.project));
          setAccount((current) => ({
            ...current,
            moduleProjects: {
              ...(current.moduleProjects || {}),
              'api-accelerator': {
                ...(current.moduleProjects?.['api-accelerator'] || {}),
                ...response.data.data.project,
              },
            },
          }));
        }

        if (Array.isArray(response.data?.data?.endpoints)) {
          setApiAcceleratorEndpoints(response.data.data.endpoints);
        }

        if (response.data?.data?.syncJob) {
          const nextJob = normalizeApiAcceleratorSyncJob(response.data.data.syncJob);
          setApiAcceleratorSyncJob(nextJob);

          if (nextJob.status === 'running') {
            startApiSyncPolling();
          }
        }

        return response.data?.data || null;
      },
      (data) => {
        if (data?.scanTriggered && data?.syncTriggered) {
          return 'API Accelerator settings saved. Collection page size changed, so a fresh scan and resync started.';
        }

        if (data?.syncTriggered) {
          return 'API Accelerator settings saved. Synced endpoints are being refreshed.';
        }

        return 'API Accelerator settings saved.';
      }
    );
  }

  async function saveCdnConnectorSettings() {
    await runAction(
      'Saving CDN Connector',
      async () => {
        const response = await client.put(
          `/${pluginId}/modules/cdn-connector/settings`,
          normalizeCdnConnectorForSubmit(cdnConnectorSettings)
        );

        if (response.data?.data?.settings) {
          setCdnConnectorSettings(normalizeCdnConnectorSettings(response.data.data.settings));
        }

        if (response.data?.data?.project) {
          setModules((current) => mergeModuleProject(current, 'cdn-connector', response.data.data.project));
          setAccount((current) => ({
            ...current,
            moduleProjects: {
              ...(current.moduleProjects || {}),
              'cdn-connector': {
                ...(current.moduleProjects?.['cdn-connector'] || {}),
                ...response.data.data.project,
              },
            },
          }));
        }

        if (Array.isArray(response.data?.data?.mediaItems)) {
          setCdnConnectorMediaItems(response.data.data.mediaItems.map((item) => normalizeCdnConnectorMediaItem(item)));
        }

        if (response.data?.data?.syncJob) {
          const nextJob = normalizeCdnConnectorSyncJob(response.data.data.syncJob);
          setCdnConnectorSyncJob(nextJob);

          if (nextJob.status === 'running') {
            startCdnSyncPolling();
          }
        }

        return response.data?.data || null;
      },
      (data) => {
        if (data?.syncTriggered) {
          return 'CDN Connector settings saved. Media refresh started.';
        }

        return 'CDN Connector settings saved.';
      }
    );
  }

  async function loadRestorableAssets() {
    try {
      const response = await client.get(`/${pluginId}/modules/cdn-connector/restore-assets`);
      setCdnConnectorRestorableAssets(
        Array.isArray(response.data?.data?.assets)
          ? response.data.data.assets.map((item) => normalizeCdnConnectorRestorableAsset(item))
          : []
      );
      setCdnConnectorRestorableAssetsMessage(String(response.data?.data?.message || '').trim());
    } catch (error) {
      setCdnConnectorRestorableAssets([]);
      setCdnConnectorRestorableAssetsMessage(extractErrorMessage(error, 'Could not load restorable assets.'));
    }
  }

  async function restoreCdnAsset(assetId) {
    await runAction(
      'Restoring CDN asset',
      async () => {
        const response = await client.post(`/${pluginId}/modules/cdn-connector/restore-assets`, { assetId });
        if (Array.isArray(response.data?.data?.mediaItems)) {
          setCdnConnectorMediaItems(response.data.data.mediaItems.map((item) => normalizeCdnConnectorMediaItem(item)));
        }
        await loadRestorableAssets();
        return response.data?.data || null;
      },
      'Asset restored from Smooth Bundle.'
    );
  }

  async function syncAllMediaItems() {
    setMessage(null);

    try {
      const response = await client.post(`/${pluginId}/modules/cdn-connector/sync`, {
        force: true,
      });
      const nextJob = normalizeCdnConnectorSyncJob(response.data?.data?.job || {});

      setCdnConnectorSyncJob(nextJob);

      if (nextJob.status === 'running') {
        startCdnSyncPolling();
      }
    } catch (error) {
      const nextJob = normalizeCdnConnectorSyncJob(error?.response?.data?.data?.job || {});

      if (nextJob.status === 'running') {
        setCdnConnectorSyncJob(nextJob);
        startCdnSyncPolling();
        return;
      }

      setMessage({
        type: 'danger',
        text: extractErrorMessage(error, 'Could not start the media sync process.'),
      });
    }
  }

  async function syncSingleMediaItem(fileId) {
    if (!fileId) {
      return;
    }

    setMessage(null);

    try {
      const response = await client.post(`/${pluginId}/modules/cdn-connector/sync`, {
        fileId,
        force: true,
      });
      const nextJob = normalizeCdnConnectorSyncJob(response.data?.data?.job || {});

      setCdnConnectorSyncJob(nextJob);

      if (nextJob.status === 'running') {
        startCdnSyncPolling();
      }
    } catch (error) {
      const nextJob = normalizeCdnConnectorSyncJob(error?.response?.data?.data?.job || {});

      if (nextJob.status === 'running') {
        setCdnConnectorSyncJob(nextJob);
        startCdnSyncPolling();
        return;
      }

      setMessage({
        type: 'danger',
        text: extractErrorMessage(error, 'Could not start the media sync process.'),
      });
    }
  }

  async function unsyncSingleMediaItem(fileId) {
    if (!fileId) {
      return;
    }

    await runAction(
      'Removing media item from Smooth Bundle',
      async () => {
        const response = await client.post(`/${pluginId}/modules/cdn-connector/unsync`, {
          fileId,
        });

        setCdnConnectorMediaItems(
          Array.isArray(response.data?.data?.mediaItems)
            ? response.data.data.mediaItems.map((item) => normalizeCdnConnectorMediaItem(item))
            : []
        );
      },
      'Media item removed from Smooth Bundle.'
    );
  }

  async function setMediaProtection(fileId, protectedValue) {
    if (!fileId) {
      return;
    }

    setMessage(null);

    try {
      const response = await client.post(`/${pluginId}/modules/cdn-connector/protection`, {
        fileId,
        protected: protectedValue,
      });
      const nextJob = normalizeCdnConnectorSyncJob(response.data?.data?.job || {});

      setCdnConnectorSyncJob(nextJob);

      if (nextJob.status === 'running') {
        startCdnSyncPolling();
      }
    } catch (error) {
      const nextJob = normalizeCdnConnectorSyncJob(error?.response?.data?.data?.job || {});

      if (nextJob.status === 'running') {
        setCdnConnectorSyncJob(nextJob);
        startCdnSyncPolling();
        return;
      }

      setMessage({
        type: 'danger',
        text: extractErrorMessage(
          error,
          protectedValue ? 'Could not protect the media item.' : 'Could not unprotect the media item.'
        ),
      });
    }
  }

  async function protectSingleMediaItem(fileId) {
    await setMediaProtection(fileId, true);
  }

  async function unprotectSingleMediaItem(fileId) {
    await setMediaProtection(fileId, false);
  }

  async function revokeProjectAccess(accessId) {
    const normalizedAccessId = String(accessId || '').trim();

    if (!normalizedAccessId) {
      return;
    }

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm('Are you sure you want to revoke this access?');
      if (!confirmed) {
        return;
      }
    }

    await runAction(
      'Revoking project access',
      async () => {
        await client.post(`/${pluginId}/modules/cdn-connector/accesses/revoke`, {
          accessId: normalizedAccessId,
        });
      },
      'Project access revoked.'
    );
  }

  async function revokeApiAcceleratorProjectAccess(accessId) {
    const normalizedAccessId = String(accessId || '').trim();

    if (!normalizedAccessId) {
      return;
    }

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm('Are you sure you want to revoke this access?');
      if (!confirmed) {
        return;
      }
    }

    await runAction(
      'Revoking API Accelerator project access',
      async () => {
        await client.post(`/${pluginId}/modules/api-accelerator/accesses/revoke`, {
          accessId: normalizedAccessId,
        });
        await load();
      },
      'Project access revoked.'
    );
  }

  function toggleGrantAccessForm() {
    setIsGrantAccessFormOpen((current) => !current);
  }

  function toggleApiAcceleratorGrantAccessForm() {
    setIsApiAcceleratorGrantAccessFormOpen((current) => !current);
  }

  async function submitGrantAccess() {
    const email = String(grantAccessEmail || '').trim();

    if (!email) {
      setMessage({
        type: 'danger',
        text: 'Enter a valid email address.',
      });
      return;
    }

    await runAction(
      'Granting project access',
      async () => {
        await client.post(`/${pluginId}/modules/cdn-connector/accesses/grant`, {
          email,
          assets: grantAccessAssets,
          expiresAt: String(grantAccessExpiresAt || '').trim(),
        });
        setGrantAccessEmail('');
        setGrantAccessAssets([]);
        setGrantAccessExpiresAt('');
        setIsGrantAccessFormOpen(false);
      },
      'Access granted.'
    );
  }

  async function submitApiAcceleratorGrantAccess() {
    const email = String(apiAcceleratorGrantAccessEmail || '').trim();

    if (!email) {
      setMessage({
        type: 'danger',
        text: 'Enter a valid email address.',
      });
      return;
    }

    await runAction(
      'Granting API Accelerator project access',
      async () => {
        await client.post(`/${pluginId}/modules/api-accelerator/accesses/grant`, {
          email,
          assets: apiAcceleratorGrantAccessAssets,
          expiresAt: String(apiAcceleratorGrantAccessExpiresAt || '').trim(),
        });
        setApiAcceleratorGrantAccessEmail('');
        setApiAcceleratorGrantAccessAssets([]);
        setApiAcceleratorGrantAccessExpiresAt('');
        setIsApiAcceleratorGrantAccessFormOpen(false);
        await load();
      },
      'Access granted.'
    );
  }

  async function discoverEndpoints() {
    await runAction(
      'Scanning endpoints',
      async () => {
        await client.post(`/${pluginId}/modules/api-accelerator/discover`, {});
      },
      'Endpoint scan finished.'
    );
  }

  async function syncAll() {
    setMessage(null);

    try {
      const response = await client.post(`/${pluginId}/modules/api-accelerator/sync`, {
        force: true,
      });
      const nextJob = normalizeApiAcceleratorSyncJob(response.data?.data?.job || {});

      setApiAcceleratorSyncJob(nextJob);

      if (nextJob.status === 'running') {
        startApiSyncPolling();
      }
    } catch (error) {
      const nextJob = normalizeApiAcceleratorSyncJob(error?.response?.data?.data?.job || {});

      if (nextJob.status === 'running') {
        setApiAcceleratorSyncJob(nextJob);
        startApiSyncPolling();
        return;
      }

      setMessage({
        type: 'danger',
        text: extractErrorMessage(error, 'Could not start the sync process.'),
      });
    }
  }

  function expandRoutesForGroup(routes) {
    const normalizedRoutes = normalizeRouteList(routes);

    return normalizeRouteList(
      normalizedRoutes.flatMap((route) => {
        const entry = apiAcceleratorEndpoints.find((item) => String(item.route || '').trim() === route);

        if (!entry || entry.kind !== 'collection') {
          return [route];
        }

        return [
          route,
          ...getCollectionVariantEndpoints(entry, apiAcceleratorEndpoints).map((variant) => variant.route),
        ];
      })
    );
  }

  function expandSyncedRoutesForGroup(routes) {
    const expandedRoutes = expandRoutesForGroup(routes);
    const syncedRouteSet = new Set(
      apiAcceleratorEndpoints
        .filter((entry) => entry?.syncable)
        .map((entry) => String(entry.route || '').trim())
        .filter(Boolean)
    );

    return expandedRoutes.filter((route) => syncedRouteSet.has(route));
  }

  async function toggleSyncable(routes, syncable) {
    const normalizedRoutes = expandRoutesForGroup(routes);

    if (normalizedRoutes.length === 0) {
      return;
    }

    await runAction(
      syncable ? 'Syncing endpoints to module' : 'Removing endpoints from sync',
      async () => {
        await client.post(`/${pluginId}/modules/api-accelerator/syncable`, {
          route: normalizedRoutes.length === 1 ? normalizedRoutes[0] : undefined,
          routes: normalizedRoutes.length > 1 ? normalizedRoutes : undefined,
          syncable,
        });

        if (syncable) {
          const response = await client.post(`/${pluginId}/modules/api-accelerator/sync`, {
            routes: normalizedRoutes,
            force: true,
          });
          const nextJob = normalizeApiAcceleratorSyncJob(response.data?.data?.job || {});

          setApiAcceleratorSyncJob(nextJob);

          if (nextJob.status === 'running') {
            startApiSyncPolling();
          }
        }
      },
      normalizedRoutes.length === 1
        ? `${normalizedRoutes[0]} ${syncable ? 'sync started.' : 'removed from synced endpoints.'}`
        : syncable
          ? `${normalizedRoutes.length} endpoint sync started.`
          : `${normalizedRoutes.length} endpoints updated.`
    );
  }

  async function setEndpointProtection(routes, protectedValue) {
    const normalizedRoutes = expandSyncedRoutesForGroup(routes);

    if (normalizedRoutes.length === 0) {
      return;
    }

    setMessage(null);

    try {
      const response = await client.post(`/${pluginId}/modules/api-accelerator/protection`, {
        route: normalizedRoutes.length === 1 ? normalizedRoutes[0] : undefined,
        routes: normalizedRoutes.length > 1 ? normalizedRoutes : undefined,
        protected: protectedValue,
      });
      const nextJob = normalizeApiAcceleratorSyncJob(response.data?.data?.job || {});

      if (Array.isArray(response.data?.data?.endpoints)) {
        setApiAcceleratorEndpoints(response.data.data.endpoints);
      }

      setApiAcceleratorSyncJob(nextJob);

      if (nextJob.status === 'running') {
        startApiSyncPolling();
      }
    } catch (error) {
      const nextJob = normalizeApiAcceleratorSyncJob(error?.response?.data?.data?.job || {});

      if (nextJob.status === 'running') {
        setApiAcceleratorSyncJob(nextJob);
        startApiSyncPolling();
        return;
      }

      setMessage({
        type: 'danger',
        text: extractErrorMessage(
          error,
          protectedValue ? 'Could not protect the endpoint.' : 'Could not unprotect the endpoint.'
        ),
      });
    }
  }

  function toggleSyncedVariants(route) {
    setExpandedSyncedVariantRoutes((current) => {
      const next = new Set(current);

      if (next.has(route)) {
        next.delete(route);
      } else {
        next.add(route);
      }

      return Array.from(next);
    });
  }

  function toggleSyncedFiles(route) {
    setExpandedSyncedFileRoutes((current) => {
      const next = new Set(current);

      if (next.has(route)) {
        next.delete(route);
      } else {
        next.add(route);
      }

      return Array.from(next);
    });
  }

  function toggleExpandedCdnConnectorItem(fileId) {
    setExpandedCdnConnectorItemIds((current) => {
      const next = new Set(current);

      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }

      return Array.from(next);
    });
  }

  function markCopied(key) {
    const normalizedKey = String(key || '').trim();

    if (!normalizedKey || typeof window === 'undefined') {
      return;
    }

    if (copiedKeyTimerRef.current) {
      window.clearTimeout(copiedKeyTimerRef.current);
    }

    setCopiedKey(normalizedKey);
    copiedKeyTimerRef.current = window.setTimeout(() => {
      setCopiedKey((current) => (current === normalizedKey ? '' : current));
      copiedKeyTimerRef.current = null;
    }, 1500);
  }

  async function copyVariantUrl(url, key = '') {
    if (!url) {
      return;
    }

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        markCopied(key || url);
        setMessage({
          type: 'success',
          text: 'URL copied.',
        });
        return;
      }

      setMessage({
        type: 'warning',
        text: 'Clipboard API is not available in this browser.',
      });
    } catch (error) {
      setMessage({
        type: 'danger',
        text: 'Could not copy the URL.',
      });
    }
  }

  function toggleSelectedRoutes(setter, route, checked) {
    setter((current) => toggleRouteSelection(current, route, checked));
  }

  function toggleAllSelectedRoutes(setter, routes, checked) {
    const normalizedRoutes = normalizeRouteList(routes);

    setter((current) => {
      const currentSet = new Set(current);

      for (const route of normalizedRoutes) {
        if (checked) {
          currentSet.add(route);
        } else {
          currentSet.delete(route);
        }
      }

      return Array.from(currentSet);
    });
  }

  async function syncSelectedRoutes() {
    const routes = normalizeRouteList(selectedOtherRoutes);
    if (routes.length === 0) {
      return;
    }

    await toggleSyncable(routes, true);
    setSelectedOtherRoutes([]);
  }

  async function unsyncSelectedRoutes() {
    const routes = normalizeRouteList(selectedSyncedRoutes);
    if (routes.length === 0) {
      return;
    }

    await toggleSyncable(routes, false);
    setSelectedSyncedRoutes([]);
  }

  async function unsyncAllMediaItems() {
    if (!hasSyncedCdnConnectorItems) {
      return;
    }

    await runAction(
      'Removing all media items from Smooth Bundle',
      async () => {
        const response = await client.post(`/${pluginId}/modules/cdn-connector/unsync`, {});

        setCdnConnectorMediaItems(
          Array.isArray(response.data?.data?.mediaItems)
            ? response.data.data.mediaItems.map((item) => normalizeCdnConnectorMediaItem(item))
            : []
        );
      },
      'All Media items removed from Smooth Bundle.'
    );
  }

  function renderCoreView() {
    const summary = account.statusSummary || defaultAccount().statusSummary;
    const cdnConnectorProject = getModuleProject(cdnConnectorModule);
    const apiAcceleratorProject = getModuleProject(apiAcceleratorModule);
    const planAction = getPlanAction(account);
    const assetLimitRows = [
      cdnConnectorModule?.enabled
        ? {
            label: 'CDN Connector',
            assetsCount: cdnConnectorProject?.assetsCount || 0,
          }
        : null,
      apiAcceleratorModule?.enabled
        ? {
            label: 'API Accelerator',
            assetsCount: apiAcceleratorProject?.assetsCount || 0,
          }
        : null,
    ].filter(Boolean);
    const overviewRowCount = account.connected ? 4 + (assetLimitRows.length > 0 ? 1 : 0) + (planAction ? 1 : 0) : 1;

    return (
      <SectionCard
        title="Overview"
        subtitle="Connect Strapi to Smooth Bundle and manage the shared account session."
        badge={connectionState}
        actions={
          <>
            <Button variant="secondary" onClick={refreshStatus} disabled={isInteractionBusy || !account.connected}>
              {busyAction === 'Refreshing status' ? 'Refreshing...' : 'Refresh status'}
            </Button>
            {account.connected ? (
              <Button
                variant="danger-light"
                onClick={purgePluginData}
                disabled={isInteractionBusy || isApiSyncRunning || isCdnSyncRunning}
              >
                {busyAction === 'Purging plugin data' ? 'Purging...' : 'Purge plugin data'}
              </Button>
            ) : null}
            {account.connected ? (
              <Button variant="danger-light" onClick={disconnect} disabled={isInteractionBusy}>
                Logout
              </Button>
            ) : null}
          </>
        }
      >
        {account.connected || overviewNoticeDismissed || !account.authKeyId ? null : (
          <StyledAlert
            title="Login pending"
            variant="info"
            closeLabel="Close alert"
            onClose={() => setOverviewNoticeDismissed(true)}
          >
            Finish the sign-in in Smooth Bundle. If the state does not refresh automatically, use Check login status.
          </StyledAlert>
        )}

        <Flex gap={3} wrap="wrap">
          {!account.connected ? (
            <Button onClick={startBrowserLogin} disabled={isInteractionBusy}>
              {busyAction === 'Starting browser login' ? 'Working' : 'Log in with Smooth Bundle account'}
            </Button>
          ) : null}
          {!account.connected ? (
            <Button variant="secondary" onClick={startGuestLogin} disabled={isInteractionBusy}>
              {busyAction === 'Starting guest login' ? 'Starting...' : 'Continue as guest'}
            </Button>
          ) : null}
          {account.authVerificationUrl ? (
            <Button
              variant="tertiary"
              disabled={isInteractionBusy}
              onClick={() => window.open(account.authVerificationUrl, '_blank', 'noopener,noreferrer')}
            >
              Open login page
            </Button>
          ) : null}
        </Flex>

        <Table colCount={2} rowCount={overviewRowCount}>
          <Tbody>
            <Tr>
              <Th>
                <Typography variant="sigma" textColor="neutral600">
                  Status
                </Typography>
              </Th>
              <Td>
                <Typography textColor="neutral800">{connectionState}</Typography>
              </Td>
            </Tr>
            {account.connected ? (
              <>
                <Tr>
                  <Th>
                    <Typography variant="sigma" textColor="neutral600">
                      User plan
                    </Typography>
                  </Th>
                  <Td>
                    <Typography textColor="neutral800">{formatUserPlan(account)}</Typography>
                  </Td>
                </Tr>
                <Tr>
                  <Th>
                    <Typography variant="sigma" textColor="neutral600">
                      Used requests
                    </Typography>
                  </Th>
                  <Td>
                    <Typography textColor="neutral800">
                      {summary.maxRequests > 0
                        ? `${formatCompactNumber(summary.requests)} / ${formatCompactNumber(summary.maxRequests)}`
                        : '-'}
                    </Typography>
                  </Td>
                </Tr>
                <Tr>
                  <Th>
                    <Typography variant="sigma" textColor="neutral600">
                      Used bandwidth
                    </Typography>
                  </Th>
                  <Td>
                    <Typography textColor="neutral800">
                      {summary.maxBandwidth > 0
                        ? `${formatBytes(summary.bandwidth)} / ${formatBytes(summary.maxBandwidth)}`
                        : '-'}
                    </Typography>
                  </Td>
                </Tr>
                {assetLimitRows.length > 0 ? (
                  <Tr>
                    <Th>
                      <Typography variant="sigma" textColor="neutral600">
                        Max amount of assets
                      </Typography>
                    </Th>
                    <Td>
                      {summary.assetsPerProject > 0 ? (
                        <Flex direction="column" gap={1} alignItems="stretch">
                          {assetLimitRows.map((row) => (
                            <Typography key={row.label} textColor="neutral800">
                              {row.label}: {formatCompactNumber(row.assetsCount)} / {formatCompactNumber(summary.assetsPerProject)}
                            </Typography>
                          ))}
                        </Flex>
                      ) : (
                        <Typography textColor="neutral800">-</Typography>
                      )}
                    </Td>
                  </Tr>
                ) : null}
                {planAction ? (
                  <Tr>
                    <Th>
                      <Typography variant="sigma" textColor="neutral600">
                        Plan action
                      </Typography>
                    </Th>
                    <Td>
                      {planAction.type === 'form' ? (
                        <form
                          method="POST"
                          action={buildBackendUrl(`/${pluginId}/core/create-free-account`)}
                          target="_blank"
                        >
                          <input type="hidden" name="nonce" value={planAction.nonce} />
                          <Button size="S" variant="secondary" type="submit">
                            {planAction.label}
                          </Button>
                        </form>
                      ) : (
                        <Button
                          size="S"
                          variant="secondary"
                          onClick={() => window.open(planAction.href, '_blank', 'noopener,noreferrer')}
                        >
                          {planAction.label}
                        </Button>
                      )}
                    </Td>
                  </Tr>
                ) : null}
              </>
            ) : null}
          </Tbody>
        </Table>

        {!account.connected ? (
          <Typography variant="pi" textColor="neutral600">
            Quota for requests, bandwidth, and asset size depends on your selected Smooth Bundle plan.{' '}
            <AlertLink href="https://smoothbundle.com/pricing" isExternal>
              More info and plan details
            </AlertLink>
          </Typography>
        ) : null}
      </SectionCard>
    );
  }

  function renderApiAcceleratorView() {
    const isEnabled = Boolean(apiAcceleratorModule?.enabled);
    const apiAcceleratorProject = getModuleProject(apiAcceleratorModule);

    return (
      <>
        <SectionCard
          title="API Accelerator"
          subtitle="Configure endpoint discovery, sync, and automatic resync behaviour for the Smooth Bundle API Accelerator module."
          badge={isEnabled ? 'Enabled' : 'Disabled'}
          actions={
            isEnabled ? (
              <>
                <Button variant="secondary" onClick={discoverEndpoints} disabled={isApiAcceleratorBusy}>
                  {busyAction === 'Scanning endpoints' ? 'Scanning...' : 'Scan'}
                </Button>
                <Button variant="secondary" onClick={syncAll} disabled={isApiAcceleratorBusy}>
                  {isApiSyncRunning
                    ? apiAcceleratorSyncJob.totalRoutes > 0
                      ? `Working (${apiAcceleratorSyncJob.processedRoutes}/${apiAcceleratorSyncJob.totalRoutes})`
                      : 'Working'
                    : 'Sync endpoints'}
                </Button>
                <Button
                  variant="danger-light"
                  onClick={() => toggleModule('api-accelerator', false)}
                  disabled={isApiAcceleratorBusy}
                >
                  {isModuleToggleBusy ? 'Working...' : 'Disable module'}
                </Button>
              </>
            ) : (
              <Button onClick={() => toggleModule('api-accelerator', true)} disabled={isApiAcceleratorBusy}>
                {isModuleToggleBusy ? 'Working...' : 'Enable module'}
              </Button>
            )
          }
        >
          {isEnabled ? (
            <Flex direction="column" gap={6} alignItems="stretch">
              <Flex direction="column" gap={4} alignItems="stretch">
                <SelectField
                  label="Block Strapi API GET requests"
                  value={apiAcceleratorSettings.blockGetMode || 'no'}
                  disabled={isApiAcceleratorBusy}
                  onChange={(value) => updateApiAcceleratorField('blockGetMode', value)}
                >
                  <SingleSelectOption value="no">Do not block</SingleSelectOption>
                  <SingleSelectOption value="all">Block all public GET /api/*</SingleSelectOption>
                  <SingleSelectOption value="synced">Block only synced endpoints</SingleSelectOption>
                </SelectField>

                <SelectField
                  label="Collection page size"
                  value={String(apiAcceleratorSettings.collectionSyncPerPage || 50)}
                  disabled={isApiAcceleratorBusy}
                  onChange={(value) => updateApiAcceleratorField('collectionSyncPerPage', Number(value))}
                >
                  <SingleSelectOption value="10">10</SingleSelectOption>
                  <SingleSelectOption value="25">25</SingleSelectOption>
                  <SingleSelectOption value="50">50</SingleSelectOption>
                  <SingleSelectOption value="100">100</SingleSelectOption>
                  <SingleSelectOption value="250">250</SingleSelectOption>
                  <SingleSelectOption value="500">500</SingleSelectOption>
                </SelectField>

                <SelectField
                  label="Auto sync frequency"
                  value={apiAcceleratorSettings.autoSyncFrequency || 'hourly'}
                  disabled={isApiAcceleratorBusy}
                  onChange={(value) => updateApiAcceleratorField('autoSyncFrequency', value)}
                >
                  <SingleSelectOption value="hourly">Hourly</SingleSelectOption>
                  <SingleSelectOption value="daily">Daily</SingleSelectOption>
                  <SingleSelectOption value="weekly">Weekly</SingleSelectOption>
                  <SingleSelectOption value="off">Off</SingleSelectOption>
                </SelectField>

                <TextField
                  label="Custom subdomain"
                  hint="CDN subdomain to point to your project. Default one is https://cdn.smoothbundle.com/[user]/[project]. You can replace it with https://[custom-subdomain].smoothbundle.com."
                  name="api-accelerator-custom-subdomain"
                  disabled={isApiAcceleratorBusy}
                  value={apiAcceleratorSettings.customSubdomain || ''}
                  onChange={(event) => updateApiAcceleratorField('customSubdomain', event.target.value)}
                />
              </Flex>

              <Grid.Root gap={4}>
                <Grid.Item col={6} s={6} xs={12}>
                  <BorderMetricCard label="Last scan" value={formatDateTime(apiAcceleratorSettings.lastDiscoveryAt)} />
                </Grid.Item>
                <Grid.Item col={6} s={6} xs={12}>
                  <BorderMetricCard label="Last sync" value={formatDateTime(apiAcceleratorSettings.lastSyncAt)} />
                </Grid.Item>
              </Grid.Root>

              <Flex justifyContent="flex-end">
                <Button onClick={saveApiAcceleratorSettings} disabled={isApiAcceleratorBusy}>
                  {busyAction === 'Saving API Accelerator' ? 'Saving...' : 'Save settings'}
                </Button>
              </Flex>

            </Flex>
          ) : null}
        </SectionCard>

        {isEnabled ? (
          <>
            <EndpointTableCard
              title="Synced endpoints"
              subtitle="Endpoints marked for syncing to Smooth Bundle."
              totalCount={allSyncedEndpoints.length}
              filteredCount={syncedEndpoints.length}
              allEndpoints={apiAcceleratorEndpoints}
              endpoints={syncedEndpointPageData.rows}
              searchValue={syncedEndpointSearch}
              onSearchChange={(value) => {
                setSyncedEndpointSearch(value);
                setSyncedEndpointPage(1);
              }}
              currentPage={syncedEndpointPageData.currentPage}
              totalPages={syncedEndpointPageData.totalPages}
              startIndex={syncedEndpointPageData.startIndex}
              endIndex={syncedEndpointPageData.endIndex}
              onPageChange={setSyncedEndpointPage}
              selectedRoutes={selectedSyncedRoutes}
              onToggleRoute={(route, checked) => toggleSelectedRoutes(setSelectedSyncedRoutes, route, checked)}
              onToggleAll={(routes, checked) => toggleAllSelectedRoutes(setSelectedSyncedRoutes, routes, checked)}
              onBulkAction={unsyncSelectedRoutes}
              bulkActionLabel="Unsync selected"
              rowActionLabel="Unsync"
              onRowAction={(route) => toggleSyncable(route, false)}
              renderRowActions={(entry) => {
                const route = String(entry.route || '').trim();
                const variants = entry.kind === 'collection'
                  ? getCollectionVariantEndpoints(entry, apiAcceleratorEndpoints).filter((variant) => variant.syncable)
                  : [];
                const protectionRoutes = expandSyncedRoutesForGroup(route);
                const protectionRouteSet = new Set(protectionRoutes);
                const protectedEntries = apiAcceleratorEndpoints.filter((item) =>
                  protectionRouteSet.has(String(item.route || '').trim())
                );
                const isProtected = protectedEntries.length > 0 && protectedEntries.every((item) => item.protected);
                const variantsExpanded = expandedSyncedVariantRoutes.includes(route);
                const syncedFiles = entry.kind === 'collection'
                  ? buildUploadTargetsForRouteAssets(route, entry.syncedFileCount)
                  : [];
                const syncedFilesExpanded = expandedSyncedFileRoutes.includes(route);
                const singleEntryUrl = entry.kind !== 'collection' && entry.syncStatus === 'uploaded'
                    ? buildPublicJsonUrl(
                        entry.assetRoute || route,
                        account.userSlug,
                        apiAcceleratorProject?.projectSlug,
                        apiAcceleratorProject?.customSubdomain || apiAcceleratorSettings.customSubdomain
                      )
                  : '';

                return (
                  <Flex direction="column" alignItems="flex-end" gap={2}>
                    <Flex gap={1} justifyContent="flex-end" wrap="wrap">
                      <Button size="S" variant="danger-light" onClick={() => toggleSyncable(route, false)} disabled={isApiAcceleratorBusy || !route}>
                        Unsync
                      </Button>
                      <Button
                        size="S"
                        variant="secondary"
                        onClick={() => setEndpointProtection(route, !isProtected)}
                        disabled={isApiAcceleratorBusy || protectionRoutes.length === 0}
                      >
                        {isProtected ? 'Unprotect' : 'Protect'}
                      </Button>
                    </Flex>
                    {entry.kind !== 'collection' ? (
                      <Flex gap={1} justifyContent="flex-end" wrap="nowrap">
                        <MiniActionButton
                          type="button"
                          onClick={() => window.open(singleEntryUrl, '_blank', 'noopener,noreferrer')}
                          disabled={!singleEntryUrl}
                        >
                          Open
                        </MiniActionButton>
                        <MiniActionButton
                          type="button"
                          onClick={() => copyVariantUrl(singleEntryUrl, `api:${route}:single`)}
                          disabled={!singleEntryUrl}
                        >
                          {copiedKey === `api:${route}:single` ? 'Copied' : 'Copy'}
                        </MiniActionButton>
                      </Flex>
                    ) : null}
                    {variants.length > 0 ? (
                      <>
                        <Button
                          size="S"
                          variant="tertiary"
                          onClick={() => toggleSyncedVariants(route)}
                          disabled={isApiAcceleratorBusy}
                        >
                          {variants.length} synced entries
                        </Button>
                        {variantsExpanded ? (
                          <CompactActionList>
                            {variants.map((variant) => {
                              const variantDisplayRoute = String(variant.assetRoute || variant.route || '').trim();
                              const variantErrorLines = normalizeErrorLines(variant.lastError);
                              const variantUrl =
                                variant.syncStatus === 'uploaded'
                                  ? buildPublicJsonUrl(
                                      variant.assetRoute || variant.route,
                                      account.userSlug,
                                      apiAcceleratorProject?.projectSlug,
                                      apiAcceleratorProject?.customSubdomain || apiAcceleratorSettings.customSubdomain
                                    )
                                  : '';

                              return (
                                <CompactActionRow key={variant.id || variant.route}>
                                  <Flex direction="column" gap={1} alignItems="stretch">
                                    <CompactActionText variant="pi" textColor="neutral800">
                                      {variantDisplayRoute}
                                    </CompactActionText>
                                    {variantErrorLines.length > 0 ? (
                                      <CompactActionText
                                        variant="pi"
                                        textColor="danger600"
                                        style={{
                                          overflow: 'visible',
                                          textOverflow: 'clip',
                                          whiteSpace: 'normal',
                                          wordBreak: 'break-word',
                                        }}
                                      >
                                        {renderErrorLines(variantErrorLines)}
                                      </CompactActionText>
                                    ) : null}
                                  </Flex>
                                  <Flex gap={1} justifyContent="flex-end" wrap="nowrap">
                                    <MiniActionButton
                                      type="button"
                                      onClick={() => window.open(variantUrl, '_blank', 'noopener,noreferrer')}
                                      disabled={!variantUrl}
                                    >
                                      Open
                                    </MiniActionButton>
                                    <MiniActionButton
                                      type="button"
                                      onClick={() => copyVariantUrl(variantUrl, `api:${route}:variant:${variant.route}`)}
                                      disabled={!variantUrl}
                                    >
                                      {copiedKey === `api:${route}:variant:${variant.route}` ? 'Copied' : 'Copy'}
                                    </MiniActionButton>
                                  </Flex>
                                </CompactActionRow>
                              );
                            })}
                          </CompactActionList>
                        ) : null}
                      </>
                    ) : null}
                    {syncedFiles.length > 0 ? (
                      <>
                        <Button
                          size="S"
                          variant="tertiary"
                          onClick={() => toggleSyncedFiles(route)}
                          disabled={isApiAcceleratorBusy}
                        >
                          {syncedFiles.length} synced files
                        </Button>
                        {syncedFilesExpanded ? (
                          <CompactActionList>
                            {syncedFiles.map((target) => {
                              const fileUrl = buildPublicJsonUrlForTarget(
                                target,
                                account.userSlug,
                                apiAcceleratorProject?.projectSlug,
                                apiAcceleratorProject?.customSubdomain || apiAcceleratorSettings.customSubdomain
                              );
                              const relativeTarget = `${target.path === '/' ? '' : target.path}/${target.filename}`;

                              return (
                                <CompactActionRow key={`${target.path}:${target.filename}`}>
                                  <CompactActionText variant="pi" textColor="neutral800">
                                    {relativeTarget.startsWith('/') ? relativeTarget : `/${relativeTarget}`}
                                  </CompactActionText>
                                  <Flex gap={1} justifyContent="flex-end" wrap="nowrap">
                                    <MiniActionButton
                                      type="button"
                                      onClick={() => window.open(fileUrl, '_blank', 'noopener,noreferrer')}
                                      disabled={!fileUrl}
                                    >
                                      Open
                                    </MiniActionButton>
                                    <MiniActionButton
                                      type="button"
                                      onClick={() => copyVariantUrl(fileUrl, `api:${route}:file:${target.path}:${target.filename}`)}
                                      disabled={!fileUrl}
                                    >
                                      {copiedKey === `api:${route}:file:${target.path}:${target.filename}` ? 'Copied' : 'Copy'}
                                    </MiniActionButton>
                                  </Flex>
                                </CompactActionRow>
                              );
                            })}
                          </CompactActionList>
                        ) : null}
                      </>
                    ) : null}
                  </Flex>
                );
              }}
              emptyMessage="No synced endpoints yet. Run Scan and mark endpoints for sync."
              emptySearchMessage="No synced endpoints match this search."
              isBusy={isApiAcceleratorBusy}
            />

            <EndpointTableCard
              title="Other endpoints"
              subtitle="All detected endpoints that are not currently marked for syncing."
              totalCount={allOtherEndpoints.length}
              filteredCount={otherEndpoints.length}
              allEndpoints={apiAcceleratorEndpoints}
              endpoints={otherEndpointPageData.rows}
              searchValue={otherEndpointSearch}
              onSearchChange={(value) => {
                setOtherEndpointSearch(value);
                setOtherEndpointPage(1);
              }}
              currentPage={otherEndpointPageData.currentPage}
              totalPages={otherEndpointPageData.totalPages}
              startIndex={otherEndpointPageData.startIndex}
              endIndex={otherEndpointPageData.endIndex}
              onPageChange={setOtherEndpointPage}
              selectedRoutes={selectedOtherRoutes}
              onToggleRoute={(route, checked) => toggleSelectedRoutes(setSelectedOtherRoutes, route, checked)}
              onToggleAll={(routes, checked) => toggleAllSelectedRoutes(setSelectedOtherRoutes, routes, checked)}
              onBulkAction={syncSelectedRoutes}
              bulkActionLabel="Sync selected"
              rowActionLabel="Sync"
              onRowAction={(route) => toggleSyncable(route, true)}
              emptyMessage="No other endpoints found. Run Scan to discover more endpoints."
              emptySearchMessage="No other endpoints match this search."
              isBusy={isApiAcceleratorBusy}
            />
            <AccessesTableCard
              totalCount={allApiAcceleratorAccesses.length}
              filteredCount={apiAcceleratorAccessRows.length}
              items={apiAcceleratorAccessesPageData.rows}
              searchValue={apiAcceleratorAccessesSearch}
              onSearchChange={(value) => {
                setApiAcceleratorAccessesSearch(value);
                setApiAcceleratorAccessesPage(1);
              }}
              currentPage={apiAcceleratorAccessesPageData.currentPage}
              totalPages={apiAcceleratorAccessesPageData.totalPages}
              startIndex={apiAcceleratorAccessesPageData.startIndex}
              endIndex={apiAcceleratorAccessesPageData.endIndex}
              onPageChange={setApiAcceleratorAccessesPage}
              onGrantToggle={toggleApiAcceleratorGrantAccessForm}
              isGrantFormOpen={isApiAcceleratorGrantAccessFormOpen}
              grantEmail={apiAcceleratorGrantAccessEmail}
              onGrantEmailChange={setApiAcceleratorGrantAccessEmail}
              grantAssets={apiAcceleratorGrantAccessAssets}
              onGrantAssetsChange={setApiAcceleratorGrantAccessAssets}
              grantExpiresAt={apiAcceleratorGrantAccessExpiresAt}
              onGrantExpiresAtChange={setApiAcceleratorGrantAccessExpiresAt}
              grantAssetOptions={effectiveApiAcceleratorGrantAccessAssetOptions}
              onGrantSubmit={submitApiAcceleratorGrantAccess}
              onRevokeOne={revokeApiAcceleratorProjectAccess}
              isBusy={isInteractionBusy}
              message={apiAcceleratorAccessesMessage}
            />
          </>
        ) : null}
      </>
    );
  }

  function renderCdnConnectorView() {
    const isEnabled = Boolean(cdnConnectorModule?.enabled);

    return (
      <>
        <SectionCard
          title="CDN Connector"
          subtitle="Configure media syncing and delivery behaviour for the Smooth Bundle media connector."
          badge={isEnabled ? 'Enabled' : 'Disabled'}
          actions={
            isEnabled ? (
              <>
                <Button variant="secondary" onClick={syncAllMediaItems} disabled={isCdnConnectorBusy}>
                  {isCdnSyncRunning
                    ? cdnConnectorSyncJob.totalItems > 0
                      ? `Working (${cdnConnectorSyncJob.processedItems}/${cdnConnectorSyncJob.totalItems})`
                      : 'Working'
                    : 'Trigger assets sync'}
                </Button>
                <Button
                  variant="danger-light"
                  onClick={() => toggleModule('cdn-connector', false)}
                  disabled={isCdnConnectorBusy}
                >
                  {isModuleToggleBusy ? 'Working...' : 'Disable module'}
                </Button>
              </>
            ) : (
              <Button onClick={() => toggleModule('cdn-connector', true)} disabled={isCdnConnectorBusy}>
                {isModuleToggleBusy ? 'Working...' : 'Enable module'}
              </Button>
            )
          }
        >
          {isEnabled ? (
            <Flex direction="column" gap={6} alignItems="stretch">
              <Flex direction="column" gap={4} alignItems="stretch">
                <SelectField
                  label="Auto sync frequency"
                  value={cdnConnectorSettings.autoSyncFrequency || 'hourly'}
                  disabled={isCdnConnectorBusy}
                  onChange={(value) => updateCdnConnectorField('autoSyncFrequency', value)}
                >
                  <SingleSelectOption value="hourly">Hourly</SingleSelectOption>
                  <SingleSelectOption value="daily">Daily</SingleSelectOption>
                  <SingleSelectOption value="weekly">Weekly</SingleSelectOption>
                  <SingleSelectOption value="off">Off</SingleSelectOption>
                </SelectField>

                <TextField
                  label="Custom subdomain"
                  hint="CDN subdomain to point to your project. Default one is https://cdn.smoothbundle.com/[user]/[project]. You can replace it with https://[custom-subdomain].smoothbundle.com."
                  name="cdn-connector-custom-subdomain"
                  disabled={isCdnConnectorBusy}
                  value={cdnConnectorSettings.customSubdomain || ''}
                  onChange={(event) => updateCdnConnectorField('customSubdomain', event.target.value)}
                />

                <SelectField
                  label="Offload local files"
                  hint="After each successful sync, remove local files from Strapi storage and serve synced assets from Smooth Bundle URLs."
                  value={cdnConnectorSettings.offloadLocalFiles ? 'enabled' : 'disabled'}
                  disabled={isCdnConnectorBusy}
                  onChange={(value) => updateCdnConnectorField('offloadLocalFiles', value === 'enabled')}
                >
                  <SingleSelectOption value="disabled">Disabled</SingleSelectOption>
                  <SingleSelectOption value="enabled">Enabled</SingleSelectOption>
                </SelectField>

                <SelectField
                  label="Delete CDN assets with Media Library items"
                  hint="When enabled, deleting a Strapi Media Library item also deletes its synced Smooth Bundle assets."
                  value={cdnConnectorSettings.deleteCdnAssetsWithMediaItems ? 'enabled' : 'disabled'}
                  disabled={isCdnConnectorBusy}
                  onChange={(value) => updateCdnConnectorField('deleteCdnAssetsWithMediaItems', value === 'enabled')}
                >
                  <SingleSelectOption value="disabled">Disabled</SingleSelectOption>
                  <SingleSelectOption value="enabled">Enabled</SingleSelectOption>
                </SelectField>

              </Flex>

              <Grid.Root gap={4}>
                <Grid.Item col={6} s={6} xs={12}>
                  <BorderMetricCard label="Last sync" value={formatDateTime(cdnConnectorSettings.lastSyncAt)} />
                </Grid.Item>
                <Grid.Item col={6} s={6} xs={12}>
                  <BorderMetricCard label="Last auto sync" value={formatDateTime(cdnConnectorSettings.lastAutoSyncAt)} />
                </Grid.Item>
              </Grid.Root>

              <Flex justifyContent="flex-end">
                <Button onClick={saveCdnConnectorSettings} disabled={isCdnConnectorBusy}>
                  {busyAction === 'Saving CDN Connector' ? 'Saving...' : 'Save settings'}
                </Button>
              </Flex>
            </Flex>
          ) : null}
        </SectionCard>

        {isEnabled ? (
          <Flex direction="column" gap={6} alignItems="stretch">
            <MediaTableCard
              title="Media items"
              subtitle="Media items available in the Strapi upload library, with direct sync controls and Smooth Bundle links."
              totalCount={allCdnConnectorItems.length}
              filteredCount={cdnConnectorItems.length}
              items={cdnConnectorPageData.rows}
              searchValue={cdnConnectorSearch}
              onSearchChange={(value) => {
                setCdnConnectorSearch(value);
                setCdnConnectorPage(1);
              }}
              currentPage={cdnConnectorPageData.currentPage}
              totalPages={cdnConnectorPageData.totalPages}
              startIndex={cdnConnectorPageData.startIndex}
              endIndex={cdnConnectorPageData.endIndex}
              onPageChange={setCdnConnectorPage}
              hasSyncedItems={hasSyncedCdnConnectorItems}
              onBulkSyncAll={syncAllMediaItems}
              onBulkUnsyncAll={unsyncAllMediaItems}
              onSyncOne={syncSingleMediaItem}
              onUnsyncOne={unsyncSingleMediaItem}
              onProtectOne={protectSingleMediaItem}
              onUnprotectOne={unprotectSingleMediaItem}
              onCopyUrl={copyVariantUrl}
              copiedKey={copiedKey}
              expandedItemIds={expandedCdnConnectorItemIds}
              onToggleExpanded={toggleExpandedCdnConnectorItem}
              isOffloadEnabled={Boolean(cdnConnectorSettings.offloadLocalFiles)}
              isBusy={isCdnConnectorBusy}
            />
            <AccessesTableCard
              totalCount={allCdnConnectorAccesses.length}
              filteredCount={cdnConnectorAccessRows.length}
              items={cdnConnectorAccessesPageData.rows}
              searchValue={cdnConnectorAccessesSearch}
              onSearchChange={(value) => {
                setCdnConnectorAccessesSearch(value);
                setCdnConnectorAccessesPage(1);
              }}
              currentPage={cdnConnectorAccessesPageData.currentPage}
              totalPages={cdnConnectorAccessesPageData.totalPages}
              startIndex={cdnConnectorAccessesPageData.startIndex}
              endIndex={cdnConnectorAccessesPageData.endIndex}
              onPageChange={setCdnConnectorAccessesPage}
              onGrantToggle={toggleGrantAccessForm}
              isGrantFormOpen={isGrantAccessFormOpen}
              grantEmail={grantAccessEmail}
              onGrantEmailChange={setGrantAccessEmail}
              grantAssets={grantAccessAssets}
              onGrantAssetsChange={setGrantAccessAssets}
              grantExpiresAt={grantAccessExpiresAt}
              onGrantExpiresAtChange={setGrantAccessExpiresAt}
              grantAssetOptions={cdnConnectorGrantAccessAssetOptions}
              onGrantSubmit={submitGrantAccess}
              onRevokeOne={revokeProjectAccess}
              isBusy={isInteractionBusy}
              message={cdnConnectorAccessesMessage}
            />
          </Flex>
        ) : null}
      </>
    );
  }

  function renderRestoreAssetsView() {
    return (
      <RestoreAssetsTableCard
        items={cdnConnectorRestorableAssets}
        message={cdnConnectorRestorableAssetsMessage}
        onRestore={restoreCdnAsset}
        isBusy={isInteractionBusy}
      />
    );
  }

  function renderUnusedAssetsView() {
    return (
      <UnusedAssetsTableCard
        totalCount={allCdnConnectorUnusedAssets.length}
        filteredCount={cdnConnectorUnusedAssetRows.length}
        items={cdnConnectorUnusedAssetsPageData.rows}
        searchValue={cdnConnectorUnusedAssetsSearch}
        onSearchChange={(value) => {
          setCdnConnectorUnusedAssetsSearch(value);
          setCdnConnectorUnusedAssetsPage(1);
        }}
        filterValue={cdnConnectorUnusedAssetsFilter}
        onFilterChange={(value) => {
          setCdnConnectorUnusedAssetsFilter(value);
          setCdnConnectorUnusedAssetsPage(1);
        }}
        currentPage={cdnConnectorUnusedAssetsPageData.currentPage}
        totalPages={cdnConnectorUnusedAssetsPageData.totalPages}
        startIndex={cdnConnectorUnusedAssetsPageData.startIndex}
        endIndex={cdnConnectorUnusedAssetsPageData.endIndex}
        onPageChange={setCdnConnectorUnusedAssetsPage}
        retentionLabel={cdnConnectorUnusedAssetsRetentionLabel}
        message={cdnConnectorUnusedAssetsMessage}
      />
    );
  }

  function renderCwvPipelineView() {
    const cwvPipelineModule = modules.find((module) => module.id === 'cwv-pipeline') || null;
    const isEnabled = Boolean(cwvPipelineModule?.enabled);

    return (
      <SectionCard
        title="CWV Pipeline"
        subtitle="Configure the Smooth Bundle project used by the Core Web Vitals pipeline module."
        badge={isEnabled ? 'Enabled' : 'Disabled'}
        actions={
          isEnabled ? (
            <Button
              variant="danger-light"
              onClick={() => toggleModule('cwv-pipeline', false)}
              disabled={isInteractionBusy}
            >
              {isModuleToggleBusy ? 'Working...' : 'Disable module'}
            </Button>
          ) : (
            <Button onClick={() => toggleModule('cwv-pipeline', true)} disabled={isInteractionBusy}>
              {isModuleToggleBusy ? 'Working...' : 'Enable module'}
            </Button>
          )
        }
      >
        {isEnabled ? (
          <Box background="neutral100" hasRadius padding={5}>
            <Flex direction="column" gap={3} alignItems="stretch">
              <Typography variant="epsilon" tag="h3">
                Settings
              </Typography>
              <Typography variant="pi" textColor="neutral600">
                This module does not have configurable settings yet. Enabling it creates a dedicated Smooth Bundle
                project for the future CWV pipeline workflow.
              </Typography>
            </Flex>
          </Box>
        ) : null}
      </SectionCard>
    );
  }

  function renderPlaceholderModuleView(module) {
    const project = getModuleProject(module);

    return (
      <SectionCard
        title={module.name}
        subtitle={module.description}
        badge={module.enabled ? 'Enabled' : 'Disabled'}
        actions={
          <Button
            variant={module.enabled ? 'danger-light' : 'secondary'}
            onClick={() => toggleModule(module.id, !module.enabled)}
            disabled={isInteractionBusy}
          >
            {isModuleToggleBusy ? 'Working...' : module.enabled ? 'Disable module' : 'Enable module'}
          </Button>
        }
      >
        {!module.implemented ? (
          <StyledAlert title="Placeholder module" variant="info" closeLabel="Close alert">
            This module already has its own slot in the plugin navigation, but its runtime feature set is not implemented yet.
          </StyledAlert>
        ) : null}

        <Grid.Root gap={4}>
          <Grid.Item col={6} xs={12}>
            <Box background="neutral100" hasRadius padding={5}>
              <Flex direction="column" gap={3} alignItems="stretch">
                <Typography variant="epsilon" tag="h3">
                  Runtime state
                </Typography>
                <Typography variant="pi" textColor="neutral600">
                  Use the toggle above to include or exclude this module and its dedicated Smooth Bundle project.
                </Typography>
                <Field.Root name={`placeholder-${module.id}`}>
                  <ToggleMaxWidth>
                    <Toggle
                      checked={Boolean(module.enabled)}
                      disabled={isInteractionBusy}
                      offLabel="Disabled"
                      onLabel="Enabled"
                      onChange={(event) => toggleModule(module.id, event.target.checked)}
                    />
                  </ToggleMaxWidth>
                </Field.Root>
              </Flex>
            </Box>
          </Grid.Item>
          <Grid.Item col={6} xs={12}>
            <Box background="neutral100" hasRadius padding={5}>
              <Flex direction="column" gap={3} alignItems="stretch">
                <Typography variant="epsilon" tag="h3">
                  Project
                </Typography>
                <Typography variant="pi" textColor="neutral600">
                  Slug: {project?.projectSlug || 'Not created'}
                </Typography>
                <Typography variant="pi" textColor="neutral600">
                  Custom subdomain: {project?.customSubdomain || 'Not set'}
                </Typography>
                <Typography variant="pi" textColor="neutral600">
                  Project ID: {project?.projectId || 'Not available'}
                </Typography>
                {project?.dashboardUrl ? (
                  <BaseLink href={project.dashboardUrl} isExternal>
                    Open project on Smooth Bundle
                  </BaseLink>
                ) : (
                  <Typography variant="pi" textColor="neutral600">
                    A dedicated project will be created for this module when needed.
                  </Typography>
                )}
              </Flex>
            </Box>
          </Grid.Item>
        </Grid.Root>
      </SectionCard>
    );
  }

  function renderActiveView() {
    if (activeViewId === RESTORE_ASSETS_VIEW_ID) {
      return renderRestoreAssetsView();
    }

    if (activeViewId === UNUSED_ASSETS_VIEW_ID) {
      return renderUnusedAssetsView();
    }

    if (!activeModule) {
      return renderCoreView();
    }

    if (activeModule.id === 'api-accelerator') {
      return renderApiAcceleratorView();
    }

    if (activeModule.id === 'cdn-connector') {
      return renderCdnConnectorView();
    }

    if (activeModule.id === 'cwv-pipeline') {
      return renderCwvPipelineView();
    }

    return renderPlaceholderModuleView(activeModule);
  }

  if (!isReady) {
    return <Page.Loading />;
  }

  const messageVariant =
    message?.type === 'success'
      ? 'success'
      : message?.type === 'warning'
        ? 'warning'
        : message?.type === 'info'
          ? 'info'
          : 'danger';
  const messageTitle =
    message?.type === 'success'
      ? 'Success'
      : message?.type === 'warning'
        ? 'Warning'
        : message?.type === 'info'
          ? 'Info'
          : 'Error';

  return (
    <Page.Main aria-busy={isInteractionBusy || isApiSyncRunning || isCdnSyncRunning}>
      <Page.Title>Smooth Bundle</Page.Title>
      <Layouts.Root
        sideNav={
          <PluginSideNav
            activeViewId={activeViewId}
            modules={modules}
            canAccessModules={account.connected}
            cdnConnectorDeleteAssetsEnabled={Boolean(cdnConnectorSettings.deleteCdnAssetsWithMediaItems)}
            onSelect={selectView}
          />
        }
      >
        <Layouts.Header
          title="Smooth Bundle"
          subtitle={
            activeModule
              ? `${activeModule.name} module settings and runtime controls.`
              : 'Plugin-wide Smooth Bundle connection and shared settings.'
          }
        />
        <Layouts.Content>
          <Flex direction="column" alignItems="stretch" gap={6}>
            <Box display={{ initial: 'block', medium: 'none' }}>
              <SelectField
                label="View"
                value={activeViewId}
                onChange={(value) => selectView(value)}
              >
                <SingleSelectOption value={CORE_VIEW_ID}>Overview</SingleSelectOption>
                {account.connected
                  ? modules.map((module) => (
                      <SingleSelectOption key={module.id} value={buildModuleViewId(module.id)}>
                        {module.name}
                      </SingleSelectOption>
                    ))
                  : null}
                {account.connected && cdnConnectorModule?.enabled && !cdnConnectorSettings.deleteCdnAssetsWithMediaItems ? (
                  <SingleSelectOption value={RESTORE_ASSETS_VIEW_ID}>Restore assets</SingleSelectOption>
                ) : null}
                {account.connected && cdnConnectorModule?.enabled ? (
                  <SingleSelectOption value={UNUSED_ASSETS_VIEW_ID}>Unused assets</SingleSelectOption>
                ) : null}
              </SelectField>
            </Box>

            {message ? (
              <StyledAlert
                title={messageTitle}
                variant={messageVariant}
                closeLabel="Close alert"
                onClose={() => setMessage(null)}
              >
                {message.text}
              </StyledAlert>
            ) : null}

            {activeModule?.id === 'api-accelerator' && isApiSyncRunning ? (
              <Box
                borderColor="neutral200"
                borderStyle="solid"
                borderWidth="1px"
                borderRadius="8px"
                padding={4}
                background="neutral0"
              >
                <Flex direction="column" gap={3} alignItems="stretch">
                  <Flex justifyContent="space-between" gap={3} wrap="wrap">
                    <Box>
                      <Typography variant="epsilon" tag="h3">
                        Sync in progress
                      </Typography>
                      <Typography variant="pi" textColor="neutral600">
                        {apiAcceleratorSyncJob.totalRoutes > 0
                          ? `${apiAcceleratorSyncJob.processedRoutes} of ${apiAcceleratorSyncJob.totalRoutes} selected endpoints processed`
                          : 'Preparing synced endpoints for upload'}
                      </Typography>
                    </Box>
                    <Typography variant="pi" textColor="neutral600">
                      {apiSyncProgress}%
                    </Typography>
                  </Flex>
                  <ProgressTrack>
                    <ProgressFill $progress={apiSyncProgress} />
                  </ProgressTrack>
                </Flex>
              </Box>
            ) : null}

            {activeModule?.id === 'cdn-connector' && isCdnSyncRunning ? (
              <Box
                borderColor="neutral200"
                borderStyle="solid"
                borderWidth="1px"
                borderRadius="8px"
                padding={4}
                background="neutral0"
              >
                <Flex direction="column" gap={3} alignItems="stretch">
                  <Flex justifyContent="space-between" gap={3} wrap="wrap">
                    <Box>
                      <Typography variant="epsilon" tag="h3">
                        {cdnConnectorJobCopy.title}
                      </Typography>
                      <Typography variant="pi" textColor="neutral600">
                        {cdnConnectorSyncJob.totalItems > 0
                          ? `${cdnConnectorSyncJob.processedItems} of ${cdnConnectorSyncJob.totalItems} media items processed`
                          : cdnConnectorJobCopy.preparing}
                      </Typography>
                    </Box>
                    <Typography variant="pi" textColor="neutral600">
                      {cdnSyncProgress}%
                    </Typography>
                  </Flex>
                  <ProgressTrack>
                    <ProgressFill $progress={cdnSyncProgress} />
                  </ProgressTrack>
                </Flex>
              </Box>
            ) : null}

            {renderActiveView()}
          </Flex>
        </Layouts.Content>
      </Layouts.Root>
    </Page.Main>
  );
}
