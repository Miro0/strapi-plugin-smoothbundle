const {test} = require('node:test');
const assert = require('node:assert/strict');
const createController = require(process.env.SMOOTH_TEST_CONTROLLER || '../server/src/controllers/cdn-connector-controller');

function fixture({result = {success: true, job: {id: 'job-1', status: 'running'}}, enabled = true} = {}) {
  const starts = [], settingsUpdates = [];
  const mediaItems = [{id: 'media-1', syncStatus: 'pending'}];
  const services = {
    'module-registry': {async isEnabled() {return enabled;}},
    'cdn-connector-settings': {async update(value) {settingsUpdates.push(value);}},
    'cdn-connector-sync': {
      async startSyncJob(ids, options) {starts.push({ids, options}); return result;},
      async listMediaItems() {return mediaItems;},
    },
  };
  const controller = createController({strapi: {plugin() {return {service(name) {assert.ok(services[name], name); return services[name];}};}}});
  return {controller, starts, settingsUpdates, mediaItems, result};
}

test('Sync all Media Items returns the running job and enables automatic upload sync', async () => {
  const f = fixture();
  const ctx = {request: {body: {force: true}}};
  await f.controller.sync(ctx);
  assert.equal(ctx.status, 202);
  assert.deepEqual(ctx.body, {data: {result: f.result, job: f.result.job, mediaItems: f.mediaItems}});
  assert.deepEqual(f.starts, [{ids: [], options: {trigger: 'manual', force: true, markSyncable: true}}]);
  assert.deepEqual(f.settingsUpdates, [{autoSyncUploads: true}]);
});

test('single-item sync returns its job without enabling global automatic sync', async () => {
  const f = fixture();
  const ctx = {request: {body: {fileId: 'media-1', force: true}}};
  await f.controller.sync(ctx);
  assert.equal(ctx.status, 202);
  assert.deepEqual(f.starts[0].ids, ['media-1']);
  assert.deepEqual(ctx.body.data.job, f.result.job);
  assert.deepEqual(f.settingsUpdates, []);
});

for (const [name, result, status] of [
  ['already running', {success: false, busy: true, job: {id: 'active', status: 'running'}}, 409],
  ['rejected start', {success: false, message: 'Cannot start sync'}, 400],
]) {
  test(`${name} returns the expected status without throwing or changing settings`, async () => {
    const f = fixture({result});
    const ctx = {request: {body: {force: true}}};
    await f.controller.sync(ctx);
    assert.equal(ctx.status, status);
    assert.deepEqual(ctx.body.data.result, result);
    assert.deepEqual(ctx.body.data.job, result.job || null);
    assert.deepEqual(f.settingsUpdates, []);
  });
}

test('disabled connector rejects sync before starting a job', async () => {
  const f = fixture({enabled: false});
  const ctx = {request: {body: {}}};
  await f.controller.sync(ctx);
  assert.equal(ctx.status, 400);
  assert.match(ctx.body.error.message, /Enable the CDN Connector/);
  assert.deepEqual(f.starts, []);
  assert.deepEqual(f.settingsUpdates, []);
});
