import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { buildCardCatalog, catalogFields } from './card-catalog.mjs';
import {cardDrawVersionPlugin} from './card-draw-version-plugin.mjs';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const boy = { id: 'future-boy', role: 'studentBoy', enabled: true, image: '/art.png' };
const girl = { id: 'future-girl', role: 'studentGirl', enabled: false };
test('snapshot includes only trusted metadata; adding/removing cards requires no ID code changes', () => {
  const first = buildCardCatalog({ cards: [boy] });
  assert.deepEqual(first.cards, { 'future-boy': { role: 'studentBoy', enabled: true, drawEnabled: true } });
  const next = buildCardCatalog({ cards: [girl, boy] });
  assert.deepEqual(next, buildCardCatalog({ cards: [boy, girl] }));
  assert.notEqual(next.sourceSha256, first.sourceSha256);
  assert.deepEqual(Object.keys(buildCardCatalog({ cards: [girl] }).cards), ['future-girl']);
  assert.equal(catalogFields(next).cards.mapValue.fields['future-girl'].mapValue.fields.enabled.booleanValue, false);
});
test('malformed and duplicate entries fail before any credential or network use', () => {
  for (const cards of [[], [boy, boy], [{ ...boy, id: '../bad' }], [{ ...boy, enabled: 'true' }], [{ ...boy, role: 'admin' }]])
    assert.throws(() => buildCardCatalog({ cards }));
});
test('default CLI is offline dry-run even with unusable emulator/credential environment', () => {
  const output = execFileSync(process.execPath, ['scripts/sync-card-catalog.mjs'], { encoding: 'utf8', env: {
    ...process.env, FIRESTORE_EMULATOR_HOST: 'not-a-real-host:1', GOOGLE_APPLICATION_CREDENTIALS: 'missing-file',
  } });
  const plan = JSON.parse(output);
  assert.equal(plan.mode, 'dry-run');
  assert.equal(plan.network, false);
  assert.equal(plan.target, 'cardCatalog/current');
  assert.ok(Object.keys(plan.replacement.cards).length >= 4);
});

test('price, availability and renderer assignments each invalidate a loaded page version',()=>{
  const first=buildCardCatalog({cards:[boy]}).sourceSha256;
  for(const patch of [{name:'New title'},{image:'/new-art.png'},{edition:'new-edition'},{backgroundId:'new-background'},{drawEnabled:false},{enabled:false}])
    assert.notEqual(buildCardCatalog({cards:[{...boy,...patch}]}).sourceSha256,first);
  assert.notEqual(buildCardCatalog({cards:[boy],drawPrice:101}).sourceSha256,first);
  for(const drawPrice of [0,-1,1.5,100001])assert.throws(()=>buildCardCatalog({cards:[boy],drawPrice}));
});

test('Vite embeds the same publisher hash and price; CMS edits invalidate cached virtual version',async()=>{
  const root=mkdtempSync(path.join(tmpdir(),'draw-version-test-'));
  try{
    const directory=path.join(root,'client/src/content/settings');mkdirSync(directory,{recursive:true});
    const source=path.join(directory,'cards.json'),settings={cards:[boy],drawPrice:123};writeFileSync(source,JSON.stringify(settings));
    const plugin=cardDrawVersionPlugin(root),id=plugin.resolveId('virtual:card-draw-catalog'),watched=[];
    const code=plugin.load.call({addWatchFile:file=>watched.push(file)},id);
    const version=await import('data:text/javascript,'+encodeURIComponent(code));
    assert.equal(version.CLIENT_CARD_CATALOG_HASH,buildCardCatalog(settings).sourceSha256);assert.equal(version.CLIENT_CARD_DRAW_PRICE,123);assert.deepEqual(watched,[source]);
    const module={id},invalidated=[],messages=[];
    assert.deepEqual(plugin.handleHotUpdate({file:source,server:{moduleGraph:{getModuleById:key=>key===id?module:undefined,invalidateModule:value=>invalidated.push(value)},ws:{send:value=>messages.push(value)}}}),[]);
    assert.deepEqual(invalidated,[module]);assert.deepEqual(messages,[{type:'full-reload'}]);
  }finally{assert(root.startsWith(path.resolve(tmpdir())+path.sep));rmSync(root,{recursive:true,force:true});}
});
