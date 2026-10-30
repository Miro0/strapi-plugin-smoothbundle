const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {downloadBody, cleanupBody, uploadMultipart} = require('../server/src/utils/streaming-upload');

test('105 MB source download and upload use bounded parts and verify SHA-256', async () => {
  const size = 105 * 1024 ** 2;
  let remaining = size;
  const response = new Response(new ReadableStream({pull(controller) {
    if (!remaining) { controller.close(); return; }
    const bytes = new Uint8Array(Math.min(1024 ** 2, remaining));
    remaining -= bytes.length; controller.enqueue(bytes);
  }}));
  response.arrayBuffer = () => {throw Error('Whole-file buffering is forbidden');};
  const body = await downloadBody(response);
  assert.equal(body.size, size);
  const originalFetch = global.fetch;
  let uploaded = 0, parts = 0;
  const hash = createHash('sha256');
  global.fetch = async (url, options) => {
    const endpoint = new URL(url).pathname.split('/').pop();
    if (endpoint === 'init') {
      assert.equal(JSON.parse(options.body).fileSize, size);
      return Response.json({token:'test'});
    }
    if (endpoint === 'part') {
      assert.ok(options.body.length <= 8 * 1024 ** 2);
      uploaded += options.body.length; hash.update(options.body);
      return Response.json({partNumber:++parts,etag:`part-${parts}`});
    }
    assert.equal(endpoint, 'complete');
    assert.equal(uploaded,size);
    assert.equal(JSON.parse(options.body).sha256,hash.digest('hex'));
    return Response.json({asset:{id:'saved'}});
  };
  try {
    const result = await uploadMultipart('https://example.test', 'test', 'project', {body,filename:'data.custom'});
    assert.equal(result.asset.id,'saved');
    assert.equal(parts,14);
  } finally {global.fetch=originalFetch; await cleanupBody(body);}
  await assert.rejects(fs.stat(body.filePath), {code:'ENOENT'});
});

test('failed multipart parts retry, abort the session and close the source', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'sb-test-'));
  const filePath = path.join(directory,'asset');
  await fs.writeFile(filePath,Buffer.alloc(1024));
  const originalFetch = global.fetch;
  let retries=0,aborted=false;
  global.fetch=async(url)=>{
    if(url.endsWith('/init'))return Response.json({token:'test'});
    if(url.endsWith('/abort')){aborted=true;return Response.json({success:true});}
    retries++; return Response.json({error:'temporary failure'},{status:503});
  };
  try {
    await assert.rejects(uploadMultipart('https://example.test','test','project',{body:{filePath,size:1024},filename:'data.bin'}),/temporary failure/);
    assert.equal(retries,3);assert.equal(aborted,true);
  } finally {global.fetch=originalFetch;await fs.rm(directory,{recursive:true,force:true});}
});
