'use strict';

module.exports = [
  {
    method: 'GET',
    path: '/bootstrap',
    handler: 'core.bootstrap',
    config: {
      policies: [],
    },
  },
  {
    method: 'PUT',
    path: '/core/settings',
    handler: 'core.updateSettings',
    config: {
      policies: [],
    },
  },
  {
    method: 'POST',
    path: '/core/auth/start',
    handler: 'core.startLogin',
    config: {
      policies: [],
    },
  },
  {
    method: 'GET',
    path: '/core/auth/callback',
    handler: 'core.authCallback',
    config: {
      auth: false,
      policies: [],
    },
  },
  {
    method: 'POST',
    path: '/core/status-sync',
    handler: 'core.syncStatus',
    config: {
      policies: [],
    },
  },
  {
    method: 'POST',
    path: '/core/disconnect',
    handler: 'core.disconnect',
    config: {
      policies: [],
    },
  },
  {
    method: 'POST',
    path: '/core/purge-plugin-data',
    handler: 'core.purgePluginData',
    config: {
      policies: [],
    },
  },
  {
    method: 'POST',
    path: '/core/create-free-account',
    handler: 'core.createFreeAccount',
    config: {
      auth: false,
      policies: [],
    },
  },
  {
    method: 'GET',
    path: '/modules/:moduleId/project-token',
    handler: 'core.getProjectToken',
    config: {
      policies: [],
    },
  },
  {
    method: 'POST',
    path: '/modules/:moduleId/toggle',
    handler: 'core.toggleModule',
    config: {
      policies: [],
    },
  },
  {
    method: 'GET',
    path: '/modules/:moduleId/integrate/callback',
    handler: 'core.moduleProjectCallback',
    config: {
      auth: false,
      policies: [],
    },
  },
  {
    method: 'PUT',
    path: '/modules/api-accelerator/settings',
    handler: 'apiAccelerator.updateSettings',
    config: {
      policies: [],
    },
  },
  {
    method: 'POST',
    path: '/modules/api-accelerator/discover',
    handler: 'apiAccelerator.discover',
    config: {
      policies: [],
    },
  },
  {
    method: 'POST',
    path: '/modules/api-accelerator/sync',
    handler: 'apiAccelerator.sync',
    config: {
      policies: [],
    },
  },
  {
    method: 'GET',
    path: '/modules/api-accelerator/sync/status',
    handler: 'apiAccelerator.syncStatus',
    config: {
      policies: [],
    },
  },
  {
    method: 'POST',
    path: '/modules/api-accelerator/syncable',
    handler: 'apiAccelerator.setSyncable',
    config: {
      policies: [],
    },
  },
  {
    method: 'POST',
    path: '/modules/api-accelerator/protection',
    handler: 'apiAccelerator.setProtection',
    config: {
      policies: [],
    },
  },
  {
    method: 'POST',
    path: '/modules/api-accelerator/purge',
    handler: 'apiAccelerator.purge',
    config: {
      policies: [],
    },
  },
  {
    method: 'POST',
    path: '/modules/api-accelerator/accesses/grant',
    handler: 'apiAccelerator.grantAccess',
    config: {
      policies: [],
    },
  },
  {
    method: 'POST',
    path: '/modules/api-accelerator/accesses/revoke',
    handler: 'apiAccelerator.revokeAccess',
    config: {
      policies: [],
    },
  },
  {
    method: 'PUT',
    path: '/modules/cdn-connector/settings',
    handler: 'cdnConnector.updateSettings',
    config: {
      policies: [],
    },
  },
  {
    method: 'POST',
    path: '/modules/cdn-connector/sync',
    handler: 'cdnConnector.sync',
    config: {
      policies: [],
    },
  },
  {
    method: 'POST',
    path: '/modules/cdn-connector/unsync',
    handler: 'cdnConnector.unsync',
    config: {
      policies: [],
    },
  },
  {
    method: 'POST',
    path: '/modules/cdn-connector/protection',
    handler: 'cdnConnector.setProtection',
    config: {
      policies: [],
    },
  },
  {
    method: 'GET',
    path: '/modules/cdn-connector/media/:fileId/open',
    handler: 'cdnConnector.openAsset',
    config: {
      policies: [],
    },
  },
  {
    method: 'POST',
    path: '/modules/cdn-connector/accesses/grant',
    handler: 'cdnConnector.grantAccess',
    config: {
      policies: [],
    },
  },
  {
    method: 'POST',
    path: '/modules/cdn-connector/accesses/revoke',
    handler: 'cdnConnector.revokeAccess',
    config: {
      policies: [],
    },
  },
  {
    method: 'GET',
    path: '/modules/cdn-connector/sync/status',
    handler: 'cdnConnector.syncStatus',
    config: {
      policies: [],
    },
  },
  {
    method: 'GET',
    path: '/modules/cdn-connector/restore-assets',
    handler: 'cdnConnector.listRestorableAssets',
    config: {
      policies: [],
    },
  },
  {
    method: 'POST',
    path: '/modules/cdn-connector/restore-assets',
    handler: 'cdnConnector.restoreAsset',
    config: {
      policies: [],
    },
  },
];
