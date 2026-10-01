import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { GalaxyHomepageRenderer } from '../web/src/galaxy/presentation.js';
import { planGalaxyLoads, readProgressBuffer } from '../web/src/galaxy/loading.js';

// Exercise the actual renderer scheduler, including repeated scrolls after all
// five galaxies have been prepared. Prepared resources must remain resident.
const renderer = Object.create(GalaxyHomepageRenderer.prototype);
Object.assign(renderer, {
  scrollY: 0, height: 100, desired: new Set(), pending: new Map(), assets: new Map(), failed: new Map(),
  sections: ['a', 'e', 'b', 'c', 'd'].map((name, i) => ({id:`galaxy-${name}`, top:i*200, height:100})),
});
let requested=[];
renderer.ensure=id=>requested.push(id);
renderer.syncResources([renderer.sections[0]]);
assert.deepEqual(requested,['galaxy-a'],'首屏下载期间不得预载屏外点云');
const loading=new AbortController();renderer.pending.set('galaxy-a',loading);
requested=[];renderer.syncResources([renderer.sections[0]]);
assert.deepEqual(requested,[],'下载和GPU预热期间不得重复请求');
renderer.pending.clear();renderer.assets.set('galaxy-a',{dispose(){assert.fail('浏览首页时不应释放已经准备好的银河')}});
requested=[];renderer.syncResources([renderer.sections[0]]);
assert.deepEqual(requested,['galaxy-e'],'首屏准备好后应后台加载后面的银河');
renderer.pending.set('galaxy-e',loading);renderer.scrollY=800;requested=[];renderer.syncResources([renderer.sections[4]]);
assert.deepEqual(requested,['galaxy-d'],'快速滚动优先准备新可见章节');
assert.equal(loading.signal.aborted,false,'滚动时应保留正在准备的银河');
assert.equal(renderer.assets.has('galaxy-a'),true,'离屏银河不能被释放');
renderer.pending.set('galaxy-d',new AbortController());requested=[];renderer.syncResources([renderer.sections[2]]);
assert.deepEqual(requested,[],'同时准备的银河不得超过两组');
renderer.pending.clear();
for(const section of renderer.sections)renderer.assets.set(section.id,{dispose(){assert.fail('已经准备好的银河被释放')}});
for(const section of [...renderer.sections].reverse()){
  renderer.scrollY=section.top;requested=[];renderer.syncResources([section]);
  assert.deepEqual(requested,[],'往返不应重载');assert.equal(renderer.assets.size,5);
}
const order=renderer.sections.map(s=>s.id);
assert.deepEqual(planGalaxyLoads(order,['galaxy-a','galaxy-e'],new Map(),new Map(),new Map()),['galaxy-a','galaxy-e']);
assert.deepEqual(planGalaxyLoads(order,['galaxy-a'],new Map(),new Map(),new Map([['galaxy-a','error']])),['galaxy-e']);

const fractions=[];
const response=new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2]));c.enqueue(new Uint8Array([3,4,5,6]));c.enqueue(new Uint8Array([7,8]));c.close()}}),{headers:{'Content-Length':'8'}});
assert.deepEqual(new Uint8Array(await readProgressBuffer(response,p=>fractions.push(p))),new Uint8Array([1,2,3,4,5,6,7,8]));
assert.deepEqual(fractions,[.25,.75,.99],'进度应来自实际收到的字节，完整校验前不得报100%');
const unknown=[];await readProgressBuffer(new Response(new Uint8Array([1,2,3])),p=>unknown.push(p));
assert.deepEqual(unknown,[],'未知总长度时不得伪造百分比');
const interrupted=new Response(new ReadableStream({start(c){c.error(new DOMException('cancelled','AbortError'))}}));
await assert.rejects(readProgressBuffer(interrupted,()=>{}),{name:'AbortError'});

const root=new URL('../web/public/galaxy/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('galaxies/manifest.json',root),'utf8'));
let count=0,originalBytes=0,compressedBytes=0;
for(const entry of manifest.assets){
  const metadata=JSON.parse(await readFile(new URL(`${entry.directory}/metadata.json`,root),'utf8'));
  const specs=[...Object.values(metadata.stars.layers),...Object.values(metadata.nebula.layers),metadata.foreground];
  for(const spec of specs){
    const original=await readFile(new URL(`${entry.directory}/${spec.file}`,root));
    const compressed=await readFile(new URL(`../web/dist/galaxy/${entry.directory}/${spec.file}.gz`,import.meta.url));
    assert.equal(original.byteLength,spec.count*spec.stride*4);
    assert.deepEqual(gunzipSync(compressed),original,`${entry.assetId}/${spec.file} 无损还原`);
    originalBytes+=original.length;compressedBytes+=compressed.length;count++;
  }
}
assert.equal(count,35);
for(const entry of manifest.assets)for(const layout of ['desktop','mobile','wide']){
  const preview=await readFile(new URL(`previews/${entry.assetId}-${layout}.webp`,root));
  assert.equal(preview.subarray(0,4).toString(),'RIFF');assert.ok(preview.length>1000);
}
console.log(`银河加载检查通过：首屏优先、五组保留、并发限制、失败恢复、真实字节进度；${count} 个压缩文件逐字节还原一致，${originalBytes} → ${compressedBytes} 字节；15 张静态预览完整。`);
