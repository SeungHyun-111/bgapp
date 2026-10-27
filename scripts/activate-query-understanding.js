// LEGACY DISABLED 2026-10-27: preserved during Gemini migration.
// // Retain the old entry point, but never activate a legacy metric-intent archive.
// require('./train-reviewed-nlu').main().catch(error=>{console.error(error.message);process.exitCode=1;});
throw Object.assign(new Error('Legacy local LLM path is disabled during Gemini migration.'), {code:'LEGACY_LLM_DISABLED'});
