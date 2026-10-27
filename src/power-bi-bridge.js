const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const model = require('./power-bi-model.json');

class PowerBiBridge {
  constructor({ onStatus = () => {}, timeoutMs = 240000 } = {}) {
    this.onStatus = onStatus;
    this.timeoutMs = timeoutMs;
    this.child = null;
    this.pending = new Map();
    this.nextId = 0;
    this.queue = Promise.resolve();
  }

  start() {
    if (this.child) return;
    if (process.platform !== 'win32') throw new Error('Power BI bridge requires Windows PowerShell.');
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass',
      '-File', path.join(__dirname, 'power-bi-bridge.ps1')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', line => {
      let message;
      try { message = JSON.parse(line.replace(/^\uFEFF/, '')); } catch { return; }
      if (message.event === 'fatal') {
        this.failAll(Object.assign(new Error(message.message),{code:message.code}));
        child.kill();
        return;
      }
      if (message.event) { this.onStatus(message.event); return; }
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.ok) request.resolve(message.result);
      else request.reject(Object.assign(new Error(message.message), { code: message.code }));
    });
    // Drain stderr without logging PowerShell exception objects or authentication details.
    child.stderr.on('data', () => {});
    child.stdin.on('error', () => { if (this.child === child) this.failAll(new Error('Power BI bridge input closed.')); });
    child.on('error', () => {
      if (this.child !== child) return;
      this.child = null;
      this.failAll(new Error('Could not start Windows PowerShell.'));
    });
    child.on('exit', () => {
      lines.close();
      if (this.child === child) {
        this.child = null;
        this.failAll(new Error('Power BI bridge stopped.'));
      }
    });
  }

  query(dax) {
    if (typeof dax !== 'string' || !dax.trim() || dax.length > 100000) return Promise.reject(new Error('Invalid DAX query.'));
    // Serialize requests so sign-in only happens once in the same PowerShell session.
    const task = this.queue.then(() => this.send(dax));
    this.queue = task.catch(() => {});
    return task;
  }

  ensureAuthenticated() {
    // Authentication only; never issue an executeQueries request here.
    const task = this.queue.then(() => this.send(null, 'authenticate'));
    this.queue = task.catch(() => {});
    return task;
  }

  send(dax, action = 'query') {
    this.start();
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.failAll(Object.assign(new Error('Power BI response timed out'),{code:'BI_TIMEOUT'}));
        this.stop();
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, action, datasetId: model.datasetId, tenantId: model.tenantId, ...(action === 'query' ? {dax} : {}) }) + '\n');
    });
  }

  failAll(error) {
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); }
    this.pending.clear();
  }

  stop() {
    const child = this.child;
    this.child = null;
    this.failAll(new Error('Power BI bridge stopped or timed out.'));
    if (child) { child.stdin.end(); child.kill(); }
  }
}

module.exports = { PowerBiBridge };
