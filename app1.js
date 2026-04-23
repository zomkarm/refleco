// =============================================
// Folio — Personal Journal PWA
// Storage: File System Access API + localStorage
// Pages: swipe-navigated, ruled, book-feel
// =============================================

// ── IndexedDB for file handle ─────────────────

const IDB_NAME  = 'folio-idb';
const IDB_STORE = 'handles';
const IDB_KEY   = 'dataFileHandle';

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}
async function idbGet(key) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  });
}
async function idbSet(key, value) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}
async function idbDel(key) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ── File System helpers ───────────────────────

const FS_SUPPORTED = ('showSaveFilePicker' in window);
let fileHandle = null;

async function readFromFile(handle) {
  const file = await handle.getFile();
  const text = await file.text();
  return text.trim() ? JSON.parse(text) : { pages: [[]] };
}

async function writeToFile(handle, data) {
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

async function verifyPermission(handle) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if ((await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}

// ── localStorage mirror ───────────────────────

const LS_KEY = 'folio_data';
function lsSave(data) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (_) {}
}
function lsLoad() {
  try {
    const r = localStorage.getItem(LS_KEY);
    return r ? JSON.parse(r) : { pages: [[]] };
  } catch (_) { return { pages: [[]] }; }
}

// ── Save (file + localStorage) ────────────────

async function saveData(data) {
  lsSave(data);
  if (fileHandle) {
    try { await writeToFile(fileHandle, data); }
    catch (e) { console.warn('File write failed:', e); }
  }
}

// ── App state ─────────────────────────────────

// data = { pages: [ [entry, entry, ...], [...], ... ] }
// entry = { id, text, date }
// pages[0] = cover (virtual), actual journal starts at pages[0] = first real page
// We store pages as array of arrays of entries.

let data          = { pages: [[]] }; // pages[i] = array of entries on that page
let currentPage   = 0;               // 0 = cover, 1..N = journal pages
let totalPages    = 1;               // cover + journal pages
let isAnimating   = false;

// Entries per page limit (approximate — based on char count)
const MAX_CHARS_PER_PAGE = 600;

// ── DOM refs ──────────────────────────────────

const viewSetup     = document.getElementById('view-setup');
const btnSetupNew   = document.getElementById('btn-setup-new');
const btnSetupExist = document.getElementById('btn-setup-existing');
const btnSetupSkip  = document.getElementById('btn-setup-skip');

const permBanner    = document.getElementById('perm-banner');
const btnGrantPerm  = document.getElementById('btn-grant-perm');

const bookWrap      = document.getElementById('book-wrap');
const book          = document.getElementById('book');
const pagesContainer= document.getElementById('pages-container');
const pageIndicator = document.getElementById('page-indicator');
const fileStatus    = document.getElementById('file-status');

const modalAdd      = document.getElementById('modal-add');
const modalDate     = document.getElementById('modal-date');
const entryTextarea = document.getElementById('entry-textarea');
const btnSaveEntry  = document.getElementById('btn-save-entry');
const btnCancelEntry= document.getElementById('btn-cancel-entry');
const modalClose    = document.getElementById('modal-close');

// ── Utility ───────────────────────────────────

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function formatEntryDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }) + ' · ' + new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function pageCharCount(pageEntries) {
  return pageEntries.reduce((sum, e) => sum + e.text.length, 0);
}

function setFileStatusText(text, ok = true) {
  if (!fileStatus) return;
  fileStatus.textContent = text;
  fileStatus.style.color = ok ? 'rgba(201,168,76,0.6)' : 'rgba(220,120,60,0.7)';
}

// ── Boot ──────────────────────────────────────

async function boot() {
  if (!FS_SUPPORTED) {
    data = lsLoad();
    setFileStatusText('localStorage only', false);
    showBook();
    return;
  }

  const savedHandle = await idbGet(IDB_KEY).catch(() => null);

  if (savedHandle) {
    const granted = await verifyPermission(savedHandle).catch(() => false);
    if (granted) {
      fileHandle = savedHandle;
      try {
        data = await readFromFile(fileHandle);
        lsSave(data);
        setFileStatusText(fileHandle.name);
        showBook();
        return;
      } catch (_) {
        await idbDel(IDB_KEY).catch(() => {});
        fileHandle = null;
      }
    } else {
      data = lsLoad();
      setFileStatusText('file access pending', false);
      showBook();
      showPermBanner(savedHandle);
      return;
    }
  }

  // First launch
  viewSetup.classList.remove('hidden');
}

function showBook() {
  viewSetup.classList.add('hidden');
  bookWrap.classList.remove('hidden');
  renderBook();
  goToPage(0, false);
}

// ── Permission banner ─────────────────────────

function showPermBanner(handle) {
  permBanner.classList.remove('hidden');
  btnGrantPerm.onclick = async () => {
    const granted = await verifyPermission(handle).catch(() => false);
    if (granted) {
      fileHandle = handle;
      try {
        data = await readFromFile(fileHandle);
        lsSave(data);
        renderBook();
        setFileStatusText(fileHandle.name);
      } catch (_) {}
      permBanner.classList.add('hidden');
    } else {
      permBanner.classList.add('hidden');
      setFileStatusText('localStorage only', false);
    }
  };
}

// ── Setup handlers ────────────────────────────

btnSetupNew && btnSetupNew.addEventListener('click', async () => {
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: 'folio-journal.json',
      types: [{ description: 'Folio Journal', accept: { 'application/json': ['.json'] } }],
    });
    if (!(await verifyPermission(handle))) { alert('Write permission denied.'); return; }
    await writeToFile(handle, { pages: [[]] });
    fileHandle = handle;
    await idbSet(IDB_KEY, fileHandle);
    data = { pages: [[]] };
    lsSave(data);
    setFileStatusText(fileHandle.name);
    showBook();
  } catch (e) {
    if (e.name !== 'AbortError') alert('Could not create file: ' + e.message);
  }
});

btnSetupExist && btnSetupExist.addEventListener('click', async () => {
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'Folio Journal', accept: { 'application/json': ['.json'] } }],
    });
    if (!(await verifyPermission(handle))) { alert('Permission denied.'); return; }
    fileHandle = handle;
    await idbSet(IDB_KEY, fileHandle);
    data = await readFromFile(fileHandle);
    lsSave(data);
    setFileStatusText(fileHandle.name);
    showBook();
  } catch (e) {
    if (e.name !== 'AbortError') alert('Could not open file: ' + e.message);
  }
});

btnSetupSkip && btnSetupSkip.addEventListener('click', () => {
  data = lsLoad();
  setFileStatusText('localStorage only', false);
  showBook();
});

// ── Render book ───────────────────────────────

function renderBook() {
  pagesContainer.innerHTML = '';

  // data.pages = array of journal pages (each = array of entries)
  // Ensure at least one journal page exists
  if (!data.pages || data.pages.length === 0) data.pages = [[]];

  totalPages = 1 + data.pages.length; // cover + journal pages

  data.pages.forEach((pageEntries, pageIdx) => {
    const pageEl = buildJournalPage(pageEntries, pageIdx);
    pagesContainer.appendChild(pageEl);
  });

  renderPageIndicator();
}

function buildJournalPage(entries, pageIdx) {
  const pageEl = document.createElement('div');
  pageEl.className = 'page journal-page';
  pageEl.dataset.pageIdx = pageIdx; // 0-based journal page index

  // Display page number = pageIdx + 1 (journal pages start at 1)
  const pageNum = pageIdx + 1;
  const isFull  = pageCharCount(entries) >= MAX_CHARS_PER_PAGE;

  pageEl.innerHTML = `
    <div class="page-header">
      <span class="page-number">— ${pageNum} —</span>
      <span class="page-title-label">Folio</span>
      ${isFull ? `<button class="btn-new-page" data-page="${pageIdx}">+ New page</button>` : ''}
    </div>
    <div class="page-entries" data-page="${pageIdx}">
      ${entries.map(e => `
        <div class="entry-block" data-id="${e.id}">
          <div class="entry-date">${formatEntryDate(e.id ? parseInt(e.id, 36) : Date.now())}</div>
          <div class="entry-text">${escHtml(e.text)}</div>
        </div>
      `).join('')}
      ${!isFull ? `
        <button class="btn-add-entry" data-page="${pageIdx}">
          <span class="plus">+</span>
          <span>Write a new entry…</span>
        </button>
      ` : `<div class="page-full-notice">Page full — start a new page above</div>`}
    </div>
  `;

  // New page button
  const newPageBtn = pageEl.querySelector('.btn-new-page');
  if (newPageBtn) {
    newPageBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      addNewPage();
    });
  }

  // Add entry button
  const addBtn = pageEl.querySelector('.btn-add-entry');
  if (addBtn) {
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openAddModal(pageIdx);
    });
  }

  return pageEl;
}

function renderPageIndicator() {
  pageIndicator.innerHTML = '';
  for (let i = 0; i < totalPages; i++) {
    const dot = document.createElement('div');
    dot.className = 'page-dot' + (i === currentPage ? ' active' : '');
    pageIndicator.appendChild(dot);
  }
}

// ── Page navigation ───────────────────────────

function goToPage(targetPage, animate = true) {
  if (isAnimating) return;
  if (targetPage < 0 || targetPage >= totalPages) return;

  const allPages = getAllPageEls();
  const from     = currentPage;
  const to       = targetPage;

  if (from === to) {
    // Just activate it without animation
    allPages.forEach((el, i) => {
      el.classList.remove('active', 'prev', 'flipping-out', 'flipping-in');
      if (i === to) el.classList.add('active');
      else if (i < to) el.classList.add('prev');
    });
    currentPage = to;
    renderPageIndicator();
    return;
  }

  if (!animate) {
    allPages.forEach((el, i) => {
      el.classList.remove('active', 'prev', 'flipping-out', 'flipping-in');
      if (i === to) el.classList.add('active');
      else if (i < to) el.classList.add('prev');
    });
    currentPage = to;
    renderPageIndicator();
    return;
  }

  isAnimating = true;
  const direction = to > from ? 'forward' : 'backward';

  if (direction === 'forward') {
    // Current page flips out (rotates left), new page comes in from right
    const fromEl = allPages[from];
    const toEl   = allPages[to];

    fromEl.classList.remove('active');
    fromEl.classList.add('flipping-out');
    toEl.classList.remove('prev');
    toEl.classList.add('active');

    setTimeout(() => {
      fromEl.classList.remove('flipping-out');
      fromEl.classList.add('prev');
      isAnimating = false;
      currentPage = to;
      renderPageIndicator();
    }, 560);
  } else {
    // Going backward — new page comes in
    const fromEl = allPages[from];
    const toEl   = allPages[to];

    fromEl.classList.remove('active');
    toEl.classList.remove('prev');
    toEl.classList.add('active');

    setTimeout(() => {
      fromEl.classList.add('prev');
      isAnimating = false;
      currentPage = to;
      renderPageIndicator();
    }, 560);
  }
}

function getAllPageEls() {
  // Cover is index 0, journal pages follow
  const cover = document.querySelector('.cover-page');
  const journalPages = Array.from(pagesContainer.querySelectorAll('.journal-page'));
  return [cover, ...journalPages];
}

// ── Add new journal page ──────────────────────

async function addNewPage() {
  data.pages.push([]);
  await saveData(data);
  renderBook();
  // Navigate to the new last page
  const newPageViewIdx = totalPages - 1; // cover(0) + pages
  goToPage(newPageViewIdx, true);
}

// ── Add entry modal ───────────────────────────

let addingToPage = 0;

function openAddModal(pageIdx) {
  addingToPage = pageIdx;
  modalDate.textContent = formatEntryDate(Date.now());
  entryTextarea.value = '';
  modalAdd.classList.remove('hidden');
  setTimeout(() => entryTextarea.focus(), 120);
}

function closeAddModal() {
  modalAdd.classList.add('hidden');
  entryTextarea.value = '';
}

async function saveEntry() {
  const text = entryTextarea.value.trim();
  if (!text) return;

  const entry = {
    id: generateId(),
    text,
    date: Date.now(),
  };

  // Check if current page would overflow
  const pageEntries = data.pages[addingToPage] || [];
  const projectedChars = pageCharCount(pageEntries) + text.length;

  if (projectedChars > MAX_CHARS_PER_PAGE && pageEntries.length > 0) {
    // Auto-create a new page and add there
    data.pages.push([entry]);
    await saveData(data);
    renderBook();
    closeAddModal();
    goToPage(totalPages - 1, true);
    return;
  }

  data.pages[addingToPage].push(entry);
  await saveData(data);

  // Rebuild just this page's content
  const allJournalEls = Array.from(pagesContainer.querySelectorAll('.journal-page'));
  const targetEl = allJournalEls[addingToPage];
  if (targetEl) {
    const newEl = buildJournalPage(data.pages[addingToPage], addingToPage);
    // Copy active/prev classes
    newEl.className = targetEl.className;
    targetEl.replaceWith(newEl);
  }

  renderPageIndicator();
  closeAddModal();

  // Scroll to bottom of entries on that page
  setTimeout(() => {
    const entriesEl = document.querySelector(`.page-entries[data-page="${addingToPage}"]`);
    if (entriesEl) entriesEl.scrollTop = entriesEl.scrollHeight;
  }, 50);
}

// ── Swipe detection ───────────────────────────

let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;

book.addEventListener('touchstart', (e) => {
  touchStartX    = e.touches[0].clientX;
  touchStartY    = e.touches[0].clientY;
  touchStartTime = Date.now();
}, { passive: true });

book.addEventListener('touchend', (e) => {
  const dx       = e.changedTouches[0].clientX - touchStartX;
  const dy       = e.changedTouches[0].clientY - touchStartY;
  const dt       = Date.now() - touchStartTime;
  const absDx    = Math.abs(dx);
  const absDy    = Math.abs(dy);

  // Must be fast enough, horizontal dominant, and meaningful distance
  if (dt > 500) return;
  if (absDy > absDx) return; // vertical scroll, ignore
  if (absDx < 40) return;    // too short

  // Check if we're inside a scrollable entries area — don't steal vertical swipe
  const target = e.target.closest('.page-entries');
  if (target && absDy > 20) return;

  if (dx < 0) {
    // Swipe left → next page
    goToPage(currentPage + 1, true);
  } else {
    // Swipe right → previous page
    goToPage(currentPage - 1, true);
  }
}, { passive: true });

// Mouse drag for desktop
let mouseStartX   = 0;
let mouseStartY   = 0;
let mouseDragging = false;

book.addEventListener('mousedown', (e) => {
  mouseStartX   = e.clientX;
  mouseStartY   = e.clientY;
  mouseDragging = true;
});

window.addEventListener('mouseup', (e) => {
  if (!mouseDragging) return;
  mouseDragging = false;

  const dx    = e.clientX - mouseStartX;
  const dy    = e.clientY - mouseStartY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDx < 50) return;
  if (absDy > absDx) return;

  if (dx < 0) goToPage(currentPage + 1, true);
  else         goToPage(currentPage - 1, true);
});

// ── Modal events ──────────────────────────────

btnSaveEntry.addEventListener('click', saveEntry);
btnCancelEntry.addEventListener('click', closeAddModal);
modalClose.addEventListener('click', closeAddModal);
modalAdd.addEventListener('click', (e) => {
  if (e.target === modalAdd) closeAddModal();
});

entryTextarea.addEventListener('keydown', (e) => {
  // Ctrl/Cmd + Enter to save
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') saveEntry();
});

// ── Escape key ────────────────────────────────
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAddModal();
  if (e.key === 'ArrowRight') goToPage(currentPage + 1, true);
  if (e.key === 'ArrowLeft')  goToPage(currentPage - 1, true);
});

// ── HTML escape ───────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Service worker ────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// ── Start ─────────────────────────────────────
window.addEventListener('DOMContentLoaded', boot);