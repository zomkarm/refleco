// =============================================
// Refleco — app.js
// Entry point: boot, storage setup, coordination
// =============================================

import {
  FS_SUPPORTED, idbGet, idbSet, idbDel,
  readFromFile, writeToFile, verifyPermission,
  pickNewFile, pickExistingFile,
  lsSave, lsLoad, emptyJournal, generateId,
} from './src/storage.js';

import {
  formatDateTime, escHtml, pageCharCount, totalEntryCount,
} from './src/utils.js';

// ── Constants ─────────────────────────────────

const MAX_CHARS_PER_PAGE = 800; // ~comfortable page worth of text

// ── App state ─────────────────────────────────

let journal       = emptyJournal(); // { pages: [[entry,...], ...] }
let fileHandle    = null;
let currentPage   = 0;             // 0 = cover, 1..N = journal pages
let isAnimating   = false;

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
const fileStatusEl  = document.getElementById('file-status');

const modalAdd      = document.getElementById('modal-add');
const modalDateEl   = document.getElementById('modal-date');
const entryTextarea = document.getElementById('entry-textarea');
const charCount     = document.getElementById('char-count');
const btnSaveEntry  = document.getElementById('btn-save-entry');
const btnCancelEntry= document.getElementById('btn-cancel-entry');
const modalClose    = document.getElementById('modal-close');

const modalEdit     = document.getElementById('modal-edit');
const editTextarea  = document.getElementById('edit-textarea');
const editCharCount = document.getElementById('edit-char-count');
const btnSaveEdit   = document.getElementById('btn-save-edit');
const btnCancelEdit = document.getElementById('btn-cancel-edit');
const btnDeleteEntry= document.getElementById('btn-delete-entry');
const editModalClose= document.getElementById('edit-modal-close');

// ── Storage save ──────────────────────────────

async function save() {
  lsSave(journal);
  if (fileHandle) {
    try { await writeToFile(fileHandle, journal); }
    catch (e) { console.warn('File write failed:', e); }
  }
}

// ── File status display ───────────────────────

function setStatus(text, ok = true) {
  if (!fileStatusEl) return;
  fileStatusEl.textContent = text;
  fileStatusEl.style.color = ok
    ? 'rgba(201,168,76,0.65)'
    : 'rgba(220,130,60,0.75)';
}

// ── Boot ──────────────────────────────────────

async function boot() {
  if (!FS_SUPPORTED) {
    journal = lsLoad();
    setStatus('browser storage', false);
    launch();
    return;
  }

  const saved = await idbGet('journalFileHandle').catch(() => null);

  if (saved) {
    const granted = await verifyPermission(saved).catch(() => false);
    if (granted) {
      fileHandle = saved;
      try {
        journal = await readFromFile(fileHandle);
        lsSave(journal);
        setStatus(fileHandle.name);
        launch();
        return;
      } catch (_) {
        await idbDel('journalFileHandle').catch(() => {});
        fileHandle = null;
      }
    } else {
      journal = lsLoad();
      setStatus('tap to reconnect file', false);
      launch();
      showPermBanner(saved);
      return;
    }
  }

  // First launch — show setup
  viewSetup.classList.remove('hidden');
}

function launch() {
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
        journal = await readFromFile(fileHandle);
        lsSave(journal);
        renderBook();
        setStatus(fileHandle.name);
      } catch (_) {}
    } else {
      setStatus('browser storage only', false);
    }
    permBanner.classList.add('hidden');
  };
}

// ── Setup ─────────────────────────────────────

btnSetupNew && btnSetupNew.addEventListener('click', async () => {
  try {
    const handle = await pickNewFile('my-journal.json');
    if (!(await verifyPermission(handle))) return;
    journal = emptyJournal();
    await writeToFile(handle, journal);
    fileHandle = handle;
    await idbSet('journalFileHandle', fileHandle);
    lsSave(journal);
    setStatus(fileHandle.name);
    launch();
  } catch (e) {
    if (e.name !== 'AbortError') alert('Could not create file: ' + e.message);
  }
});

btnSetupExist && btnSetupExist.addEventListener('click', async () => {
  try {
    const handle = await pickExistingFile();
    if (!(await verifyPermission(handle))) return;
    fileHandle = handle;
    await idbSet('journalFileHandle', fileHandle);
    journal = await readFromFile(fileHandle);
    lsSave(journal);
    setStatus(fileHandle.name);
    launch();
  } catch (e) {
    if (e.name !== 'AbortError') alert('Could not open file: ' + e.message);
  }
});

btnSetupSkip && btnSetupSkip.addEventListener('click', () => {
  journal = lsLoad();
  setStatus('browser storage', false);
  launch();
});

// ── Render book ───────────────────────────────

function renderBook() {
  pagesContainer.innerHTML = '';
  if (!journal.pages || journal.pages.length === 0) journal.pages = [[]];

  // Update cover stats
  const coverEntryCount = document.getElementById('cover-entry-count');
  const coverPageCount  = document.getElementById('cover-page-count');
  if (coverEntryCount) coverEntryCount.textContent = totalEntryCount(journal.pages);
  if (coverPageCount)  coverPageCount.textContent  = journal.pages.length;

  journal.pages.forEach((entries, pageIdx) => {
    pagesContainer.appendChild(buildPage(entries, pageIdx));
  });

  renderDots();
}

function buildPage(entries, pageIdx) {
  const div = document.createElement('div');
  div.className = 'page journal-page';
  div.dataset.pageIdx = pageIdx;

  const pageNum = pageIdx + 1;
  const chars   = pageCharCount(entries);
  const isFull  = chars >= MAX_CHARS_PER_PAGE;

  div.innerHTML = `
    <div class="page-header">
      <span class="page-number">— ${pageNum} —</span>
      <span class="page-label"></span>
      <button class="btn-new-page" title="Start a new page">+ New page</button>
    </div>
    <div class="page-entries" data-page="${pageIdx}">
      ${entries.length === 0
        ? `<p class="page-empty-hint">This page is empty.<br/>Tap below to write your first entry.</p>`
        : entries.map(e => buildEntryHTML(e)).join('')
      }
    </div>
    <div class="page-footer">
      ${isFull
        ? `<span class="page-full-notice">Page is full</span>`
        : `<button class="btn-add-entry" data-page="${pageIdx}">
             <span class="add-plus">✦</span> Write a new entry
           </button>`
      }
      <span class="page-char-count">${chars} / ${MAX_CHARS_PER_PAGE} chars</span>
    </div>
  `;

  // New page button
  div.querySelector('.btn-new-page').addEventListener('click', e => {
    e.stopPropagation();
    addNewPage();
  });

  // Add entry button
  const addBtn = div.querySelector('.btn-add-entry');
  if (addBtn) {
    addBtn.addEventListener('click', e => {
      e.stopPropagation();
      openAddModal(pageIdx);
    });
  }

  // Edit/delete on entry tap
  div.querySelectorAll('.entry-block').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const id = el.dataset.id;
      openEditModal(pageIdx, id);
    });
  });

  return div;
}

function buildEntryHTML(entry) {
  return `
    <div class="entry-block" data-id="${entry.id}" title="Tap to edit or delete">
      <div class="entry-date">${formatDateTime(entry.date)}</div>
      <div class="entry-text">${escHtml(entry.text)}</div>
    </div>
  `;
}

// ── Page indicator dots ───────────────────────

function renderDots() {
  pageIndicator.innerHTML = '';
  const total = 1 + journal.pages.length; // cover + pages
  for (let i = 0; i < total; i++) {
    const dot = document.createElement('span');
    dot.className = 'page-dot' + (i === currentPage ? ' active' : '');
    pageIndicator.appendChild(dot);
  }
}

// ── Navigation ────────────────────────────────

function totalPageCount() {
  return 1 + journal.pages.length; // cover + journal pages
}

function getAllPageEls() {
  const cover = document.querySelector('.cover-page');
  const pages = Array.from(pagesContainer.querySelectorAll('.journal-page'));
  return [cover, ...pages];
}

function goToPage(to, animate = true) {
  if (isAnimating) return;
  const total = totalPageCount();
  if (to < 0 || to >= total) return;

  const all  = getAllPageEls();
  const from = currentPage;

  // Clear all states first
  all.forEach(el => el.classList.remove('active', 'prev', 'leaving'));

  if (!animate || from === to) {
    all.forEach((el, i) => {
      if (i === to)      el.classList.add('active');
      else if (i < to)   el.classList.add('prev');
    });
    currentPage = to;
    renderDots();
    return;
  }

  isAnimating = true;

  if (to > from) {
    // Forward: current leaves left, next comes from right
    all[from].classList.add('leaving');
    all[to].classList.add('active');
    setTimeout(() => {
      all[from].classList.remove('leaving');
      all[from].classList.add('prev');
      isAnimating = false;
      currentPage = to;
      renderDots();
    }, 500);
  } else {
    // Backward: current leaves right, previous comes back
    all.forEach((el, i) => {
      if (i === to)    el.classList.add('active');
      else if (i < to) el.classList.add('prev');
    });
    isAnimating = false;
    currentPage = to;
    renderDots();
  }
}

// ── Add new page ──────────────────────────────

async function addNewPage() {
  journal.pages.push([]);
  await save();
  renderBook();
  goToPage(totalPageCount() - 1, true);
}

// ── Add entry modal ───────────────────────────

let addingToPageIdx = 0;

function openAddModal(pageIdx) {
  addingToPageIdx = pageIdx;
  modalDateEl.textContent = formatDateTime(Date.now());
  entryTextarea.value = '';
  charCount.textContent = '0';
  modalAdd.classList.remove('hidden');
  setTimeout(() => entryTextarea.focus(), 100);
}

function closeAddModal() {
  modalAdd.classList.add('hidden');
  entryTextarea.value = '';
}

async function saveNewEntry() {
  const text = entryTextarea.value.trim();
  if (!text) { entryTextarea.focus(); return; }

  const entry = { id: generateId(), text, date: Date.now() };

  // If page is now full after adding, auto-create next page
  const currentEntries = journal.pages[addingToPageIdx] || [];
  if (pageCharCount(currentEntries) + text.length > MAX_CHARS_PER_PAGE && currentEntries.length > 0) {
    journal.pages.push([entry]);
    await save();
    renderBook();
    closeAddModal();
    goToPage(totalPageCount() - 1, true);
    return;
  }

  journal.pages[addingToPageIdx].push(entry);
  await save();

  // Rebuild only this page element in-place
  refreshPage(addingToPageIdx);
  renderDots();
  closeAddModal();

  setTimeout(() => {
    const el = document.querySelector(`.page-entries[data-page="${addingToPageIdx}"]`);
    if (el) el.scrollTop = el.scrollHeight;
  }, 60);
}

// ── Edit / delete entry modal ─────────────────

let editingPageIdx  = 0;
let editingEntryId  = null;

function openEditModal(pageIdx, entryId) {
  const entry = journal.pages[pageIdx]?.find(e => e.id === entryId);
  if (!entry) return;

  editingPageIdx = pageIdx;
  editingEntryId = entryId;

  editTextarea.value = entry.text;
  editCharCount.textContent = entry.text.length;
  modalEdit.classList.remove('hidden');
  setTimeout(() => editTextarea.focus(), 100);
}

function closeEditModal() {
  modalEdit.classList.add('hidden');
  editTextarea.value = '';
  editingEntryId = null;
}

async function saveEdit() {
  const text = editTextarea.value.trim();
  if (!text) { editTextarea.focus(); return; }

  const page  = journal.pages[editingPageIdx];
  const entry = page?.find(e => e.id === editingEntryId);
  if (!entry) return;

  entry.text = text;
  // Keep original date, don't update it — editing shouldn't change when it was written
  await save();
  refreshPage(editingPageIdx);
  closeEditModal();
}

async function deleteEntry() {
  if (!confirm('Delete this entry? This cannot be undone.')) return;

  journal.pages[editingPageIdx] = journal.pages[editingPageIdx].filter(
    e => e.id !== editingEntryId
  );
  await save();
  refreshPage(editingPageIdx);
  closeEditModal();
}

// ── Refresh a single page in-place ───────────

function refreshPage(pageIdx) {
  const allPageEls = getAllPageEls();
  // allPageEls[0] = cover, allPageEls[1] = journal page 0, etc.
  const target = allPageEls[pageIdx + 1];
  if (!target) { renderBook(); return; }

  const newEl = buildPage(journal.pages[pageIdx], pageIdx);
  newEl.className = target.className; // preserve active/prev state
  target.replaceWith(newEl);

  // Update cover stats
  const coverEntryCount = document.getElementById('cover-entry-count');
  const coverPageCount  = document.getElementById('cover-page-count');
  if (coverEntryCount) coverEntryCount.textContent = totalEntryCount(journal.pages);
  if (coverPageCount)  coverPageCount.textContent  = journal.pages.length;
}

// ── Swipe (touch) ─────────────────────────────

let tx = 0, ty = 0, tt = 0;

book.addEventListener('touchstart', e => {
  tx = e.touches[0].clientX;
  ty = e.touches[0].clientY;
  tt = Date.now();
}, { passive: true });

book.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - tx;
  const dy = e.changedTouches[0].clientY - ty;
  if (Date.now() - tt > 450) return;
  if (Math.abs(dy) > Math.abs(dx)) return;
  if (Math.abs(dx) < 45) return;
  // Don't swipe if inside a scrollable area moving vertically
  if (e.target.closest('.page-entries') && Math.abs(dy) > 15) return;
  dx < 0 ? goToPage(currentPage + 1) : goToPage(currentPage - 1);
}, { passive: true });

// ── Mouse drag (desktop) ──────────────────────

let mx = 0, my = 0, dragging = false;

book.addEventListener('mousedown', e => {
  mx = e.clientX; my = e.clientY; dragging = true;
});
window.addEventListener('mouseup', e => {
  if (!dragging) return;
  dragging = false;
  const dx = e.clientX - mx;
  const dy = e.clientY - my;
  if (Math.abs(dx) < 55 || Math.abs(dy) > Math.abs(dx)) return;
  dx < 0 ? goToPage(currentPage + 1) : goToPage(currentPage - 1);
});

// ── Keyboard ──────────────────────────────────

window.addEventListener('keydown', e => {
  if (modalAdd.classList.contains('hidden') && modalEdit.classList.contains('hidden')) {
    if (e.key === 'ArrowRight') goToPage(currentPage + 1);
    if (e.key === 'ArrowLeft')  goToPage(currentPage - 1);
  }
  if (e.key === 'Escape') { closeAddModal(); closeEditModal(); }
});

// ── Char count live feedback ──────────────────

entryTextarea.addEventListener('input', () => {
  charCount.textContent = entryTextarea.value.length;
});
editTextarea.addEventListener('input', () => {
  editCharCount.textContent = editTextarea.value.length;
});

// ── Modal events ──────────────────────────────

btnSaveEntry.addEventListener('click', saveNewEntry);
btnCancelEntry.addEventListener('click', closeAddModal);
modalClose.addEventListener('click', closeAddModal);
modalAdd.addEventListener('click', e => { if (e.target === modalAdd) closeAddModal(); });
entryTextarea.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') saveNewEntry();
});

btnSaveEdit.addEventListener('click', saveEdit);
btnCancelEdit.addEventListener('click', closeEditModal);
btnDeleteEntry.addEventListener('click', deleteEntry);
editModalClose.addEventListener('click', closeEditModal);
modalEdit.addEventListener('click', e => { if (e.target === modalEdit) closeEditModal(); });
editTextarea.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') saveEdit();
});

// ── Service worker ────────────────────────────

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('sw.js').catch(() => {})
  );
}

// ── Start ─────────────────────────────────────

window.addEventListener('DOMContentLoaded', boot);