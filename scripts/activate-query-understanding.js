// Retain the old entry point, but never activate a legacy metric-intent archive.
require('./train-reviewed-nlu').main().catch(error=>{console.error(error.message);process.exitCode=1;});
