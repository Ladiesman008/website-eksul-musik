// Code.gs - Backend Ekstrakurikuler Musik (Google Apps Script)

// GANTI kode ini, lalu bagikan ke siswa. Boleh lebih dari satu kode.
// Kode dipakai saat siswa membuat akun dan saat mendaftar sebagai anggota.
const KODE_VERIFIKASI = ['MUSIK2026'];
const TZ = 'Asia/Jakarta';
const DIVISI = ['Musik Modern', 'Musik Tradisional (Angklung & Gamelan)', 'Olah Vokal & Paduan Suara'];
const STATUS = ['Hadir', 'Sakit', 'Izin', 'Alpa'];
const SESI_DETIK = 6 * 60 * 60; // lama login (maksimum CacheService = 6 jam)
const MAX_GAGAL = 5;            // salah password berturut-turut sebelum diblokir sementara
const KUNCI_DETIK = 10 * 60;    // lama blokir (10 menit)
const HEADERS = {
  Absensi: ['Waktu', 'Nama Lengkap', 'Kelas', 'Status'],
  Anggota: ['Waktu Daftar', 'Nama Lengkap', 'Kelas', 'Jurusan', 'Divisi', 'Jabatan'],
  Akun: ['Waktu Daftar', 'Username', 'Salt', 'Hash Password', 'Nama Lengkap', 'Kelas']
};

const json_ = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
const fail_ = m => json_({ result: 'error', message: m });
const expired_ = () => json_({ result: 'error', expired: true, message: 'Sesi berakhir. Silakan masuk lagi.' });
const fmt_ = (d, f) => Utilities.formatDate(d, TZ, f);
// Rapikan input & cegah formula injection di Sheets
const clean_ = v => { v = String(v || '').trim().replace(/\s+/g, ' ').slice(0, 80); return /^[=+\-@]/.test(v) ? "'" + v : v; };
const kodeValid_ = k => KODE_VERIFIKASI.map(x => x.toUpperCase()).includes(String(k || '').trim().toUpperCase());
// Password disimpan sebagai hash SHA-256 + salt, bukan teks asli
const hash_ = (pw, salt) => 'sha$' + Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + pw, Utilities.Charset.UTF_8)
  .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
const cache_ = () => CacheService.getScriptCache();
function sesi_(token) {
  const v = token ? cache_().get('s_' + token) : null;
  return v ? JSON.parse(v) : null;
}

function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(HEADERS[name]);
    sh.getRange(1, 1, 1, HEADERS[name].length).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('dd/MM/yyyy HH:mm:ss');
  }
  return sh;
}

function rows_(sh) {
  const v = sh.getDataRange().getValues();
  v.shift();
  return v;
}

// ---------- Akun siswa ----------
// Akun dibuat bersamaan dengan pendaftaran anggota (lihat insertPendaftaran_).
function login_(p) {
  const user = String(p.username || '').trim().toLowerCase(), pw = String(p.password || '');
  if (!user || !pw) return fail_('Username dan password wajib diisi.');
  const c = cache_(), kGagal = 'f_' + user, gagal = Number(c.get(kGagal) || 0);
  if (gagal >= MAX_GAGAL) return fail_('Terlalu banyak percobaan gagal. Coba lagi dalam 10 menit.');
  const r = rows_(sheet_('Akun')).find(x => String(x[1]).toLowerCase() === user);
  if (!r || hash_(pw, String(r[2])) !== String(r[3])) {
    c.put(kGagal, String(gagal + 1), KUNCI_DETIK);
    return fail_('Username atau password salah.');
  }
  c.remove(kGagal);
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  c.put('s_' + token, JSON.stringify({ u: user, nama: r[4], kelas: r[5] }), SESI_DETIK);
  return json_({ result: 'success', message: 'Berhasil masuk.', token, nama: r[4], kelas: r[5] });
}

function logout_(p) {
  if (p.token) cache_().remove('s_' + p.token);
  return json_({ result: 'success' });
}

// ---------- Absensi & anggota ----------
function insertAbsensi_(p) {
  const s = sesi_(p.token);
  if (!s) return expired_();
  if (!STATUS.includes(p.status)) return fail_('Status tidak valid.');
  // Nama & kelas diambil dari akun yang login, bukan dari input siswa
  const nama = clean_(s.nama), kelas = clean_(s.kelas);
  const sh = sheet_('Absensi'), today = fmt_(new Date(), 'yyyy-MM-dd');
  const sudah = rows_(sh).some(r => r[0] instanceof Date && fmt_(r[0], 'yyyy-MM-dd') === today &&
    String(r[1]).toLowerCase() === nama.toLowerCase());
  if (sudah) return fail_('Kamu sudah absen hari ini.');
  sh.appendRow([new Date(), nama, kelas, p.status]);
  return json_({ result: 'success', message: 'Absensi berhasil disimpan.' });
}

function insertPendaftaran_(p) {
  const nama = clean_(p.nama), kelas = clean_(p.kelas);
  if (!nama || !kelas) return fail_('Nama dan kelas wajib diisi.');
  if (!kodeValid_(p.kode)) return fail_('Kode verifikasi salah.');
  if (!DIVISI.includes(p.divisi)) return fail_('Pilih divisi yang tersedia.');
  const user = String(p.username || '').trim().toLowerCase(), pw = String(p.password || '');
  if (!/^[a-z][a-z0-9._]{3,19}$/.test(user)) return fail_('Username 4–20 karakter, diawali huruf, hanya huruf kecil, angka, titik, atau garis bawah.');
  if (pw.length < 6 || pw.length > 50) return fail_('Password harus 6–50 karakter.');
  const shA = sheet_('Anggota'), shK = sheet_('Akun'), akun = rows_(shK);
  const ada = rows_(shA).some(r => String(r[1]).toLowerCase() === nama.toLowerCase() &&
    String(r[2]).toLowerCase() === kelas.toLowerCase());
  if (ada) return fail_('Kamu sudah terdaftar sebagai anggota. Silakan masuk memakai username kamu.');
  if (akun.some(r => String(r[1]).toLowerCase() === user)) return fail_('Username sudah dipakai.');
  if (akun.some(r => String(r[4]).toLowerCase() === nama.toLowerCase() && String(r[5]).toLowerCase() === kelas.toLowerCase()))
    return fail_('Kamu sudah punya akun. Silakan masuk.');
  // Semua pengecekan lolos: simpan data anggota dan akun sekaligus
  const salt = 's$' + Utilities.getUuid();
  shA.appendRow([new Date(), nama, kelas, clean_(p.jurusan), p.divisi, 'Anggota Aktif']);
  shK.appendRow([new Date(), user, salt, hash_(pw, salt), nama, kelas]);
  return json_({ result: 'success', message: 'Pendaftaran berhasil. Selamat bergabung! Silakan masuk memakai username dan password kamu.' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const p = e.parameter;
    if (p.action === 'login') return login_(p);
    if (p.action === 'logout') return logout_(p);
    if (p.action === 'insert_absensi') return insertAbsensi_(p);
    if (p.action === 'insert_pendaftaran') return insertPendaftaran_(p);
    return fail_('Aksi tidak dikenal.');
  } catch (err) {
    return fail_('Kesalahan server: ' + err.message);
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  const a = e.parameter.action;
  if (a === 'read_absensi') {
    if (!sesi_(e.parameter.token)) return expired_(); // daftar absensi hanya untuk yang sudah login
    const today = fmt_(new Date(), 'yyyy-MM-dd');
    const data = rows_(sheet_('Absensi'))
      .filter(r => r[0] instanceof Date && fmt_(r[0], 'yyyy-MM-dd') === today)
      .map(r => ({ waktu: fmt_(r[0], 'HH:mm'), nama: r[1], kelas: r[2], status: r[3] }))
      .reverse();
    return json_({ data });
  }
  if (a === 'read_anggota') {
    const data = rows_(sheet_('Anggota')).map(r => ({ nama: r[1], kelas: r[2], jurusan: r[3], divisi: r[4], jabatan: r[5] }));
    return json_({ data });
  }
  return ContentService.createTextOutput('Backend Ekstrakurikuler Musik aktif.');
}

// Jalankan sekali dari editor untuk membuat sheet & data awal ketua.
function setupAll() {
  sheet_('Absensi');
  sheet_('Akun');
  const sh = sheet_('Anggota');
  if (sh.getLastRow() < 2) sh.appendRow([new Date(), 'Faris Al Fathir', 'XI RPL', 'RPL', '-', 'Ketua Ekskul']);
}
