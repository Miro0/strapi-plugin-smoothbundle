'use strict';

module.exports = async ({ strapi }) => {
  try {
    await strapi.plugin('smoothcdn').service('cdn-connector-offload').installUploadUrlRewriteHook();
  } catch (error) {
    strapi.log.warn(`[smoothcdn] Could not install CDN Connector URL rewrite hook: ${error.message}`);
  }

  strapi.plugin('smoothcdn').service('api-accelerator-sync').startScheduler();
  strapi.plugin('smoothcdn').service('cdn-connector-optimize-queue').startScheduler();
  strapi.plugin('smoothcdn').service('cdn-connector-sync').startScheduler();
};
