// Cliente mínimo del protocolo de depuración de Chrome (CDP), sin dependencias.
//
// El servidor necesita un navegador para tres cosas: rasterizar el PDF con
// pdf.js, leer la capa de texto y componer la vista previa. Antes eso lo hacía
// puppeteer-core, pero entonces la carpeta no servía tal cual: había que
// ejecutar «npm install» en una terminal, y quien usa Claude Desktop o LM
// Studio no tiene por qué abrir una terminal —ni esas aplicaciones pueden
// hacerlo por él—.
//
// De todo puppeteer solo se usaba una porción diminuta: arrancar Chrome,
// abrir una página y evaluar funciones en ella. Eso son unas pocas llamadas
// CDP sobre un WebSocket, así que se implementan aquí y la carpeta pasa a
// funcionar recién descomprimida, sin instalar nada.

const net = require('net');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ---------------------------------------------------------------------------
// WebSocket (solo lo que exige CDP: texto, cliente, sin extensiones)
// ---------------------------------------------------------------------------

class WebSocketClient {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    this.onMessage = null;
    this.onClose = null;
    socket.on('data', chunk => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.readFrames();
    });
    socket.on('close', () => this.onClose && this.onClose());
    socket.on('error', () => this.onClose && this.onClose());
  }

  static connect(url) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const key = crypto.randomBytes(16).toString('base64');
      const req = http.request({
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Key': key,
          'Sec-WebSocket-Version': '13'
        }
      });
      req.on('upgrade', (res, socket, head) => {
        socket.setNoDelay(true);
        const ws = new WebSocketClient(socket);
        if (head && head.length) {
          ws.buffer = head;
          ws.readFrames();
        }
        resolve(ws);
      });
      req.on('error', reject);
      req.end();
    });
  }

  send(text) {
    const payload = Buffer.from(text, 'utf8');
    const mask = crypto.randomBytes(4);
    let header;
    if (payload.length < 126) {
      header = Buffer.alloc(2);
      header[1] = 0x80 | payload.length;
    } else if (payload.length < 65536) {
      header = Buffer.alloc(4);
      header[1] = 0x80 | 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    header[0] = 0x81; // FIN + texto
    const masked = Buffer.allocUnsafe(payload.length);
    for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
    this.socket.write(Buffer.concat([header, mask, masked]));
  }

  // Devuelve el frame completo si cabe en el búfer, o null si falta información.
  readFrames() {
    for (;;) {
      const b = this.buffer;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const opcode = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;   // el servidor no enmascara, pero se contempla
      let len = b[1] & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (b.length < offset + 2) return;
        len = b.readUInt16BE(offset);
        offset += 2;
      } else if (len === 127) {
        if (b.length < offset + 8) return;
        len = Number(b.readBigUInt64BE(offset));
        offset += 8;
      }
      let mask = null;
      if (masked) {
        if (b.length < offset + 4) return;
        mask = b.slice(offset, offset + 4);
        offset += 4;
      }
      if (b.length < offset + len) return;   // frame incompleto: esperar más datos
      let payload = b.slice(offset, offset + len);
      if (mask) {
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      }
      this.buffer = b.slice(offset + len);

      if (opcode === 0x8) { this.socket.end(); return; }      // close
      if (opcode === 0x9) { this.pong(payload); continue; }   // ping
      if (opcode === 0xa) continue;                           // pong

      // Texto (0x1) y continuación (0x0): CDP manda mensajes grandes troceados.
      this.fragments.push(payload);
      if (fin) {
        const message = Buffer.concat(this.fragments).toString('utf8');
        this.fragments = [];
        if (this.onMessage) this.onMessage(message);
      }
    }
  }

  pong(payload) {
    const mask = crypto.randomBytes(4);
    const header = Buffer.from([0x8a, 0x80 | payload.length]);
    const masked = Buffer.allocUnsafe(payload.length);
    for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
    this.socket.write(Buffer.concat([header, mask, masked]));
  }

  close() {
    try { this.socket.end(); } catch { /* ya cerrado */ }
  }
}

// ---------------------------------------------------------------------------
// Conexión CDP
// ---------------------------------------------------------------------------

class Connection {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.onMessage = raw => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || 'Error de CDP'));
        else resolve(msg.result);
        return;
      }
      const subs = this.listeners.get(msg.method);
      if (subs) for (const fn of [...subs]) fn(msg.params, msg.sessionId);
    };
    ws.onClose = () => {
      for (const { reject } of this.pending.values()) reject(new Error('Conexión con el navegador cerrada.'));
      this.pending.clear();
    };
  }

  send(method, params = {}, sessionId) {
    const id = ++this.nextId;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(msg));
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method).add(fn);
    return () => this.listeners.get(method).delete(fn);
  }
}

// ---------------------------------------------------------------------------
// Navegador y página
// ---------------------------------------------------------------------------

class Page {
  constructor(conn, sessionId) {
    this.conn = conn;
    this.sessionId = sessionId;
    this.errors = [];
    conn.on('Runtime.exceptionThrown', (p, sid) => {
      if (sid !== sessionId) return;
      const d = p.exceptionDetails || {};
      this.errors.push(d.exception?.description || d.text || 'error');
    });
  }

  async goto(url) {
    const loaded = new Promise(resolve => {
      const off = this.conn.on('Page.loadEventFired', (_p, sid) => {
        if (sid !== this.sessionId) return;
        off();
        resolve();
      });
    });
    await this.conn.send('Page.navigate', { url }, this.sessionId);
    await loaded;
  }

  // Evalúa una función en la página con los argumentos dados, igual que
  // page.evaluate de puppeteer: los argumentos viajan como JSON y el valor
  // devuelto vuelve como JSON (se espera si es una promesa).
  async evaluate(fn, ...args) {
    const expression = `(${fn.toString()})(${args.map(a => JSON.stringify(a === undefined ? null : a)).join(',')})`;
    const res = await this.conn.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    }, this.sessionId);
    if (res.exceptionDetails) {
      const d = res.exceptionDetails;
      throw new Error(d.exception?.description || d.text || 'Error al evaluar en la página');
    }
    return res.result?.value;
  }

  // Captura una zona de la página tal y como se ve. `clip` va en píxeles CSS
  // ({ x, y, width, height, scale }); captureBeyondViewport permite recortar
  // más allá de lo que cabe en la ventana, que es lo normal con una página A4.
  async screenshot(clip) {
    const res = await this.conn.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      ...(clip ? { clip: { scale: 1, ...clip } } : {})
    }, this.sessionId);
    return res.data;
  }

  // Tamaño de la ventana para el render. Sin esto el navegador sin interfaz usa
  // 800x600 y la ficha se maqueta a un ancho que no es el que se va a capturar.
  async setViewport(width, height) {
    await this.conn.send('Emulation.setDeviceMetricsOverride', {
      width: Math.round(width), height: Math.round(height),
      deviceScaleFactor: 1, mobile: false
    }, this.sessionId);
  }
}

class Browser {
  constructor(proc, conn, userDataDir) {
    this.proc = proc;
    this.conn = conn;
    this.userDataDir = userDataDir;
  }

  async newPage() {
    const { targetId } = await this.conn.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.conn.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(this.conn, sessionId);
    await this.conn.send('Page.enable', {}, sessionId);
    await this.conn.send('Runtime.enable', {}, sessionId);
    return page;
  }

  async close() {
    this.conn.ws.close();
    try { this.proc.kill(); } catch { /* ya terminado */ }
    try { fs.rmSync(this.userDataDir, { recursive: true, force: true }); } catch { /* da igual */ }
  }
}

// Arranca Chrome sin interfaz y espera a que anuncie su puerto de depuración.
function launch(executablePath, { timeout = 30000 } = {}) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ows-chrome-'));
  const proc = spawn(executablePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  return new Promise((resolve, reject) => {
    let salida = '';
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('El navegador no ha arrancado a tiempo.'));
    }, timeout);

    proc.stderr.on('data', async chunk => {
      salida += chunk;
      const m = salida.match(/ws:\/\/[^\s]+/);
      if (!m) return;
      clearTimeout(timer);
      proc.stderr.removeAllListeners('data');
      try {
        const ws = await WebSocketClient.connect(m[0]);
        resolve(new Browser(proc, new Connection(ws), userDataDir));
      } catch (e) {
        reject(e);
      }
    });
    proc.on('error', e => {
      clearTimeout(timer);
      reject(new Error(`No se ha podido arrancar el navegador: ${e.message}`));
    });
    proc.on('exit', code => {
      clearTimeout(timer);
      reject(new Error(`El navegador ha terminado inesperadamente (código ${code}).\n${salida.slice(-400)}`));
    });
  });
}

module.exports = { launch };
