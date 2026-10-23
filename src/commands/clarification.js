function editDistance(a,b){
  let row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=0;i<a.length;i++){const next=[i+1];for(let j=0;j<b.length;j++)next[j+1]=Math.min(next[j]+1,row[j+1]+1,row[j]+(a[i]===b[j]?0:1));row=next;}return row[b.length];
}
function yearSuggestions(input,now){
  const value=input.match(/\d+\s*년/)?.[0].replace(/\D/g,'');if(!value)return [];
  const current=new Date(now.getTime()+9*3600000).getUTCFullYear();
  return Array.from({length:201},(_,i)=>1900+i).map(year=>({year,distance:editDistance(value,String(year))})).filter(item=>item.distance===1).sort((a,b)=>Math.abs(a.year-current)-Math.abs(b.year-current)||a.year-b.year).slice(0,3).map(({year})=>({label:`${year}년`,input:input.replace(/\d+\s*년/,`${year}년`)}));
}
function clarificationMessage(question,options=[]){return question+(options.length?'\n'+options.map((option,i)=>`${i+1}. ${option.label}`).join('\n')+'\n번호로 고르거나, 원하는 뜻을 말해줘 🐰':'');}
module.exports={yearSuggestions,clarificationMessage};
