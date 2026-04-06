#!/usr/bin/env node
/**
 * ptouch-print web UI server
 * No npm dependencies — uses only Node.js built-ins.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const os = require('os');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const BINARY = path.join(__dirname, 'bin', 'ptouch-print');
const TMP_DIR = os.tmpdir();
const HTML_FILE = path.join(__dirname, 'public', 'index.html');

// ── helpers ──────────────────────────────────────────────────────────────────

function tmpFile(ext) {
  return path.join(TMP_DIR, `ptouch-${crypto.randomBytes(6).toString('hex')}${ext}`);
}

function runBinary(args) {
  console.log('[run]', BINARY, args.join(' '));
  return new Promise((resolve, reject) => {
    execFile(BINARY, args, { timeout: 30_000 }, (err, stdout, stderr) => {
      const output = (stdout + '\n' + stderr).trim();
      if (err && err.code !== 0) {
        console.error('[err]', output || err.message);
        reject(new Error(output || err.message));
      } else {
        console.log('[out]', output || '(no output)');
        resolve(output);
      }
    });
  });
}

function parseMultipart(body, boundary) {
  const parts = {};
  const sep = Buffer.from('--' + boundary);
  const end = Buffer.from('--' + boundary + '--');

  let start = 0;
  while (start < body.length) {
    const boundaryIdx = indexOf(body, sep, start);
    if (boundaryIdx === -1) break;

    const slice = body.slice(boundaryIdx, boundaryIdx + end.length);
    if (slice.equals(end)) break;

    const headerStart = boundaryIdx + sep.length + 2; // skip \r\n
    const headerEnd = indexOf(body, Buffer.from('\r\n\r\n'), headerStart);
    if (headerEnd === -1) break;

    const headerStr = body.slice(headerStart, headerEnd).toString();
    const dataStart = headerEnd + 4;

    const nextBoundary = indexOf(body, sep, dataStart);
    const dataEnd = nextBoundary === -1 ? body.length : nextBoundary - 2; // strip trailing \r\n

    const data = body.slice(dataStart, dataEnd);

    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const filenameMatch = headerStr.match(/filename="([^"]+)"/);
    if (nameMatch) {
      const name = nameMatch[1];
      parts[name] = filenameMatch ? { filename: filenameMatch[1], data } : data.toString();
    }
    start = nextBoundary === -1 ? body.length : nextBoundary;
  }
  return parts;
}

function indexOf(buf, search, offset = 0) {
  for (let i = offset; i <= buf.length - search.length; i++) {
    let found = true;
    for (let j = 0; j < search.length; j++) {
      if (buf[i + j] !== search[j]) { found = false; break; }
    }
    if (found) return i;
  }
  return -1;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

// ── build args ────────────────────────────────────────────────────────────────

function buildArgs(payload, previewPath, uploadedFiles) {
  const args = [];

  if (payload.debug) args.push('--debug');
  if (payload.font) args.push(`--font=${payload.font}`);
  if (payload.fontsize) args.push(`--font-size=${payload.fontsize}`);
  if (payload.fontmargin != null && payload.fontmargin !== '') args.push(`--font-margin=${payload.fontmargin}`);
  if (payload.align) args.push(`--align=${payload.align}`);
  if (payload.copies && payload.copies > 1) args.push(`--copies=${payload.copies}`);
  if (payload.timeout != null && payload.timeout !== '') args.push(`--timeout=${payload.timeout}`);
  if (payload.forceTapeWidth) args.push(`--force-tape-width=${payload.forceTapeWidth}`);
  if (previewPath) args.push(`--write-png=${previewPath}`);

  // Resolve valid labels first so we know which is last
  const valid = [];
  for (const label of (payload.labels || [])) {
    if (label.type === 'text') {
      let lines = label.lines || [];
      let s = 0, e = lines.length;
      while (s < e && lines[s].trim() === '') s++;
      while (e > s && lines[e - 1].trim() === '') e--;
      lines = lines.slice(s, e);
      if (lines.length > 0) valid.push({ label, lines });
    } else if (label.type === 'image') {
      const file = uploadedFiles[label.id];
      if (file) valid.push({ label, file });
    }
  }

  for (let i = 0; i < valid.length; i++) {
    const { label, lines, file } = valid[i];
    const isLast = i === valid.length - 1;

    if (label.pad != null && label.pad !== '') args.push(`--pad=${label.pad}`);

    if (lines) {
      args.push(`--text=${lines[0]}`);
      for (let j = 1; j < lines.length; j++) args.push(`--newline=${lines[j]}`);
    } else {
      args.push(`--image=${file}`);
    }

    if (!isLast && !payload.cutBetween) args.push('--chain');
    if (isLast && !payload.finalCut) args.push('--chain');
  }

  return args;
}

// ── routes ────────────────────────────────────────────────────────────────────

async function handleInfo(req, res) {
  try {
    const output = await runBinary(['--info']);
    json(res, 200, { output });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}

async function handleListSupported(req, res) {
  try {
    const output = await runBinary(['--list-supported']);
    json(res, 200, { output });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}

async function handlePrint(req, res) {
  const body = await readBody(req);
  const ct = req.headers['content-type'] || '';
  const boundaryMatch = ct.match(/boundary=(.+)$/);

  let payload;
  const uploadedFiles = {}; // label id -> tmp file path
  const tmpFiles = [];

  try {
    if (boundaryMatch) {
      const parts = parseMultipart(body, boundaryMatch[1]);
      payload = JSON.parse(parts.payload);

      for (const [key, val] of Object.entries(parts)) {
        if (key !== 'payload' && val && val.data) {
          const tmpPath = tmpFile('.png');
          fs.writeFileSync(tmpPath, val.data);
          uploadedFiles[key] = tmpPath;
          tmpFiles.push(tmpPath);
        }
      }
    } else {
      payload = JSON.parse(body.toString());
    }

    const action = payload.action || 'print';

    if (action === 'info') {
      const output = await runBinary(['--info']);
      return json(res, 200, { output });
    }

    let previewPath = null;
    if (action === 'preview') {
      previewPath = tmpFile('.png');
      tmpFiles.push(previewPath);
    }

    const args = buildArgs(payload, previewPath, uploadedFiles);

    if (args.length === 0) {
      return json(res, 400, { error: 'No print content specified.' });
    }

    const output = await runBinary(args);

    if (action === 'preview' && fs.existsSync(previewPath)) {
      const b64 = fs.readFileSync(previewPath).toString('base64');
      return json(res, 200, { output, preview: `data:image/png;base64,${b64}` });
    }

    json(res, 200, { output });
  } catch (e) {
    json(res, 500, { error: e.message });
  } finally {
    for (const f of tmpFiles) try { fs.unlinkSync(f); } catch (_) {}
    for (const f of Object.values(uploadedFiles)) try { fs.unlinkSync(f); } catch (_) {}
  }
}

// ── server ────────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const t = Date.now();
  res.on('finish', () => console.log(`[req] ${req.method} ${req.url} → ${res.statusCode} (${Date.now()-t}ms)`));
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'GET' && req.url === '/') {
    fs.readFile(HTML_FILE, (err, data) => {
      if (err) { res.writeHead(500); res.end('Could not load UI'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': data.length });
      res.end(data);
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/api/info') {
    return handleInfo(req, res);
  }

  if (req.method === 'GET' && req.url === '/api/list-supported') {
    return handleListSupported(req, res);
  }

  if (req.method === 'POST' && req.url === '/api/print') {
    return handlePrint(req, res);
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`ptouch-print UI  →  http://127.0.0.1:${PORT}`);
});
