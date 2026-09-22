// ============================================================
// FIREBASE CONFIG
// ============================================================
const firebaseConfig = {
    apiKey: "AIzaSyC1Kr7F-VabqWhw6YdZ7nI0f4yWXzNtWoA",
    authDomain: "dongtien-39b49.firebaseapp.com",
    databaseURL: "https://dongtien-39b49-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "dongtien-39b49",
    storageBucket: "dongtien-39b49.firebasestorage.app",
    messagingSenderId: "609298110570",
    appId: "1:609298110570:web:623ca8cfce1edc8ad6d213"
};

// ============================================================
// KHỞI TẠO
// ============================================================
let app, auth, db;
let data = [];
let isAdmin = false;
let currentUser = null;
let deleteId = null;
let unsubscribe = null;

const formModal = new bootstrap.Modal(document.getElementById('formModal'));
const deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));

function initFirebase() {
    try {
        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();

        auth.onAuthStateChanged(user => {
            currentUser = user;
            isAdmin = !!user;
            updateAdminUI();
        });

        unsubscribe = db.collection('tien_dong')
            .orderBy('createdAt', 'desc')
            .onSnapshot(snapshot => {
                data = [];
                snapshot.forEach(doc => {
                    data.push({ id: doc.id, ...doc.data() });
                });
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

// ============================================================
// UI ADMIN
// ============================================================
function updateAdminUI() {
    const adminOnly = [
        document.getElementById('btnAdd'),
        document.getElementById('btnClearAll'),
        document.getElementById('actionCol'),
        document.getElementById('adminBadge'),
        document.getElementById('btnLogout')
    ];
    const guestOnly = [document.getElementById('btnLogin')];

    adminOnly.forEach(el => {
        if (isAdmin) el.classList.remove('hidden');
        else el.classList.add('hidden');
    });
    guestOnly.forEach(el => {
        if (isAdmin) el.classList.add('hidden');
        else el.classList.remove('hidden');
    });

    if (isAdmin && currentUser) {
        document.getElementById('adminEmail').textContent = currentUser.email;
    }

    renderTable();
}

// ============================================================
// ĐĂNG NHẬP / ĐĂNG XUẤT
// ============================================================
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
    } catch (err) {
        console.error(err);
    }
}

document.getElementById('loginPass').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') doLogin();
});

// ============================================================
// THỐNG KÊ
// ============================================================
function formatMoney(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
}

function updateStats() {
    document.getElementById('totalRecords').textContent = data.length;

    const total = data.reduce((sum, item) => sum + (Number(item.tienDong) || 0), 0);
    document.getElementById('totalAmount').textContent = formatMoney(total);

    const currentMonth = new Date().getMonth() + 1;
    const thisMonthTotal = data
        .filter(item => Number(item.thang) === currentMonth)
        .reduce((sum, item) => sum + (Number(item.tienDong) || 0), 0);
    document.getElementById('thisMonth').textContent = formatMoney(thisMonthTotal);

    const today = new Date().getDate();
    const todayTotal = data
        .filter(item => Number(item.ngay) === today && Number(item.thang) === currentMonth)
        .reduce((sum, item) => sum + (Number(item.tienDong) || 0), 0);
    document.getElementById('todayAmount').textContent = formatMoney(todayTotal);

    renderDailyTotals();
}

function renderDailyTotals() {
    const container = document.getElementById('dailyTotals');
    if (data.length === 0) {
        container.innerHTML = '<p class="text-muted small mb-0">Chưa có dữ liệu</p>';
        return;
    }

    const groups = {};
    data.forEach(item => {
        const key = `${item.ngay}/${item.thang}`;
        if (!groups[key]) {
            groups[key] = { ngay: item.ngay, thang: item.thang, total: 0 };
        }
        groups[key].total += Number(item.tienDong) || 0;
    });

    const sorted = Object.values(groups).sort((a, b) => {
        if (b.thang !== a.thang) return b.thang - a.thang;
        return b.ngay - a.ngay;
    });

    container.innerHTML = sorted.map(g => `
        <div class="daily-item">
            <span>Ngày ${g.ngay}/${g.thang}</span>
            <strong class="amount">${formatMoney(g.total)}</strong>
        </div>
    `).join('');
}

// ============================================================
// BẢNG
// ============================================================
function renderTable() {
    const tbody = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');
    const search = document.getElementById('searchInput').value.toLowerCase().trim();
    const filterMonth = document.getElementById('filterMonth').value;
    const filterDay = document.getElementById('filterDay').value;

    let filtered = data.filter(item => {
        const matchName = !search || (item.ten || '').toLowerCase().includes(search);
        const matchMonth = !filterMonth || Number(item.thang) === Number(filterMonth);
        const matchDay = !filterDay || Number(item.ngay) === Number(filterDay);
        return matchName && matchMonth && matchDay;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        emptyState.classList.remove('d-none');
        return;
    }

    emptyState.classList.add('d-none');

    tbody.innerHTML = filtered.map((item, index) => {
        const actionBtns = isAdmin ? `
            <td class="text-center">
                <button class="btn btn-sm btn-outline-primary btn-action me-1" onclick="openEditModal('${item.id}')" title="Sửa">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger btn-action" onclick="openDeleteModal('${item.id}')" title="Xóa">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        ` : '';

        return `
            <tr>
                <td>${index + 1}</td>
                <td><strong>${escapeHtml(item.ten || '')}</strong></td>
                <td>${item.ngay}</td>
                <td>${item.gio || '—'}</td>
                <td><span class="badge bg-primary">Tháng ${item.thang}</span></td>
                <td class="amount">${formatMoney(item.tienDong)}</td>
                ${actionBtns}
            </tr>
        `;
    }).join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// CRUD
// ============================================================
function openAddModal() {
    if (!isAdmin) return;
    document.getElementById('modalTitle').textContent = 'Thêm bản ghi mới';
    document.getElementById('dataForm').reset();
    document.getElementById('editId').value = '';
    document.getElementById('thang').value = new Date().getMonth() + 1;
    document.getElementById('ngay').value = new Date().getDate();
}

function openEditModal(id) {
    if (!isAdmin) return;
    const item = data.find(d => d.id === id);
    if (!item) return;

    document.getElementById('modalTitle').textContent = 'Sửa bản ghi';
    document.getElementById('editId').value = item.id;
    document.getElementById('ten').value = item.ten || '';
    document.getElementById('ngay').value = item.ngay;
    document.getElementById('gio').value = item.gio || '';
    document.getElementById('thang').value = item.thang;
    document.getElementById('tienDong').value = item.tienDong;
    formModal.show();
}

async function saveData() {
    if (!isAdmin) return;

    const form = document.getElementById('dataForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const id = document.getElementById('editId').value;
    const payload = {
        ten: document.getElementById('ten').value.trim(),
        ngay: parseInt(document.getElementById('ngay').value),
        gio: document.getElementById('gio').value || '',
        thang: parseInt(document.getElementById('thang').value),
        tienDong: parseInt(document.getElementById('tienDong').value),
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
    if (!isAdmin) return;
    const item = data.find(d => d.id === id);
    if (!item) return;
    deleteId = id;
    document.getElementById('deleteName').textContent = item.ten;
    deleteModal.show();
}

async function confirmDelete() {
    if (!isAdmin || !deleteId) return;

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
    if (!isAdmin) return;
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
    } catch (error) {
        console.error(error);
        alert('Lỗi xóa tất cả: ' + error.message);
    }
}

// ============================================================
// KHỞI TẠO
// ============================================================
function init() {
    const daySelect = document.getElementById('filterDay');
    for (let i = 1; i <= 31; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = 'Ngày ' + i;
        daySelect.appendChild(opt);
    }
    initFirebase();
}

init();
