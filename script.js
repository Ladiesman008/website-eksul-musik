const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Isi divisi: edit teks di sini. Nama divisi harus sama dengan DIVISI di code.gs.
const DIVISI = {
  modern: { ikon: '🎸', nama: 'Musik Modern',
    deskripsi: 'Belajar bermain band dari dasar hingga tampil bersama di panggung sekolah dan events di luar sekolah.',
    materi: ['Teknik dasar gitar, bass, keyboard, dan drum', 'Membaca chord dan notasi sederhana', 'Latihan lagu sesuai dengan kebutuhan event musik secara berkelompok.', 'Kekompakan tempo, dinamika, dan penampilan panggung'] },
  tradisional: { ikon: '🪘', nama: 'Musik Tradisional (Angklung & Gamelan)',
    deskripsi: 'Mengenal dan melestarikan alat musik tradisional Nusantara lewat permainan bersama.',
    materi: ['Teknik memegang dan menggetarkan angklung', 'Memainkan melodi angklung secara bergiliran', 'Mengenal waditra gamelan dan pola tabuhan dasar', 'Membawakan lagu-lagu daerah'] },
  vokal: { ikon: '🎤', nama: 'Olah Vokal & Paduan Suara',
    deskripsi: 'Melatih suara yang sehat dan merdu, baik untuk solo maupun bernyanyi bersama.',
    materi: ['Pernapasan diafragma dan pemanasan suara', 'Artikulasi dan ketepatan nada', 'Pembagian suara: sopran, alto, tenor, bass', 'Harmonisasi dan latihan lagu paduan suara'] }
};

// Profil singkat yang tampil saat tombol Pembina / Ketua ditekan. Edit teksnya sesuai kebutuhan.
// "foto" = nama file di folder yang sama (pembina.jpg / pembina.png, ketua.jpg / ketua.png, dst.)
const PROFIL = {
  pembina: { foto: 'pembina', judul: 'Profil Pembina', nama: 'Dr. H. Rd. Sahrul Mubarok, S.Pd., Gr., M. Sn., M. Psi. (Aamiin)', peran: 'Pembina Ekstrakurikuler Musik',
    bio: 'seorang manuia biasa yang akan selalu menyayangi semua siswanya dan mencoba dan berusaha untuk membina ekstrakurikuler musik. Mendampingi para siswa berlatih, menyiapkan penampilan, dan menjaga kegiatan ekskul tetap tertib dan menyenangkan.' },
  ketua: { foto: 'ketua', judul: 'Profil Ketua', nama: 'Faris Al Fathir', peran: 'Ketua Ekskul Musik · XI RPL',
    bio: 'Siswa kelas XI RPL yang baik dan ganteng yang memimpin kegiatan ekskul musik: mengoordinasi jadwal latihan dan menjadi penghubung antara anggota dan pembina.' }
};

let anggota = [], divAktif = 'modern';

// ---------- Sesi login siswa (hilang saat tab/browser ditutup) ----------
const SESI_KEY = 'ekskul_sesi';
let sesi = (() => { try { return JSON.parse(sessionStorage.getItem(SESI_KEY)); } catch { return null; } })();
function simpanSesi(s) {
  sesi = s;
  try { s ? sessionStorage.setItem(SESI_KEY, JSON.stringify(s)) : sessionStorage.removeItem(SESI_KEY); } catch {}
}

// ---------- Util ----------
function fallbackImg(img, base, onFail) {
  const src = ['png', 'jpg', 'jpeg', 'webp'].map(e => `${base}.${e}`);
  let i = 0;
  img.onerror = () => { if (++i < src.length) img.src = src[i]; else { img.hidden = true; onFail?.(); } };
  img.src = src[0];
}
function note(el, text, type = '') { el.textContent = text; el.className = 'note ' + type; }
const row = (t, n) => `<tr><td colspan="${n}" class="center">${esc(t)}</td></tr>`;
const errText = e => e.message === 'CONFIG' ? 'SCRIPT_URL belum diisi di config.js.' : 'Gagal terhubung ke server. Periksa URL Web App dan koneksi internet.';

async function api(action, data) {
  if (typeof SCRIPT_URL === 'undefined' || !SCRIPT_URL) throw new Error('CONFIG');
  const token = sesi?.token || '';
  const res = data
    ? await fetch(SCRIPT_URL, { method: 'POST', body: new URLSearchParams({ action, token, ...data }) })
    : await fetch(`${SCRIPT_URL}?action=${action}&token=${encodeURIComponent(token)}`);
  return res.json();
}

async function kirim(form, btn, msgEl, action, data, onOk) {
  const label = btn.textContent;
  note(msgEl, '');
  btn.disabled = true; btn.textContent = 'Memproses…';
  try {
    const r = await api(action, data);
    if (r.expired) { sesiHabis(); return; }
    const ok = r.result === 'success';
    note(msgEl, r.message || (ok ? 'Berhasil.' : 'Gagal.'), ok ? 'ok' : 'err');
    if (ok) { form.reset(); await onOk?.(r); }
  } catch (e) { note(msgEl, errText(e), 'err'); }
  finally { btn.disabled = false; btn.textContent = label; }
}

// ---------- Jam & tab ----------
const tf = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const df = new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' });
function tick() { const n = new Date(); $('#time').textContent = tf.format(n).replace(/\./g, ':'); $('#date').textContent = df.format(n); }

function switchTab(id) {
  $$('.pane').forEach(p => p.classList.toggle('active', p.id === id));
  $$('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  if (id === 'absensi') { renderAuth(); if (sesi) loadAbsensi(); }
  else loadAnggota();
}

// ---------- Login / daftar akun ----------
function renderAuth() {
  const masuk = !!sesi;
  $('#auth-card').hidden = masuk;
  $('#absensi-area').hidden = !masuk;
  if (masuk) $('#who').textContent = `${sesi.nama} · ${sesi.kelas}`;
}
function sesiHabis() {
  simpanSesi(null); renderAuth();
  note($('#login-msg'), 'Sesi berakhir. Silakan masuk lagi.', 'err');
}
function keluar() {
  api('logout', {}).catch(() => {});
  simpanSesi(null); renderAuth();
  note($('#login-msg'), '');
}

// ---------- Data ----------
async function loadAbsensi() {
  const tb = $('#absensi-body');
  try {
    const r = await api('read_absensi');
    if (r.expired) return sesiHabis();
    tb.innerHTML = r.data.length
      ? r.data.map(x => `<tr><td>${esc(x.waktu)}</td><td><b>${esc(x.nama)}</b></td><td>${esc(x.kelas)}</td><td><span class="tag ${esc(x.status)}">${esc(x.status)}</span></td></tr>`).join('')
      : row('Belum ada absensi hari ini.', 4);
  } catch (e) { tb.innerHTML = row(errText(e), 4); }
}

async function loadAnggota() {
  try { anggota = (await api('read_anggota')).data; renderAnggota(); }
  catch (e) { $('#anggota-body').innerHTML = row(errText(e), 5); }
}

function renderAnggota() {
  const q = $('#search').value.toLowerCase();
  const list = anggota.filter(a => [a.nama, a.kelas, a.divisi, a.jabatan].join(' ').toLowerCase().includes(q));
  $('#anggota-body').innerHTML = list.length
    ? list.map((a, i) => `<tr><td>${i + 1}</td><td><b>${esc(a.nama)}</b></td><td>${esc(a.kelas)}</td><td>${esc(a.divisi)}</td><td>${esc(a.jabatan)}</td></tr>`).join('')
    : row(anggota.length ? 'Tidak ada anggota yang cocok.' : 'Belum ada anggota terdaftar.', 5);
  $('#total').textContent = anggota.length;
  const ketua = anggota.find(a => /ketua/i.test(a.jabatan));
  $('#ketua').textContent = ketua ? ketua.nama : '-';
}

// ---------- Divisi (klik nada G) ----------
function showDivisi(k) {
  divAktif = k;
  $$('#divs .btn').forEach(b => b.classList.toggle('active', b.dataset.k === k));
  const d = DIVISI[k], box = $('#desc');
  box.innerHTML = `<h3>${d.ikon} ${esc(d.nama)}</h3><p>${esc(d.deskripsi)}</p><ul>${d.materi.map(m => `<li>${esc(m)}</li>`).join('')}</ul>`;
  box.classList.remove('fade'); void box.offsetWidth; box.classList.add('fade');
}

// ---------- Modal ----------
const openReg = () => { $('#modal').hidden = false; $('#reg-nama').focus(); };
const closeReg = () => { $('#modal').hidden = true; };
const closeProfil = () => { $('#modal-profil').hidden = true; };

function showProfil(k) {
  const p = PROFIL[k], av = $('#profil-foto');
  av.innerHTML = ''; av.classList.remove('noimg');
  av.dataset.initial = p.nama[0];
  const img = new Image(); img.alt = 'Foto ' + p.nama;
  av.append(img);
  fallbackImg(img, p.foto, () => av.classList.add('noimg')); // jika foto tidak ada, tampil inisial
  $('#profil-judul').textContent = p.judul;
  $('#profil-nama').textContent = p.nama;
  $('#profil-peran').textContent = p.peran;
  $('#profil-bio').textContent = p.bio;
  $('#modal-profil').hidden = false;
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  tick(); setInterval(tick, 1000);
  $('#year').textContent = new Date().getFullYear();
  fallbackImg($('#logo'), 'logo'); fallbackImg($('#sign'), 'signature');

  $('#divs').innerHTML = Object.entries(DIVISI).map(([k, d]) => `<button class="btn" data-k="${k}"><i>${d.ikon}</i>${esc(d.nama)}</button>`).join('');
  $('#reg-divisi').innerHTML += Object.values(DIVISI).map(d => `<option>${esc(d.nama)}</option>`).join('');
  $('#divs').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) showDivisi(b.dataset.k); });
  $('#clef').addEventListener('click', e => {
    const box = $('#divisi'), buka = box.hidden;
    box.hidden = !buka; e.currentTarget.setAttribute('aria-expanded', buka);
    if (buka) showDivisi(divAktif);
  });

  $$('[data-tab]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $('#search').addEventListener('input', renderAnggota);
  $('#open-reg').addEventListener('click', openReg);
  $('#close-reg').addEventListener('click', closeReg);
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeReg(); });
  $$('[data-profil]').forEach(b => b.addEventListener('click', () => showProfil(b.dataset.profil)));
  $('#close-profil').addEventListener('click', closeProfil);
  $('#modal-profil').addEventListener('click', e => { if (e.target.id === 'modal-profil') closeProfil(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeReg(); closeProfil(); } });

  // Login. "Mendaftar" langsung membuka form Daftar Anggota (username & password dibuat di sana)
  $('#to-akun').addEventListener('click', openReg);
  $('#btn-logout').addEventListener('click', keluar);

  $('#login-form').addEventListener('submit', e => {
    e.preventDefault();
    kirim(e.target, $('#btn-login'), $('#login-msg'), 'login',
      { username: $('#login-user').value.trim(), password: $('#login-pass').value },
      r => { simpanSesi({ token: r.token, nama: r.nama, kelas: r.kelas }); note($('#login-msg'), ''); renderAuth(); loadAbsensi(); });
  });

  // Absensi (nama & kelas diambil server dari akun yang login)
  $('#absensi-form').addEventListener('submit', e => {
    e.preventDefault();
    kirim(e.target, $('#btn-absen'), $('#absen-msg'), 'insert_absensi', { status: e.target.status.value }, loadAbsensi);
  });

  $('#register-form').addEventListener('submit', e => {
    e.preventDefault();
    const user = $('#reg-user').value.trim().toLowerCase();
    kirim(e.target, $('#btn-reg'), $('#reg-msg'), 'insert_pendaftaran', {
      nama: $('#reg-nama').value, kelas: $('#reg-kelas').value, jurusan: $('#reg-jurusan').value,
      divisi: $('#reg-divisi').value, username: user, password: $('#reg-pass').value, kode: $('#reg-kode').value
    }, async () => {
      await loadAnggota();
      // Setelah daftar, arahkan ke form login dengan username terisi
      setTimeout(() => {
        closeReg(); note($('#reg-msg'), ''); switchTab('absensi');
        $('#login-user').value = user; $('#login-pass').focus();
        note($('#login-msg'), 'Pendaftaran berhasil. Silakan masuk dengan username dan password kamu.', 'ok');
      }, 1500);
    });
  });

  loadAnggota(); // halaman awal = dashboard; absensi baru dimuat setelah login
});
