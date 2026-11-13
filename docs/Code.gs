/**
 * 3E SCHOOL QUALITY PDF upload extension for the existing School Drive GAS gateway.
 *
 * INSTALLATION:
 * 1) Paste these functions at the END of the existing Code.gs.
 * 2) Add the two action branches shown below at the TOP of the existing doPost(e) try block:
 *
 *   if (p.action === 'quality_pdf_start') return qualityPdfHandle_(p, 'start');
 *   if (p.action === 'quality_pdf_chunk') return qualityPdfHandle_(p, 'chunk');
 *
 * 3) In Project Settings > Script properties, ensure SUPABASE_PUBLISHABLE_KEY exists.
 * 4) In appsscript.json enable oauthScopes:
 *    https://www.googleapis.com/auth/drive
 *    https://www.googleapis.com/auth/script.external_request
 * 5) Deploy > Manage deployments > Edit Web App > New version > Deploy.
 *    Execute as: Me. Access: Anyone (the endpoint still verifies Supabase user + admin role).
 *
 * Files are made "Anyone with the link: Viewer" to match the public school website.
 * Only PDF files up to 100 MiB are accepted. 2 MiB resumable chunks are sent sequentially.
 */
const QUALITY_3E_ROOT_FOLDER_ID = '1zVmnCFQOYf5ihT8n5oXeUhIKWH_j5diU';
const QUALITY_3E_MAX_PDF_BYTES = 100 * 1024 * 1024;
const QUALITY_3E_CHUNK_BYTES = 2 * 1024 * 1024;
const QUALITY_3E_SESSION_TTL = 21600;

function qualityPdfStart_(p) {
  const sessionId = qualityPdfSafeId_(p.session_id);
  if (!sessionId) throw new Error('ไม่พบรหัสเซสชันอัปโหลด');
  const user = qualityPdfAuthorize_(p.access_token);
  const mime = String(p.mimeType || '').toLowerCase();
  const size = Number(p.file_size || 0);
  const filename = String(p.filename || 'document.pdf').replace(/[<>:"|?*]/g, '_').replaceAll('/', '_').replaceAll(String.fromCharCode(92), '_').slice(0, 180);
  if (mime !== 'application/pdf' || !/\\.pdf$/i.test(filename)) throw new Error('อนุญาตเฉพาะไฟล์ PDF เท่านั้น');
  if (!Number.isSafeInteger(size) || size < 8 || size > QUALITY_3E_MAX_PDF_BYTES) throw new Error('ไฟล์ PDF ต้องมีขนาดไม่เกิน 100 MB');
  const section = String(p.section || '');
  const folderName = section === 'project_report' ? 'e-project-summary' : 'e-document';
  const root = DriveApp.getFolderById(QUALITY_3E_ROOT_FOLDER_ID);
  const folderIt = root.getFoldersByName(folderName);
  if (!folderIt.hasNext()) throw new Error('ไม่พบโฟลเดอร์ 3e/' + folderName + ' ใน Google Drive');
  const folder = folderIt.next();
  const safeName = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd_HHmmss') + '_' +
    Utilities.getUuid().slice(0, 8) + '_' + filename;
  const metadata = {name:safeName, mimeType:'application/pdf', parents:[folder.getId()]};
  const response = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true', {
    method:'post',
    contentType:'application/json; charset=utf-8',
    headers:{
      Authorization:'Bearer ' + ScriptApp.getOAuthToken(),
      'X-Upload-Content-Type':'application/pdf',
      'X-Upload-Content-Length':String(size)
    },
    payload:JSON.stringify(metadata),
    muteHttpExceptions:true
  });
  const code = response.getResponseCode();
  const headers = response.getAllHeaders();
  const sessionUrl = headers.Location || headers.location;
  if (code < 200 || code >= 300 || !sessionUrl) {
    console.error('Drive resumable start failed HTTP ' + code + ': ' + response.getContentText().slice(0, 500));
    throw new Error('Google Drive เริ่มการอัปโหลดไม่สำเร็จ (HTTP ' + code + ')');
  }
  const session = {
    url:String(sessionUrl), size:size, filename:safeName, originalName:filename,
    userId:user.id, userEmail:user.email || '', mimeType:'application/pdf',
    nextOffset:0, folderName:folderName, createdAt:Date.now()
  };
  CacheService.getScriptCache().put('quality_pdf_session_' + sessionId, JSON.stringify(session), QUALITY_3E_SESSION_TTL);
  return {ok:true, session_id:sessionId, chunk_bytes:QUALITY_3E_CHUNK_BYTES, file_size:size};
}

function qualityPdfChunk_(p) {
  const requestId = qualityPdfSafeId_(p.request_id);
  const sessionId = qualityPdfSafeId_(p.session_id);
  if (!requestId || !sessionId) throw new Error('ข้อมูลการอัปโหลดไม่ครบ');
  const user = qualityPdfAuthorize_(p.access_token);
  const cache = CacheService.getScriptCache();
  const raw = cache.get('quality_pdf_session_' + sessionId);
  if (!raw) throw new Error('เซสชันอัปโหลดหมดอายุ กรุณาเริ่มอัปโหลดใหม่');
  const session = JSON.parse(raw);
  if (session.userId !== user.id) throw new Error('เซสชันนี้ไม่ได้เป็นของผู้ใช้งานปัจจุบัน');
  const offset = Number(p.offset);
  if (!Number.isSafeInteger(offset) || offset !== session.nextOffset) throw new Error('ตำแหน่งข้อมูลไม่ตรงกับเซสชัน กรุณาเริ่มอัปโหลดใหม่');
  const encoded = String(p.chunk_base64 || '');
  if (!encoded) throw new Error('ไม่พบข้อมูลส่วนของไฟล์');
  const bytes = Utilities.base64Decode(encoded);
  if (!bytes.length || bytes.length > QUALITY_3E_CHUNK_BYTES || offset + bytes.length > session.size) throw new Error('ขนาดข้อมูลส่วนย่อยไม่ถูกต้อง');
  if (offset === 0 && (bytes.length < 5 || Utilities.newBlob(bytes).getDataAsString().slice(0, 5) !== '%PDF-')) {
    throw new Error('ไฟล์ที่เลือกไม่มีโครงสร้าง PDF ที่ถูกต้อง');
  }
  const end = offset + bytes.length - 1;
  const response = UrlFetchApp.fetch(session.url, {
    method:'put',
    contentType:'application/pdf',
    headers:{
      Authorization:'Bearer ' + ScriptApp.getOAuthToken(),
      'Content-Range':'bytes ' + offset + '-' + end + '/' + session.size
    },
    payload:bytes,
    muteHttpExceptions:true
  });
  const code = response.getResponseCode();
  if (code === 308) {
    session.nextOffset = end + 1;
    cache.put('quality_pdf_session_' + sessionId, JSON.stringify(session), QUALITY_3E_SESSION_TTL);
    return {ok:true, next_offset:session.nextOffset, total_bytes:session.size};
  }
  if (code === 200 || code === 201) {
    const body = JSON.parse(response.getContentText() || '{}');
    if (!body.id) throw new Error('Google Drive ไม่ส่ง File ID กลับมา');
    const file = DriveApp.getFileById(body.id);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    cache.remove('quality_pdf_session_' + sessionId);
    return {
      ok:true, complete:true, id:file.getId(), name:file.getName(),
      url:'https://drive.google.com/file/d/' + file.getId() + '/view',
      mimeType:'application/pdf', size:session.size, folder:session.folderName,
      uploadedBy:session.userEmail || user.email || user.id
    };
  }
  console.error('Drive chunk failed HTTP ' + code + ': ' + response.getContentText().slice(0, 500));
  throw new Error('Google Drive รับข้อมูลไม่สำเร็จ (HTTP ' + code + ')');
}

function qualityPdfAuthorize_(token) {
  if (!token) throw new Error('กรุณาเข้าสู่ระบบใหม่');
  const key = PropertiesService.getScriptProperties().getProperty('SUPABASE_PUBLISHABLE_KEY');
  if (!key) throw new Error('ไม่พบ SUPABASE_PUBLISHABLE_KEY ใน Script Properties');
  const headers = {apikey:key, Authorization:'Bearer ' + token};
  const auth = UrlFetchApp.fetch(SUPABASE_URL + '/auth/v1/user', {headers:headers, muteHttpExceptions:true});
  if (auth.getResponseCode() !== 200) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  const user = JSON.parse(auth.getContentText() || '{}');
  const admin = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/admin_users?select=user_id,role&user_id=eq.' +
    encodeURIComponent(user.id) + '&limit=1', {headers:headers, muteHttpExceptions:true});
  if (admin.getResponseCode() !== 200) throw new Error('ตรวจสอบสิทธิ์ผู้ดูแลไม่สำเร็จ');
  const rows = JSON.parse(admin.getContentText() || '[]');
  if (!rows.length || !['owner','editor'].includes(String(rows[0].role || '').toLowerCase())) {
    throw new Error('บัญชีนี้ไม่มีสิทธิ์อัปโหลดเอกสารประกันคุณภาพ');
  }
  return user;
}

function qualityPdfSafeId_(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

function qualityPdfResponse_(requestId, result) {
  const id = qualityPdfSafeId_(requestId);
  if (id) CacheService.getScriptCache().put('upload_result_' + id, JSON.stringify(result), 600);
  return HtmlService.createHtmlOutput('ดำเนินการอัปโหลดแล้ว');
}

function qualityPdfHandle_(p, action) {
  const requestId = qualityPdfSafeId_(p.request_id);
  let result;
  try {
    result = action === 'start' ? qualityPdfStart_(p) : qualityPdfChunk_(p);
  } catch (err) {
    result = {ok:false, error:String(err && err.message || err)};
  }
  return qualityPdfResponse_(requestId, result);
}
