
// ==========================================
// BACKEND EKSTRAKURIKULER MUSIK
// Google Apps Script
// ==========================================

const KODE_VERIFIKASI = ['MUSIK2026'];
const TZ = 'Asia/Jakarta';

const DIVISI = [
  'Musik Modern',
  'Musik Tradisional (Angklung & Gamelan)',
  'Olah Vokal & Paduan Suara'
];

const STATUS = ['Hadir', 'Sakit', 'Izin', 'Alpa'];

const HEADERS = {
  Absensi: ['Waktu', 'Nama Lengkap', 'Kelas', 'Status'],
  
Anggota: [
  'Waktu Daftar',
  'Nama Lengkap',
  'Kelas',
  'Jurusan',
  'Divisi',
  'Jabatan',
  'Status Verifikasi'
]

};

// Format respons JSON
const json_ = o =>
  ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);

const fail_ = m => json_({
  result: 'error',
  message: m
});

// Membersihkan input
const clean_ = v => {
  v = String(v || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);

  return /^[=+\-@]/.test(v) ? "'" + v : v;
};

// Mengambil atau membuat sheet
function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);

  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(HEADERS[name]);
    sh.getRange(1, 1, 1, HEADERS[name].length)
      .setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:A')
      .setNumberFormat('dd/MM/yyyy HH:mm:ss');
  }

  return sh;
}

// Membaca isi sheet tanpa header
function rows_(sh) {
  const data = sh.getDataRange().getValues();
  data.shift();
  return data;
}

// ==========================================
// POST: PENDAFTARAN ANGGOTA
// ==========================================

function doPost(e) {
  const p = e?.parameter || {};

  // Absensi publik ditolak
  if (p.action === 'insert_absensi') {
    return fail_('Akses absensi hanya tersedia untuk admin.');
  }

  // Hanya menerima pendaftaran
  if (p.action !== 'insert_pendaftaran') {
    return fail_('Aksi tidak dikenal.');
  }

  const nama = clean_(p.nama);
  const kelas = clean_(p.kelas);
  const jurusan = clean_(p.jurusan);
  const divisi = String(p.divisi || '').trim();
  const kode = String(p.kode || '').trim().toUpperCase();

  // Validasi data
  if (!nama || !kelas || !jurusan) {
    return fail_('Nama, kelas, dan jurusan wajib diisi.');
  }

  if (!KODE_VERIFIKASI.map(k => k.toUpperCase()).includes(kode)) {
    return fail_('Kode verifikasi salah.');
  }

  if (!DIVISI.includes(divisi)) {
    return fail_('Pilih divisi yang tersedia.');
  }

  const lock = LockService.getScriptLock();
  let terkunci = false;

  try {
    lock.waitLock(10000);
    terkunci = true;

    const sh = sheet_('Anggota');

    // Cek anggota ganda
    const ada = rows_(sh).some(r =>
      String(r[1]).trim().toLowerCase() === nama.toLowerCase() &&
      String(r[2]).trim().toLowerCase() === kelas.toLowerCase()
    );

    if (ada) {
      return fail_('Kamu sudah terdaftar sebagai anggota.');
    }

    // Simpan pendaftaran
    
sh.appendRow([
  new Date(),
  nama,
  kelas,
  jurusan,
  divisi,
  'Anggota Aktif',
  'Menunggu Verifikasi'
]);


    return json_({
      result: 'success',
      message: 'Pendaftaran berhasil. Selamat bergabung!'
    });

  } catch (err) {
    Logger.log(err);
    return fail_('Terjadi kesalahan server. Silakan coba lagi.');

  } finally {
    if (terkunci) {
      lock.releaseLock();
    }
  }
}

// ==========================================
// GET: DATA PUBLIK ANGGOTA
// ==========================================



function doGet(e) {
  const action = e?.parameter?.action;

  if (action === 'read_anggota') {
    const data = rows_(sheet_('Anggota'))
      .filter(r => String(r[6]).trim() === 'Disetujui')
      .map(r => ({
        nama: r[1],
        divisi: r[4],
        jabatan: r[5]
      }));

    return json_({ data });
  }

  return fail_('Aksi tidak dikenal.');
}



// ==========================================
// SETUP AWAL
// Jalankan sekali dari editor Apps Script
// ==========================================

function setupAll() {
  sheet_('Absensi');

  const sh = sheet_('Anggota');

  if (sh.getLastRow() < 2) {
    sh.appendRow([
      new Date(),
      'Faris Al Fathir',
      'XI RPL',
      'RPL',
      '-',
      'Ketua Ekskul'
    ]);
  }
}
