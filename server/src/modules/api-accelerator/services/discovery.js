'use strict';

const {
  DEFAULT_DISCOVERY_PAGE_SIZE,
  MAX_DISCOVERY_PAGES,
} = require('../../../utils/constants');
const {
  extractIdentifier,
  isPublicContentType,
  normalizeRoute,
  pathToContentApiRoute,
} = require('../../../utils/helpers');

module.exports = ({ strapi }) => ({
  extractEntryIdentifier(uid, entity) {
    if (uid === 'plugin::upload.file') {
      const numericId = entity?.id ?? entity?.attributes?.id ?? '';
      return numericId ? String(numericId) : '';
    }

    return extractIdentifier(entity);
  },

  extractEntryAssetIdentifier(uid, entity) {
    if (uid === 'plugin::upload.file') {
      const documentId = entity?.documentId ?? entity?.attributes?.documentId ?? '';
      if (documentId) {
        return String(documentId);
      }
    }

    return this.extractEntryIdentifier(uid, entity);
  },

  getManagedRouteBase(uid, contentType) {
    if (uid === 'plugin::upload.file') {
      return {
        route: '/api/upload/files',
        type: 'collection',
      };
    }

    return pathToContentApiRoute(contentType);
  },

  listManagedContentTypes(settings, requestedContentTypes = []) {
    const requested = new Set(Array.isArray(requestedContentTypes) ? requestedContentTypes : []);
    const managedContentTypes = Object.entries(strapi.contentTypes || {})
      .filter(([uid, contentType]) => isPublicContentType(uid, contentType))
      .filter(([uid]) => requested.size === 0 || requested.has(uid))
      .map(([uid, contentType]) => ({
        uid,
        contentType,
      }));
    const uploadFileModel = typeof strapi.getModel === 'function' ? strapi.getModel('plugin::upload.file') : null;

    if (uploadFileModel && (requested.size === 0 || requested.has('plugin::upload.file'))) {
      managedContentTypes.push({
        uid: 'plugin::upload.file',
        contentType: uploadFileModel,
      });
    }

    return managedContentTypes;
  },

  async discoverCollectionRoutes(uid, contentType, settings) {
    const originFetcher = strapi.plugin('smoothcdn').service('api-accelerator-origin-fetcher');
    const base = this.getManagedRouteBase(uid, contentType);
    const routes = [];
    const response = await originFetcher.fetchJson(base.route, {
      settings,
      query: {
        'pagination[page]': 1,
        'pagination[pageSize]': DEFAULT_DISCOVERY_PAGE_SIZE,
      },
    });

    routes.push({
      route: base.route,
      routeTemplate: base.route,
      entryRouteTemplate: `${base.route}/[:id]`,
      detectedEntrypoints: 0,
      kind: 'collection',
      contentTypeUid: uid,
      status: response.success ? 'ready' : 'error',
      syncStatus: response.success ? 'detected' : 'fetch_failed',
      httpStatus: response.status,
      lastError: response.success ? '' : response.errorMessage,
    });

    if (!response.success || !Array.isArray(response.data)) {
      return {
        routes,
        removed: [],
      };
    }

    const items = [...response.data];
    const pageCount = Math.min(Number(response.meta?.pagination?.pageCount || 1), MAX_DISCOVERY_PAGES);

    for (let page = 2; page <= pageCount; page += 1) {
      const pageResponse = await originFetcher.fetchJson(base.route, {
        settings,
        query: {
          'pagination[page]': page,
          'pagination[pageSize]': DEFAULT_DISCOVERY_PAGE_SIZE,
        },
      });

      if (!pageResponse.success || !Array.isArray(pageResponse.data)) {
        break;
      }

      items.push(...pageResponse.data);
    }

    for (const entity of items) {
      const identifier = this.extractEntryIdentifier(uid, entity);
      if (!identifier) {
        continue;
      }

      routes.push({
        route: normalizeRoute(`${base.route}/${identifier}`),
        assetRoute: normalizeRoute(`${base.route}/${this.extractEntryAssetIdentifier(uid, entity)}`),
        routeTemplate: `${base.route}/:identifier`,
        kind: 'single',
        contentTypeUid: uid,
        status: 'ready',
        syncStatus: 'detected',
        httpStatus: 200,
        lastError: '',
      });
    }

    routes[0].detectedEntrypoints = items.length;

    return {
      routes,
      removed: [],
    };
  },

  async discoverSingleTypeRoute(uid, contentType, settings) {
    const originFetcher = strapi.plugin('smoothcdn').service('api-accelerator-origin-fetcher');
    const base = this.getManagedRouteBase(uid, contentType);
    const response = await originFetcher.fetchJson(base.route, { settings });

    return {
      routes: [
        {
          route: base.route,
          routeTemplate: base.route,
          kind: 'singleType',
          contentTypeUid: uid,
          status: response.success ? 'ready' : 'error',
          syncStatus: response.success ? 'detected' : 'fetch_failed',
          httpStatus: response.status,
          lastError: response.success ? '' : response.errorMessage,
        },
      ],
      removed: [],
    };
  },

  async discover(options = {}) {
    const enabled = await strapi.plugin('smoothcdn').service('module-registry').isEnabled('api-accelerator');
    if (!enabled) {
      return {
        processed: 0,
        upserted: 0,
        removed: [],
        failed: 0,
      };
    }

    const settings = options.settings || (await strapi.plugin('smoothcdn').service('api-accelerator-settings').getResolved());
    const repository = strapi.plugin('smoothcdn').service('api-accelerator-repository');
    const contentTypes = this.listManagedContentTypes(settings, options.contentTypes || []);
    const summary = {
      processed: 0,
      upserted: 0,
      removed: [],
      failed: 0,
    };

    for (const { uid, contentType } of contentTypes) {
      const baseRoute = this.getManagedRouteBase(uid, contentType);
      const discoveryResult = baseRoute.type === 'collection'
        ? await this.discoverCollectionRoutes(uid, contentType, settings)
        : await this.discoverSingleTypeRoute(uid, contentType, settings);

      await repository.upsertMany(discoveryResult.routes);
      const keepRoutes = discoveryResult.routes.map((route) => route.route);
      const removed = await repository.pruneContentType(uid, keepRoutes);
      summary.removed.push(...removed);
      summary.processed += discoveryResult.routes.length;
      summary.upserted += discoveryResult.routes.length;
      summary.failed += discoveryResult.routes.filter((route) => route.status === 'error').length;
    }

    await strapi.plugin('smoothcdn').service('api-accelerator-settings').touch('lastDiscoveryAt');

    return summary;
  },
});
