'use strict';

module.exports = ({ strapi }) => {
  strapi.plugin('smoothbundle').service('api-accelerator-sync').stopScheduler();
  strapi.plugin('smoothbundle').service('cdn-connector-optimize-queue').stopScheduler();
  strapi.plugin('smoothbundle').service('cdn-connector-sync').stopScheduler();
};
