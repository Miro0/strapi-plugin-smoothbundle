const {test} = require('node:test');
const assert = require('node:assert/strict');
const createSync = require('../server/src/modules/cdn-connector/services/sync');
const createRuntime = require('../server/src/modules/cdn-connector/services/runtime-state');
const {cleanupBody} = require('../server/src/utils/streaming-upload');
function fixture({failure=false, crash=false}={}) {
  let state={}, uploads=0;
  const records=new Map(), logs=[];
  const settings={lastSyncAt:'2026-10-29T00:00:00Z',syncAllFormats:false,offloadLocalFiles:false};
  const services={
    'module-registry':{isEnabled:async()=>true},
    'core-settings':{get:async()=>({userPlan:1})},
    'cdn-connector-settings':{getResolved:async()=>settings,get:async()=>settings,touch:async()=>{}},
    'cdn-connector-repository':{
      all:async()=>Array.from(records.values()),
      upsert:async(row)=>records.set(row.fileId,{...records.get(row.fileId),...row}),
      upsertMany:async(rows)=>{for(const row of rows) await services['cdn-connector-repository'].upsert(row);},
    },
    'cdn-connector-offload':{invalidateCache(){}},
    'smooth-client':{
      getProjectAssets:async()=>({success:true,data:[{id:'existing',fileName:'test.txt',path:'/',updatedAt:'2026-10-30T00:00:00Z'}]}),
      buildPublicUrlForUploadTarget:()=>'',
      uploadAssets:async(assets)=>{
        uploads+=assets.length;
        const results={};
        for(const asset of assets) {
          results[asset.route]=failure?{success:false,message:'Asset too large (HTTP 413)'}:{success:true,assetId:'saved'};
          await cleanupBody(asset.body);
        }
        return {success:!failure,results};
      },
    },
  };
  const strapi={
    store:()=>({get:async()=>state,set:async({value})=>{state=value;}}),
    log:{error:message=>logs.push(message),warn:message=>logs.push(message)},
    config:{get:key=>({'server.host':'127.0.0.1','server.port':1337}[key])},
    db:{query:()=>({findMany:async()=>{
      if(crash) throw new Error('Media query failed');
      return [{id:85,name:'test.txt',url:'/uploads/test.txt',mime:'text/plain',ext:'.txt',updatedAt:'2026-10-28T00:00:00Z'}];
    }})},
    plugin:name=>({service:key=>name==='upload'?{signFileUrls:async(file)=>file}:services[key]}),
  };
  services['cdn-connector-runtime-state']=createRuntime({strapi});
  return {sync:createSync({strapi}),records,logs,get uploads(){return uploads;}};
}
test('forced sync uploads a matching CDN file despite timestamp-based skipping',async()=>{
  const original=global.fetch;global.fetch=async()=>new Response('source');
  try {
    for(const force of [false,true]) {
      const f=fixture();
      const result=await f.sync.syncMediaItems(['85'],{force,markSyncable:true});
      assert.equal(f.uploads,force?1:0);
      assert.equal(result.synced,force?1:0);
      if(force) assert.equal(f.records.get('85').syncStatus,'uploaded');
    }
  } finally {global.fetch=original;}
});
test('individual upload failures remain in job state, media record and application logs',async()=>{
  const original=global.fetch;global.fetch=async()=>new Response('source');
  try {
    const f=fixture({failure:true});
    await f.sync.syncMediaItems(['85'],{force:true,markSyncable:true});
    const job=await f.sync.getSyncJobStatus();
    assert.equal(job.status,'failed');
    assert.match(job.failedEntries[0].message,/HTTP 413/);
    assert.match(f.records.get('85').lastError,/HTTP 413/);
    assert.ok(f.logs.some(message=>message.includes('85')&&message.includes('HTTP 413')));
  } finally {global.fetch=original;}
});
test('background job exceptions are logged and persisted for UI polling',async()=>{
  const f=fixture({crash:true});
  assert.equal((await f.sync.startSyncJob([],{force:true})).success,true);
  let job;
  for(let i=0;i<30;i++) {
    await new Promise(resolve=>setImmediate(resolve));
    job=await f.sync.getSyncJobStatus();
    if(job.status==='failed')break;
  }
  assert.equal(job.status,'failed');assert.match(job.errorMessage,/Media query failed/);
  assert.ok(f.logs.some(message=>message.includes('Media query failed')));
});
