# Smooth Bundle for Strapi

Smooth Bundle for Strapi is a modular plugin that connects Strapi media and API assets with Smooth Bundle for faster delivery, optimization, and scalable asset pipelines.

## Features

- **CDN Connector**
  - Sync Strapi media assets with Smooth Bundle
  - Sync image variants
  - Generate direct Smooth Bundle delivery links


- **API Accelerator**
  - Discover Strapi Content API endpoints
  - Sync JSON snapshots to Smooth Bundle
  - Automatically resync snapshots when content changes
  - Protect selected API endpoints with token

## Requirements

- Strapi 5
- Node.js 18 or newer

## Installation

Install the plugin in your Strapi project:

```
npm install strapi-plugin-smoothbundle
```

Enable the plugin in config/plugins.js:

```js
module.exports = {
  smoothbundle: {
    enabled: true,
  },
};
```

Or in config/plugins.ts:

```js
export default () => ({
  smoothbundle: {
    enabled: true,
  },
});
```

Restart Strapi and open the Smooth Bundle plugin from the admin sidebar.

## License

MIT
