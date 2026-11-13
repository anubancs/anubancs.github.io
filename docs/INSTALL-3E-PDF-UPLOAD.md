# ติดตั้งส่วนขยายอัปโหลด PDF สำหรับ 3E SCHOOL QUALITY

ไฟล์โค้ดส่วนขยาย: [google-apps-script-3e-upload-patch.gs](google-apps-script-3e-upload-patch.gs)

## 1. เปิดโครงการ Apps Script

เปิดโครงการเดิมของโรงเรียน:
https://script.google.com/home/projects/1ldzJf3IojPHgXe4GGxH7RFm_vqB6lGyT3x6nrx87sdXT17Z_Yq10zrcL/edit

สำรอง Code.gs เดิมก่อนแก้ไข โดยคัดลอกเก็บไว้ในเครื่อง

## 2. เพิ่มฟังก์ชัน

เปิดไฟล์ `google-apps-script-3e-upload-patch.gs` ใน GitHub แล้วคัดลอกโค้ดทั้งหมดไปวางต่อท้ายไฟล์ `Code.gs` เดิม ห้ามลบฟังก์ชันเดิม

## 3. เพิ่ม action ใน doPost(e)

ค้นหาโค้ดเดิม:

```javascript
function doPost(e) {
  const p = e && e.parameter || {};
  try {
```

เพิ่มสองบรรทัดนี้ต่อจาก `try {` ทันที ก่อนเงื่อนไข action เดิม:

```javascript
    if (p.action === 'quality_pdf_start') return qualityPdfHandle_(p, 'start');
    if (p.action === 'quality_pdf_chunk') return qualityPdfHandle_(p, 'chunk');
```

อย่าลบ action upload, notify, ai_summary หรือ ai_chat เดิม

## 4. ตรวจสอบ Script Properties

ใน Project Settings > Script properties ต้องมี:
- `SUPABASE_PUBLISHABLE_KEY` = Publishable key ของ Supabase project โรงเรียน

ไม่ต้องใส่ service_role key และไม่ควรใส่รหัสลับลงในโค้ดหน้าเว็บไซต์

## 5. กำหนด OAuth scopes

ถ้าโครงการมีไฟล์ `appsscript.json` ให้เปิด Show "appsscript.json" manifest file และรวม scopes เหล่านี้ใน `oauthScopes` โดยคง scopes เดิมที่โครงการต้องใช้ไว้ด้วย:

```json
{
  "oauthScopes": [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/script.external_request"
  ]
}
```

หากมี scopes เดิมอยู่แล้ว ให้เพิ่มสองรายการนี้เข้าไป ไม่ใช่แทนที่รายการเดิมทั้งหมด

## 6. บันทึกและ Deploy

1. กด Save
2. เลือก Deploy > Manage deployments
3. กด Edit ที่ Web App deployment เดิม
4. เลือก Version > New version
5. Execute as: Me
6. Who has access: Anyone (คำขออัปโหลดแต่ละครั้งยังตรวจ Supabase login และสิทธิ์ owner/editor)
7. กด Deploy และอนุญาตสิทธิ์ Google Drive เมื่อ Google ขอ

ใช้ URL /exec เดิม ไม่ต้องเปลี่ยนค่า URL ในเว็บไซต์

## 7. ทดสอบ

1. เปิด https://www.anuban-cs.ac.th/admin/quality.html แล้วเข้าสู่ระบบด้วยบัญชี owner หรือ editor
2. เลือกเอกสารประเภทใดก็ได้ ยกเว้นรายงานโครงการเพื่อทดสอบโฟลเดอร์ e-document
3. เลือก PDF ขนาดเล็กก่อน ระบบควรเติม URL, ชื่อไฟล์ และขนาดไฟล์ให้อัตโนมัติ
4. บันทึกรายการเป็นฉบับร่างก่อน แล้วตรวจไฟล์ใน Google Drive/3e/e-document
5. ทดสอบรายงานโครงการเพื่อยืนยันว่าไฟล์ไปที่ Google Drive/3e/e-project-summary
6. เมื่อผ่านแล้วจึงทดสอบไฟล์ขนาดใหญ่ขึ้น และสุดท้ายทดสอบใกล้ 100 MB

## ข้อจำกัดและความปลอดภัย

- จำกัด PDF สูงสุด 100 MiB (ประมาณ 100 MB) และส่งทีละ 2 MiB
- โฟลเดอร์ปลายทางถูกกำหนดตายตัวในโค้ด ไม่รับ Folder ID จาก browser
- ตรวจ Supabase access token และตรวจว่าผู้ใช้มีแถวใน admin_users ที่ role เป็น owner หรือ editor ทุกครั้ง
- ไฟล์จะถูกตั้งเป็น Anyone with the link: Viewer เพื่อให้เว็บไซต์สาธารณะเปิดอ่าน PDF ได้
- การลบรายการจาก Supabase ไม่ลบไฟล์ใน Drive
- ยังไม่ถือว่าการอัปโหลดพร้อมใช้งานจริงจนกว่าจะ Deploy Apps Script และผ่านการทดสอบจากหน้า Admin
