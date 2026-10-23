const {SLOT_FIELDS}=require('./query-capabilities');
// Canonicalize a model-extracted FIELD, not an utterance or intent. The same
// surface word can be a BI metric elsewhere, so keep namespaces separate.
const fieldAliases={target:['대상','대상조건','팀','팀조건','브랜드','브랜드조건'],period:['기간','기간조건','연도','월'],groupBy:['집계','월별집계','그룹','그룹기준'],productType:['유무형','유무형필터'],metric:['지표','모든지표','항목'],scope:['범위','범위조건']};
const compact=text=>String(text||'').replace(/\s/g,'');
function canonicalField(value,surface){
 if(SLOT_FIELDS.includes(value))return value;
 for(const [field,aliases] of Object.entries(fieldAliases))if(aliases.includes(compact(surface))||aliases.includes(compact(value)))return field;
 return null;
}
module.exports={canonicalField};
