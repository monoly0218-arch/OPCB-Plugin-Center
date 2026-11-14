import {readFile} from 'node:fs/promises';
import {bundleStyles} from '../design-system/v3/scripts/build-styles.mjs';
export async function knowledgeDesign({includeAdmin=false}={}){
 const {css,assets}=await bundleStyles();
 const admin=includeAdmin?await readFile(new URL('../src/knowledge/admin-ui.css',import.meta.url),'utf8'):'';
 const adaptation=await readFile(new URL('../src/knowledge/reader-ui.css',import.meta.url),'utf8');
 return {OPCB_KNOWLEDGE_UI_CSS:JSON.stringify(css+'\n'+adaptation+(admin?'\n'+admin:'')),OPCB_KNOWLEDGE_UI_ASSETS:JSON.stringify(assets)};
}
