const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const { containsCredential } = require('./privacy');
const {labelsFromPlan}=require('../learning/training-record');
const timestamp = () => new Date(Date.now() + 9 * 3600000).toISOString().replace('Z', '+09:00');

class QueryStore {
  constructor(directory) {
    this.directory = directory;
    this.file = path.join(directory, 'conversation-history.jsonl');
    this.eventsFile = this.file;
    this.conversationsFile = this.file;
    this.queue = Promise.resolve();
  }
  appendLine(file, record) {
    const task = this.queue.then(async () => {
      await fs.mkdir(this.directory, { recursive: true });
      await fs.appendFile(file, JSON.stringify(record) + '\n', { encoding: 'utf8', mode: 0o600 });
    });
    this.queue = task.catch(() => {});
    return task;
  }
  async append(input, source = 'talk') {
    if (typeof input !== 'string' || !input.trim() || input.length > 2000) throw Error('입력 길이를 확인해주세요.');
    if (containsCredential(input)) return { blocked: true };
    const record = { recordType:'conversation', id: randomUUID(), timestamp: timestamp(), input: input.trim(), status: 'unhandled', source };
    await this.appendLine(this.file, record);
    return { id: record.id, status: record.status };
  }
  async readLines(file) {
    let value;
    try { value = await fs.readFile(file, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    return value.split(/\r?\n/).filter(Boolean).map((line, index) => {
      try { return JSON.parse(line); } catch { throw Error('학습 노트의 JSON 형식을 확인해주세요. 줄: ' + (index + 1)); }
    });
  }
  async appendConversation(input, result, context, interpretation = {}) {
    if (containsCredential(input)) return {blocked:true};
    const record={recordType:'conversation',id:randomUUID(),timestamp:timestamp(),input,reply:result.message,source:'talk',status:result.saved?'unhandled':'recorded',
      outcome:result.outcome||(result.retryable?'error':result.saved?'unhandled':'reply'),
      ...interpretation,
      finalQuery:{target:context.target,metrics:context.metrics,period:context.period,groupBy:context.groupBy,filters:context.filters},
      context:{target:context.target,metrics:context.metrics,period:context.period,groupBy:context.groupBy,filters:context.filters,pending:context.pending}};
    await this.appendLine(this.conversationsFile,record);
    return {id:record.id};
  }
  async list() {
    await this.queue;
    const all = await this.readLines(this.file);
    const records = all.filter(r=>r.recordType!=='status_event'&&(r.status==='unhandled'||r.outcome==='unhandled'));
    const changes = all.filter(r=>r.recordType==='status_event');
    const latest = new Map(changes.map(event => [event.id, event]));
    return records.map(record => latest.has(record.id) ? { ...record, status: 'converted', convertedIntent: latest.get(record.id).convertedIntent, convertedAt: latest.get(record.id).timestamp } : record);
  }
  async conversations({review='all',training='all'}={}) {
    if(!['all','reviewed','unreviewed'].includes(review)||!['all','used','not_used'].includes(training))throw Error('Unknown history filter');
    await this.queue;
    const all=await this.readLines(this.file);
    const reviews=new Map(all.filter(r=>r.recordType==='review_event').map(r=>[r.id,r]));
    const confirmations=new Map(all.filter(r=>r.recordType==='training_review_event').map(r=>[r.id,r]));
    const retracted=new Set(all.filter(r=>r.recordType==='model_usage_retraction').map(r=>r.eventId));
    const usage=all.filter(r=>r.recordType==='model_usage_event'&&!retracted.has(r.eventId));
    return all.filter(r=>typeof r.input==='string').map(record=>{
      const checked=reviews.get(record.id),runs=usage.filter(r=>r.id===record.id);
      const confirmation=confirmations.get(record.id);
      const training=confirmation?{confirmed:['confirmed','corrected_confirmed'].includes(confirmation.status),finalPlan:confirmation.finalPlan,labels:confirmation.labels,confirmation:{status:confirmation.status,reason:confirmation.reason,reviewer:confirmation.reviewer,timestamp:confirmation.timestamp,eventId:confirmation.eventId},correction:confirmation.correction}:{};
      const trainingRuns=runs.filter(r=>r.role==='training'),evaluationRuns=runs.filter(r=>r.role==='evaluation');
      return {...record,...training,reviewStatus:checked?'reviewed':'unreviewed',reviewCategory:checked?.category,reviewedAt:checked?.timestamp,reviewSource:checked?.annotationFile,reviewVersion:checked?.annotationVersion,trainingStatus:trainingRuns.length?'used':'not_used',trainingRuns,evaluationRuns};
    }).filter(r=>(review==='all'||r.reviewStatus===review)&&(training==='all'||r.trainingStatus===training));
  }
  async reviewTraining({id,status,finalPlan=null,reason,reviewer,correction=null}) {
    if(!['confirmed','corrected_confirmed','incorrect','excluded','unreviewed'].includes(status))throw Error('Unknown training review status');
    if(![reason,reviewer].every(v=>typeof v==='string'&&v.trim()))throw Error('Review reason and reviewer are required');
    const record=(await this.conversations()).find(r=>r.id===id);
    if(!record)throw Error('Conversation not found');
    const confirmed=['confirmed','corrected_confirmed'].includes(status);
    if(confirmed&&(!finalPlan||typeof finalPlan!=='object'||Array.isArray(finalPlan)))throw Error('Explicit final plan is required');
    if(status==='corrected_confirmed'&&(typeof correction!=='string'||!correction.trim()))throw Error('Correction description is required');
    // Append-only provenance: correcting or withdrawing a review preserves history.
    const event={recordType:'training_review_event',eventId:randomUUID(),id,timestamp:timestamp(),status,reason,reviewer,correction,finalPlan:confirmed?structuredClone(finalPlan):null,labels:confirmed?labelsFromPlan(finalPlan):null};
    await this.appendLine(this.file,event);
    return event;
  }
  async markReviewed({id,category,annotationFile,annotationVersion}) {
    if(![id,category,annotationFile,annotationVersion].every(v=>typeof v==='string'&&v.trim()))throw Error('Review provenance is required');
    const record=(await this.conversations()).find(r=>r.id===id);
    if(!record)throw Error('Conversation not found');
    if(record.reviewVersion===annotationVersion&&record.reviewCategory===category)return {changed:false};
    await this.appendLine(this.file,{recordType:'review_event',eventId:randomUUID(),id,timestamp:timestamp(),category,annotationFile,annotationVersion});
    return {changed:true};
  }
  async markModelUsage({ids,role,modelVersion,datasetVersion}) {
    if(!['training','evaluation'].includes(role)||!Array.isArray(ids)||!ids.length||![modelVersion,datasetVersion].every(v=>typeof v==='string'&&v.trim()))throw Error('Completed model run metadata is required');
    const records=await this.conversations();
    if(ids.some(id=>!records.some(r=>r.id===id&&r.reviewStatus==='reviewed')))throw Error('Model usage requires reviewed source conversations');
    for(const id of new Set(ids)){
      const record=records.find(r=>r.id===id);
      if([...record.trainingRuns,...record.evaluationRuns].some(r=>r.role===role&&r.modelVersion===modelVersion&&r.datasetVersion===datasetVersion))continue;
      await this.appendLine(this.file,{recordType:'model_usage_event',eventId:randomUUID(),id,timestamp:timestamp(),role,modelVersion,datasetVersion});
    }
  }
  async markConverted(id, intent) {
    if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(intent || '')) throw Error('Intent 이름은 대문자 영문과 밑줄로 입력해주세요.');
    if (!(await this.list()).some(record => record.id === id)) throw Error('해당 질문 ID를 찾을 수 없습니다.');
    await this.appendLine(this.eventsFile, {recordType:'status_event', id, timestamp: timestamp(), status: 'converted', convertedIntent: intent });
  }
}
module.exports = { QueryStore };
