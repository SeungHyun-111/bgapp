const base=require('./turn-schema.json');
const plan=require('./plan-schema.json');

function turnContract(){
  const branch=(action,keys,required=[])=>({type:'object',additionalProperties:false,required:['action',...required],properties:{action:{type:'string',enum:[action]},...Object.fromEntries(keys.map(k=>[k,structuredClone(base.properties[k])]))}});
  const query=branch('new',['patch','interpretation'],['patch']);
  query.properties.patch=structuredClone(plan);
  delete query.properties.patch.$schema;delete query.properties.patch.title;
  // Execution completeness is a contract, not text interpretation.
  query.properties.patch.oneOf=[
    {properties:{operation:{enum:['aggregate']},metrics:{minItems:1},fields:{maxItems:0}}},
    {properties:{operation:{enum:['list']},fields:{minItems:1},metrics:{maxItems:0},groupBy:{maxItems:0}}}
  ];
  return {oneOf:[query,
    ...['modify','add'].map(a=>branch(a,['patch','interpretation'],['patch'])),
    branch('remove',['remove','removeFilters','patch','interpretation']),
    branch('confirm',['interpretation']),branch('cancel',['interpretation']),
    branch('clarify',['question','options','patch','interpretation'],['question']),
    {type:'object',additionalProperties:false,required:['action','message'],properties:{action:{type:'string',enum:['reply']},message:{type:'string',minLength:1,maxLength:1500}}}
  ]};
}
function responseContract(definitions){return {oneOf:[...turnContract().oneOf,{type:'object',additionalProperties:false,required:['tool'],properties:{tool:{type:'object',additionalProperties:false,required:['name','arguments'],properties:{name:{type:'string',enum:definitions.map(t=>t.name)},arguments:{type:'object'}}}}}]};}
module.exports={turnContract,responseContract};
