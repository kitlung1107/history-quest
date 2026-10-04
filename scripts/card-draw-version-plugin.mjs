import fs from 'node:fs';
import path from 'node:path';
import {buildCardCatalog} from './card-catalog.mjs';
/** Same validated CMS snapshot feeds the built page and existing publisher. */
export function cardDrawVersionPlugin(root){
  const source=path.join(root,'client/src/content/settings/cards.json');
  const id='\0virtual:card-draw-catalog';
  return {name:'card-draw-catalog-version',
    resolveId(value){if(value==='virtual:card-draw-catalog')return id;},
    load(value){if(value!==id)return;this.addWatchFile(source);const catalog=buildCardCatalog(JSON.parse(fs.readFileSync(source,'utf8')));
      return `export const CLIENT_CARD_CATALOG_HASH=${JSON.stringify(catalog.sourceSha256)}; export const CLIENT_CARD_DRAW_PRICE=${catalog.drawPrice};`;},
    handleHotUpdate(context){if(context.file===source){const module=context.server.moduleGraph.getModuleById(id);if(module)context.server.moduleGraph.invalidateModule(module);context.server.ws.send({type:'full-reload'});return[];}}
  };
}
