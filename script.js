/* ============================================================================
   Eisenhower Life Manager — Application logic
   ----------------------------------------------------------------------------
   สีทั้งหมดในไฟล์นี้อ้างอิงตัวแปร CSS จาก style.css (เช่น var(--q1))
   ถ้าอยากเปลี่ยนสี ให้แก้ที่ style.css ไม่ต้องแก้ไฟล์นี้
   ========================================================================== */


/* ============================================================================
   STATE
   ========================================================================== */
let tasks     = JSON.parse(localStorage.getItem('eisenhower_tasks_deadline')) || [];
let reminders = JSON.parse(localStorage.getItem('quick_reminders'))           || [];
let sessions  = JSON.parse(localStorage.getItem('focus_sessions'))            || [];
let goals     = JSON.parse(localStorage.getItem('user_goals'))                || [];

let calendarDate = new Date();
let selectedDay  = null;
let geoWatchId   = null;
let capturedLoc  = null;
let openTaskId   = null;

/* สีประจำควอดแรนต์ อ้างอิงตัวแปรใน style.css */
const QUADRANT_COLOR = {
  q1: 'var(--q1)',
  q2: 'var(--q2)',
  q3: 'var(--q3)',
  q4: 'var(--q4)',
};

/* ระดับความคืบหน้า ใช้ร่วมกันทั้งงานและเป้าหมาย */
const LEVELS = [
  { min:   0, name: 'ยังไม่เริ่ม',   color: 'var(--level-0)', bg: 'var(--level-0-bg)', text: 'var(--level-0-text)' },
  { min:   1, name: 'เริ่มแล้ว',     color: 'var(--level-1)', bg: 'var(--level-1-bg)', text: 'var(--level-1-text)' },
  { min:  40, name: 'ไปได้ครึ่งทาง', color: 'var(--level-2)', bg: 'var(--level-2-bg)', text: 'var(--level-2-text)' },
  { min:  70, name: 'ใกล้เสร็จ',     color: 'var(--level-3)', bg: 'var(--level-3-bg)', text: 'var(--level-3-text)' },
  { min: 100, name: 'สำเร็จแล้ว',    color: 'var(--level-4)', bg: 'var(--level-4-bg)', text: 'var(--level-4-text)' },
];

function levelOf(pct) {
  let level = LEVELS[0];
  for (const l of LEVELS) if (pct >= l.min) level = l;
  return level;
}



/* ============================================================================
   UTILITIES
   ========================================================================== */
function escapeHtml(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function toDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatMinutes(mins) {
  mins = Math.round(mins);
  if (mins < 60) return `${mins} นาที`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} ชม. ${m} นาที` : `${h} ชม.`;
}

function startOfWeek(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function daysAgoKey(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateKey(d);
}

function progressBar(pct, color, modifier = '') {
  return `<div class="progress ${modifier}">
            <div class="progress__bar" style="width:${pct}%;background:${color}"></div>
          </div>`;
}


/* ============================================================================
   STORAGE
   ========================================================================== */
function saveTasks()     { localStorage.setItem('eisenhower_tasks_deadline', JSON.stringify(tasks)); }
function saveReminders() { localStorage.setItem('quick_reminders', JSON.stringify(reminders)); }
function saveSessions()  { localStorage.setItem('focus_sessions', JSON.stringify(sessions)); }
function saveGoals()     { localStorage.setItem('user_goals', JSON.stringify(goals)); }

function renderAll() {
  renderTasks();
  renderToday();
  renderReminderList();
  renderFocusPanel();
  renderGoals();
  renderStats();
  renderLegends();
  refreshTaskLinkOptions();
  if (!document.getElementById('view-calendar').classList.contains('hidden')) renderCalendar();
}


/* ============================================================================
   TABS
   ========================================================================== */
const TABS = ['today', 'matrix', 'calendar', 'focus', 'goals', 'stats', 'reminders', 'feedback'];

function switchTab(tab) {
  TABS.forEach(t => {
    document.getElementById(`view-${t}`).classList.toggle('hidden', t !== tab);
    document.querySelector(`.tab[data-tab="${t}"]`).classList.toggle('is-active', t === tab);
  });
  if (tab === 'calendar') renderCalendar();
  if (tab === 'today')    renderToday();
  if (tab === 'stats')    renderStats();
  if (tab === 'goals')    renderGoals();
  if (tab === 'focus')    renderFocusPanel();

}


/* ============================================================================
   LEGENDS
   ========================================================================== */
function renderLegends() {
  const html = LEVELS.map(l =>
    `<span class="legend__item" style="background:${l.bg};color:${l.text};padding:var(--space-1) var(--space-2);border-radius:var(--radius-full)">
       <span class="dot" style="background:${l.color}"></span>${l.name}
     </span>`
  ).join('');
  ['level-legend', 'goal-legend'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });
}


/* ============================================================================
   TASKS
   ========================================================================== */
function addTask(e) {
  e.preventDefault();
  const importance = document.getElementById('task-importance').value;
  const urgency    = document.getElementById('task-urgency').value;

  let quadrant;
  if      (importance === 'important'   && urgency === 'urgent')     quadrant = 'q1';
  else if (importance === 'important'   && urgency === 'not-urgent') quadrant = 'q2';
  else if (importance === 'unimportant' && urgency === 'urgent')     quadrant = 'q3';
  else                                                               quadrant = 'q4';

  tasks.push({
    id: Date.now(),
    title: document.getElementById('task-title').value.trim(),
    desc: document.getElementById('task-desc').value.trim(),
    deadline: document.getElementById('task-deadline').value,
    quadrant,
    completed: false,
    progress: 0,
    createdAt: new Date().toISOString(),
    completedAt: null,
  });

  document.getElementById('task-form').reset();
  saveTasks();
  renderAll();
}

function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  saveTasks();
  if (openTaskId === id) closeTaskModal();
  renderAll();
}

function toggleComplete(id) {
  tasks = tasks.map(t => {
    if (t.id === id) {
      t.completed = !t.completed;
      t.progress = t.completed ? 100 : (t.progress === 100 ? 70 : t.progress);
      t.completedAt = t.completed ? new Date().toISOString() : null;
    }
    return t;
  });
  saveTasks();
  renderAll();
  if (openTaskId === id) openTaskModal(id);
}

function setTaskProgress(id, value) {
  const pct = Math.max(0, Math.min(100, parseInt(value, 10) || 0));
  tasks = tasks.map(t => {
    if (t.id === id) {
      t.progress = pct;
      t.completed = pct === 100;
      t.completedAt = t.completed ? (t.completedAt || new Date().toISOString()) : null;
    }
    return t;
  });
  saveTasks();
  renderAll();
  if (openTaskId === id) openTaskModal(id);
}

function formatDeadline(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now  = new Date();
  const diffTime = date - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const formatted = date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  if (diffTime < 0)                  return `<span class="bold" style="color:var(--color-danger)">เลยกำหนด · ${formatted}</span>`;
  if (diffDays === 0)                return `<span class="bold" style="color:var(--color-warning)">ครบกำหนดวันนี้ · ${formatted}</span>`;
  if (diffDays > 0 && diffDays <= 3) return `<span style="color:var(--color-primary)">อีก ${diffDays} วัน · ${formatted}</span>`;
  return `<span class="muted">${formatted}</span>`;
}

function taskFocusMinutes(taskId) {
  return sessions.filter(s => s.taskId === taskId).reduce((sum, s) => sum + s.seconds, 0) / 60;
}

function renderTasks() {
  ['q1', 'q2', 'q3', 'q4'].forEach(q => { document.getElementById(`list-${q}`).innerHTML = ''; });
  const counts = { q1: 0, q2: 0, q3: 0, q4: 0 };

  [...tasks]
    .sort((a, b) => {
      /* งานที่ทำเสร็จแล้วให้ลงไปอยู่ล่างสุดของช่องเสมอ ที่เหลือเรียงตามกำหนดส่ง */
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return new Date(a.deadline) - new Date(b.deadline);
    })
    .forEach(task => {
    counts[task.quadrant]++;
    const pct   = task.completed ? 100 : (task.progress || 0);
    const level = levelOf(pct);
    const mins  = taskFocusMinutes(task.id);

    const card = document.createElement('div');
    card.className = `task-card ${task.completed ? 'is-done' : ''}`;
    card.style.setProperty('--accent', QUADRANT_COLOR[task.quadrant]);
    card.innerHTML = `
      <div class="row row--between row--top">
        <div class="row row--top flex-1">
          <input class="input" type="checkbox" ${task.completed ? 'checked' : ''}
                 onclick="toggleComplete(${task.id})" aria-label="ทำเครื่องหมายว่าเสร็จ">
          <div class="flex-1">
            <button class="btn-link task-card__title" onclick="openTaskModal(${task.id})">${escapeHtml(task.title)}</button>
            ${task.desc ? `<p class="task-card__desc">${escapeHtml(task.desc)}</p>` : ''}
            <div class="task-card__meta">${formatDeadline(task.deadline)}</div>
            <div class="mt-2">
              <div class="row row--between mb-2">
                <span class="badge" style="background:${level.bg};color:${level.text}">${level.name}</span>
                <span class="text-xs faint">${pct}%${mins >= 1 ? ` · โฟกัส ${formatMinutes(mins)}` : ''}</span>
              </div>
              ${progressBar(pct, level.color)}
            </div>
          </div>
        </div>
        <div class="row shrink-0">
          <button class="btn-icon" onclick="renameTask(${task.id})" aria-label="แก้ไขชื่องาน" title="แก้ไขชื่องาน">✎</button>
          <button class="btn-icon" onclick="deleteTask(${task.id})" aria-label="ลบงาน">✕</button>
        </div>
      </div>`;
    document.getElementById(`list-${task.quadrant}`).appendChild(card);
  });

  ['q1', 'q2', 'q3', 'q4'].forEach(q => {
    document.getElementById(`count-${q}`).innerText = counts[q];
    if (!counts[q]) document.getElementById(`list-${q}`).innerHTML = '<p class="empty">ยังไม่มีงานในช่องนี้</p>';
  });
}

/* --- รายละเอียดงาน --- */
function openTaskModal(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  openTaskId = id;

  const pct   = task.completed ? 100 : (task.progress || 0);
  const level = levelOf(pct);
  const mins  = taskFocusMinutes(id);
  const recent = sessions.filter(s => s.taskId === id).slice(-5).reverse();

  document.getElementById('modal-title').innerText = task.title;
  document.getElementById('modal-body').innerHTML = `
    <div>
      <label class="label" for="modal-title-input">ชื่องาน</label>
      <input class="input" type="text" id="modal-title-input" value="${escapeHtml(task.title)}"
             onkeydown="if(event.key==='Enter'){event.preventDefault();saveTaskTitle(${id});}">
      <div class="row row--between mt-2">
        <button class="btn btn--primary btn--sm" onclick="saveTaskTitle(${id})">บันทึกชื่อ</button>
        <span id="modal-title-status" class="text-xs" style="color:var(--color-success)"></span>
      </div>
    </div>

    <div>
      <label class="label" for="modal-desc">คำอธิบาย</label>
      <textarea class="textarea" id="modal-desc" rows="4"
        placeholder="เพิ่มรายละเอียด ขั้นตอน หรือสิ่งที่ต้องเตรียม">${escapeHtml(task.desc || '')}</textarea>
      <button class="btn btn--primary btn--sm mt-2" onclick="saveTaskDesc(${id})">บันทึกคำอธิบาย</button>
    </div>

    <div>
      <p class="label">กำหนดส่ง</p>
      <p class="text-sm">${formatDeadline(task.deadline)}</p>
    </div>

    <div>
      <div class="row row--between mb-2">
        <p class="label" style="margin:0">ความคืบหน้า</p>
        <span class="badge" style="background:${level.bg};color:${level.text}">${level.name} · ${pct}%</span>
      </div>
      <input class="input" type="range" min="0" max="100" step="5" value="${pct}"
             oninput="document.getElementById('modal-pct').innerText = this.value + '%'"
             onchange="setTaskProgress(${id}, this.value)">
      <p class="text-xs faint text-end"><span id="modal-pct">${pct}%</span></p>
    </div>

    <div>
      <p class="label">เวลาที่ใช้กับงานนี้</p>
      <p class="text-sm bold">${mins >= 1 ? formatMinutes(mins) : 'ยังไม่มีการจับเวลา'}</p>
      ${recent.length ? `<ul class="text-xs muted mt-2" style="padding-inline-start:1.1rem">${recent.map(s =>
        `<li>${s.date} · ${escapeHtml(s.activity)} · ${formatMinutes(s.seconds / 60)}${s.note ? ` · ${escapeHtml(s.note)}` : ''}</li>`
      ).join('')}</ul>` : ''}
      <button class="btn btn--success btn--sm mt-2" onclick="focusOnTask(${id})">จับเวลาทำงานนี้</button>
    </div>`;

  document.getElementById('task-modal').classList.add('is-open');
}

function closeTaskModal() {
  openTaskId = null;
  document.getElementById('task-modal').classList.remove('is-open');
}

function saveTaskDesc(id) {
  const value = document.getElementById('modal-desc').value.trim();
  tasks = tasks.map(t => { if (t.id === id) t.desc = value; return t; });
  saveTasks();
  renderAll();
}

/* แก้ไขชื่องานที่บันทึกผิด */
function saveTaskTitle(id) {
  const input = document.getElementById('modal-title-input');
  const value = input.value.trim();
  if (!value) { alert('ชื่องานว่างไม่ได้'); input.focus(); return; }

  tasks = tasks.map(t => { if (t.id === id) t.title = value; return t; });
  saveTasks();
  renderAll();

  document.getElementById('modal-title').innerText = value;
  const status = document.getElementById('modal-title-status');
  if (status) {
    status.innerText = 'บันทึกชื่อใหม่แล้ว';
    setTimeout(() => { status.innerText = ''; }, 2000);
  }
}

/* เปิดหน้ารายละเอียดแล้วโฟกัสที่ช่องชื่อทันที ใช้กับปุ่มดินสอบนการ์ด */
function renameTask(id) {
  openTaskModal(id);
  const input = document.getElementById('modal-title-input');
  input.focus();
  input.select();
}

function focusOnTask(id) {
  closeTaskModal();
  switchTab('focus');
  refreshTaskLinkOptions();
  document.getElementById('focus-task-link').value = String(id);
}


/* ============================================================================
   TODAY
   ========================================================================== */
function renderToday() {
  const now = new Date();
  const overdueEl  = document.getElementById('today-overdue');
  const dueEl      = document.getElementById('today-due');
  const remEl      = document.getElementById('today-reminders');
  const timelineEl = document.getElementById('today-timeline');
  [overdueEl, dueEl, remEl, timelineEl].forEach(el => el.innerHTML = '');

  const overdue  = tasks.filter(t => !t.completed && t.deadline && new Date(t.deadline) < now && !isSameDay(new Date(t.deadline), now));
  const dueToday = tasks.filter(t => !t.completed && t.deadline && isSameDay(new Date(t.deadline), now));

  overdue.length ? overdue.forEach(t => overdueEl.appendChild(miniTaskRow(t)))
                 : overdueEl.innerHTML = '<p class="empty">ไม่มีงานค้าง</p>';
  dueToday.length ? dueToday.forEach(t => dueEl.appendChild(miniTaskRow(t)))
                  : dueEl.innerHTML = '<p class="empty">วันนี้ไม่มีเดดไลน์</p>';

  const todaysReminders = reminders.filter(r => r.type !== 'once' || isSameDay(new Date(r.datetime), now));
  todaysReminders.length ? todaysReminders.forEach(r => remEl.appendChild(miniReminderRow(r)))
                         : remEl.innerHTML = '<p class="empty">ยังไม่มีรายการเตือน</p>';

  /* --- ตัวเลขสรุป --- */
  const todayKey = toDateKey(now);
  const focusToday = minutesOnDate(todayKey);
  const focusYesterday = minutesOnDate(daysAgoKey(1));
  document.getElementById('kpi-focus-today').innerText = formatMinutes(focusToday);

  const diff = focusToday - focusYesterday;
  const focusNote = document.getElementById('kpi-focus-compare');
  if (focusToday === 0 && focusYesterday === 0) {
    focusNote.innerText = 'ยังไม่มีการจับเวลาวันนี้';
    focusNote.className = 'kpi__note';
  } else if (diff >= 0) {
    focusNote.innerText = `มากกว่าเมื่อวาน ${formatMinutes(diff)}`;
    focusNote.className = 'kpi__note kpi__note--up';
  } else {
    focusNote.innerText = `น้อยกว่าเมื่อวาน ${formatMinutes(-diff)}`;
    focusNote.className = 'kpi__note kpi__note--down';
  }

  const thisWeekStart = startOfWeek(now);
  const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const doneThisWeek = tasks.filter(t => t.completedAt && new Date(t.completedAt) >= thisWeekStart).length;
  const doneLastWeek = tasks.filter(t => t.completedAt && new Date(t.completedAt) >= lastWeekStart && new Date(t.completedAt) < thisWeekStart).length;
  document.getElementById('kpi-done-week').innerText = `${doneThisWeek} งาน`;

  const doneNote = document.getElementById('kpi-done-compare');
  doneNote.innerText = doneThisWeek >= doneLastWeek
    ? `สัปดาห์ก่อนปิดได้ ${doneLastWeek} งาน`
    : `ช้ากว่าสัปดาห์ก่อน (${doneLastWeek} งาน)`;
  doneNote.className = `kpi__note ${doneThisWeek >= doneLastWeek ? 'kpi__note--up' : 'kpi__note--down'}`;

  document.getElementById('kpi-streak').innerText = `${currentStreak()} วัน`;

  /* --- เป้าหมาย --- */
  const goalsEl = document.getElementById('today-goals');
  goalsEl.innerHTML = '';
  if (!goals.length) goalsEl.innerHTML = '<p class="empty">ยังไม่ได้ตั้งเป้าหมาย เริ่มได้ที่แท็บเป้าหมาย</p>';
  else goals.forEach(g => goalsEl.appendChild(goalBar(g, true)));

  /* --- ไทม์ไลน์ --- */
  const items = [];
  dueToday.forEach(t => items.push({ time: new Date(t.deadline), label: `📌 ${escapeHtml(t.title)}`, color: QUADRANT_COLOR[t.quadrant] }));
  reminders.forEach(r => {
    if (r.type === 'time') {
      const [h, m] = r.time.split(':');
      const d = new Date(); d.setHours(h, m, 0, 0);
      items.push({ time: d, label: `🔔 ${escapeHtml(r.text)} (ทุกวัน)`, color: 'var(--color-primary)' });
    } else if (r.type === 'once' && isSameDay(new Date(r.datetime), now)) {
      items.push({ time: new Date(r.datetime), label: `🔔 ${escapeHtml(r.text)}`, color: 'var(--color-primary)' });
    } else if (r.type === 'location') {
      items.push({ time: null, label: `📍 ${escapeHtml(r.text)} (เมื่อถึง ${escapeHtml(r.label || 'สถานที่ที่กำหนด')})`, color: 'var(--color-success)' });
    }
  });
  sessions.filter(s => s.date === todayKey).forEach(s => {
    items.push({ time: new Date(s.endedAt), label: `⏱️ ${escapeHtml(s.activity)} · ${formatMinutes(s.seconds / 60)}`, color: 'var(--color-info)' });
  });
  items.sort((a, b) => (a.time ? a.time.getTime() : Infinity) - (b.time ? b.time.getTime() : Infinity));

  if (!items.length) {
    timelineEl.innerHTML = '<p class="empty">วันนี้ยังว่าง เพิ่มงานหรือเริ่มจับเวลาได้เลย</p>';
  } else {
    items.forEach(it => {
      const row = document.createElement('div');
      row.className = 'timeline-row';
      const timeLabel = it.time ? it.time.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '--:--';
      row.innerHTML = `<span class="dot" style="background:${it.color}"></span>
                       <span class="timeline-row__time">${timeLabel}</span>
                       <span class="text-sm">${it.label}</span>`;
      timelineEl.appendChild(row);
    });
  }
}

function miniTaskRow(t) {
  const pct = t.completed ? 100 : (t.progress || 0);
  const level = levelOf(pct);
  const row = document.createElement('div');
  row.className = 'list-row';
  row.innerHTML = `
    <div class="row row--between">
      <button class="btn-link text-sm" onclick="openTaskModal(${t.id})">${escapeHtml(t.title)}</button>
      <span class="text-xs faint shrink-0">${new Date(t.deadline).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
    </div>
    <div class="mt-1">${progressBar(pct, level.color, 'progress--thin')}</div>`;
  return row;
}

function miniReminderRow(r) {
  const row = document.createElement('div');
  row.className = 'list-row row row--between';
  const sub = r.type === 'time' ? `ทุกวัน ${r.time}`
            : r.type === 'once' ? new Date(r.datetime).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
            : `📍 ${escapeHtml(r.label || 'สถานที่')}`;
  row.innerHTML = `<span class="text-sm">${escapeHtml(r.text)}</span><span class="text-xs faint">${sub}</span>`;
  return row;
}


/* ============================================================================
   CALENDAR
   ========================================================================== */
function changeMonth(delta) {
  calendarDate.setMonth(calendarDate.getMonth() + delta);
  renderCalendar();
}

function dayProgress(key) {
  const dayTasks = tasks.filter(t => t.deadline && toDateKey(new Date(t.deadline)) === key);
  if (!dayTasks.length) return null;
  return Math.round(dayTasks.reduce((s, t) => s + (t.completed ? 100 : (t.progress || 0)), 0) / dayTasks.length);
}

function renderCalendar() {
  const year  = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  document.getElementById('calendar-title').innerText =
    calendarDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });

  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  const startOffset = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  for (let i = 0; i < startOffset; i++) grid.appendChild(document.createElement('div'));

  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(year, month, day);
    const key = toDateKey(cellDate);

    const cell = document.createElement('div');
    cell.className = `day-cell ${isSameDay(cellDate, today) ? 'is-today' : ''} ${key === selectedDay ? 'is-selected' : ''}`;
    cell.onclick = () => selectDay(key);

    const dayTasks  = tasks.filter(t => t.deadline && toDateKey(new Date(t.deadline)) === key);
    const pct       = dayProgress(key);
    const focusMins = minutesOnDate(key);

    const dots = dayTasks.slice(0, 4)
      .map(t => `<span class="dot" style="background:${QUADRANT_COLOR[t.quadrant]}"></span>`).join('');

    cell.innerHTML = `
      <div class="row row--between">
        <span class="day-cell__number">${day}</span>
        ${focusMins >= 1 ? '<span class="dot" style="background:var(--color-info)" title="มีการจับเวลา"></span>' : ''}
      </div>
      <div class="day-cell__dots">${dots}</div>
      ${pct !== null ? `<div class="day-cell__progress">
          ${progressBar(pct, levelOf(pct).color, 'progress--thin')}
          <span class="day-cell__pct">${pct}%</span>
        </div>` : ''}`;
    grid.appendChild(cell);
  }

  if (selectedDay) renderSelectedDay();
}

function selectDay(key) {
  selectedDay = key;
  renderCalendar();
  renderSelectedDay();
}

function renderSelectedDay() {
  const d = new Date(selectedDay + 'T00:00:00');
  document.getElementById('selected-day-title').innerText =
    d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('add-on-day-btn').classList.remove('hidden');

  const dayTasks  = tasks.filter(t => t.deadline && toDateKey(new Date(t.deadline)) === selectedDay);
  const pct       = dayProgress(selectedDay);
  const focusMins = minutesOnDate(selectedDay);

  document.getElementById('selected-day-summary').innerHTML = `
    <div class="list-row">
      <div class="row row--between mb-2">
        <span class="text-xs muted">ความคืบหน้ารวมของวันนี้</span>
        <span class="text-xs bold" style="color:${pct !== null ? levelOf(pct).text : 'var(--color-text-faint)'}">
          ${pct !== null ? pct + '%' : 'ไม่มีงาน'}
        </span>
      </div>
      ${progressBar(pct || 0, pct !== null ? levelOf(pct).color : 'var(--color-border-strong)')}
      <p class="text-xs faint mt-2">เวลาโฟกัสวันนั้น ${focusMins >= 1 ? formatMinutes(focusMins) : 'ยังไม่มี'}</p>
    </div>`;

  const listEl = document.getElementById('selected-day-list');
  listEl.innerHTML = '';
  if (!dayTasks.length) {
    listEl.innerHTML = '<p class="empty">ไม่มีงานครบกำหนดในวันนี้ กดปุ่มด้านบนเพื่อเพิ่ม</p>';
    return;
  }

  dayTasks.forEach(t => {
    const p = t.completed ? 100 : (t.progress || 0);
    const level = levelOf(p);
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `
      <div class="row row--between">
        <span class="row flex-1">
          <span class="dot" style="background:${QUADRANT_COLOR[t.quadrant]}"></span>
          <button class="btn-link text-sm truncate ${t.completed ? 'faint' : ''}" onclick="openTaskModal(${t.id})">${escapeHtml(t.title)}</button>
        </span>
        <span class="text-xs faint shrink-0">${new Date(t.deadline).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      ${t.desc ? `<p class="text-xs muted truncate mt-1">${escapeHtml(t.desc)}</p>` : ''}
      <div class="row mt-2">
        ${progressBar(p, level.color, 'progress--thin')}
        <span class="text-xs faint shrink-0">${p}%</span>
      </div>`;
    row.querySelector('.progress').style.flex = '1';
    listEl.appendChild(row);
  });
}

function addTaskOnSelectedDay() {
  if (!selectedDay) return;
  switchTab('matrix');
  document.getElementById('task-deadline').value = `${selectedDay}T09:00`;
  document.getElementById('task-title').focus();
}


/* ============================================================================
   STOPWATCH / SESSIONS
   ========================================================================== */
let stopwatchStart = null;
let stopwatchInterval = null;

function startStopwatch() {
  stopwatchStart = Date.now();
  const activity = document.getElementById('focus-activity').value;

  document.getElementById('stopwatch-activity').innerText = `กำลังจับเวลา: ${activity}`;
  document.getElementById('stopwatch-box').classList.add('is-running');
  document.getElementById('stopwatch-start').classList.add('hidden');
  document.getElementById('stopwatch-stop').classList.remove('hidden');
  ['focus-activity', 'focus-task-link'].forEach(id => document.getElementById(id).disabled = true);

  stopwatchInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - stopwatchStart) / 1000);
    const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
    const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    document.getElementById('stopwatch-display').innerText = `${h}:${m}:${s}`;
  }, 1000);
}

function stopStopwatch() {
  if (!stopwatchStart) return;
  const seconds = Math.floor((Date.now() - stopwatchStart) / 1000);
  clearInterval(stopwatchInterval);

  if (seconds < 10) {
    alert('ช่วงเวลาสั้นเกินไป (น้อยกว่า 10 วินาที) ระบบจะไม่บันทึกครั้งนี้');
  } else {
    const taskIdRaw = document.getElementById('focus-task-link').value;
    sessions.push({
      id: Date.now(),
      activity: document.getElementById('focus-activity').value,
      taskId: taskIdRaw ? Number(taskIdRaw) : null,
      note: document.getElementById('focus-note').value.trim(),
      seconds,
      date: toDateKey(new Date()),
      endedAt: new Date().toISOString(),
    });
    saveSessions();
  }

  stopwatchStart = null;
  document.getElementById('stopwatch-display').innerText = '00:00:00';
  document.getElementById('stopwatch-activity').innerText = 'บันทึกเรียบร้อย พร้อมเริ่มรอบใหม่';
  document.getElementById('stopwatch-box').classList.remove('is-running');
  document.getElementById('focus-note').value = '';
  document.getElementById('stopwatch-start').classList.remove('hidden');
  document.getElementById('stopwatch-stop').classList.add('hidden');
  ['focus-activity', 'focus-task-link'].forEach(id => document.getElementById(id).disabled = false);
  renderAll();
}

function openManualSession() {
  const input = prompt('บันทึกเวลาย้อนหลังกี่นาที?', '30');
  if (input === null) return;
  const m = parseInt(input, 10);
  if (!m || m <= 0) { alert('กรุณาใส่จำนวนนาทีเป็นตัวเลขที่มากกว่า 0'); return; }

  const taskIdRaw = document.getElementById('focus-task-link').value;
  sessions.push({
    id: Date.now(),
    activity: document.getElementById('focus-activity').value,
    taskId: taskIdRaw ? Number(taskIdRaw) : null,
    note: document.getElementById('focus-note').value.trim() || 'บันทึกย้อนหลัง',
    seconds: m * 60,
    date: toDateKey(new Date()),
    endedAt: new Date().toISOString(),
  });
  saveSessions();
  document.getElementById('focus-note').value = '';
  renderAll();
}

function deleteSession(id) {
  sessions = sessions.filter(s => s.id !== id);
  saveSessions();
  renderAll();
}

function minutesOnDate(key) {
  return sessions.filter(s => s.date === key).reduce((sum, s) => sum + s.seconds, 0) / 60;
}

function refreshTaskLinkOptions() {
  const select = document.getElementById('focus-task-link');
  if (!select) return;
  const current = select.value;
  const open = tasks.filter(t => !t.completed);
  select.innerHTML = '<option value="">— ไม่ผูกกับงานใด —</option>' +
    open.map(t => `<option value="${t.id}">${escapeHtml(t.title)}</option>`).join('');
  if (open.some(t => String(t.id) === current)) select.value = current;
}

function renderFocusPanel() {
  const el = document.getElementById('focus-by-activity');
  if (!el) return;

  const cutoff = daysAgoKey(6);
  const byActivity = {};
  sessions.filter(s => s.date >= cutoff).forEach(s => {
    byActivity[s.activity] = (byActivity[s.activity] || 0) + s.seconds / 60;
  });
  const entries = Object.entries(byActivity).sort((a, b) => b[1] - a[1]);

  if (!entries.length) {
    el.innerHTML = '<p class="empty">ยังไม่มีข้อมูล 7 วันล่าสุด กดเริ่มจับเวลาเพื่อเก็บสถิติแรก</p>';
  } else {
    const max = entries[0][1];
    el.innerHTML = entries.map(([act, mins]) => `
      <div class="bar-row">
        <div class="bar-row__head">
          <span class="bar-row__name">${escapeHtml(act)}</span>
          <span class="bar-row__value">${formatMinutes(mins)}</span>
        </div>
        ${progressBar((mins / max) * 100, 'var(--color-primary)')}
      </div>`).join('');
  }

  const listEl = document.getElementById('session-list');
  listEl.innerHTML = '';
  const history = [...sessions].sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt)).slice(0, 40);
  if (!history.length) {
    listEl.innerHTML = '<p class="empty">ยังไม่มีประวัติ</p>';
    return;
  }
  history.forEach(s => {
    const linked = s.taskId ? tasks.find(t => t.id === s.taskId) : null;
    const row = document.createElement('div');
    row.className = 'list-row list-row--bordered row row--between';
    row.innerHTML = `
      <div class="flex-1">
        <p class="text-sm">${escapeHtml(s.activity)} · ${formatMinutes(s.seconds / 60)}</p>
        <p class="text-xs faint truncate">${s.date}${linked ? ` · งาน: ${escapeHtml(linked.title)}` : ''}${s.note ? ` · ${escapeHtml(s.note)}` : ''}</p>
      </div>
      <button class="btn-icon" onclick="deleteSession(${s.id})" aria-label="ลบรายการ">✕</button>`;
    listEl.appendChild(row);
  });
}


/* ============================================================================
   GOALS
   ========================================================================== */
function addGoal(e) {
  e.preventDefault();
  goals.push({
    id: Date.now(),
    title: document.getElementById('goal-title').value.trim(),
    activity: document.getElementById('goal-activity').value,
    target: parseInt(document.getElementById('goal-target').value, 10),
    period: document.getElementById('goal-period').value,
    createdAt: new Date().toISOString(),
  });
  document.getElementById('goal-form').reset();
  saveGoals();
  renderAll();
}

function deleteGoal(id) {
  goals = goals.filter(g => g.id !== id);
  saveGoals();
  renderAll();
}

function goalPeriodRange(period) {
  const now = new Date();
  if (period === 'day') {
    const s = new Date(now); s.setHours(0, 0, 0, 0);
    return { start: s, label: 'วันนี้' };
  }
  if (period === 'week') return { start: startOfWeek(now), label: 'สัปดาห์นี้' };
  return { start: new Date(now.getFullYear(), now.getMonth(), 1), label: 'เดือนนี้' };
}

function goalProgress(goal) {
  const { start, label } = goalPeriodRange(goal.period);
  const mins = sessions
    .filter(s => new Date(s.endedAt) >= start)
    .filter(s => goal.activity === '__all__' || s.activity === goal.activity)
    .reduce((sum, s) => sum + s.seconds / 60, 0);
  const pct = goal.target > 0 ? Math.min(100, Math.round((mins / goal.target) * 100)) : 0;
  return { mins, pct, label };
}

function goalBar(goal, compact) {
  const { mins, pct, label } = goalProgress(goal);
  const level = levelOf(pct);
  const wrap = document.createElement('div');

  if (compact) {
    wrap.innerHTML = `
      <div class="row row--between mb-2">
        <span class="text-xs muted">${escapeHtml(goal.title)}</span>
        <span class="text-xs" style="color:${level.text}">${level.name} · ${pct}%</span>
      </div>
      ${progressBar(pct, level.color)}
      <p class="text-xs faint mt-1">${label} ทำได้ ${formatMinutes(mins)} จากเป้า ${formatMinutes(goal.target)}</p>`;
    return wrap;
  }

  const remaining = Math.max(0, goal.target - mins);
  wrap.className = 'card';
  wrap.innerHTML = `
    <div class="row row--between row--top mb-3">
      <div>
        <h4>${escapeHtml(goal.title)}</h4>
        <p class="text-xs muted mt-1">${goal.activity === '__all__' ? 'รวมทุกกิจกรรม' : escapeHtml(goal.activity)} · เป้า ${formatMinutes(goal.target)} ${label}</p>
      </div>
      <button class="btn-icon" onclick="deleteGoal(${goal.id})" aria-label="ลบเป้าหมาย">✕</button>
    </div>

    <div class="row row--between mb-2">
      <span class="badge" style="background:${level.bg};color:${level.text}">${level.name}</span>
      <span class="kpi__value" style="color:${level.color};margin:0">${pct}%</span>
    </div>

    ${progressBar(pct, level.color, 'progress--thick')}

    <div class="row row--between mt-2 text-xs muted">
      <span>ทำได้ ${formatMinutes(mins)}</span>
      <span>${remaining > 0 ? `เหลืออีก ${formatMinutes(remaining)}` : 'ถึงเป้าแล้ว'}</span>
    </div>

    <div class="level-track">
      ${LEVELS.map(l => `<div class="level-track__seg" title="${l.name}"
         style="${pct >= l.min ? `background:${l.color}` : ''}"></div>`).join('')}
    </div>`;
  return wrap;
}

function renderGoals() {
  const listEl = document.getElementById('goal-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  if (!goals.length) {
    listEl.innerHTML = '<div class="card card--dashed"><p class="text-sm muted">ยังไม่มีเป้าหมาย ตั้งเป้าแรกจากฟอร์มด้านซ้ายเพื่อเริ่มเก็บสถิติ</p></div>';
    return;
  }
  goals.forEach(g => listEl.appendChild(goalBar(g, false)));
}


/* ============================================================================
   STATISTICS
   ========================================================================== */
function currentStreak() {
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    if (minutesOnDate(daysAgoKey(i)) >= 1) streak++;
    else if (i > 0) break;
  }
  return streak;
}

function renderStats() {
  const chartEl = document.getElementById('stat-chart');
  if (!chartEl) return;

  const range = parseInt(document.getElementById('stat-range').value, 10) || 7;

  const days = [];
  for (let i = range - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push({ key: toDateKey(d), date: d, mins: minutesOnDate(toDateKey(d)) });
  }

  /* --- ตัวเลขสรุป --- */
  const last7 = days.slice(-7).reduce((s, d) => s + d.mins, 0);
  const prev7 = Array.from({ length: 7 }, (_, i) => daysAgoKey(i + 7))
    .reduce((s, k) => s + minutesOnDate(k), 0);

  document.getElementById('stat-week-total').innerText = formatMinutes(last7);

  const trendEl = document.getElementById('stat-week-trend');
  if (prev7 === 0 && last7 === 0) {
    trendEl.innerText = 'ยังไม่มีข้อมูลเปรียบเทียบ';
    trendEl.className = 'kpi__note';
  } else if (last7 >= prev7) {
    trendEl.innerText = `เพิ่มขึ้น ${formatMinutes(last7 - prev7)} จาก 7 วันก่อนหน้า`;
    trendEl.className = 'kpi__note kpi__note--up';
  } else {
    trendEl.innerText = `ลดลง ${formatMinutes(prev7 - last7)} จาก 7 วันก่อนหน้า`;
    trendEl.className = 'kpi__note kpi__note--down';
  }

  document.getElementById('stat-daily-avg').innerText = formatMinutes(last7 / 7);

  const completed = tasks.filter(t => t.completed && t.completedAt && t.deadline);
  const onTime = completed.filter(t => new Date(t.completedAt) <= new Date(t.deadline)).length;
  document.getElementById('stat-ontime').innerText = completed.length ? `${Math.round((onTime / completed.length) * 100)}%` : '—';
  document.getElementById('stat-ontime-detail').innerText = completed.length
    ? `ทันกำหนด ${onTime} จาก ${completed.length} งานที่ปิดแล้ว`
    : 'ยังไม่มีงานที่ปิดแล้ว';

  const openTasks = tasks.filter(t => !t.completed);
  const avgProgress = openTasks.length
    ? Math.round(openTasks.reduce((s, t) => s + (t.progress || 0), 0) / openTasks.length) : 0;
  document.getElementById('stat-avg-progress').innerText = `${avgProgress}%`;
  document.getElementById('stat-open-count').innerText = `จากงานที่ยังไม่ปิด ${openTasks.length} งาน`;

  /* --- กราฟแนวโน้ม (SVG) --- */
  const W = 720, H = 220, PAD_L = 42, PAD_R = 8, PAD_T = 12, PAD_B = 28;
  const maxMins = Math.max(60, ...days.map(d => d.mins));
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const step  = plotW / days.length;
  const barW  = Math.max(4, Math.min(28, step * 0.6));
  const todayKey = toDateKey(new Date());

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const y = PAD_T + plotH * (1 - f);
    return `<line x1="${PAD_L}" y1="${y}" x2="${W - PAD_R}" y2="${y}" style="stroke:var(--chart-grid);stroke-width:1"/>
            <text x="${PAD_L - 6}" y="${y + 4}" text-anchor="end" style="font-size:10px;fill:var(--color-text-faint)">${Math.round(maxMins * f)}</text>`;
  }).join('');

  const bars = days.map((d, i) => {
    const x = PAD_L + step * i + (step - barW) / 2;
    const h = (d.mins / maxMins) * plotH;
    const y = PAD_T + plotH - h;
    const fill = d.key === todayKey ? 'var(--chart-bar-today)' : 'var(--chart-bar)';
    return `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(h, d.mins > 0 ? 2 : 0)}" rx="3"
              style="fill:${fill}"><title>${d.key} · ${formatMinutes(d.mins)}</title></rect>`;
  }).join('');

  const smoothed = days.map((d, i) => {
    const slice = days.slice(Math.max(0, i - 2), i + 1);
    return slice.reduce((s, x) => s + x.mins, 0) / slice.length;
  });
  const linePoints = smoothed.map((v, i) => {
    const x = PAD_L + step * i + step / 2;
    const y = PAD_T + plotH - (v / maxMins) * plotH;
    return `${x},${y}`;
  }).join(' ');

  const labelEvery = Math.ceil(days.length / 10);
  const xLabels = days.map((d, i) => {
    if (i % labelEvery !== 0) return '';
    const x = PAD_L + step * i + step / 2;
    return `<text x="${x}" y="${H - 8}" text-anchor="middle" style="font-size:10px;fill:var(--color-text-faint)">${d.date.getDate()}/${d.date.getMonth() + 1}</text>`;
  }).join('');

  chartEl.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="กราฟแนวโน้มเวลาโฟกัสรายวัน">
      ${gridLines}${bars}
      <polyline points="${linePoints}" style="fill:none;stroke:var(--chart-line);stroke-width:2;stroke-linejoin:round"/>
      ${xLabels}
    </svg>
    <div class="legend mt-2">
      <span class="legend__item"><span class="legend__swatch" style="background:var(--chart-bar)"></span>เวลาโฟกัสรายวัน (นาที)</span>
      <span class="legend__item"><span class="legend__line"></span>ค่าเฉลี่ยเคลื่อนที่ 3 วัน</span>
    </div>`;

  /* --- งานที่ปิดได้รายสัปดาห์ --- */
  const weeks = [];
  for (let i = 5; i >= 0; i--) {
    const start = startOfWeek(new Date());
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    weeks.push({
      start,
      count: tasks.filter(t => t.completedAt && new Date(t.completedAt) >= start && new Date(t.completedAt) < end).length,
    });
  }
  const maxWeek = Math.max(1, ...weeks.map(w => w.count));
  document.getElementById('stat-weekly-done').innerHTML = weeks.map(w => `
    <div class="bar-row bar-row--inline">
      <span class="bar-row__name">${w.start.getDate()}/${w.start.getMonth() + 1}</span>
      ${progressBar((w.count / maxWeek) * 100, 'var(--color-success)')}
      <span class="bar-row__value">${w.count} งาน</span>
    </div>`).join('');

  /* --- สัดส่วนกิจกรรม --- */
  const cutoff = daysAgoKey(range - 1);
  const inRange = sessions.filter(s => s.date >= cutoff);
  const total = inRange.reduce((s, x) => s + x.seconds, 0) / 60;
  const by = {};
  inRange.forEach(s => { by[s.activity] = (by[s.activity] || 0) + s.seconds / 60; });
  const split = Object.entries(by).sort((a, b) => b[1] - a[1]);

  document.getElementById('stat-activity-split').innerHTML = split.length
    ? split.map(([act, mins], i) => {
        const share = total ? Math.round((mins / total) * 100) : 0;
        return `
          <div class="bar-row">
            <div class="bar-row__head">
              <span class="bar-row__name">${escapeHtml(act)}</span>
              <span class="bar-row__value">${share}% · ${formatMinutes(mins)}</span>
            </div>
            ${progressBar(share, `var(--chart-${(i % 6) + 1})`)}
          </div>`;
      }).join('')
    : '<p class="empty">ยังไม่มีข้อมูลในช่วงที่เลือก</p>';
}


/* ============================================================================
   REMINDERS
   ========================================================================== */
function renderReminderTypeFields() {
  const type = document.getElementById('reminder-type').value;
  const container = document.getElementById('reminder-type-fields');

  if (type === 'time') {
    container.innerHTML = `
      <div class="field">
        <label class="label" for="reminder-time">เวลาที่จะเตือนทุกวัน</label>
        <input class="input" type="time" id="reminder-time" required>
      </div>`;
  } else if (type === 'once') {
    container.innerHTML = `
      <div class="field">
        <label class="label" for="reminder-datetime">วันและเวลา</label>
        <input class="input" type="datetime-local" id="reminder-datetime" required>
      </div>`;
  } else {
    container.innerHTML = `
      <div class="field">
        <label class="label" for="reminder-loc-label">ชื่อสถานที่</label>
        <input class="input" type="text" id="reminder-loc-label" placeholder="เช่น หน้าประตูบ้าน">
        <button class="btn btn--block mt-2" type="button" onclick="captureLocation()">ใช้ตำแหน่งปัจจุบันเป็นจุดเตือน</button>
        <p id="loc-status" class="text-xs faint mt-1"></p>
      </div>
      <div class="field">
        <label class="label" for="reminder-radius">รัศมีแจ้งเตือน (เมตร)</label>
        <input class="input" type="number" id="reminder-radius" value="150" min="20">
      </div>`;
  }
}

function captureLocation() {
  const status = document.getElementById('loc-status');
  if (!navigator.geolocation) { status.innerText = 'อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง'; return; }
  status.innerText = 'กำลังค้นหาตำแหน่ง...';
  navigator.geolocation.getCurrentPosition(
    pos => {
      capturedLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      status.innerText = `บันทึกตำแหน่งแล้ว (${capturedLoc.lat.toFixed(5)}, ${capturedLoc.lng.toFixed(5)})`;
    },
    () => { status.innerText = 'เข้าถึงตำแหน่งไม่ได้ ตรวจสอบการอนุญาตตำแหน่งในเบราว์เซอร์'; }
  );
}

function requestNotifPermission() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  const note = document.getElementById('notif-permission-note');
  if (note) note.classList.toggle('hidden', !('Notification' in window) || Notification.permission === 'granted');
}

function addReminder(e) {
  e.preventDefault();
  requestNotifPermission();

  const type = document.getElementById('reminder-type').value;
  const reminder = {
    id: Date.now(),
    text: document.getElementById('reminder-text').value.trim(),
    type,
    lastFiredDate: null,
    done: false,
  };

  if (type === 'time') {
    reminder.time = document.getElementById('reminder-time').value;
  } else if (type === 'once') {
    reminder.datetime = document.getElementById('reminder-datetime').value;
  } else {
    if (!capturedLoc) { alert('กดปุ่มใช้ตำแหน่งปัจจุบันก่อนบันทึก'); return; }
    reminder.label  = document.getElementById('reminder-loc-label').value;
    reminder.lat    = capturedLoc.lat;
    reminder.lng    = capturedLoc.lng;
    reminder.radius = parseInt(document.getElementById('reminder-radius').value, 10) || 150;
    capturedLoc = null;
    startLocationWatch();
  }

  reminders.push(reminder);
  document.getElementById('reminder-form').reset();
  renderReminderTypeFields();
  saveReminders();
  renderAll();
}

function deleteReminder(id) {
  reminders = reminders.filter(r => r.id !== id);
  saveReminders();
  renderAll();
}

function renderReminderList() {
  const listEl = document.getElementById('reminder-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  if (!reminders.length) {
    listEl.innerHTML = '<p class="empty">ยังไม่มีรายการ เพิ่มเรื่องที่มักลืม เช่น กินยา หรือทิ้งขยะ</p>';
    return;
  }

  reminders.forEach(r => {
    const icon = r.type === 'time' ? '⏰' : r.type === 'once' ? '📆' : '📍';
    const sub  = r.type === 'time' ? `ทุกวัน เวลา ${r.time} น.`
               : r.type === 'once' ? new Date(r.datetime).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
               : `เมื่อถึง ${escapeHtml(r.label || 'จุดที่กำหนด')} (รัศมี ${r.radius} ม.)`;

    const row = document.createElement('div');
    row.className = 'list-row list-row--bordered row row--between';
    row.innerHTML = `
      <div>
        <p class="text-sm">${icon} ${escapeHtml(r.text)}</p>
        <p class="text-xs faint">${sub}</p>
      </div>
      <button class="btn-icon" onclick="deleteReminder(${r.id})" aria-label="ลบการเตือน">✕</button>`;
    listEl.appendChild(row);
  });
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function notify(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body });
  else console.log('[เตือนความจำ]', title, body);
}

function checkTimeAndOnceReminders() {
  const now = new Date();
  const todayKey = toDateKey(now);
  const hhmm = now.toTimeString().slice(0, 5);
  let changed = false;

  reminders.forEach(r => {
    if (r.type === 'time' && r.time === hhmm && r.lastFiredDate !== todayKey) {
      notify('ถึงเวลาแล้ว', r.text);
      r.lastFiredDate = todayKey;
      changed = true;
    }
    if (r.type === 'once' && !r.done && r.datetime && new Date(r.datetime) <= now) {
      notify('ถึงกำหนดแล้ว', r.text);
      r.done = true;
      changed = true;
    }
  });
  if (changed) { saveReminders(); renderReminderList(); }
}

function startLocationWatch() {
  if (!navigator.geolocation || geoWatchId !== null) return;
  geoWatchId = navigator.geolocation.watchPosition(pos => {
    const todayKey = toDateKey(new Date());
    let changed = false;
    reminders.forEach(r => {
      if (r.type === 'location' && r.lastFiredDate !== todayKey) {
        if (haversineMeters(pos.coords.latitude, pos.coords.longitude, r.lat, r.lng) <= r.radius) {
          notify('ถึงจุดที่กำหนดแล้ว', r.text);
          r.lastFiredDate = todayKey;
          changed = true;
        }
      }
    });
    if (changed) { saveReminders(); renderReminderList(); }
  }, () => {}, { enableHighAccuracy: false, maximumAge: 60000 });
}


/* ============================================================================
   FEEDBACK — ส่งตรงเข้าฐานข้อมูลของระบบ ไม่แสดงผลใดๆ บนหน้าเว็บนี้
   ----------------------------------------------------------------------------
   เมื่อกด "ส่งแบบประเมิน" หน้าเว็บจะยิง POST ไปที่ /api/feedback ซึ่งเป็นส่วนหนึ่งของ
   server.js เซิร์ฟเวอร์จะเขียนคำตอบต่อท้ายไฟล์ feedback.json ทันที (นี่คือ "ฐานข้อมูล"
   ของระบบตามที่โจทย์ต้องการ) ผู้สอน/ผู้วิจัยเปิดไฟล์นั้นดูได้โดยตรงจากเครื่อง ไม่มีหน้าใด
   ในเว็บแอปนี้แสดงคำตอบย้อนกลับให้ผู้ตอบหรือผู้ใช้คนอื่นเห็น

   ต้องรันด้วย `node server.js` เท่านั้นฟีเจอร์นี้ถึงจะทำงาน ถ้าเปิดเว็บด้วยวิธีอื่น
   (เช่น python http.server หรือดับเบิลคลิกไฟล์ตรงๆ) การส่งจะขึ้นข้อความแจ้งว่าส่งไม่สำเร็จ
   และคำตอบจะถูกเก็บสำรองไว้ใน localStorage ของเครื่องนั้นชั่วคราว แล้วพยายามส่งซ้ำให้เอง
   เบื้องหลังทุก 2 นาทีจนกว่าจะเปิดเซิร์ฟเวอร์แล้วส่งสำเร็จ (ยังไม่แสดงผลใดๆ บนหน้าเว็บเช่นกัน)
   ========================================================================== */

/* ข้อคำถามแบบให้คะแนน 1-5 แก้/เพิ่มข้อได้ตามการทดลองของคุณ */
const LIKERT_QUESTIONS = [
  { id: 'priority', text: 'เว็บนี้ช่วยให้ฉันจัดลำดับความสำคัญของงานได้ดีขึ้น' },
  { id: 'forget',   text: 'เว็บนี้ช่วยให้ฉันลืมงานและเรื่องเล็กๆ น้อยลง' },
  { id: 'plan',     text: 'เว็บนี้ช่วยให้ฉันวางแผนล่วงหน้าได้ดีขึ้น' },
  { id: 'focus',    text: 'การจับเวลาและเป้าหมายช่วยให้ฉันโฟกัสได้นานขึ้น' },
  { id: 'insight',  text: 'หน้าสถิติทำให้ฉันเห็นพฤติกรรมตัวเองชัดขึ้น' },
  { id: 'usable',   text: 'เว็บนี้ใช้งานง่าย เข้าใจได้เร็ว' },
];

const FEATURE_OPTIONS = [
  'เมทริกซ์จัดลำดับงาน',
  'ปฏิทินความคืบหน้า',
  'จับเวลากิจกรรม',
  'เป้าหมายและระดับสี',
  'สถิติแนวโน้ม',
  'เตือนความจำตามเวลา/สถานที่',
  'Pomodoro',
];

/* คิวสำรองในเครื่อง ใช้เฉพาะตอนส่งขึ้นเซิร์ฟเวอร์ไม่สำเร็จ ไม่ถูกนำมาแสดงผลที่ไหน */
let feedbackQueue = JSON.parse(localStorage.getItem('feedback_pending_queue')) || [];
function saveFeedbackQueue() {
  localStorage.setItem('feedback_pending_queue', JSON.stringify(feedbackQueue));
}

/* --- สร้างฟอร์มจากรายการคำถามด้านบน --- */
function renderFeedbackForm() {
  const likertEl = document.getElementById('likert-container');
  if (!likertEl) return;

  likertEl.innerHTML = LIKERT_QUESTIONS.map(q => `
    <div class="likert">
      <span class="likert__question">${escapeHtml(q.text)}</span>
      <div class="likert__options">
        ${[1, 2, 3, 4, 5].map(v => `
          <label class="likert__opt">
            <input type="radio" name="likert-${q.id}" value="${v}" ${v === 3 ? 'checked' : ''}>
            <span>${v}</span>
          </label>`).join('')}
      </div>
    </div>`).join('');

  document.getElementById('fb-features').innerHTML = FEATURE_OPTIONS.map((f, i) => `
    <label class="chip">
      <input type="checkbox" name="fb-feature" value="${escapeHtml(f)}" id="fb-feature-${i}">
      <span>${escapeHtml(f)}</span>
    </label>`).join('');
}

function buildFeedbackRecord() {
  const scores = {};
  LIKERT_QUESTIONS.forEach(q => {
    const picked = document.querySelector(`input[name="likert-${q.id}"]:checked`);
    scores[q.id] = picked ? Number(picked.value) : null;
  });
  const features = [...document.querySelectorAll('input[name="fb-feature"]:checked')].map(i => i.value);

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    submittedAt: new Date().toISOString(),
    respondent: document.getElementById('fb-respondent').value.trim() || 'ไม่ระบุ',
    duration: document.getElementById('fb-duration').value,
    scores,
    solveScore: Number(document.getElementById('fb-solve').value),
    nps: Number(document.getElementById('fb-nps').value),
    features,
    problem: document.getElementById('fb-problem').value.trim(),
    suggestion: document.getElementById('fb-suggestion').value.trim(),
  };
}

function resetFeedbackForm() {
  document.getElementById('feedback-form').reset();
  renderFeedbackForm();
  document.getElementById('fb-solve-val').innerText = '50%';
  document.getElementById('fb-nps-val').innerText = '7';
}

/* --- ส่งคำตอบหนึ่งชุดไปที่ /api/feedback บน server.js --- */
async function sendFeedbackToServer(record) {
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
  if (!res.ok) throw new Error(`server responded ${res.status}`);
}

/* --- เมื่อกดปุ่มส่งแบบประเมิน --- */
async function submitFeedback(e) {
  e.preventDefault();
  const record = buildFeedbackRecord();
  const status = document.getElementById('fb-status');
  const btn = document.getElementById('fb-submit-btn');

  btn.disabled = true;
  status.style.color = 'var(--color-text-muted)';
  status.innerText = 'กำลังส่งคำตอบ...';

  try {
    await sendFeedbackToServer(record);
    resetFeedbackForm();
    status.style.color = 'var(--color-success)';
    status.innerText = 'ส่งคำตอบเรียบร้อย ขอบคุณมาก 🙏';
  } catch (err) {
    /* ส่งไม่สำเร็จ (ยังไม่ได้รัน node server.js) — เก็บสำรองไว้ในเครื่องแล้วลองส่งซ้ำอัตโนมัติ */
    feedbackQueue.push(record);
    saveFeedbackQueue();
    resetFeedbackForm();
    status.style.color = 'var(--color-warning)';
    status.innerText = 'ยังส่งขึ้นฐานข้อมูลไม่สำเร็จ (ต้องรันด้วย node server.js) ระบบเก็บคำตอบไว้ชั่วคราวและจะลองส่งซ้ำให้อัตโนมัติ';
  }
  btn.disabled = false;
  setTimeout(() => { status.innerText = ''; }, 6000);
}

/* --- พยายามส่งคำตอบที่ค้างอยู่ในคิวซ้ำเป็นระยะ ทำงานเงียบๆ ไม่แสดงผลบนหน้าเว็บ --- */
async function retryFeedbackQueue() {
  if (!feedbackQueue.length) return;
  const remaining = [];
  for (const record of feedbackQueue) {
    try {
      await sendFeedbackToServer(record);
    } catch {
      remaining.push(record);
    }
  }
  feedbackQueue = remaining;
  saveFeedbackQueue();
}


/* ============================================================================
   POMODORO
   ========================================================================== */
let timerInterval = null;
let timeLeft = 25 * 60;
let isRunning = false;

function updateTimerDisplay() {
  const m = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const s = String(timeLeft % 60).padStart(2, '0');
  document.getElementById('timer-display').innerText = `${m}:${s}`;
}

function startTimer() {
  if (isRunning) return;
  isRunning = true;
  timerInterval = setInterval(() => {
    if (timeLeft > 0) { timeLeft--; updateTimerDisplay(); }
    else {
      clearInterval(timerInterval);
      isRunning = false;
      notify('หมดเวลาโฟกัส', 'พักสายตาสักครู่');
      alert('หมดเวลาโฟกัส พักสายตาสักครู่');
    }
  }, 1000);
}

function pauseTimer() { clearInterval(timerInterval); isRunning = false; }
function resetTimer() { clearInterval(timerInterval); isRunning = false; timeLeft = 25 * 60; updateTimerDisplay(); }


/* ============================================================================
   INIT
   ========================================================================== */
/* เติมฟิลด์ใหม่ให้ข้อมูลที่บันทึกไว้จากเวอร์ชันก่อน */
let migrated = false;
tasks.forEach(t => {
  if (t.desc === undefined)        { t.desc = ''; migrated = true; }
  if (t.progress === undefined)    { t.progress = t.completed ? 100 : 0; migrated = true; }
  if (t.createdAt === undefined)   { t.createdAt = new Date().toISOString(); migrated = true; }
  if (t.completedAt === undefined) { t.completedAt = t.completed ? new Date().toISOString() : null; migrated = true; }
});
if (migrated) saveTasks();

document.getElementById('task-modal').addEventListener('click', e => {
  if (e.target.id === 'task-modal') closeTaskModal();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeTaskModal(); });

renderReminderTypeFields();
renderFeedbackForm();
renderAll();
if (reminders.some(r => r.type === 'location')) startLocationWatch();
setInterval(checkTimeAndOnceReminders, 20 * 1000);
setInterval(renderToday, 60 * 1000);
/* ลองส่งคำตอบแบบประเมินที่ยังค้างอยู่ในคิวขึ้นฐานข้อมูลใหม่เป็นระยะ ทำงานเงียบๆ ไม่แสดงผลใดๆ */
retryFeedbackQueue();
setInterval(retryFeedbackQueue, 2 * 60 * 1000);