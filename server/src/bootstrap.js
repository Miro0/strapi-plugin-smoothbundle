'use strict';

module.exports = async ({ strapi }) => {
  try {
    await strapi.plugin('smoothbundle').service('cdn-connector-offload').installUploadUrlRewriteHook();
  } catch (error) {
    strapi.log.warn(`[smoothbundle] Could not install CDN Connector URL rewrite hook: ${error.message}`);
  }

  strapi.plugin('smoothbundle').service('api-accelerator-sync').startScheduler();
  strapi.plugin('smoothbundle').service('cdn-connector-optimize-queue').startScheduler();
  strapi.plugin('smoothbundle').service('cdn-connector-sync').startScheduler();
};
