const KODE_VERIFIKASI = ['MUSIK2026'];
const FOLDER_ID = 'MASUKKAN_ID_FOLDER_UTAMA_GOOGLE_DRIVE_ANDA_DISINI'; 
const DIVISI = ['Musik Modern', 'Musik Tradisional', 'Olah Vokal & Paduan Suara'];
const SESI_DETIK = 21600;

function doGet() { return ContentService.createTextOutput("Sistem Ekstrakurikuler Aktif."); }
function doPost(e) {
  const p = e.parameter || {};
  try {
    switch (p.action) {
      case 'insert_pendaftaran': return daftar_(p);
      case 'login': return login_(p.username, p.password);
      case 'logout': hapusSesi_(p.token); return ok_({});
      case 'read_feed': return ok_({ data: feed_(p.token, p.guest_id) });
      case 'toggle_like': return like_(p);
      case 'add_comment': return addKomentar_(p);
      case 'get_comments': return readKomentar_(p);
      case 'read_profil': return bacaProfil_(p);
      case 'update_profil': return profil_(p);
      case 'delete_post': return hapusPost_(p);
      case 'read_anggota': return ok_({ data: getAnggota_() });
      case 'admin_list_anggota': return adminList_(p.token);
      case 'admin_verifikasi': return adminVerif_(p.token, p.row, p.status);
      case 'admin_hapus_anggota': return adminHapus_(p.token, p.row);
      case 'insert_post': return insertPost_(p);
      default: return fail_('Tindakan tidak dikenal.');
    }
  } catch (err) { return fail_('Kesalahan Sistem: ' + err.message); }
}

const sheet_ = n => SpreadsheetApp.getActive().getSheetByName(n);
const rows_ = sh => sh ? sh.getDataRange().getValues().slice(1) : [];
const clean_ = s => String(s || '').replace(/[=+\-@<>]/g, ' ').trim().slice(0, 50);
const fmt_ = d => Utilities.formatDate(new Date(d), 'Asia/Jakarta', 'dd MMM yyyy HH:mm');
const ok_ = d => ContentService.createTextOutput(JSON.stringify({ result: 'success', ...d })).setMimeType(ContentService.MimeType.JSON);
const fail_ = (m, d = {}) => ContentService.createTextOutput(JSON.stringify({ result: 'error', message: m, ...d })).setMimeType(ContentService.MimeType.JSON);
const hash_ = (p, s) => Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, p + s).map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');

function login_(u, p) {
  const user = String(u || '').trim().toLowerCase(), pass = String(p || '');
  if (!/^[a-z0-9_-]+$/.test(user)) return fail_('Nama pengguna tidak valid.');
  const rs = rows_(sheet_('Anggota'));
  const rowIdx = rs.findIndex(r => String(r[7]).toLowerCase() === user);
  if (rowIdx < 0) return fail_('Akun tidak ditemukan.');
  const r = rs[rowIdx];
  if (r[6] !== 'Disetujui' && !String(r[5]).toLowerCase().includes('pembina')) return fail_('Akun belum disetujui pengurus.');
  if (hash_(pass, r[9]) !== r[8]) return fail_('Kata sandi salah.');

  const token = Utilities.getUuid() + Utilities.getUuid();
  const exp = new Date().getTime() + (SESI_DETIK * 1000);
  const sh = sheet_('Sesi');
  const sd = sh.getDataRange().getValues();
  for (let i = sd.length - 1; i >= 1; i--) { if (String(sd[i][1]) === user) sh.deleteRow(i + 1); }
  sh.appendRow([token, user, exp]);
  return ok_({ token, nama: r[1], role: String(r[5]).toLowerCase().includes('pembina') ? 'admin' : 'anggota' });
}

function userDari_(token) {
  if (!token) return null;
  const sd = rows_(sheet_('Sesi'));
  for (let i = 0; i < sd.length; i++) {
    if (String(sd[i][0]) === String(token)) {
      if (new Date().getTime() > Number(sd[i][2])) { sheet_('Sesi').deleteRow(i + 2); return null; }
      return String(sd[i][1]);
    }
  } return null;
}
function hapusSesi_(token) {
  if (!token) return; const sh = sheet_('Sesi'), sd = rows_(sh);
  for (let i = sd.length - 1; i >= 0; i--) { if (String(sd[i][0]) === String(token)) { sh.deleteRow(i + 2); break; } }
}
function akun_(token) {
  const u = userDari_(token); if (!u) return null;
  const sh = sheet_('Anggota'), rs = rows_(sh);
  const idx = rs.findIndex(r => String(r[7]) === u);
  return idx >= 0 ? { u, r: rs[idx], row: idx + 2, sh } : null;
}

function daftar_(p) {
  const nama = clean_(p.nama), user = String(p.username || '').trim().toLowerCase(), pass = String(p.password || '');
  if (!/^[a-z0-9_-]+$/.test(user) || !/^[a-zA-Z0-9_-]+$/.test(pass)) return fail_('Dilarang spasi atau simbol.');
  if (user.length < 4 || pass.length < 6) return fail_('Minimal karakter tidak terpenuhi.');
  if (!KODE_VERIFIKASI.includes(p.kode)) return fail_('Kode rahasia salah.');
  
  const sh = sheet_('Anggota');
  if (rows_(sh).some(r => String(r[7]) === user)) return fail_('Nama pengguna sudah dipakai.');

  const folder = DriveApp.getFolderById(FOLDER_ID).createFolder(nama + ' (' + user + ')');
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  const salt = Utilities.getUuid();
  sh.appendRow([new Date(), nama, clean_(p.kelas), clean_(p.jurusan), p.divisi, 'Anggota', 'Menunggu Verifikasi', user, hash_(pass, salt), salt, '', '', folder.getId()]);
  return ok_({ message: 'Pendaftaran sukses.' });
}

function feed_(token, guestId) {
  const me = userDari_(token) || (guestId ? 'guest_' + guestId : null);
  const ang = {}; rows_(sheet_('Anggota')).forEach(r => { if (r[7]) ang[String(r[7])] = r; });
  const cnt = {}, mine = {};
  rows_(sheet_('Likes')).forEach(l => { cnt[l[0]] = (cnt[l[0]] || 0) + 1; if (me && String(l[1]) === me) mine[l[0]] = true; });

  let posts = rows_(sheet_('Postingan')).map(r => {
    const a = ang[String(r[2])] || []; const jab = String(a[5] || '').toLowerCase();
    const prio = jab.includes('pembina') ? 3 : jab.includes('ketua') ? 2 : 1;
    let urlFoto = r[4] ? 'https://lh3.googleusercontent.com/d/' + r[4] : '';
    let urlAva = a[10] ? 'https://lh3.googleusercontent.com/d/' + a[10] : '';
    return { id: r[0], rawTime: new Date(r[1]).getTime(), waktu: fmt_(r[1]), username: r[2], nama: a[1], divisi: a[4], jabatan: a[5], avatar: urlAva, caption: r[3], foto: urlFoto, likes: cnt[r[0]] || 0, liked: !!mine[r[0]], prio };
  });

  posts.sort((a, b) => b.prio - a.prio || b.likes - a.likes || b.rawTime - a.rawTime);
  return posts.slice(0, 20);
}

function like_(p) {
  const u = userDari_(p.token) || (p.guest_id ? 'guest_' + p.guest_id : null);
  if (!u) return fail_('Tidak dikenali.');
  const sh = sheet_('Likes'), rs = rows_(sh);
  const i = rs.findIndex(r => r[0] === p.id && String(r[1]) === u);
  if (i >= 0) sh.deleteRow(i + 2); else sh.appendRow([p.id, u, new Date()]);
  const likes = rows_(sh).filter(r => r[0] === p.id).length;
  return ok_({ liked: i < 0, likes });
}
function addKomentar_(p) {
  const a = akun_(p.token); if (!a) return fail_('Sesi berakhir.', { expired: true });
  sheet_('Komentar').appendRow([p.id, a.u, new Date(), clean_(p.teks)]);
  return ok_({});
}
function readKomentar_(p) {
  const ang = {}; rows_(sheet_('Anggota')).forEach(r => { if (r[7]) ang[String(r[7])] = r; });
  const cmts = rows_(sheet_('Komentar')).filter(r => r[0] === p.id).map(r => {
    const a = ang[String(r[1])] || []; return { nama: a[1], avatar: a[10] ? 'https://lh3.googleusercontent.com/d/'+a[10] : '', jabatan: a[5], waktu: fmt_(r[2]), teks: r[3] };
  });
  return ok_({ data: cmts });
}

function bacaProfil_(p) {
  const a = akun_(p.token); if (!a) return fail_('', { expired: true });
  const cnt = {}; rows_(sheet_('Likes')).forEach(l => { cnt[l[0]] = (cnt[l[0]] || 0) + 1; });
  const posts = rows_(sheet_('Postingan')).filter(r => String(r[2]) === a.u).map(r => ({ id: r[0], foto: 'https://lh3.googleusercontent.com/d/'+r[4], likes: cnt[r[0]] || 0 })).reverse();
  return ok_({ profil: { nama: a.r[1], kelas: a.r[2], divisi: a.r[4], jabatan: a.r[5], bio: a.r[11] || '', avatar: a.r[10] ? 'https://lh3.googleusercontent.com/d/'+a.r[10] : '' }, posts });
}
function profil_(p) {
  const a = akun_(p.token); if (!a) return fail_('', { expired: true });
  if (p.nama !== undefined) { const n = clean_(p.nama); if (n) a.sh.getRange(a.row, 2).setValue(n); }
  if (p.bio !== undefined) a.sh.getRange(a.row, 12).setValue(clean_(p.bio));
  
  if (p.foto) {
    try {
      const data = Utilities.base64Decode(p.foto.split(',')[1]);
      const blob = Utilities.newBlob(data, 'image/jpeg', 'profil_'+a.u+'.jpg');
      const fid = a.r[12] ? a.r[12] : FOLDER_ID;
      const fld = DriveApp.getFolderById(fid);
      if(a.r[10]) { try{DriveApp.getFileById(a.r[10]).setTrashed(true)}catch(e){} }
      const f = fld.createFile(blob); f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      a.sh.getRange(a.row, 11).setValue(f.getId());
    } catch(e){}
  }
  return ok_({ message: 'Tersimpan.' });
}
function hapusPost_(p) {
  const a = akun_(p.token); if (!a) return fail_('', { expired: true });
  const sh = sheet_('Postingan'), rs = rows_(sh);
  const i = rs.findIndex(r => r[0] === p.id && String(r[2]) === a.u);
  if (i >= 0) { 
    try{ DriveApp.getFileById(rs[i][4]).setTrashed(true) }catch(e){}
    sh.deleteRow(i + 2); return ok_({}); 
  }
  return fail_('Gagal menghapus.');
}
function insertPost_(p) {
  const a = akun_(p.token); if(!a) return fail_('Sesi berakhir');
  try {
    const data = Utilities.base64Decode(p.foto.split(',')[1]);
    const blob = Utilities.newBlob(data, 'image/jpeg', 'post_'+new Date().getTime()+'.jpg');
    const fid = a.r[12] ? a.r[12] : FOLDER_ID;
    const fld = DriveApp.getFolderById(fid);
    const f = fld.createFile(blob); f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    sheet_('Postingan').appendRow([Utilities.getUuid(), new Date(), a.u, clean_(p.caption), f.getId()]);
    return ok_();
  } catch(e) { return fail_('Gagal upload foto.'); }
}

function getAnggota_() {
  return rows_(sheet_('Anggota')).filter(r => r[6] === 'Disetujui').map(r => ({ nama: r[1], kelas: r[2], divisi: r[4], jabatan: r[5] }));
}
function adminList_(token) {
  const a = akun_(token); if (!a || !String(a.r[5]).toLowerCase().includes('pembina')) return fail_('', {expired:true});
  const data = rows_(sheet_('Anggota')).map((r,i) => ({ row: i+2, nama: r[1], username: r[7], kelas: r[2], divisi: r[4], status: r[6] }));
  return ok_({data});
}
function adminVerif_(token, row, status) {
  const a = akun_(token); if (!a || !String(a.r[5]).toLowerCase().includes('pembina')) return fail_('');
  sheet_('Anggota').getRange(row, 7).setValue(status); return ok_();
}
function adminHapus_(token, row) {
  const a = akun_(token); if (!a || !String(a.r[5]).toLowerCase().includes('pembina')) return fail_('');
  sheet_('Anggota').deleteRow(row); return ok_();
}
