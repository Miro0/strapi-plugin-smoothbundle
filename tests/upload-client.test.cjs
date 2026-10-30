const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const createClient = require('../server/src/core/services/smooth-client');
function client() {
  return createClient({strapi:{plugin:()=>({service:()=>({get:async()=>({connected:true,accessToken:'test'}), getProject:async()=>({projectId:'test-project'})})})}});
}
const asset = {route:'/test.txt',filename:'test.txt',uploadTarget:{path:'/',filename:'test.txt'},body:Buffer.from('test')};
test('upload failures preserve string API errors and HTTP status; invalid 200 is not success', async () => {
  const original = global.fetch;
  try {
    for (const [makeResponse, expected] of [
      [()=>Response.json({error:'Asset too large. Max allowed 100 MB'},{status:413}), /Asset too large.*HTTP 413/],
      [()=>new Response('<html>Request Entity Too Large</html>',{status:413}), /HTTP 413/],
      [()=>Response.json({}), /did not confirm/],
      [()=>Response.json({results:[{fileName:'test.txt',success:false,response:{error:'Storage quota exceeded'}}]}), /Storage quota exceeded/],
    ]) {
      global.fetch=async()=>makeResponse();
      const result=await client().uploadAssets([asset],'cdn-connector');
      assert.equal(result.success,false);
      assert.match(result.results['/test.txt'].message,expected);
      assert.doesNotMatch(result.message,/<html>/);
    }
  } finally {global.fetch=original;}
});
test('upload success requires a confirmed asset ID', async () => {
  const original=global.fetch;
  global.fetch=async()=>Response.json({results:[{fileName:'test.txt',success:true,response:{asset:{id:'saved'}}}]});
  try {
    const result=await client().uploadAssets([asset],'cdn-connector');
    assert.equal(result.success,true);
    assert.equal(result.results['/test.txt'].assetId,'saved');
  } finally {global.fetch=original;}
});
test('150 MiB sync upload uses multipart parts and cleans the temporary source', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'strapi-client-'));
  const filePath=path.join(dir,'asset');
  const size=150*1024**2;
  const handle=await fs.open(filePath,'w'); await handle.truncate(size); await handle.close();
  const original=global.fetch;
  let bytes=0,parts=0;
  global.fetch=async(url,options)=>{
    const endpoint=new URL(url).pathname.split('/').pop();
    assert.notEqual(endpoint,'bulk');
    if(endpoint==='init') {assert.equal(JSON.parse(options.body).fileSize,size); return Response.json({token:'session'});}
    if(endpoint==='part') {assert.ok(options.body.length<=8*1024**2);bytes+=options.body.length;return Response.json({partNumber:++parts,etag:String(parts)});}
    assert.equal(endpoint,'complete'); return Response.json({asset:{id:'large-file'}});
  };
  try {
    const result=await client().uploadAssets([{...asset,body:{filePath,size,temporaryDirectory:dir}}],'cdn-connector');
    assert.equal(result.success,true);assert.equal(bytes,size);assert.equal(parts,19);
    await assert.rejects(fs.stat(filePath),{code:'ENOENT'});
  } finally {global.fetch=original;await fs.rm(dir,{recursive:true,force:true});}
});
