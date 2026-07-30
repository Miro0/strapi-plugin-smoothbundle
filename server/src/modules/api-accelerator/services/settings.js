'use strict';

const { DEFAULT_SYNC_PAGE_SIZE } = require('../../../utils/constants');
const { nowIso } = require('../../../utils/helpers');
const pluginId = require('../../../plugin-id');

const CONTENT_CHANGE_DEBOUNCE_MS = 5000;

module.exports = ({ strapi }) => ({
  defaults() {
    return {
      protectedAssets: false,
      blockGetMode: 'no',
      collectionSyncPerPage: DEFAULT_SYNC_PAGE_SIZE,
      autoSyncFrequency: 'hourly',
      lastDiscoveryAt: '',
      lastSyncAt: '',
      lastAutoSyncAt: '',
      debounceMs: CONTENT_CHANGE_DEBOUNCE_MS,
    };
  },

  store() {
    return strapi.store({
      type: 'plugin',
      name: pluginId,
      key: 'api-accelerator-settings',
    });
  },

  sanitize(payload = {}, current = this.defaults()) {
    const defaults = this.defaults();
    const merged = {
      ...defaults,
      ...current,
      ...payload,
    };

    const collectionSyncPerPage = Number(merged.collectionSyncPerPage) || DEFAULT_SYNC_PAGE_SIZE;

    return {
      protectedAssets: Boolean(merged.protectedAssets),
      blockGetMode: ['no', 'all', 'synced'].includes(String(merged.blockGetMode))
        ? String(merged.blockGetMode)
        : 'no',
      collectionSyncPerPage: [10, 25, 50, 100, 250, 500].includes(collectionSyncPerPage)
        ? collectionSyncPerPage
        : DEFAULT_SYNC_PAGE_SIZE,
      autoSyncFrequency: ['hourly', 'daily', 'weekly', 'off'].includes(String(merged.autoSyncFrequency))
        ? String(merged.autoSyncFrequency)
        : 'hourly',
      lastDiscoveryAt: String(merged.lastDiscoveryAt || '').trim(),
      lastSyncAt: String(merged.lastSyncAt || '').trim(),
      lastAutoSyncAt: String(merged.lastAutoSyncAt || '').trim(),
      debounceMs: CONTENT_CHANGE_DEBOUNCE_MS,
    };
  },

  async get() {
    const stored = (await this.store().get()) || {};
    return this.sanitize(stored);
  },

  async getResolved(overrides = {}) {
    const coreSettings = await strapi.plugin('smoothcdn').service('core-settings').get();
    const project = await strapi.plugin('smoothcdn').service('core-settings').getProject('api-accelerator');
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
