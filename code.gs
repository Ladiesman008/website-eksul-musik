// ==========================================
// BACKEND EKSTRAKURIKULER MUSIK
// Google Apps Script
// ==========================================

const KODE_VERIFIKASI = ['MUSIK2026'];
const TZ = 'Asia/Jakarta';

// >>> ISI dengan ID folder Google Drive kamu <<<
// Contoh link: https://drive.google.com/drive/folders/1AbCdEfGh...  -> ID = 1AbCdEfGh...
const FOLDER_ID = 'https://drive.google.com/drive/u/3/folders/1n3N7KogVlb9q-r_vp3CCbfST8yM9SGz8';

const SESI_DETIK = 21600; // login berlaku 6 jam

const DIVISI = [
  'Musik Modern',
  'Musik Tradisional (Angklung & Gamelan)',
  'Olah Vokal & Paduan Suara'
];

// Kolom Anggota: 0 Waktu, 1 Nama, 2 Kelas, 3 Jurusan, 4 Divisi, 5 Jabatan,
// 6 Status, 7 Username, 8 Hash, 9 Salt, 10 Foto Profil (ID Drive), 11 Bio
const HEADERS = {
  Anggota: ['Waktu Daftar', 'Nama Lengkap', 'Kelas', 'Jurusan', 'Divisi', 'Jabatan',
            'Status Verifikasi', 'Username', 'Password Hash', 'Salt', 'Foto Profil', 'Bio'],
  Postingan: ['ID', 'Waktu', 'Username', 'Caption', 'File ID'],
  Likes: ['ID Post', 'Username']
};

// ---------- Util ----------
const json_ = o => ContentService.createTextOutput(JSON.stringify(o))
  .setMimeType(ContentService.MimeType.JSON);
const fail_ = (m, extra) => json_(Object.assign({ result: 'error', message: m }, extra));
const ok_ = (o) => json_(Object.assign({ result: 'success' }, o));

const clean_ = v => {
  v = String(v || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
};
const caption_ = v => {
  v = String(v || '').trim().slice(0, 300);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
};
const fmt_ = d => Utilities.formatDate(new Date(d), TZ, 'dd MMM yyyy, HH:mm');
const img_ = id => id ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1080' : '';
const hash_ = (p, s) => Utilities.base64Encode(
  Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s + p));

function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const H = HEADERS[name];
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(H);
    sh.setFrozenRows(1);
  } else if (sh.getLastColumn() < H.length) {
    sh.getRange(1, 1, 1, H.length).setValues([H]); // migrasi kolom baru
  }
  sh.getRange(1, 1, 1, H.length).setFontWeight('bold');
  return sh;
}

function rows_(sh) {
  const data = sh.getDataRange().getValues();
  data.shift();
  return data;
}

// ---------- Sesi ----------
function login_(username) {
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('s_' + token, username, SESI_DETIK);
  return token;
}
const userDari_ = t => t ? CacheService.getScriptCache().get('s_' + t) : null;

function akun_(token) {
  const u = userDari_(token);
  if (!u) return null;
  const sh = sheet_('Anggota');
  const rs = rows_(sh);
  const i = rs.findIndex(r => String(r[7]) === u);
  return i < 0 ? null : { sh, row: i + 2, r: rs[i], u };
}

// ---------- Upload ke Google Drive ----------
function simpanFoto_(dataUrl, nama) {
  const m = String(dataUrl || '').match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
  if (!m) throw new Error('Format foto tidak valid.');
  if (m[2].length > 5000000) throw new Error('Ukuran foto terlalu besar.');
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), 'image/' + m[1], nama);
  const f = DriveApp.getFolderById(FOLDER_ID).createFile(blob);
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return f.getId();
}
function hapusFile_(id) {
  try { if (id) DriveApp.getFileById(id).setTrashed(true); } catch (e) {}
}

// ---------- Feed ----------
function feed_(token, hanyaUser) {
  const me = userDari_(token);
  const ang = {};
  rows_(sheet_('Anggota')).forEach(r => { if (r[7]) ang[String(r[7])] = r; });

  const cnt = {}, mine = {};
  rows_(sheet_('Likes')).forEach(l => {
    cnt[l[0]] = (cnt[l[0]] || 0) + 1;
    if (me && String(l[1]) === me) mine[l[0]] = true;
  });

  return rows_(sheet_('Postingan')).reverse()
    .filter(r => !hanyaUser || String(r[2]) === hanyaUser)
    .slice(0, 60)
    .map(r => {
      const a = ang[String(r[2])] || [];
      return {
        id: r[0], waktu: fmt_(r[1]), username: String(r[2]),
        nama: a[1] || r[2], divisi: a[4] || '', avatar: img_(a[10]),
        caption: r[3], foto: img_(r[4]),
        likes: cnt[r[0]] || 0, liked: !!mine[r[0]]
      };
    });
}

// ==========================================
// GET
// ==========================================
function doGet(e) {
  const p = e?.parameter || {};

  if (p.action === 'read_anggota') {
    const data = rows_(sheet_('Anggota'))
      .filter(r => String(r[6]).trim() === 'Disetujui')
      .map(r => ({ nama: r[1], kelas: r[2], divisi: r[4], jabatan: r[5] }));
    return json_({ data });
  }

  if (p.action === 'read_feed') {
    return ok_({ data: feed_(p.token) });
  }

  if (p.action === 'read_profil') {
    const a = akun_(p.token);
    if (!a) return fail_('Sesi berakhir.', { expired: true });
    return ok_({
      profil: { nama: a.r[1], kelas: a.r[2], divisi: a.r[4], jabatan: a.r[5], avatar: img_(a.r[10]), bio: a.r[11] || '' },
      posts: feed_(p.token, a.u)
    });
  }

  return fail_('Aksi tidak dikenal.');
}

// ==========================================
// POST
// ==========================================
function doPost(e) {
  const p = e?.parameter || {};
  const lock = LockService.getScriptLock();
  let terkunci = false;

  try {
    lock.waitLock(15000);
    terkunci = true;

    switch (p.action) {
      case 'insert_pendaftaran': return daftar_(p);
      case 'login': return masuk_(p);
      case 'logout': CacheService.getScriptCache().remove('s_' + p.token); return ok_({});
      case 'update_profil': return profil_(p);
      case 'insert_post': return posting_(p);
      case 'delete_post': return hapusPost_(p);
      case 'toggle_like': return like_(p);
      default: return fail_('Aksi tidak dikenal.');
    }
  } catch (err) {
    Logger.log(err);
    return fail_(err.message || 'Terjadi kesalahan server. Silakan coba lagi.');
  } finally {
    if (terkunci) lock.releaseLock();
  }
}

function daftar_(p) {
  const nama = clean_(p.nama), kelas = clean_(p.kelas), jurusan = clean_(p.jurusan);
  const divisi = String(p.divisi || '').trim();
  const user = String(p.username || '').trim().toLowerCase();
  const pass = String(p.password || '');
  const kode = String(p.kode || '').trim().toUpperCase();

  if (!nama || !kelas || !jurusan) return fail_('Nama, kelas, dan jurusan wajib diisi.');
  if (!KODE_VERIFIKASI.map(k => k.toUpperCase()).includes(kode)) return fail_('Kode verifikasi salah.');
  if (!DIVISI.includes(divisi)) return fail_('Pilih divisi yang tersedia.');
  if (!/^[a-z0-9_]{4,20}$/.test(user)) return fail_('Username 4–20 karakter: huruf kecil, angka, atau _.');
  if (pass.length < 6) return fail_('Password minimal 6 karakter.');

  const sh = sheet_('Anggota');
  const rs = rows_(sh);
  if (rs.some(r => String(r[1]).trim().toLowerCase() === nama.toLowerCase() &&
                   String(r[2]).trim().toLowerCase() === kelas.toLowerCase()))
    return fail_('Kamu sudah terdaftar sebagai anggota.');
  if (rs.some(r => String(r[7]) === user)) return fail_('Username sudah dipakai.');

  const salt = Utilities.getUuid();
  sh.appendRow([new Date(), nama, kelas, jurusan, divisi, 'Anggota Aktif',
                'Menunggu Verifikasi', user, hash_(pass, salt), salt, '', '']);
  return ok_({ message: 'Pendaftaran berhasil. Selamat bergabung!' });
}

function masuk_(p) {
  const user = String(p.username || '').trim().toLowerCase();
  const rs = rows_(sheet_('Anggota'));
  const r = rs.find(x => String(x[7]) === user);
  if (!r || hash_(String(p.password || ''), String(r[9])) !== r[8])
    return fail_('Username atau password salah.');
  return ok_({ message: 'Berhasil masuk.', token: login_(user), nama: r[1], kelas: r[2] });
}

function profil_(p) {
  const a = akun_(p.token);
  if (!a) return fail_('Sesi berakhir.', { expired: true });
  if (p.bio !== undefined) a.sh.getRange(a.row, 12).setValue(caption_(p.bio).slice(0, 160));
  if (p.foto) {
    const id = simpanFoto_(p.foto, 'profil_' + a.u + '_' + Date.now() + '.jpg');
    hapusFile_(a.r[10]);
    a.sh.getRange(a.row, 11).setValue(id);
  }
  return ok_({ message: 'Profil tersimpan.' });
}

function posting_(p) {
  const a = akun_(p.token);
  if (!a) return fail_('Sesi berakhir.', { expired: true });
  const cap = caption_(p.caption);
  if (!p.foto) return fail_('Pilih foto kegiatan dulu.');
  const fid = simpanFoto_(p.foto, 'kegiatan_' + a.u + '_' + Date.now() + '.jpg');
  sheet_('Postingan').appendRow([Utilities.getUuid(), new Date(), a.u, cap, fid]);
  return ok_({ message: 'Dokumentasi berhasil dibagikan.' });
}

function hapusPost_(p) {
  const a = akun_(p.token);
  if (!a) return fail_('Sesi berakhir.', { expired: true });
  const sh = sheet_('Postingan');
  const i = rows_(sh).findIndex(r => r[0] === p.id && String(r[2]) === a.u);
  if (i < 0) return fail_('Postingan tidak ditemukan.');
  hapusFile_(sh.getRange(i + 2, 5).getValue());
  sh.deleteRow(i + 2);

  const lk = sheet_('Likes'), ls = rows_(lk);
  for (let j = ls.length - 1; j >= 0; j--) if (ls[j][0] === p.id) lk.deleteRow(j + 2);
  return ok_({ message: 'Postingan dihapus.' });
}

function like_(p) {
  const a = akun_(p.token);
  if (!a) return fail_('Sesi berakhir.', { expired: true });
  const lk = sheet_('Likes'), ls = rows_(lk);
  const i = ls.findIndex(l => l[0] === p.id && String(l[1]) === a.u);
  if (i >= 0) lk.deleteRow(i + 2); else lk.appendRow([p.id, a.u]);
  const total = ls.filter(l => l[0] === p.id).length + (i >= 0 ? -1 : 1);
  return ok_({ liked: i < 0, likes: total });
}

// ==========================================
// SETUP AWAL — jalankan sekali dari editor Apps Script
// (juga meminta izin akses Google Drive)
// ==========================================
function setupAll() {
  sheet_('Postingan');
  sheet_('Likes');
  const sh = sheet_('Anggota');
  DriveApp.getFolderById(FOLDER_ID); // memicu izin Drive

  if (sh.getLastRow() < 2) {
    sh.appendRow([new Date(), 'Faris Al Fathir', 'XI RPL', 'RPL', '-', 'Ketua Ekskul', 'Disetujui']);
  }
}
