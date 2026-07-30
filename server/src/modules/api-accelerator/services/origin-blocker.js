'use strict';

const { BYPASS_HEADER } = require('../../../utils/constants');
const { normalizeRoute } = require('../../../utils/helpers');

module.exports = ({ strapi }) => ({
  middleware() {
    return async (ctx, next) => {
      const plugin = strapi.plugin('smoothcdn');
      const enabled = await plugin.service('module-registry').isEnabled('api-accelerator');
      if (!enabled) {
        await next();
        return;
      }

      const settings = await plugin.service('api-accelerator-settings').get();

      if (settings.blockGetMode === 'no') {
        await next();
        return;
      }

      if (ctx.method !== 'GET' || !ctx.path.startsWith('/api/')) {
        await next();
        return;
      }

      if (ctx.get(BYPASS_HEADER) === '1') {
        await next();
        return;
      }

      if (ctx.state?.user || ctx.state?.auth || ctx.get('authorization')) {
        await next();
        return;
      }

      const route = normalizeRoute(ctx.path);
      if (settings.blockGetMode === 'synced') {
        const entry = await plugin.service('api-accelerator-repository').get(route);
        if (!entry || entry.syncStatus !== 'uploaded') {
          await next();
          return;
        }
      }

      ctx.status = 403;
      ctx.body = {
        error: {
          status: 403,
          name: 'SmoothCdnApiAcceleratorBlocked',
          message: 'Content API GET endpoints are blocked by Smooth Bundle API Accelerator settings.',
        },
      };
    };
  },
});
