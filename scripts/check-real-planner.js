// LEGACY DISABLED 2026-10-27: preserved during Gemini migration.
// // Real model -> the same command/dialogue entry used by bi:command. No BI login.
// const fs=require('fs');
// const path=require('path');
// require('../src/planner/environment').loadEnvironment();
// const {createPlannerDialogue}=require('../src/planner/chat-dialogue');
// const {createCommandSystem}=require('../src/commands/handlers');
// const {QueryStore}=require('../src/commands/query-store');
// async function main(){
//   const directory=path.resolve(__dirname,'../data');
//   // Verification logs are kept separate from the user's real conversation history.
//   const store=new QueryStore(path.join(directory,'llm/verification'));
//   const dialogue=createPlannerDialogue({directory,store,onStatus:console.log});
//   const commands=createCommandSystem(store,{dialogue});
//   const sessions=[['레이델 26년 가중분 알려줘','브랜드 전체로','월별로','아니 25년','주문금액도 같이'],['9월 조직별 편성비중','문화서비스팀만 말고 조직들 다'],['9월 무형 편성비중'],['21일 8시 방송 보여줘','오후']];
//   const results=[];
//   try{
//     for(const session of sessions){
//       dialogue.reset();
//       for(const text of session){
//         const start=Date.now();const reply=await commands.execute(text,{mode:'talk'});
//         const e=dialogue.planner.lastEvent;
//         const result={text,elapsedMs:Date.now()-start,reply,plan:dialogue.planner.state.plan,pending:dialogue.planner.state.pending,validation:e.validation,error:e.error,tools:e.tools.map(t=>t.request)};
//         results.push(result);console.log(JSON.stringify(result));
//         fs.writeFileSync(path.join(directory,'llm/real-planner-check.json'),JSON.stringify(results,null,2));
//       }
//     }
//   }finally{dialogue.stop();}
// }
// main().catch(e=>{console.error(e);process.exitCode=1;});
throw Object.assign(new Error('Legacy local LLM path is disabled during Gemini migration.'), {code:'LEGACY_LLM_DISABLED'});
