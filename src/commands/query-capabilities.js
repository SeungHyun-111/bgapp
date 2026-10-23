// Intent describes an action, never a metric, target, or grouping value.
const ACTION_INTENTS=Object.freeze(['query','modify_condition','add_condition','remove_condition','change_grouping','confirm','cancel']);
const SLOT_FIELDS=Object.freeze(['metric','period','target','scope','groupBy','productType']);
const actionIntents=new Set(ACTION_INTENTS);
module.exports={ACTION_INTENTS,SLOT_FIELDS,actionIntents};
