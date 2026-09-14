/* ============================================================
           STATE
        ============================================================ */
        let tasks = JSON.parse(localStorage.getItem('eisenhower_tasks_deadline')) || [];
        let reminders = JSON.parse(localStorage.getItem('quick_reminders')) || [];
        let calendarDate = new Date();       // month currently shown
        let selectedDay = null;              // yyyy-mm-dd string
        let geoWatchId = null;

        /* ============================================================
           TAB SWITCHING
        ============================================================ */
        function switchTab(tab) {
            ['today', 'matrix', 'calendar', 'reminders'].forEach(t => {
                document.getElementById(`view-${t}`).classList.toggle('hidden', t !== tab);
                document.querySelector(`.tab-btn[data-tab="${t}"]`).classList.toggle('active', t === tab);
            });
            if (tab === 'calendar') renderCalendar();
            if (tab === 'today') renderToday();
        }

        /* ============================================================
           STORAGE HELPERS
        ============================================================ */
        function saveTasks() {
            localStorage.setItem('eisenhower_tasks_deadline', JSON.stringify(tasks));
        }
        function saveReminders() {
            localStorage.setItem('quick_reminders', JSON.stringify(reminders));
        }
        function renderAll() {
            renderTasks();
            renderToday();
            if (!document.getElementById('view-calendar').classList.contains('hidden')) renderCalendar();
            renderReminderList();
        }

        /* ============================================================
           MATRIX TASKS (deadline + eisenhower quadrant)
        ============================================================ */
        function addTask(e) {
            e.preventDefault();
            const title = document.getElementById('task-title').value;
            const deadline = document.getElementById('task-deadline').value;
            const importance = document.getElementById('task-importance').value;
            const urgency = document.getElementById('task-urgency').value;

            let quadrant = '';
            if (importance === 'important' && urgency === 'urgent') quadrant = 'q1';
            else if (importance === 'important' && urgency === 'not-urgent') quadrant = 'q2';
            else if (importance === 'unimportant' && urgency === 'urgent') quadrant = 'q3';
            else quadrant = 'q4';

            tasks.push({ id: Date.now(), title, deadline, quadrant, completed: false });
            document.getElementById('task-form').reset();
            saveTasks();
            renderAll();
        }

        function deleteTask(id) {
            tasks = tasks.filter(task => task.id !== id);
            saveTasks();
            renderAll();
        }

        function toggleComplete(id) {
            tasks = tasks.map(task => {
                if (task.id === id) task.completed = !task.completed;
                return task;
            });
            saveTasks();
            renderAll();
        }

        function formatDeadline(dateString) {
            if (!dateString) return '';
            const date = new Date(dateString);
            const now = new Date();
            const diffTime = date - now;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            const options = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };
            const formattedDate = date.toLocaleDateString('th-TH', options);

            if (diffTime < 0) {
                return `<span class="text-rose-600 font-semibold">🚨 เลยกำหนด (${formattedDate})</span>`;
            } else if (diffDays === 0) {
                return `<span class="text-amber-600 font-semibold">🔥 ครบกำหนดวันนี้ (${formattedDate})</span>`;
            } else if (diffDays > 0 && diffDays <= 3) {
                return `<span class="text-indigo-600 font-medium">⏳ อีก ${diffDays} วัน (${formattedDate})</span>`;
            } else {
                return `<span class="text-slate-500">📅 ${formattedDate}</span>`;
            }
        }

        function renderTasks() {
            ['q1', 'q2', 'q3', 'q4'].forEach(q => {
                document.getElementById(`list-${q}`).innerHTML = '';
            });
            let counts = { q1: 0, q2: 0, q3: 0, q4: 0 };

            [...tasks].sort((a, b) => new Date(a.deadline) - new Date(b.deadline)).forEach(task => {
                counts[task.quadrant]++;
                const card = document.createElement('div');
                card.className = `bg-white p-3 rounded-xl border border-slate-200 shadow-xs transition hover:shadow-md ${task.completed ? 'opacity-50 bg-slate-50' : ''}`;
                card.innerHTML = `
                    <div class="flex items-start justify-between gap-2">
                        <div class="flex items-start gap-2.5 overflow-hidden">
                            <input type="checkbox" ${task.completed ? 'checked' : ''} onclick="toggleComplete(${task.id})" class="mt-1 w-4 h-4 text-indigo-600 rounded cursor-pointer">
                            <div>
                                <span class="text-sm block font-medium ${task.completed ? 'line-through text-slate-400' : 'text-slate-700'}">${escapeHtml(task.title)}</span>
                                <div class="text-xs mt-1">${task.completed ? '<span class="text-emerald-600">✔ เสร็จแล้ว</span>' : formatDeadline(task.deadline)}</div>
                            </div>
                        </div>
                        <button onclick="deleteTask(${task.id})" class="text-slate-400 hover:text-rose-500 text-xs px-1.5 py-1 transition">✕</button>
                    </div>
                `;
                document.getElementById(`list-${task.quadrant}`).appendChild(card);
            });

            document.getElementById('count-q1').innerText = counts.q1;
            document.getElementById('count-q2').innerText = counts.q2;
            document.getElementById('count-q3').innerText = counts.q3;
            document.getElementById('count-q4').innerText = counts.q4;
        }

        function escapeHtml(text) {
            return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }

        /* ============================================================
           TODAY / DASHBOARD VIEW
        ============================================================ */
        const QUADRANT_COLOR = { q1: '#e11d48', q2: '#059669', q3: '#d97706', q4: '#64748b' };

        function isSameDay(d1, d2) {
            return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
        }

        function renderToday() {
            const now = new Date();
            const overdueEl = document.getElementById('today-overdue');
            const dueEl = document.getElementById('today-due');
            const remEl = document.getElementById('today-reminders');
            const timelineEl = document.getElementById('today-timeline');
            overdueEl.innerHTML = ''; dueEl.innerHTML = ''; remEl.innerHTML = ''; timelineEl.innerHTML = '';

            const overdue = tasks.filter(t => !t.completed && t.deadline && new Date(t.deadline) < now && !isSameDay(new Date(t.deadline), now));
            const dueToday = tasks.filter(t => !t.completed && t.deadline && isSameDay(new Date(t.deadline), now));

            overdue.length ? overdue.forEach(t => overdueEl.appendChild(miniTaskRow(t))) : overdueEl.innerHTML = '<p class="text-slate-400 text-xs">ไม่มีงานค้าง 🎉</p>';
            dueToday.length ? dueToday.forEach(t => dueEl.appendChild(miniTaskRow(t))) : dueEl.innerHTML = '<p class="text-slate-400 text-xs">วันนี้ไม่มีเดดไลน์</p>';

            const todaysReminders = reminders.filter(r => r.type !== 'once' || isSameDay(new Date(r.datetime), now));
            todaysReminders.length ? todaysReminders.forEach(r => remEl.appendChild(miniReminderRow(r))) : remEl.innerHTML = '<p class="text-slate-400 text-xs">ยังไม่มีรายการเตือน</p>';

            // timeline: merge tasks due today + reminders with a time, sort by time
            const items = [];
            dueToday.forEach(t => items.push({ time: new Date(t.deadline), label: `📌 ${t.title}`, color: QUADRANT_COLOR[t.quadrant] }));
            reminders.forEach(r => {
                if (r.type === 'time') {
                    const [h, m] = r.time.split(':');
                    const d = new Date(); d.setHours(h, m, 0, 0);
                    items.push({ time: d, label: `🔔 ${r.text} (ทุกวัน)`, color: '#4f46e5' });
                } else if (r.type === 'once' && isSameDay(new Date(r.datetime), now)) {
                    items.push({ time: new Date(r.datetime), label: `🔔 ${r.text}`, color: '#4f46e5' });
                } else if (r.type === 'location') {
                    items.push({ time: null, label: `📍 ${r.text} (เมื่อถึง ${escapeHtml(r.label || 'สถานที่ที่กำหนด')})`, color: '#0d9488' });
                }
            });
            items.sort((a, b) => (a.time ? a.time.getTime() : Infinity) - (b.time ? b.time.getTime() : Infinity));

            if (!items.length) {
                timelineEl.innerHTML = '<p class="text-slate-400 text-xs">ไม่มีนัดหมายสำหรับวันนี้</p>';
            } else {
                items.forEach(it => {
                    const row = document.createElement('div');
                    row.className = 'flex items-center gap-3 py-1.5 border-b border-slate-100 last:border-0';
                    const timeLabel = it.time ? it.time.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '--:--';
                    row.innerHTML = `<span class="dot" style="background:${it.color}"></span><span class="text-xs font-mono text-slate-400 w-12">${timeLabel}</span><span class="text-sm text-slate-700">${it.label}</span>`;
                    timelineEl.appendChild(row);
                });
            }
        }

        function miniTaskRow(t) {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between bg-white/70 rounded-lg px-2.5 py-1.5';
            row.innerHTML = `<span class="text-slate-700">${escapeHtml(t.title)}</span><span class="text-xs text-slate-400">${new Date(t.deadline).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>`;
            return row;
        }
        function miniReminderRow(r) {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between bg-white/70 rounded-lg px-2.5 py-1.5';
            const sub = r.type === 'time' ? `ทุกวัน ${r.time}` : r.type === 'once' ? new Date(r.datetime).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : `📍 ${r.label || 'สถานที่'}`;
            row.innerHTML = `<span class="text-slate-700">${escapeHtml(r.text)}</span><span class="text-xs text-slate-400">${sub}</span>`;
            return row;
        }

        /* ============================================================
           CALENDAR VIEW
        ============================================================ */
        function toDateKey(d) {
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }

        function changeMonth(delta) {
            calendarDate.setMonth(calendarDate.getMonth() + delta);
            renderCalendar();
        }

        function renderCalendar() {
            const year = calendarDate.getFullYear();
            const month = calendarDate.getMonth();
            document.getElementById('calendar-title').innerText = calendarDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });

            const grid = document.getElementById('calendar-grid');
            grid.innerHTML = '';

            const firstDay = new Date(year, month, 1);
            const startOffset = firstDay.getDay(); // 0 = Sunday
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const today = new Date();

            // tasks grouped by date key
            const tasksByDay = {};
            tasks.forEach(t => {
                if (!t.deadline) return;
                const key = toDateKey(new Date(t.deadline));
                (tasksByDay[key] = tasksByDay[key] || []).push(t);
            });

            for (let i = 0; i < startOffset; i++) {
                grid.appendChild(document.createElement('div'));
            }

            for (let day = 1; day <= daysInMonth; day++) {
                const cellDate = new Date(year, month, day);
                const key = toDateKey(cellDate);
                const cell = document.createElement('div');
                cell.className = `day-cell cursor-pointer rounded-lg p-1.5 h-16 border border-slate-100 hover:bg-indigo-50 flex flex-col ${isSameDay(cellDate, today) ? 'today' : ''} ${key === selectedDay ? 'selected' : ''}`;
                cell.onclick = () => selectDay(key);

                const dayTasks = tasksByDay[key] || [];
                const dots = dayTasks.slice(0, 4).map(t => `<span class="dot" style="background:${QUADRANT_COLOR[t.quadrant]}"></span>`).join(' ');

                cell.innerHTML = `
                    <span class="text-xs font-medium text-slate-600">${day}</span>
                    <div class="flex flex-wrap gap-0.5 mt-auto">${dots}</div>
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
            const titleEl = document.getElementById('selected-day-title');
            const listEl = document.getElementById('selected-day-list');
            const addBtn = document.getElementById('add-on-day-btn');
            const d = new Date(selectedDay + 'T00:00:00');
            titleEl.innerText = d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            addBtn.classList.remove('hidden');

            const dayTasks = tasks.filter(t => t.deadline && toDateKey(new Date(t.deadline)) === selectedDay);
            listEl.innerHTML = '';
            if (!dayTasks.length) {
                listEl.innerHTML = '<p class="text-slate-400 text-xs">ไม่มีงานในวันนี้</p>';
                return;
            }
            dayTasks.forEach(t => {
                const row = document.createElement('div');
                row.className = 'flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2';
                row.innerHTML = `
                    <div class="flex items-center gap-2">
                        <span class="dot" style="background:${QUADRANT_COLOR[t.quadrant]}"></span>
                        <span class="${t.completed ? 'line-through text-slate-400' : 'text-slate-700'}">${escapeHtml(t.title)}</span>
                    </div>
                    <span class="text-xs text-slate-400">${new Date(t.deadline).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
                `;
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
           REMINDERS (quick daily notes: time / once / location)
        ============================================================ */
        function renderReminderTypeFields() {
            const type = document.getElementById('reminder-type').value;
            const container = document.getElementById('reminder-type-fields');
            if (type === 'time') {
                container.innerHTML = `
                    <div>
                        <label class="block text-sm font-medium text-slate-600 mb-1">เวลาที่จะเตือนทุกวัน</label>
                        <input type="time" id="reminder-time" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                    </div>`;
            } else if (type === 'once') {
                container.innerHTML = `
                    <div>
                        <label class="block text-sm font-medium text-slate-600 mb-1">วันและเวลา</label>
                        <input type="datetime-local" id="reminder-datetime" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                    </div>`;
            } else {
                container.innerHTML = `
                    <div class="space-y-2">
                        <label class="block text-sm font-medium text-slate-600 mb-1">ชื่อสถานที่ (เช่น บ้าน, ที่ทำงาน)</label>
                        <input type="text" id="reminder-loc-label" placeholder="เช่น หน้าประตูบ้าน" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                        <button type="button" onclick="captureLocation()" class="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm py-2 rounded-lg">📍 ใช้ตำแหน่งปัจจุบันเป็นจุดเตือน</button>
                        <p id="loc-status" class="text-xs text-slate-400"></p>
                        <label class="block text-sm font-medium text-slate-600 mb-1">รัศมีแจ้งเตือน (เมตร)</label>
                        <input type="number" id="reminder-radius" value="150" min="20" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                    </div>`;
            }
        }
        renderReminderTypeFields();

        let capturedLoc = null;
        function captureLocation() {
            const status = document.getElementById('loc-status');
            if (!navigator.geolocation) { status.innerText = 'อุปกรณ์นี้ไม่รองรับ Geolocation'; return; }
            status.innerText = 'กำลังค้นหาตำแหน่ง...';
            navigator.geolocation.getCurrentPosition(pos => {
                capturedLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                status.innerText = `บันทึกตำแหน่งแล้ว (${capturedLoc.lat.toFixed(5)}, ${capturedLoc.lng.toFixed(5)})`;
            }, () => { status.innerText = 'ไม่สามารถเข้าถึงตำแหน่งได้ กรุณาอนุญาต location'; });
        }

        function requestNotifPermission() {
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission();
            }
            document.getElementById('notif-permission-note').classList.toggle('hidden', !('Notification' in window) || Notification.permission === 'granted');
        }

        function addReminder(e) {
            e.preventDefault();
            requestNotifPermission();
            const text = document.getElementById('reminder-text').value;
            const type = document.getElementById('reminder-type').value;
            const reminder = { id: Date.now(), text, type, lastFiredDate: null, done: false };

            if (type === 'time') {
                reminder.time = document.getElementById('reminder-time').value;
            } else if (type === 'once') {
                reminder.datetime = document.getElementById('reminder-datetime').value;
            } else {
                if (!capturedLoc) { alert('กรุณากดปุ่ม "ใช้ตำแหน่งปัจจุบัน" ก่อนบันทึก'); return; }
                reminder.label = document.getElementById('reminder-loc-label').value;
                reminder.lat = capturedLoc.lat;
                reminder.lng = capturedLoc.lng;
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
            listEl.innerHTML = '';
            if (!reminders.length) {
                listEl.innerHTML = '<p class="text-slate-400 text-sm">ยังไม่มีรายการ ลองเพิ่มเรื่องเล็กๆ ที่มักลืม เช่น กินยา หรือทิ้งขยะ</p>';
                return;
            }
            reminders.forEach(r => {
                const icon = r.type === 'time' ? '⏰' : r.type === 'once' ? '📆' : '📍';
                const sub = r.type === 'time' ? `ทุกวัน เวลา ${r.time} น.`
                    : r.type === 'once' ? new Date(r.datetime).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
                    : `เมื่อถึง ${escapeHtml(r.label || 'จุดที่กำหนด')} (รัศมี ${r.radius} ม.)`;
                const row = document.createElement('div');
                row.className = 'flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5';
                row.innerHTML = `
                    <div>
                        <span class="text-sm font-medium text-slate-700">${icon} ${escapeHtml(r.text)}</span>
                        <div class="text-xs text-slate-400">${sub}</div>
                    </div>
                    <button onclick="deleteReminder(${r.id})" class="text-slate-400 hover:text-rose-500 text-xs px-1.5 py-1">✕</button>
                `;
                listEl.appendChild(row);
            });
        }

        /* ---- reminder firing engine ---- */
        function haversineMeters(lat1, lon1, lat2, lon2) {
            const R = 6371000;
            const toRad = deg => deg * Math.PI / 180;
            const dLat = toRad(lat2 - lat1);
            const dLon = toRad(lon2 - lon1);
            const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }

        function notify(title, body) {
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(title, { body });
            } else {
                console.log('[เตือนความจำ]', title, body);
            }
        }

        function checkTimeAndOnceReminders() {
            const now = new Date();
            const todayKey = toDateKey(now);
            const hhmm = now.toTimeString().slice(0, 5);
            let changed = false;

            reminders.forEach(r => {
                if (r.type === 'time' && r.time === hhmm && r.lastFiredDate !== todayKey) {
                    notify('🔔 ถึงเวลาแล้ว', r.text);
                    r.lastFiredDate = todayKey;
                    changed = true;
                }
                if (r.type === 'once' && !r.done && r.datetime && new Date(r.datetime) <= now) {
                    notify('🔔 ถึงกำหนดแล้ว', r.text);
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
                        const dist = haversineMeters(pos.coords.latitude, pos.coords.longitude, r.lat, r.lng);
                        if (dist <= r.radius) {
                            notify('📍 ถึงจุดที่กำหนดแล้ว', r.text);
                            r.lastFiredDate = todayKey;
                            changed = true;
                        }
                    }
                });
                if (changed) { saveReminders(); renderReminderList(); }
            }, () => {}, { enableHighAccuracy: false, maximumAge: 60000 });
        }

        /* ============================================================
           POMODORO TIMER
        ============================================================ */
        let timerInterval = null;
        let timeLeft = 25 * 60;
        let isRunning = false;

        function updateTimerDisplay() {
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            document.getElementById('timer-display').innerText =
                `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
        function startTimer() {
            if (isRunning) return;
            isRunning = true;
            timerInterval = setInterval(() => {
                if (timeLeft > 0) { timeLeft--; updateTimerDisplay(); }
                else { clearInterval(timerInterval); isRunning = false; notify('⏳ หมดเวลาโฟกัส!', 'พักผ่อนสักครู่ 🧋'); alert("หมดเวลาโฟกัส! พักผ่อนสักครู่ 🧋"); }
            }, 1000);
        }
        function pauseTimer() { clearInterval(timerInterval); isRunning = false; }
        function resetTimer() { clearInterval(timerInterval); isRunning = false; timeLeft = 25 * 60; updateTimerDisplay(); }

        /* ============================================================
           INIT
        ============================================================ */
        renderAll();
        if (reminders.some(r => r.type === 'location')) startLocationWatch();
        setInterval(checkTimeAndOnceReminders, 20 * 1000);
        setInterval(renderToday, 60 * 1000);