# ติดตั้ง Google Apps Script ฉบับรวมระบบหลัก + 3E PDF

ใช้ไฟล์ `Code.gs` ฉบับรวมที่แนบให้ในบทสนทนานี้เท่านั้น ไฟล์ดังกล่าวต่อยอดจาก Code.gs เดิมของโรงเรียน โดยเก็บ doGet, image upload, notify/Telegram, AI chat และ AI summary ไว้ พร้อมเพิ่ม 3E PDF resumable upload

## 1. สำรองและแทนที่ Code.gs

1. เปิดโครงการ Apps Script เดิม: https://script.google.com/home/projects/1ldzJf3IojPHgXe4GGxH7RFm_vqB6lGyT3x6nrx87sdXT17Z_Yq10zrcL/edit
2. เปิด Code.gs เดิม แล้วคัดลอกเก็บสำรองไว้นอกโครงการก่อน
3. เปิดไฟล์ Code.gs ฉบับรวมที่แนบในบทสนทนานี้
4. แทนที่เนื้อหาใน Code.gs เดิมทั้งหมดด้วยเนื้อหาในไฟล์ฉบับรวม แล้วกด Save

ห้ามนำเฉพาะส่วน patch ไปวางซ้ำ เพราะไฟล์ฉบับรวมมี action handlers และฟังก์ชันที่เชื่อมกันครบแล้ว

## 2. ตรวจสอบ Script Properties

ต้องคงค่าเดิมทั้งหมด และตรวจว่ามี:
- `SUPABASE_PUBLISHABLE_KEY`
- `GEMINI_API_KEY` (หากใช้ AI)
- `TELEGRAM_BOT_TOKEN` และ `TELEGRAM_CHAT_ID` (หากใช้การแจ้งเตือน)

ห้ามนำ Supabase service_role/secret key ไปใส่ในหน้าเว็บไซต์หรือไฟล์ JavaScript ฝั่งผู้ใช้

## 3. ตรวจสอบ OAuth scopes

ใน appsscript.json ให้คง scopes เดิมทั้งหมด และเพิ่มรายการต่อไปนี้หากยังไม่มี:
- `https://www.googleapis.com/auth/drive`
- `https://www.googleapis.com/auth/script.external_request`

อย่าแทนที่ scopes เดิมทั้งหมดด้วยสองรายการนี้ เพราะอาจกระทบการทำงานเดิม

## 4. ตรวจสอบโฟลเดอร์ Google Drive

ภายใน `siteschool/3e` ต้องมีโฟลเดอร์ชื่อ:
- `e-document`
- `e-project-summary`

โฟลเดอร์ 3e ID ที่กำหนดในโค้ด: `1zVmnCFQOYf5ihT8n5oXeUhIKWH_j5diU`

## 5. Deploy

1. Save
2. Deploy > Manage deployments
3. Edit Web App deployment เดิม
4. Version > New version
5. Execute as: Me
6. Who has access: Anyone
7. Deploy และอนุญาตสิทธิ์ Google Drive ตามที่ Google ขอ

ใช้ Web App URL /exec เดิม ไม่ต้องเปลี่ยน URL ที่เว็บไซต์

## 6. ทดสอบตามลำดับ

1. เปิด https://www.anuban-cs.ac.th/admin/quality.html ด้วยบัญชี owner หรือ editor
2. อัปโหลด PDF ขนาดเล็กไปยังประเภทเอกสารทั่วไป ตรวจไฟล์ใน `3e/e-document`
3. อัปโหลด PDF ประเภทรายงานโครงการ ตรวจไฟล์ใน `3e/e-project-summary`
4. เปิด URL ที่ระบบเติมให้ และตรวจว่าดู PDF ได้
5. ทดสอบไฟล์ขนาดกลาง แล้วจึงทดสอบไฟล์ขนาดใหญ่ (ไม่เกิน 100 MiB)
6. ทดสอบระบบเดิม: อัปโหลดภาพ, แบบฟอร์มติดต่อ/Telegram และ AI chat/summary ตามฟังก์ชันที่โรงเรียนเปิดใช้

## ข้อควรทราบ

- PDF แบ่งส่งส่วนละ 2 MiB และจำกัดขนาดรวม 100 MiB
- ทุกส่วนตรวจ Supabase access token และสิทธิ์ใน `public.admin_users` (role `owner` หรือ `editor`)
- ไฟล์ PDF ตั้งสิทธิ์ Anyone with the link: Viewer เพื่อให้ผู้เข้าชมเว็บไซต์อ่านได้
- การลบรายการในฐานข้อมูลไม่ลบไฟล์ใน Drive โดยอัตโนมัติ
- อย่าแจ้งว่าระบบพร้อมใช้งานจริงจนกว่าจะ Deploy และทดสอบ upload/download ผ่านบัญชีจริง
