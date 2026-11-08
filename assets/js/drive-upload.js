/** Authenticated image uploader for the school's Google Drive. */
(() => {
  window.SCHOOL_GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbygkL-oP_5_5QQsHA5ZshaJOwHpYVRJElV3dsD-1kPvQG0ghRh_oR3DRP9VDYDEK-8g/exec';
  const maxBytes=20*1024*1024;
  const base64=file=>new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');
    reader.onerror=()=>reject(new Error('อ่านไฟล์ภาพไม่สำเร็จ'));
    reader.readAsDataURL(file);
  });
  async function prepareImage(file) {
    if (file.type === 'image/gif' || file.size <= 2*1024*1024) return file;
    if (!window.createImageBitmap) return file;
    let bitmap;
    try { bitmap = await createImageBitmap(file); }
    catch { return file; }
    try {
      const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
      if (scale === 1 && file.size <= 5*1024*1024) return file;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.82));
      if (!blob) return file;
      return new File([blob], file.name.replace(/\\.[^.]+$/, '') + '.webp', {type:'image/webp',lastModified:Date.now()});
    } finally { bitmap.close?.(); }
  }
  async function upload(file,moduleName,onProgress) {
    const endpoint=window.SCHOOL_GAS_WEB_APP_URL;
    if(!endpoint) throw new Error('ยังไม่ได้ตั้งค่า URL ของ Google Apps Script');
    if(!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) throw new Error('รองรับ JPG, PNG, WEBP และ GIF เท่านั้น');
    if(file.size>maxBytes) throw new Error('ภาพต้องมีขนาดไม่เกิน 20 MB');
    if(onProgress) onProgress('กำลังเตรียมไฟล์ภาพ...');
    file=await prepareImage(file);
    if(file.size>maxBytes) throw new Error('ภาพหลังประมวลผลยังมีขนาดเกิน 20 MB');
    if(onProgress) onProgress('กำลังตรวจสอบสิทธิ์และเตรียมส่งภาพ...');
    const {data:{session},error}=await window.schoolSupabase.auth.getSession();
    if(error||!session?.access_token) throw new Error('กรุณาเข้าสู่ระบบใหม่');
    const requestId='upload_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const values={action:'upload',request_id:requestId,access_token:session.access_token,origin:location.origin,module:moduleName,
      filename:file.name,mimeType:file.type,base64:await base64(file)};
    if(onProgress) onProgress('กำลังส่งภาพไปยัง Google Drive...');
    return new Promise((resolve,reject)=>{
      const frame=document.createElement('iframe');
      frame.name=requestId;frame.hidden=true;frame.setAttribute('title','Google Drive upload');
      const form=document.createElement('form');
      form.method='POST';form.action=endpoint;form.target=requestId;form.hidden=true;
      Object.entries(values).forEach(([name,value])=>{
        const field=document.createElement('input');field.type='hidden';field.name=name;field.value=value;form.appendChild(field);
      });
      let settled=false, pollTimer=null, timeoutTimer=null, pollScript=null;
      const callbackName='schoolDriveUploadCallback_'+requestId.replace(/[^a-zA-Z0-9_]/g,'_');
      const cleanup=()=>{
        if(pollTimer)clearTimeout(pollTimer);
        if(timeoutTimer)clearTimeout(timeoutTimer);
        if(pollScript)pollScript.remove();
        try{delete window[callbackName]}catch{window[callbackName]=undefined}
        form.remove();frame.remove();
      };
      const finish=(fn,value)=>{if(settled)return;settled=true;cleanup();fn(value)};
      const poll=()=>{
        if(settled)return;
        if(pollScript)pollScript.remove();
        pollScript=document.createElement('script');
        pollScript.src=endpoint+'?action=upload_status&request_id='+encodeURIComponent(requestId)+'&callback='+encodeURIComponent(callbackName)+'&_='+Date.now();
        pollScript.onerror=()=>{if(!settled)pollTimer=setTimeout(poll,2000)};
        document.head.appendChild(pollScript);
        pollTimer=setTimeout(poll,1800);
      };
      window[callbackName]=result=>{
        if(settled||!result||result.pending)return;
        if(result.ok&&result.url)finish(resolve,result);
        else finish(reject,new Error(result.error||'Google Drive บันทึกภาพไม่สำเร็จ'));
      };
      timeoutTimer=setTimeout(()=>finish(reject,new Error('ตรวจสอบผลการอัปโหลดไม่สำเร็จภายใน 60 วินาที กรุณารีเฟรชหน้าเว็บและตรวจสอบไฟล์ใน Google Drive ก่อนอัปโหลดซ้ำ')),60000);
      document.body.append(frame,form);
      form.submit();
      pollTimer=setTimeout(poll,1200);
    });
  }
  window.schoolDrive={upload};
  document.addEventListener('change',async event=>{
    const input=event.target.closest('[data-drive-upload]');
    if(!input||!input.files?.length)return;
    const target=document.querySelector(input.dataset.driveTarget);
    const status=document.querySelector(input.dataset.driveStatus||'');
    if(!target)return;
    input.disabled=true;if(status)status.textContent='กำลังเริ่มอัปโหลดภาพ...';
    try{
      const urls=[];
      for(const file of Array.from(input.files))urls.push((await upload(file,input.dataset.driveUpload,message=>{if(status)status.textContent=message;})).url);
      target.value=(input.multiple||input.dataset.driveAppend==='true')
        ?[target.value.trim(),...urls].filter(Boolean).join('\n'):urls[0];
      target.dispatchEvent(new Event('input',{bubbles:true}));
      const preview=document.querySelector(input.dataset.drivePreview||'');
      if(preview){preview.src=urls[0];preview.classList.remove('hidden');}
      if(status)status.textContent='อัปโหลดสำเร็จ '+urls.length+' ภาพ · URL ถูกเติมให้แล้ว';
    }catch(error){
      if(status)status.textContent=error.message;
      if(window.Swal)Swal.fire('อัปโหลดภาพไม่สำเร็จ',error.message,'error');
    }finally{input.disabled=false;input.value=''}
  });
})();
