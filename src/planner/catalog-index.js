const normalize=s=>String(s||'').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim();
function grams(text){const s=normalize(text).replace(/\s/g,'');return new Set(s.length<2?[s]:Array.from({length:s.length-1},(_,i)=>s.slice(i,i+2)));}
// Generic lexical retrieval only. Scores never select a BI metric or plan.
function rankDocuments(documents,query){
  const q=normalize(query),tokens=q.split(/[^\p{L}\p{N}_]+/u).filter(Boolean),qg=grams(q);
  return documents.map((document,index)=>{
    const title=normalize([document.label,...(document.aliases||[])].join(' '));
    const text=normalize([title,document.description,JSON.stringify(document.definition||'')].join(' '));
    const dg=grams(text);let overlap=0;for(const g of qg)if(dg.has(g))overlap++;
    const score=(title.includes(q)?4:0)+tokens.filter(t=>text.includes(t)).length*2+overlap/Math.max(1,qg.size);
    return {document,index,score};
  }).sort((a,b)=>b.score-a.score||a.index-b.index);
}
module.exports={rankDocuments};
