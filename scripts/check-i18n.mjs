#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
const locales = ['common','auth','nav','dashboard','students','attendance','homework','exams','portal','settings','chat','lessons','game','dictionary'];
function flat(o,pref=''){ let out={}; for(let k in o){ let key=pref?pref+'.'+k:k; if(typeof o[k]==='object'&&o[k]!==null&&!Array.isArray(o[k])) Object.assign(out, flat(o[k],key)); else out[key]=o[k]; } return out; }
let failed=false;
for(let ns of locales){
  let en=JSON.parse(fs.readFileSync(path.join('src/locales/en', ns+'.json'),'utf8'));
  let uz=JSON.parse(fs.readFileSync(path.join('src/locales/uz', ns+'.json'),'utf8'));
  let fe=flat(en), fu=flat(uz);
  let missing=Object.keys(fe).filter(k=>!(k in fu));
  let empty=Object.keys(fu).filter(k=>!fu[k]||String(fu[k]).trim()==='');
  if(missing.length){ console.error(`[i18n] ${ns}: MISSING ${missing.length}: ${missing.slice(0,20).join(', ')}`); failed=true; }
  if(empty.length){ console.error(`[i18n] ${ns}: EMPTY ${empty.length}: ${empty.slice(0,20).join(', ')}`); failed=true; }
}
if(failed) process.exit(1);
console.log('[i18n] All namespaces have complete UZ coverage.');
