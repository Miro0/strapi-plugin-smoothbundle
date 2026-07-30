'use strict';

const pluginId = require('../../../plugin-id');
const { md5, nowIso } = require('../../../utils/helpers');

module.exports = ({ strapi }) => ({
  store() {
    return strapi.store({
      type: 'plugin',
      name: pluginId,
      key: 'api-accelerator-repository',
    });
  },

  normalizeEntry(entry = {}, previous = null) {
    const current = previous || {};
    const route = String(entry.route || current.route || '').trim();
    const has = (key) => Object.prototype.hasOwnProperty.call(entry, key);

    return {
      id: md5(route),
      route,
      assetRoute: String(has('assetRoute') ? entry.assetRoute : (current.assetRoute || route)).trim() || route,
      routeTemplate: String(entry.routeTemplate || current.routeTemplate || route).trim(),
      entryRouteTemplate: String(entry.entryRouteTemplate || current.entryRouteTemplate || '').trim(),
      detectedEntrypoints: Math.max(0, Number(entry.detectedEntrypoints ?? current.detectedEntrypoints ?? 0) || 0),
      kind: String(entry.kind || current.kind || 'custom').trim(),
      contentTypeUid: String(entry.contentTypeUid || current.contentTypeUid || '').trim(),
      syncable: Object.prototype.hasOwnProperty.call(entry, 'syncable')
        ? Boolean(entry.syncable)
        : Boolean(current.syncable),
      protected: Object.prototype.hasOwnProperty.call(entry, 'protected')
        ? Boolean(entry.protected)
        : Boolean(current.protected),
      status: String(entry.status || current.status || 'detected').trim(),
      syncStatus: String(entry.syncStatus || current.syncStatus || 'detected').trim(),
      httpStatus: Number(entry.httpStatus ?? current.httpStatus ?? 0) || 0,
      jsonSize: Number(entry.jsonSize ?? current.jsonSize ?? 0) || 0,
      syncedFileCount: Math.max(0, Number(entry.syncedFileCount ?? current.syncedFileCount ?? 0) || 0),
      lastSyncedHash: String(has('lastSyncedHash') ? entry.lastSyncedHash : (current.lastSyncedHash || '')).trim(),
      lastSyncedAt: String(has('lastSyncedAt') ? entry.lastSyncedAt : (current.lastSyncedAt || '')).trim(),
      lastError: String(has('lastError') ? entry.lastError : (current.lastError || '')).trim(),
      updatedAt: nowIso(),
    };
  },

  async all() {
    const items = (await this.store().get()) || [];
    if (!Array.isArray(items)) {
      return [];
    }

    const needsProtectedMigration = items.some((item) => !Object.prototype.hasOwnProperty.call(item || {}, 'protected'));

    if (needsProtectedMigration) {
      const settings = await strapi.plugin(pluginId).service('api-accelerator-settings').get();
      const migratedItems = items.map((item) => ({
        ...item,
        protected: Object.prototype.hasOwnProperty.call(item || {}, 'protected')
          ? Boolean(item.protected)
          : Boolean(settings.protectedAssets),
      }));

      await this.save(migratedItems);
      return [...migratedItems].sort((left, right) => String(left.route || '').localeCompare(String(right.route || '')));
    }

    return [...items].sort((left, right) => String(left.route || '').localeCompare(String(right.route || '')));
  },

  async save(items) {
    await this.store().set({ value: items });
    return items;
  },

  async get(route) {
    const normalizedRoute = String(route || '').trim();
    return (await this.all()).find((item) => item.route === normalizedRoute) || null;
  },

  async upsert(entry) {
    return this.upsertMany([entry]);
  },

  async upsertMany(entries = []) {
    const items = await this.all();
    const index = new Map(items.map((item, itemIndex) => [item.route, itemIndex]));

    for (const entry of entries) {
      const route = String(entry?.route || '').trim();
      if (!route) {
        continue;
      }

      const itemIndex = index.get(route);
      const previous = typeof itemIndex === 'number' ? items[itemIndex] : null;
      const next = this.normalizeEntry(entry, previous);

      if (typeof itemIndex === 'number') {
        items[itemIndex] = next;
        continue;
      }

      items.push(next);
      index.set(route, items.length - 1);
    }

    await this.save(items);
    return items;
  },

  async setSyncable(route, syncable) {
    const entries = await this.setSyncableMany([route], syncable);
    return entries[0] || null;
  },

  async setSyncableMany(routes = [], syncable) {
    const normalizedRoutes = Array.from(
      new Set(
        (Array.isArray(routes) ? routes : [routes])
          .map((route) => String(route || '').trim())
          .filter(Boolean)
      )
    );

    if (normalizedRoutes.length === 0) {
      return [];
    }

    const items = await this.all();
    const index = new Map(items.map((item, itemIndex) => [item.route, itemIndex]));
    const updatedEntries = [];

    for (const route of normalizedRoutes) {
      const itemIndex = index.get(route);
      if (typeof itemIndex !== 'number') {
        continue;
      }

      const current = items[itemIndex];
      const next = this.normalizeEntry(
        {
          ...current,
          syncable,
        },
        current
      );

      items[itemIndex] = next;
      updatedEntries.push(next);
    }

    if (updatedEntries.length > 0) {
      await this.save(items);
    }

    return updatedEntries;
  },

  async setProtectedMany(routes = [], protectedValue) {
    const normalizedRoutes = Array.from(
      new Set(
        (Array.isArray(routes) ? routes : [routes])
          .map((route) => String(route || '').trim())
          .filter(Boolean)
      )
    );

    if (normalizedRoutes.length === 0) {
      return [];
    }

    const items = await this.all();
    const index = new Map(items.map((item, itemIndex) => [item.route, itemIndex]));
    const updatedEntries = [];

    for (const route of normalizedRoutes) {
      const itemIndex = index.get(route);
      if (typeof itemIndex !== 'number') {
        continue;
      }

      const current = items[itemIndex];
      const next = this.normalizeEntry(
        {
          ...current,
          protected: protectedValue,
          lastSyncedHash: '',
        },
        current
      );

      items[itemIndex] = next;
      updatedEntries.push(next);
    }

    if (updatedEntries.length > 0) {
      await this.save(items);
    }

    return updatedEntries;
  },

  async findSyncable(filters = {}) {
    const items = await this.all();
    return items.filter((item) => {
      if (!item.syncable) {
        return false;
      }

      if (filters.contentTypeUid && item.contentTypeUid !== filters.contentTypeUid) {
        return false;
      }

      if (Array.isArray(filters.routes) && filters.routes.length > 0 && !filters.routes.includes(item.route)) {
        return false;
      }

      return true;
    });
  },

  async pruneContentType(uid, keepRoutes = []) {
    const keep = new Set(keepRoutes);
    const items = await this.all();
    const removed = [];
    const next = items.filter((item) => {
      if (item.contentTypeUid !== uid) {
        return true;
      }

      if (keep.has(item.route)) {
        return true;
      }

      removed.push(item);
      return false;
    });

    if (removed.length > 0) {
      await this.save(next);
    }

    return removed;
  },

  async stats() {
    const items = await this.all();
    return {
      total: items.length,
      syncable: items.filter((item) => item.syncable).length,
      uploaded: items.filter((item) => item.syncStatus === 'uploaded').length,
      failed: items.filter((item) => item.status === 'error' || item.syncStatus === 'upload_failed').length,
    };
  },
});
