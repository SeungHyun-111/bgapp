const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { randomBytes, createHash } = require('crypto');
const net = require('net');
function localPort() {
  return new Promise((resolve,reject)=>{
    const server=net.createServer();server.on('error',reject);
    server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):resolve(port));});
  });
}

class RasaClient {
  constructor({idleMs=5*60*1000,modelPath=null}={}) {
    this.child = null;
    this.starting = null;
    this.token = randomBytes(24).toString('hex');
    this.base = null;
    this.idleMs=idleMs;
    this.idleTimer=null;
    this.inFlight=0;
    this.modelPath=modelPath;
  }
  async request(route, body, timeoutMs = 10000) {
    const response = await fetch(this.base + route + '?token=' + this.token, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw Error('Local NLU request failed');
    return response.json();
  }
  async start() {
    if (this.starting) return this.starting;
    if (this.child) { await this.request('/status'); return; }
    const root = path.resolve(__dirname, '../..');
    const python = path.join(root, '.venv-rasa/Scripts/python.exe');
    const model = this.modelPath || path.join(root, 'nlu/models/usagi.tar.gz');
    if (!fs.existsSync(python) || !fs.existsSync(model)) throw Object.assign(Error('Local NLU is not installed/trained'),{code:'NLU_NOT_INSTALLED'});
    this.modelVersion=createHash('sha256').update(fs.readFileSync(model)).digest('hex');
    this.tempDirectory = path.join(process.env.PUBLIC || 'C:/Users/Public', 'usagi-nlu-temp');
    fs.mkdirSync(this.tempDirectory, { recursive: true });
    this.starting = (async () => {
      const port=await localPort();
      this.base='http://127.0.0.1:'+port;
      const child = spawn(python, [path.join(root, 'nlu/run_rasa.py'), 'run', '--enable-api', '--interface', '127.0.0.1',
        '--port', String(port), '--auth-token', this.token, '--model', model], {
        cwd: path.join(root, 'nlu'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, SQLALCHEMY_SILENCE_UBER_WARNING: '1', RASA_TELEMETRY_ENABLED: 'false', PYTHONIOENCODING: 'utf-8', TEMP: this.tempDirectory, TMP: this.tempDirectory, TF_NUM_INTRAOP_THREADS:process.env.TF_NUM_INTRAOP_THREADS||'1',TF_NUM_INTEROP_THREADS:process.env.TF_NUM_INTEROP_THREADS||'1' },
      });
      this.child = child;
      child.stdout.on('data', () => {});
      child.stderr.on('data', () => {});
      if (process.env.USAGI_NLU_DEBUG === '1') {
        const log = path.join(root, 'nlu/runtime.log');
        for (const stream of [child.stdout, child.stderr]) stream.on('data', data => fs.appendFileSync(log, data));
      }
      let failed = false;
      child.on('error', () => { failed = true; });
      child.on('exit', () => { failed = true; if (this.child === child) this.child = null; });
      const deadline = Date.now() + 90000;
      while (Date.now() < deadline) {
        if (failed || this.child !== child) throw Error('Local NLU stopped');
        try { await this.request('/status', undefined, Math.min(1000, Math.max(1, deadline-Date.now()))); return; } catch {}
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      this.stop(); throw Object.assign(Error('Local NLU startup timed out'),{code:'NLU_START_TIMEOUT'});
    })().finally(() => { this.starting = null; });
    return this.starting;
  }
  armIdleTimer() {
    clearTimeout(this.idleTimer);
    if(this.inFlight||!this.child||this.idleMs<=0)return;
    this.idleTimer=setTimeout(()=>{if(!this.inFlight)this.stop();},this.idleMs);
    this.idleTimer.unref?.();
  }
  async parse(text) {
    if(this.child&&!this.starting&&!this.inFlight){
      const model=this.modelPath||path.resolve(__dirname,'../../nlu/models/usagi.tar.gz');
      if(createHash('sha256').update(fs.readFileSync(model)).digest('hex')!==this.modelVersion)this.stop();
    }
    clearTimeout(this.idleTimer);this.inFlight++;
    try {await this.start();try{return {...await this.request('/model/parse',{text}),modelVersion:this.modelVersion};}catch(error){if(error.name==='TimeoutError'||error.name==='AbortError')throw Object.assign(new Error('Local NLU parse timed out'),{code:'NLU_PARSE_TIMEOUT'});throw error;}}
    finally {this.inFlight--;this.armIdleTimer();}
  }
  stop() {clearTimeout(this.idleTimer);this.idleTimer=null;const child = this.child; this.child = null; if (child) child.kill(); }
}
module.exports = { RasaClient };
