/* ============================================================
   STATE
   ============================================================ */
let tasks     = JSON.parse(localStorage.getItem('eisenhower_tasks_deadline')) || [];
let reminders = JSON.parse(localStorage.getItem('quick_reminders'))           || [];
let sessions  = JSON.parse(localStorage.getItem('focus_sessions'))            || [];
let goals     = JSON.parse(localStorage.getItem('user_goals'))                || [];

let calendarDate = new Date();
let selectedDay  = null;
let geoWatchId   = null;
let capturedLoc  = null;
let openTaskId   = null;

const QUADRANT_COLOR = { q1: '#e11d48', q2: '#059669', q3: '#d97706', q4: '#64748b' };

/* ระดับความคืบหน้า — ใช้ร่วมกันทั้งงานและเป้าหมาย */
const LEVELS = [
  { min:   0, name: 'ยังไม่เริ่ม',   color: '#94a3b8', bg: '#f1f5f9', text: '#475569' },
  { min:   1, name: 'เริ่มแล้ว',     color: '#f59e0b', bg: '#fef3c7', text: '#92400e' },
  { min:  40, name: 'ไปได้ครึ่งทาง', color: '#3b82f6', bg: '#dbeafe', text: '#1e40af' },
  { min:  70, name: 'ใกล้เสร็จ',     color: '#6366f1', bg: '#e0e7ff', text: '#3730a3' },
  { min: 100, name: 'สำเร็จแล้ว',    color: '#10b981', bg: '#d1fae5', text: '#065f46' },
];

function levelOf(pct) {
  let level = LEVELS[0];
  for (const l of LEVELS) if (pct >= l.min) level = l;
  return level;
}

/* ============================================================
   UTILITIES
   ============================================================ */
function escapeHtml(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function toDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
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

/* ============================================================
   STORAGE
   ============================================================ */
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

/* ============================================================
   TABS
   ============================================================ */
const TABS = ['today', 'matrix', 'calendar', 'focus', 'goals', 'stats', 'reminders'];

function switchTab(tab) {
  TABS.forEach(t => {
    document.getElementById(`view-${t}`).classList.toggle('hidden', t !== tab);
    document.querySelector(`.tab-btn[data-tab="${t}"]`).classList.toggle('active', t === tab);
  });
  if (tab === 'calendar') renderCalendar();
  if (tab === 'today')    renderToday();
  if (tab === 'stats')    renderStats();
  if (tab === 'goals')    renderGoals();
  if (tab === 'focus')    renderFocusPanel();
}

/* ============================================================
   LEGENDS
   ============================================================ */
function renderLegends() {
  const html = LEVELS.map(l =>
    `<span class="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full" style="background:${l.bg};color:${l.text}">
       <span class="dot" style="background:${l.color}"></span>${l.name}
     </span>`
  ).join('');
  const a = document.getElementById('level-legend');
  const b = document.getElementById('goal-legend');
  if (a) a.innerHTML = html;
  if (b) b.innerHTML = html;
}

/* ============================================================
   TASKS
   ============================================================ */
function addTask(e) {
  e.preventDefault();
  const title      = document.getElementById('task-title').value.trim();
  const desc       = document.getElementById('task-desc').value.trim();
  const deadline   = document.getElementById('task-deadline').value;
  const importance = document.getElementById('task-importance').value;
  const urgency    = document.getElementById('task-urgency').value;

  let quadrant;
  if      (importance === 'important'   && urgency === 'urgent')     quadrant = 'q1';
  else if (importance === 'important'   && urgency === 'not-urgent') quadrant = 'q2';
  else if (importance === 'unimportant' && urgency === 'urgent')     quadrant = 'q3';
  else                                                               quadrant = 'q4';

  tasks.push({
    id: Date.now(),
    title, desc, deadline, quadrant,
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

  if (diffTime < 0)                    return `<span class="text-rose-600 font-semibold">เลยกำหนด · ${formatted}</span>`;
  if (diffDays === 0)                  return `<span class="text-amber-600 font-semibold">ครบกำหนดวันนี้ · ${formatted}</span>`;
  if (diffDays > 0 && diffDays <= 3)   return `<span class="text-indigo-600 font-medium">อีก ${diffDays} วัน · ${formatted}</span>`;
  return `<span class="text-slate-500">${formatted}</span>`;
}

function taskFocusMinutes(taskId) {
  return sessions.filter(s => s.taskId === taskId).reduce((sum, s) => sum + s.seconds, 0) / 60;
}

function renderTasks() {
  ['q1', 'q2', 'q3', 'q4'].forEach(q => { document.getElementById(`list-${q}`).innerHTML = ''; });
  const counts = { q1: 0, q2: 0, q3: 0, q4: 0 };

  const sorted = [...tasks].sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

  sorted.forEach(task => {
    counts[task.quadrant]++;
    const pct   = task.completed ? 100 : (task.progress || 0);
    const level = levelOf(pct);
    const mins  = taskFocusMinutes(task.id);

    const card = document.createElement('div');
    card.className = `bg-white p-3 rounded-xl border border-slate-200 ${task.completed ? 'opacity-60' : ''}`;
    card.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-start gap-2.5 overflow-hidden flex-1">
          <input type="checkbox" ${task.completed ? 'checked' : ''} onclick="toggleComplete(${task.id})"
                 aria-label="ทำเครื่องหมายว่าเสร็จ" class="mt-1 w-4 h-4 text-indigo-600 rounded cursor-pointer shrink-0">
          <div class="min-w-0 flex-1">
            <button onclick="openTaskModal(${task.id})" class="text-sm block font-medium text-left ${task.completed ? 'line-through text-slate-400' : 'text-slate-700 hover:text-indigo-600'}">
              ${escapeHtml(task.title)}
            </button>
            ${task.desc ? `<p class="text-xs text-slate-500 mt-0.5 line-clamp-2">${escapeHtml(task.desc)}</p>` : ''}
            <div class="text-xs mt-1">${formatDeadline(task.deadline)}</div>
            <div class="mt-2">
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs px-1.5 py-0.5 rounded" style="background:${level.bg};color:${level.text}">${level.name}</span>
                <span class="text-xs text-slate-400">${pct}%${mins >= 1 ? ` · โฟกัส ${formatMinutes(mins)}` : ''}</span>
              </div>
              <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div class="h-full rounded-full" style="width:${pct}%;background:${level.color}"></div>
              </div>
            </div>
          </div>
        </div>
        <button onclick="deleteTask(${task.id})" aria-label="ลบงาน" class="text-slate-400 hover:text-rose-500 text-xs px-1.5 py-1 shrink-0">✕</button>
      </div>
    `;
    document.getElementById(`list-${task.quadrant}`).appendChild(card);
  });

  ['q1', 'q2', 'q3', 'q4'].forEach(q => {
    document.getElementById(`count-${q}`).innerText = counts[q];
    const list = document.getElementById(`list-${q}`);
    if (!counts[q]) list.innerHTML = '<p class="text-xs text-slate-400">ยังไม่มีงานในช่องนี้</p>';
  });
}

/* ---- modal รายละเอียดงาน ---- */
function openTaskModal(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  openTaskId = id;

  const pct   = task.completed ? 100 : (task.progress || 0);
  const level = levelOf(pct);
  const mins  = taskFocusMinutes(id);
  const taskSessions = sessions.filter(s => s.taskId === id).slice(-5).reverse();

  document.getElementById('modal-title').innerText = task.title;
  document.getElementById('modal-body').innerHTML = `
    <div>
      <p class="text-xs text-slate-500 mb-1">คำอธิบาย</p>
      <textarea id="modal-desc" rows="4" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-y"
        placeholder="เพิ่มรายละเอียด ขั้นตอน หรือสิ่งที่ต้องเตรียม">${escapeHtml(task.desc || '')}</textarea>
      <button onclick="saveTaskDesc(${id})" class="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 py-1.5 rounded-lg">บันทึกคำอธิบาย</button>
    </div>

    <div>
      <p class="text-xs text-slate-500 mb-1">กำหนดส่ง</p>
      <p class="text-sm">${formatDeadline(task.deadline)}</p>
    </div>

    <div>
      <div class="flex items-center justify-between mb-1">
        <p class="text-xs text-slate-500">ความคืบหน้า</p>
        <span class="text-xs px-2 py-0.5 rounded-full" style="background:${level.bg};color:${level.text}">${level.name} · ${pct}%</span>
      </div>
      <input type="range" min="0" max="100" step="5" value="${pct}" class="w-full accent-indigo-600"
             oninput="document.getElementById('modal-pct').innerText = this.value + '%'"
             onchange="setTaskProgress(${id}, this.value)">
      <p class="text-xs text-slate-400 text-right"><span id="modal-pct">${pct}%</span></p>
    </div>

    <div>
      <p class="text-xs text-slate-500 mb-1">เวลาที่ใช้กับงานนี้</p>
      <p class="text-sm font-medium text-slate-700">${mins >= 1 ? formatMinutes(mins) : 'ยังไม่มีการจับเวลา'}</p>
      ${taskSessions.length ? `<ul class="mt-2 space-y-1">${taskSessions.map(s =>
        `<li class="text-xs text-slate-500">${s.date} · ${s.activity} · ${formatMinutes(s.seconds / 60)}${s.note ? ` · ${escapeHtml(s.note)}` : ''}</li>`
      ).join('')}</ul>` : ''}
      <button onclick="focusOnTask(${id})" class="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1.5 rounded-lg">จับเวลาทำงานนี้</button>
    </div>
  `;

  const modal = document.getElementById('task-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeTaskModal() {
  openTaskId = null;
  const modal = document.getElementById('task-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function saveTaskDesc(id) {
  const value = document.getElementById('modal-desc').value.trim();
  tasks = tasks.map(t => { if (t.id === id) t.desc = value; return t; });
  saveTasks();
  renderAll();
}

function focusOnTask(id) {
  closeTaskModal();
  switchTab('focus');
  refreshTaskLinkOptions();
  document.getElementById('focus-task-link').value = String(id);
}

/* ============================================================
   TODAY
   ============================================================ */
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
                 : overdueEl.innerHTML = '<p class="text-slate-400 text-xs">ไม่มีงานค้าง</p>';
  dueToday.length ? dueToday.forEach(t => dueEl.appendChild(miniTaskRow(t)))
                  : dueEl.innerHTML = '<p class="text-slate-400 text-xs">วันนี้ไม่มีเดดไลน์</p>';

  const todaysReminders = reminders.filter(r => r.type !== 'once' || isSameDay(new Date(r.datetime), now));
  todaysReminders.length ? todaysReminders.forEach(r => remEl.appendChild(miniReminderRow(r)))
                         : remEl.innerHTML = '<p class="text-slate-400 text-xs">ยังไม่มีรายการเตือน</p>';

  /* ---- KPI ---- */
  const todayKey = toDateKey(now);
  const focusToday = minutesOnDate(todayKey);
  const focusYesterday = minutesOnDate(daysAgoKey(1));
  document.getElementById('kpi-focus-today').innerText = formatMinutes(focusToday);
  const diff = focusToday - focusYesterday;
  document.getElementById('kpi-focus-compare').innerText =
    focusYesterday === 0 && focusToday === 0 ? 'ยังไม่มีการจับเวลาวันนี้'
    : diff >= 0 ? `มากกว่าเมื่อวาน ${formatMinutes(diff)}`
                : `น้อยกว่าเมื่อวาน ${formatMinutes(-diff)}`;

  const thisWeekStart = startOfWeek(now);
  const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const doneThisWeek = tasks.filter(t => t.completedAt && new Date(t.completedAt) >= thisWeekStart).length;
  const doneLastWeek = tasks.filter(t => t.completedAt && new Date(t.completedAt) >= lastWeekStart && new Date(t.completedAt) < thisWeekStart).length;
  document.getElementById('kpi-done-week').innerText = `${doneThisWeek} งาน`;
  document.getElementById('kpi-done-compare').innerText =
    doneThisWeek >= doneLastWeek ? `สัปดาห์ก่อนปิดได้ ${doneLastWeek} งาน` : `ช้ากว่าสัปดาห์ก่อน (${doneLastWeek} งาน)`;

  document.getElementById('kpi-streak').innerText = `${currentStreak()} วัน`;

  /* ---- ความคืบหน้าเป้าหมาย ---- */
  const goalsEl = document.getElementById('today-goals');
  goalsEl.innerHTML = '';
  if (!goals.length) {
    goalsEl.innerHTML = '<p class="text-slate-400 text-xs">ยังไม่ได้ตั้งเป้าหมาย เริ่มได้ที่แท็บเป้าหมาย</p>';
  } else {
    goals.forEach(g => goalsEl.appendChild(goalBar(g, true)));
  }

  /* ---- ไทม์ไลน์ ---- */
  const items = [];
  dueToday.forEach(t => items.push({ time: new Date(t.deadline), label: `📌 ${escapeHtml(t.title)}`, color: QUADRANT_COLOR[t.quadrant] }));
  reminders.forEach(r => {
    if (r.type === 'time') {
      const [h, m] = r.time.split(':');
      const d = new Date(); d.setHours(h, m, 0, 0);
      items.push({ time: d, label: `🔔 ${escapeHtml(r.text)} (ทุกวัน)`, color: '#4f46e5' });
    } else if (r.type === 'once' && isSameDay(new Date(r.datetime), now)) {
      items.push({ time: new Date(r.datetime), label: `🔔 ${escapeHtml(r.text)}`, color: '#4f46e5' });
    } else if (r.type === 'location') {
      items.push({ time: null, label: `📍 ${escapeHtml(r.text)} (เมื่อถึง ${escapeHtml(r.label || 'สถานที่ที่กำหนด')})`, color: '#0d9488' });
    }
  });
  sessions.filter(s => s.date === todayKey).forEach(s => {
    items.push({ time: new Date(s.endedAt), label: `⏱️ ${escapeHtml(s.activity)} · ${formatMinutes(s.seconds / 60)}`, color: '#0284c7' });
  });
  items.sort((a, b) => (a.time ? a.time.getTime() : Infinity) - (b.time ? b.time.getTime() : Infinity));

  if (!items.length) {
    timelineEl.innerHTML = '<p class="text-slate-400 text-xs">วันนี้ยังว่าง เพิ่มงานหรือเริ่มจับเวลาได้เลย</p>';
  } else {
    items.forEach(it => {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-3 py-1.5 border-b border-slate-100 last:border-0';
      const timeLabel = it.time ? it.time.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '--:--';
      row.innerHTML = `<span class="dot" style="background:${it.color}"></span>
                       <span class="text-xs font-mono text-slate-400 w-12">${timeLabel}</span>
                       <span class="text-sm text-slate-700">${it.label}</span>`;
      timelineEl.appendChild(row);
    });
  }
}

function miniTaskRow(t) {
  const pct = t.completed ? 100 : (t.progress || 0);
  const level = levelOf(pct);
  const row = document.createElement('div');
  row.className = 'bg-white/70 rounded-lg px-2.5 py-2';
  row.innerHTML = `
    <div class="flex items-center justify-between gap-2">
      <button onclick="openTaskModal(${t.id})" class="text-slate-700 text-left hover:text-indigo-600">${escapeHtml(t.title)}</button>
      <span class="text-xs text-slate-400 shrink-0">${new Date(t.deadline).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
    </div>
    <div class="h-1 bg-slate-200 rounded-full mt-1.5 overflow-hidden">
      <div class="h-full rounded-full" style="width:${pct}%;background:${level.color}"></div>
    </div>`;
  return row;
}

function miniReminderRow(r) {
  const row = document.createElement('div');
  row.className = 'flex items-center justify-between bg-white/70 rounded-lg px-2.5 py-1.5';
  const sub = r.type === 'time' ? `ทุกวัน ${r.time}`
            : r.type === 'once' ? new Date(r.datetime).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
            : `📍 ${escapeHtml(r.label || 'สถานที่')}`;
  row.innerHTML = `<span class="text-slate-700">${escapeHtml(r.text)}</span><span class="text-xs text-slate-400">${sub}</span>`;
  return row;
}

/* ============================================================
   CALENDAR
   ============================================================ */
function changeMonth(delta) {
  calendarDate.setMonth(calendarDate.getMonth() + delta);
  renderCalendar();
}

function dayProgress(key) {
  const dayTasks = tasks.filter(t => t.deadline && toDateKey(new Date(t.deadline)) === key);
  if (!dayTasks.length) return null;
  const sum = dayTasks.reduce((s, t) => s + (t.completed ? 100 : (t.progress || 0)), 0);
  return Math.round(sum / dayTasks.length);
}

function renderCalendar() {
  const year  = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  document.getElementById('calendar-title').innerText =
    calendarDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });

  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  const startOffset  = new Date(year, month, 1).getDay();
  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  for (let i = 0; i < startOffset; i++) grid.appendChild(document.createElement('div'));

  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(year, month, day);
    const key = toDateKey(cellDate);
    const cell = document.createElement('div');
    cell.className = `day-cell cursor-pointer rounded-lg p-1.5 h-20 border border-slate-100 hover:bg-indigo-50 flex flex-col
                      ${isSameDay(cellDate, today) ? 'today' : ''} ${key === selectedDay ? 'selected' : ''}`;
    cell.onclick = () => selectDay(key);

    const dayTasks = tasks.filter(t => t.deadline && toDateKey(new Date(t.deadline)) === key);
    const pct = dayProgress(key);
    const focusMins = minutesOnDate(key);

    const dots = dayTasks.slice(0, 4)
      .map(t => `<span class="dot" style="background:${QUADRANT_COLOR[t.quadrant]}"></span>`).join(' ');

    cell.innerHTML = `
      <div class="flex items-start justify-between">
        <span class="text-xs font-medium text-slate-600">${day}</span>
        ${focusMins >= 1 ? '<span class="dot" style="background:#0284c7" title="มีการจับเวลา"></span>' : ''}
      </div>
      <div class="flex flex-wrap gap-0.5 mt-1">${dots}</div>
      ${pct !== null ? `
        <div class="mt-auto">
          <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-full rounded-full" style="width:${pct}%;background:${levelOf(pct).color}"></div>
          </div>
          <span class="text-[10px] text-slate-400">${pct}%</span>
        </div>` : ''}
    `;
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
  const titleEl   = document.getElementById('selected-day-title');
  const listEl    = document.getElementById('selected-day-list');
  const summaryEl = document.getElementById('selected-day-summary');
  const addBtn    = document.getElementById('add-on-day-btn');

  const d = new Date(selectedDay + 'T00:00:00');
  titleEl.innerText = d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  addBtn.classList.remove('hidden');

  const dayTasks  = tasks.filter(t => t.deadline && toDateKey(new Date(t.deadline)) === selectedDay);
  const pct       = dayProgress(selectedDay);
  const focusMins = minutesOnDate(selectedDay);

  summaryEl.innerHTML = `
    <div class="bg-slate-50 rounded-xl p-3">
      <div class="flex items-center justify-between mb-1">
        <span class="text-xs text-slate-500">ความคืบหน้ารวมของวันนี้</span>
        <span class="text-xs font-medium" style="color:${pct !== null ? levelOf(pct).text : '#94a3b8'}">${pct !== null ? pct + '%' : 'ไม่มีงาน'}</span>
      </div>
      <div class="h-2 bg-slate-200 rounded-full overflow-hidden">
        <div class="h-full rounded-full" style="width:${pct || 0}%;background:${pct !== null ? levelOf(pct).color : '#cbd5e1'}"></div>
      </div>
      <p class="text-xs text-slate-400 mt-2">เวลาโฟกัสวันนั้น ${focusMins >= 1 ? formatMinutes(focusMins) : 'ยังไม่มี'}</p>
    </div>`;

  listEl.innerHTML = '';
  if (!dayTasks.length) {
    listEl.innerHTML = '<p class="text-slate-400 text-xs">ไม่มีงานครบกำหนดในวันนี้ กดปุ่มด้านบนเพื่อเพิ่ม</p>';
    return;
  }
  dayTasks.forEach(t => {
    const p = t.completed ? 100 : (t.progress || 0);
    const level = levelOf(p);
    const row = document.createElement('div');
    row.className = 'bg-slate-50 rounded-lg px-3 py-2';
    row.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <span class="dot shrink-0" style="background:${QUADRANT_COLOR[t.quadrant]}"></span>
          <button onclick="openTaskModal(${t.id})" class="truncate text-left ${t.completed ? 'line-through text-slate-400' : 'text-slate-700 hover:text-indigo-600'}">${escapeHtml(t.title)}</button>
        </div>
        <span class="text-xs text-slate-400 shrink-0">${new Date(t.deadline).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      ${t.desc ? `<p class="text-xs text-slate-500 mt-0.5 truncate">${escapeHtml(t.desc)}</p>` : ''}
      <div class="flex items-center gap-2 mt-1.5">
        <div class="h-1.5 flex-1 bg-slate-200 rounded-full overflow-hidden">
          <div class="h-full rounded-full" style="width:${p}%;background:${level.color}"></div>
        </div>
        <span class="text-[10px] text-slate-400 shrink-0">${p}%</span>
      </div>`;
    listEl.appendChild(row);
  });
}

function addTaskOnSelectedDay() {
  if (!selectedDay) return;
  switchTab('matrix');
  document.getElementById('task-deadline').value = `${selectedDay}T09:00`;
  document.getElementById('task-title').focus();
}

/* ============================================================
   STOPWATCH / SESSIONS
   ============================================================ */
let stopwatchStart    = null;
let stopwatchInterval = null;

function startStopwatch() {
  stopwatchStart = Date.now();
  const activity = document.getElementById('focus-activity').value;
  document.getElementById('stopwatch-activity').innerText = `กำลังจับเวลา: ${activity}`;
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
  document.getElementById('focus-note').value = '';
  document.getElementById('stopwatch-start').classList.remove('hidden');
  document.getElementById('stopwatch-stop').classList.add('hidden');
  ['focus-activity', 'focus-task-link'].forEach(id => document.getElementById(id).disabled = false);
  renderAll();
}

function openManualSession() {
  const mins = prompt('บันทึกเวลาย้อนหลังกี่นาที?', '30');
  if (mins === null) return;
  const m = parseInt(mins, 10);
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
  /* เวลาสะสมแยกตามกิจกรรม 7 วัน */
  const el = document.getElementById('focus-by-activity');
  if (!el) return;
  const cutoff = daysAgoKey(6);
  const recent = sessions.filter(s => s.date >= cutoff);
  const byActivity = {};
  recent.forEach(s => { byActivity[s.activity] = (byActivity[s.activity] || 0) + s.seconds / 60; });
  const entries = Object.entries(byActivity).sort((a, b) => b[1] - a[1]);

  el.innerHTML = '';
  if (!entries.length) {
    el.innerHTML = '<p class="text-xs text-slate-400">ยังไม่มีข้อมูล 7 วันล่าสุด กดเริ่มจับเวลาเพื่อเก็บสถิติแรก</p>';
  } else {
    const max = entries[0][1];
    entries.forEach(([act, mins]) => {
      const bar = document.createElement('div');
      bar.innerHTML = `
        <div class="flex items-center justify-between text-xs mb-1">
          <span class="text-slate-600">${escapeHtml(act)}</span>
          <span class="text-slate-400">${formatMinutes(mins)}</span>
        </div>
        <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div class="h-full rounded-full bg-indigo-500" style="width:${(mins / max) * 100}%"></div>
        </div>`;
      el.appendChild(bar);
    });
  }

  /* ประวัติ */
  const listEl = document.getElementById('session-list');
  listEl.innerHTML = '';
  const history = [...sessions].sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt)).slice(0, 40);
  if (!history.length) {
    listEl.innerHTML = '<p class="text-xs text-slate-400">ยังไม่มีประวัติ</p>';
    return;
  }
  history.forEach(s => {
    const linked = s.taskId ? tasks.find(t => t.id === s.taskId) : null;
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2';
    row.innerHTML = `
      <div class="min-w-0">
        <p class="text-sm text-slate-700">${escapeHtml(s.activity)} · ${formatMinutes(s.seconds / 60)}</p>
        <p class="text-xs text-slate-400 truncate">${s.date}${linked ? ` · งาน: ${escapeHtml(linked.title)}` : ''}${s.note ? ` · ${escapeHtml(s.note)}` : ''}</p>
      </div>
      <button onclick="deleteSession(${s.id})" aria-label="ลบรายการ" class="text-slate-400 hover:text-rose-500 text-xs px-1.5 py-1 shrink-0">✕</button>`;
    listEl.appendChild(row);
  });
}

/* ============================================================
   GOALS
   ============================================================ */
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
      <div class="flex items-center justify-between text-xs mb-1">
        <span class="text-slate-600">${escapeHtml(goal.title)}</span>
        <span style="color:${level.text}">${level.name} · ${pct}%</span>
      </div>
      <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div class="h-full rounded-full" style="width:${pct}%;background:${level.color}"></div>
      </div>
      <p class="text-[11px] text-slate-400 mt-1">${label} ทำได้ ${formatMinutes(mins)} จากเป้า ${formatMinutes(goal.target)}</p>`;
    return wrap;
  }

  wrap.className = 'bg-white p-5 rounded-2xl shadow-sm border border-slate-200';
  const remaining = Math.max(0, goal.target - mins);
  wrap.innerHTML = `
    <div class="flex items-start justify-between gap-3 mb-3">
      <div>
        <h4 class="font-semibold text-slate-800">${escapeHtml(goal.title)}</h4>
        <p class="text-xs text-slate-500 mt-0.5">${goal.activity === '__all__' ? 'รวมทุกกิจกรรม' : escapeHtml(goal.activity)} · เป้า ${formatMinutes(goal.target)} ${label}</p>
      </div>
      <button onclick="deleteGoal(${goal.id})" aria-label="ลบเป้าหมาย" class="text-slate-400 hover:text-rose-500 text-sm shrink-0">✕</button>
    </div>
    <div class="flex items-center justify-between mb-1.5">
      <span class="text-sm px-2.5 py-1 rounded-full font-medium" style="background:${level.bg};color:${level.text}">${level.name}</span>
      <span class="text-2xl font-bold" style="color:${level.color}">${pct}%</span>
    </div>
    <div class="h-3 bg-slate-100 rounded-full overflow-hidden">
      <div class="h-full rounded-full" style="width:${pct}%;background:${level.color}"></div>
    </div>
    <div class="flex items-center justify-between mt-2 text-xs text-slate-500">
      <span>ทำได้ ${formatMinutes(mins)}</span>
      <span>${remaining > 0 ? `เหลืออีก ${formatMinutes(remaining)}` : 'ถึงเป้าแล้ว'}</span>
    </div>
    <div class="mt-3 flex gap-1">
      ${LEVELS.map(l => `<div class="flex-1 h-1.5 rounded-full" style="background:${pct >= l.min ? l.color : '#e2e8f0'}" title="${l.name}"></div>`).join('')}
    </div>`;
  return wrap;
}

function renderGoals() {
  const listEl = document.getElementById('goal-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  if (!goals.length) {
    listEl.innerHTML = '<div class="bg-white p-5 rounded-2xl border border-dashed border-slate-300 text-center"><p class="text-sm text-slate-500">ยังไม่มีเป้าหมาย ตั้งเป้าแรกจากฟอร์มด้านซ้ายเพื่อเริ่มเก็บสถิติ</p></div>';
    return;
  }
  goals.forEach(g => listEl.appendChild(goalBar(g, false)));
}

/* ============================================================
   STATISTICS
   ============================================================ */
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

  /* ---- ข้อมูลรายวัน ---- */
  const days = [];
  for (let i = range - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push({ key: toDateKey(d), date: d, mins: minutesOnDate(toDateKey(d)) });
  }

  /* ---- KPI ---- */
  const last7  = days.slice(-7).reduce((s, d) => s + d.mins, 0);
  const prev7keys = Array.from({ length: 7 }, (_, i) => daysAgoKey(i + 7));
  const prev7  = prev7keys.reduce((s, k) => s + minutesOnDate(k), 0);

  document.getElementById('stat-week-total').innerText = formatMinutes(last7);
  const trendEl = document.getElementById('stat-week-trend');
  if (prev7 === 0 && last7 === 0) {
    trendEl.innerText = 'ยังไม่มีข้อมูลเปรียบเทียบ';
    trendEl.className = 'text-xs mt-1 text-slate-400';
  } else if (last7 >= prev7) {
    trendEl.innerText = `เพิ่มขึ้น ${formatMinutes(last7 - prev7)} จาก 7 วันก่อนหน้า`;
    trendEl.className = 'text-xs mt-1 text-emerald-600';
  } else {
    trendEl.innerText = `ลดลง ${formatMinutes(prev7 - last7)} จาก 7 วันก่อนหน้า`;
    trendEl.className = 'text-xs mt-1 text-rose-600';
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

  /* ---- กราฟแนวโน้มรายวัน (SVG) ---- */
  const W = 720, H = 220, PAD_L = 40, PAD_B = 28, PAD_T = 12, PAD_R = 8;
  const maxMins = Math.max(60, ...days.map(d => d.mins));
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const step  = plotW / days.length;
  const barW  = Math.max(4, Math.min(28, step * 0.6));

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const y = PAD_T + plotH * (1 - f);
    return `<line x1="${PAD_L}" y1="${y}" x2="${W - PAD_R}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>
            <text x="${PAD_L - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="#94a3b8">${Math.round(maxMins * f)}</text>`;
  }).join('');

  const bars = days.map((d, i) => {
    const x = PAD_L + step * i + (step - barW) / 2;
    const h = (d.mins / maxMins) * plotH;
    const y = PAD_T + plotH - h;
    const isToday = d.key === toDateKey(new Date());
    return `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(h, d.mins > 0 ? 2 : 0)}" rx="3"
              fill="${isToday ? '#4f46e5' : '#a5b4fc'}"><title>${d.key} · ${formatMinutes(d.mins)}</title></rect>`;
  }).join('');

  /* เส้นค่าเฉลี่ยเคลื่อนที่ 3 วัน เพื่อดูแนวโน้ม */
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
    return `<text x="${x}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#94a3b8">${d.date.getDate()}/${d.date.getMonth() + 1}</text>`;
  }).join('');

  chartEl.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="กราฟแนวโน้มเวลาโฟกัสรายวัน">
      ${gridLines}${bars}
      <polyline points="${linePoints}" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linejoin="round"/>
      ${xLabels}
    </svg>
    <div class="flex items-center gap-4 mt-2 text-xs text-slate-500">
      <span class="inline-flex items-center gap-1.5"><span class="w-3 h-2 rounded-sm bg-indigo-300 inline-block"></span>เวลาโฟกัสรายวัน (นาที)</span>
      <span class="inline-flex items-center gap-1.5"><span class="w-3 h-0.5 bg-amber-500 inline-block"></span>ค่าเฉลี่ยเคลื่อนที่ 3 วัน</span>
    </div>`;

  /* ---- งานที่ปิดได้รายสัปดาห์ ---- */
  const weeklyEl = document.getElementById('stat-weekly-done');
  const weeks = [];
  for (let i = 5; i >= 0; i--) {
    const start = startOfWeek(new Date());
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    const count = tasks.filter(t => t.completedAt && new Date(t.completedAt) >= start && new Date(t.completedAt) < end).length;
    weeks.push({ start, count });
  }
  const maxWeek = Math.max(1, ...weeks.map(w => w.count));
  weeklyEl.innerHTML = weeks.map(w => `
    <div class="flex items-center gap-3 mb-2">
      <span class="text-xs text-slate-400 w-16 shrink-0">${w.start.getDate()}/${w.start.getMonth() + 1}</span>
      <div class="h-3 flex-1 bg-slate-100 rounded-full overflow-hidden">
        <div class="h-full rounded-full bg-emerald-500" style="width:${(w.count / maxWeek) * 100}%"></div>
      </div>
      <span class="text-xs text-slate-500 w-12 text-right shrink-0">${w.count} งาน</span>
    </div>`).join('') || '<p class="text-xs text-slate-400">ยังไม่มีข้อมูล</p>';

  /* ---- สัดส่วนกิจกรรม ---- */
  const splitEl = document.getElementById('stat-activity-split');
  const rangeCutoff = daysAgoKey(range - 1);
  const inRange = sessions.filter(s => s.date >= rangeCutoff);
  const total = inRange.reduce((s, x) => s + x.seconds, 0) / 60;
  const by = {};
  inRange.forEach(s => { by[s.activity] = (by[s.activity] || 0) + s.seconds / 60; });
  const sortedSplit = Object.entries(by).sort((a, b) => b[1] - a[1]);
  const palette = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#64748b'];

  splitEl.innerHTML = sortedSplit.length ? sortedSplit.map(([act, mins], i) => {
    const share = total ? Math.round((mins / total) * 100) : 0;
    return `
      <div>
        <div class="flex items-center justify-between text-xs mb-1">
          <span class="text-slate-600">${escapeHtml(act)}</span>
          <span class="text-slate-400">${share}% · ${formatMinutes(mins)}</span>
        </div>
        <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div class="h-full rounded-full" style="width:${share}%;background:${palette[i % palette.length]}"></div>
        </div>
      </div>`;
  }).join('') : '<p class="text-xs text-slate-400">ยังไม่มีข้อมูลในช่วงที่เลือก</p>';
}

/* ============================================================
   REMINDERS
   ============================================================ */
function renderReminderTypeFields() {
  const type = document.getElementById('reminder-type').value;
  const container = document.getElementById('reminder-type-fields');
  if (type === 'time') {
    container.innerHTML = `
      <div>
        <label for="reminder-time" class="block text-sm font-medium text-slate-600 mb-1">เวลาที่จะเตือนทุกวัน</label>
        <input type="time" id="reminder-time" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
      </div>`;
  } else if (type === 'once') {
    container.innerHTML = `
      <div>
        <label for="reminder-datetime" class="block text-sm font-medium text-slate-600 mb-1">วันและเวลา</label>
        <input type="datetime-local" id="reminder-datetime" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
      </div>`;
  } else {
    container.innerHTML = `
      <div class="space-y-2">
        <label for="reminder-loc-label" class="block text-sm font-medium text-slate-600 mb-1">ชื่อสถานที่</label>
        <input type="text" id="reminder-loc-label" placeholder="เช่น หน้าประตูบ้าน" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
        <button type="button" onclick="captureLocation()" class="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm py-2 rounded-lg">ใช้ตำแหน่งปัจจุบันเป็นจุดเตือน</button>
        <p id="loc-status" class="text-xs text-slate-400"></p>
        <label for="reminder-radius" class="block text-sm font-medium text-slate-600 mb-1">รัศมีแจ้งเตือน (เมตร)</label>
        <input type="number" id="reminder-radius" value="150" min="20" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
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
  const text = document.getElementById('reminder-text').value.trim();
  const type = document.getElementById('reminder-type').value;
  const reminder = { id: Date.now(), text, type, lastFiredDate: null, done: false };

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
    listEl.innerHTML = '<p class="text-slate-400 text-sm">ยังไม่มีรายการ เพิ่มเรื่องที่มักลืม เช่น กินยา หรือทิ้งขยะ</p>';
    return;
  }
  reminders.forEach(r => {
    const icon = r.type === 'time' ? '⏰' : r.type === 'once' ? '📆' : '📍';
    const sub  = r.type === 'time' ? `ทุกวัน เวลา ${r.time} น.`
               : r.type === 'once' ? new Date(r.datetime).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
               : `เมื่อถึง ${escapeHtml(r.label || 'จุดที่กำหนด')} (รัศมี ${r.radius} ม.)`;
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5';
    row.innerHTML = `
      <div>
        <span class="text-sm font-medium text-slate-700">${icon} ${escapeHtml(r.text)}</span>
        <div class="text-xs text-slate-400">${sub}</div>
      </div>
      <button onclick="deleteReminder(${r.id})" aria-label="ลบการเตือน" class="text-slate-400 hover:text-rose-500 text-xs px-1.5 py-1">✕</button>`;
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

/* ============================================================
   POMODORO
   ============================================================ */
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

/* ============================================================
   INIT
   ============================================================ */
/* ย้ายข้อมูลเก่าให้มีฟิลด์ใหม่ครบ */
let migrated = false;
tasks.forEach(t => {
  if (t.desc === undefined)        { t.desc = '';  migrated = true; }
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
renderAll();
if (reminders.some(r => r.type === 'location')) startLocationWatch();
setInterval(checkTimeAndOnceReminders, 20 * 1000);
setInterval(renderToday, 60 * 1000);