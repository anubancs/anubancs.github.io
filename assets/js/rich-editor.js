/* School CMS rich-text editor. Quill output is sanitized on save and render. */
(() => {
  const allowedTags = ['p','br','strong','b','em','i','u','s','sub','sup','h1','h2','h3','ol','ul','li','blockquote','a'];
  const allowedAttrs = ['href','target','rel','class'];
  const classPattern = /^(ql-align-(center|right|justify)|ql-indent-[1-8]|ql-first-line-indent-1)$/;
  // A block-level Quill format that persists as a safe class in saved HTML.
  const Parchment = Quill.import('parchment');
  const firstLineIndent = new Parchment.Attributor.Class('firstLineIndent', 'ql-first-line-indent', { scope: Parchment.Scope.BLOCK });
  Quill.register(firstLineIndent, true);
  const sanitize = html => {
    const clean = window.DOMPurify ? DOMPurify.sanitize(String(html || ''), {
      ALLOWED_TAGS: allowedTags, ALLOWED_ATTR: allowedAttrs, ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ['style','script','iframe','object','embed','form','input','button','svg','math']
    }) : String(html || '').replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1\s*>/gi, '');
    const box = document.createElement('div'); box.innerHTML = clean;
    box.querySelectorAll('*').forEach(el => {
      [...el.attributes].forEach(attr => {
        if (attr.name === 'class') {
          const valid = attr.value.split(/\s+/).filter(c => classPattern.test(c));
          if (valid.length) el.className = valid.join(' '); else el.removeAttribute('class');
        }
        if (attr.name === 'href') {
          try { const u = new URL(attr.value, location.href); if (!['https:','http:','mailto:'].includes(u.protocol)) el.removeAttribute('href'); }
          catch { el.removeAttribute('href'); }
        }
      });
      if (el.tagName === 'A' && el.getAttribute('target') === '_blank') el.setAttribute('rel','noopener noreferrer');
    });
    return box.innerHTML;
  };
  const isHtml = value => /<\/?(p|br|strong|b|em|i|u|s|h[1-3]|ol|ul|li|blockquote|a)(\s|>|\/)/i.test(String(value || ''));
  const legacy = value => String(value || '').split(/\r?
/).map(x => x.trim()).filter(Boolean).map(x => '<p>'+escape(x)+'</p>').join('');
  const escape = value => String(value).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const normalize = value => isHtml(value) ? sanitize(value) : legacy(value);
  const editors = new WeakMap();
  function init(textarea, options={}) {
    if (!textarea || editors.has(textarea)) return editors.get(textarea);
    const host = document.createElement('div'); host.className='school-rich-editor';
    const editorNode = document.createElement('div'); editorNode.className='school-rich-editor__surface';
    textarea.parentNode.insertBefore(host, textarea); host.appendChild(editorNode);
    textarea.classList.add('school-rich-editor__source'); textarea.setAttribute('aria-hidden','true');
    const quill = new Quill(editorNode, {theme:'snow', placeholder:options.placeholder || textarea.placeholder || 'พิมพ์ข้อความที่นี่...', modules:{toolbar:{container:[['bold','italic','underline','strike'],[{header:[1,2,3,false]}],[{list:'ordered'},{list:'bullet'}],[{align:[]}],[{indent:'-1'},{indent:'+1'}],['firstLineIndent'],['blockquote'],['link'],['clean']],handlers:{firstLineIndent:function(){const range=this.quill.getSelection(true);if(!range)return;const active=this.quill.getFormat(range).firstLineIndent;this.quill.formatLine(range.index,Math.max(range.length,1),'firstLineIndent',active?'': '1','user');}}}}});
    const indentButton=host.querySelector('.ql-firstLineIndent');
    if(indentButton){indentButton.type='button';indentButton.title='เยื้องบรรทัดแรก';indentButton.setAttribute('aria-label','เยื้องบรรทัดแรก');indentButton.textContent='⇥';}
    const initial=textarea.value; quill.root.innerHTML=normalize(initial);
    const sync=()=>{textarea.value=sanitize(quill.root.innerHTML);textarea.dispatchEvent(new Event('input',{bubbles:true}));};
    quill.on('text-change',sync);
    const api={quill,getHTML:()=>sanitize(quill.root.innerHTML),setHTML:value=>{quill.root.innerHTML=normalize(value);sync();}};
    editors.set(textarea,api); return api;
  }
  function initAll(root=document){root.querySelectorAll('textarea[data-rich-text]').forEach(el=>init(el));}
  window.SchoolRichEditor={init,initAll,sanitize,normalize,getHTML:el=>editors.get(el)?.getHTML() ?? sanitize(el?.value || ''),setHTML:(el,v)=>{const api=editors.get(el);if(api)api.setHTML(v);else if(el)el.value=v;}};
  window.SchoolRichContent={sanitize,normalize};
  document.addEventListener('DOMContentLoaded',()=>initAll());
})();