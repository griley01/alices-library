// ====== CONFIGURE THESE TWO VALUES ======
// The URL of your deployed Apps Script web app (ending in /exec).
const API_URL = 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';
// Must exactly match API_KEY in Code.gs.
const API_KEY = 'alice-lib-8f2q4z-reading-2026';
// =========================================

const BASE_FIELDS = ['Title','Author','Genre','Year','Publisher','PublicRating','PublicRatingSource','Description'];
let books = [];

// --- API helpers ---

async function apiGet(params) {
  const url = new URL(API_URL);
  url.searchParams.set('key', API_KEY);
  Object.keys(params || {}).forEach(function (k) { url.searchParams.set(k, params[k]); });
  const resp = await fetch(url.toString());
  return resp.json();
}

async function apiPost(body) {
  // Sent as text/plain (not application/json) to avoid a CORS preflight request,
  // which Apps Script web apps can't respond to.
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ key: API_KEY }, body)),
  });
  return resp.json();
}

// --- Data loading ---

async function load() {
  document.getElementById('count').innerText = 'Loading…';
  try {
    const data = await apiGet({ action: 'list' });
    if (data.error) throw new Error(data.error);
    books = data.books;
    populateGenres();
    render();
  } catch (err) {
    document.getElementById('count').innerText = 'Failed to load: ' + err.message;
  }
}

function populateGenres() {
  const sel = document.getElementById('genreFilter');
  const current = sel.value;
  const genres = [...new Set(books.map(function (b) { return (b.Genre || '').split('/')[0].trim(); }).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">All genres</option>' + genres.map(function (g) { return '<option>' + esc(g) + '</option>'; }).join('');
  if (genres.includes(current)) sel.value = current;
}

function isLoaned(b) { return b.Loaned === true || b.Loaned === 'TRUE' || b.Loaned === 'Yes'; }
function isRead(b) { return b.Read === true || b.Read === 'TRUE' || b.Read === 'Yes'; }
function myRating(b) { const n = parseInt(b.MyRating, 10); return isNaN(n) ? 0 : Math.max(0, Math.min(5, n)); }

function starsHtml(n) {
  let s = '';
  for (let i = 1; i <= 5; i++) s += (i <= n ? '★' : '<span class="empty">★</span>');
  return s;
}

function updateKpis(list) {
  document.getElementById('kpiBooks').innerText = list.length;
  document.getElementById('kpiGenres').innerText = new Set(list.map(function (b) { return (b.Genre || '').split('/')[0].trim(); }).filter(Boolean)).size;
  const ratings = list.map(function (b) { return parseFloat(b.PublicRating); }).filter(function (n) { return !isNaN(n); });
  document.getElementById('kpiRating').innerText = ratings.length ? (ratings.reduce(function (a, b) { return a + b; }, 0) / ratings.length).toFixed(2) : '–';
  document.getElementById('kpiLoaned').innerText = list.filter(isLoaned).length;
  document.getElementById('kpiRead').innerText = list.filter(isRead).length;
}

function render() {
  const q = (document.getElementById('search').value || '').toLowerCase();
  const genre = document.getElementById('genreFilter').value;
  const sortBy = document.getElementById('sortBy').value;

  let list = books.filter(function (b) {
    const txt = ((b.Title || '') + (b.Author || '') + (b.Genre || '')).toLowerCase();
    const matchesGenre = !genre || (b.Genre || '').split('/')[0].trim() === genre;
    return (!q || txt.includes(q)) && matchesGenre;
  });

  list.sort(function (a, b) {
    if (sortBy === 'author') return (a.Author || '').localeCompare(b.Author || '');
    if (sortBy === 'rating') return (parseFloat(b.PublicRating) || 0) - (parseFloat(a.PublicRating) || 0);
    if (sortBy === 'year') return (parseInt(b.Year) || 0) - (parseInt(a.Year) || 0);
    return (a.Title || '').localeCompare(b.Title || '');
  });

  updateKpis(books);
  document.getElementById('count').innerText = list.length + (list.length === books.length ? ' books' : ' of ' + books.length + ' books');
  document.getElementById('empty').style.display = list.length ? 'none' : 'block';

  const container = document.getElementById('list');
  container.innerHTML = list.map(function (b) {
    const rating = myRating(b);
    const read = isRead(b);
    const cover = b.CoverURL
      ? '<img src="' + esc(b.CoverURL) + '" alt="" loading="lazy" onerror="this.parentElement.innerHTML=\'<div class=&quot;placeholder&quot;>📖</div>\'">'
      : '<div class="placeholder">📖</div>';
    return '<div class="card" onclick="editBook(' + b.rowIndex + ')">' +
      '<div class="pillRow topRow">' +
        (rating ? '<span class="stars">' + starsHtml(rating) + '</span>' : '<span></span>') +
        '<span class="rightAlign ' + (read ? 'pill read' : 'pill unread') + '">' + (read ? '✓ Read' : 'Unread') + '</span>' +
      '</div>' +
      '<div class="cardMain">' +
      '<div class="cardCover">' + cover + '</div>' +
      '<div class="cardBody">' +
      '<h3>' + esc(b.Title) + '</h3>' +
      '<div class="meta">' + esc(b.Author) + (b.Year ? ' · ' + esc(b.Year) : '') + '</div>' +
      '<div class="pillRow">' +
        (b.Genre ? '<span class="pill">' + esc(b.Genre) + '</span>' : '') +
        (b.PublicRating ? '<span class="pill">★ ' + esc(b.PublicRating) + '</span>' : '') +
        (isLoaned(b) ? '<span class="pill loaned">📤 Loaned</span>' : '') +
      '</div>' +
      (b.Description ? '<div class="desc">' + esc(b.Description) + '</div>' : '') +
      '</div>' +
      '</div>' +
      '</div>';
  }).join('');
}

function esc(s) { return (s || '').toString().replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

document.getElementById('search').addEventListener('input', render);
document.getElementById('genreFilter').addEventListener('change', render);
document.getElementById('sortBy').addEventListener('change', render);

// --- Modal: add / edit ---

function renderStarPicker(value) {
  const el = document.getElementById('starPicker');
  el.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const span = document.createElement('span');
    span.className = 'star' + (i <= value ? ' filled' : '');
    span.innerText = '★';
    span.onclick = function () {
      document.getElementById('f_MyRating').value = i;
      renderStarPicker(i);
    };
    el.appendChild(span);
  }
}

function resetPersonalFields() {
  document.getElementById('f_MyReview').value = '';
  document.getElementById('f_Comments').value = '';
  document.getElementById('f_Loaned').checked = false;
  document.getElementById('f_Read').checked = false;
  document.getElementById('f_MyRating').value = '0';
  renderStarPicker(0);
}

function openAddModal() {
  document.getElementById('modalTitle').innerText = 'Add Book';
  document.getElementById('modalSub').innerText = 'Fill in what you know about the book.';
  document.getElementById('f_rowIndex').value = '';
  document.getElementById('deleteBtn').style.display = 'none';
  BASE_FIELDS.forEach(function (f) { document.getElementById('f_' + f).value = ''; });
  resetPersonalFields();
  document.getElementById('modal').style.display = 'flex';
}

function editBook(rowIndex) {
  const b = books.find(function (x) { return x.rowIndex === rowIndex; });
  if (!b) return;
  document.getElementById('modalTitle').innerText = 'Edit Book';
  document.getElementById('modalSub').innerText = 'Update any details, plus your own notes below.';
  document.getElementById('f_rowIndex').value = b.rowIndex;
  document.getElementById('deleteBtn').style.display = 'inline-block';
  BASE_FIELDS.forEach(function (f) { document.getElementById('f_' + f).value = b[f] || ''; });
  document.getElementById('f_MyReview').value = b.MyReview || '';
  document.getElementById('f_Comments').value = b.Comments || '';
  document.getElementById('f_Loaned').checked = isLoaned(b);
  document.getElementById('f_Read').checked = isRead(b);
  document.getElementById('f_MyRating').value = myRating(b);
  renderStarPicker(myRating(b));
  document.getElementById('modal').style.display = 'flex';
}

function closeModal() { document.getElementById('modal').style.display = 'none'; }

async function saveBook() {
  const rowIndex = document.getElementById('f_rowIndex').value;
  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.innerText = 'Saving…';

  const personal = {
    MyRating: document.getElementById('f_MyRating').value,
    MyReview: document.getElementById('f_MyReview').value,
    Comments: document.getElementById('f_Comments').value,
    Loaned: document.getElementById('f_Loaned').checked ? 'Yes' : '',
    Read: document.getElementById('f_Read').checked ? 'Yes' : '',
  };
  const base = {};
  BASE_FIELDS.forEach(function (f) { base[f] = document.getElementById('f_' + f).value; });

  try {
    if (rowIndex) {
      const fields = Object.assign({}, base, personal);
      await apiPost({ action: 'update', rowIndex: parseInt(rowIndex, 10), fields: fields });
    } else {
      const book = Object.assign({}, base, personal);
      await apiPost({ action: 'add', book: book });
    }
    closeModal();
    await load();
  } catch (err) {
    document.getElementById('modalSub').innerText = 'Save failed: ' + err.message;
  } finally {
    btn.disabled = false;
    btn.innerText = 'Save';
  }
}

async function deleteCurrent() {
  const rowIndex = document.getElementById('f_rowIndex').value;
  if (!rowIndex || !confirm('Delete this book?')) return;
  await apiPost({ action: 'delete', rowIndex: parseInt(rowIndex, 10) });
  closeModal();
  await load();
}

// --- Auto-fill Genre/Year/Publisher/Description/Rating from Title+Author (Add mode only) ---

let autofillTimer = null;
function scheduleAutofillMeta() {
  if (document.getElementById('f_rowIndex').value) return; // editing an existing book — skip
  clearTimeout(autofillTimer);
  autofillTimer = setTimeout(runAutofillMeta, 500);
}
async function runAutofillMeta() {
  const title = document.getElementById('f_Title').value.trim();
  if (!title) return;
  const author = document.getElementById('f_Author').value.trim();
  try {
    const meta = await apiGet({ action: 'lookupMeta', title: title, author: author });
    if (!meta || meta.error) return;
    if (meta.year && !document.getElementById('f_Year').value) document.getElementById('f_Year').value = meta.year;
    if (meta.genre && !document.getElementById('f_Genre').value) document.getElementById('f_Genre').value = meta.genre;
    if (meta.publisher && !document.getElementById('f_Publisher').value) document.getElementById('f_Publisher').value = meta.publisher;
    if (meta.description && !document.getElementById('f_Description').value) document.getElementById('f_Description').value = meta.description;
    if (meta.rating && !document.getElementById('f_PublicRating').value) document.getElementById('f_PublicRating').value = meta.rating;
    if (meta.ratingSource && !document.getElementById('f_PublicRatingSource').value) document.getElementById('f_PublicRatingSource').value = meta.ratingSource;
  } catch (err) {
    document.getElementById('modalSub').innerText = 'Auto-fill failed: ' + err.message + ' (basic info can still be entered manually)';
  }
}
document.getElementById('f_Title').addEventListener('blur', scheduleAutofillMeta);
document.getElementById('f_Author').addEventListener('blur', scheduleAutofillMeta);

// --- Add via photo: capture, resize client-side, send to Gemini, prefill the Add form ---

function openCameraCapture() {
  document.getElementById('cameraInput').click();
}

// Resizes/compresses the photo in the browser before sending — Gemini doesn't need full
// resolution to read a cover or spine, and a smaller payload uploads much faster on mobile data.
function fileToResizedBase64(file, maxDim) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () {
      const img = new Image();
      img.onload = function () {
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
          else { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve(dataUrl.substring(dataUrl.indexOf(',') + 1));
      };
      img.onerror = function () { reject(new Error('Could not read that image')); };
      img.src = reader.result;
    };
    reader.onerror = function () { reject(new Error('Could not read that file')); };
    reader.readAsDataURL(file);
  });
}

async function handlePhotoCapture(event) {
  const file = event.target.files[0];
  event.target.value = ''; // reset so picking the same photo again still fires 'change'
  if (!file) return;

  openAddModal();
  document.getElementById('modalSub').innerText = '🔍 Identifying book from photo…';
  document.getElementById('saveBtn').disabled = true;

  try {
    const base64 = await fileToResizedBase64(file, 1200);
    const result = await apiPost({ action: 'identifyPhoto', imageData: base64, mimeType: 'image/jpeg' });

    if (!result.found) {
      document.getElementById('modalSub').innerText =
        "Couldn't identify a book in that photo — " + (result.error || 'try a clearer shot, or fill in details manually.');
      return;
    }

    document.getElementById('f_Title').value = result.title || '';
    document.getElementById('f_Author').value = result.author || '';
    if (result.year) document.getElementById('f_Year').value = result.year;
    if (result.genre) document.getElementById('f_Genre').value = result.genre;
    if (result.publisher) document.getElementById('f_Publisher').value = result.publisher;
    if (result.description) document.getElementById('f_Description').value = result.description;
    if (result.rating) document.getElementById('f_PublicRating').value = result.rating;
    if (result.ratingSource) document.getElementById('f_PublicRatingSource').value = result.ratingSource;

    document.getElementById('modalSub').innerText = 'Identified from photo — check the details below before saving.';
  } catch (err) {
    document.getElementById('modalSub').innerText = 'Photo lookup failed: ' + err.message;
  } finally {
    document.getElementById('saveBtn').disabled = false;
  }
}

// --- Decorative header book-spine illustration (static, matches the Apps Script version) ---
document.getElementById('headerShelf').innerHTML = `<svg viewBox="0 0 807 90" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><g transform="rotate(3 17.5 88)"><rect x="4" y="33" width="27" height="55" rx="2" fill="#f4a259" stroke="#2b2b2b" stroke-width="1.4"/></g><g transform="rotate(-3 45.0 88)"><rect x="34" y="38" width="22" height="50" rx="2" fill="#3caea3" stroke="#2b2b2b" stroke-width="1.4"/></g><g transform="rotate(0 70.5 88)"><rect x="59" y="19" width="23" height="69" rx="2" fill="#4a6fa5" stroke="#2b2b2b" stroke-width="1.4"/></g><g transform="rotate(0 100.0 88)"><rect x="85" y="29" width="30" height="59" rx="2" fill="#e07a5f" stroke="#2b2b2b" stroke-width="1.4"/></g><g transform="rotate(0 132.0 88)"><rect x="118" y="16" width="28" height="72" rx="2" fill="#3d9a8b" stroke="#2b2b2b" stroke-width="1.4"/></g><g transform="rotate(0 160.5 88)"><rect x="149" y="7" width="23" height="81" rx="2" fill="#f4a259" stroke="#2b2b2b" stroke-width="1.4"/></g><g transform="rotate(3 190.5 88)"><rect x="175" y="35" width="31" height="53" rx="2" fill="#7b6cd9" stroke="#2b2b2b" stroke-width="1.4"/></g><g transform="rotate(-3 225.0 88)"><rect x="209" y="5" width="32" height="83" rx="2" fill="#e07a5f" stroke="#2b2b2b" stroke-width="1.4"/></g><g transform="rotate(0 259.5 88)"><rect x="244" y="17" width="31" height="71" rx="2" fill="#e07a5f" stroke="#2b2b2b" stroke-width="1.4"/></g><g transform="rotate(0 289.0 88)"><rect x="278" y="7" width="22" height="81" rx="2" fill="#3caea3" stroke="#2b2b2b" stroke-width="1.4"/></g><g transform="rotate(-3 316.0 88)"><rect x="303" y="16" width="26" height="72" rx="2" fill="#f2b134" stroke="#2b2b2b" stroke-width="1.4"/></g><g transform="rotate(-3 343.5 88)"><rect x="332" y="6" width="23" height="82" rx="2" fill="#e85d75" stroke="#2b2b2b" stroke-width="1.4"/></g><g transform="rotate(-3 374.0 88)"><rect x="358" y="31" width="32" height="57" rx="2" fill="#3d9a8b" stroke="#2b2b2b" stroke-width="1.4"/></g><g transform="rotate(0 408.5 88)"><rect x="393" y="2" width="31" height="86" rx="2" fill="#7b6cd9" stroke="#2b2b2b" stroke-width="1.4"/></g><g transform="rotate(0 438.5 88)"><rect x="427" y="7" width="23" height="81" rx="2" fill="#6b4c93" stroke="#2b2b2b" stroke-width="1.4"/></g><g transform="rotate(0 468.5 88)"><rect x="453" y="39" width="31" height="49" rx="2" fill="#4a6fa5" stroke="#2b2b2b" stroke-width="1.4"/></g><g transform="rotate(0 501.5 88)"><rect x="487" y="8" width="29" height="80" rx="2" fill="#f4a259" stroke="#2b2b2b" stroke-width="1.4"/></g><g transform="rotate(0 533.5 88)"><rect x="519" y="5" width="29" height="83" rx="2" fill="#f38181" stroke="#2b2b2b" stroke-width="1.4"/></g><g transform="rotate(0 564.5 88)"><rect x="551" y="23" width="27" height="65" rx="2" fill="#7b6cd9" stroke="#2b2b2b" stroke-width="1.4"/></g><g transform="rotate(-3 597.5 88)"><rect x="581" y="27" width="33" height="61" rx="2" fill="#3d9a8b" stroke="#2b2b2b" stroke-width="1.4"/></g><g transform="rotate(0 630.0 88)"><rect x="617" y="9" width="26" height="79" rx="2" fill="#8fb339" stroke="#2b2b2b" stroke-width="1.4"/></g><g transform="rotate(-3 662.5 88)"><rect x="646" y="14" width="33" height="74" rx="2" fill="#e85d75" stroke="#2b2b2b" stroke-width="1.4"/></g><g transform="rotate(0 693.5 88)"><rect x="682" y="35" width="23" height="53" rx="2" fill="#c44569" stroke="#2b2b2b" stroke-width="1.4"/></g><g transform="rotate(0 720.0 88)"><rect x="708" y="21" width="24" height="67" rx="2" fill="#f2b134" stroke="#2b2b2b" stroke-width="1.4"/></g><g transform="rotate(0 749.0 88)"><rect x="735" y="40" width="28" height="48" rx="2" fill="#f7c948" stroke="#2b2b2b" stroke-width="1.4"/></g><g transform="rotate(0 783.0 88)"><rect x="766" y="7" width="34" height="81" rx="2" fill="#4a6fa5" stroke="#2b2b2b" stroke-width="1.4"/></g></svg>`;

// --- Register service worker for installability / offline app shell ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('service-worker.js').catch(function () { /* non-fatal */ });
  });
}

load();
