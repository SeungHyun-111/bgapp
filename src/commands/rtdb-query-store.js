const {randomUUID}=require('crypto');
const {QueryStore}=require('./query-store');
const databaseURL='https://log1-b5bee-default-rtdb.asia-southeast1.firebasedatabase.app';
// Preserve readable field names while escaping RTDB-forbidden key characters.
// Percent is escaped too, so decoding never changes a literal %2E user key.
const encodeKey=key=>String(key).replace(/[%.$#\[\]\/\u0000-\u001f\u007f]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase().padStart(2,'0'));
function mapKeys(value,transform){
  if(Array.isArray(value))return value.map(v=>mapKeys(v,transform));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[transform(key),mapKeys(v,transform)]));
  return value;
}
class RtdbQueryStore extends QueryStore{
  constructor(directory,{url=databaseURL,fetchImpl=fetch}={}){
    super(directory);
    this.url=new URL('/usagi/conversationLogs/',url).toString();
    this.fetch=fetchImpl;this.storage='rtdb';
    this.file=this.eventsFile=this.conversationsFile='rtdb:usagi/conversationLogs';
  }
  async request(url,options={}){
    let response;
    try{response=await this.fetch(url,{...options,signal:AbortSignal.timeout(10000)});}
    catch{throw Object.assign(new Error('RTDB 대화 로그 서버에 연결하지 못했어.'),{code:'RTDB_NETWORK_ERROR'});}
    if(!response.ok)throw Object.assign(new Error(`RTDB 대화 로그 저장소 요청 실패 (HTTP ${response.status}).`),{code:'RTDB_REQUEST_FAILED',httpStatus:response.status});
    return response;
  }
  appendLine(_file,record){
    // A stable record ID makes PUT idempotent. Review/status events have their
    // own event ID so they cannot overwrite the conversation they refer to.
    const id=record.eventId||(record.recordType==='conversation'?(record.id||record.turnId):null)||randomUUID();
    const clean=JSON.parse(JSON.stringify(record));
    const body=JSON.stringify({record:mapKeys(clean,encodeKey),storage:{encoding:'percent-key-v1',writtenAt:{'.sv':'timestamp'}}});
    const task=this.queue.then(async()=>{
      await this.request(this.url+encodeURIComponent(encodeKey(id))+'.json?print=silent',{method:'PUT',headers:{'Content-Type':'application/json'},body});
    });
    this.queue=task.catch(()=>{});
    return task;
  }
  async readLines(){
    await this.queue;
    const response=await this.request(this.url.slice(0,-1)+'.json');
    const data=await response.json();
    return Object.values(data||{}).filter(item=>item&&item.record&&item.storage?.encoding==='percent-key-v1')
      .map(item=>mapKeys(item.record,key=>decodeURIComponent(key)))
      .sort((a,b)=>(Date.parse(a.timestamp)||0)-(Date.parse(b.timestamp)||0)||String(a.eventId||a.id||'').localeCompare(String(b.eventId||b.id||'')));
  }
}
module.exports={RtdbQueryStore};
