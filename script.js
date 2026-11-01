
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

// ==========================================
// DATA DIVISI
// Nama divisi harus sama dengan DIVISI di code.gs
// ==========================================

const DIVISI = {
  modern: {
    ikon: '🎸',
    nama: 'Musik Modern',
    deskripsi: 'Belajar bermain band dari dasar hingga tampil bersama di panggung sekolah dan events di luar sekolah.',
    materi: [
      'Teknik dasar gitar, bass, keyboard, dan drum',
      'Membaca chord dan notasi sederhana',
      'Latihan lagu sesuai dengan kebutuhan event musik secara berkelompok.',
      'Kekompakan tempo, dinamika, dan penampilan panggung'
    ]
  },

  tradisional: {
    ikon: '🪘',
    nama: 'Musik Tradisional (Angklung & Gamelan)',
    deskripsi: 'Mengenal dan melestarikan alat musik tradisional Nusantara lewat permainan bersama.',
    materi: [
      'Teknik memegang dan menggetarkan angklung',
      'Memainkan melodi angklung secara bergiliran',
      'Mengenal waditra gamelan dan pola tabuhan dasar',
      'Membawakan lagu-lagu daerah'
    ]
  },

  vokal: {
    ikon: '🎤',
    nama: 'Olah Vokal & Paduan Suara',
    deskripsi: 'Melatih suara yang sehat dan merdu, baik untuk solo maupun bernyanyi bersama.',
    materi: [
      'Pernapasan diafragma dan pemanasan suara',
      'Artikulasi dan ketepatan nada',
      'Pembagian suara: sopran, alto, tenor, bass',
      'Harmonisasi dan latihan lagu paduan suara'
    ]
  },

  semua: {
    ikon: '🎼',
    nama: 'Semua Divisi',
    deskripsi: 'Tertarik pada semua divisi dan mempelajari seluruh divisi sesuai jadwal.',
    materi: [
      'Mempelajari semua materi divisi sesuai dengan jadwal.'
    ]
  }
};

// ==========================================
// PROFIL PEMBINA DAN KETUA
// ==========================================

const PROFIL = {
  pembina: {
    foto: 'pembina',
    judul: 'Profil Pembina',
    nama: 'Dr. H. Rd. Sahrul Mubarok, S.Pd., Gr., M. Sn., M. Psi. (Aamiin)',
    peran: 'Pembina Ekstrakurikuler Musik',
    bio: 'Seorang manusia biasa yang akan selalu menyayangi semua siswanya dan mencoba berusaha membina ekstrakurikuler musik. Mendampingi para siswa berlatih, menyiapkan penampilan, dan menjaga kegiatan ekskul tetap tertib dan menyenangkan.'
  },

  ketua: {
    foto: 'ketua',
    judul: 'Profil Ketua',
    nama: 'Faris Al Fathir',
    peran: 'Ketua Ekskul Musik · XI RPL',
    bio: 'Siswa kelas XI RPL yang memimpin kegiatan ekskul musik: mengoordinasi jadwal latihan dan menjadi penghubung antara anggota dan pembina.'
  }
};

let anggota = [];
let divAktif = 'modern';
let feed = [];
let fotoPost = null;

// ==========================================
// SESI LOGIN
// ==========================================

const SESI_KEY = 'ekskul_sesi';

let sesi = (() => {
  try {
    return JSON.parse(sessionStorage.getItem(SESI_KEY));
  } catch {
    return null;
  }
})();

function simpanSesi(s) {
  sesi = s;

  try {
    s
      ? sessionStorage.setItem(SESI_KEY, JSON.stringify(s))
      : sessionStorage.removeItem(SESI_KEY);
  } catch {}
}

// ==========================================
// UTILITAS
// ==========================================

function fallbackImg(img, base, onFail) {
  const src = ['png', 'jpg', 'jpeg', 'webp']
    .map(e => `${base}.${e}`);

  let i = 0;

  img.onerror = () => {
    if (++i < src.length) {
      img.src = src[i];
    } else {
      img.hidden = true;
      onFail?.();
    }
  };

  img.src = src[0];
}

function note(el, text, type = '') {
  el.textContent = text;
  el.className = 'note ' + type;
}

const row = (t, n) =>
  `<tr><td colspan="${n}" class="center">${esc(t)}</td></tr>`;

const errText = e =>
  e.message === 'CONFIG'
    ? 'SCRIPT_URL belum diisi di config.js.'
    : 'Gagal terhubung ke server. Periksa URL Web App dan koneksi internet.';

// ==========================================
// KONEKSI API
// ==========================================

async function api(action, data) {
  if (typeof SCRIPT_URL === 'undefined' || !SCRIPT_URL) {
    throw new Error('CONFIG');
  }

  const token = sesi?.token || '';

  const res = data
    ? await fetch(SCRIPT_URL, {
        method: 'POST',
        body: new URLSearchParams({
          action,
          token,
          ...data
        })
      })
    : await fetch(
        `${SCRIPT_URL}?action=${action}&token=${encodeURIComponent(token)}`
      );

  return res.json();
}

async function kirim(form, btn, msgEl, action, data, onOk) {
  const label = btn.textContent;

  note(msgEl, '');

  btn.disabled = true;
  btn.textContent = 'Memproses…';

  try {
    const r = await api(action, data);

    if (r.expired) {
      sesiHabis();
      return;
    }

    const ok = r.result === 'success';

    note(
      msgEl,
      r.message || (ok ? 'Berhasil.' : 'Gagal.'),
      ok ? 'ok' : 'err'
    );

    if (ok) {
      form?.reset();
      await onOk?.(r);
    }

  } catch (e) {
    note(msgEl, errText(e), 'err');

  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

// ==========================================
// RESIZE FOTO
// ==========================================

function resize(file, max, q = .82) {
  return new Promise((res, rej) => {
    const img = new Image();
    const u = URL.createObjectURL(file);

    img.onload = () => {
      const s = Math.min(
        1,
        max / Math.max(img.width, img.height)
      );

      const c = document.createElement('canvas');

      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);

      c.getContext('2d').drawImage(
        img,
        0,
        0,
        c.width,
        c.height
      );

      URL.revokeObjectURL(u);

      res(c.toDataURL('image/jpeg', q));
    };

    img.onerror = () => rej(new Error('IMG'));

    img.src = u;
  });
}

const avatarHTML = (url, nama) => url
  ? `<img class="av" src="${esc(url)}" alt="" referrerpolicy="no-referrer">`
  : `<span class="av">${esc((nama || '?')[0])}</span>`;

// ==========================================
// JAM DAN TANGGAL
// ==========================================

const tf = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

const df = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'full'
});

function tick() {
  const n = new Date();

  $('#time').textContent = tf.format(n).replace(/\./g, ':');
  $('#date').textContent = df.format(n);
}

// ==========================================
// NAVIGASI TAB
// ==========================================

function switchTab(id) {
  $$('.pane').forEach(p =>
    p.classList.toggle('active', p.id === id)
  );

  $$('[data-tab]').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === id)
  );

  if (id === 'akun') {
    renderAuth();

    if (sesi?.role === 'admin') {
      loadAdmin();
    } else if (sesi) {
      loadMe();
    }

  } else if (id === 'feed') {
    loadFeed();

  } else {
    loadAnggota();
  }
}

// ==========================================
// LOGIN DAN PROFIL
// ==========================================

function renderAuth() {
  const masuk = !!sesi;
  const admin = masuk && sesi.role === 'admin';

  $('#auth-card').hidden = masuk;
  $('#profil-area').hidden = !masuk || admin;
  $('#admin-area').hidden = !admin;

  $('#tab-akun').textContent =
    admin ? 'Admin' : masuk ? 'Profil' : 'Masuk';
}

function sesiHabis() {
  simpanSesi(null);
  renderAuth();
  switchTab('akun');

  note(
    $('#login-msg'),
    'Sesi berakhir. Silakan masuk lagi.',
    'err'
  );
}

function keluar() {
  api('logout', {}).catch(() => {});

  simpanSesi(null);
  renderAuth();

  note($('#login-msg'), '');
}

function setAvatar(el, url, nama) {
  el.innerHTML = '';
  el.classList.toggle('noimg', !url);
  el.dataset.initial = (nama || '?')[0];

  if (url) {
    const i = new Image();

    i.alt = 'Foto profil';
    i.referrerPolicy = 'no-referrer';
    i.onerror = () => el.classList.add('noimg');
    i.src = url;

    el.append(i);
  }
}

// ==========================================
// LOAD PROFIL SISWA
// ==========================================

async function loadMe() {
  try {
    const r = await api('read_profil');

    if (r.expired) {
      return sesiHabis();
    }

    if (r.result !== 'success') {
      $('#me-posts').innerHTML =
        `<p class="muted center" style="grid-column:1/-1">${esc(r.message || 'Gagal memuat profil.')}</p>`;

      return;
    }

    const p = r.profil;

    $('#me-nama').textContent = p.nama;
    $('#me-info').textContent =
      [p.kelas, p.divisi].filter(Boolean).join(' · ');

    $('#me-bio').value = p.bio || '';

    setAvatar($('#me-avatar'), p.avatar, p.nama);

    const fl = $('#me-folder');

    fl.hidden = !sesi?.folder;

    fl.textContent = sesi?.folder
      ? 'Database Drive: ' + sesi.folder
      : '';

    $('#me-posts').innerHTML = r.posts.length
      ? r.posts.map(x => `
          <div class="thumb">
            <img src="${esc(x.foto)}" alt="${esc(x.caption)}"
              loading="lazy" referrerpolicy="no-referrer">
            <b>♥ ${x.likes}</b>
            <button type="button" data-del="${esc(x.id)}"
              aria-label="Hapus">&times;</button>
          </div>
        `).join('')
      : '<p class="muted center" style="grid-column:1/-1">Belum ada dokumentasi. Bagikan kegiatan pertamamu!</p>';

  } catch (e) {
    $('#me-posts').innerHTML =
      `<p class="muted center">${esc(errText(e))}</p>`;
  }
}

// ==========================================
// DASHBOARD ADMIN
// ==========================================

async function loadAdmin() {
  const body = $('#admin-anggota-body');

  body.innerHTML = row('Memuat data…', 6);

  try {
    const r = await api('admin_list_anggota');

    if (r.expired) {
      return sesiHabis();
    }

    if (r.result !== 'success') {
      body.innerHTML = row(
        r.message || 'Gagal memuat data anggota.',
        6
      );

      return;
    }

    const list = r.data || r.anggota || [];

    if (!list.length) {
      body.innerHTML = row(
        'Belum ada pendaftaran anggota.',
        6
      );

      return;
    }

    body.innerHTML = list.map(a => {
      const nama = a.nama || a.nama_lengkap || '-';
      const username = a.username || '';
      const kelas = a.kelas || '-';
      const divisi = a.divisi || '-';

      const status =
        a.status ||
        a.status_verifikasi ||
        a.statusVerifikasi ||
        'Menunggu Verifikasi';

      const safeUser = esc(username);
      const rowNumber = Number(a.row);

      return `
        <tr>
          <td>${esc(nama)}</td>
          <td>${safeUser}</td>
          <td>${esc(kelas)}</td>
          <td>${esc(divisi)}</td>
          <td>${esc(status)}</td>
          <td>
            <button type="button" class="btn"
              data-admin-status="Disetujui"
              data-row="${rowNumber}"
              data-user="${safeUser}">Setujui</button>

            <button type="button" class="btn"
              data-admin-status="Ditolak"
              data-row="${rowNumber}"
              data-user="${safeUser}">Tolak</button>

            <button type="button" class="btn"
              data-admin-delete="${rowNumber}"
              data-user="${safeUser}">Hapus</button>
          </td>
        </tr>
      `;
    }).join('');

  } catch (e) {
    body.innerHTML = row(errText(e), 6);
  }
}

// ==========================================
// VERIFIKASI ADMIN
// ==========================================

async function ubahStatusAdmin(baris, username, status) {
  if (!baris) return;

  const msg = $('#admin-msg');

  note(msg, 'Memproses perubahan status…');

  try {
    const r = await api('admin_verifikasi', {
      row: baris,
      username,
      status
    });

    if (r.expired) {
      return sesiHabis();
    }

    note(
      msg,
      r.message || (
        r.result === 'success'
          ? 'Status berhasil diperbarui.'
          : 'Gagal memperbarui status.'
      ),
      r.result === 'success' ? 'ok' : 'err'
    );

    if (r.result === 'success') {
      await loadAdmin();
    }

  } catch (e) {
    note(msg, errText(e), 'err');
  }
}

async function hapusAnggotaAdmin(baris, username) {
  if (
    !baris ||
    !confirm(
      'Hapus anggota ini beserta semua dokumentasinya? Tindakan ini tidak bisa dibatalkan.'
    )
  ) {
    return;
  }

  const msg = $('#admin-msg');

  note(msg, 'Menghapus anggota…');

  try {
    const r = await api('admin_hapus_anggota', {
      row: baris,
      username
    });

    if (r.expired) {
      return sesiHabis();
    }

    note(
      msg,
      r.message || (
        r.result === 'success'
          ? 'Anggota berhasil dihapus.'
          : 'Gagal menghapus anggota.'
      ),
      r.result === 'success' ? 'ok' : 'err'
    );

    if (r.result === 'success') {
      await loadAdmin();
    }

  } catch (e) {
    note(msg, errText(e), 'err');
  }
}

// ==========================================
// KEGIATAN / REELS
// ==========================================

async function loadFeed() {
  const box = $('#reels');

  try {
    const r = await api('read_feed');

    feed = r.data || [];

    renderFeed();

  } catch (e) {
    box.innerHTML =
      `<div class="reel-empty">${esc(errText(e))}</div>`;
  }
}

function renderFeed() {
  $('#reels').innerHTML = feed.length
    ? feed.map(p => `
        <article class="reel" data-id="${esc(p.id)}">

          <img src="${esc(p.foto)}"
            alt="Dokumentasi ${esc(p.nama)}"
            loading="lazy"
            referrerpolicy="no-referrer">

          <div class="shade"></div>

          <div class="meta">
            <div class="who2">
              ${avatarHTML(p.avatar, p.nama)}

              <div>
                <b>${esc(p.nama)}</b>
                <small>${esc(p.divisi)} · ${esc(p.waktu)}</small>
              </div>
            </div>

            <p class="cap">${esc(p.caption)}</p>
          </div>

          <div class="side">
            <button type="button"
              class="like ${p.liked ? 'on' : ''}"
              data-like="${esc(p.id)}"
              aria-label="Suka"
              aria-pressed="${p.liked}">
              <span>♥</span>
              <b>${p.likes}</b>
            </button>
          </div>

        </article>
      `).join('')
    : '<div class="reel-empty">Belum ada kegiatan.<br>Masuk lalu bagikan dokumentasi pertamamu di menu Profil.</div>';
}

async function toggleLike(id) {
  if (!sesi) {
    switchTab('akun');

    note(
      $('#login-msg'),
      'Masuk dulu untuk menyukai kegiatan.',
      'err'
    );

    return;
  }

  if (sesi.role === 'admin') return;

  const p = feed.find(x => x.id === id);

  if (!p) return;

  const btn = $(`[data-like="${CSS.escape(id)}"]`);

  p.liked = !p.liked;
  p.likes += p.liked ? 1 : -1;

  btn.classList.toggle('on', p.liked);
  btn.lastElementChild.textContent = p.likes;

  try {
    const r = await api('toggle_like', { id });

    if (r.expired) {
      return sesiHabis();
    }

    if (r.result === 'success') {
      p.liked = r.liked;
      p.likes = r.likes;

      btn.classList.toggle('on', p.liked);
      btn.lastElementChild.textContent = p.likes;
    }

  } catch {}
}

function scrollReel(dir) {
  const r = $('#reels');

  r.scrollBy({
    top: dir * r.clientHeight,
    behavior: 'smooth'
  });
}

// ==========================================
// DATA ANGGOTA
// ==========================================

async function loadAnggota() {
  try {
    anggota = (await api('read_anggota')).data;

    renderAnggota();

  } catch (e) {
    $('#anggota-body').innerHTML = row(errText(e), 5);
  }
}

function renderAnggota() {
  const q = $('#search').value.toLowerCase();

  const list = anggota.filter(a =>
    [a.nama, a.kelas, a.divisi, a.jabatan]
      .join(' ')
      .toLowerCase()
      .includes(q)
  );

  $('#anggota-body').innerHTML = list.length
    ? list.map((a, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><b>${esc(a.nama)}</b></td>
          <td>${esc(a.kelas)}</td>
          <td>${esc(a.divisi)}</td>
          <td>${esc(a.jabatan)}</td>
        </tr>
      `).join('')
    : row(
        anggota.length
          ? 'Tidak ada anggota yang cocok.'
          : 'Belum ada anggota terdaftar.',
        5
      );

  $('#total').textContent = anggota.length;

  const ketua = anggota.find(a => /ketua/i.test(a.jabatan));

  $('#ketua').textContent = ketua ? ketua.nama : '-';
}

// ==========================================
// DETAIL DIVISI
// ==========================================

function showDivisi(k) {
  divAktif = k;

  $$('#divs .btn').forEach(b =>
    b.classList.toggle('active', b.dataset.k === k)
  );

  const d = DIVISI[k];
  const box = $('#desc');

  if (!d) return;

  box.innerHTML = `
    <h3>${d.ikon} ${esc(d.nama)}</h3>
    <p>${esc(d.deskripsi)}</p>
    <ul>
      ${d.materi.map(m => `<li>${esc(m)}</li>`).join('')}
    </ul>
  `;

  box.classList.remove('fade');
  void box.offsetWidth;
  box.classList.add('fade');
}

// ==========================================
// MODAL
// ==========================================

const openReg = () => {
  $('#modal').hidden = false;
  $('#reg-nama').focus();
};

const closeReg = () => {
  $('#modal').hidden = true;
};

const closeProfil = () => {
  $('#modal-profil').hidden = true;
};

function showProfil(k) {
  const p = PROFIL[k];
  const av = $('#profil-foto');

  av.innerHTML = '';
  av.classList.remove('noimg');
  av.dataset.initial = p.nama[0];

  const img = new Image();

  img.alt = 'Foto ' + p.nama;

  av.append(img);

  fallbackImg(
    img,
    p.foto,
    () => av.classList.add('noimg')
  );

  $('#profil-judul').textContent = p.judul;
  $('#profil-nama').textContent = p.nama;
  $('#profil-peran').textContent = p.peran;
  $('#profil-bio').textContent = p.bio;

  $('#modal-profil').hidden = false;
}

// ==========================================
// INISIALISASI WEBSITE
// ==========================================

document.addEventListener('DOMContentLoaded', () => {

  // Jam dan tanggal
  tick();
  setInterval(tick, 1000);

  $('#year').textContent = new Date().getFullYear();

  fallbackImg($('#logo'), 'logo');

  // ========================================
  // TOMBOL DIVISI
  // ========================================

  $('#divs').innerHTML = Object.entries(DIVISI)
    .map(([k, d]) => `
      <button class="btn" data-k="${k}">
        <i>${d.ikon}</i>${esc(d.nama)}
      </button>
    `)
    .join('');

  // ========================================
  // DROPDOWN PENDAFTARAN
  // ========================================

  const selectDivisi = $('#reg-divisi');

  selectDivisi.innerHTML =
    '<option value="">Pilih divisi</option>' +
    Object.values(DIVISI)
      .map(d => `
        <option value="${esc(d.nama)}">
          ${esc(d.nama)}
        </option>
      `)
      .join('');

  // Klik tombol divisi
  $('#divs').addEventListener('click', e => {
    const b = e.target.closest('[data-k]');

    if (b) {
      showDivisi(b.dataset.k);
    }
  });

  // ========================================
  // TOMBOL DETAIL DIVISI
  // ========================================

  $('#clef').addEventListener('click', e => {
    const box = $('#divisi');
    const buka = box.hidden;

    box.hidden = !buka;

    e.currentTarget.setAttribute('aria-expanded', buka);

    if (buka) {
      showDivisi(divAktif);
    }
  });

  // ========================================
  // NAVIGASI
  // ========================================

  $$('[data-tab]').forEach(b =>
    b.addEventListener('click', () =>
      switchTab(b.dataset.tab)
    )
  );

  $('#search').addEventListener('input', renderAnggota);

  // ========================================
  // PENDAFTARAN
  // ========================================

  $('#open-reg').addEventListener('click', openReg);
  $('#close-reg').addEventListener('click', closeReg);

  $('#modal').addEventListener('click', e => {
    if (e.target.id === 'modal') {
      closeReg();
    }
  });

  // ========================================
  // PROFIL PEMBINA DAN KETUA
  // ========================================

  $$('[data-profil]').forEach(b =>
    b.addEventListener('click', () =>
      showProfil(b.dataset.profil)
    )
  );

  $('#close-profil').addEventListener('click', closeProfil);

  $('#modal-profil').addEventListener('click', e => {
    if (e.target.id === 'modal-profil') {
      closeProfil();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeReg();
      closeProfil();
    }
  });

  // ========================================
  // REELS
  // ========================================

  $('#reels').addEventListener('click', e => {
    const b = e.target.closest('[data-like]');

    if (b) {
      toggleLike(b.dataset.like);
    }
  });

  $('#reels').addEventListener('dblclick', e => {
    const r = e.target.closest('.reel');

    if (!r || e.target.closest('.meta,.side')) return;

    const p = feed.find(x => x.id === r.dataset.id);

    if (!sesi || sesi.role === 'admin') return;

    if (p && !p.liked) {
      toggleLike(p.id);
    }

    const h = document.createElement('div');

    h.className = 'burst';
    h.textContent = '♥';

    r.append(h);

    setTimeout(() => h.remove(), 800);
  });

  $('#reel-up').addEventListener('click', () => scrollReel(-1));
  $('#reel-down').addEventListener('click', () => scrollReel(1));

  $('#reels').addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      scrollReel(1);
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      scrollReel(-1);
    }
  });

  // ========================================
  // LOGIN DAN LOGOUT
  // ========================================

  $('#to-akun').addEventListener('click', openReg);
  $('#btn-logout').addEventListener('click', keluar);

  $('#btn-admin-logout').addEventListener('click', keluar);
  $('#btn-admin-refresh').addEventListener('click', loadAdmin);

  // ========================================
  // ADMIN: VERIFIKASI DAN HAPUS
  // ========================================

  $('#admin-anggota-body').addEventListener('click', e => {

    const statusBtn = e.target.closest('[data-admin-status]');

    if (statusBtn) {
      ubahStatusAdmin(
        Number(statusBtn.dataset.row),
        statusBtn.dataset.user || '',
        statusBtn.dataset.adminStatus
      );

      return;
    }

    const deleteBtn = e.target.closest('[data-admin-delete]');

    if (deleteBtn) {
      hapusAnggotaAdmin(
        Number(deleteBtn.dataset.adminDelete),
        deleteBtn.dataset.user || ''
      );
    }
  });

  // ========================================
  // FORM LOGIN
  // ========================================

  $('#login-form').addEventListener('submit', e => {
    e.preventDefault();

    kirim(
      e.target,
      $('#btn-login'),
      $('#login-msg'),
      'login',
      {
        username: $('#login-user').value.trim(),
        password: $('#login-pass').value
      },
      r => {
        simpanSesi({
          token: r.token,
          nama: r.nama,
          kelas: r.kelas,
          role: r.role || 'anggota',
          folder: r.folder?.nama || ''
        });

        note($('#login-msg'), '');

        switchTab('akun');
      }
    );
  });

  // ========================================
  // EDIT BIO
  // ========================================

  $('#bio-form').addEventListener('submit', e => {
    e.preventDefault();

    kirim(
      null,
      $('#btn-bio'),
      $('#bio-msg'),
      'update_profil',
      {
        bio: $('#me-bio').value
      }
    );
  });

  // ========================================
  // GANTI FOTO PROFIL
  // ========================================

  $('#me-foto-in').addEventListener('change', async e => {
    const f = e.target.files[0];

    e.target.value = '';

    if (!f) return;

    note($('#bio-msg'), 'Mengunggah foto profil…');

    try {
      const foto = await resize(f, 500);

      const r = await api('update_profil', { foto });

      if (r.expired) {
        return sesiHabis();
      }

      note(
        $('#bio-msg'),
        r.message || 'Gagal.',
        r.result === 'success' ? 'ok' : 'err'
      );

      if (r.result === 'success') {
        loadMe();
      }

    } catch (err) {
      note(
        $('#bio-msg'),
        err.message === 'IMG'
          ? 'File bukan gambar yang valid.'
          : errText(err),
        'err'
      );
    }
  });

  // ========================================
  // PILIH FOTO DOKUMENTASI
  // ========================================

  $('#post-foto').addEventListener('change', async e => {
    const f = e.target.files[0];

    if (!f) return;

    try {
      fotoPost = await resize(f, 1080);

      const pv = $('#post-preview');

      pv.src = fotoPost;
      pv.hidden = false;

      $('#drop-txt').hidden = true;

    } catch {
      fotoPost = null;

      note(
        $('#post-msg'),
        'File bukan gambar yang valid.',
        'err'
      );
    }
  });

  // ========================================
  // BAGIKAN DOKUMENTASI
  // ========================================

  $('#post-form').addEventListener('submit', e => {
    e.preventDefault();

    if (!fotoPost) {
      return note(
        $('#post-msg'),
        'Pilih foto kegiatan dulu.',
        'err'
      );
    }

    kirim(
      e.target,
      $('#btn-post'),
      $('#post-msg'),
      'insert_post',
      {
        foto: fotoPost,
        caption: $('#post-cap').value
      },
      () => {
        fotoPost = null;

        $('#post-preview').hidden = true;
        $('#drop-txt').hidden = false;

        loadMe();
      }
    );
  });

  // ========================================
  // HAPUS DOKUMENTASI SENDIRI
  // ========================================

  $('#me-posts').addEventListener('click', async e => {
    const b = e.target.closest('[data-del]');

    if (
      !b ||
      !confirm('Hapus dokumentasi ini?')
    ) {
      return;
    }

    try {
      const r = await api('delete_post', {
        id: b.dataset.del
      });

      if (r.expired) {
        return sesiHabis();
      }

      loadMe();

    } catch {}
  });

  // ========================================
  // FORM PENDAFTARAN ANGGOTA
  // ========================================

  $('#register-form').addEventListener('submit', e => {
    e.preventDefault();

    const user = $('#reg-user')
      .value
      .trim()
      .toLowerCase();

    kirim(
      e.target,
      $('#btn-reg'),
      $('#reg-msg'),
      'insert_pendaftaran',
      {
        nama: $('#reg-nama').value,
        kelas: $('#reg-kelas').value,
        jurusan: $('#reg-jurusan').value,
        divisi: $('#reg-divisi').value,
        username: user,
        password: $('#reg-pass').value,
        kode: $('#reg-kode').value
      },

      async () => {
        await loadAnggota();

        // Setelah daftar, arahkan ke form login
        setTimeout(() => {
          closeReg();

          note($('#reg-msg'), '');

          switchTab('akun');

          $('#login-user').value = user;
          $('#login-pass').focus();

          note(
            $('#login-msg'),
            'Pendaftaran berhasil. Silakan masuk dengan username dan password kamu.',
            'ok'
          );

        }, 2500);
      }
    );
  });

  // ========================================
  // LOAD AWAL
  // ========================================

  renderAuth();

  loadFeed();
  loadAnggota();

});
