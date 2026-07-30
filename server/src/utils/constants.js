'use strict';

module.exports = {
  API_ACCELERATOR_UPLOAD_BATCH_SIZE: 20,
  BYPASS_HEADER: 'x-smoothcdn-api-accelerator-bypass',
  CDN_API_BASE_URL: 'https://api.smoothcdn.com',
  CDN_AUTH_API_BASE_URL: 'https://smoothcdn.com',
  CDN_CONNECTOR_OPTIMIZE_POLL_MS: 10 * 1000,
  CDN_CONNECTOR_UPLOAD_DEBOUNCE_MS: 15 * 1000,
  CDN_CONNECTOR_UPLOAD_BATCH_SIZE: 5,
  CDN_DELETE_URL: 'https://api.smoothcdn.com/delete/bulk',
  CDN_UPLOAD_URL: 'https://api.smoothcdn.com/upload/bulk',
  CDN_PUBLIC_HOST: 'https://cdn.smoothcdn.com',
  DEFAULT_DISCOVERY_PAGE_SIZE: 100,
  DEFAULT_SYNC_PAGE_SIZE: 50,
  MAX_DISCOVERY_PAGES: 1000,
  MAX_SYNC_PAGES: 1000,
  SCHEDULER_POLL_MS: 60 * 1000,
};
