/* ============================================================
   LOTUS Library System — App Engine
   PDF.js Book-Style Reader | Parchment Whisper Theme
   Profile Update | Member Editing | Item Issuing
   ============================================================ */

const API_BASE = '/api';

const state = {
    currentUser: null,
    activeTab: 'dashboard',
    books: [],
    newspapers: [],
    notes: [],
    categories: [],
    members: [],
    issuedItems: [],
    settings: {},
    charts: {},
    // PDF reader state
    pdfDoc: null,
    pdfCurrentPage: 1,
    pdfTotalPages: 0,
    pdfRendering: false,
    pdfRenderTask: null,
    pdfZoomMode: 'fit-page', // 'fit-page', 'fit-width', or scale numeric string e.g. '1.0'
    pdfZoomScale: 1.0       // actual scale value applied
};

// ==========================================
// 1. BOOT
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initAuthSession();
    setupFileInputHandlers();
    setupSidebarNav();
    document.getElementById('global-search')?.addEventListener('input', e => handleGlobalSearch(e.target.value));
});

function initAuthSession() {
    const saved = localStorage.getItem('lotus_user');
    if (!saved) { window.location.href = 'login.html'; return; }
    try { state.currentUser = JSON.parse(saved); }
    catch { window.location.href = 'login.html'; return; }
    applyHeaderUser();
    applyRolePermissions();
    navigateTab(window.location.hash.replace('#','') || 'dashboard');
}

function applyHeaderUser() {
    const u = state.currentUser;
    const nameEl  = document.getElementById('header-user-name');
    const badgeEl = document.getElementById('header-role-badge');
    const textEl  = document.getElementById('header-avatar-text');
    const imgEl   = document.getElementById('header-avatar');

    if (nameEl)  nameEl.textContent  = u.name;
    if (badgeEl) badgeEl.textContent = u.role.toUpperCase();
    if (textEl)  textEl.textContent  = u.name.charAt(0).toUpperCase();

    // Profile photo
    if (u.profile_photo) {
        setHeaderPhoto(u.profile_photo);
    }
}

function setHeaderPhoto(dataUrl) {
    const avatarEl = document.getElementById('header-avatar');
    if (!avatarEl) return;
    avatarEl.innerHTML = `<img src="${dataUrl}" alt="Profile" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
}

function applyRolePermissions() {
    const role = state.currentUser?.role || 'member';
    document.querySelectorAll('[data-role-perm]').forEach(el => {
        const allowed = el.getAttribute('data-role-perm').split(',');
        el.style.display = allowed.includes(role) ? '' : 'none';
    });
}

function handleSignOut() {
    localStorage.clear();
    window.location.href = 'login.html';
}

function setupSidebarNav() {
    document.querySelectorAll('.sidebar-link[data-tab]').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            navigateTab(link.getAttribute('data-tab'));
        });
    });
}

function navigateTab(tab) {
    state.activeTab = tab;
    window.location.hash = tab;

    document.querySelectorAll('.sidebar-link').forEach(l =>
        l.classList.toggle('active', l.getAttribute('data-tab') === tab)
    );
    document.querySelectorAll('.view-section').forEach(s => s.style.display = 'none');
    const el = document.getElementById(`view-${tab}`);
    if (el) el.style.display = 'block';

    switch (tab) {
        case 'dashboard':  renderDashboard();  break;
        case 'books':      renderBooks();      break;
        case 'newspapers': renderNewspapers(); break;
        case 'notes':      renderNotes();      break;
        case 'quizzes':    renderQuizzes();    break;
        case 'members':    renderMembers();    break;
        case 'settings':   renderSettings();   break;
    }
}

// ==========================================
// 2. DASHBOARD
// ==========================================
async function renderDashboard() {
    try {
        const res  = await fetch(`${API_BASE}/reports/dashboard`);
        const data = await res.json();
        if (!data.success) return;

        const { stats, recentBooks, recentPendingNotes } = data;
        setText('dash-stat-total-ebooks',     stats.totalEbooks);
        setText('dash-stat-today-newspapers', stats.todayNewspapers);
        setText('dash-stat-published-notes',  stats.totalNotes);
        setText('dash-stat-pending-notes',    stats.pendingNotes);
        setText('dash-stat-total-members',    stats.totalMembers);

        // Recent books table
        const tbody = document.getElementById('dash-recent-ebooks-table');
        if (tbody) {
            tbody.innerHTML = recentBooks.length === 0
                ? `<tr><td colspan="4" class="text-center text-muted py-3">No e-books yet.</td></tr>`
                : recentBooks.map(b => `
                    <tr>
                        <td><img src="${b.cover_image}" style="width:32px;height:44px;object-fit:cover;border-radius:4px;"
                             onerror="this.src='https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&w=300&q=80'"></td>
                        <td><strong>${b.title}</strong><br><small style="color:var(--warm-walnut);">${b.author}</small></td>
                        <td><code style="font-size:0.75rem;">${b.isbn}</code></td>
                        <td>
                            <button class="btn btn-xs btn-lotus-secondary" onclick="openBookReader('${esc(b.title)}','${b.ebook_url}')">
                                <i class="fa-solid fa-book-open me-1"></i>Read
                            </button>
                        </td>
                    </tr>`).join('');
        }

        // Pending notes widget
        const pendingW = document.getElementById('dash-pending-notes-widget');
        if (pendingW) {
            if (recentPendingNotes.length === 0) {
                pendingW.innerHTML = `<div class="p-3 text-center text-muted small"><i class="fa-solid fa-circle-check me-1" style="color:var(--warm-walnut);"></i>No pending notes.</div>`;
            } else {
                pendingW.innerHTML = recentPendingNotes.map(n => `
                    <div class="p-3 border-bottom d-flex align-items-center justify-content-between">
                        <div>
                            <div class="fw-bold" style="font-size:0.9rem;">${n.title}</div>
                            <small style="color:var(--warm-walnut);">By ${n.author_name} (${n.author_role.toUpperCase()})</small>
                        </div>
                        <div>
                            ${state.currentUser.role === 'admin' ? `
                                <button class="btn btn-xs btn-success me-1" onclick="approveNoteAction(${n.id})"><i class="fa-solid fa-check"></i></button>
                                <button class="btn btn-xs btn-outline-danger" onclick="rejectNoteAction(${n.id})"><i class="fa-solid fa-xmark"></i></button>
                            ` : `<span class="badge bg-warning text-dark">PENDING</span>`}
                        </div>
                    </div>`).join('');
            }
        }

        renderCategoryChart();
    } catch (err) {
        console.error('Dashboard load error:', err);
    }
}

async function renderCategoryChart() {
    await fetchCategories();
    const ctx = document.getElementById('chart-category-dist');
    if (!ctx || state.categories.length === 0) return;
    if (state.charts.cat) state.charts.cat.destroy();
    state.charts.cat = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: state.categories.map(c => c.name),
            datasets: [{
                data: state.categories.map(c => Math.max(c.book_count || 0, 1)),
                backgroundColor: ['#1E2320', '#3D4B3E', '#6F7F64', '#C8D0B7', '#F5F3E6']
            }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } }
    });
}

// ==========================================
// ==========================================
// 3. SIMPLE FULL-PAGE PDF READER ENGINE
// ==========================================
async function openPdfReader(title, pdfUrl) {
    let url = pdfUrl;
    if (!url || url.trim() === '') {
        url = '/pdf-sample.pdf';
    }

    const titleEl = document.getElementById('book-reader-title');
    if (titleEl) titleEl.textContent = `📄 ${title || 'Document'}`;

    resetPdfReaderUI();

    const modalEl = document.getElementById('modalBookReader');
    const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl, { backdrop: 'static' });
    modal.show();

    // Set iframe for simple native full-page PDF viewing
    const iframe = document.getElementById('pdf-viewer-iframe');
    if (iframe) {
        try {
            let finalUrl = '';
            if (url.startsWith('data:application/pdf;base64,')) {
                const b64 = url.split(',')[1];
                const binary = atob(b64);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                const blob = new Blob([bytes], { type: 'application/pdf' });
                state.pdfBlobUrl = URL.createObjectURL(blob);
                finalUrl = state.pdfBlobUrl;
            } else {
                finalUrl = url;
            }
            
            // Disable native download and print buttons
            if(!finalUrl.includes('#toolbar=0')) {
                finalUrl += '#toolbar=0';
            }
            iframe.src = finalUrl;
            
        } catch (e) {
            console.error('PDF load error:', e);
            iframe.src = '/pdf-sample.pdf';
        }
    }
}

// Alias for backward compatibility across catalog buttons
const openBookReader = openPdfReader;

function resetPdfReaderUI() {
    if (state.pdfBlobUrl) {
        URL.revokeObjectURL(state.pdfBlobUrl);
        state.pdfBlobUrl = null;
    }
    const iframe = document.getElementById('pdf-viewer-iframe');
    if (iframe) iframe.src = 'about:blank';
}

function closePdfReader() {
    resetPdfReaderUI();
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }
}

function showPdfError(msg) {
    const loading = document.getElementById('pdf-loading');
    if (loading) {
        loading.innerHTML = `<span class="text-danger"><i class="fa-solid fa-triangle-exclamation me-1"></i>${msg}</span>`;
        loading.style.display = 'flex';
    }
}

// Fullscreen Handler
function toggleFullScreen() {
    const modalEl = document.getElementById('modalBookReader');
    const btn = document.getElementById('btn-fullscreen');

    if (!document.fullscreenElement) {
        if (modalEl.requestFullscreen) {
            modalEl.requestFullscreen();
        } else if (modalEl.webkitRequestFullscreen) {
            modalEl.webkitRequestFullscreen();
        } else if (modalEl.mozRequestFullScreen) {
            modalEl.mozRequestFullScreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
    }
}

document.addEventListener('fullscreenchange', () => {
    const btn = document.getElementById('btn-fullscreen');
    if (btn) {
        if (!document.fullscreenElement) {
            btn.innerHTML = '<i class="fa-solid fa-maximize me-1" id="fullscreen-icon"></i>Full Screen';
        } else {
            btn.innerHTML = '<i class="fa-solid fa-compress me-1" id="fullscreen-icon"></i>Exit Full Screen';
        }
    }
    if (state.pdfDoc && (state.pdfZoomMode === 'fit-page' || state.pdfZoomMode === 'fit-width')) {
        renderPdfPage(state.pdfCurrentPage);
    }
});

// Keyboard navigation and Mouse Wheel Zoom for PDF Viewer
document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('modalBookReader');
    if (!modal || !modal.classList.contains('show') || !state.pdfDoc) return;

    // Ignore keypresses if user is typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
    }

    if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        prevBookPage();
    } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        nextBookPage();
    } else if (e.key === 'Home') {
        e.preventDefault();
        goFirstPage();
    } else if (e.key === 'End') {
        e.preventDefault();
        goLastPage();
    } else if (e.ctrlKey && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        zoomReader(0.15);
    } else if (e.ctrlKey && e.key === '-') {
        e.preventDefault();
        zoomReader(-0.15);
    } else if (e.ctrlKey && e.key === '0') {
        e.preventDefault();
        resetZoom();
    }
});

// Mouse wheel zoom listener (Ctrl + Wheel)
document.addEventListener('wheel', (e) => {
    const area = document.getElementById('pdf-viewer-area');
    const modal = document.getElementById('modalBookReader');
    if (!modal || !modal.classList.contains('show') || !state.pdfDoc || !area) return;

    if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        zoomReader(delta);
    }
}, { passive: false });

// ==========================================
// 4. E-BOOKS
// ==========================================
async function renderBooks() {
    await fetchCategories();
    const q   = document.getElementById('book-search-input')?.value || '';
    const cat = document.getElementById('book-category-filter')?.value || '';

    try {
        const res  = await fetch(`${API_BASE}/books?q=${encodeURIComponent(q)}&category=${cat}&role=${state.currentUser.role}`);
        const data = await res.json();
        if (data.success) { state.books = data.books; renderBookGrid(); }
    } catch (err) { showToast('Error loading E-Books', 'error'); }
}

async function fetchCategories(forceRefresh = false) {
    try {
        const res  = await fetch(`${API_BASE}/categories`);
        const data = await res.json();
        if (data.success) {
            state.categories = data.categories;
            const f = document.getElementById('book-category-filter');
            const m = document.getElementById('modal-book-category');
            const nf = document.getElementById('newspaper-category-filter');
            const nm = document.getElementById('modal-paper-category');
            const opts = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
            
            if (f && (forceRefresh || f.options.length <= 1)) {
                const currentVal = f.value;
                f.innerHTML = `<option value="">All Categories</option>${opts}`;
                f.value = currentVal;
            }
            if (m) {
                const currentVal = m.value;
                m.innerHTML = `<option value="">Select Category</option>${opts}`;
                if (currentVal) m.value = currentVal;
            }
            if (nf && (forceRefresh || nf.options.length <= 1)) {
                const currentVal = nf.value;
                nf.innerHTML = `<option value="">All Categories</option>${opts}`;
                nf.value = currentVal;
            }
            if (nm) {
                const currentVal = nm.value;
                nm.innerHTML = `<option value="">Select Category</option>${opts}`;
                if (currentVal) nm.value = currentVal;
            }
        }
    } catch (e) { console.error('Categories error:', e); }
}

function openAddCategoryModal() {
    document.getElementById('modal-category-form')?.reset();
    const modalEl = document.getElementById('modalAddCategory');
    if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modal.show();
    }
}

async function submitAddCategory(e) {
    e.preventDefault();
    const name = document.getElementById('modal-cat-name')?.value;
    const code = document.getElementById('modal-cat-code')?.value;
    const description = document.getElementById('modal-cat-desc')?.value;

    if (!name || name.trim() === '') {
        showToast('Please enter a category name', 'error');
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Adding...';
    }

    try {
        const res = await fetch(`${API_BASE}/categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, code, description })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message || 'Category added successfully!');
            const modalEl = document.getElementById('modalAddCategory');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();

            // Refresh category dropdowns
            await fetchCategories(true);

            // Select newly created category in Add Book Modal if open
            const categorySelect = document.getElementById('modal-book-category');
            if (categorySelect && data.category) {
                categorySelect.value = data.category.id;
            }
        } else {
            showToast(data.message || 'Failed to add category', 'error');
        }
    } catch (err) {
        console.error('Submit category error:', err);
        showToast('Server error while adding category', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Add Category';
        }
    }
}

function renderBookGrid() {
    const grid = document.getElementById('books-grid-view');
    if (!grid) return;

    if (state.books.length === 0) {
        grid.innerHTML = `<div class="col-12 text-center py-5 text-muted"><h5>No E-Books found.</h5></div>`;
        return;
    }

    grid.innerHTML = state.books.map(b => `
        <div class="col-md-4 col-lg-3 mb-4">
            <div class="ebook-card" onclick="openBookReader('${esc(b.title)}','${b.ebook_url}')">
                <div class="ebook-cover-wrapper">
                    <img src="${b.cover_image}" class="ebook-cover-img" alt="${b.title}"
                         onerror="this.src='https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&w=300&q=80'">
                    <span class="ebook-badge-tag"><i class="fa-solid fa-book-open me-1"></i>READ</span>
                    ${b.is_visible === 0 ? `<span class="badge position-absolute top-0 start-0 m-2" style="background:var(--parchment-tan);color:var(--dark-roast);"><i class="fa-solid fa-eye-slash me-1"></i>HIDDEN</span>` : ''}
                </div>
                <div class="ebook-card-body">
                    <div class="ebook-card-title">${b.title}</div>
                    <div class="ebook-card-author"><i class="fa-solid fa-pen-nib me-1"></i>${b.author}</div>
                    <div class="d-flex align-items-center justify-content-between mb-2">
                        <small style="color:var(--text-light);">ISBN: ${b.isbn}</small>
                        <span class="badge" style="background:var(--soft-linen);color:var(--warm-walnut);">${b.category_name || 'Digital'}</span>
                    </div>
                    <button class="btn btn-sm w-100 btn-lotus-secondary" onclick="event.stopPropagation();openBookReader('${esc(b.title)}','${b.ebook_url}')">
                        <i class="fa-solid fa-book-open me-1"></i> Open Book Reader
                    </button>
                    ${state.currentUser.role === 'admin' ? `
                        <div class="d-flex mt-2 gap-2">
                            <button class="btn btn-xs flex-fill" style="background:var(--soft-linen);border:1px solid var(--parchment-tan);color:var(--dark-roast);" onclick="event.stopPropagation();toggleBookVisibility(${b.id},${b.is_visible?0:1})">
                                <i class="fa-solid fa-${b.is_visible?'eye-slash':'eye'} me-1"></i>${b.is_visible?'Hide':'Show'}
                            </button>
                            <button class="btn btn-xs btn-outline-danger" onclick="event.stopPropagation();deleteBook(${b.id})"><i class="fa-solid fa-trash"></i></button>
                        </div>` : ''}
                </div>
            </div>
        </div>`).join('');
}

function openAddBookModal() {
    document.getElementById('modal-book-form').reset();
    document.getElementById('modal-book-id').value = '';
    document.getElementById('modal-book-cover').value = '';
    document.getElementById('modal-book-url').value = '';
    new bootstrap.Modal(document.getElementById('modalBookForm')).show();
}

async function saveBookForm(e) {
    e.preventDefault();
    const payload = {
        title:      document.getElementById('modal-book-title').value,
        author:     document.getElementById('modal-book-author').value,
        isbn:       document.getElementById('modal-book-isbn').value,
        category_id:document.getElementById('modal-book-category').value,
        publisher:  'LOTUS Press',
        cover_image:document.getElementById('modal-book-cover').value || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&w=300&q=80',
        ebook_url:  document.getElementById('modal-book-url').value || '/pdf-sample.pdf',
        is_visible: document.getElementById('modal-book-visible').checked ? 1 : 0
    };
    
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Saving...';
    }

    try {
        const res  = await fetch(`${API_BASE}/books`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalBookForm')).hide();
            renderBooks();
        } else showToast(data.message || 'Save failed', 'error');
    } catch (err) { showToast(err.message || 'Operation failed', 'error'); }
    finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Save Book';
        }
    }
}

async function toggleBookVisibility(id, val) {
    try {
        const res  = await fetch(`${API_BASE}/books/${id}/visibility`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({is_visible:val}) });
        const data = await res.json();
        if (data.success) { showToast(data.message, val===1?'success':'warning'); renderBooks(); }
    } catch (err) { showToast('Failed', 'error'); }
}

async function deleteBook(id) {
    if (!confirm('Remove this E-Book?')) return;
    try {
        const res  = await fetch(`${API_BASE}/books/${id}`, { method:'DELETE' });
        const data = await res.json();
        if (data.success) { showToast(data.message, 'success'); renderBooks(); }
    } catch (err) { showToast('Delete failed', 'error'); }
}

// ==========================================
// 5. NEWSPAPERS
// ==========================================
async function renderNewspapers() {
    await fetchCategories();
    const dateEl = document.getElementById('newspaper-date-filter');
    if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().split('T')[0];
    const date = dateEl?.value || '';
    const q    = document.getElementById('newspaper-search-input')?.value || '';
    const cat  = document.getElementById('newspaper-category-filter')?.value || '';

    try {
        const res  = await fetch(`${API_BASE}/newspapers?date=${date}&q=${encodeURIComponent(q)}&category=${cat}`);
        const data = await res.json();
        if (!data.success) return;
        state.newspapers = data.newspapers;
        const grid = document.getElementById('newspapers-grid');
        if (!grid) return;

        grid.innerHTML = state.newspapers.length === 0
            ? `<div class="col-12 text-center text-muted py-5"><i class="fa-solid fa-newspaper fa-3x mb-3" style="opacity:0.3;"></i><h5>No newspapers for ${date}</h5></div>`
            : state.newspapers.map(np => `
                <div class="col-md-6 col-lg-4 mb-4">
                    <div class="paper-card">
                        <div class="d-flex align-items-center justify-content-between mb-2">
                            <span class="badge" style="background:var(--dark-roast);color:var(--soft-linen);"><i class="fa-regular fa-newspaper me-1"></i>DAILY</span>
                            <small style="color:var(--text-light);"><i class="fa-regular fa-calendar me-1"></i>${np.publish_date}</small>
                        </div>
                        <h5 class="fw-bold mb-3" style="font-family:'Playfair Display',serif;color:var(--dark-roast);">${np.title}</h5>
                        <div class="d-flex align-items-center justify-content-between mb-3">
                            <span class="badge" style="background:var(--soft-linen);color:var(--warm-walnut);">${np.category_name || 'General News'}</span>
                        </div>
                        <div class="d-flex align-items-center justify-content-between pt-2 border-top">
                            <button class="btn btn-sm btn-lotus-secondary" onclick="openBookReader('${esc(np.title)}','${np.file_url}')">
                                <i class="fa-solid fa-book-open me-1"></i> Read Paper
                            </button>
                            ${state.currentUser.role !== 'member' ? `<button class="btn btn-sm btn-outline-danger" onclick="deleteNewspaper(${np.id})"><i class="fa-solid fa-trash"></i></button>` : ''}
                        </div>
                    </div>
                </div>`).join('');
    } catch (err) { showToast('Error loading newspapers', 'error'); }
}

function openAddNewspaperModal() {
    document.getElementById('modal-newspaper-form').reset();
    document.getElementById('modal-paper-url').value = '';
    document.getElementById('modal-paper-date').value = new Date().toISOString().split('T')[0];
    new bootstrap.Modal(document.getElementById('modalNewspaperForm')).show();
}

async function saveNewspaperForm(e) {
    e.preventDefault();
    const payload = {
        title:        document.getElementById('modal-paper-title').value,
        file_url:     document.getElementById('modal-paper-url').value || '/pdf-sample.pdf',
        publish_date: document.getElementById('modal-paper-date').value,
        category_id:  document.getElementById('modal-paper-category').value
    };
    
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Saving...';
    }

    try {
        const res  = await fetch(`${API_BASE}/newspapers`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalNewspaperForm')).hide();
            renderNewspapers();
        } else showToast(data.message || 'Upload failed', 'error');
    } catch (err) { showToast(err.message || 'Upload failed', 'error'); }
    finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Save Newspaper';
        }
    }
}

async function deleteNewspaper(id) {
    if (!confirm('Remove this newspaper?')) return;
    try {
        const res  = await fetch(`${API_BASE}/newspapers/${id}`, { method:'DELETE' });
        const data = await res.json();
        if (data.success) { showToast(data.message, 'success'); renderNewspapers(); }
    } catch (err) { showToast('Delete failed', 'error'); }
}

// ==========================================
// 6. NOTES
// ==========================================
async function renderNotes() {
    const statusFilter = document.getElementById('notes-status-filter')?.value || '';
    try {
        const url  = `${API_BASE}/notes?role=${state.currentUser.role}&author_id=${state.currentUser.id}&status=${statusFilter}`;
        const res  = await fetch(url);
        const data = await res.json();
        if (!data.success) return;
        state.notes = data.notes;
        const grid = document.getElementById('notes-grid');
        if (!grid) return;

        grid.innerHTML = state.notes.length === 0
            ? `<div class="col-12 text-center text-muted py-5"><i class="fa-regular fa-note-sticky fa-3x mb-3" style="opacity:0.3;"></i><h5>No notes found.</h5></div>`
            : state.notes.map(n => `
                <div class="col-md-6 mb-4">
                    <div class="note-card ${n.status}">
                        <div class="d-flex align-items-center justify-content-between mb-2">
                            <span class="badge" style="background:var(--soft-linen);color:var(--warm-walnut);">${n.category}</span>
                            <span class="badge bg-${n.status==='approved'?'success':n.status==='pending'?'warning text-dark':'danger'}">${n.status.toUpperCase()}</span>
                        </div>
                        <h5 class="fw-bold mb-2" style="font-family:'Playfair Display',serif;cursor:pointer;" onclick="openNoteReader(${n.id})">${n.title}</h5>
                        <p class="text-muted small mb-3" style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${n.content}</p>
                        ${n.file_type && n.file_type !== 'none' ? `<span class="badge mb-2" style="background:var(--soft-linen);color:var(--dark-roast);"><i class="fa-solid fa-${n.file_type==='pdf'?'file-pdf':'image'} me-1"></i>${n.file_type.toUpperCase()}</span>` : ''}
                        <div class="d-flex align-items-center justify-content-between pt-2 border-top">
                            <small style="color:var(--warm-walnut);">By <strong>${n.author_name}</strong></small>
                            <div class="d-flex gap-1">
                                <button class="btn btn-xs btn-lotus-secondary" onclick="openNoteReader(${n.id})"><i class="fa-solid fa-book-open me-1"></i>Read</button>
                                ${state.currentUser.role==='admin' && n.status==='pending' ? `
                                    <button class="btn btn-xs btn-success me-1" onclick="approveNoteAction(${n.id})"><i class="fa-solid fa-check"></i></button>
                                    <button class="btn btn-xs btn-outline-danger" onclick="rejectNoteAction(${n.id})"><i class="fa-solid fa-xmark"></i></button>` : ''}
                                ${(state.currentUser.role==='admin' || (n.author_id===state.currentUser.id && n.status !== 'approved')) ? `
                                    <button class="btn btn-xs btn-outline-secondary" onclick="deleteNote(${n.id})"><i class="fa-solid fa-trash"></i></button>` : ''}
                            </div>
                        </div>
                    </div>
                </div>`).join('');
    } catch (err) { showToast('Error loading notes', 'error'); }
}

function openNoteReader(noteId) {
    const n = state.notes.find(x => x.id === noteId);
    if (!n) return;
    document.getElementById('note-reader-title').textContent = n.title;
    document.getElementById('note-reader-meta').textContent  = `By ${n.author_name} (${n.author_role.toUpperCase()}) | ${n.category}`;
    document.getElementById('note-reader-text').textContent  = n.content;

    const att = document.getElementById('note-reader-attachment-container');
    if (n.file_url && n.file_type && n.file_type !== 'none') {
        if (n.file_type === 'pdf') {
            att.innerHTML = `<button class="btn btn-lotus-secondary mt-2" onclick="openBookReader('${esc(n.title)} (Note PDF)', '${n.file_url}')"><i class="fa-solid fa-book-open me-1"></i>Open PDF in Book Reader</button>`;
        } else {
            att.innerHTML = `<div class="text-center mt-3"><img src="${n.file_url}" class="img-fluid rounded shadow" style="max-height:380px;" oncontextmenu="return false;"></div>`;
        }
    } else {
        att.innerHTML = '';
    }
    new bootstrap.Modal(document.getElementById('modalNoteReader')).show();
}

function openAddNoteModal() {
    document.getElementById('modal-note-form').reset();
    document.getElementById('modal-note-file-url').value = '';
    new bootstrap.Modal(document.getElementById('modalNoteForm')).show();
}

async function saveNoteForm(e) {
    e.preventDefault();
    const payload = {
        title:     document.getElementById('modal-note-title').value,
        category:  document.getElementById('modal-note-category').value,
        content:   document.getElementById('modal-note-content').value,
        file_url:  document.getElementById('modal-note-file-url').value || null,
        file_type: document.getElementById('modal-note-file-type').value || 'none',
        author_id: state.currentUser.id
    };
    try {
        const res  = await fetch(`${API_BASE}/notes`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, data.status==='approved'?'success':'info');
            bootstrap.Modal.getInstance(document.getElementById('modalNoteForm')).hide();
            renderNotes();
        } else showToast(data.message || 'Submit failed', 'error');
    } catch (err) { showToast(err.message || 'Error', 'error'); }
}

async function approveNoteAction(id) {
    try {
        const res  = await fetch(`${API_BASE}/notes/${id}/status`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status:'approved'}) });
        const data = await res.json();
        if (data.success) { showToast('Note APPROVED!', 'success'); navigateTab(state.activeTab); }
    } catch (err) { showToast('Failed', 'error'); }
}

async function rejectNoteAction(id) {
    const feedback = prompt('Reason for rejection:', 'Requires further verification');
    try {
        const res  = await fetch(`${API_BASE}/notes/${id}/status`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status:'rejected', admin_feedback:feedback||'Rejected'}) });
        const data = await res.json();
        if (data.success) { showToast('Note REJECTED', 'warning'); navigateTab(state.activeTab); }
    } catch (err) { showToast('Failed', 'error'); }
}

async function deleteNote(id) {
    if (!confirm('Delete this note?')) return;
    try {
        const res  = await fetch(`${API_BASE}/notes/${id}?user_id=${state.currentUser.id}&role=${state.currentUser.role}`, { method:'DELETE' });
        const data = await res.json();
        if (data.success) { showToast('Deleted', 'success'); renderNotes(); }
        else { showToast(data.message || 'Failed', 'error'); }
    } catch (err) { showToast('Failed', 'error'); }
}

// ==========================================
// 7. MEMBERS
// ==========================================
async function renderMembers() {
    const q      = document.getElementById('member-search-input')?.value || '';
    const status = document.getElementById('member-status-filter')?.value || '';
    try {
        const res  = await fetch(`${API_BASE}/members?q=${encodeURIComponent(q)}&status=${status}`);
        const data = await res.json();
        if (!data.success) return;
        state.members = data.members;
        const tbody = document.getElementById('members-table-body');
        if (!tbody) return;

        const roleColors = { admin:'success', editor:'info', member:'secondary' };

        tbody.innerHTML = state.members.length === 0
            ? `<tr><td colspan="9" class="text-center text-muted py-4">No members found.</td></tr>`
            : state.members.map(m => `
                <tr>
                    <td><code style="font-size:0.78rem;">${m.membership_id}</code></td>
                    <td><strong>${m.name}</strong><br><small style="color:var(--warm-walnut);">${m.email}</small></td>
                    <td>${m.phone || '—'}</td>
                    <td>${m.address || '—'}</td>
                    <td><span class="badge bg-${roleColors[m.role]||'secondary'} text-${m.role==='editor'?'dark':'white'}">${m.role.toUpperCase()}</span></td>
                    <td class="text-center"><span class="badge" style="background:var(--soft-linen);color:var(--dark-roast);">${m.total_notes}</span></td>
                    <td class="text-center"><span class="badge" style="background:var(--soft-linen);color:var(--dark-roast);">${m.active_issues||0}</span></td>
                    <td><span class="badge bg-${m.status==='active'?'success':'danger'}">${m.status.toUpperCase()}</span></td>
                    <td>
                        ${state.currentUser.role==='admin' ? `
                            <button class="btn btn-xs me-1" style="background:var(--soft-linen);border:1px solid var(--parchment-tan);color:var(--dark-roast);" onclick="openEditMemberModal(${m.id})" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
                            <button class="btn btn-xs btn-outline-warning me-1" onclick="openAdminResetPasswordModal(${m.id})" title="Reset Password"><i class="fa-solid fa-key"></i></button>
                            <button class="btn btn-xs btn-outline-info me-1" onclick="openIssueItemModal(${m.id})" title="Issue Item"><i class="fa-solid fa-book-bookmark"></i></button>
                            <button class="btn btn-xs btn-outline-${m.status==='active'?'secondary':'success'} me-1" onclick="toggleMemberStatus(${m.id},'${m.status==='active'?'blocked':'active'}')" title="${m.status==='active'?'Block':'Unblock'}">
                                <i class="fa-solid fa-${m.status==='active'?'ban':'check'}"></i>
                            </button>
                            <button class="btn btn-xs btn-outline-danger" onclick="deleteMember(${m.id})"><i class="fa-solid fa-trash"></i></button>
                        ` : '<span class="text-muted">—</span>'}
                    </td>
                </tr>`).join('');
    } catch (err) { showToast('Error loading members', 'error'); }
}

function openEditMemberModal(id) {
    const m = state.members.find(x => x.id === id);
    if (!m) return;
    document.getElementById('edit-member-id').value    = m.id;
    document.getElementById('edit-member-code').value  = m.membership_id;
    document.getElementById('edit-member-name').value  = m.name;
    document.getElementById('edit-member-email').value = m.email;
    document.getElementById('edit-member-phone').value = m.phone || '';
    document.getElementById('edit-member-address').value = m.address || '';
    document.getElementById('edit-member-role').value  = m.role;
    document.getElementById('edit-member-status').value= m.status;
    new bootstrap.Modal(document.getElementById('modalEditMember')).show();
}

async function saveEditMemberForm(e) {
    e.preventDefault();
    const id      = document.getElementById('edit-member-id').value;
    const payload = {
        name:   document.getElementById('edit-member-name').value,
        email:  document.getElementById('edit-member-email').value,
        phone:  document.getElementById('edit-member-phone').value,
        address: document.getElementById('edit-member-address').value,
        role:   document.getElementById('edit-member-role').value,
        status: document.getElementById('edit-member-status').value
    };
    try {
        const res  = await fetch(`${API_BASE}/members/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalEditMember')).hide();
            renderMembers();
        } else showToast(data.message || 'Failed', 'error');
    } catch (err) { showToast(err.message || 'Failed', 'error'); }
}

function openAdminResetPasswordModal(id) {
    const m = state.members.find(x => x.id === id);
    if (!m) return;
    document.getElementById('reset-target-user-id').value   = m.id;
    document.getElementById('reset-target-user-name').value = `${m.name} (${m.email})`;
    document.getElementById('reset-new-password').value     = '';
    new bootstrap.Modal(document.getElementById('modalAdminResetPassword')).show();
}

async function submitAdminResetPassword(e) {
    e.preventDefault();
    const id  = document.getElementById('reset-target-user-id').value;
    const pwd = document.getElementById('reset-new-password').value;
    try {
        const res  = await fetch(`${API_BASE}/members/${id}/reset-password`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({newPassword:pwd}) });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalAdminResetPassword')).hide();
        } else showToast(data.message || 'Failed', 'error');
    } catch (err) { showToast(err.message || 'Failed', 'error'); }
}

async function toggleMemberStatus(id, status) {
    try {
        const res  = await fetch(`${API_BASE}/members/${id}/status`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status}) });
        const data = await res.json();
        if (data.success) { showToast(data.message, 'success'); renderMembers(); }
    } catch (err) { showToast('Failed', 'error'); }
}

async function deleteMember(id) {
    if (!confirm('Delete this user account?')) return;
    try {
        const res  = await fetch(`${API_BASE}/members/${id}`, { method:'DELETE' });
        const data = await res.json();
        if (data.success) { showToast(data.message, 'success'); renderMembers(); }
        else showToast(data.message, 'error');
    } catch (err) { showToast('Failed', 'error'); }
}

function openAddMemberModal() {
    document.getElementById('modal-member-form').reset();
    new bootstrap.Modal(document.getElementById('modalMemberForm')).show();
}

async function saveMemberForm(e) {
    e.preventDefault();
    const payload = {
        name:     document.getElementById('modal-member-name').value,
        email:    document.getElementById('modal-member-email').value,
        phone:    document.getElementById('modal-member-phone').value,
        address:  document.getElementById('modal-member-address').value,
        role:     document.getElementById('modal-member-role').value,
        password: document.getElementById('modal-member-password').value
    };
    try {
        const res  = await fetch(`${API_BASE}/members`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        const data = await res.json();
        if (data.success) {
            showToast(`Created! ID: ${data.member.membership_id}`, 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalMemberForm')).hide();
            renderMembers();
        } else showToast(data.message || 'Failed', 'error');
    } catch (err) { showToast(err.message || 'Failed', 'error'); }
}

// Item issuing
async function openIssueItemModal(memberId = null) {
    const memberSel = document.getElementById('modal-issue-member');
    if (memberSel) {
        memberSel.innerHTML = state.members.map(m => `<option value="${m.id}" ${memberId===m.id?'selected':''}>${m.name} (${m.membership_id})</option>`).join('');
    }
    document.getElementById('modal-issue-date').value = new Date().toISOString().split('T')[0];
    populateIssueItemDropdown();
    new bootstrap.Modal(document.getElementById('modalIssueItem')).show();
}

function populateIssueItemDropdown() {
    const type = document.getElementById('modal-issue-type').value;
    const sel  = document.getElementById('modal-issue-item-id');
    if (type === 'book') {
        sel.innerHTML = state.books.map(b => `<option value="${b.id}">${b.title}</option>`).join('');
    } else {
        sel.innerHTML = state.newspapers.map(n => `<option value="${n.id}">${n.title} (${n.publish_date})</option>`).join('');
    }
}

async function saveIssueItemForm(e) {
    e.preventDefault();
    const payload = {
        member_id:  document.getElementById('modal-issue-member').value,
        item_type:  document.getElementById('modal-issue-type').value,
        item_id:    document.getElementById('modal-issue-item-id').value,
        issue_date: document.getElementById('modal-issue-date').value,
        notes:      document.getElementById('modal-issue-notes').value
    };
    try {
        const res  = await fetch(`${API_BASE}/issued-items`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalIssueItem')).hide();
        } else showToast(data.message || 'Failed', 'error');
    } catch (err) { showToast(err.message || 'Failed', 'error'); }
}

// ==========================================
// 8. PROFILE UPDATE
// ==========================================
function openUpdateProfileModal() {
    const u = state.currentUser;
    document.getElementById('profile-name-display').value  = u.name  || '';
    document.getElementById('profile-email-display').value = u.email || '';
    document.getElementById('profile-phone-input').value   = u.phone || '';
    document.getElementById('profile-photo-data').value    = '';

    // Show current photo
    if (u.profile_photo) {
        document.getElementById('profile-photo-img-preview').src     = u.profile_photo;
        document.getElementById('profile-photo-img-preview').style.display = 'block';
        document.getElementById('profile-photo-placeholder').style.display = 'none';
    } else {
        document.getElementById('profile-photo-img-preview').style.display = 'none';
        document.getElementById('profile-photo-placeholder').style.display = 'flex';
    }

    new bootstrap.Modal(document.getElementById('modalUpdateProfile')).show();
}

function handleProfilePhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        const dataUrl = ev.target.result;
        document.getElementById('profile-photo-data').value = dataUrl;
        document.getElementById('profile-photo-img-preview').src = dataUrl;
        document.getElementById('profile-photo-img-preview').style.display = 'block';
        document.getElementById('profile-photo-placeholder').style.display = 'none';
    };
    reader.readAsDataURL(file);
}

async function submitUpdateProfile(e) {
    e.preventDefault();
    const phone = document.getElementById('profile-phone-input').value;
    const photo = document.getElementById('profile-photo-data').value;

    const payload = {};
    if (phone !== undefined)  payload.phone = phone;
    if (photo)                payload.profile_photo = photo;

    try {
        const res  = await fetch(`${API_BASE}/users/${state.currentUser.id}/profile`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        const data = await res.json();
        if (data.success) {
            // Update local state
            state.currentUser.phone = data.user.phone;
            state.currentUser.profile_photo = data.user.profile_photo;
            localStorage.setItem('lotus_user', JSON.stringify(state.currentUser));

            // Update header
            if (data.user.profile_photo) setHeaderPhoto(data.user.profile_photo);

            showToast(data.message, 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalUpdateProfile')).hide();
        } else showToast(data.message || 'Update failed', 'error');
    } catch (err) { showToast(err.message || 'Failed', 'error'); }
}

// ==========================================
// 9. CHANGE PASSWORD (Self)
// ==========================================
function openChangePasswordModal() {
    document.getElementById('modal-password-email').value = state.currentUser.email;
    document.getElementById('modal-password-old').value   = '';
    document.getElementById('modal-password-new').value   = '';
    new bootstrap.Modal(document.getElementById('modalChangePassword')).show();
}

async function submitChangePassword(e) {
    e.preventDefault();
    const email       = state.currentUser.email;
    const oldPassword = document.getElementById('modal-password-old').value;
    const newPassword = document.getElementById('modal-password-new').value;
    try {
        const res  = await fetch(`${API_BASE}/auth/change-password`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email, oldPassword, newPassword}) });
        const data = await res.json();
        if (data.success) {
            showToast('Password updated!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalChangePassword')).hide();
        } else showToast(data.message || 'Failed', 'error');
    } catch (err) { showToast(err.message || 'Failed', 'error'); }
}

// ==========================================
// 10. SETTINGS
// ==========================================
async function renderSettings() {
    try {
        const res  = await fetch(`${API_BASE}/settings`);
        const data = await res.json();
        if (data.success) {
            document.getElementById('setting-library-name').value  = data.settings.library_name  || 'LOTUS Library System';
            document.getElementById('setting-contact-email').value = data.settings.contact_email || 'admin@lotus.com';
            await renderSettingsCategories();
        }
    } catch (err) { showToast('Error loading settings', 'error'); }
}

async function saveSystemSettings(e) {
    e.preventDefault();
    const payload = {
        library_name:  document.getElementById('setting-library-name').value,
        contact_email: document.getElementById('setting-contact-email').value
    };
    try {
        const res  = await fetch(`${API_BASE}/settings`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        const data = await res.json();
        if (data.success) showToast('Settings saved!', 'success');
    } catch (err) { showToast('Failed', 'error'); }
}

async function renderSettingsCategories() {
    await fetchCategories();
    const list = document.getElementById('settings-category-list');
    if (!list) return;
    if (state.categories.length === 0) {
        list.innerHTML = '<tr><td colspan="2" class="text-center text-muted py-4">No categories found.</td></tr>';
        return;
    }
    list.innerHTML = state.categories.map(c => `
        <tr>
            <td class="fw-bold">${c.name} <br><small class="text-muted fw-normal">${c.book_count || 0} E-Books | ${c.news_count || 0} Newspapers</small></td>
            <td class="text-center">
                <button class="btn btn-xs" style="background:#fce8e8;color:#d9534f;border:1px solid #d9534f;" onclick="deleteSettingsCategory(${c.id}, '${c.name.replace(/'/g, "\\'")}')" title="Delete">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

async function addSettingsCategory(e) {
    e.preventDefault();
    const nameInput = document.getElementById('setting-new-category');
    const name = nameInput.value;
    try {
        const res = await fetch(`${API_BASE}/categories`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ name, code: name.toUpperCase().replace(/[^A-Z0-9]/g, '_') })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Category added', 'success');
            nameInput.value = '';
            await renderSettingsCategories();
            renderCategoryChart(); // Refresh dashboard chart
        } else {
            showToast(data.message, 'error');
        }
    } catch (err) {
        showToast('Error adding category', 'error');
    }
}

async function deleteSettingsCategory(id, name) {
    if (!confirm(`Are you sure you want to delete the category '${name}'?`)) return;
    try {
        const res = await fetch(`${API_BASE}/categories/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showToast('Category deleted', 'success');
            await renderSettingsCategories();
            renderCategoryChart();
        } else {
            showToast(data.message, 'error');
        }
    } catch (err) {
        showToast('Failed to delete category', 'error');
    }
}

// ==========================================
// 11. FILE INPUT HANDLERS
// ==========================================
function setupFileInputHandlers() {
    bindFileToHidden('modal-book-cover-file',  'modal-book-cover',   null,          'Cover photo attached');
    bindFileToHidden('modal-book-pdf-file',    'modal-book-url',     null,          'Book PDF attached');
    bindFileToHidden('modal-paper-pdf-file',   'modal-paper-url',    null,          'Newspaper PDF attached');
    bindFileToHidden('modal-note-file-picker', 'modal-note-file-url','modal-note-file-type', null, true);
}

function bindFileToHidden(inputId, hiddenId, typeSelId, toastMsg, detectType) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            const el = document.getElementById(hiddenId);
            if (el) el.value = ev.target.result;
            if (detectType && typeSelId) {
                const sel = document.getElementById(typeSelId);
                if (sel) {
                    if (file.type.startsWith('image/')) sel.value = 'image';
                    else if (file.name.endsWith('.pdf') || file.type === 'application/pdf') sel.value = 'pdf';
                }
            }
            if (toastMsg) showToast(`${toastMsg}: ${file.name}`, 'success');
            else showToast(`Attached: ${file.name}`, 'success');
        };
        reader.readAsDataURL(file);
    });
}

// ==========================================
// 12. GLOBAL SEARCH
// ==========================================
function handleGlobalSearch(q) {
    if (state.activeTab === 'books') {
        const el = document.getElementById('book-search-input');
        if (el) { el.value = q; renderBooks(); }
    } else if (state.activeTab === 'newspapers') {
        const el = document.getElementById('newspaper-search-input');
        if (el) { el.value = q; renderNewspapers(); }
    } else {
        navigateTab('books');
        setTimeout(() => {
            const el = document.getElementById('book-search-input');
            if (el) { el.value = q; renderBooks(); }
        }, 150);
    }
}

// ==========================================
// 13. UTILS
// ==========================================
function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function esc(str) {
    if (!str) return '';
    return String(str).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const id = 'toast-' + Date.now();
    const bgStyles = {
        success: 'background:var(--warm-walnut);color:#fff;',
        error:   'background:#c9504e;color:#fff;',
        warning: 'background:var(--parchment-tan);color:var(--dark-roast);',
        info:    'background:var(--dark-roast);color:var(--soft-linen);'
    };
    const style = bgStyles[type] || bgStyles.info;
    container.insertAdjacentHTML('beforeend', `
        <div id="${id}" class="toast show" role="alert" aria-atomic="true"
             style="${style}border-radius:10px;border:none;min-width:260px;box-shadow:0 6px 20px rgba(0,0,0,0.25);">
            <div class="d-flex align-items-center">
                <div class="toast-body fw-bold py-3 px-3">${message}</div>
                <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast"
                        style="filter:${type==='warning'?'invert(0)':'invert(1)'};"></button>
            </div>
        </div>`);
    setTimeout(() => { const el = document.getElementById(id); if (el) el.remove(); }, 4500);
}

// ==========================================
// 14. ONLINE QUIZ SYSTEM
// ==========================================

async function renderQuizzes() {
    await fetchCategories();
    // Populate quiz category filter
    const catF = document.getElementById('quiz-category-filter');
    if (catF && catF.options.length <= 1) {
        catF.innerHTML = '<option value="">All Categories</option>' + state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
    
    // reset views
    document.getElementById('quiz-list-container').style.display = 'block';
    document.getElementById('quiz-take-container').style.display = 'none';
    document.getElementById('quiz-admin-container').style.display = 'none';

    try {
        const res = await fetch(`${API_BASE}/quizzes`);
        const data = await res.json();
        if(!data.success) return;
        
        let quizzes = data.quizzes;
        if(catF && catF.value) quizzes = quizzes.filter(q => q.category_id == catF.value);
        
        const grid = document.getElementById('quizzes-grid');
        grid.innerHTML = quizzes.length === 0 
            ? `<div class="col-12 text-center text-muted py-5"><i class="fa-solid fa-graduation-cap fa-3x mb-3" style="opacity:0.3;"></i><h5>No Quizzes Found</h5></div>`
            : quizzes.map(q => `
                <div class="col-md-6 col-lg-4 mb-4">
                    <div class="lotus-card p-4 h-100 d-flex flex-column">
                        <div class="d-flex justify-content-between mb-2">
                            <span class="badge bg-secondary">${q.category_name || 'General'}</span>
                            <span class="badge ${q.difficulty === 'Hard' ? 'bg-danger' : q.difficulty === 'Medium' ? 'bg-warning text-dark' : 'bg-success'}">${q.difficulty}</span>
                        </div>
                        <h5 class="fw-bold" style="color:var(--dark-roast);">${q.title}</h5>
                        <p class="text-muted small flex-grow-1">${q.description || ''}</p>
                        <div class="d-flex align-items-center mb-3 text-muted small fw-bold">
                            <i class="fa-regular fa-clock me-1"></i> ${q.time_limit} mins
                        </div>
                        <div class="d-flex justify-content-between pt-3 border-top mt-auto">
                            ${state.currentUser.role === 'admin' || state.currentUser.role === 'editor' 
                                ? `<button class="btn btn-sm btn-outline-primary w-100 me-2" onclick="viewAdminQuiz(${q.id})"><i class="fa-solid fa-gear me-1"></i>Manage</button>
                                   <button class="btn btn-sm btn-outline-danger" onclick="deleteQuiz(${q.id})"><i class="fa-solid fa-trash"></i></button>`
                                : `<button class="btn btn-sm btn-lotus-primary w-100" onclick="startQuiz(${q.id})"><i class="fa-solid fa-play me-1"></i>Attempt Quiz</button>`
                            }
                        </div>
                    </div>
                </div>
            `).join('');
    } catch(err) { showToast('Failed to load quizzes', 'error'); }
}

function openCreateQuizModal() {
    const catM = document.getElementById('modal-quiz-category');
    if (catM && catM.options.length <= 1) {
        catM.innerHTML = '<option value="">Select Category</option>' + state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
    document.getElementById('create-quiz-form').reset();
    new bootstrap.Modal(document.getElementById('modalCreateQuiz')).show();
}

async function submitCreateQuiz(e) {
    e.preventDefault();
    const payload = {
        title: document.getElementById('modal-quiz-title').value,
        description: document.getElementById('modal-quiz-desc').value,
        category_id: document.getElementById('modal-quiz-category').value,
        time_limit: document.getElementById('modal-quiz-time').value,
        difficulty: document.getElementById('modal-quiz-diff').value,
        created_by: state.currentUser.id
    };
    
    try {
        const res = await fetch(`${API_BASE}/quizzes`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        const data = await res.json();
        if(data.success) {
            showToast('Quiz created', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalCreateQuiz')).hide();
            renderQuizzes();
        } else { showToast('Error creating quiz', 'error'); }
    } catch(err) { showToast('Failed to save quiz', 'error'); }
}

async function deleteQuiz(id) {
    if(!confirm('Are you sure you want to delete this quiz?')) return;
    try {
        const res = await fetch(`${API_BASE}/quizzes/${id}`, { method:'DELETE' });
        const data = await res.json();
        if(data.success) { showToast('Quiz deleted', 'success'); renderQuizzes(); }
    } catch(err) { showToast('Failed to delete', 'error'); }
}

async function viewAdminQuiz(id) {
    try {
        const res = await fetch(`${API_BASE}/quizzes/${id}?role=admin`);
        const data = await res.json();
        if(!data.success) return;
        
        const qz = data.quiz;
        document.getElementById('quiz-list-container').style.display = 'none';
        document.getElementById('quiz-admin-container').style.display = 'block';
        document.getElementById('admin-quiz-title').textContent = qz.title + " (Questions: " + qz.questions.length + ")";
        document.getElementById('modal-q-quiz-id').value = qz.id;
        
        const qHTML = qz.questions.length === 0 ? '<p class="text-muted">No questions added yet.</p>' : qz.questions.map((q, idx) => `
            <div class="border rounded p-3 mb-3 bg-white shadow-sm">
                <div class="d-flex justify-content-between">
                    <h6 class="fw-bold m-0">Q${idx+1}. ${q.question_text}</h6>
                    <div>
                        <span class="badge bg-secondary me-2">${q.question_type}</span>
                        <span class="badge bg-info me-2">${q.marks} Marks</span>
                        <button class="btn btn-xs btn-outline-danger" onclick="deleteQuestion(${q.id}, ${qz.id})"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
                <div class="mt-2 text-muted small">
                    ${q.options.map(o => `<div class="${o.is_correct ? 'text-success fw-bold' : ''}">- ${o.option_text} ${o.is_correct ? '<i class="fa-solid fa-check"></i>' : ''}</div>`).join('')}
                </div>
            </div>
        `).join('');
        
        document.getElementById('admin-quiz-questions').innerHTML = qHTML;
    } catch(err) { showToast('Failed to load quiz details', 'error'); }
}

function closeAdminQuizView() {
    renderQuizzes();
}

function openAddQuestionModal() {
    document.getElementById('add-question-form').reset();
    toggleQuestionOptions();
    new bootstrap.Modal(document.getElementById('modalAddQuestion')).show();
}

function toggleQuestionOptions() {
    const type = document.getElementById('modal-q-type').value;
    const container = document.getElementById('options-list');
    
    if(type === 'MCQ') {
        container.innerHTML = `
            ${[1,2,3,4].map(i => `
                <div class="input-group mb-2">
                    <div class="input-group-text"><input class="form-check-input mt-0" type="radio" name="correct_opt" value="${i}" ${i===1?'required':''}></div>
                    <input type="text" class="form-control" id="opt_text_${i}" placeholder="Option ${i} text" ${i<=2?'required':''}>
                </div>
            `).join('')}
        `;
    } else if (type === 'True/False') {
        container.innerHTML = `
            <div class="form-check"><input class="form-check-input" type="radio" name="correct_opt" value="True" required><label class="form-check-label">True</label></div>
            <div class="form-check"><input class="form-check-input" type="radio" name="correct_opt" value="False"><label class="form-check-label">False</label></div>
        `;
    } else if (type === 'Short Answer') {
        container.innerHTML = `
            <input type="text" class="form-control" id="opt_text_short" placeholder="Enter exact correct answer text" required>
        `;
    }
}

async function submitAddQuestion(e) {
    e.preventDefault();
    const quizId = document.getElementById('modal-q-quiz-id').value;
    const type = document.getElementById('modal-q-type').value;
    
    let options = [];
    if(type === 'MCQ') {
        const selectedRadio = document.querySelector('input[name="correct_opt"]:checked');
        if(!selectedRadio) { showToast('Select correct option', 'error'); return; }
        const corrVal = parseInt(selectedRadio.value);
        for(let i=1; i<=4; i++) {
            const txt = document.getElementById('opt_text_'+i).value;
            if(txt.trim()) options.push({ option_text: txt, is_correct: (i === corrVal) });
        }
    } else if(type === 'True/False') {
        const corrVal = document.querySelector('input[name="correct_opt"]:checked').value;
        options.push({ option_text: 'True', is_correct: (corrVal === 'True') });
        options.push({ option_text: 'False', is_correct: (corrVal === 'False') });
    } else if(type === 'Short Answer') {
        const txt = document.getElementById('opt_text_short').value;
        options.push({ option_text: txt, is_correct: true });
    }
    
    const payload = {
        question_text: document.getElementById('modal-q-text').value,
        question_type: type,
        marks: parseInt(document.getElementById('modal-q-marks').value),
        options: options
    };
    
    try {
        const res = await fetch(`${API_BASE}/quizzes/${quizId}/questions`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        const data = await res.json();
        if(data.success) {
            showToast('Question Added', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalAddQuestion')).hide();
            viewAdminQuiz(quizId);
        } else showToast('Error adding question', 'error');
    } catch(err) { showToast('Server error', 'error'); }
}

async function deleteQuestion(qId, quizId) {
    if(!confirm('Delete this question?')) return;
    try {
        const res = await fetch(`${API_BASE}/questions/${qId}`, { method:'DELETE' });
        const data = await res.json();
        if(data.success) { showToast('Question deleted', 'success'); viewAdminQuiz(quizId); }
    } catch(err) { showToast('Failed to delete', 'error'); }
}

// ---------------- Quiz Taking Logic ----------------

let currentQuizState = null;
let quizTimerInterval = null;

async function startQuiz(quizId) {
    try {
        const res = await fetch(`${API_BASE}/quizzes/${quizId}?role=${state.currentUser.role}`);
        const data = await res.json();
        if(!data.success) return;
        
        currentQuizState = data.quiz;
        if(currentQuizState.questions.length === 0) {
            showToast('This quiz has no questions yet.', 'warning');
            return;
        }
        
        // Setup State
        currentQuizState.answers = {}; // qId -> answer payload
        currentQuizState.timeLeft = currentQuizState.time_limit * 60; // seconds
        
        document.getElementById('quiz-list-container').style.display = 'none';
        document.getElementById('quiz-take-container').style.display = 'block';
        document.getElementById('take-quiz-title').textContent = currentQuizState.title;
        
        renderQuizQuestions();
        startQuizTimer();
    } catch(err) { showToast('Failed to load quiz', 'error'); }
}

function renderQuizQuestions() {
    const container = document.getElementById('take-quiz-questions');
    let html = '';
    currentQuizState.questions.forEach((q, i) => {
        html += `<div class="mb-4 border-bottom pb-4">
            <h5 class="fw-bold mb-3">${i+1}. ${q.question_text} <span class="badge bg-info ms-2 fs-6" style="vertical-align:middle">${q.marks} Marks</span></h5>`;
        
        if(q.question_type === 'MCQ' || q.question_type === 'True/False') {
            q.options.forEach(opt => {
                html += `<div class="form-check mb-2 fs-5">
                    <input class="form-check-input" type="radio" name="q_${q.id}" value="${opt.id}" onchange="saveAnswer(${q.id}, ${opt.id}, null)">
                    <label class="form-check-label">${opt.option_text}</label>
                </div>`;
            });
        } else if(q.question_type === 'Short Answer') {
            html += `<input type="text" class="form-control form-control-lg" placeholder="Type your answer here..." oninput="saveAnswer(${q.id}, null, this.value)">`;
        }
        html += `</div>`;
    });
    container.innerHTML = html;
    updateQuizProgress();
}

function saveAnswer(qId, optId, shortText) {
    currentQuizState.answers[qId] = { question_id: qId, option_id: optId, short_answer: shortText };
    updateQuizProgress();
}

function updateQuizProgress() {
    const total = currentQuizState.questions.length;
    const answered = Object.keys(currentQuizState.answers).length;
    const pct = Math.round((answered / total) * 100);
    document.getElementById('take-quiz-progress').style.width = pct + '%';
}

function startQuizTimer() {
    clearInterval(quizTimerInterval);
    const timerEl = document.getElementById('take-quiz-timer');
    
    quizTimerInterval = setInterval(() => {
        currentQuizState.timeLeft--;
        if(currentQuizState.timeLeft <= 0) {
            clearInterval(quizTimerInterval);
            timerEl.textContent = "00:00";
            showToast("Time's up! Auto-submitting...", "warning");
            submitQuiz(true); // true = auto submit
        } else {
            const m = Math.floor(currentQuizState.timeLeft / 60).toString().padStart(2, '0');
            const s = (currentQuizState.timeLeft % 60).toString().padStart(2, '0');
            timerEl.textContent = `${m}:${s}`;
            if(currentQuizState.timeLeft < 60) timerEl.classList.add('text-danger', 'animate__animated', 'animate__flash');
        }
    }, 1000);
}

function cancelQuiz() {
    if(!confirm('Are you sure you want to cancel? Your progress will be lost.')) return;
    clearInterval(quizTimerInterval);
    currentQuizState = null;
    renderQuizzes();
}

async function submitQuiz(autoSubmit = false) {
    if(!autoSubmit) {
        const total = currentQuizState.questions.length;
        const answered = Object.keys(currentQuizState.answers).length;
        if(answered < total) {
            if(!confirm(`You have only answered ${answered}/${total} questions. Submit anyway?`)) return;
        } else {
            if(!confirm('Submit your final answers?')) return;
        }
    }
    
    clearInterval(quizTimerInterval);
    const answersArr = Object.values(currentQuizState.answers);
    
    try {
        const res = await fetch(`${API_BASE}/quizzes/${currentQuizState.id}/submit`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ user_id: state.currentUser.id, answers: answersArr })
        });
        const data = await res.json();
        
        if(data.success) {
            document.getElementById('result-score').textContent = data.score;
            document.getElementById('result-total').textContent = data.total_marks;
            new bootstrap.Modal(document.getElementById('modalQuizResult')).show();
            currentQuizState = null;
            renderQuizzes();
        } else { showToast('Submission failed', 'error'); }
    } catch(err) { showToast('Error submitting quiz', 'error'); }
}
