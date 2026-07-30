'use strict';

const { URL } = require('node:url');
const { BYPASS_HEADER } = require('../../../utils/constants');
const {
  buildSchemaPopulateTree,
  isPublicContentType,
  normalizeRoute,
  pathToContentApiRoute,
  safeJsonParse,
} = require('../../../utils/helpers');

function normalizeOriginHost(host) {
  const normalized = String(host || '').trim();
  if (!normalized || normalized === '0.0.0.0' || normalized === '::' || normalized === '[::]') {
    return '127.0.0.1';
  }

  return normalized;
}

function buildAbsoluteBaseUrl(strapi, settings, options = {}) {
  const configuredServerUrl = String(strapi.config.get('server.url') || '').trim().replace(/\/+$/, '');
  const originHost = normalizeOriginHost(strapi.config.get('server.host'));
  const originPort = strapi.config.get('server.port') || 1337;

  if (options.internal !== true && settings.publicBaseUrl) {
    return settings.publicBaseUrl.replace(/\/+$/, '');
  }

  if (configuredServerUrl) {
    if (/^https?:\/\//.test(configuredServerUrl)) {
      const parsed = new URL(configuredServerUrl);
      const basePath = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname.replace(/\/+$/, '') : '';

      if (options.internal === true) {
        return `http://${originHost}:${originPort}${basePath}`;
      }

      return configuredServerUrl;
    }

    return `http://${originHost}:${originPort}${
      configuredServerUrl.startsWith('/') ? configuredServerUrl : `/${configuredServerUrl}`
    }`;
  }

  return `http://${originHost}:${originPort}`;
}

function extractPayloadDataAndMeta(payload) {
  let current = payload;
  let meta = {};

  for (let depth = 0; depth < 4; depth += 1) {
    if (current && typeof current === 'object' && !Array.isArray(current) && Object.keys(meta).length === 0) {
      meta = current.meta && typeof current.meta === 'object' ? current.meta : meta;
    }

    if (Array.isArray(current)) {
      return { data: current, meta };
    }

    if (!current || typeof current !== 'object') {
      return { data: current, meta };
    }

    if (Array.isArray(current.results)) {
      return { data: current.results, meta };
    }

    if (Array.isArray(current.documents)) {
      return { data: current.documents, meta };
    }

    if (Array.isArray(current.data)) {
      return { data: current.data, meta };
    }

    const keys = Object.keys(current);
    const isWrapper =
      Object.prototype.hasOwnProperty.call(current, 'data') &&
      keys.every((key) => ['data', 'meta', 'error', 'message', 'status'].includes(key));

    if (isWrapper) {
      current = current.data;
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(current, 'data')) {
      return { data: current.data, meta };
    }

    return { data: current, meta };
  }

  return { data: current, meta };
}

function parsePositiveInteger(value, fallback) {
  const normalized = Number(value);

  if (!Number.isFinite(normalized) || normalized <= 0) {
    return fallback;
  }

  return Math.max(1, Math.floor(normalized));
}

function parseEntityIdentifier(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }

  return raw;
}

function resolveInternalContentRoute(strapi, route) {
  const normalizedRoute = normalizeRoute(route);
  const definitions = Object.entries(strapi.contentTypes || {})
    .filter(([uid, contentType]) => isPublicContentType(uid, contentType))
    .map(([uid, contentType]) => ({
      uid,
      contentType,
      base: pathToContentApiRoute(contentType),
    }))
    .sort((left, right) => right.base.route.length - left.base.route.length);
  const uploadFileModel = typeof strapi.getModel === 'function' ? strapi.getModel('plugin::upload.file') : null;

  if (uploadFileModel) {
    definitions.push({
      uid: 'plugin::upload.file',
      contentType: uploadFileModel,
      base: {
        route: '/api/upload/files',
        type: 'collection',
      },
    });
    definitions.sort((left, right) => right.base.route.length - left.base.route.length);
  }

  for (const definition of definitions) {
    if (normalizedRoute === definition.base.route) {
      return {
        ...definition,
        identifier: '',
      };
    }

    if (definition.base.type !== 'collection') {
      continue;
    }

    const prefix = `${definition.base.route}/`;
    if (normalizedRoute.startsWith(prefix)) {
      return {
        ...definition,
        identifier: normalizedRoute.slice(prefix.length),
      };
    }
  }

  return null;
}

function buildPopulateQuery(query = {}) {
  const normalized = { ...(query || {}) };
  const hasPopulate = Object.keys(normalized).some((key) => key === 'populate' || key.startsWith('populate['));

  if (!hasPopulate) {
    normalized.populate = '*';
  }

  return normalized;
}

function resolvePopulateTree(strapi, uid) {
  if (uid === 'plugin::upload.file') {
    return {
      folder: true,
    };
  }

  const populate = buildSchemaPopulateTree(strapi, uid, {
    maxDepth: 4,
  });

  return Object.keys(populate).length > 0 ? populate : '*';
}

module.exports = ({ strapi }) => ({
  async buildUrl(route, options = {}) {
    const settings = options.settings || (await strapi.plugin('smoothcdn').service('api-accelerator-settings').getResolved());
    const baseUrl = buildAbsoluteBaseUrl(strapi, settings, {
      internal: options.internal === true,
    });
    const url = new URL(`${baseUrl}${normalizeRoute(route)}`);
    const query = new URLSearchParams();
    const effectiveQuery = buildPopulateQuery(options.query || {});

    for (const [key, value] of Object.entries(effectiveQuery)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }

      query.set(key, String(value));
    }

    url.search = query.toString();
    return url.toString();
  },

  async fetchInternalJson(route, options = {}) {
    const normalizedRoute = normalizeRoute(route);
    const resolved = resolveInternalContentRoute(strapi, normalizedRoute);

    if (!resolved) {
      return null;
    }

    try {
      if (resolved.uid === 'plugin::upload.file') {
        const uploadService = strapi.plugin('upload').service('upload');
        const populate = resolvePopulateTree(strapi, resolved.uid);

        if (!resolved.identifier) {
          const page = parsePositiveInteger(options.query?.['pagination[page]'], 1);
          const pageSize = parsePositiveInteger(options.query?.['pagination[pageSize]'], 25);
          const result = typeof uploadService?.findPage === 'function'
            ? await uploadService.findPage({
                populate,
                pagination: {
                  page,
                  pageSize,
                },
              })
            : {
                results: [],
                pagination: {
                  page,
                  pageSize,
                  pageCount: 1,
                  total: 0,
                },
              };
          const data = Array.isArray(result?.results) ? result.results : [];
          const pagination = result?.pagination || {
            page,
            pageSize,
            pageCount: 1,
            total: data.length,
          };

          return {
            success: true,
            status: 200,
            data,
            meta: {
              pagination,
            },
            raw: {
              data,
              meta: {
                pagination,
              },
            },
            url: `internal:${normalizedRoute}`,
            errorMessage: '',
          };
        }

        const fileId = parseEntityIdentifier(resolved.identifier);
        let rawFile = await strapi.db.query('plugin::upload.file').findOne({
          where: /^\d+$/.test(String(resolved.identifier || '').trim())
            ? { id: fileId }
            : { documentId: String(resolved.identifier || '').trim() },
        });

        if (!rawFile && /^\d+$/.test(String(resolved.identifier || '').trim())) {
          rawFile = await strapi.db.query('plugin::upload.file').findOne({
            where: {
              documentId: String(resolved.identifier || '').trim(),
            },
          });
        }

        const data = rawFile ? await strapi.plugin('upload').service('file').signFileUrls(rawFile) : null;

        if (!data) {
          return null;
        }

        return {
          success: true,
          status: 200,
          data,
          meta: {},
          raw: {
            data,
            meta: {},
          },
          url: `internal:${normalizedRoute}`,
          errorMessage: '',
        };
      }

      const service = strapi.service(resolved.uid);
      const documents = typeof strapi.documents === 'function' ? strapi.documents(resolved.uid) : null;
      const populate = resolvePopulateTree(strapi, resolved.uid);

      if (resolved.base.type === 'collection' && !resolved.identifier) {
        const page = parsePositiveInteger(options.query?.['pagination[page]'], 1);
        const pageSize = parsePositiveInteger(options.query?.['pagination[pageSize]'], 25);
        const result = typeof service?.find === 'function'
          ? await service.find({
              populate,
              pagination: {
                page,
                pageSize,
              },
            })
          : {
              results: await documents.findMany({
                populate,
                status: 'published',
                start: (page - 1) * pageSize,
                limit: pageSize,
              }),
            };
        const data = Array.isArray(result?.results) ? result.results : [];
        const count = documents
          ? await documents.count({
              status: 'published',
            })
          : data.length;
        const pagination = result?.pagination || {
          page,
          pageSize,
          pageCount: pageSize > 0 ? Math.max(1, Math.ceil(count / pageSize)) : 1,
          total: count,
        };

        return {
          success: true,
          status: 200,
          data,
          meta: {
            pagination,
          },
          raw: {
            data,
            meta: {
              pagination,
            },
          },
          url: `internal:${normalizedRoute}`,
          errorMessage: '',
        };
      }

      if (resolved.base.type === 'collection' && resolved.identifier) {
        const data = typeof service?.findOne === 'function'
          ? await service.findOne(resolved.identifier, {
              populate,
            })
          : await documents.findOne({
              populate,
              status: 'published',
              documentId: resolved.identifier,
            });

        if (!data) {
          return {
            success: false,
            status: 404,
            data: null,
            meta: {},
            raw: null,
            url: `internal:${normalizedRoute}`,
            errorMessage: 'Content entry not found.',
          };
        }

        return {
          success: true,
          status: 200,
          data,
          meta: {},
          raw: {
            data,
            meta: {},
          },
          url: `internal:${normalizedRoute}`,
          errorMessage: '',
        };
      }

      const data = typeof service?.find === 'function'
        ? await service.find({
            populate,
          })
        : await documents.findFirst({
            populate,
            status: 'published',
          });

      return {
        success: true,
        status: 200,
        data: data ?? null,
        meta: {},
        raw: {
          data: data ?? null,
          meta: {},
        },
        url: `internal:${normalizedRoute}`,
        errorMessage: '',
      };
    } catch (error) {
      return {
        success: false,
        status: Number(error?.status || error?.statusCode || 500) || 500,
        data: null,
        meta: {},
        raw: null,
        url: `internal:${normalizedRoute}`,
        errorMessage: error.message || 'Could not read Strapi content internally.',
      };
    }
  },

  async fetchJson(route, options = {}) {
    const internalResult = await this.fetchInternalJson(route, options);

    if (internalResult) {
      return internalResult;
    }

    const settings = options.settings || (await strapi.plugin('smoothcdn').service('api-accelerator-settings').getResolved());
    const url = await this.buildUrl(route, {
      settings,
      query: buildPopulateQuery(options.query || {}),
      internal: options.internal !== false,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 30000);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          [BYPASS_HEADER]: '1',
        },
        signal: controller.signal,
      });

      const text = await response.text();
      const payload = safeJsonParse(text, null);
      const { data, meta } = extractPayloadDataAndMeta(payload);

      return {
        success: response.ok,
        status: response.status,
        data,
        meta,
        raw: payload,
        url,
        errorMessage: response.ok ? '' : (payload && payload.error && payload.error.message) || `Origin returned ${response.status}.`,
      };
    } catch (error) {
      return {
        success: false,
        status: 500,
        data: null,
        meta: {},
        raw: null,
        url,
        errorMessage: error.name === 'AbortError' ? 'Origin request timed out.' : error.message,
      };
    } finally {
      clearTimeout(timeout);
    }
  },
});
