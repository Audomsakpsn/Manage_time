/**
 * server.js
 * ---------------------------------------------------------------------------
 * เซิร์ฟเวอร์เล็กๆ สำหรับรันเว็บแอปนี้ พร้อมเก็บคำตอบแบบประเมิน (Feedback)
 * ลงไฟล์ feedback.json ซึ่งทำหน้าที่เป็น "ฐานข้อมูล" ของระบบตามที่โจทย์ต้องการ
 *
 * วิธีรัน:
 *   node server.js
 * แล้วเปิดเบราว์เซอร์ไปที่ http://localhost:8000
 *
 * ไม่ต้องติดตั้งไลบรารีเพิ่มเติมใดๆ (ไม่ต้อง npm install) ใช้เฉพาะโมดูล
 * มาตรฐานที่มากับ Node.js เท่านั้น ต้องมี Node.js ติดตั้งไว้ในเครื่องก่อน
 * ตรวจสอบเวอร์ชันได้ด้วยคำสั่ง: node -v
 *
 * โครงสร้างที่เกี่ยวข้อง:
 *   - index.html, script.js, style.css  → หน้าเว็บแอป (เสิร์ฟเป็นไฟล์สแตติก)
 *   - feedback.json                     → ฐานข้อมูล Feedback (ไฟล์นี้จะถูกสร้าง/แก้ไขอัตโนมัติ)
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

const PORT          = 8000;
const ROOT          = __dirname;
const FEEDBACK_FILE = path.join(ROOT, 'feedback.json');
const MAX_BODY_SIZE = 1_000_000; // กันไม่ให้ request ใหญ่เกินไป (1 MB)

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

/* สร้างไฟล์ฐานข้อมูล feedback.json ถ้ายังไม่มี (เริ่มต้นเป็น array ว่าง) */
function ensureFeedbackFile() {
  if (!fs.existsSync(FEEDBACK_FILE)) {
    fs.writeFileSync(FEEDBACK_FILE, '[]\n', 'utf-8');
    console.log(`สร้างไฟล์ฐานข้อมูลใหม่: ${FEEDBACK_FILE}`);
  }
}
ensureFeedbackFile();

function sendJSON(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/* --- เสิร์ฟไฟล์สแตติกของเว็บแอป (index.html, script.js, style.css ฯลฯ) --- */
function serveStatic(req, res, pathname) {
  const safePath = path.normalize(pathname === '/' ? '/index.html' : pathname);
  const filePath = path.join(ROOT, safePath);

  /* กันไม่ให้เข้าถึงไฟล์นอกโฟลเดอร์โปรเจกต์ (path traversal) */
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  /* ห้ามเข้าไฟล์ฐานข้อมูลผ่านเบราว์เซอร์โดยตรง เพื่อไม่ให้ผู้ทดลองใช้เห็นคำตอบของคนอื่น
     ผู้สอน/ผู้วิจัยเปิดไฟล์นี้ได้จากเครื่อง (เทอร์มินัลหรือโปรแกรมข้อความ) เท่านั้น */
  if (safePath === '/feedback.json') {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden — เปิดไฟล์นี้จากเครื่องโดยตรงแทน ไม่รองรับผ่านเบราว์เซอร์');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

/* --- รับคำตอบแบบประเมินและบันทึกต่อท้ายไฟล์ feedback.json --- */
function handleFeedbackPost(req, res) {
  let body = '';
  let tooLarge = false;

  req.on('data', chunk => {
    body += chunk;
    if (body.length > MAX_BODY_SIZE) {
      tooLarge = true;
      req.destroy();
    }
  });

  req.on('end', () => {
    if (tooLarge) return;

    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      sendJSON(res, 400, { ok: false, error: 'invalid JSON' });
      return;
    }

    /* จำกัดความยาวข้อความ และเก็บเฉพาะฟิลด์ที่รู้จัก กันข้อมูลแปลกปลอม */
    const entry = {
      id: String(payload.id || Date.now()),
      receivedAt: new Date().toISOString(),
      submittedAt: String(payload.submittedAt || '').slice(0, 40),
      respondent: String(payload.respondent || 'ไม่ระบุ').slice(0, 100),
      duration: String(payload.duration || '').slice(0, 100),
      scores: (payload.scores && typeof payload.scores === 'object') ? payload.scores : {},
      solveScore: Number(payload.solveScore) || 0,
      nps: Number(payload.nps) || 0,
      features: Array.isArray(payload.features) ? payload.features.map(String).slice(0, 20) : [],
      problem: String(payload.problem || '').slice(0, 2000),
      suggestion: String(payload.suggestion || '').slice(0, 2000),
    };

    let list = [];
    try {
      list = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf-8'));
      if (!Array.isArray(list)) list = [];
    } catch {
      list = [];
    }
    list.push(entry);

    fs.writeFile(FEEDBACK_FILE, JSON.stringify(list, null, 2), err => {
      if (err) {
        console.error('เขียนไฟล์ feedback.json ไม่สำเร็จ:', err);
        sendJSON(res, 500, { ok: false, error: 'save failed' });
        return;
      }
      console.log(`บันทึก Feedback ใหม่ (${entry.respondent}) — รวมทั้งหมด ${list.length} รายการ`);
      sendJSON(res, 200, { ok: true });
    });
  });
}

const server = http.createServer((req, res) => {
  const { pathname } = url.parse(req.url);

  if (req.method === 'POST' && pathname === '/api/feedback') {
    handleFeedbackPost(req, res);
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(req, res, decodeURIComponent(pathname));
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('405 Method Not Allowed');
});

server.listen(PORT, () => {
  console.log('==================================================');
  console.log(`  เปิดเว็บได้ที่  http://localhost:${PORT}`);
  console.log(`  ฐานข้อมูล Feedback อยู่ที่  ${FEEDBACK_FILE}`);
  console.log('  กด Ctrl+C เพื่อหยุดเซิร์ฟเวอร์');
  console.log('==================================================');
});