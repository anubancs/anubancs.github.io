(() => {
  const $ = (selector) => document.querySelector(selector);
  const input = $('#qinfo-images');
  const run = $('#qinfo-run-ocr');
  const apply = $('#qinfo-apply-ocr');
  const clear = $('#qinfo-clear-ocr');
  const textArea = $('#qinfo-ocr-text');
  const progress = $('#qinfo-ocr-progress');
  const applyStatus = $('#qinfo-apply-status');
  const imageList = $('#qinfo-image-list');
  if (!input || !run || !window.Tesseract) return;

  const thaiDigits = value => String(value).replace(/[๐-๙]/g, d => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(d)));
  const escapeRegExp = value => value.replace(/[.*+?^{}()|[\]\\]/g, '\\$&');

  input.addEventListener('change', () => {
    imageList.replaceChildren();
    [...input.files].forEach(file => {
      const item = document.createElement('div');
      item.className = 'text-xs text-slate-600 border rounded-lg p-2 max-w-48';
      const img = document.createElement('img');
      img.className = 'max-h-24 max-w-full object-contain mb-1';
      const url = URL.createObjectURL(file);
      img.src = url;
      img.onload = () => URL.revokeObjectURL(url);
      img.alt = 'ตัวอย่างภาพรายงาน';
      const name = document.createElement('div');
      name.textContent = file.name;
      item.append(img, name);
      imageList.append(item);
    });
    progress.textContent = input.files.length ? 'เลือกภาพ ' + input.files.length + ' ไฟล์' : 'รอเลือกภาพ';
  });

  run.addEventListener('click', async () => {
    const files = [...input.files];
    if (!files.length) { progress.textContent = 'กรุณาเลือกภาพรายงานก่อน'; return; }
    if (files.some(file => !/^image\/(png|jpeg|webp)$/.test(file.type))) {
      progress.textContent = 'รองรับเฉพาะ PNG, JPG และ WEBP'; return;
    }
    run.disabled = true;
    apply.disabled = true;
    let worker;
    const outputs = [];
    try {
      progress.textContent = 'กำลังเตรียม OCR ภาษาไทยและอังกฤษ...';
      worker = await Tesseract.createWorker('tha+eng', 1, {
        logger: message => {
          if (message.status === 'recognizing text') {
            progress.textContent = 'กำลังอ่านภาพ ' + (message.progress ? Math.round(message.progress * 100) : 0) + '%';
          } else if (message.status) progress.textContent = message.status;
        },
        workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
        corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
        langPath: 'https://tessdata.projectnaptha.com/4.0.0'
      });
      for (let i = 0; i < files.length; i++) {
        progress.textContent = 'กำลังอ่านภาพ ' + (i + 1) + '/' + files.length + ': ' + files[i].name;
        const result = await worker.recognize(files[i]);
        outputs.push('--- ' + files[i].name + ' ---\n' + (result.data.text || ''));
      }
      textArea.value = outputs.join('\n\n');
      progress.textContent = 'อ่านภาพเสร็จ ' + files.length + ' ไฟล์ · ตรวจข้อความก่อนนำเข้า';
      applyStatus.textContent = 'OCR ทำงานในเบราว์เซอร์ ภาพต้นฉบับไม่ได้ถูกส่งหรือบันทึกลงระบบ';
      apply.disabled = false;
    } catch (error) {
      progress.textContent = 'อ่านภาพไม่สำเร็จ: ' + (error.message || error);
    } finally {
      if (worker) await worker.terminate().catch(() => {});
      run.disabled = false;
    }
  });

  apply.addEventListener('click', () => {
    const rows = [...document.querySelectorAll('#rows tr')];
    const lines = thaiDigits(textArea.value).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    let applied = 0;
    const missed = [];
    for (const row of rows) {
      const className = row.querySelector('th')?.textContent?.trim();
      if (!className) continue;
      const matcher = new RegExp(escapeRegExp(className), 'i');
      const source = lines.find(line => matcher.test(line));
      if (!source) { missed.push(className); continue; }
      const afterClass = source.replace(matcher, ' ');
      const values = [...afterClass.matchAll(/\d[\d,]*/g)].map(match => Number(match[0].replace(/,/g, '')));
      if (values.length !== 12 || values.some(value => !Number.isSafeInteger(value) || value < 0)) {
        missed.push(className);
        continue;
      }
      const selected = values.slice(-12);
      const fields = [...row.querySelectorAll('input[data-k]')];
      if (fields.length !== 12) { missed.push(className); continue; }
      fields.forEach((field, index) => {
        field.value = String(selected[index]);
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });
      applied++;
    }
    applyStatus.textContent = applied
      ? 'เติมข้อมูลได้ ' + applied + ' ห้อง · ยังจับคู่ไม่ได้ ' + missed.length + ' ห้อง' + (missed.length ? ': ' + missed.join(', ') : '') + ' · กรุณาตรวจทุกช่องก่อนบันทึก'
      : 'ยังจับคู่แถวข้อมูลไม่ได้ กรุณาตรวจข้อความ OCR หรือกรอกตัวเลขในตารางด้วยตนเอง';
  });

  clear.addEventListener('click', () => {
    textArea.value = '';
    progress.textContent = 'ล้างข้อความ OCR แล้ว';
    applyStatus.textContent = 'ยังไม่มีข้อมูล OCR';
  });
})();