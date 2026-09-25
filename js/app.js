const firebaseConfig = {
    apiKey: "AIzaSyC1Kr7F-VabqWhw6YdZ7nI0f4yWXzNtWoA",
    authDomain: "dongtien-39b49.firebaseapp.com",
    databaseURL: "https://dongtien-39b49-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "dongtien-39b49",
    storageBucket: "dongtien-39b49.firebasestorage.app",
    messagingSenderId: "609298110570",
    appId: "1:609298110570:web:623ca8cfce1edc8ad6d213"
};

let app, auth, db;
let data = [];
let currentUser = null;
let userRole = 'guest';
let deleteId = null;
let unsubscribe = null;
const PAGE_SIZE = 5;
let currentPage = 1;
let filteredCache = [];
let calMonth = new Date().getMonth() + 1;
let calYear = new Date().getFullYear();
let calendarModal = null;
let knownIds = new Set();
let snapshotReady = false;

const formModal = new bootstrap.Modal(document.getElementById('formModal'));
const deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
calendarModal = new bootstrap.Modal(document.getElementById('calendarModal'));

function canEdit() {
    return userRole === 'editor' || userRole === 'admin';
}
function canAdmin() {
    return userRole === 'admin';
}

function itemYear(item) {
    return Number(item.nam) || new Date().getFullYear();
}

function initTheme() {
    const saved = localStorage.getItem('Xu_theme') || 'light';
    applyTheme(saved);
}
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('Xu_theme', theme);
    const icon = document.getElementById('themeIcon');
    if (icon) icon.className = theme === 'dark' ? 'bi bi-sun' : 'bi bi-moon-stars';
}
function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(cur === 'dark' ? 'light' : 'dark');
}

function showToast(message, type) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'app-toast' + (type ? ' toast-' + type : '');
    el.innerHTML = `<i class="bi bi-bell-fill me-2"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 300);
    }, 4000);
}

function initFirebase() {
    try {
        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();

        auth.onAuthStateChanged(async user => {
            currentUser = user;
            if (user) {
                await resolveUserRole(user);
            } else {
                userRole = 'guest';
            }
            updateAdminUI();
        });

        unsubscribe = db.collection('tien_dong')
            .orderBy('createdAt', 'desc')
            .onSnapshot(snapshot => {
                const prevIds = new Set(knownIds);
                data = [];
                const newOnes = [];
                snapshot.forEach(doc => {
                    const row = { id: doc.id, ...doc.data() };
                    data.push(row);
                    if (snapshotReady && !prevIds.has(doc.id)) {
                        newOnes.push(row);
                    }
                    knownIds.add(doc.id);
                });
                const currentIds = new Set(data.map(d => d.id));
                knownIds.forEach(id => {
                    if (!currentIds.has(id)) knownIds.delete(id);
                });

                if (snapshotReady && newOnes.length) {
                    newOnes.forEach(item => {
                        showToast(`${item.ten || 'Ai đó'} vừa đóng ${formatMoney(item.tienDong)}`, 'success');
                    });
                }
                snapshotReady = true;

                renderTable();
                updateStats();
                document.getElementById('loadingOverlay').classList.add('hidden');
            }, error => {
                console.error('Lỗi Firestore:', error);
                document.getElementById('loadingOverlay').classList.add('hidden');
                alert('Lỗi kết nối Firestore: ' + error.message);
            });

    } catch (err) {
        console.error(err);
        document.getElementById('loadingOverlay').classList.add('hidden');
        alert('Lỗi khởi tạo Firebase: ' + err.message);
    }
}

async function resolveUserRole(user) {
    try {
        const ref = db.collection('users').doc(user.uid);
        const snap = await ref.get();
        if (snap.exists) {
            userRole = snap.data().role === 'admin' ? 'admin' : 'editor';
            return;
        }
        const admins = await db.collection('users').where('role', '==', 'admin').limit(1).get();
        const role = admins.empty ? 'admin' : 'editor';
        await ref.set({
            email: user.email,
            role,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        userRole = role;
        if (role === 'admin') {
            showToast('Bạn là Admin đầu tiên của hệ thống', 'success');
        }
    } catch (e) {
        console.error('resolveUserRole', e);
        userRole = 'editor';
    }
}

function updateAdminUI() {
    const editorEls = [
        document.getElementById('btnAdd'),
        document.getElementById('actionCol'),
        document.getElementById('adminBadge'),
        document.getElementById('btnLogout')
    ];
    const adminEls = [
        document.getElementById('btnClearAllHeader'),
        document.getElementById('btnBackup'),
        document.getElementById('btnRestore')
    ];
    const guestOnly = [document.getElementById('btnLogin')];

    editorEls.forEach(el => {
        if (!el) return;
        if (canEdit()) el.classList.remove('hidden');
        else el.classList.add('hidden');
    });
    adminEls.forEach(el => {
        if (!el) return;
        if (canAdmin()) el.classList.remove('hidden');
        else el.classList.add('hidden');
    });
    guestOnly.forEach(el => {
        if (!el) return;
        if (canEdit()) el.classList.add('hidden');
        else el.classList.remove('hidden');
    });

    if (canEdit() && currentUser) {
        document.getElementById('adminEmail').textContent = currentUser.email;
        const rb = document.getElementById('roleBadge');
        if (rb) {
            rb.textContent = userRole === 'admin' ? 'Admin' : 'Editor';
            rb.className = 'role-pill ' + (userRole === 'admin' ? 'role-admin' : 'role-editor');
        }
    }

    renderTable();
}

async function doLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPass').value;
    const errorEl = document.getElementById('loginError');
    const btn = document.getElementById('btnDoLogin');

    if (!email || !password) {
        errorEl.textContent = 'Vui lòng nhập đầy đủ email và mật khẩu';
        errorEl.classList.remove('hidden');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Đang đăng nhập...';

    try {
        await auth.signInWithEmailAndPassword(email, password);
        errorEl.classList.add('hidden');
        loginModal.hide();
        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPass').value = '';
    } catch (error) {
        let msg = 'Đăng nhập thất bại';
        if (error.code === 'auth/user-not-found') msg = 'Email không tồn tại';
        else if (error.code === 'auth/wrong-password') msg = 'Sai mật khẩu';
        else if (error.code === 'auth/invalid-email') msg = 'Email không hợp lệ';
        else if (error.code === 'auth/invalid-credential') msg = 'Email hoặc mật khẩu không đúng';
        else msg = error.message;
        errorEl.textContent = msg;
        errorEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-box-arrow-in-right me-1"></i> Đăng nhập';
    }
}

async function doLogout() {
    try {
        await auth.signOut();
        userRole = 'guest';
    } catch (err) {
        console.error(err);
    }
}

document.getElementById('loginPass').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') doLogin();
});

function formatMoney(amount) {
    const n = Number(amount) || 0;
    return new Intl.NumberFormat('vi-VN').format(n) + ' Xu';
}

function updateStats() {
    document.getElementById('totalRecords').textContent = data.length;

    const total = data.reduce((sum, item) => sum + (Number(item.tienDong) || 0), 0);
    document.getElementById('totalAmount').textContent = formatMoney(total);

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const thisMonthTotal = data
        .filter(item => Number(item.thang) === currentMonth && itemYear(item) === currentYear)
        .reduce((sum, item) => sum + (Number(item.tienDong) || 0), 0);
    document.getElementById('thisMonth').textContent = formatMoney(thisMonthTotal);

    const today = now.getDate();
    const todayTotal = data
        .filter(item => Number(item.ngay) === today && Number(item.thang) === currentMonth && itemYear(item) === currentYear)
        .reduce((sum, item) => sum + (Number(item.tienDong) || 0), 0);
    document.getElementById('todayAmount').textContent = formatMoney(todayTotal);
}

function openCalendarModal() {
    calMonth = new Date().getMonth() + 1;
    calYear = new Date().getFullYear();
    renderCalendar();
    document.getElementById('calDayDetail').classList.add('d-none');
    calendarModal.show();
}

function changeCalMonth(delta) {
    calMonth += delta;
    if (calMonth < 1) { calMonth = 12; calYear -= 1; }
    if (calMonth > 12) { calMonth = 1; calYear += 1; }
    document.getElementById('calDayDetail').classList.add('d-none');
    renderCalendar();
}

function getDaysInMonth(month, year) {
    return new Date(year, month, 0).getDate();
}

const LUNAR_TZ = 7;
function _INT(d) { return Math.floor(d); }
function jdFromDate(dd, mm, yy) {
    var a = _INT((14 - mm) / 12);
    var y = yy + 4800 - a;
    var m = mm + 12 * a - 3;
    var jd = dd + _INT((153 * m + 2) / 5) + 365 * y + _INT(y / 4) - _INT(y / 100) + _INT(y / 400) - 32045;
    if (jd < 2299161) {
        jd = dd + _INT((153 * m + 2) / 5) + 365 * y + _INT(y / 4) - 32083;
    }
    return jd;
}
function NewMoon(k) {
    var T = k / 1236.85, T2 = T * T, T3 = T2 * T, dr = Math.PI / 180;
    var Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
    Jd1 = Jd1 + 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
    var M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
    var Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
    var F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
    var C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
    C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
    C1 = C1 - 0.0004 * Math.sin(dr * 3 * Mpr);
    C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
    C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
    C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
    C1 = C1 + 0.0010 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
    var deltat;
    if (T < -11) {
        deltat = 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3;
    } else {
        deltat = -0.000278 + 0.000265 * T + 0.000262 * T2;
    }
    return Jd1 + C1 - deltat;
}
function SunLongitude(jdn) {
    var T = (jdn - 2451545.0) / 36525, T2 = T * T, dr = Math.PI / 180;
    var M = 357.52910 + 35999.05030 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
    var L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
    var DL = (1.914600 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
    DL = DL + (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.000290 * Math.sin(dr * 3 * M);
    var L = (L0 + DL) * dr;
    L = L - Math.PI * 2 * (_INT(L / (Math.PI * 2)));
    return L;
}
function getSunLongitude(dayNumber, timeZone) {
    return _INT(SunLongitude(dayNumber - 0.5 - timeZone / 24) / Math.PI * 6);
}
function getNewMoonDay(k, timeZone) {
    return _INT(NewMoon(k) + 0.5 + timeZone / 24);
}
function getLunarMonth11(yy, timeZone) {
    var off = jdFromDate(31, 12, yy) - 2415021;
    var k = _INT(off / 29.530588853);
    var nm = getNewMoonDay(k, timeZone);
    var sunLong = getSunLongitude(nm, timeZone);
    if (sunLong >= 9) nm = getNewMoonDay(k - 1, timeZone);
    return nm;
}
function getLeapMonthOffset(a11, timeZone) {
    var k = _INT((a11 - 2415021.076998695) / 29.530588853 + 0.5);
    var last = 0, i = 1;
    var arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
    do {
        last = arc;
        i++;
        arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
    } while (arc != last && i < 14);
    return i - 1;
}
function convertSolar2Lunar(dd, mm, yy, timeZone) {
    var dayNumber = jdFromDate(dd, mm, yy);
    var k = _INT((dayNumber - 2415021.076998695) / 29.530588853);
    var monthStart = getNewMoonDay(k + 1, timeZone);
    if (monthStart > dayNumber) monthStart = getNewMoonDay(k, timeZone);
    var a11 = getLunarMonth11(yy, timeZone);
    var b11 = a11;
    var lunarYear;
    if (a11 >= monthStart) {
        lunarYear = yy;
        a11 = getLunarMonth11(yy - 1, timeZone);
    } else {
        lunarYear = yy + 1;
        b11 = getLunarMonth11(yy + 1, timeZone);
    }
    var lunarDay = dayNumber - monthStart + 1;
    var diff = _INT((monthStart - a11) / 29);
    var lunarLeap = 0;
    var lunarMonth = diff + 11;
    if (b11 - a11 > 365) {
        var leapMonthDiff = getLeapMonthOffset(a11, timeZone);
        if (diff >= leapMonthDiff) {
            lunarMonth = diff + 10;
            if (diff == leapMonthDiff) lunarLeap = 1;
        }
    }
    if (lunarMonth > 12) lunarMonth = lunarMonth - 12;
    if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;
    return { day: lunarDay, month: lunarMonth, year: lunarYear, leap: lunarLeap };
}
function formatLunarLabel(lunar) {
    if (!lunar) return '';
    var m = lunar.leap ? 'N' + lunar.month : lunar.month;
    if (lunar.day === 1) return lunar.day + '/' + m;
    return String(lunar.day);
}

function renderCalendar() {
    document.getElementById('calMonthLabel').textContent = `Tháng ${calMonth}/${calYear}`;
    const grid = document.getElementById('calGrid');
    const daysInMonth = getDaysInMonth(calMonth, calYear);

    const dayMap = {};
    data.forEach(item => {
        if (Number(item.thang) !== calMonth || itemYear(item) !== calYear) return;
        const d = Number(item.ngay);
        if (!dayMap[d]) dayMap[d] = { total: 0, count: 0 };
        dayMap[d].total += Number(item.tienDong) || 0;
        dayMap[d].count += 1;
    });

    const startWeekday = new Date(calYear, calMonth - 1, 1).getDay();

    let html = '';
    for (let i = 0; i < startWeekday; i++) {
        html += '<div class="cal-cell empty"></div>';
    }
    for (let d = 1; d <= daysInMonth; d++) {
        const has = !!dayMap[d];
        const cls = 'cal-cell' + (has ? ' has-data' : '');
        const lunar = convertSolar2Lunar(d, calMonth, calYear, LUNAR_TZ);
        const lunarTxt = formatLunarLabel(lunar);
        const titleParts = [];
        if (has) titleParts.push(`${dayMap[d].count} người · ${formatMoney(dayMap[d].total)}`);
        titleParts.push(`Âm lịch: ${lunar.day}/${lunar.month}${lunar.leap ? ' (nhuận)' : ''}/${lunar.year}`);
        const title = titleParts.join(' · ');
        html += `<button type="button" class="${cls}" data-day="${d}" title="${title}" onclick="showCalDayDetail(${d})">
            <span class="cal-solar">${d}</span>
            <span class="cal-lunar">${lunarTxt}</span>
        </button>`;
    }
    grid.innerHTML = html;
}

function showCalDayDetail(day) {
    const items = data.filter(item =>
        Number(item.thang) === calMonth &&
        Number(item.ngay) === day &&
        itemYear(item) === calYear
    );
    const detail = document.getElementById('calDayDetail');
    const list = document.getElementById('calDetailList');
    const title = document.getElementById('calDetailTitle');
    const totalEl = document.getElementById('calDetailTotal');

    document.querySelectorAll('.cal-cell').forEach(el => el.classList.remove('selected'));
    const btn = document.querySelector(`.cal-cell[data-day="${day}"]`);
    if (btn) btn.classList.add('selected');

    const lunar = convertSolar2Lunar(day, calMonth, calYear, LUNAR_TZ);
    const lunarStr = `${lunar.day}/${lunar.month}${lunar.leap ? ' (nhuận)' : ''}/${lunar.year}`;
    title.innerHTML = `Ngày ${day}/${calMonth}/${calYear} <span class="cal-detail-lunar">(Âm: ${lunarStr})</span>`;
    const total = items.reduce((s, i) => s + (Number(i.tienDong) || 0), 0);
    totalEl.textContent = formatMoney(total);

    if (items.length === 0) {
        list.innerHTML = '<p class="text-muted small mb-0">Chưa có ai đóng Xu ngày này.</p>';
    } else {
        list.innerHTML = items.map(item => `
            <div class="cal-detail-item">
                <div>
                    <strong>${escapeHtml(item.ten || '')}</strong>
                    <span class="text-muted small ms-2">${formatGioDisplay(item.gio)}</span>
                    ${item.ghiChu ? `<div class="small text-muted">${escapeHtml(item.ghiChu)}</div>` : ''}
                </div>
                <span class="amount">${formatMoney(item.tienDong)}</span>
            </div>
        `).join('');
    }
    detail.classList.remove('d-none');
}

function renderTable(resetPage) {
    const tbody = document.getElementById('tableBody');
    const mobileCards = document.getElementById('mobileCards');
    const emptyState = document.getElementById('emptyState');
    const paginationBar = document.getElementById('paginationBar');
    const search = document.getElementById('searchInput').value.toLowerCase().trim();

    filteredCache = data.filter(item => {
        return !search || (item.ten || '').toLowerCase().includes(search);
    });

    const totalPages = Math.max(1, Math.ceil(filteredCache.length / PAGE_SIZE));
    if (resetPage !== false) {
        if (typeof resetPage === 'undefined') currentPage = 1;
    }
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    if (filteredCache.length === 0) {
        tbody.innerHTML = '';
        mobileCards.innerHTML = '';
        emptyState.classList.remove('d-none');
        paginationBar.classList.add('d-none');
        return;
    }

    emptyState.classList.add('d-none');

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filteredCache.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = pageItems.map((item, index) => {
        const rowNum = start + index + 1;
        const actionBtns = canEdit() ? `
            <td class="text-center">
                <button class="btn btn-sm btn-outline-primary btn-action me-1" onclick="openEditModal('${item.id}')" title="Sửa">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger btn-action" onclick="openDeleteModal('${item.id}')" title="Xóa">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        ` : '';
        const note = item.ghiChu ? escapeHtml(item.ghiChu) : '—';

        return `
            <tr>
                <td>${rowNum}</td>
                <td><strong>${escapeHtml(item.ten || '')}</strong></td>
                <td>${item.ngay}</td>
                <td>${formatGioDisplay(item.gio)}</td>
                <td><span class="badge bg-primary">${item.thang}/${itemYear(item)}</span></td>
                <td class="amount">${formatMoney(item.tienDong)}</td>
                <td class="note-cell" title="${note}">${note}</td>
                ${actionBtns}
            </tr>
        `;
    }).join('');

    mobileCards.innerHTML = pageItems.map((item, index) => {
        const rowNum = start + index + 1;
        const actionBtns = canEdit() ? `
            <div class="mobile-card-actions">
                <button class="btn btn-sm btn-outline-primary" onclick="openEditModal('${item.id}')">
                    <i class="bi bi-pencil me-1"></i>Sửa
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="openDeleteModal('${item.id}')">
                    <i class="bi bi-trash me-1"></i>Xóa
                </button>
            </div>
        ` : '';

        return `
            <div class="mobile-card">
                <div class="mobile-card-header">
                    <span class="mobile-card-index">#${rowNum}</span>
                    <strong class="mobile-card-name">${escapeHtml(item.ten || '')}</strong>
                    <span class="amount mobile-card-amount">${formatMoney(item.tienDong)}</span>
                </div>
                <div class="mobile-card-body">
                    <div class="mobile-card-row">
                        <span class="label"><i class="bi bi-calendar3 me-1"></i>Ngày</span>
                        <span>${item.ngay}/${item.thang}/${itemYear(item)}</span>
                    </div>
                    <div class="mobile-card-row">
                        <span class="label"><i class="bi bi-clock me-1"></i>Giờ</span>
                        <span>${formatGioDisplay(item.gio)}</span>
                    </div>
                    ${item.ghiChu ? `
                    <div class="mobile-card-row">
                        <span class="label"><i class="bi bi-chat-left-text me-1"></i>Ghi chú</span>
                        <span>${escapeHtml(item.ghiChu)}</span>
                    </div>` : ''}
                </div>
                ${actionBtns}
            </div>
        `;
    }).join('');

    if (filteredCache.length > PAGE_SIZE) {
        paginationBar.classList.remove('d-none');
        document.getElementById('pageInfo').textContent = `${currentPage} / ${totalPages}`;
        document.getElementById('btnPrevPage').disabled = currentPage <= 1;
        document.getElementById('btnNextPage').disabled = currentPage >= totalPages;
    } else {
        paginationBar.classList.add('d-none');
    }
}

function changePage(delta) {
    const totalPages = Math.max(1, Math.ceil(filteredCache.length / PAGE_SIZE));
    const next = currentPage + delta;
    if (next < 1 || next > totalPages) return;
    currentPage = next;
    renderTable(false);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

function initTimeSelects() {
    const hour = document.getElementById('gioHour');
    const min = document.getElementById('gioMin');
    const sec = document.getElementById('gioSec');
    if (!hour || hour.options.length) return;

    hour.innerHTML = '<option value="">--</option>' +
        Array.from({ length: 24 }, (_, i) => `<option value="${pad2(i)}">${pad2(i)}</option>`).join('');
    min.innerHTML = '<option value="">--</option>' +
        Array.from({ length: 60 }, (_, i) => `<option value="${pad2(i)}">${pad2(i)}</option>`).join('');
    sec.innerHTML = '<option value="">--</option>' +
        Array.from({ length: 60 }, (_, i) => `<option value="${pad2(i)}">${pad2(i)}</option>`).join('');
}

function getGioValue() {
    const h = document.getElementById('gioHour').value;
    const m = document.getElementById('gioMin').value;
    const s = document.getElementById('gioSec').value;
    if (h === '' && m === '' && s === '') return '';
    return `${h || '00'}:${m || '00'}:${s || '00'}`;
}

function setGioValue(value) {
    const hour = document.getElementById('gioHour');
    const min = document.getElementById('gioMin');
    const sec = document.getElementById('gioSec');
    hour.value = '';
    min.value = '';
    sec.value = '';
    if (!value) return;

    let str = String(value).trim();
    let isPM = /pm|ch/i.test(str);
    let isAM = /am|sa/i.test(str);
    str = str.replace(/\s*(am|pm|sa|ch)\.?/ig, '').trim();

    const parts = str.split(':').map(p => parseInt(p, 10));
    if (!parts.length || isNaN(parts[0])) return;

    let h = parts[0] || 0;
    const mi = parts[1] || 0;
    const se = parts[2] || 0;

    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    if (h > 23) h = h % 24;

    hour.value = pad2(h);
    min.value = pad2(Math.min(59, Math.max(0, mi)));
    sec.value = pad2(Math.min(59, Math.max(0, se)));
}

function formatGioDisplay(value) {
    if (!value) return '—';
    let str = String(value).trim();
    let isPM = /pm|ch/i.test(str);
    let isAM = /am|sa/i.test(str);
    str = str.replace(/\s*(am|pm|sa|ch)\.?/ig, '').trim();
    const parts = str.split(':');
    if (!parts.length) return '—';
    let h = parseInt(parts[0], 10);
    if (isNaN(h)) return escapeHtml(str);
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    const mi = parts[1] !== undefined ? pad2(parseInt(parts[1], 10) || 0) : '00';
    const se = parts[2] !== undefined ? pad2(parseInt(parts[2], 10) || 0) : null;
    return se !== null ? `${pad2(h)}:${mi}:${se}` : `${pad2(h)}:${mi}`;
}

function openAddModal() {
    if (!canEdit()) return;
    document.getElementById('modalTitle').textContent = 'Thêm bản ghi mới';
    document.getElementById('dataForm').reset();
    document.getElementById('editId').value = '';
    const now = new Date();
    document.getElementById('thang').value = now.getMonth() + 1;
    document.getElementById('ngay').value = now.getDate();
    document.getElementById('nam').value = now.getFullYear();
    setGioValue(`${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`);
}

function openEditModal(id) {
    if (!canEdit()) return;
    const item = data.find(d => d.id === id);
    if (!item) return;

    document.getElementById('modalTitle').textContent = 'Sửa bản ghi';
    document.getElementById('editId').value = item.id;
    document.getElementById('ten').value = item.ten || '';
    document.getElementById('ngay').value = item.ngay;
    setGioValue(item.gio || '');
    document.getElementById('thang').value = item.thang;
    document.getElementById('nam').value = itemYear(item);
    document.getElementById('tienDong').value = item.tienDong;
    document.getElementById('ghiChu').value = item.ghiChu || '';
    formModal.show();
}

async function saveData() {
    if (!canEdit()) return;

    const form = document.getElementById('dataForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const id = document.getElementById('editId').value;
    const payload = {
        ten: document.getElementById('ten').value.trim(),
        ngay: parseInt(document.getElementById('ngay').value),
        gio: getGioValue(),
        thang: parseInt(document.getElementById('thang').value),
        nam: parseInt(document.getElementById('nam').value),
        tienDong: parseInt(document.getElementById('tienDong').value),
        ghiChu: document.getElementById('ghiChu').value.trim(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const btn = document.getElementById('btnSave');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Đang lưu...';

    try {
        if (id) {
            await db.collection('tien_dong').doc(id).update(payload);
        } else {
            payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            payload.createdBy = currentUser.email;
            await db.collection('tien_dong').add(payload);
        }
        formModal.hide();
    } catch (error) {
        console.error(error);
        alert('Lỗi lưu dữ liệu: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check-lg me-1"></i> Lưu';
    }
}

function openDeleteModal(id) {
    if (!canEdit()) return;
    const item = data.find(d => d.id === id);
    if (!item) return;
    deleteId = id;
    document.getElementById('deleteName').textContent = item.ten;
    deleteModal.show();
}

async function confirmDelete() {
    if (!canEdit() || !deleteId) return;

    const btn = document.getElementById('btnConfirmDelete');
    btn.disabled = true;

    try {
        await db.collection('tien_dong').doc(deleteId).delete();
        deleteModal.hide();
        deleteId = null;
    } catch (error) {
        console.error(error);
        alert('Lỗi xóa: ' + error.message);
    } finally {
        btn.disabled = false;
    }
}

async function clearAll() {
    if (!canAdmin()) return;
    if (data.length === 0) {
        alert('Không có dữ liệu để xóa.');
        return;
    }
    if (!confirm('Bạn có chắc muốn XÓA TẤT CẢ dữ liệu? Hành động này không thể hoàn tác!')) return;

    try {
        const batch = db.batch();
        data.forEach(item => {
            batch.delete(db.collection('tien_dong').doc(item.id));
        });
        await batch.commit();
        showToast('Đã xóa toàn bộ dữ liệu', 'success');
    } catch (error) {
        console.error(error);
        alert('Lỗi xóa tất cả: ' + error.message);
    }
}

function exportBackup() {
    if (!canAdmin()) return;
    const payload = {
        exportedAt: new Date().toISOString(),
        version: 1,
        records: data.map(({ id, ...rest }) => {
            const copy = { id, ...rest };
            if (copy.createdAt && copy.createdAt.toDate) copy.createdAt = copy.createdAt.toDate().toISOString();
            if (copy.updatedAt && copy.updatedAt.toDate) copy.updatedAt = copy.updatedAt.toDate().toISOString();
            return copy;
        })
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Xu-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Đã tải file sao lưu', 'success');
}

async function importBackup(event) {
    if (!canAdmin()) return;
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;

    if (!confirm('Khôi phục sẽ THÊM các bản ghi từ file vào hệ thống (không xóa dữ liệu hiện có). Tiếp tục?')) return;

    try {
        const text = await file.text();
        const json = JSON.parse(text);
        const records = Array.isArray(json) ? json : (json.records || []);
        if (!records.length) {
            alert('File không có bản ghi hợp lệ.');
            return;
        }

        let batch = db.batch();
        let count = 0;
        let ops = 0;

        for (const rec of records) {
            const ref = db.collection('tien_dong').doc();
            const payload = {
                ten: rec.ten || '',
                ngay: Number(rec.ngay) || 1,
                gio: rec.gio || '',
                thang: Number(rec.thang) || 1,
                nam: Number(rec.nam) || new Date().getFullYear(),
                tienDong: Number(rec.tienDong) || 0,
                ghiChu: rec.ghiChu || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: currentUser ? currentUser.email : 'import',
                imported: true
            };
            batch.set(ref, payload);
            ops++;
            count++;
            if (ops >= 400) {
                await batch.commit();
                batch = db.batch();
                ops = 0;
            }
        }
        if (ops > 0) await batch.commit();
        showToast(`Đã khôi phục ${count} bản ghi`, 'success');
    } catch (err) {
        console.error(err);
        alert('Lỗi khôi phục: ' + err.message);
    }
}

function init() {
    initTheme();
    initTimeSelects();
    initFirebase();
}

init();