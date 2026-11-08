/** Public image chooser for the school's Google Drive personnel library. */
(() => {
  const endpoint = window.SCHOOL_GAS_WEB_APP_URL;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function loadFiles(moduleName) {
    return new Promise((resolve, reject) => {
      if (!endpoint) return reject(new Error('ไม่พบ URL ของ Google Drive'));
      let settled = false;
      const script = document.createElement('script');
      const cleanup = () => { script.remove(); clearTimeout(timer); window.schoolDriveFilesCallback = null; };
      const finish = (fn, value) => { if (settled) return; settled = true; cleanup(); fn(value); };
      window.schoolDriveFilesCallback = payload => {
        if (!payload?.ok || !Array.isArray(payload.files)) return finish(reject, new Error(payload?.error || 'ไม่สามารถอ่านคลังภาพได้'));
        finish(resolve, payload.files);
      };
      script.onerror = () => finish(reject, new Error('เชื่อมต่อคลังภาพ Google Drive ไม่สำเร็จ'));
      script.src = endpoint + '?action=files&library=' + encodeURIComponent(moduleName) + '&callback=schoolDriveFilesCallback&_=' + Date.now();
      const timer = setTimeout(() => finish(reject, new Error('หมดเวลารอรายการภาพจาก Google Drive')), 20000);
      document.head.appendChild(script);
    });
  }
  async function choose(options = {}) {
    if (!window.Swal) throw new Error('ไม่พบหน้าต่างเลือกภาพ');
    const files = await loadFiles(options.module || 'personnel');
    if (!files.length) {
      await Swal.fire('ยังไม่มีภาพในคลัง', 'ไม่พบไฟล์ JPG, PNG, WEBP หรือ GIF ในโฟลเดอร์ภาพบุคลากร', 'info');
      return null;
    }
    let selected = null;
    const cards = files.map(file => '<button type="button" data-drive-file="' + esc(file.id) + '" class="drive-library-card text-left border rounded-xl p-2 hover:border-pink-500 focus:outline-none" style="border-color:#e5d5da">' +
      '<img src="' + esc(file.url) + '" alt="" loading="lazy" style="width:100%;height:112px;object-fit:cover;border-radius:8px;background:#f8edf1" onerror="this.style.opacity=.25">' +
      '<span class="block text-xs mt-2 break-all">' + esc(file.name) + '</span><span class="block text-xs opacity-60">' + new Date(file.updatedAt).toLocaleDateString('th-TH') + '</span></button>').join('');
    const result = await Swal.fire({
      title: 'เลือกภาพจาก Google Drive',
      html: '<p class="text-sm opacity-70 mb-3">เลือกภาพที่ต้องการใช้เป็นรูปบุคลากร</p><div id="drive-library-grid" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;max-height:55vh;overflow:auto;text-align:left">' + cards + '</div><p id="drive-library-selected" class="text-sm mt-3 opacity-70">ยังไม่ได้เลือกภาพ</p>',
      width: 760, showCancelButton: true, confirmButtonText: 'ใช้ภาพนี้', cancelButtonText: 'ยกเลิก',
      didOpen: () => {
        const grid = document.getElementById('drive-library-grid');
        const note = document.getElementById('drive-library-selected');
        grid.addEventListener('click', event => {
          const card = event.target.closest('[data-drive-file]');
          if (!card) return;
          selected = files.find(file => file.id === card.dataset.driveFile) || null;
          grid.querySelectorAll('[data-drive-file]').forEach(node => { node.style.borderColor = node === card ? '#984761' : '#e5d5da'; node.style.background = node === card ? '#fff2f6' : ''; });
          note.textContent = selected ? 'เลือกแล้ว: ' + selected.name : 'ยังไม่ได้เลือกภาพ';
        });
      },
      preConfirm: () => {
        if (!selected) { Swal.showValidationMessage('กรุณาเลือกภาพก่อน'); return false; }
        return selected;
      }
    });
    if (!result.isConfirmed || !result.value) return null;
    const target = document.querySelector(options.target || '');
    if (!target) throw new Error('ไม่พบช่อง URL รูปภาพ');
    target.value = result.value.url;
    target.dispatchEvent(new Event('input', {bubbles:true}));
    target.dispatchEvent(new Event('change', {bubbles:true}));
    const preview = document.querySelector(options.preview || '');
    if (preview) { preview.src = result.value.url; preview.classList.remove('hidden'); }
    const status = document.querySelector(options.status || '');
    if (status) status.textContent = 'เลือกภาพจาก Google Drive แล้ว: ' + result.value.name;
    return result.value;
  }
  window.schoolDriveLibrary = {choose, loadFiles};
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-drive-library]');
    if (!button) return;
    event.preventDefault();
    button.disabled = true;
    const status = document.querySelector(button.dataset.driveStatus || '');
    if (status) status.textContent = 'กำลังโหลดคลังภาพ Google Drive...';
    try {
      await choose({module:button.dataset.driveLibrary,target:button.dataset.driveTarget,preview:button.dataset.drivePreview,status:button.dataset.driveStatus});
    } catch (error) {
      if (status) status.textContent = error.message;
      Swal.fire('เลือกภาพไม่สำเร็จ', error.message, 'error');
    } finally { button.disabled = false; }
  });
})();
