// ==========================================
// BACKEND EKSTRAKURIKULER MUSIK
// Google Apps Script
// ==========================================

const KODE_VERIFIKASI = ['MUSIK2026'];
const TZ = 'Asia/Jakarta';

// ---------- DATABASE GOOGLE DRIVE (SEMUA OTOMATIS) ----------
// Folder utama dibuat sendiri oleh script dengan nama di bawah, dan ID-nya diingat di Script properties.
// Setiap siswa yang sukses mendaftar otomatis dibuatkan subfolder pribadi di dalamnya, bernama
// "<Nama Lengkap> (<username>)". Foto profil dan foto kegiatan siswa disimpan di folder miliknya.
// Saat siswa login, folder itu dibuka (dan dibuat ulang otomatis bila hilang / belum ada).
const NAMA_FOLDER_UTAMA = 'Database Ekskul Musik SMK BPP Bandung';

// OPSIONAL: isi hanya jika ingin memakai folder Drive yang SUDAH ADA sebagai folder utama
// (ID dari link folder: drive.google.com/drive/folders/<ID>). Biarkan kosong agar dibuat otomatis.
const FOLDER_ID = '';

// ---------- AKUN ADMIN: JANGAN ditulis di file ini ----------
// Buka Project Settings (ikon roda gigi) > Script properties > Add script property:
//   ADMIN_USER = username admin (huruf kecil/angka/_)
//   ADMIN_PASS = password admin (pakai yang kuat)
// Mengubah password admin = ubah nilai ADMIN_PASS di sana, tidak perlu deploy ulang.

const SESI_DETIK = 21600;   // login berlaku 6 jam (batas maksimum CacheService)
const ADMIN_TAG = '#admin'; // penanda sesi admin di cache; tidak mungkin sama dengan username siswa
const STATUS = ['Menunggu Verifikasi', 'Disetujui', 'Ditolak'];
const MAKS_GAGAL = 5;       // salah password berturut-turut sebelum dikunci sementara
const KUNCI_DETIK = 600;    // lama kunci: 10 menit

const DIVISI = [
  'Musik Modern',
  'Musik Tradisional (Angklung & Gamelan)',
  'Olah Vokal & Paduan Suara',
  'Semua Divisi'
];

// Kolom Anggota: 0 Waktu, 1 Nama, 2 Kelas, 3 Jurusan, 4 Divisi, 5 Jabatan,
// 6 Status, 7 Username, 8 Hash, 9 Salt, 10 Foto Profil (ID Drive), 11 Bio,
// 12 Folder ID (subfolder Drive milik siswa)
const IDX_FOLDER = 12;
const HEADERS = {
  Anggota: ['Waktu Daftar', 'Nama Lengkap', 'Kelas', 'Jurusan', 'Divisi', 'Jabatan',
            'Status Verifikasi', 'Username', 'Password Hash', 'Salt', 'Foto Profil', 'Bio', 'Folder ID'],
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

// Header dan format kolom hanya diatur saat sheet dibuat / dimigrasi
// (sebelumnya dilakukan di SETIAP pemanggilan, memperlambat semua permintaan).
function siapkan_(sh, name) {
  sh.getRange(1, 1, 1, HEADERS[name].length).setFontWeight('bold');
  // Username, hash, salt, dan Folder ID harus selalu berupa teks. Tanpa ini Google Sheets bisa
  // mengubah nilai tertentu (hash diawali "+", username seperti "0123" atau "1e5").
  if (name === 'Anggota') {
    sh.getRange('H:J').setNumberFormat('@');
    sh.getRange('M:M').setNumberFormat('@');
  }
}

function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const H = HEADERS[name];
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(H);
    sh.setFrozenRows(1);
    siapkan_(sh, name);
  } else if (sh.getLastColumn() < H.length) {
    sh.getRange(1, 1, 1, H.length).setValues([H]); // migrasi kolom baru (termasuk Folder ID)
    siapkan_(sh, name);
  }
  return sh;
}

function rows_(sh) {
  const data = sh.getDataRange().getValues();
  data.shift();
  return data;
}

// ---------- Admin ----------
const prop_ = k => PropertiesService.getScriptProperties().getProperty(k) || '';
const adminUser_ = () => prop_('ADMIN_USER').trim().toLowerCase();
const cekAdmin_ = (user, pass) => {
  const u = adminUser_(), pw = prop_('ADMIN_PASS');
  return !!u && !!pw && user === u && String(pass || '') === pw;
};

// ---------- Sesi ----------
function login_(username) {
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('s_' + token, username, SESI_DETIK);
  return token;
}
const userDari_ = t => t ? CacheService.getScriptCache().get('s_' + t) : null;
const adalAdmin_ = t => userDari_(t) === ADMIN_TAG;

// Hanya untuk siswa. Sesi admin sengaja tidak menghasilkan akun siswa.
function akun_(token) {
  const u = userDari_(token);
  if (!u || u === ADMIN_TAG) return null;
  const sh = sheet_('Anggota');
  const rs = rows_(sh);
  const i = rs.findIndex(r => String(r[7]) === u);
  return i < 0 ? null : { sh, row: i + 2, r: rs[i], u };
}

// Jawaban saat akun_() gagal: admin diberi tahu (tanpa di-logout), selain itu sesi dianggap habis.
const sesiGagal_ = t => adalAdmin_(t)
  ? fail_('Akun admin hanya untuk mengelola anggota.')
  : fail_('Sesi berakhir.', { expired: true });

// Dipakai semua aksi admin. Mengembalikan jawaban error jika bukan sesi admin, atau null jika boleh lanjut.
const bukanAdmin_ = t => adalAdmin_(t)
  ? null
  : fail_('Sesi admin berakhir. Silakan masuk lagi.', { expired: true });

// ---------- Database Google Drive: folder utama + subfolder per siswa ----------

// Folder utama. Urutan: (1) FOLDER_ID manual bila diisi, (2) folder yang pernah dibuat otomatis
// (ID tersimpan di Script properties), (3) folder bernama NAMA_FOLDER_UTAMA yang sudah ada di Drive,
// (4) buat baru. Jadi aman dipanggil berkali-kali: tidak akan membuat folder utama ganda.
function rootFolder_() {
  if (FOLDER_ID && String(FOLDER_ID).indexOf('ISI_ID') !== 0) {
    try { return DriveApp.getFolderById(FOLDER_ID); }
    catch (e) { throw new Error('FOLDER_ID di code.gs tidak ditemukan di Drive. Kosongkan agar folder utama dibuat otomatis.'); }
  }
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ROOT_FOLDER_ID');
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {}
  }
  const ada = DriveApp.getFoldersByName(NAMA_FOLDER_UTAMA);
  while (ada.hasNext()) {
    const f = ada.next();
    if (!f.isTrashed()) { props.setProperty('ROOT_FOLDER_ID', f.getId()); return f; }
  }
  const baru = DriveApp.createFolder(NAMA_FOLDER_UTAMA);
  props.setProperty('ROOT_FOLDER_ID', baru.getId());
  return baru;
}

// Nama folder siswa: nama lengkap + username (username menjamin nama folder tidak kembar).
const namaFolderSiswa_ = (nama, user) =>
  (String(nama || '').replace(/^'/, '').trim() || 'Siswa') + ' (' + user + ')';

// Buka folder milik siswa. Jika belum ada (siswa lama) atau sudah terhapus/dibuang ke tempat sampah,
// dibuat ulang otomatis dan ID barunya disimpan di kolom Folder ID.
// sh = sheet Anggota, row = nomor baris siswa, r = isi baris itu.
function folderSiswa_(sh, row, r) {
  const id = String(r[IDX_FOLDER] || '');
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {}
  }
  const f = rootFolder_().createFolder(namaFolderSiswa_(r[1], String(r[7])));
  sh.getRange(row, IDX_FOLDER + 1).setValue(f.getId());
  r[IDX_FOLDER] = f.getId();
  return f;
}

// Simpan foto ke folder milik siswa (a = hasil akun_()). Foto dicek dulu sebelum menyentuh Drive.
function simpanFoto_(dataUrl, nama, a) {
  const m = String(dataUrl || '').match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
  if (!m) throw new Error('Format foto tidak valid.');
  if (m[2].length > 5000000) throw new Error('Ukuran foto terlalu besar.');
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), 'image/' + m[1], nama);
  const f = folderSiswa_(a.sh, a.row, a.r).createFile(blob);
  try {
    f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    f.setTrashed(true);
    throw new Error('Foto tidak bisa dibagikan publik. Akun Google Workspace sekolah biasanya memblokirnya; deploy memakai akun Google pribadi.');
  }
  return f.getId();
}
function hapusFile_(id) {
  try { if (id) DriveApp.getFileById(id).setTrashed(true); } catch (e) {}
}
function hapusFolder_(id) {
  try { if (id) DriveApp.getFolderById(id).setTrashed(true); } catch (e) {}
}

// Isi folder untuk semua siswa yang belum punya (siswa yang mendaftar sebelum fitur ini ada).
// Dipanggil dari setupAll(); aman dijalankan berulang. Mengembalikan jumlah folder yang dibuat.
function siapkanFolderSemuaSiswa() {
  const sh = sheet_('Anggota');
  let dibuat = 0;
  rows_(sh).forEach((r, i) => {
    if (!String(r[7] || '')) return; // baris tanpa username (mis. ketua contoh) tidak punya akun
    const lama = String(r[IDX_FOLDER] || '');
    folderSiswa_(sh, i + 2, r);
    if (String(r[IDX_FOLDER]) !== lama) dibuat++;
  });
  return dibuat;
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
    if (!a) return sesiGagal_(p.token);
    return ok_({
      profil: { nama: a.r[1], kelas: a.r[2], divisi: a.r[4], jabatan: a.r[5], avatar: img_(a.r[10]), bio: a.r[11] || '' },
      posts: feed_(p.token, a.u)
    });
  }

  if (p.action === 'admin_list_anggota') return adminList_(p);

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
      case 'admin_verifikasi': return adminVerifikasi_(p);
      case 'admin_hapus_anggota': return adminHapus_(p);
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
  if (user === 'admin' || user === adminUser_()) return fail_('Username sudah dipakai.');
  if (pass.length < 6) return fail_('Password minimal 6 karakter.');

  const sh = sheet_('Anggota');
  const rs = rows_(sh);
  if (rs.some(r => String(r[1]).trim().toLowerCase() === nama.toLowerCase() &&
                   String(r[2]).trim().toLowerCase() === kelas.toLowerCase()))
    return fail_('Kamu sudah terdaftar sebagai anggota.');
  if (rs.some(r => String(r[7]) === user)) return fail_('Username sudah dipakai.');

  // Semua pengecekan lolos: buatkan database pribadi (subfolder Drive) SEBELUM data disimpan,
  // supaya kalau Drive bermasalah tidak ada siswa yang terdaftar setengah jadi.
  let folder;
  try { folder = rootFolder_().createFolder(namaFolderSiswa_(nama, user)); }
  catch (err) {
    Logger.log(err);
    return fail_('Database Google Drive belum bisa dibuat (' + (err.message || 'galat tak dikenal') + '). Hubungi admin ekskul.');
  }

  const salt = Utilities.getUuid();
  try {
    sh.appendRow([new Date(), nama, kelas, jurusan, divisi, 'Anggota Aktif',
                  'Menunggu Verifikasi', user, hash_(pass, salt), salt, '', '', folder.getId()]);
  } catch (err) {
    folder.setTrashed(true);
    throw err;
  }
  return ok_({ message: 'Pendaftaran berhasil. Database pribadimu di Google Drive sudah dibuat. Selamat bergabung!' });
}

function masuk_(p) {
  const user = String(p.username || '').trim().toLowerCase();
  const pass = String(p.password || '');
  if (!user || !pass) return fail_('Username dan password wajib diisi.');

  // Batasi tebak-tebakan password: 5x salah = dikunci 10 menit (per username)
  const cache = CacheService.getScriptCache();
  const kunci = 'gagal_' + user.slice(0, 50);
  if (Number(cache.get(kunci) || 0) >= MAKS_GAGAL)
    return fail_('Terlalu banyak percobaan gagal. Coba lagi dalam 10 menit.');
  const gagal = () => {
    cache.put(kunci, String(Number(cache.get(kunci) || 0) + 1), KUNCI_DETIK);
    return fail_('Username atau password salah.');
  };

  // Admin: akunnya disimpan di Script properties, bukan di sheet Anggota
  if (user === adminUser_()) {
    if (!cekAdmin_(user, pass)) return gagal();
    cache.remove(kunci);
    return ok_({ message: 'Berhasil masuk sebagai admin.', token: login_(ADMIN_TAG), nama: 'Admin', kelas: '', role: 'admin' });
  }

  const sh = sheet_('Anggota');
  const rs = rows_(sh);
  const i = rs.findIndex(x => String(x[7]) === user);
  const r = rs[i];
  if (i < 0 || hash_(pass, String(r[9])) !== String(r[8])) return gagal();
  if (String(r[6]).trim() === 'Ditolak')
    return fail_('Pendaftaran kamu ditolak admin. Hubungi pembina ekskul.');

  cache.remove(kunci);

  // Ambil database siswa dari Google Drive: buka foldernya, atau buat otomatis jika belum ada.
  // Kalau Drive sedang bermasalah, login tetap berhasil; folder dicoba lagi saat siswa mengunggah foto.
  let folder = null;
  try { folder = { nama: folderSiswa_(sh, i + 2, r).getName() }; }
  catch (err) { Logger.log('Folder siswa gagal disiapkan saat login: ' + err); }

  return ok_({ message: 'Berhasil masuk.', token: login_(user), nama: r[1], kelas: r[2], role: 'anggota', folder });
}

function profil_(p) {
  const a = akun_(p.token);
  if (!a) return sesiGagal_(p.token);
  if (p.bio !== undefined) a.sh.getRange(a.row, 12).setValue(caption_(p.bio).slice(0, 160));
  if (p.foto) {
    const id = simpanFoto_(p.foto, 'profil_' + a.u + '_' + Date.now() + '.jpg', a);
    hapusFile_(a.r[10]);
    a.sh.getRange(a.row, 11).setValue(id);
  }
  return ok_({ message: 'Profil tersimpan.' });
}

function posting_(p) {
  const a = akun_(p.token);
  if (!a) return sesiGagal_(p.token);
  const cap = caption_(p.caption);
  if (!p.foto) return fail_('Pilih foto kegiatan dulu.');
  const fid = simpanFoto_(p.foto, 'kegiatan_' + a.u + '_' + Date.now() + '.jpg', a);
  sheet_('Postingan').appendRow([Utilities.getUuid(), new Date(), a.u, cap, fid]);
  return ok_({ message: 'Dokumentasi berhasil dibagikan.' });
}

function hapusPost_(p) {
  const a = akun_(p.token);
  if (!a) return sesiGagal_(p.token);
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
  if (!a) return sesiGagal_(p.token);
  const lk = sheet_('Likes'), ls = rows_(lk);
  const i = ls.findIndex(l => l[0] === p.id && String(l[1]) === a.u);
  if (i >= 0) lk.deleteRow(i + 2); else lk.appendRow([p.id, a.u]);
  const total = ls.filter(l => l[0] === p.id).length + (i >= 0 ? -1 : 1);
  return ok_({ liked: i < 0, likes: total });
}

// ==========================================
// ADMIN
// ==========================================

// Daftar semua pendaftar (yang menunggu verifikasi ditaruh paling atas)
function adminList_(p) {
  const g = bukanAdmin_(p.token); if (g) return g;
  const data = rows_(sheet_('Anggota')).map((r, i) => ({
    row: i + 2,
    nama: r[1], username: String(r[7] || ''), kelas: r[2], jurusan: r[3], divisi: r[4], jabatan: r[5],
    status: String(r[6] || '').trim() || 'Menunggu Verifikasi'
  }));
  const tunggu = x => x.status === 'Menunggu Verifikasi' ? 1 : 0;
  data.sort((a, b) => tunggu(b) - tunggu(a) || b.row - a.row);
  return ok_({ data });
}

// Nomor baris dari browser hanya dipercaya jika username-nya cocok
// (mencegah salah hapus kalau daftar di layar sudah usang).
function barisAnggota_(rs, p) {
  const row = Number(p.row);
  if (!Number.isInteger(row) || row < 2) return null;
  const r = rs[row - 2];
  if (!r || String(r[7]) !== String(p.username || '')) return null;
  return { row, r };
}

function adminVerifikasi_(p) {
  const g = bukanAdmin_(p.token); if (g) return g;
  const status = String(p.status || '');
  if (!STATUS.includes(status)) return fail_('Status tidak valid.');
  const sh = sheet_('Anggota');
  const t = barisAnggota_(rows_(sh), p);
  if (!t) return fail_('Data anggota tidak ditemukan. Muat ulang daftar lalu coba lagi.');
  sh.getRange(t.row, 7).setValue(status);
  return ok_({ message: 'Status ' + t.r[1] + ' diubah menjadi ' + status + '.' });
}

function adminHapus_(p) {
  const g = bukanAdmin_(p.token); if (g) return g;
  const sh = sheet_('Anggota');
  const t = barisAnggota_(rows_(sh), p);
  if (!t) return fail_('Data anggota tidak ditemukan. Muat ulang daftar lalu coba lagi.');
  const user = String(t.r[7] || '');
  if (user) hapusDataUser_(user);
  hapusFile_(t.r[10]);
  hapusFolder_(t.r[IDX_FOLDER]); // folder database siswa ikut dibuang ke tempat sampah Drive
  sh.deleteRow(t.row);
  return ok_({ message: 'Anggota ' + t.r[1] + ' dihapus beserta dokumentasi dan folder database-nya.' });
}

// Hapus semua postingan (dan fotonya), like pada postingan itu, dan like yang diberikan anggota tsb.
function hapusDataUser_(user) {
  const ps = sheet_('Postingan'), lk = sheet_('Likes');
  const pr = rows_(ps), idPost = {};
  for (let i = pr.length - 1; i >= 0; i--) {
    if (String(pr[i][2]) !== user) continue;
    idPost[pr[i][0]] = true;
    hapusFile_(pr[i][4]);
    ps.deleteRow(i + 2);
  }
  const ls = rows_(lk);
  for (let j = ls.length - 1; j >= 0; j--) {
    if (idPost[ls[j][0]] || String(ls[j][1]) === user) lk.deleteRow(j + 2);
  }
}

// ==========================================
// SETUP AWAL — jalankan sekali dari editor Apps Script
// (membuat folder utama Drive otomatis, meminta izin Drive,
//  dan membuatkan folder untuk siswa yang sudah terdaftar sebelumnya)
// ==========================================
function setupAll() {
  const root = rootFolder_(); // membuat folder utama + memicu izin Drive
  sheet_('Postingan');
  sheet_('Likes');
  const sh = sheet_('Anggota');
  siapkan_(sh, 'Anggota'); // format kolom teks, juga untuk sheet lama

  if (sh.getLastRow() < 2) {
    sh.appendRow([new Date(), 'Faris Al Fathir', 'XI RPL', 'RPL', '-', 'Ketua Ekskul', 'Disetujui']);
  }

  const baru = siapkanFolderSemuaSiswa();
  Logger.log('Folder utama: "' + root.getName() + '" -> ' + root.getUrl());
  Logger.log('Folder siswa yang baru dibuat: ' + baru);
  Logger.log(adminUser_() && prop_('ADMIN_PASS')
    ? 'Admin siap. Username admin: ' + adminUser_()
    : 'PERINGATAN: ADMIN_USER / ADMIN_PASS belum diisi di Script properties, login admin belum bisa dipakai.');
}
