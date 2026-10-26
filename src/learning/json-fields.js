// Structured JSON addressing only. No user-language parsing belongs here.
const forbidden=new Set(['__proto__','prototype','constructor']);
function parts(pointer){
  if(typeof pointer!=='string'||!pointer.startsWith('/')||pointer.length>500)throw Error('Invalid JSON pointer');
  const keys=pointer.slice(1).split('/').map(k=>k.replace(/~1/g,'/').replace(/~0/g,'~'));
  if(keys.some(k=>!k||forbidden.has(k)))throw Error('Unsafe JSON pointer');
  return keys;
}
function get(value,pointer){for(const key of parts(pointer)){if(value==null||Array.isArray(value)&&!/^(0|[1-9]\d*)$/.test(key)||!Object.hasOwn(value,key))return undefined;value=value[key];}return value;}
function set(value,pointer,replacement){const keys=parts(pointer);let parent=value;for(const key of keys.slice(0,-1)){if(parent==null||!Object.hasOwn(parent,key))throw Error('Missing field');parent=parent[key];}parent[keys.at(-1)]=structuredClone(replacement);}
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const scalar=v=>v===null||['string','number','boolean'].includes(typeof v);
module.exports={parts,get,set,equal,scalar};
