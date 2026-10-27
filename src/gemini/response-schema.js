// Gemini structured-output envelope. Business/formula semantics remain in the
// existing validateOutput/prepareAnalysis validators, not in this schema.
// API schema subset: https://ai.google.dev/gemini-api/docs/structured-output
const string={type:'string'};
const nullableString={type:['string','null']};
const array=items=>({type:'array',items});
const object=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const ref=name=>({$ref:'#/$defs/'+name});

function createResponseSchema(contract){
  const period=object({start:string,endExclusive:string,timezone:{type:'string',enum:['Asia/Seoul']}},['start','endExclusive']);
  const target=object({type:{type:'string',enum:Object.keys(contract.targets)},value:{anyOf:[string,array(string),{type:'null'}]},values:array(string),requestedName:string,status:string},['type']);
  const scalar={type:['string','number','boolean','null']};
  const filter=object({field:string,operator:{type:'string',enum:contract.filters.operators},value:{anyOf:[scalar,array(scalar)]},conditions:array(ref('filter'))},['operator']);
  const formula={anyOf:[{type:'number'},object({operator:{type:'string',enum:contract.formula.operators},field:string,dataset:string,scope:{type:'string',enum:['query','selected_scope','selected_target_and_filters','group','all']},arguments:array(ref('formula')),id:string,direction:{type:'string',enum:['asc','desc']},ties:{type:'string',enum:['dense','competition']}},['operator'])]};
  const dataset=object({id:string,period,target,targets:array(target),filters:array(ref('filter')),requiredFields:array(string)},['id']);
  const calculation=object({id:string,label:string,formula:ref('formula'),format:{type:'string',enum:['number','percent','text']},unit:string,decimals:{type:'integer',minimum:0,maximum:20}},['id','formula']);
  const properties={
    period,target,targets:array(target),filters:array(ref('filter')),requiredFields:array(string),
    datasets:{...array(dataset),minItems:1},dataset:string,
    groupBy:array({anyOf:[string,object({field:string,unit:{type:'string',enum:['value','year','month','day','hour']}},['field'])]}),
    calculations:{...array(calculation),minItems:1},formula:ref('formula'),metricLabel:string,outputFormat:{type:'string',enum:['number','percent','text']},
    sort:array(object({field:string,direction:{type:'string',enum:['asc','desc']}},['field'])),
    having:array(object({field:string,operator:{type:'string',enum:['gt','gte','lt','lte','eq','ne','not_null','is_null']},value:scalar},['field','operator'])),
    limit:{type:'integer',minimum:1},includeTies:{type:'boolean'},
  };
  const conversation=reset=>object({mode:{type:'string',enum:['new','continue']},reset:reset?{type:'boolean'}:{type:'boolean',enum:[false]}},['mode']);
  const envelope=(action,plan,message,responseTemplate)=>object({
    action:{type:'string',enum:[action]},conversation:conversation(action==='reply'),message,plan,responseTemplate,
  },['action','conversation','message','plan','responseTemplate']);
  return {
    anyOf:[
      envelope('reply',{type:'null'},string,{type:'null'}),
      envelope('clarify',{anyOf:[ref('partialPlan'),{type:'null'}]},string,{type:'null'}),
      envelope('execute',ref('completePlan'),nullableString,string),
    ],
    $defs:{
      filter,formula,partialPlan:object(properties),
      // Keep both the modern datasets/calculations and the current legacy
      // period/formula combinations. Dataset period inheritance is validated
      // by prepareAnalysis, as are operator arity and response placeholders.
      completePlan:{anyOf:[
        object(properties,['datasets','calculations']),object(properties,['period','calculations']),
        object(properties,['datasets','formula']),object(properties,['period','formula']),
      ]},
    },
  };
}
module.exports={createResponseSchema};
