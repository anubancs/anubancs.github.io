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
  async function upload(file,moduleName) {
    const endpoint=window.SCHOOL_GAS_WEB_APP_URL;
    if(!endpoint) throw new Error('ยังไม่ได้ตั้งค่า URL ของ Google Apps Script');
    if(!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) throw new Error('รองรับ JPG, PNG, WEBP และ GIF เท่านั้น');
    if(file.size>maxBytes) throw new Error('ภาพต้องมีขนาดไม่เกิน 20 MB');
    const {data:{session},error}=await window.schoolSupabase.auth.getSession();
    if(error||!session?.access_token) throw new Error('กรุณาเข้าสู่ระบบใหม่');
    const requestId='upload_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const values={action:'upload',request_id:requestId,access_token:session.access_token,origin:location.origin,module:moduleName,
      filename:file.name,mimeType:file.type,base64:await base64(file)};
    return new Promise((resolve,reject)=>{
      const frame=document.createElement('iframe');
      frame.name=requestId;frame.hidden=true;frame.setAttribute('title','Google Drive upload');
      const form=document.createElement('form');
      form.method='POST';form.action=endpoint;form.target=requestId;form.hidden=true;
      Object.entries(values).forEach(([name,value])=>{
        const field=document.createElement('input');field.type='hidden';field.name=name;field.value=value;form.appendChild(field);
      });
      let settled=false;
      const cleanup=()=>{window.removeEventListener('message',onMessage);form.remove();frame.remove();clearTimeout(timer)};
      const finish=(fn,value)=>{if(settled)return;settled=true;cleanup();fn(value)};
      const onMessage=event=>{
        let trustedOrigin=false;
        try {
          const host=new URL(event.origin).hostname;
          trustedOrigin=host==='script.google.com'||host==='googleusercontent.com'||host.endsWith('.googleusercontent.com');
        } catch {}
        if(!trustedOrigin)return;
        const msg=event.data;
        if(!msg||msg.type!=='school-drive-upload'||msg.requestId!==requestId)return;
        if(msg.result?.ok&&msg.result.url)finish(resolve,msg.result);
        else finish(reject,new Error(msg.result?.error||'Google Drive บันทึกภาพไม่สำเร็จ'));
      };
      const timer=setTimeout(()=>finish(reject,new Error('หมดเวลารอการตอบกลับจาก Google Drive')),120000);
      window.addEventListener('message',onMessage);
      document.body.append(frame,form);
      form.submit();
    });
  }
  window.schoolDrive={upload};
  document.addEventListener('change',async event=>{
    const input=event.target.closest('[data-drive-upload]');
    if(!input||!input.files?.length)return;
    const target=document.querySelector(input.dataset.driveTarget);
    const status=document.querySelector(input.dataset.driveStatus||'');
    if(!target)return;
    input.disabled=true;if(status)status.textContent='กำลังอัปโหลดภาพ...';
    try{
      const urls=[];
      for(const file of Array.from(input.files))urls.push((await upload(file,input.dataset.driveUpload)).url);
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
