'use strict';

const { createHash } = require('node:crypto');
const { CDN_PUBLIC_HOST } = require('./constants');

function nowIso() {
  return new Date().toISOString();
}

function md5(value) {
  return createHash('md5').update(String(value)).digest('hex');
}

function stripQueryString(value) {
  const input = String(value || '').trim();
  const queryIndex = input.indexOf('?');
  return queryIndex === -1 ? input : input.slice(0, queryIndex);
}

function normalizeRoute(route) {
  const raw = stripQueryString(route);
  if (!raw) {
    return '';
  }

  const normalized = `/${raw.replace(/^\/+/, '')}`.replace(/\/{2,}/g, '/');
  return normalized === '/' ? normalized : normalized.replace(/\/+$/, '');
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseStringList(input) {
  if (Array.isArray(input)) {
    return Array.from(
      new Set(
        input
          .map((item) => String(item || '').trim())
          .filter(Boolean)
      )
    );
  }

  return Array.from(
    new Set(
      String(input || '')
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function extractIdentifier(entity) {
  if (!entity || typeof entity !== 'object') {
    return '';
  }

  const direct = entity.documentId ?? entity.id ?? '';
  if (direct) {
    return String(direct);
  }

  if (entity.attributes && typeof entity.attributes === 'object') {
    const nested = entity.attributes.documentId ?? entity.attributes.id ?? '';
    if (nested) {
      return String(nested);
    }
  }

  return '';
}

function buildUploadTarget(route) {
  const normalized = normalizeRoute(route);
  const segments = normalized.split('/').filter(Boolean);

  if (segments.length === 0) {
    return {
      path: '/',
      filename: 'index.json',
    };
  }

  const filename = `${segments[segments.length - 1]}.json`;
  const path = segments.length === 1 ? '/' : `/${segments.slice(0, -1).join('/')}`;

  return {
    path,
    filename,
  };
}

function buildUploadTargetsForRouteAssets(route, fileCount) {
  const normalizedCount = Math.max(0, Number(fileCount) || 0);
  if (normalizedCount === 0) {
    return [];
  }

  const target = buildUploadTarget(route);
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

function parseIntervalFrequency(frequency) {
  switch (String(frequency || 'hourly')) {
    case 'daily':
      return 24 * 60 * 60 * 1000;
    case 'weekly':
      return 7 * 24 * 60 * 60 * 1000;
    case 'off':
      return 0;
    case 'hourly':
    default:
      return 60 * 60 * 1000;
  }
}

function pathToContentApiRoute(contentType) {
  const kind = String(contentType?.kind || '');
  const singular = slugify(contentType?.info?.singularName || contentType?.modelName || '');
  const plural = slugify(contentType?.info?.pluralName || contentType?.collectionName || `${singular}s`);

  if (kind === 'singleType') {
    return {
      route: normalizeRoute(`/api/${singular}`),
      type: 'singleType',
    };
  }

  return {
    route: normalizeRoute(`/api/${plural}`),
    type: 'collection',
  };
}

function isPublicContentType(uid, contentType) {
  if (!String(uid || '').startsWith('api::')) {
    return false;
  }

  if (!contentType || typeof contentType !== 'object') {
    return false;
  }

  return true;
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function buildProjectDashboardUrl(userSlugOrSettings = {}, projectSlug = '') {
  const userSlug =
    typeof userSlugOrSettings === 'object' && userSlugOrSettings !== null
      ? String(userSlugOrSettings.userSlug || '').trim()
      : String(userSlugOrSettings || '').trim();
  const resolvedProjectSlug =
    typeof userSlugOrSettings === 'object' && userSlugOrSettings !== null
      ? String(userSlugOrSettings.projectSlug || '').trim()
      : String(projectSlug || '').trim();

  if (!userSlug || !resolvedProjectSlug) {
    return '';
  }

  return `${CDN_PUBLIC_HOST}/${encodeURIComponent(userSlug)}/${encodeURIComponent(resolvedProjectSlug)}`;
}

function buildProjectPanelPath(projectId = '') {
  const normalizedProjectId = String(projectId || '').trim();

  if (!normalizedProjectId) {
    return '/panel';
  }

  return `/panel/dev/projects/${encodeURIComponent(normalizedProjectId)}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isMorphRelationAttribute(attribute) {
  return (
    attribute &&
    attribute.type === 'relation' &&
    typeof attribute.relation === 'string' &&
    attribute.relation.toLowerCase().startsWith('morph')
  );
}

function getSchemaModel(strapi, uid) {
  if (!strapi || !uid) {
    return null;
  }

  if (typeof strapi.getModel === 'function') {
    const model = strapi.getModel(uid);
    if (model) {
      return model;
    }
  }

  return strapi.contentTypes?.[uid] || strapi.components?.[uid] || null;
}

function buildPopulateForAttribute(strapi, attribute, options, state) {
  if (!attribute || typeof attribute !== 'object') {
    return undefined;
  }

  const maxDepth = Number.isFinite(options.maxDepth) ? Math.max(1, Math.floor(options.maxDepth)) : 4;
  const nextLevel = state.level + 1;

  switch (attribute.type) {
    case 'media':
      return true;
    case 'component': {
      if (!attribute.component || nextLevel > maxDepth) {
        return true;
      }

      const childPopulate = buildSchemaPopulateTree(strapi, attribute.component, options, {
        level: nextLevel,
        ancestry: [...state.ancestry, state.uid],
      });

      return Object.keys(childPopulate).length > 0 ? { populate: childPopulate } : true;
    }
    case 'dynamiczone': {
      const fragments = {};

      for (const componentUid of attribute.components || []) {
        if (!componentUid) {
          continue;
        }

        if (nextLevel > maxDepth) {
          fragments[componentUid] = {};
          continue;
        }

        const childPopulate = buildSchemaPopulateTree(strapi, componentUid, options, {
          level: nextLevel,
          ancestry: [...state.ancestry, state.uid],
        });

        fragments[componentUid] = Object.keys(childPopulate).length > 0 ? { populate: childPopulate } : {};
      }

      return Object.keys(fragments).length > 0 ? { on: fragments } : true;
    }
    case 'relation': {
      if (isMorphRelationAttribute(attribute) || !attribute.target) {
        return undefined;
      }

      return true;
    }
    default:
      return undefined;
  }
}

function buildSchemaPopulateTree(strapi, uid, options = {}, state = {}) {
  const model = getSchemaModel(strapi, uid);
  if (!model || typeof model !== 'object') {
    return {};
  }

  const attributes = model.attributes && typeof model.attributes === 'object' ? model.attributes : {};
  const level = Number.isFinite(state.level) ? state.level : 1;
  const ancestry = Array.isArray(state.ancestry) ? state.ancestry : [];
  const populate = {};

  for (const [attributeName, attribute] of Object.entries(attributes)) {
    const attributePopulate = buildPopulateForAttribute(strapi, attribute, options, {
      uid,
      level,
      ancestry,
    });

    if (attributePopulate !== undefined) {
      populate[attributeName] = attributePopulate;
    }
  }

  return populate;
}

module.exports = {
  buildProjectPanelPath,
  buildProjectDashboardUrl,
  buildSchemaPopulateTree,
  buildUploadTarget,
  buildUploadTargetsForRouteAssets,
  escapeHtml,
  extractIdentifier,
  isPublicContentType,
  md5,
  normalizeRoute,
  nowIso,
  parseIntervalFrequency,
  parseStringList,
  pathToContentApiRoute,
  safeJsonParse,
  slugify,
  stripQueryString,
};
