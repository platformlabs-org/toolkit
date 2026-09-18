#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
//  SPMS 命令行工具 — Lenovo SPMS 浏览 / 查询 / 下载
//  命令:
//    search    <关键词>              浏览/搜索 root deliverable
//    info      <rootId>              查看 root deliverable 详情
//    versions  <rootId>              查看所有版本
//    download  <rootId> [版本] [目录] 下载指定版本(省略=全部)
//    module    <模块名> [目录]        下载模块文件
//    pkg       <模块名> [目录]        模块 → 所属 release 原始包
//    metadata  <releaseId|模块名>     下载 driver 包并解析 .cat 元数据
//    dl-token  <token> [目录]        仅凭 token 下载(无需 Web)
//    auth                         录入/更新凭据(加密保存 ~/.spms/credential.enc)
//  凭据: 首次输入自动加密保存, 后续直接复用;
//        可用 SPMS_USER / SPMS_PASSWORD 环境变量覆盖
// ═══════════════════════════════════════════════════════════════════
const https = require('https');
const tls = require('tls');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const { createColors } = require('picocolors');
const p = require('@clack/prompts');
const { path7za } = require('7zip-bin');
const { version: PKG_VERSION } = require('./package.json');

const useColor = !!process.stdout.isTTY && !process.env.NO_COLOR;
const pc = createColors(useColor); // picocolors: createColors(enabled) 直接收布尔, win32 默认强制颜色需显式关闭

const gray = pc.gray, dim = pc.dim, cyan = pc.cyan, green = pc.green,
  red = pc.red, yellow = pc.yellow, bold = pc.bold, blue = pc.blue;


// ───────────────────────── UI 工具 (WU 风格) ─────────────────────────
function banner() {
  console.log(`\n ${pc.cyan('📦')} ${bold('SPMS')} ${gray('v' + PKG_VERSION)}`);
}
function section(title, step) {
  console.log('');
  console.log(`${gray('╭')} ${yellow(title)}${step ? gray(`  ·  ${step}`) : ''}`);
  console.log(gray('│'));
}
function item(label, value) {
  console.log(`${gray('├')} ${label}${value !== undefined ? ` ${gray('·')} ${value}` : ''}`);
  console.log(gray('│'));
}
function endLine(label) { console.log(`${gray('╰')} ${label}\n`); }
const info = (m) => console.log(`${blue('ℹ')} ${m}`);
const ok = (m) => console.log(`${green('✅')} ${m}`);
const warn = (m) => console.log(`${yellow('⚠️')} ${m}`);
const fail = (m) => console.log(`${red('❌')} ${m}`);

function stripAnsi(s) { return String(s).replace(/\x1b\[[0-9;]*m/g, ''); }

// 终端显示宽度: 剥离 ANSI 后按 CJK 双宽计算（cli-table3 按字符数计算, 中文表头会错位）
function displayWidth(s) {
  s = stripAnsi(s);
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if ((cp >= 0x1100 && cp <= 0x115F) || (cp >= 0x2E80 && cp <= 0x303E) ||
        (cp >= 0x3041 && cp <= 0x33FF) || (cp >= 0x3400 && cp <= 0x4DBF) ||
        (cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0xA000 && cp <= 0xA4CF) ||
        (cp >= 0xAC00 && cp <= 0xD7A3) || (cp >= 0xF900 && cp <= 0xFAFF) ||
        (cp >= 0xFE30 && cp <= 0xFE4F) || (cp >= 0xFF00 && cp <= 0xFF60) ||
        (cp >= 0xFFE0 && cp <= 0xFFE6) || (cp >= 0x20000 && cp <= 0x3FFFD)) w += 2;
    else w += 1;
  }
  return w;
}
function padDisplay(s, width, align) {
  const gap = Math.max(0, width - displayWidth(s));
  const pad = ' '.repeat(gap);
  if (align === 'r') return pad + s;
  if (align === 'c') { const l = Math.floor(gap / 2); return ' '.repeat(l) + s + ' '.repeat(gap - l); }
  return s + pad;
}

// 表格: 无边框轻量风格, 表头加粗 + 细分隔线, 中文双宽对齐, 超长单元格截断
function table(head, rows, opts = {}) {
  const aligns = opts.aligns || [];
  const GAP = 2;                    // 列间留白
  const MAXW = opts.maxColWidth || 58; // 单列最大宽度, 超出截断加 …
  const clip = (s) => {
    s = String(s ?? '');
    if (displayWidth(s) <= MAXW) return s;
    let out = '', w = 0;
    for (const ch of s) {
      const cw = displayWidth(ch);
      if (w + cw > MAXW - 1) break;
      out += ch; w += cw;
    }
    return out + '…';
  };
  const widths = head.map((h, i) => Math.max(
    displayWidth(h),
    ...rows.map(r => displayWidth(clip(r[i]))),
  ));
  const renderRow = (cells, isHead) =>
    cells.map((c, i) => padDisplay(isHead ? bold(String(c)) : clip(c), widths[i] + GAP, aligns[i])).join('').trimEnd();
  console.log(renderRow(head, true));
  console.log(dim('─'.repeat(widths.reduce((a, b) => a + b + GAP, 0))));
  for (const r of rows) console.log(renderRow(r, false));
}
function wrap(text, width) {
  const s = String(text || '');
  if (s.length <= width) return s;
  const out = [];
  for (let i = 0; i < s.length; i += width) out.push(s.slice(i, i + width));
  return out.join('\n              ');
}
function fmtSize(n) {
  if (n >= 1073741824) return (n / 1073741824).toFixed(2) + ' GB';
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
  return n + ' B';
}
function fmtDur(ms) {
  if (ms < 1000) return ms + ' ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + ' s';
  return Math.floor(ms / 60000) + ' min ' + Math.round((ms % 60000) / 1000) + ' s';
}
function statusColor(s) {
  const t = String(s || '').toLowerCase();
  if (t.includes('active') || t.includes('ready')) return green(s);
  if (t.includes('disabled') || t.includes('inactive') || t.includes('scrap')) return red(s);
  if (t.includes('pending') || t.includes('testing') || t.includes('beta')) return yellow(s);
  return s;
}

// ───────────────────────── 凭据(加密持久化) ─────────────────────────
// AES-256-GCM, 密钥由 scrypt(机器指纹: 主机名\0用户名\0平台) 派生 —— 与 WU-npm 同方案
const CRED_FILE = path.join(os.homedir(), '.spms', 'credential.enc');

function machineMaterial() {
  return `${os.hostname()}\0${os.userInfo().username}\0${os.platform()}`;
}
function encrypt(plain, material = machineMaterial()) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(material, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return { v: 1, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}
function decrypt(blob, material = machineMaterial()) {
  const key = crypto.scryptSync(material, Buffer.from(blob.salt, 'base64'), 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(blob.data, 'base64')), decipher.final()]).toString('utf8');
}
function loadCredential() {
  try {
    const blob = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'));
    const obj = JSON.parse(decrypt(blob));
    return { user: obj.user || '', pass: obj.pass || '' };
  } catch { return { user: '', pass: '' }; }
}
function saveCredential(cred) {
  fs.mkdirSync(path.dirname(CRED_FILE), { recursive: true });
  fs.writeFileSync(CRED_FILE, JSON.stringify(encrypt(JSON.stringify(cred)), null, 2));
}
function clearCredential() {
  try { fs.unlinkSync(CRED_FILE); } catch {}
}

let cachedCred = null;
function clackGuard(v) {
  if (p.isCancel(v)) throw new Error('已取消');
  return v;
}
async function promptText(msg, def) {
  const v = clackGuard(await p.text({ message: msg, initialValue: def, placeholder: def }));
  return v === undefined || v === '' ? (def || '') : String(v);
}
async function promptPassword(msg) {
  return String(clackGuard(await p.password({ message: msg, mask: '*' })));
}
async function resolveCredentials({ force = false, save = true } = {}) {
  if (cachedCred && !force) return cachedCred;
  let user = process.env.SPMS_USER || '';
  let pass = process.env.SPMS_PASSWORD || '';
  let source = 'env';
  if ((!user || !pass) && !force) {
    const saved = loadCredential();
    if (saved.user && saved.pass) { user = saved.user; pass = saved.pass; source = 'saved'; }
  }
  if (!user || !pass) {
    if (!process.stdin.isTTY) throw new Error('非交互环境: 请设置 SPMS_USER / SPMS_PASSWORD 环境变量');
    user = await promptText('SPMS 用户名', user);
    pass = await promptPassword('SPMS 密码');
    source = 'entered';
    if (save) saveCredential({ user, pass });
  }
  cachedCred = { user, pass, source };
  return cachedCred;
}

// ───────────────────────── HTTP ─────────────────────────
const jar = new Map();
function saveCookies(host, setCookie) {
  for (const sc of setCookie || []) {
    const [pair] = sc.split(';'); const eq = pair.indexOf('=');
    if (eq < 0) continue;
    if (!jar.has(host)) jar.set(host, new Map());
    jar.get(host).set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}
function cookieHeader(host) {
  const m = jar.get(host); if (!m) return '';
  return [...m.entries()].map(([k, v]) => k + '=' + v).join('; ');
}
function httpReq(url, { method = 'GET', form = null, redirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const headers = { 'User-Agent': 'Mozilla/5.0 SPMS-cli/' + PKG_VERSION };
    const ck = cookieHeader(u.host); if (ck) headers['Cookie'] = ck;
    let body = null;
    if (form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(form).toString();
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = https.request(u, { method, headers }, (res) => {
      saveCookies(u.host, res.headers['set-cookie']);
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0)
          resolve(httpReq(new URL(res.headers.location, url).toString(), { method: res.statusCode === 303 ? 'GET' : method, redirects: redirects - 1 }));
        else resolve({ status: res.statusCode, headers: res.headers, body: buf.toString('utf8') });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function casLogin() {
  const SERVICE = encodeURIComponent('https://ngspms.lenovo.com/spms/login.action');
  const CAS_LOGIN = 'https://ipgpassport.lenovo.com/cas/login?service=' + SERVICE;
  // 先不跟随重定向: 若 CAS 的 SSO cookie(CASTGC)仍有效, CAS 会直接 302 带 ticket
  const probe = await httpReq(CAS_LOGIN, { redirects: 0 });
  if ([301, 302, 303].includes(probe.status) && probe.headers && probe.headers.location) {
    await httpReq(new URL(probe.headers.location, 'https://ipgpassport.lenovo.com/').toString());
    return; // SSO 免密续期成功
  }
  // 常规表单登录
  const { user, pass } = await resolveCredentials();
  const lt = (probe.body.match(/name="lt" value="([^"]*)"/) || [])[1];
  if (!lt) {
    throw new Error(`无法解析 CAS 登录页 (HTTP ${probe.status}, ${probe.body.length} 字节)` +
      (probe.body.includes('Central Authentication') ? ' · CAS 页面异常, 稍后重试' : ' · 网络或服务异常'));
  }
  // jsessionid 可选: 新版 CAS 页面(带旧 CASTGC 访问时)不在 URL 中嵌入, 直接靠 Cookie 会话 POST
  const jsid = (probe.body.match(/jsessionid=([A-F0-9]+)/) || [])[1];
  const postUrl = jsid
    ? 'https://ipgpassport.lenovo.com/cas/login;jsessionid=' + jsid + '?service=' + SERVICE
    : CAS_LOGIN;
  await httpReq(postUrl, {
    method: 'POST', form: { username: user, password: pass, lt, execution: 'e1s1', _eventId: 'submit' },
  });
}

// ───────────────────────── 会话持久化 + 登录管理 ─────────────────────────
const SESSION_FILE = path.join(os.homedir(), '.spms', 'session.enc');
let sessionReady = false;

function saveSessionCookies() {
  try {
    const obj = {};
    for (const [host, m] of jar) obj[host] = Object.fromEntries(m);
    fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
    fs.writeFileSync(SESSION_FILE, JSON.stringify(encrypt(JSON.stringify(obj)), null, 2));
  } catch {}
}
function loadSessionCookies() {
  try {
    const blob = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    const obj = JSON.parse(decrypt(blob));
    jar.clear();
    for (const [host, m] of Object.entries(obj)) {
      jar.set(host, new Map(Object.entries(m || {})));
    }
    return jar.size > 0;
  } catch { return false; }
}
// 验证会话是否仍有效: 未登录会 302 到 CAS 登录页
async function verifySession() {
  try {
    const r = await httpReq('https://ngspms.lenovo.com/spms/jsp/rootdeliverable/RootDeliverable_list', { redirects: 2 });
    return r.status === 200 && !r.body.includes('Central Authentication Service');
  } catch { return false; }
}
// 保证已登录: 内存会话 → 磁盘会话 → CAS 登录; 已有有效会话时不重复登录
async function ensureLogin() {
  if (sessionReady) return;
  if (loadSessionCookies() && await verifySession()) {
    sessionReady = true;

    return;
  }
  await withLogin('CAS 登录', casLogin);
  saveSessionCookies();
  sessionReady = true;
}
// spinner: TTY 用 clack 动画; 非 TTY(管道) 降级为文本日志, 避免转义垃圾
function makeSpinner() {
  if (process.stdout.isTTY) return p.spinner();
  let active = false;
  return {
    start(label) { active = true; console.log(dim('⏳ ' + label + '...')); },
    message() {},
    stop(msg) { if (active) { active = false; console.log(msg); } },
  };
}
async function withLogin(label, task) {
  const s = makeSpinner();
  s.start(label);
  try {
    const r = await task();
    s.stop(green('✓') + ' ' + label);
    return r;
  } catch (e) {
    s.stop(red('✗') + ' ' + label);
    throw e;
  }
}

// ───────────────────────── FTPS ─────────────────────────
const TLS_OPTS = { rejectUnauthorized: false, secureProtocol: 'TLSv1_2_method', ciphers: 'ALL:@SECLEVEL=0' };
function connectTls(opts) { return new Promise((res, rej) => { const s = tls.connect(opts, () => res(s)); s.on('error', rej); }); }

async function ftpsSession(host, uuid, ftpUser, onReady) {
  const cred = Buffer.from(ftpUser + '|' + uuid, 'utf8').toString('base64');
  const sock = await connectTls({ host, port: 990, ...TLS_OPTS });
  let buf = ''; const q = []; const w = [];
  sock.on('data', d => { buf += d.toString('latin1'); let i; while ((i = buf.search(/\r?\n/)) >= 0) { const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1); if (/^\d{3}/.test(line)) { const pkt = { code: +line.slice(0, 3), line: line.slice(4), raw: line }; if (w.length) w.shift().resolve(pkt); else q.push(pkt); } } });
  sock.on('error', e => { while (w.length) w.shift().reject(e); });
  const send = c => new Promise((res, rej) => { w.push({ resolve: res, reject: rej }); sock.write(c + '\r\n'); });
  const reply = () => q.length ? Promise.resolve(q.shift()) : new Promise((res, rej) => w.push({ resolve: res, reject: rej }));
  await reply();
  await send('USER ' + cred); const a = await send('PASS ' + cred);
  if (a.code !== 230) { sock.destroy(); throw new Error('FTPS 登录失败 (token 无效或已过期)'); }
  await send('PBSZ 0'); await send('PROT P');
  await onReady(sock, send, reply);
  try { await send('QUIT'); } catch (e) {}
  sock.destroy();
}

async function ftpsList(host, uuid, ftpUser) {
  let files = [];
  await ftpsSession(host, uuid, ftpUser, async (sock, send, reply) => {
    const pasv = await send('PASV');
    const m = pasv.line.match(/\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
    const r = await send('MLSD');
    if (r.code === 150) {
      let listing = '';
      const ds = await connectTls({ host: [m[1], m[2], m[3], m[4]].join('.'), port: (+m[5]) * 256 + (+m[6]), ...TLS_OPTS });
      ds.on('data', d => listing += d.toString('latin1'));
      await new Promise(res => ds.on('end', res)); ds.destroy();
      await reply();
      files = listing.split(/\r?\n/).filter(l => l.includes('Type=file')).map(l => {
        const size = (l.match(/Size=(\d+)/) || [])[1];
        return { name: l.split('; ').pop(), size: size ? +size : 0 };
      });
    }
  });
  return files;
}

async function ftpsGet(host, uuid, remote, local, ftpUser, expectedSize, onProgress) {
  let received = 0;
  await ftpsSession(host, uuid, ftpUser, async (sock, send, reply) => {
    const pasv = await send('PASV');
    const m = pasv.line.match(/\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
    const r = await send('RETR ' + remote);
    if (r.code !== 150 && r.code !== 125) throw new Error('RETR 失败: ' + r.raw);
    const ds = await connectTls({ host: [m[1], m[2], m[3], m[4]].join('.'), port: (+m[5]) * 256 + (+m[6]), ...TLS_OPTS });
    const out = fs.createWriteStream(local);
    ds.on('data', d => { received += d.length; out.write(d); if (onProgress) onProgress(received, expectedSize); });
    await new Promise(res => { ds.on('end', res); });
    out.end();
    ds.destroy();
    await reply();
  });
  return received;
}

// ───────────────────────── 解析 ─────────────────────────
function parseRdRows(html) {
  const rows = [];
  const re = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const row = m[1];
    const idM = row.match(/SWRelease_list\.action\?rootDeliverableDTO\.id=(\d+)/);
    if (!idM) continue;
    const cells = row.replace(/<[^>]*>/g, '|').replace(/\t/g, '').split('|').map(x => x.trim()).filter(x => x.length > 0);
    // 列序: 名称|类型|Owner|SupportedProduct(View)|Vendor|状态|创建时间|最后更新
    rows.push({
      id: idM[1], name: cells[0] || '', type: cells[1] || '', owner: cells[2] || '',
      vendor: cells[4] || '', status: cells[5] || '', createTime: cells[6] || '', lastUpdate: cells[7] || '',
    });
  }
  return rows;
}

function parseReleaseRows(html) {
  const rows = [];
  const re = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const row = m[1];
    const dlM = row.match(/checkDownloadSource\(this,(\d+)\);/);
    if (!dlM) continue;
    const cells = row.replace(/<[^>]*>/g, '|').replace(/\t/g, '').split('|').map(x => x.trim()).filter(x => x.length > 0);
    const tokenM = row.match(/name="download"[^>]*>\s*<input type="hidden" value="([^"]+)"/);
    const ivM = row.match(/onclick="popup_version\(\d+\);"[^>]*>([^<]+)</);
    const vendorM = row.match(/title="([^"]+)"[^>]*>\s*(?:<[^>]*>\s*)?-->/);
    rows.push({
      releaseId: dlM[1],
      internalVersion: ivM ? ivM[1].trim() : (cells.find(c => /^\d+\.\d+/.test(c)) || ''),
      vendorVersion: vendorM ? vendorM[1] : (cells[0] || ''),
      workStatus: (row.match(/id="workStatus">([^<]+)</) || [])[1] || '',
      lcStatus: (row.match(/lcStatus">([^<]+)</) || [])[1] || '',
      createTime: (row.match(/>(\d{4}-\d{2}-\d{2})</) || [])[1] || '',
      token: tokenM ? tokenM[1] : '',
    });
  }
  return rows;
}

// 详情: <strong>字段:</strong> ... <td>值</td>
function parseRdInfo(html) {
  const fields = {};
  const re = /<strong>\s*([^<]+?)\s*<\/strong>([\s\S]*?)(?=<strong>|$)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const label = m[1].replace(/:\s*$/, '').trim();
    const tdM = m[2].match(/<td[^>]*>([\s\S]*?)<\/td>/);
    if (!tdM || !label) continue;
    const val = tdM[1].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();
    fields[label] = val;
  }
  return fields;
}

function parseModuleRows(html) {
  const map = new Map();
  const rowRe = /<div class="mName"[^>]*>([^<]*)<\/div>[\s\S]*?popup_version\((\d+)\)/g;
  let mm;
  while ((mm = rowRe.exec(html)) !== null) {
    const name = mm[1].trim();
    if (!map.has(name)) map.set(name, mm[2]);
  }
  return map;
}

// ───────────────────────── CAT 元数据解析 (移植自 cat_meta_parser_ui_fixed.html) ─────────────────────────
const CAT_OID = '1.3.6.1.4.1.311.12.2.1';
const CAT_DISPLAY_FIELDS = [
  { label: 'Submission ID', aliases: ['Submission ID'] },
  { label: 'Bundle ID', aliases: ['BundleID'] },
  { label: 'OS', aliases: ['OS'] },
  { label: 'Universal', aliases: ['Universal'] },
  { label: 'Declarative', aliases: ['Declarative'] },
];

function readAsn1Length(buf, start, limit) {
  if (start >= limit) throw new Error('缺少长度字节');
  const first = buf[start];
  if (first <= 0x7f) return { length: first, headerLength: 1 };
  const extra = first & 0x7f;
  if (extra === 0) throw new Error('不支持不定长编码');
  if (start + 1 + extra > limit) throw new Error('长度越界');
  let len = 0;
  for (let i = 0; i < extra; i++) len = (len << 8) | buf[start + 1 + i];
  return { length: len, headerLength: 1 + extra };
}
function readAsn1Tlv(buf, start, limit) {
  if (start >= limit) throw new Error('ASN.1 越界');
  const tag = buf[start];
  const lenInfo = readAsn1Length(buf, start + 1, limit);
  const contentStart = start + 1 + lenInfo.headerLength;
  const contentEnd = contentStart + lenInfo.length;
  if (contentEnd > limit) throw new Error('ASN.1 长度超界');
  return { tag, start, contentStart, contentEnd, end: contentEnd, children: [] };
}
function parseAsn1Node(buf, start, limit) {
  const node = readAsn1Tlv(buf, start, limit);
  if ((node.tag & 0x20) !== 0) {
    let childOffset = node.contentStart;
    while (childOffset < node.contentEnd) {
      const child = parseAsn1Node(buf, childOffset, node.contentEnd);
      node.children.push(child);
      childOffset = child.end;
    }
  }
  return node;
}
function walkAsn1Tree(node, parent, cb) {
  cb(node, parent);
  for (const child of node.children) walkAsn1Tree(child, node, cb);
}
function decodeObjectIdentifier(bytes) {
  if (!bytes.length) return '';
  const parts = [Math.floor(bytes[0] / 40), bytes[0] % 40];
  let cur = 0;
  for (let i = 1; i < bytes.length; i++) {
    cur = (cur << 7) | (bytes[i] & 0x7f);
    if ((bytes[i] & 0x80) === 0) { parts.push(cur); cur = 0; }
  }
  return parts.join('.');
}
function decodeUtf16BE(bytes) {
  if (bytes.length % 2 !== 0) return '';
  const units = new Uint16Array(bytes.length / 2);
  for (let i = 0; i < units.length; i++) units[i] = (bytes[i * 2] << 8) | bytes[i * 2 + 1];
  return String.fromCharCode(...units);
}
function decodeUtf16LE(bytes) {
  if (bytes.length % 2 !== 0) return '';
  const units = new Uint16Array(bytes.length / 2);
  for (let i = 0; i < units.length; i++) units[i] = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
  return String.fromCharCode(...units);
}
function tryParseMetadataAttribute(blob) {
  try {
    let cursor = 0;
    if (blob[cursor++] !== 0x30) return null;
    const seqLen = readAsn1Length(blob, cursor, blob.length);
    cursor += seqLen.headerLength;
    const seqEnd = cursor + seqLen.length;
    if (seqEnd > blob.length) return null;
    if (cursor >= seqEnd || blob[cursor++] !== 0x1e) return null; // BMPString key
    const keyLen = readAsn1Length(blob, cursor, seqEnd);
    cursor += keyLen.headerLength;
    const keyEnd = cursor + keyLen.length;
    if (keyEnd > seqEnd) return null;
    const key = decodeUtf16BE(blob.subarray(cursor, keyEnd));
    cursor = keyEnd;
    if (cursor < seqEnd && blob[cursor] === 0x02) { // 可选 INTEGER
      cursor++;
      const intLen = readAsn1Length(blob, cursor, seqEnd);
      cursor += intLen.headerLength + intLen.length;
      if (cursor > seqEnd) return null;
    }
    if (cursor >= seqEnd || blob[cursor++] !== 0x04) return null; // OCTET STRING value
    const valLen = readAsn1Length(blob, cursor, seqEnd);
    cursor += valLen.headerLength;
    const valEnd = cursor + valLen.length;
    if (valEnd > seqEnd) return null;
    const value = decodeUtf16LE(blob.subarray(cursor, valEnd)).replace(/\u0000+$/g, '');
    return { key, value };
  } catch { return null; }
}
// 解析 .cat 文件 → [{key, value}]，匹配 OID 1.3.6.1.4.1.311.12.2.1 的元数据属性
function parseCatFile(buf) {
  const entries = [];
  const dedupe = new Set();
  const root = parseAsn1Node(buf, 0, buf.length);
  walkAsn1Tree(root, null, (node, parent) => {
    if (node.tag !== 0x06) return;
    const oid = decodeObjectIdentifier(buf.subarray(node.contentStart, node.contentEnd));
    if (oid !== CAT_OID) return;
    if (!parent || parent.tag !== 0x30) return;
    const idx = parent.children.indexOf(node);
    let octet = null;
    for (let i = idx + 1; i < parent.children.length; i++) {
      if (parent.children[i].tag === 0x04) { octet = parent.children[i]; break; }
    }
    if (!octet) return;
    const entry = tryParseMetadataAttribute(buf.subarray(octet.contentStart, octet.contentEnd));
    if (!entry) return;
    const sig = entry.key + '\0' + entry.value;
    if (dedupe.has(sig)) return;
    dedupe.add(sig);
    entries.push(entry);
  });
  return entries;
}
// 按别名匹配元数据条目 (与前端 findBestMatchedEntry 相同)
function normalizeMetaKey(v) { return String(v || '').trim().toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' '); }
function findMetaEntry(entries, aliases) {
  const nAliases = aliases.map(normalizeMetaKey);
  for (const a of nAliases) {
    const hit = entries.find(e => normalizeMetaKey(e.key) === a);
    if (hit) return hit;
  }
  for (const a of nAliases) {
    const hit = entries.find(e => normalizeMetaKey(e.key).includes(a));
    if (hit) return hit;
  }
  return null;
}
function mapCatDisplay(entries) {
  return CAT_DISPLAY_FIELDS.map(f => ({
    label: f.label,
    value: (findMetaEntry(entries, f.aliases) || {}).value || '',
  }));
}

// 解压: 7za x 到目录; 失败返回 false(非压缩包)
function extractArchive(archive, outDir) {
  return new Promise((resolve) => {
    execFile(path7za, ['x', '-y', `-o${outDir}`, archive], { windowsHide: true, maxBuffer: 64 * 1024 * 1024 }, (err) => {
      resolve(!err);
    });
  });
}
// 递归查找文件
function findFiles(dir, extRe, out = [], depth = 0) {
  if (depth > 8) return out;
  let list;
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const ent of list) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) findFiles(full, extRe, out, depth + 1);
    else if (extRe.test(ent.name)) out.push(full);
  }
  return out;
}

// ───────────────────────── 命令 ─────────────────────────
async function cmdSearch(kw) {
  const t0 = Date.now();
  await ensureLogin();
  const rp = await withLogin('搜索 Root Deliverable', () => httpReq('https://ngspms.lenovo.com/spms/jsp/rootdeliverable/RootDeliverable_list.action', {
    method: 'POST',
    form: { rootDeliverableName: kw, productName: '', owner: '', osGroup: '', pnType: '', pn: '', queryType: '', orderBy: '5', asc: 'asc', 'pager.currentPage': '1', 'pager.pageSize': '50' },
  }));
  let rows = parseRdRows(rp.body);
  rows.sort((a, b) => Number(b.id) - Number(a.id)); // 后端 ID 列固定升序, CLI 端按 id 倒序
  if (!rows.length) { warn(`未找到匹配的 Root Deliverable: ${bold(kw)}`); return; }
  section(`搜索 "${kw}" — ${rows.length} 条结果`);
  table(['ID', '类型', 'Owner', 'Vendor', '状态', '创建时间', '最后更新', '名称'],
    rows.map(r => [cyan(r.id), r.type, r.owner, r.vendor, statusColor(r.status), r.createTime, r.lastUpdate, r.name]),
    { aligns: ['right'] });
  endLine(dim(fmtDur(Date.now() - t0)));
}

async function cmdInfo(id) {
  await ensureLogin();
  const vp = await withLogin('获取详情', () => httpReq('https://ngspms.lenovo.com/spms/jsp/rootdeliverable/RootDeliverable_view?rootdeliverableDTO.id=' + id));
  const fields = parseRdInfo(vp.body);
  if (!Object.keys(fields).length) { fail('无法获取详情（可能无权限或 ID 错误）'); return; }
  section(`Root Deliverable #${id} 详情`);
  for (const [k, v] of Object.entries(fields)) {
    const val = v || gray('(空)');
    console.log(`${gray('├')} ${bold(k)}`);
    console.log(`${gray('│')}   ${dim(wrap(val, 90))}`);
    console.log(gray('│'));
  }
  endLine(dim(`共 ${Object.keys(fields).length} 个字段`));
}

async function cmdVersions(id) {
  await ensureLogin();
  const sp = await withLogin('获取版本列表', () => httpReq('https://ngspms.lenovo.com/spms/jsp/rootdeliverable/SWRelease_list.action?rootDeliverableDTO.id=' + id));
  const rows = parseReleaseRows(sp.body);
  if (!rows.length) { warn('无版本记录'); return; }
  const dlCount = rows.filter(r => r.token).length;
  section(`Root Deliverable #${id} — ${rows.length} 个版本, ${green(dlCount + ' 个可下载')}`);
  table(['releaseId', '内部版本', '工作状态', 'LC状态', '创建时间', '下载', 'Vendor 版本'],
    rows.map(r => [cyan(r.releaseId), r.internalVersion, statusColor(r.workStatus), statusColor(r.lcStatus), r.createTime, r.token ? green('✔') : red('✘'), r.vendorVersion]),
    { aligns: ['right'] });
  endLine('');
}

async function cmdDownload(rootId, versionSpec, outBase) {
  const t0 = Date.now();
  await ensureLogin();
  const sp = await withLogin('获取版本列表', () => httpReq('https://ngspms.lenovo.com/spms/jsp/rootdeliverable/SWRelease_list.action?rootDeliverableDTO.id=' + rootId));
  const rows = parseReleaseRows(sp.body);
  let targets = rows;
  if (versionSpec) {
    targets = rows.filter(r => r.releaseId === versionSpec || r.internalVersion === versionSpec || r.internalVersion.startsWith(versionSpec));
    if (!targets.length) { fail(`未找到版本: ${bold(versionSpec)}`); rows.forEach(r => info(`${r.releaseId}  ${r.internalVersion}`)); return; }
  }
  const dir = outBase || path.join(os.homedir(), 'spms-downloads', 'root' + rootId);
  fs.mkdirSync(dir, { recursive: true });
  section(`下载 #${rootId}${versionSpec ? ` 版本 ${versionSpec}` : ` 全部 ${targets.length} 个版本`}`, dir);
  let okN = 0, failN = 0, totalBytes = 0;
  for (let i = 0; i < targets.length; i++) {
    const r = targets[i];
    const spinner = makeSpinner();
    spinner.start(`${i + 1}/${targets.length}  ${r.internalVersion}`);
    if (!r.token) { spinner.stop(red('✘') + ` ${r.internalVersion} 无下载 token（文件未上传）`); failN++; continue; }
    try {
      const parts = Buffer.from(r.token, 'base64').toString('utf8').split('#');
      const uuid = parts[0];
      const host = (parts[2] || 'source.lenovo.com').split(':')[0];
      const ftpUser = parts[3] || '';
      const files = await ftpsList(host, uuid, ftpUser);
      spinner.message(`${i + 1}/${targets.length}  ${r.internalVersion} · ${files.map(f => `${f.name} ${fmtSize(f.size)}`).join(', ')}`);
      const sub = path.join(dir, r.internalVersion || ('release' + r.releaseId));
      fs.mkdirSync(sub, { recursive: true });
      for (const f of files) {
        const local = path.join(sub, f.name.replace(/[\\/]/g, '_'));
        const size = await ftpsGet(host, uuid, f.name, local, ftpUser, f.size,
          (recv, total) => spinner.message(`${i + 1}/${targets.length}  ${r.internalVersion} · ${f.name}  ${fmtSize(recv)}/${fmtSize(total)}`));
        totalBytes += size;
      }
      spinner.stop(green('✔') + ` ${r.internalVersion} → ${sub}`);
      okN++;
    } catch (e) {
      spinner.stop(red('✘') + ` ${r.internalVersion}  ${e.message}`);
      failN++;
    }
  }
  endLine(green(`✔ ${okN} 个成功`) + (failN ? `  ${red(`✘ ${failN} 个失败`)}` : '') + dim(`  ·  ${fmtSize(totalBytes)}  ·  ${fmtDur(Date.now() - t0)}`));
}

async function cmdModule(moduleName, outBase) {
  const t0 = Date.now();
  await ensureLogin();
  const mp = await withLogin('搜索模块', () => httpReq('https://ngspms.lenovo.com/spms/jsp/preload/build/Module_list.action', {
    method: 'POST',
    form: { 'pager.currentPage': '1', 'pager.pageSize': '20', 'dto.orderBy': '9', 'dto.orderAsc': 'desc', 'dto.moduleName': moduleName, 'dto.type': '0', 'dto.uploadStatus': '0', 'dto.moduleStatus': '0' },
  }));
  if (!mp.body.includes(moduleName)) { warn(`未找到模块: ${bold(moduleName)}`); return; }
  const tokens = [...new Set([...mp.body.matchAll(/downloadToken" type="hidden" value="([^"]+)"/g)].map(m => Buffer.from(m[1], 'base64').toString('utf8').split('#')[0]))];
  const relMap = parseModuleRows(mp.body);
  const { user } = await resolveCredentials();
  const dir = outBase || path.join(os.homedir(), 'spms-downloads', 'module_' + moduleName);
  fs.mkdirSync(dir, { recursive: true });
  section(`模块 ${moduleName}${relMap.has(moduleName) ? gray(` · release ${relMap.get(moduleName)}`) : ''} — ${tokens.length} 个账户`, dir);
  let okN = 0, failN = 0, totalBytes = 0;
  for (const uuid of tokens) {
    const spinner = makeSpinner();
    spinner.start(`${uuid.slice(0, 8)} 连接中...`);
    try {
      const files = await ftpsList('module.lenovo.com', uuid, user);
      spinner.message(`${uuid.slice(0, 8)} · ${files.map(f => `${f.name} ${fmtSize(f.size)}`).join(', ')}`);
      for (const f of files) {
        const size = await ftpsGet('module.lenovo.com', uuid, f.name, path.join(dir, f.name.replace(/[\\/]/g, '_')), user, f.size,
          (recv, total) => spinner.message(`${uuid.slice(0, 8)} · ${f.name}  ${fmtSize(recv)}/${fmtSize(total)}`));
        totalBytes += size;
      }
      spinner.stop(green('✔') + ` ${uuid.slice(0, 8)} → ${dir}`);
      okN++;
    } catch (e) {
      spinner.stop(red('✘') + ` ${uuid.slice(0, 8)}  ${e.message}`);
      failN++;
    }
  }
  endLine(green(`✔ ${okN} 个成功`) + (failN ? `  ${red(`✘ ${failN} 个失败`)}` : '') + dim(`  ·  ${fmtSize(totalBytes)}  ·  ${fmtDur(Date.now() - t0)}`));
  if (relMap.has(moduleName)) ctx.releaseId = relMap.get(moduleName);
}

async function cmdPkg(moduleName, outBase) {
  const t0 = Date.now();
  await ensureLogin();
  const mp = await withLogin('搜索模块', () => httpReq('https://ngspms.lenovo.com/spms/jsp/preload/build/Module_list.action', {
    method: 'POST',
    form: { 'pager.currentPage': '1', 'pager.pageSize': '20', 'dto.orderBy': '9', 'dto.orderAsc': 'desc', 'dto.moduleName': moduleName, 'dto.type': '0', 'dto.uploadStatus': '0', 'dto.moduleStatus': '0' },
  }));
  if (!mp.body.includes(moduleName)) { warn(`未找到模块: ${bold(moduleName)}`); return; }
  const relMap = parseModuleRows(mp.body);
  let releaseId = relMap.get(moduleName) || (mp.body.match(/popup_version\((\d+)\)/) || [])[1];
  if (!releaseId) { fail('无法从模块页解析 release'); return; }

  const vp = await withLogin('解析所属 Root Deliverable', () => httpReq('https://ngspms.lenovo.com/spms/jsp/rootdeliverable/driver/release/SWRDriverSearch_view?swrDriverDTO.id=' + releaseId));
  const rdName = ((vp.body.match(/<strong>Root Deliverable:<\/strong>[\s\S]*?<td align="left">([^<]*)</) || [])[1] || '').trim();
  if (!rdName) { fail('无法解析 Root Deliverable 名称'); return; }

  const rp = await withLogin('定位 Root Deliverable', () => httpReq('https://ngspms.lenovo.com/spms/jsp/rootdeliverable/RootDeliverable_list.action', {
    method: 'POST',
    form: { rootDeliverableName: rdName, productName: '', owner: '', osGroup: '', pnType: '', pn: '', queryType: '', orderBy: '9', asc: 'desc', 'pager.currentPage': '1', 'pager.pageSize': '20' },
  }));
  const ids = [...new Set([...rp.body.matchAll(/SWRelease_list\.action\?rootDeliverableDTO\.id=(\d+)/g)].map(m => m[1]))];
  if (!ids.length) { fail(`未找到 Root Deliverable: ${rdName}`); return; }

  let token = null, rootId = null;
  for (const rid of ids) {
    const sp = await httpReq('https://ngspms.lenovo.com/spms/jsp/rootdeliverable/SWRelease_list.action?rootDeliverableDTO.id=' + rid);
    const tm = sp.body.match(new RegExp('checkDownloadSource\\(this,' + releaseId + '\\);"[^>]*><input type="hidden" value="([^"]+)"'));
    if (tm) { token = tm[1]; rootId = rid; break; }
  }
  if (!token) { fail('未找到该 release 的下载 token'); return; }
  const parts = Buffer.from(token, 'base64').toString('utf8').split('#');
  const uuid = parts[0];
  const ftpUser = parts[3] || (await resolveCredentials()).user;
  const dir = outBase || path.join(os.homedir(), 'spms-downloads', 'module_pkg_' + moduleName);
  fs.mkdirSync(dir, { recursive: true });

  section(`模块 ${moduleName} → ${bold(rdName)}${gray(` · root ${rootId} · release ${releaseId}`)}`, dir);
  const spinner = makeSpinner();
  spinner.start('获取原始包列表');
  const files = await ftpsList('source.lenovo.com', uuid, ftpUser);
  spinner.message(files.map(f => `${f.name} ${fmtSize(f.size)}`).join(', '));
  let totalBytes = 0;
  for (const f of files) {
    const size = await ftpsGet('source.lenovo.com', uuid, f.name, path.join(dir, f.name.replace(/[\\/]/g, '_')), ftpUser, f.size,
      (recv, total) => spinner.message(`${f.name}  ${fmtSize(recv)}/${fmtSize(total)}`));
    totalBytes += size;
  }
  spinner.stop(green('✔') + ` 完成 → ${dir}`);
  endLine(dim(`${fmtSize(totalBytes)}  ·  ${fmtDur(Date.now() - t0)}`));
  ctx.rootId = rootId;
  ctx.releaseId = releaseId;
}

// 解析 release id 或模块名 → 该 release 的下载信息 {uuid, host, ftpUser, releaseId, rdName, rootId}
async function resolveReleaseToken(target) {
  let releaseId, label;
  if (/^\d+$/.test(target)) {
    releaseId = target;
    label = `release ${target}`;
  } else {
    const mp = await httpReq('https://ngspms.lenovo.com/spms/jsp/preload/build/Module_list.action', {
      method: 'POST',
      form: { 'pager.currentPage': '1', 'pager.pageSize': '20', 'dto.orderBy': '9', 'dto.orderAsc': 'desc', 'dto.moduleName': target, 'dto.type': '0', 'dto.uploadStatus': '0', 'dto.moduleStatus': '0' },
    });
    if (!mp.body.includes(target)) throw new Error(`未找到模块: ${target}`);
    releaseId = parseModuleRows(mp.body).get(target) || (mp.body.match(/popup_version\((\d+)\)/) || [])[1];
    if (!releaseId) throw new Error('无法从模块页解析 release');
    label = `模块 ${target} → release ${releaseId}`;
  }
  const vp = await httpReq('https://ngspms.lenovo.com/spms/jsp/rootdeliverable/driver/release/SWRDriverSearch_view?swrDriverDTO.id=' + releaseId);
  const rdName = ((vp.body.match(/<strong>Root Deliverable:<\/strong>[\s\S]*?<td align="left">([^<]*)</) || [])[1] || '').trim();
  const rp = await httpReq('https://ngspms.lenovo.com/spms/jsp/rootdeliverable/RootDeliverable_list.action', {
    method: 'POST',
    form: { rootDeliverableName: rdName, productName: '', owner: '', osGroup: '', pnType: '', pn: '', queryType: '', orderBy: '9', asc: 'desc', 'pager.currentPage': '1', 'pager.pageSize': '20' },
  });
  const ids = [...new Set([...rp.body.matchAll(/SWRelease_list\.action\?rootDeliverableDTO\.id=(\d+)/g)].map(m => m[1]))];
  let token = null, rootId = null;
  for (const rid of ids) {
    const sp = await httpReq('https://ngspms.lenovo.com/spms/jsp/rootdeliverable/SWRelease_list.action?rootDeliverableDTO.id=' + rid);
    const tm = sp.body.match(new RegExp('checkDownloadSource\\(this,' + releaseId + '\\);"[^>]*><input type="hidden" value="([^"]+)"'));
    if (tm) { token = tm[1]; rootId = rid; break; }
  }
  if (!token) throw new Error('未找到该 release 的下载 token');
  const parts = Buffer.from(token, 'base64').toString('utf8').split('#');
  return { label, uuid: parts[0], host: (parts[2] || 'source.lenovo.com').split(':')[0], ftpUser: parts[3] || (await resolveCredentials()).user, releaseId, rdName, rootId };
}

// metadata: 下载 driver 包 → 解压 → 递归扫描 .cat → 解析元数据
async function cmdMeta(target, opts) {
  const t0 = Date.now();
  await ensureLogin();
  const rel = await withLogin('定位 release', () => resolveReleaseToken(target));
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spms-meta-'));
  const pkgDir = path.join(workDir, 'pkg');
  fs.mkdirSync(pkgDir, { recursive: true });
  section(`元数据解析 ${bold(rel.label)}${gray(` · ${rel.rdName} · root ${rel.rootId}`)}`, workDir);
  try {
    const spinner = makeSpinner();
    spinner.start('下载 driver 包');
    const files = await ftpsList(rel.host, rel.uuid, rel.ftpUser);
    for (const f of files) {
      const size = await ftpsGet(rel.host, rel.uuid, f.name, path.join(pkgDir, f.name.replace(/[\\/]/g, '_')), rel.ftpUser, f.size,
        (recv, total) => spinner.message(`下载 ${f.name}  ${fmtSize(recv)}/${fmtSize(total)}`));
    }
    spinner.stop(green('✔') + ` 下载完成 ${files.map(f => f.name).join(', ')}`);

    // 解压压缩包 (递归两层, 处理嵌套)
    const ARCH_RE = /\.(7z|zip|rar|exe|tar\.gz)$/i;
    const spinner2 = makeSpinner();
    spinner2.start('解压并扫描 .cat 文件');
    const extractRoot = path.join(workDir, 'extract');
    fs.mkdirSync(extractRoot, { recursive: true });
    let pending = findFiles(pkgDir, ARCH_RE);
    let depth = 0;
    while (pending.length && depth < 3) {
      const next = [];
      for (const arc of pending) {
        const outDir = path.join(extractRoot, 'd' + depth, path.basename(arc, path.extname(arc)) + '-' + Math.random().toString(36).slice(2, 7));
        fs.mkdirSync(outDir, { recursive: true });
        if (await extractArchive(arc, outDir)) next.push(...findFiles(outDir, ARCH_RE));
      }
      pending = next;
      depth++;
    }
    const catFiles = findFiles(extractRoot, /\.cat$/i);
    if (!catFiles.length) { warn('解压后未找到 .cat 文件'); return; }
    spinner2.stop(green('✔') + ` 找到 ${catFiles.length} 个 .cat 文件`);

    // 解析
    const results = catFiles.map(catPath => {
      try {
        const buf = fs.readFileSync(catPath);
        const entries = parseCatFile(buf);
        const display = mapCatDisplay(entries);
        return {
          file: catPath.replace(workDir + path.sep, ''), size: buf.length, entries,
          status: entries.length ? 'ok' : 'warn', error: '', display,
        };
      } catch (e) {
        return { file: catPath.replace(workDir + path.sep, ''), size: 0, entries: [], status: 'err', error: e.message, display: [] };
      }
    });
    const okN = results.filter(r => r.status === 'ok').length;
    const warnN = results.filter(r => r.status === 'warn').length;
    const errN = results.filter(r => r.status === 'err').length;

    section(`CAT 元数据 · ${green(okN + ' Matched')}${warnN ? ` · ${yellow(warnN + ' No Data')}` : ''}${errN ? ` · ${red(errN + ' Failed')}` : ''}`);
    // 纵向字段块: 每个 .cat 一块, 字段名对齐竖排（横向表格列数多且值长, 会撑爆终端宽度）
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const status = r.status === 'ok' ? green('Matched') : r.status === 'err' ? red('Failed') : yellow('No Data');
      console.log(`${gray('╭')} [${dim(String(i + 1) + '/' + results.length)}] ${bold(path.basename(r.file))} ${dim('· ' + fmtSize(r.size) + ' · ' + stripAnsi(status))}`);
      if (r.status === 'err') { console.log(`${gray('│')} ${red(r.error)}`); }
      const kvs = opts.all
        ? r.entries.map(e => [e.key, e.value])
        : [
            ['Submission ID', r.display[0].value],
            ['Bundle ID', r.display[1].value],
            ['OS', r.display[2].value],
            ['Universal', r.display[3].value],
            ['Declarative', r.display[4].value],
          ];
      const kw = Math.max(...kvs.map(([k]) => displayWidth(k)), 0);
      for (const [k, v] of kvs) {
        const isBool = /^(universal|declarative)$/i.test(k);
        const val = v === undefined || v === '' ? dim('—')
          : isBool ? (/^true$/i.test(v) ? green(v) : dim(v))
          : v;
        console.log(`${gray('│')} ${padDisplay(k, kw)}  ${val}`);
      }
      console.log(`${gray('╰')} ${dim(r.entries.length + ' 条元数据')}${i < results.length - 1 ? '\n' : ''}`);
    }

    // 摘要（普通缩进行, 避免与块的 ╰ 结尾符号重复）
    const catTotal = results.reduce((a, r) => a + r.size, 0);
    const entryTotal = results.reduce((a, r) => a + r.entries.length, 0);
    console.log('');
    console.log(dim(`  ${catFiles.length} 个 .cat · ${entryTotal} 条元数据 · ${fmtSize(catTotal)} · ${fmtDur(Date.now() - t0)}${opts.keep ? ' · 临时目录保留' : ''}`));
    ctx.rootId = rel.rootId;
    ctx.releaseId = rel.releaseId;
    if (opts.keep) console.log(dim(`  临时目录: ${workDir}`));
    else fs.rmSync(workDir, { recursive: true, force: true }); // 静默清理, 不打断提示流
  } catch (e) {
    fs.rmSync(workDir, { recursive: true, force: true });
    throw e;
  }
}

async function cmdDlToken(tokenSpec, outBase) {
  const t0 = Date.now();
  let decoded = tokenSpec;
  if (/^[A-Za-z0-9+/=]{20,}$/.test(tokenSpec) && !tokenSpec.includes('#')) {
    const d = Buffer.from(tokenSpec, 'base64').toString('utf8');
    if (d.includes('#')) decoded = d;
  }
  const parts = decoded.split('#');
  const uuid = parts[0];
  const host = (parts[2] || 'source.lenovo.com').split(':')[0];
  let ftpUser = parts[3] || '';
  if (!ftpUser) ftpUser = (await resolveCredentials()).user;
  const dir = outBase || path.join(os.homedir(), 'spms-downloads', 'token_' + uuid.slice(0, 8));
  fs.mkdirSync(dir, { recursive: true });
  section(`Token 下载 · ${host} · ${uuid.slice(0, 8)}… · ${ftpUser}`, dir);
  const spinner = makeSpinner();
  spinner.start('列出目录');
  const files = await ftpsList(host, uuid, ftpUser);
  if (!files.length) { spinner.stop(yellow('⚠') + ' 目录为空'); return; }
  spinner.message(files.map(f => `${f.name} ${fmtSize(f.size)}`).join(', '));
  let totalBytes = 0;
  for (const f of files) {
    const size = await ftpsGet(host, uuid, f.name, path.join(dir, f.name.replace(/[\\/]/g, '_')), ftpUser, f.size,
      (recv, total) => spinner.message(`${f.name}  ${fmtSize(recv)}/${fmtSize(total)}`));
    totalBytes += size;
  }
  spinner.stop(green('✔') + ` 完成 → ${dir}`);
  endLine(dim(`${fmtSize(totalBytes)}  ·  ${fmtDur(Date.now() - t0)}`));
}

async function cmdAuth() {
  const { user, pass } = await resolveCredentials({ force: true });
  saveCredential({ user, pass });
  ok(`凭据已保存 → ${gray(CRED_FILE)}`);
}

// ───────────────────────── 帮助 ─────────────────────────
function showHelp() {
  banner();
  table(['命令', '说明'], [
    [cyan('search <关键词>'), '搜索 root deliverable'],
    [cyan('info <rootId>'), '查看详情'],
    [cyan('versions <rootId>'), '查看所有版本'],
    [cyan('download <rootId> [版本] [目录]'), '下载版本（内部版本号或 releaseId，省略=全部）'],
    [cyan('module <模块名> [目录]'), '下载模块文件'],
    [cyan('pkg <模块名> [目录]'), '下载模块所属 release 的原始包'],
    [cyan('metadata <releaseId|模块名> [--keep] [--all]'), '解析 .cat 元数据'],
    [cyan('dl-token <token> [目录]'), '凭 token 直接下载'],
    [cyan('auth'), '更新凭据'],
  ]);
  console.log(dim('\n  交互模式下 versions/info/download 可省略 rootId · help 帮助 · exit 退出\n'));
}

// ───────────────────────── 命令分发与交互 REPL ─────────────────────────
// 注意: 使用 process.exitCode 而非 process.exit —— spinner 运行中 process.exit
// 会在 Windows/Node 触发 libuv 断言崩溃（与 WU-npm 相同的处理方式）

// 简单分词: 支持双引号/单引号包裹的参数
function tokenize(input) {
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  const out = [];
  let m;
  while ((m = re.exec(input)) !== null) out.push(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]));
  return out;
}

// 会话上下文: 交互模式下记忆上次访问的 root deliverable, 省略参数时自动补齐
const ctx = { rootId: null, releaseId: null };

async function dispatchCommand(argv, opts = {}) {
  const [cmd, arg1, arg2, arg3] = argv;
  if (!cmd) return;
  switch (cmd) {
    case 'search': await cmdSearch(argv.slice(1).join(' ')); break; // 剩余参数整体作为关键词
    case 'info': {
      const id = arg1 || ctx.rootId;
      if (!id) { fail('缺少 rootId（用法: info <rootId>）'); break; }
      await cmdInfo(id);
      ctx.rootId = id;
      break;
    }
    case 'versions': {
      const id = arg1 || ctx.rootId;
      if (!id) { fail('缺少 rootId（用法: versions <rootId>）'); break; }
      await cmdVersions(id);
      ctx.rootId = id;
      break;
    }
    case 'download': {
      // 参数归一化: 第一参数非纯数字(或缺失)且上下文有 rootId 时, 视为版本号自动补齐
      let rootId = arg1, version = arg2;
      if (!rootId || !/^\d+$/.test(rootId)) {
        if (!ctx.rootId) { fail('缺少 rootId（用法: download <rootId> [版本]）'); break; }
        version = rootId || version;
        rootId = ctx.rootId;
      }
      await cmdDownload(rootId, version, arg3);
      ctx.rootId = rootId;
      break;
    }
    case 'module': await cmdModule(arg1, arg2); break;
    case 'pkg': await cmdPkg(arg1, arg2); break;
    case 'metadata': case 'meta': {
      if (!arg1) { fail('缺少参数（用法: metadata <releaseId|模块名>）'); break; }
      await cmdMeta(arg1, { keep: argv.includes('--keep'), all: argv.includes('--all') });
      break;
    }
    case 'dl-token': await cmdDlToken(arg1, arg2); break;
    case 'auth': await cmdAuth(); break;
    default: fail(`未知命令: ${bold(cmd)}`); showHelp();
  }
}

// 交互模式: 进入后保持会话, 循环接收命令, 不退出
// TTY 用 clack 提示; 非 TTY(管道) 走批处理: 逐行读 stdin 执行
async function repl() {
  banner();
  const spinner = makeSpinner();
  spinner.start('登录');
  try {
    await ensureLogin();
    spinner.stop(green('✓') + ' 登录');
  } catch (e) {
    spinner.stop(red('✗') + ' 登录失败');
    throw e;
  }

  if (!process.stdin.isTTY) {
    // 批处理模式: 管道喂入命令, 逐行执行
    const batch = fs.readFileSync(0, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of batch) {
      if (['exit', 'quit', 'q'].includes(line)) return;
      if (line === 'help' || line === '?') { showHelp(); continue; }
      try {
        await dispatchCommand(tokenize(line));
      } catch (e) {
        console.error(`\n${red('❌')} ${e.message}`);
      }
    }
    return;
  }

  while (true) {
    const input = await p.text({ message: cyan('spms') });
    if (p.isCancel(input)) return;
    const line = String(input).trim();
    if (!line) continue;
    if (line === 'exit' || line === 'quit' || line === 'q') return;
    if (line === 'clear') { console.clear(); banner(); continue; }
    if (line === 'help' || line === '?') { showHelp(); continue; }
    try {
      await dispatchCommand(tokenize(line));
    } catch (e) {
      console.error(`\n${red('❌')} ${e.message}`);
    }
  }
}

(async () => {
  const argv = process.argv.slice(2);
  // 无参数 → 交互模式; 有参数 → 单命令模式
  if (!argv.length) { await repl(); return; }
  if (['-h', '--help', 'help'].includes(argv[0])) { showHelp(); return; }
  await dispatchCommand(argv);
})().catch(e => {
  console.error(`\n${red('❌')} ${e.message}`);
  process.exitCode = 1;
});
