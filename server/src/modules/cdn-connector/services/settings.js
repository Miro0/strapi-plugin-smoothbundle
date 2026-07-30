'use strict';

const { nowIso } = require('../../../utils/helpers');
const pluginId = require('../../../plugin-id');

module.exports = ({ strapi }) => ({
  defaults() {
    return {
      offloadLocalFiles: false,
      deleteCdnAssetsWithMediaItems: false,
      autoSyncFrequency: 'hourly',
      autoSyncUploads: false,
      syncAllFormats: true,
      lastSyncAt: '',
      lastAutoSyncAt: '',
    };
  },

  store() {
    return strapi.store({
      type: 'plugin',
      name: pluginId,
      key: 'cdn-connector-settings',
    });
  },

  sanitize(payload = {}, current = this.defaults()) {
    const defaults = this.defaults();
    const merged = {
      ...defaults,
      ...current,
      ...payload,
    };

    return {
      offloadLocalFiles: Object.prototype.hasOwnProperty.call(merged, 'offloadLocalFiles')
        ? Boolean(merged.offloadLocalFiles)
        : defaults.offloadLocalFiles,
      deleteCdnAssetsWithMediaItems: Object.prototype.hasOwnProperty.call(merged, 'deleteCdnAssetsWithMediaItems')
        ? Boolean(merged.deleteCdnAssetsWithMediaItems)
        : defaults.deleteCdnAssetsWithMediaItems,
      autoSyncFrequency: ['hourly', 'daily', 'weekly', 'off'].includes(String(merged.autoSyncFrequency))
        ? String(merged.autoSyncFrequency)
        : defaults.autoSyncFrequency,
      autoSyncUploads: Object.prototype.hasOwnProperty.call(merged, 'autoSyncUploads')
        ? Boolean(merged.autoSyncUploads)
        : defaults.autoSyncUploads,
      syncAllFormats: Object.prototype.hasOwnProperty.call(merged, 'syncAllFormats')
        ? Boolean(merged.syncAllFormats)
        : defaults.syncAllFormats,
      lastSyncAt: String(merged.lastSyncAt || '').trim(),
      lastAutoSyncAt: String(merged.lastAutoSyncAt || '').trim(),
    };
  },

  async get() {
    const stored = (await this.store().get()) || {};
    return this.sanitize(stored);
  },

  async getResolved(overrides = {}) {
    const coreSettings = await strapi.plugin('smoothbundle').service('core-settings').get();
    const project = await strapi.plugin('smoothbundle').service('core-settings').getProject('cdn-connector');
    const moduleSettings = await this.get();

    return {
      ...coreSettings,
      ...project,
      ...moduleSettings,
      ...(overrides || {}),
    };
  },

  async update(payload = {}) {
    const current = await this.get();
    const next = this.sanitize(payload, current);
    await this.store().set({ value: next });
    return next;
  },

  async touch(key) {
    return this.update({
      [key]: nowIso(),
    });
  },
});
