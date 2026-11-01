const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Pengunjung Anonim untuk fitur Suka
let guestId = localStorage.getItem('guest_id');
if (!guestId) {
  guestId = Math.random().toString(36).substring(2, 15);
  localStorage.setItem('guest_id', guestId);
}

// Data Dasar
const DIVISI = {
  modern: { ikon: '🎸', nama: 'Musik Modern', deskripsi: 'Belajar bermain band dari dasar.', materi: ['Teknik dasar alat musik', 'Kekompakan panggung'] },
  tradisional: { ikon: '🪘', nama: 'Musik Tradisional', deskripsi: 'Mengenal alat musik Nusantara.', materi: ['Angklung', 'Gamelan', 'Lagu daerah'] },
  vokal: { ikon: '🎤', nama: 'Olah Vokal', deskripsi: 'Melatih suara merdu dan paduan suara.', materi: ['Pernapasan', 'Harmonisasi'] }
};

let anggota = [], feed = [], fotoPost = null, activePostId = null;

// Sesi
const SESI_KEY = 'ekskul_sesi';
let sesi = (() => { try { return JSON.parse(sessionStorage.getItem(SESI_KEY)); } catch { return null; } })();
function simpanSesi(s) {
  sesi = s;
  try { s ? sessionStorage.setItem(SESI_KEY, JSON.stringify(s)) : sessionStorage.removeItem(SESI_KEY); } catch {}
}

// Utilitas Komunikasi ke Sistem Tabel
function note(el, text, type = '') { el.textContent = text; el.className = 'note ' + type; }
const errText = e => e.message === 'CONFIG' ? 'SCRIPT_URL belum diisi.' : 'Gagal terhubung. Periksa jaringan Anda.';

async function api(action, data = {}) {
  if (typeof SCRIPT_URL === 'undefined' || !SCRIPT_URL) throw new Error('CONFIG');
  const payload = { action, token: sesi?.token || '', guest_id: guestId, ...data };
  const res = await fetch(SCRIPT_URL, { method: 'POST', body: new URLSearchParams(payload) });
  return res.json();
}

async function kirim(form, btn, msgEl, action, data, onOk) {
  const label = btn.textContent; note(msgEl, '');
  btn.disabled = true; btn.textContent = 'Memproses…';
  try {
    const r = await api(action, data);
    if (r.expired) { sesiHabis(); return; }
    const ok = r.result === 'success';
    note(msgEl, r.message || (ok ? 'Berhasil.' : 'Gagal.'), ok ? 'ok' : 'err');
    if (ok) { form?.reset(); await onOk?.(r); }
  } catch (e) { note(msgEl, errText(e), 'err'); }
  finally { btn.disabled = false; btn.textContent = label; }
}

function resize(file, max, q = .85) {
  return new Promise((res, rej) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u); res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => rej(new Error('IMG')); img.src = u;
  });
}

const avatarHTML = (url, nama) => url ? `<img class="av" src="${esc(url)}" alt="">` : `<span class="av">${esc((nama || '?')[0])}</span>`;
const getBadgeHTML = (jabatan) => {
  const j = String(jabatan || '').toLowerCase();
  return j.includes('pembina') || j.includes('admin') ? `<span class="badge-pembina"></span>` : j.includes('ketua') ? `<span class="badge-ketua"></span>` : '';
};

// Navigasi & Sesi
function switchTab(id) {
  $$('.pane').forEach(p => p.classList.toggle('active', p.id === id));
  $$('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  if (id === 'akun') { renderAuth(); if (sesi) loadMe(); if (sesi?.role === 'admin') loadAdmin(); }
  else if (id === 'feed') loadFeed();
  else loadAnggota();
}

function renderAuth() {
  const masuk = !!sesi; const admin = masuk && sesi.role === 'admin';
  $('#auth-card').hidden = masuk; $('#profil-area').hidden = !masuk; $('#admin-area').hidden = !admin;
}
function sesiHabis() { simpanSesi(null); renderAuth(); switchTab('akun'); note($('#login-msg'), 'Waktu habis. Silakan masuk kembali.', 'err'); }
function keluar() { api('logout').catch(() => {}); simpanSesi(null); renderAuth(); note($('#login-msg'), ''); }

// Profil
async function loadMe() {
  try {
    const r = await api('read_profil');
    if (r.expired) return sesiHabis();
    const p = r.profil;
    $('#me-nama').innerHTML = `${esc(p.nama)} ${getBadgeHTML(p.jabatan)}`;
    const meNamaInp = $('#me-nama-inp'); if(meNamaInp) meNamaInp.value = p.nama || '';
    $('#me-bio').value = p.bio || '';
    $('#me-posts').innerHTML = r.posts.length
      ? r.posts.map(x => `<div class="thumb" data-id="${esc(x.id)}"><img src="${esc(x.foto)}" alt="" loading="lazy"><b>♥ ${x.likes}</b><button type="button" data-del="${esc(x.id)}">&times;</button></div>`).join('')
      : '<p class="muted center" style="grid-column:1/-1">Belum ada karya.</p>';
  } catch (e) { $('#me-posts').innerHTML = `<p class="muted center">${esc(errText(e))}</p>`; }
}

// Feed (Layar Utama)
async function loadFeed() {
  const cache = localStorage.getItem('feed_cache');
  if (cache) { try { feed = JSON.parse(cache); renderFeed(); } catch {} }
  try {
    const r = await api('read_feed'); feed = r.data || [];
    localStorage.setItem('feed_cache', JSON.stringify(feed)); renderFeed();
  } catch (e) { if (!cache) $('#reels').innerHTML = `<div class="reel-empty">${esc(errText(e))}</div>`; }
}
function renderFeed() {
  $('#reels').innerHTML = feed.slice(0, 20).map(p => `
    <article class="reel" data-id="${esc(p.id)}">
      <img src="${esc(p.foto)}" loading="lazy">
      <div class="meta">
        <div class="who2">${avatarHTML(p.avatar, p.nama)}<div><b>${esc(p.nama)}${getBadgeHTML(p.jabatan)}</b><small>${esc(p.divisi)}</small></div></div>
        <p class="cap">${esc(p.caption)}</p>
      </div>
      <div class="side">
        <button type="button" class="like ${p.liked ? 'on' : ''}" data-like="${esc(p.id)}"><span>♥</span><b>${p.likes}</b></button>
        <button type="button" class="like" data-comment="${esc(p.id)}"><span>💬</span></button>
      </div>
    </article>`).join('');
}
async function toggleLike(id) {
  const p = feed.find(x => x.id === id); if (!p) return;
  const btn = $(`[data-like="${CSS.escape(id)}"]`);
  p.liked = !p.liked; p.likes += p.liked ? 1 : -1;
  if(btn) { btn.classList.toggle('on', p.liked); btn.lastElementChild.textContent = p.likes; }
  api('toggle_like', { id }).then(r => {
    if (r.result === 'success') { p.liked = r.liked; p.likes = r.likes; localStorage.setItem('feed_cache', JSON.stringify(feed)); }
  }).catch(()=>{});
}
function scrollReel(dir) { const r = $('#reels'); r.scrollBy({ top: dir * r.clientHeight, behavior: 'smooth' }); }

// Komentar
async function openComments(id) {
  activePostId = id; const list = $('#comment-list'), form = $('#comment-form');
  if (!sesi) { form.hidden = true; note($('#comment-msg'), 'Silakan masuk untuk berkomentar.', 'err'); } 
  else { form.hidden = false; $('#comment-msg').style.display = 'none'; }
  list.innerHTML = '<p class="muted center">Memuat...</p>';
  $('#sheet-overlay').hidden = false; setTimeout(() => $('#comment-sheet').classList.add('open'), 10);
  try {
    const r = await api('get_comments', { id }); const cmts = r.data || [];
    list.innerHTML = cmts.length ? cmts.map(c => `
      <div class="comment-item">${avatarHTML(c.avatar, c.nama)}
        <div><b>${esc(c.nama)}${getBadgeHTML(c.jabatan)}</b><span>${esc(c.waktu)}</span><p>${esc(c.teks)}</p></div>
      </div>`).join('') : '<p class="muted center">Belum ada komentar.</p>';
  } catch (e) { list.innerHTML = `<p class="muted center">${esc(errText(e))}</p>`; }
}
function closeComments() {
  $('#comment-sheet').classList.remove('open');
  setTimeout(() => { $('#sheet-overlay').hidden = true; activePostId = null; }, 300);
}

// Inisialisasi
document.addEventListener('DOMContentLoaded', () => {
  // PENGAMANAN TOMBOL KETIKAN (Real-time Validation)
  const pattern = /^[a-zA-Z0-9_-]*$/;
  function cekForm(userInp, passInp, btn, msgEl) {
    const u = userInp.value, p = passInp.value;
    const ok = pattern.test(u) && pattern.test(p) && u.length >= 4 && p.length >= 6;
    btn.disabled = !ok;
    if (!pattern.test(u) || !pattern.test(p)) note(msgEl, 'DILARANG SPASI/SIMBOL! Hanya huruf, angka, _, dan -.', 'err');
    else note(msgEl, '');
  }
  const ru = $('#reg-user'), rp = $('#reg-pass'), br = $('#btn-reg');
  if (ru && rp) { [ru, rp].forEach(i => i.addEventListener('input', () => cekForm(ru, rp, br, $('#reg-msg')))); br.disabled = true; }
  const lu = $('#login-user'), lp = $('#login-pass'), bl = $('#btn-login');
  if (lu && lp) { [lu, lp].forEach(i => i.addEventListener('input', () => cekForm(lu, lp, bl, $('#login-msg')))); bl.disabled = true; }

  $$('[data-tab]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $('#reels').addEventListener('click', e => { 
    const l = e.target.closest('[data-like]'); if (l) toggleLike(l.dataset.like);
    const c = e.target.closest('[data-comment]'); if (c) openComments(c.dataset.comment);
  });
  $('#reels').addEventListener('dblclick', e => {
    const r = e.target.closest('.reel'); if (!r || e.target.closest('.meta,.side')) return;
    const p = feed.find(x => x.id === r.dataset.id); if (p && !p.liked) toggleLike(p.id);
  });
  $('#close-sheet').addEventListener('click', closeComments);
  $('#sheet-overlay').addEventListener('click', closeComments);
  
  $('#comment-form').addEventListener('submit', e => {
    e.preventDefault(); if (!activePostId) return; const i = $('#comment-input');
    kirim(e.target, $('#btn-comment'), $('#comment-msg'), 'add_comment', { id: activePostId, teks: i.value }, () => { i.value = ''; openComments(activePostId); });
  });
  $('#btn-logout').addEventListener('click', keluar);
  
  // Profil Update (Bio & Nama)
  $('#bio-form').addEventListener('submit', e => {
    e.preventDefault(); 
    const namaBaru = $('#me-nama-inp') ? $('#me-nama-inp').value : undefined;
    kirim(null, $('#btn-bio'), $('#bio-msg'), 'update_profil', { nama: namaBaru, bio: $('#me-bio').value }, loadMe);
  });

  // Hapus Postingan & Melompat ke Reels
  $('#me-posts').addEventListener('click', async e => {
    const b = e.target.closest('[data-del]');
    if (b) {
      if (!confirm('Hapus gambar ini?')) return;
      try { await api('delete_post', { id: b.dataset.del }); localStorage.removeItem('feed_cache'); loadMe(); } catch {} return;
    }
    const thumb = e.target.closest('.thumb');
    if (thumb) {
      switchTab('feed');
      setTimeout(() => { const el = $(`[data-id="${CSS.escape(thumb.dataset.id)}"]`); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 300);
    }
  });

  // Proses Pendaftaran & Login
  $('#register-form').addEventListener('submit', e => {
    e.preventDefault(); const u = $('#reg-user').value.trim().toLowerCase();
    kirim(e.target, $('#btn-reg'), $('#reg-msg'), 'insert_pendaftaran', {
      nama: $('#reg-nama').value, kelas: $('#reg-kelas').value, jurusan: $('#reg-jurusan').value,
      divisi: $('#reg-divisi').value, username: u, password: $('#reg-pass').value, kode: $('#reg-kode').value
    }, () => { switchTab('akun'); $('#login-user').value = u; note($('#login-msg'), 'Pendaftaran sukses.', 'ok'); });
  });

  $('#login-form').addEventListener('submit', e => {
    e.preventDefault();
    kirim(e.target, $('#btn-login'), $('#login-msg'), 'login', { username: $('#login-user').value.trim().toLowerCase(), password: $('#login-pass').value },
      r => { simpanSesi({ token: r.token, role: r.role || 'anggota' }); switchTab('akun'); });
  });

  renderAuth(); loadFeed();
});