/** Chunked PDF uploader for 3E School Quality. Requires the existing GAS upload_status JSONP endpoint. */
(() => {
  const endpoint = window.SCHOOL_GAS_WEB_APP_URL;
  const MAX = 100 * 1024 * 1024;
  const CHUNK = 2 * 1024 * 1024;
  const makeId = prefix => prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2,10);
  const readBase64 = blob => new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('อ่านข้อมูลไฟล์ไม่สำเร็จ'));
    reader.readAsDataURL(blob);
  });
  function postAndWait(values, requestId, onProgress) {
    return new Promise((resolve,reject) => {
      const frame=document.createElement('iframe'), form=document.createElement('form');
      frame.name=requestId; frame.hidden=true; frame.title='3E PDF upload';
      form.method='POST'; form.action=endpoint; form.target=requestId; form.hidden=true;
      Object.entries(values).forEach(([name,value])=>{const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);});
      const callback='schoolDriveUploadCallback_'+requestId.replace(/[^a-zA-Z0-9_]/g,'_');
      let settled=false,pollTimer=null,timeoutTimer=null,pollScript=null;
      const cleanup=()=>{clearTimeout(pollTimer);clearTimeout(timeoutTimer);pollScript?.remove();try{delete window[callback]}catch{}form.remove();frame.remove();};
      const finish=(fn,value)=>{if(settled)return;settled=true;cleanup();fn(value);};
      const poll=()=>{if(settled)return;pollScript?.remove();pollScript=document.createElement('script');pollScript.src=endpoint+'?action=upload_status&request_id='+encodeURIComponent(requestId)+'&callback='+encodeURIComponent(callback)+'&_='+Date.now();pollScript.onerror=()=>{pollTimer=setTimeout(poll,1800)};document.head.appendChild(pollScript);pollTimer=setTimeout(poll,1500);};
      window[callback]=result=>{if(settled||!result||result.pending)return;if(result.ok)finish(resolve,result);else finish(reject,new Error(result.error||'อัปโหลดไม่สำเร็จ'));};
      timeoutTimer=setTimeout(()=>finish(reject,new Error('รอผลจาก Google Drive นานเกินไป กรุณาตรวจสอบไฟล์ใน Drive ก่อนลองใหม่')),180000);
      document.body.append(frame,form);form.submit();if(onProgress)onProgress('กำลังส่งข้อมูลไปยัง Google Drive...');pollTimer=setTimeout(poll,1200);
    });
  }
  async function uploadPdf(file, section, onProgress) {
    if (!endpoint) throw new Error('ไม่พบ URL ของ Google Apps Script');
    if (!(file instanceof File) || file.type !== 'application/pdf' || !/\.pdf$/i.test(file.name)) throw new Error('กรุณาเลือกไฟล์ PDF เท่านั้น');
    if (!file.size || file.size > MAX) throw new Error('ไฟล์ PDF ต้องมีขนาดไม่เกิน 100 MB');
    const {data:{session},error}=await window.schoolSupabase.auth.getSession();
    if(error || !session?.access_token) throw new Error('กรุณาเข้าสู่ระบบใหม่');
    const sessionId=makeId('qualitypdf');
    if(onProgress)onProgress('กำลังตรวจสอบสิทธิ์และเตรียมอัปโหลด...');
    const startId=makeId('qstart');
    await postAndWait({action:'quality_pdf_start',request_id:startId,session_id:sessionId,access_token:session.access_token,
      filename:file.name,mimeType:file.type,file_size:String(file.size),section:section},startId,onProgress);
    let offset=0;
    while(offset<file.size){
      const part=file.slice(offset,Math.min(offset+CHUNK,file.size));
      const encoded=await readBase64(part);
      const chunkId=makeId('qchunk');
      const result=await postAndWait({action:'quality_pdf_chunk',request_id:chunkId,session_id:sessionId,
        access_token:session.access_token,offset:String(offset),chunk_base64:encoded},chunkId,onProgress);
      offset+=part.size;
      if(onProgress)onProgress('อัปโหลดแล้ว '+Math.round(offset/file.size*100)+'% ('+(offset/1048576).toFixed(1)+' / '+(file.size/1048576).toFixed(1)+' MB)');
      if(result.complete)return result;
      if(result.next_offset!==offset)throw new Error('ตำแหน่งอัปโหลดไม่ตรงกัน กรุณาลองใหม่');
    }
    throw new Error('การอัปโหลดสิ้นสุดโดยไม่ได้รับการยืนยันจาก Google Drive');
  }
  window.schoolQualityDrive={uploadPdf};
})();
