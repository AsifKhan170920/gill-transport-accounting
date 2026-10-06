/* ===================== app modals =====================
   window.UIModal replaces the browser's alert() / confirm() / prompt() with
   in-app dialogs that follow the theme (light / dark) and work on phones.

     UIModal.confirm(text, opts) -> Promise<boolean>
     UIModal.alert(text, opts)   -> Promise<void>
     UIModal.prompt(text, def, opts) -> Promise<string|null>   (null = cancelled)
     UIModal.toast(text)         -> short non-blocking notice

   opts: {title, okText, cancelText, danger:true}. Enter confirms, Esc cancels,
   a click on the backdrop cancels. Only one dialog is shown at a time; a new
   one resolves the previous as cancelled.

   Outside a browser (the Node test harness has no real DOM) every call resolves
   immediately: confirm -> true, prompt -> default, so code paths still run. */
(function (root) {
  'use strict';
  if (root.UIModal && root.UIModal.__v) return;

  var current = null;
  function hasDom() {
    return typeof document !== 'undefined' && document && typeof document.createElement === 'function' &&
      document.body && typeof document.body.appendChild === 'function' && typeof document.addEventListener === 'function';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function close(val) {
    if (!current) return;
    var c = current; current = null;
    try { document.removeEventListener('keydown', c.onKey, true); } catch (e) {}
    try { if (c.el && c.el.parentNode) c.el.parentNode.removeChild(c.el); } catch (e) {}
    try { if (c.focusBack && c.focusBack.focus) c.focusBack.focus(); } catch (e) {}
    c.resolve(val);
  }

  function open(kind, text, opts, def) {
    opts = opts || {};
    if (!hasDom()) {
      return Promise.resolve(kind === 'confirm' ? true : (kind === 'prompt' ? (def == null ? '' : String(def)) : undefined));
    }
    if (current) close(kind === 'alert' ? undefined : (current.kind === 'confirm' ? false : null));
    return new Promise(function (resolve) {
      var ov = document.createElement('div');
      ov.className = 'uim-ov';
      ov.setAttribute('role', 'presentation');
      var title = opts.title || (kind === 'confirm' ? 'Please confirm' : (kind === 'prompt' ? 'Enter a value' : 'Notice'));
      var okText = opts.okText || (kind === 'confirm' ? (opts.danger ? 'Delete' : 'OK') : 'OK');
      var body = esc(text).replace(/\n/g, '<br>');
      ov.innerHTML =
        '<div class="uim" role="' + (kind === 'alert' ? 'alertdialog' : 'dialog') + '" aria-modal="true" aria-labelledby="uimT">' +
          '<div class="uim-h" id="uimT">' + esc(title) + '</div>' +
          '<div class="uim-b">' + body +
            (kind === 'prompt' ? '<input class="uim-in" type="text" value="' + esc(def == null ? '' : def) + '">' : '') +
          '</div>' +
          '<div class="uim-f">' +
            (kind === 'alert' ? '' : '<button type="button" class="btn uim-cancel">' + esc(opts.cancelText || 'Cancel') + '</button>') +
            '<button type="button" class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + ' uim-ok">' + esc(okText) + '</button>' +
          '</div>' +
        '</div>';
      var cancelVal = kind === 'confirm' ? false : (kind === 'prompt' ? null : undefined);
      var okVal = function () {
        if (kind === 'confirm') return true;
        if (kind === 'prompt') { var i = ov.querySelector('.uim-in'); return i ? i.value : ''; }
        return undefined;
      };
      var onKey = function (e) {
        if (!current || current.el !== ov) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(cancelVal); }
        else if (e.key === 'Enter' && !(e.target && e.target.tagName === 'TEXTAREA')) {
          /* Enter on the Cancel button means Cancel */
          if (e.target && e.target.classList && e.target.classList.contains('uim-cancel')) return;
          e.preventDefault(); e.stopPropagation(); close(okVal());
        }
        else if (e.key === 'Tab') { /* keep focus inside the dialog */
          var f = ov.querySelectorAll('button,input'); if (!f.length) return;
          var first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      };
      current = { el: ov, kind: kind, resolve: resolve, onKey: onKey, focusBack: document.activeElement };
      ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(cancelVal); });
      ov.querySelector('.uim-ok').addEventListener('click', function () { close(okVal()); });
      var cb = ov.querySelector('.uim-cancel'); if (cb) cb.addEventListener('click', function () { close(cancelVal); });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(ov);
      setTimeout(function () {
        var inp = ov.querySelector('.uim-in');
        if (inp) { inp.focus(); inp.select(); }
        else { var target = (kind === 'confirm' && opts.danger) ? ov.querySelector('.uim-cancel') : ov.querySelector('.uim-ok'); if (target) target.focus(); }
      }, 0);
    });
  }

  var toastTimer = 0;
  function toast(text) {
    if (!hasDom()) return;
    var t = document.getElementById('uimToast');
    if (!t) { t = document.createElement('div'); t.id = 'uimToast'; t.className = 'uim-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = String(text == null ? '' : text);
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 2600);
  }

  root.UIModal = {
    __v: 1,
    confirm: function (text, opts) { return open('confirm', text, opts); },
    alert: function (text, opts) { return open('alert', text, opts); },
    prompt: function (text, def, opts) { return open('prompt', text, opts, def); },
    toast: toast,
    close: function () { close(current && current.kind === 'confirm' ? false : null); },
    isOpen: function () { return !!current; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
