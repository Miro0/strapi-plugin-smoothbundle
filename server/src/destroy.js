'use strict';

module.exports = ({ strapi }) => {
  strapi.plugin('smoothcdn').service('api-accelerator-sync').stopScheduler();
  strapi.plugin('smoothcdn').service('cdn-connector-optimize-queue').stopScheduler();
  strapi.plugin('smoothcdn').service('cdn-connector-sync').stopScheduler();
};
