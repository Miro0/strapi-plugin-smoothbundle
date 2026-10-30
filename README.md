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


### File uploads and compression

All file types, including files without extensions, can be published. Supported
formats receive format-specific optimization; other files are preserved. Brotli
is limited to text files (including HTML and SVG) and fonts, and retained only
when it saves at least 10%. Raster images, audio, video and other binary formats
do not receive Brotli copies. Delivery uses
`br` when accepted by the client, otherwise the original bytes. Gzip sidecars
are no longer generated or selected.

Per-file limits (Free / Starter / Pro / Enterprise, base-2 units):

| Type | Free | Starter | Pro | Enterprise |
| --- | --- | --- | --- | --- |
| Images | 10 MB | 50 MB | 50 MB | 100 MB |
| Audio | 50 MB | 100 MB | 100 MB | 100 MB |
| Video | 50 MB | 250 MB | 500 MB | 1 GB |
| Other files | 100 MB | 500 MB | 1 GB | 5 GB |

Account storage quotas also apply. Uploads switch to bounded multipart transfers
at 90 MB, leaving room for HTTP request overhead. Text and font minifiers process
files up to 20 MB; larger files can still receive streaming Brotli compression.

The integration spools source downloads to temporary files and uploads large files in 8 MB parts. Temporary files are removed after success or failure.
