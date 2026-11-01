const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let guestId = localStorage.getItem('guest_id');
if (!guestId) { guestId = Math.random().toString(36).substring(2, 15); localStorage.setItem('guest_id', guestId); }

const DIVISI = {
  modern: { ikon: '🎸', nama: 'Musik Modern', deskripsi: 'Belajar bermain band dari dasar.', materi: ['Teknik dasar alat musik', 'Kekompakan panggung'] },
  tradisional: { ikon: '🪘', nama: 'Musik Tradisional', deskripsi: 'Mengenal alat musik Nusantara.', materi: ['Angklung', 'Gamelan', 'Lagu daerah'] },
  vokal: { ikon: '🎤', nama: 'Olah Vokal', deskripsi: 'Melatih suara merdu dan paduan suara.', materi: ['Pernapasan', 'Harmonisasi'] }
};

let anggota = [], feed = [], fotoPost = null, activePostId = null;
const SESI_KEY = 'ekskul_sesi';
let sesi = (() => { try { return JSON.parse(sessionStorage.getItem(SESI_KEY)); } catch { return null; } })();
function simpanSesi(s) { sesi = s; try { s ? sessionStorage.setItem(SESI_KEY, JSON.stringify(s)) : sessionStorage.removeItem(SESI_KEY); } catch {} }

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
  btn.disabled = true; btn.textContent = 'Memproses...';
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
  $('#tab-akun').textContent = admin ? 'Admin' : masuk ? 'Profil' : 'Masuk';
}
function sesiHabis() { simpanSesi(null); renderAuth(); switchTab('akun'); note($('#login-msg'), 'Waktu habis. Silakan masuk kembali.', 'err'); }
function keluar() { api('logout').catch(() => {}); simpanSesi(null); renderAuth(); note($('#login-msg'), ''); }

async function loadMe() {
  try {
    const r = await api('read_profil');
    if (r.expired) return sesiHabis();
    const p = r.profil;
    $('#me-nama').innerHTML = `${esc(p.nama)} ${getBadgeHTML(p.jabatan)}`;
    $('#me-info').textContent = [p.kelas, p.divisi].filter(Boolean).join(' | ');
    if($('#me-nama-inp')) $('#me-nama-inp').value = p.nama || '';
    $('#me-bio').value = p.bio || '';
    $('#me-avatar').innerHTML = avatarHTML(p.avatar, p.nama);
    $('#me-posts').innerHTML = r.posts.length
      ? r.posts.map(x => `<div class="thumb" data-id="${esc(x.id)}"><img src="${esc(x.foto)}" alt="" loading="lazy"><b>♥ ${x.likes}</b><button type="button" data-del="${esc(x.id)}">&times;</button></div>`).join('')
      : '<p class="muted center" style="grid-column:1/-1">Belum ada karya.</p>';
  } catch (e) { $('#me-posts').innerHTML = `<p class="muted center">${esc(errText(e))}</p>`; }
}

async function loadFeed() {
  const cache = localStorage.getItem('feed_cache');
  if (cache) { try { feed = JSON.parse(cache); renderFeed(); } catch {} }
  try {
    const r = await api('read_feed'); feed = r.data || [];
    localStorage.setItem('feed_cache', JSON.stringify(feed)); renderFeed();
  } catch (e) { if (!cache) $('#reels').innerHTML = `<div class="center" style="padding:20px">${esc(errText(e))}</div>`; }
}
function renderFeed() {
  $('#reels').innerHTML = feed.slice(0, 20).map(p => `
    <article class="reel" data-id="${esc(p.id)}">
      <img src="${esc(p.foto)}" loading="lazy">
      <div class="meta">
        <div style="display:flex; gap:10px; align-items:center; margin-bottom:10px;">
          ${avatarHTML(p.avatar, p.nama)}
          <div><b style="display:block">${esc(p.nama)}${getBadgeHTML(p.jabatan)}</b><small>${esc(p.divisi)}</small></div>
        </div>
        <p class="cap" style="margin:0">${esc(p.caption)}</p>
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

async function openComments(id) {
  activePostId = id; const list = $('#comment-list'), form = $('#comment-form');
  if (!sesi) { form.hidden = true; note($('#comment-msg'), 'Silakan masuk untuk berkomentar.', 'err'); } 
  else { form.hidden = false; $('#comment-msg').style.display = 'none'; }
  list.innerHTML = '<p class="center">Memuat...</p>';
  $('#sheet-overlay').hidden = false; setTimeout(() => $('#comment-sheet').classList.add('open'), 10);
  try {
    const r = await api('get_comments', { id }); const cmts = r.data || [];
    list.innerHTML = cmts.length ? cmts.map(c => `
      <div class="comment-item">${avatarHTML(c.avatar, c.nama)}
        <div><b style="font-size:0.9em">${esc(c.nama)}${getBadgeHTML(c.jabatan)}</b><span>${esc(c.waktu)}</span><p style="margin:0;font-size:0.9em">${esc(c.teks)}</p></div>
      </div>`).join('') : '<p class="center">Belum ada komentar.</p>';
  } catch (e) { list.innerHTML = `<p class="center">${esc(errText(e))}</p>`; }
}
function closeComments() {
  $('#comment-sheet').classList.remove('open');
  setTimeout(() => { $('#sheet-overlay').hidden = true; activePostId = null; }, 300);
}

async function loadAnggota() {
  const cache = localStorage.getItem('anggota_cache');
  if (cache) { try { anggota = JSON.parse(cache); renderAnggota(); } catch {} }
  try {
    const r = await api('read_anggota'); anggota = r.data || [];
    localStorage.setItem('anggota_cache', JSON.stringify(anggota)); renderAnggota();
  } catch (e) { if (!cache) $('#anggota-body').innerHTML = `<tr><td colspan="5" class="center">${esc(errText(e))}</td></tr>`; }
}
function renderAnggota() {
  const q = ($('#search')?.value || '').toLowerCase();
  const list = anggota.filter(a => [a.nama, a.kelas, a.divisi, a.jabatan].join(' ').toLowerCase().includes(q));
  $('#anggota-body').innerHTML = list.length
    ? list.map((a, i) => `<tr><td>${i + 1}</td><td><b>${esc(a.nama)} ${getBadgeHTML(a.jabatan)}</b></td><td>${esc(a.kelas)}</td><td>${esc(a.divisi)}</td><td>${esc(a.jabatan)}</td></tr>`).join('')
    : `<tr><td colspan="5" class="center">Tidak ada data.</td></tr>`;
  if($('#total')) $('#total').textContent = anggota.length;
  const ketua = anggota.find(a => /ketua/i.test(a.jabatan));
  if($('#ketua')) $('#ketua').textContent = ketua ? ketua.nama : '-';
}

async function loadAdmin() {
  const body = $('#admin-anggota-body'); body.innerHTML = `<tr><td colspan="6" class="center">Memuat data...</td></tr>`;
  try {
    const r = await api('admin_list_anggota'); if (r.expired) return sesiHabis();
    const list = r.data || [];
    body.innerHTML = list.length ? list.map(a => `
      <tr>
        <td>${esc(a.nama)}</td><td>${esc(a.username)}</td><td>${esc(a.kelas)}</td><td>${esc(a.divisi)}</td><td>${esc(a.status)}</td>
        <td>
          <button type="button" class="btn small" onclick="ubahStatus(${a.row}, 'Disetujui')">Setujui</button>
          <button type="button" class="btn small" onclick="hapusAnggota(${a.row})">Hapus</button>
        </td>
      </tr>`).join('') : `<tr><td colspan="6" class="center">Belum ada pendaftaran.</td></tr>`;
  } catch (e) { body.innerHTML = `<tr><td colspan="6" class="center">${esc(errText(e))}</td></tr>`; }
}
window.ubahStatus = async (row, status) => { note($('#admin-msg'), 'Memproses...'); try { await api('admin_verifikasi', { row, status }); loadAdmin(); note($('#admin-msg'), 'Sukses.', 'ok'); } catch { note($('#admin-msg'), 'Gagal.', 'err'); } };
window.hapusAnggota = async (row) => { if(!confirm('Hapus?')) return; note($('#admin-msg'), 'Menghapus...'); try { await api('admin_hapus_anggota', { row }); loadAdmin(); note($('#admin-msg'), 'Dihapus.', 'ok'); } catch { note($('#admin-msg'), 'Gagal.', 'err'); } };

document.addEventListener('DOMContentLoaded', () => {
  const tf = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const df = new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' });
  setInterval(() => { const n = new Date(); if($('#time')) $('#time').textContent = tf.format(n).replace(/\./g, ':'); if($('#date')) $('#date').textContent = df.format(n); }, 1000);

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

  $('#divs').innerHTML = Object.entries(DIVISI).map(([k, d]) => `<button class="btn" onclick="showDiv('${k}')">${d.ikon} ${esc(d.nama)}</button>`).join('');
  $('#reg-divisi').innerHTML += Object.values(DIVISI).map(d => `<option value="${d.nama}">${esc(d.nama)}</option>`).join('');
  
  window.showDiv = (k) => {
    const d = DIVISI[k], box = $('#desc');
    box.innerHTML = `<h3>${d.ikon} ${esc(d.nama)}</h3><p>${esc(d.deskripsi)}</p><ul>${d.materi.map(m => `<li>${esc(m)}</li>`).join('')}</ul>`;
  };

  $('#clef').addEventListener('click', e => { const b = $('#divisi'); b.hidden = !b.hidden; if(!b.hidden) showDiv('modern'); });

  $$('[data-tab]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  
  $('#reels').addEventListener('click', e => { 
    const l = e.target.closest('[data-like]'); if (l) toggleLike(l.dataset.like);
    const c = e.target.closest('[data-comment]'); if (c) openComments(c.dataset.comment);
  });
  $('#reels').addEventListener('dblclick', e => {
    const r = e.target.closest('.reel'); if (!r || e.target.closest('.meta,.side')) return;
    const p = feed.find(x => x.id === r.dataset.id); if (p && !p.liked) toggleLike(p.id);
  });
  $('#reel-up').addEventListener('click', () => scrollReel(-1));
  $('#reel-down').addEventListener('click', () => scrollReel(1));

  $('#close-sheet').addEventListener('click', closeComments);
  $('#sheet-overlay').addEventListener('click', closeComments);
  $('#comment-form').addEventListener('submit', e => {
    e.preventDefault(); if (!activePostId) return; const i = $('#comment-input');
    kirim(e.target, $('#btn-comment'), $('#comment-msg'), 'add_comment', { id: activePostId, teks: i.value }, () => { i.value = ''; openComments(activePostId); });
  });

  $('#btn-logout').addEventListener('click', keluar);
  $('#btn-admin-refresh').addEventListener('click', loadAdmin);
  
  $('#open-reg').addEventListener('click', () => { $('#modal').hidden = false; });
  $('#close-reg').addEventListener('click', () => { $('#modal').hidden = true; });
  $('#close-profil').addEventListener('click', () => { $('#modal-profil').hidden = true; });
  
  $('#bio-form').addEventListener('submit', e => {
    e.preventDefault(); 
    kirim(null, $('#btn-bio'), $('#bio-msg'), 'update_profil', { nama: $('#me-nama-inp').value, bio: $('#me-bio').value }, loadMe);
  });

  $('#me-foto-in').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    note($('#bio-msg'), 'Mengunggah...');
    try {
      const foto = await resize(f, 500); const r = await api('update_profil', { foto });
      if (r.expired) return sesiHabis();
      note($('#bio-msg'), r.message || 'Gagal.', r.result === 'success' ? 'ok' : 'err');
      if (r.result === 'success') loadMe();
    } catch { note($('#bio-msg'), 'File tidak valid.', 'err'); }
  });

  $('#post-foto').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try { fotoPost = await resize(f, 1080); $('#post-preview').src = fotoPost; $('#post-preview').hidden = false; $('#drop-txt').hidden = true; } 
    catch { fotoPost = null; note($('#post-msg'), 'File tidak valid.', 'err'); }
  });

  $('#post-form').addEventListener('submit', e => {
    e.preventDefault(); if (!fotoPost) return note($('#post-msg'), 'Pilih foto.', 'err');
    kirim(e.target, $('#btn-post'), $('#post-msg'), 'insert_post', { foto: fotoPost, caption: $('#post-cap').value }, () => {
      fotoPost = null; $('#post-preview').hidden = true; $('#drop-txt').hidden = false; loadMe(); localStorage.removeItem('feed_cache');
    });
  });

  $('#me-posts').addEventListener('click', async e => {
    const b = e.target.closest('[data-del]');
    if (b) {
      if (!confirm('Hapus foto ini?')) return;
      try { await api('delete_post', { id: b.dataset.del }); localStorage.removeItem('feed_cache'); loadMe(); } catch {} return;
    }
    const thumb = e.target.closest('.thumb');
    if (thumb) {
      switchTab('feed');
      setTimeout(() => { const el = $(`[data-id="${CSS.escape(thumb.dataset.id)}"]`); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 300);
    }
  });

  $('#register-form').addEventListener('submit', e => {
    e.preventDefault(); const u = $('#reg-user').value.trim().toLowerCase();
    kirim(e.target, $('#btn-reg'), $('#reg-msg'), 'insert_pendaftaran', {
      nama: $('#reg-nama').value, kelas: $('#reg-kelas').value, jurusan: $('#reg-jurusan').value,
      divisi: $('#reg-divisi').value, username: u, password: $('#reg-pass').value, kode: $('#reg-kode').value
    }, () => { $('#modal').hidden = true; switchTab('akun'); $('#login-user').value = u; note($('#login-msg'), 'Pendaftaran sukses.', 'ok'); localStorage.removeItem('anggota_cache'); loadAnggota(); });
  });

  $('#login-form').addEventListener('submit', e => {
    e.preventDefault();
    kirim(e.target, $('#btn-login'), $('#login-msg'), 'login', { username: $('#login-user').value.trim().toLowerCase(), password: $('#login-pass').value },
      r => { simpanSesi({ token: r.token, role: r.role || 'anggota' }); switchTab('akun'); });
  });

  $('#search').addEventListener('input', renderAnggota);

  renderAuth(); loadFeed(); loadAnggota();
});
