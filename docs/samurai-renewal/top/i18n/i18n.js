/* 言語の切り替え（ID / EN / JA）。<head> で同期読み込みする。
   選んだ言語は localStorage 'samurai-lang' に残し、どのページでも同じ言語で開く。
   訳は dict-<lang>.js（window.I18N_DICT）。キーは「訳す単位」の日本語の文（空白を詰めたもの）。
   ページの文字は、読み込まれた瞬間（ページのスクリプトが動く前）と、後から JS が足した瞬間に差し替える。 */
(function () {
  var L = 'ja';
  try { var q = new URLSearchParams(location.search).get('lang'); if (q === 'en' || q === 'id' || q === 'ja') localStorage.setItem('samurai-lang', q); L = localStorage.getItem('samurai-lang') || 'ja'; } catch (e) {}
  if (L !== 'en' && L !== 'id') L = 'ja';
  var base = (document.currentScript && document.currentScript.src || '').replace(/[^\/]*$/, '');
  window.I18N = { lang: L, base: base };
  document.documentElement.lang = L;
  function wireLang() {
    document.querySelectorAll('.lang').forEach(function (w) {
      if (w.dataset.wired) return; w.dataset.wired = '1';
      w.innerHTML = '';
      [['id', 'ID'], ['en', 'EN'], ['ja', 'JA']].forEach(function (x) {
        var el = document.createElement(x[0] === L ? 'b' : 'span'); el.textContent = x[1]; el.setAttribute('role', 'button'); el.tabIndex = 0;
        el.setAttribute('aria-label', x[0] === 'ja' ? '日本語' : x[0] === 'en' ? 'English' : 'Bahasa Indonesia');
        el.style.cursor = 'pointer';
        var go = function (e) { e.preventDefault(); e.stopPropagation(); if (x[0] === L) return; try { localStorage.setItem('samurai-lang', x[0]); } catch (er) {} var u = new URL(location.href); u.searchParams.delete('lang'); location.replace(u.href); };
        el.addEventListener('click', go); el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') go(e); });
        w.appendChild(el);
      });
    });
  }
  document.addEventListener('DOMContentLoaded', wireLang);
  if (L === 'ja') return;
  document.write('<script src="' + base + 'dict-' + L + '.js"><\/script>');
  // 英字は両端そろえにすると単語の間が空くので左そろえに
  document.write('<style>html:not([lang=ja]) .tx .t{text-align:left!important}</style>');
  var JP = /[぀-ヿ㐀-鿿！-｠]/;
  var STOP = { A: 1, BUTTON: 1, LABEL: 1, TEXT: 1, TSPAN: 1 };
  var norm = function (s) { return s.replace(/\s+/g, ' ').trim(); };
  var inl = function (el) { var d = getComputedStyle(el).display; return d === 'inline' || d === 'contents'; };
  function unitOf(t) {
    var u = t.parentElement; if (!u || u.closest('script,style,noscript,title')) return null;
    while (u.parentElement && u.parentElement !== document.body && inl(u) && !STOP[u.tagName]) u = u.parentElement;
    return u;
  }
  function kidsOf(u) { var out = []; (function walk(n) { for (var c = n.firstChild; c; c = c.nextSibling) { if (c.nodeType !== 1 || c.tagName === 'BR') continue; if (!JP.test(c.textContent)) out.push(c); else walk(c); } })(u); return out; }
  function ja(n) { if (n.__ja != null) return n.__ja; if (n.nodeType === 3) return n.nodeValue; var s = ''; for (var c = n.firstChild; c; c = c.nextSibling) s += (c.nodeType === 1 || c.nodeType === 3) ? ja(c) : ''; return s; }
  function keyOf(u) { return norm(ja(u)); }
  function apply(u, val) {
    var orig = ja(u);
    var kids = kidsOf(u);
    u.innerHTML = val.replace(/⟦(\d+)(?::[^⟧]*)?⟧/g, function (m, k) { return '<i data-i18k="' + k + '"></i>'; });
    u.querySelectorAll('i[data-i18k]').forEach(function (ph) { var n = kids[+ph.getAttribute('data-i18k')]; if (n) ph.replaceWith(n); else ph.remove(); });
    u.__ja = orig;
  }
  var ATTRS = ['aria-label', 'alt', 'title', 'placeholder'];
  function run(root) {
    var D = window.I18N_DICT; if (!D || !root) return;
    if (root.nodeType === 3) { if (JP.test(root.nodeValue)) { var u0 = unitOf(root); if (u0 && u0.__ja == null && D[keyOf(u0)] != null) apply(u0, D[keyOf(u0)]); } return; }
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    var done = new Set(), tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n, list = [];
    while ((n = tw.nextNode())) if (JP.test(n.nodeValue)) list.push(n);
    list.forEach(function (t) { if (!t.isConnected) return; var u = unitOf(t); if (!u || done.has(u) || u.__ja != null) return; done.add(u); var v = D[keyOf(u)]; if (v != null) apply(u, v); });
    var els = root.querySelectorAll ? root.querySelectorAll('[aria-label],[alt],[title],[placeholder]') : [];
    if (root.nodeType === 1) els = [root].concat([].slice.call(els));
    els.forEach(function (e) { ATTRS.forEach(function (a) { var v = e.getAttribute && e.getAttribute(a); if (v && JP.test(v)) { var t = D[norm(v)]; if (t != null) e.setAttribute(a, t.replace(/<[^>]+>|⟦[^⟧]*⟧/g, '')); } }); });
  }
  function title() { var D = window.I18N_DICT; if (D && JP.test(document.title) && D[norm(document.title)]) document.title = D[norm(document.title)]; }
  window.I18N.run = run;
  var mo = new MutationObserver(function (recs) {
    if (!window.I18N_DICT) return;
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      if (r.type === 'characterData') run(r.target);
      else if (r.type === 'attributes') run(r.target);
      else for (var j = 0; j < r.addedNodes.length; j++) run(r.addedNodes[j]);
    }
    title();
  });
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  document.addEventListener('DOMContentLoaded', function () { title(); run(document.body); });
  addEventListener('load', function () { run(document.body); });
})();
