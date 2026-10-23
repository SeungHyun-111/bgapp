const fs=require('fs');
const path=require('path');
const {extractRows}=require('../power-bi-search');
class EntityCatalog {
  constructor(file) {
    this.file=file;this.entities=[];this.updatedAt=null;this.pending=null;this.loaded=false;
    try {const data=JSON.parse(fs.readFileSync(file,'utf8'));if(data.version===2 && Array.isArray(data.entities)) {this.entities=data.entities;this.updatedAt=data.updatedAt;this.loaded=true;}} catch {}
  }
  async ensure(bridge,{force=false}={}) {
    if (!force && this.loaded && Date.now()-Date.parse(this.updatedAt)<24*3600000) return this.entities;
    if (this.pending) return this.pending;
    this.pending=this.refresh(bridge).finally(()=>{this.pending=null;});
    try{return await this.pending;}catch(error){if(this.entities.length && !force)return this.entities;throw error;}
  }
  async refresh(bridge) {
    const organizations=extractRows(await bridge.query("EVALUATE SUMMARIZE('BO', 'BO'[조직명], 'BO'[표준조직])"));
    const products=extractRows(await bridge.query("EVALUATE TOPN(20001, SUMMARIZE('BO', 'BO'[편성코드], 'BO'[대표상품명], 'BO'[브랜드]), 'BO'[편성코드], ASC, 'BO'[대표상품명], ASC, 'BO'[브랜드], ASC)"));
    const orgs=new Map(),items=new Map();
    for(const row of organizations) {
      const value=row['BO[조직명]'];if(typeof value!=='string'||!value.trim())continue;
      const standard=row['BO[표준조직]'];
      const canonical=typeof standard==='string'&&standard.trim()?standard:value;
      const field=typeof standard==='string'&&standard.trim()?'표준조직':'조직명';
      const id=field+'|'+canonical;
      if(!orgs.has(id))orgs.set(id,{kind:'organization',field,value:canonical,name:canonical,aliases:[]});
      orgs.get(id).aliases.push(value,canonical);
    }
    for(const row of products.slice(0,20000)) {
      const value=row['BO[편성코드]'];if(typeof value!=='string'||!value.trim())continue;
      if(!items.has(value))items.set(value,{kind:'product',field:'편성코드',value,name:value,aliases:[]});
      for(const field of ['대표상품명','브랜드']) {const alias=row[`BO[${field}]`];if(typeof alias==='string'&&alias.trim())items.get(value).aliases.push(alias);}
    }
    const entities=[...orgs.values(),...items.values()].map(e=>({...e,aliases:[...new Set(e.aliases)]}));
    const updatedAt=new Date().toISOString();
    await fs.promises.mkdir(path.dirname(this.file),{recursive:true});
    await fs.promises.writeFile(this.file,JSON.stringify({version:2,updatedAt,limited:products.length>20000,entities},null,2),'utf8');
    this.entities=entities;this.updatedAt=updatedAt;this.loaded=true;this.limited=products.length>20000;
    return entities;
  }
}
module.exports={EntityCatalog};
