/* ===================== App modals (replace window.alert / confirm / prompt) =====================
   window.UIModal
     .alert(text)                -> Promise<void>
     .confirm(text, opts?)       -> Promise<boolean>   opts {ok:'Delete', danger:true, title}
     .prompt(text, def?, opts?)  -> Promise<string|null>
     .gate(text, rerun, opts?)   -> boolean (sync)  for legacy `if(!confirm(x)) return;` code:
         returns false and opens the modal; on OK it calls rerun() once, during which
         gate(text) returns true so the same code path runs through.
   Styling uses the app's .app-modal classes and CSS tokens (light + dark).
   window.alert is routed here too, so no native browser dialog is left in the app.
   ============================================================================================ */
(function(global){
  'use strict';
  var nativeAlert = global.alert;
  var pass = null;          // text currently allowed through by gate()
  var ppass = null;         // answer handed back by promptGate() on its rerun
  var stack = [];
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function body(text){ return esc(text).replace(/\n/g,'<br>'); }

  function open(o){
    var d=global.document; if(!d || !d.body || !d.createElement){ return Promise.resolve(o.kind==='confirm' ? true : (o.kind==='prompt' ? (o.def||'') : undefined)); }
    return new Promise(function(resolve){
      var ov=d.createElement('div'); ov.className='app-modal-ov ui-modal-ov'; ov.setAttribute('role','dialog'); ov.setAttribute('aria-modal','true');
      ov.style.zIndex=String(1300+stack.length);
      var okLbl=o.ok || (o.kind==='alert' ? 'OK' : (o.kind==='prompt' ? 'OK' : 'OK'));
      ov.innerHTML='<div class="app-modal ui-modal" style="width:440px">'+
        (o.title ? '<div class="app-modal-h">'+esc(o.title)+'</div>' : '')+
        '<div class="app-modal-b"><div class="ui-modal-text">'+body(o.text)+'</div>'+
        (o.kind==='prompt' ? '<input type="text" class="ui-modal-in" value="'+esc(o.def==null?'':o.def)+'" style="width:100%;margin-top:10px">' : '')+'</div>'+
        '<div class="app-modal-f"><span style="flex:1"></span>'+
        (o.kind!=='alert' ? '<button type="button" class="btn ui-modal-cancel">'+esc(o.cancel||'Cancel')+'</button>' : '')+
        '<button type="button" class="btn '+(o.danger?'btn-danger':'btn-primary')+' ui-modal-ok">'+esc(okLbl)+'</button></div></div>';
      var done=false, prevFocus=d.activeElement;
      function close(v){ if(done) return; done=true; d.removeEventListener('keydown',onKey,true);
        if(ov.parentNode) ov.parentNode.removeChild(ov); stack.splice(stack.indexOf(ov),1);
        try{ if(prevFocus && prevFocus.focus) prevFocus.focus(); }catch(e){}
        resolve(v); }
      function okVal(){ if(o.kind==='confirm') return true; if(o.kind==='prompt'){ var i=ov.querySelector('.ui-modal-in'); return i?i.value:''; } return undefined; }
      function noVal(){ return o.kind==='confirm' ? false : (o.kind==='prompt' ? null : undefined); }
      function onKey(e){ if(stack[stack.length-1]!==ov) return;
        if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); close(noVal()); }
        else if(e.key==='Enter'){ e.preventDefault(); e.stopPropagation(); close(okVal()); } }
      ov.addEventListener('mousedown',function(e){ if(e.target===ov) close(noVal()); });
      ov.querySelector('.ui-modal-ok').onclick=function(){ close(okVal()); };
      var c=ov.querySelector('.ui-modal-cancel'); if(c) c.onclick=function(){ close(noVal()); };
      d.addEventListener('keydown',onKey,true);
      d.body.appendChild(ov); stack.push(ov);
      setTimeout(function(){ try{ var f=ov.querySelector('.ui-modal-in')||ov.querySelector('.ui-modal-ok'); f.focus(); if(f.select) f.select(); }catch(e){} },0);
    });
  }

  var UIModal = {
    alert:function(text,opts){ opts=opts||{}; return open({kind:'alert', text:text, title:opts.title, ok:opts.ok}); },
    confirm:function(text,opts){ opts=opts||{}; return open({kind:'confirm', text:text, title:opts.title, ok:opts.ok, cancel:opts.cancel, danger:opts.danger}); },
    prompt:function(text,def,opts){ opts=opts||{}; return open({kind:'prompt', text:text, def:def, title:opts.title, ok:opts.ok}); },
    gate:function(text,rerun,opts){
      if(pass!==null && pass===String(text)){ pass=null; return true; }
      opts=opts||{}; if(opts.danger==null && /\bdelete|remove|undo|reset|discard/i.test(String(text))) opts.danger=true;
      UIModal.confirm(text,opts).then(function(ok){ if(!ok || typeof rerun!=='function') return;
        pass=String(text); try{ rerun(); } finally { pass=null; } });
      return false; },
    /* prompt twin of gate(): returns null and asks; on OK reruns with the answer returned once */
    promptGate:function(text,def,rerun){
      if(ppass!==null){ var v=ppass; ppass=null; return v; }
      UIModal.prompt(text,def).then(function(v){ if(v==null || typeof rerun!=='function') return;
        ppass=String(v); try{ rerun(); } finally { ppass=null; } });
      return null; },
    isOpen:function(){ return stack.length>0; },
    _nativeAlert:nativeAlert
  };
  global.UIModal = UIModal;
  /* every remaining alert(...) in the app goes to the modal (non-blocking; callers return right after) */
  if(global.document && global.document.createElement) global.alert = function(m){ UIModal.alert(m); };
})(typeof window!=='undefined' ? window : this);
