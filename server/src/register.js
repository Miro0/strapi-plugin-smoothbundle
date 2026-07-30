'use strict';

const { CDN_CONNECTOR_UPLOAD_DEBOUNCE_MS, CDN_PUBLIC_HOST } = require('./utils/constants');

const CDN_CUSTOM_SUBDOMAIN_SOURCE = 'https://*.smoothbundle.com';

function normalizePathPrefix(value, fallback = '/admin') {
  const normalized = String(value || '').trim();

  if (!normalized) {
    return fallback;
  }

  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function matchesPathPrefix(pathname, prefix) {
  const normalizedPathname = String(pathname || '').trim();
  const normalizedPrefix = normalizePathPrefix(prefix);

  return (
    normalizedPathname === normalizedPrefix ||
    normalizedPathname.startsWith(`${normalizedPrefix}/`)
  );
}

function appendSourceToCspDirective(value, directiveName, source) {
  const normalizedValue = String(value || '').trim();
  const normalizedDirectiveName = String(directiveName || '').trim();
  const normalizedSource = String(source || '').trim();

  if (!normalizedValue || !normalizedDirectiveName || !normalizedSource) {
    return normalizedValue;
  }

  const directives = normalizedValue
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean);

  let directiveFound = false;
  const nextDirectives = directives.map((directive) => {
    const tokens = directive.split(/\s+/).filter(Boolean);

    if (tokens[0] !== normalizedDirectiveName) {
      return directive;
    }

    directiveFound = true;

    if (!tokens.includes(normalizedSource)) {
      tokens.push(normalizedSource);
    }

    return tokens.join(' ');
  });

  if (!directiveFound) {
    nextDirectives.push(`${normalizedDirectiveName} 'self' data: blob: ${normalizedSource}`);
  }

  return nextDirectives.join('; ');
}

module.exports = ({ strapi }) => {
  const plugin = strapi.plugin('smoothbundle');
  const adminPath = normalizePathPrefix(strapi.config.get('admin.path') || '/admin');
  const watchedDocumentActions = new Set(['create', 'update', 'delete', 'publish', 'unpublish', 'discardDraft']);
  const watchedLifecycleActions = new Set([
    'afterCreate',
    'afterCreateMany',
    'afterDelete',
    'afterDeleteMany',
    'afterUpdate',
    'afterUpdateMany',
  ]);
  const watchedUploadSyncLifecycleActions = new Set(['afterCreate', 'afterCreateMany', 'afterUpdate', 'afterUpdateMany']);
  const watchedUploadDeleteLifecycleActions = new Set(['afterDelete', 'afterDeleteMany']);

  const enqueueContentChange = (uid, documentId, source) => {
    const normalizedUid = String(uid || '').trim();
    if (!normalizedUid.startsWith('api::')) {
      return;
    }

    Promise.resolve(
      plugin.service('api-accelerator-sync').queueContentChange(normalizedUid, String(documentId || '').trim())
    ).catch((error) => {
      strapi.log.error(
        `[smoothbundle] Failed to queue content change "${normalizedUid}" from ${source}: ${error.message}`
      );
    });
  };

  const enqueueUploadSync = (fileIds, source) => {
    const normalizedIds = Array.from(
      new Set(
        (Array.isArray(fileIds) ? fileIds : [fileIds])
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      )
    );

    if (normalizedIds.length === 0) {
      return;
    }

    Promise.all([
      plugin.service('module-registry').isEnabled('cdn-connector'),
      plugin.service('cdn-connector-settings').get(),
    ])
      .then(([enabled, settings]) => {
        if (!enabled || !settings.deleteCdnAssetsWithMediaItems) {
          return null;
        }

        return plugin
          .service('cdn-connector-optimize-queue')
          .queueMediaFiles(normalizedIds, CDN_CONNECTOR_UPLOAD_DEBOUNCE_MS);
      })
      .catch((error) => {
        strapi.log.error(`[smoothbundle] Failed to queue upload sync from ${source}: ${error.message}`);
      });
  };

  const deleteUploadFromCdn = (fileIds, source) => {
    const normalizedIds = Array.from(
      new Set(
        (Array.isArray(fileIds) ? fileIds : [fileIds])
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      )
    );

    if (normalizedIds.length === 0) {
      return;
    }

    Promise.resolve(plugin.service('module-registry').isEnabled('cdn-connector'))
      .then((enabled) => {
        if (!enabled) {
          return null;
        }

        return plugin.service('cdn-connector-optimize-queue').queueDeletedMediaFiles(normalizedIds);
      })
      .catch((error) => {
        strapi.log.error(`[smoothbundle] Failed to queue deleted upload cleanup from ${source}: ${error.message}`);
      });
  };

  const extractUploadIdsFromLifecycleEvent = (event) => {
    const collectIds = (value) => {
      if (Array.isArray(value)) {
        return value.flatMap((entry) => collectIds(entry));
      }

      if (value && typeof value === 'object') {
        if (Array.isArray(value.$in)) {
          return value.$in;
        }

        if (Array.isArray(value.in)) {
          return value.in;
        }

        if (value.id !== undefined && value.id !== null) {
          return [value.id];
        }
      }

      if (value !== undefined && value !== null && value !== '') {
        return [value];
      }

      return [];
    };

    const result = event?.result;

    if (Array.isArray(result)) {
      return result.map((entry) => entry?.id);
    }

    if (result && typeof result === 'object') {
      if (Array.isArray(result?.ids)) {
        return result.ids;
      }

      if (Array.isArray(result?.results)) {
        return result.results.map((entry) => entry?.id);
      }

      if (result.id !== undefined && result.id !== null) {
        return [result.id];
      }
    }

    if (event?.params?.where?.id !== undefined && event.params.where.id !== null) {
      return collectIds(event.params.where.id);
    }

    return [];
  };

  strapi.server.use(async (ctx, next) => {
    await next();

    if (!matchesPathPrefix(ctx.path, adminPath)) {
      return;
    }

    const cspHeaderName = 'Content-Security-Policy';
    const cspHeader = ctx.response.get(cspHeaderName);

    if (cspHeader) {
      const nextCsp = [CDN_PUBLIC_HOST, CDN_CUSTOM_SUBDOMAIN_SOURCE].reduce(
        (currentValue, source) => appendSourceToCspDirective(
          appendSourceToCspDirective(currentValue, 'img-src', source),
          'media-src',
          source
        ),
        cspHeader
      );

      if (nextCsp && nextCsp !== cspHeader) {
        ctx.set(cspHeaderName, nextCsp);
      }
    }

    const cspReportOnlyHeaderName = 'Content-Security-Policy-Report-Only';
    const cspReportOnlyHeader = ctx.response.get(cspReportOnlyHeaderName);

    if (!cspReportOnlyHeader) {
      return;
    }

    const nextReportOnlyCsp = [CDN_PUBLIC_HOST, CDN_CUSTOM_SUBDOMAIN_SOURCE].reduce(
      (currentValue, source) => appendSourceToCspDirective(
        appendSourceToCspDirective(currentValue, 'img-src', source),
        'media-src',
        source
      ),
      cspReportOnlyHeader
    );
    if (nextReportOnlyCsp && nextReportOnlyCsp !== cspReportOnlyHeader) {
      ctx.set(cspReportOnlyHeaderName, nextReportOnlyCsp);
    }
  });

  strapi.server.use(plugin.service('api-accelerator-origin-blocker').middleware());

  let documentMiddlewareRegistered = false;

  if (strapi.documents && typeof strapi.documents.use === 'function') {
    try {
      strapi.documents.use(async (context, next) => {
        const result = await next();
        if (watchedDocumentActions.has(String(context?.action || '')) && context?.uid) {
          enqueueContentChange(
            context.uid,
            result?.documentId || context?.params?.documentId || '',
            'document-service-middleware'
          );
        }

        return result;
      });
      documentMiddlewareRegistered = true;
    } catch (error) {
      strapi.log.warn(
        `[smoothbundle] Could not register document service middleware, falling back to DB lifecycles: ${error.message}`
      );
    }
  }

  if (strapi.db?.lifecycles?.subscribe) {
    strapi.db.lifecycles.subscribe((event) => {
      if (!watchedLifecycleActions.has(String(event?.action || ''))) {
        return;
      }

      const uid = event?.model?.uid;
      if (uid === 'plugin::upload.file') {
        const fileIds = extractUploadIdsFromLifecycleEvent(event);

        if (watchedUploadSyncLifecycleActions.has(String(event?.action || ''))) {
          enqueueUploadSync(fileIds, 'db-lifecycle');
          return;
        }

        if (watchedUploadDeleteLifecycleActions.has(String(event?.action || ''))) {
          deleteUploadFromCdn(fileIds, 'db-lifecycle');
          return;
        }
      }

      if (!documentMiddlewareRegistered && uid) {
        enqueueContentChange(uid, event?.result?.documentId || event?.params?.where?.documentId || '', 'db-lifecycle');
      }
    });
  }
};
