
(function(){
  "use strict";
  var INDEX = window.YR_INDEX || [];
  var bySlug = {};
  INDEX.forEach(function(it){ bySlug[it.slug] = it; });
  function all(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function one(sel, root){ return (root || document).querySelector(sel); }

  /* ---------- safe storage ----------
     Accessing Web Storage can THROW in sandboxed viewers (in-app preview
     panes, locked-down iframes), and one throw here would kill the whole
     script — search, stash, and filters all silently dead. Every read and
     write therefore goes through this helper: it probes support once and
     falls back to plain memory when storage is unavailable. This helper
     is the ONLY code in this script that touches the storage API. */
  var store = (function(){
    var mem = {};
    var ok = false;
    try {
      window.localStorage.setItem('__yr_probe__', '1');
      ok = true;
      try { window.localStorage.removeItem('__yr_probe__'); } catch(e){}
    } catch(e){ ok = false; }
    return {
      get: function(k){
        if(ok){ try { return window.localStorage.getItem(k); } catch(e){} }
        return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
      },
      set: function(k, v){
        mem[k] = v;
        if(ok){ try { window.localStorage.setItem(k, v); } catch(e){} }
      }
    };
  })();

  /* ---------- shared overlay plumbing ---------- */
  var backdrop = one('[data-yr-backdrop]');
  var lastFocus = null;
  function showBackdrop(){ if(backdrop) backdrop.hidden = false; }
  function hideBackdropIfIdle(){
    var s = one('#yr-search'), d = one('#yr-stash');
    if(backdrop && (!s || s.hidden) && (!d || d.hidden)) backdrop.hidden = true;
  }

  function reducedMotion(){
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* ---------- rotating announcement bar (pauses on hover/focus; static under reduced motion) ---------- */
  var ann = one('[data-yr-announce]');
  if(ann){
    var annMsgs = all('[data-yr-ann-msg]', ann);
    if(annMsgs.length > 1 && !reducedMotion()){
      var annIdx = 0, annTimer = null;
      var annShow = function(i){
        annMsgs.forEach(function(m, j){ m.hidden = j !== i; });
        annIdx = i;
      };
      var annStart = function(){
        if(!annTimer) annTimer = window.setInterval(function(){ annShow((annIdx + 1) % annMsgs.length); }, 5000);
      };
      var annStop = function(){
        if(annTimer){ window.clearInterval(annTimer); annTimer = null; }
      };
      ann.addEventListener('mouseenter', annStop);
      ann.addEventListener('mouseleave', annStart);
      ann.addEventListener('focusin', annStop);
      ann.addEventListener('focusout', annStart);
      annStart();
    }
  }

  /* ---------- aisle filters: rarity + stock, ?tier= deep-linkable ---------- */
  all('[data-yr-filters]').forEach(function(bar){
    var grid = document.getElementById(bar.getAttribute('data-yr-filters'));
    if(!grid) return;
    var wrap = grid.parentElement;
    var empty = wrap ? wrap.querySelector('[data-yr-empty]') : null;
    var count = bar.querySelector('[data-yr-count]');
    var stockBtn = bar.querySelector('[data-yr-stock]');
    var tierBtns = all('[data-yr-tier]', bar);
    var cards = all('.yr-card', grid);
    var tier = 'all', stock = false;
    function setGroup(btns, attr, val){
      btns.forEach(function(b){
        var on = b.getAttribute(attr) === val;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    function apply(){
      var shown = 0;
      cards.forEach(function(c){
        var okT = tier === 'all' || c.getAttribute('data-tier') === tier;
        var okS = !stock || c.getAttribute('data-stock') === 'current';
        var vis = okT && okS;
        c.style.display = vis ? '' : 'none';
        if(vis){
          shown++;
          c.classList.remove('yr-in');
          void c.offsetWidth;
          c.classList.add('yr-in');
        }else{
          c.classList.remove('yr-in');
        }
      });
      if(count) count.textContent = 'Showing ' + shown + ' of ' + cards.length + ' finds';
      if(empty) empty.hidden = shown > 0;
    }
    tierBtns.forEach(function(b){
      b.addEventListener('click', function(){
        tier = b.getAttribute('data-yr-tier');
        setGroup(tierBtns, 'data-yr-tier', tier);
        apply();
      });
    });
    if(stockBtn) stockBtn.addEventListener('click', function(){
      stock = !stock;
      stockBtn.classList.toggle('on', stock);
      stockBtn.setAttribute('aria-pressed', stock ? 'true' : 'false');
      apply();
    });
    var params = new URLSearchParams(window.location.search);
    var qTier = params.get('tier');
    if(qTier && tierBtns.some(function(b){ return b.getAttribute('data-yr-tier') === qTier; })){
      tier = qTier;
      setGroup(tierBtns, 'data-yr-tier', tier);
    }
    apply();
  });

  /* ---------- featured rail: prev/next scroll the snap rail ---------- */
  all('[data-yr-rail]').forEach(function(rail){
    var railWrap = rail.closest ? rail.closest('.yr-railwrap') : null;
    if(!railWrap) return;
    var prev = railWrap.querySelector('[data-yr-rail-prev]');
    var next = railWrap.querySelector('[data-yr-rail-next]');
    var step = function(){ return Math.max(240, Math.floor(rail.clientWidth * 0.8)); };
    var behavior = function(){ return reducedMotion() ? 'auto' : 'smooth'; };
    if(prev) prev.addEventListener('click', function(){ rail.scrollBy({left: -step(), behavior: behavior()}); });
    if(next) next.addEventListener('click', function(){ rail.scrollBy({left: step(), behavior: behavior()}); });
  });

  /* ---------- product-page quantity stepper ---------- */
  all('[data-yr-stepper]').forEach(function(st){
    var val = st.querySelector('[data-qty-val]');
    var dec = st.querySelector('[data-qty-dec]');
    var inc = st.querySelector('[data-qty-inc]');
    if(!val) return;
    function setQty(n){
      n = Math.min(99, Math.max(1, n || 1));
      val.textContent = n;
      if(dec) dec.disabled = n <= 1;
    }
    if(inc) inc.addEventListener('click', function(){ setQty((parseInt(val.textContent, 10) || 1) + 1); });
    if(dec) dec.addEventListener('click', function(){ setQty((parseInt(val.textContent, 10) || 1) - 1); });
    setQty(1);
  });

  /* ---------- listing sort: Featured / Name / Year / Tier ----------
     Reorders the grid's card nodes in place; the filter block above keeps
     working because it holds element references, not positions. Year reads
     the build-time data-year (first 4-digit year in the item's years
     string); items with no stated year always sort last. All sorts are
     stable — ties keep the featured order. */
  all('[data-yr-sort]').forEach(function(sel){
    var grid = document.getElementById(sel.getAttribute('data-yr-sort'));
    if(!grid) return;
    sel.addEventListener('change', function(){
      var mode = sel.value;
      var cards = all('.yr-card', grid);
      var orig = cards.slice();
      function yearOf(c){
        var y = parseInt(c.getAttribute('data-year'), 10);
        return isNaN(y) ? null : y;
      }
      var sorted = cards.slice();
      sorted.sort(function(a, b){
        var r = 0;
        if(mode === 'name'){
          var na = (a.getAttribute('data-name') || '').toLowerCase();
          var nb = (b.getAttribute('data-name') || '').toLowerCase();
          r = na < nb ? -1 : (na > nb ? 1 : 0);
        }else if(mode === 'year'){
          var ya = yearOf(a), yb = yearOf(b);
          if(ya === null && yb === null) r = 0;
          else if(ya === null) r = 1;
          else if(yb === null) r = -1;
          else r = ya - yb;
        }else if(mode === 'tier'){
          r = (parseInt(a.getAttribute('data-tier-rank'), 10) || 0)
            - (parseInt(b.getAttribute('data-tier-rank'), 10) || 0);
        }
        return r !== 0 ? r : orig.indexOf(a) - orig.indexOf(b);
      });
      sorted.forEach(function(c){ grid.appendChild(c); });
    });
  });

  /* ---------- share this find: Web Share API, clipboard fallback ---------- */
  all('[data-yr-share]').forEach(function(btn){
    var wrap = btn.parentElement;
    var note = wrap ? wrap.querySelector('[data-yr-share-note]') : null;
    var noteTimer = null;
    function say(msg){
      if(!note) return;
      note.textContent = msg;
      if(noteTimer) window.clearTimeout(noteTimer);
      if(msg) noteTimer = window.setTimeout(function(){ note.textContent = ''; }, 2600);
    }
    function legacyCopy(url, done){
      if(typeof document.execCommand !== 'function' || !document.body){ done(false); return; }
      try {
        var ta = document.createElement('textarea');
        ta.value = url;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        var okCopy = false;
        try { okCopy = !!document.execCommand('copy'); } catch(e){ okCopy = false; }
        document.body.removeChild(ta);
        done(okCopy);
      } catch(e){ done(false); }
    }
    function copyLink(url){
      var finish = function(okCopy){
        say(okCopy ? 'Link copied' : 'Copy failed — the link lives in your address bar');
      };
      if(typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText){
        var p = null;
        try { p = navigator.clipboard.writeText(url); } catch(e){ p = null; }
        if(p && p.then) p.then(function(){ finish(true); }, function(){ legacyCopy(url, finish); });
        else if(p) finish(true);
        else legacyCopy(url, finish);
      }else{
        legacyCopy(url, finish);
      }
    }
    btn.addEventListener('click', function(){
      var url = btn.getAttribute('data-share-url') || window.location.href;
      var title = btn.getAttribute('data-share-title') || document.title;
      if(typeof navigator !== 'undefined' && navigator.share){
        var pr = null;
        try { pr = navigator.share({title: title, url: url}); } catch(e){ pr = null; }
        if(pr && pr.catch) pr.catch(function(){});
      }else{
        copyLink(url);
      }
    });
  });

  /* ---------- search ---------- */
  var searchBox = one('#yr-search');
  var searchBtn = one('[data-yr-search-open]');
  var searchInput = one('#yr-search-input');
  var searchResults = one('[data-yr-results]');
  var searchStatus = one('[data-yr-search-status]');
  function renderSearch(){
    if(!searchResults || !searchInput) return;
    var raw = searchInput.value || '';
    var q = raw.trim().toLowerCase();
    var res = !q ? INDEX.slice() : INDEX.filter(function(it){
      var hay = (it.name + ' ' + it.maker + ' ' + it.brand + ' ' + it.parent + ' ' + it.aisleLabel + ' ' + it.origin + ' ' + it.hook).toLowerCase();
      return q.split(/\s+/).every(function(tok){ return hay.indexOf(tok) !== -1; });
    });
    searchResults.innerHTML = '';
    res.forEach(function(it){
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = it.url;
      var strong = document.createElement('strong');
      strong.textContent = it.name;
      var span = document.createElement('span');
      span.textContent = it.maker + ' \u00B7 ' + it.aisleLabel + ' \u00B7 ' + it.origin + ' \u00B7 ' + it.tierLabel;
      a.appendChild(strong);
      a.appendChild(span);
      li.appendChild(a);
      searchResults.appendChild(li);
    });
    if(searchStatus){
      if(!q) searchStatus.textContent = 'All ' + INDEX.length + ' finds \u2014 start typing to narrow by snack, maker, or flavor.';
      else if(res.length) searchStatus.textContent = res.length + (res.length === 1 ? ' find matches' : ' finds match') + ' \u201C' + raw.trim() + '\u201D.';
      else searchStatus.textContent = 'No finds match \u201C' + raw.trim() + '\u201D yet \u2014 try a maker, a flavor, or an aisle name.';
    }
  }
  function openSearch(){
    if(!searchBox) return;
    lastFocus = document.activeElement;
    searchBox.hidden = false;
    showBackdrop();
    if(searchBtn) searchBtn.setAttribute('aria-expanded', 'true');
    renderSearch();
    if(searchInput) searchInput.focus();
  }
  function closeSearch(){
    if(!searchBox || searchBox.hidden) return;
    searchBox.hidden = true;
    hideBackdropIfIdle();
    if(searchBtn) searchBtn.setAttribute('aria-expanded', 'false');
    if(lastFocus && lastFocus.focus) lastFocus.focus();
  }
  if(searchBtn) searchBtn.addEventListener('click', openSearch);
  var searchClose = one('[data-yr-search-close]');
  if(searchClose) searchClose.addEventListener('click', closeSearch);
  if(searchInput) searchInput.addEventListener('input', renderSearch);

  /* ---------- stash (cart-grade UI; checkout is a launch placeholder) ---------- */
  var KEY = 'yumrare-stash-v1';
  var drawer = one('#yr-stash');
  var stashBtn = one('[data-yr-stash-open]');
  var stash = {};
  try { stash = JSON.parse(store.get(KEY) || '{}') || {}; } catch(e){ stash = {}; }
  Object.keys(stash).forEach(function(k){ if(!bySlug[k] || !(stash[k] > 0)) delete stash[k]; });
  function saveStash(){ store.set(KEY, JSON.stringify(stash)); }
  function totalQty(){ return Object.keys(stash).reduce(function(n, k){ return n + (stash[k] || 0); }, 0); }
  function renderStash(){
    var badge = one('[data-yr-stash-count]');
    var n = totalQty();
    if(badge){ badge.textContent = n; badge.hidden = n === 0; }
    if(stashBtn) stashBtn.setAttribute('aria-label', 'Open your stash' + (n ? ' (' + n + ' item' + (n === 1 ? '' : 's') + ')' : ''));
    var list = one('[data-yr-stash-list]');
    if(!list) return;
    var empty = one('[data-yr-stash-empty]');
    var slugs = Object.keys(stash).filter(function(s){ return stash[s] > 0 && bySlug[s]; });
    if(empty) empty.hidden = slugs.length > 0;
    list.innerHTML = '';
    slugs.forEach(function(slug){
      var it = bySlug[slug];
      var li = document.createElement('li');
      li.className = 'yr-stash-item';
      var a = document.createElement('a');
      a.className = 'yr-stash-name';
      a.href = it.url;
      a.textContent = it.name;
      var meta = document.createElement('span');
      meta.className = 'yr-stash-meta';
      meta.textContent = it.aisleLabel + ' \u00B7 ' + it.origin + ' \u00B7 ' + it.tierLabel;
      var ctl = document.createElement('div');
      ctl.className = 'yr-qty';
      var dec = document.createElement('button');
      dec.type = 'button';
      dec.textContent = '\u2212';
      dec.setAttribute('aria-label', 'One less ' + it.name);
      dec.setAttribute('data-dec', slug);
      var qty = document.createElement('span');
      qty.className = 'yr-qty-n';
      qty.textContent = stash[slug];
      var inc = document.createElement('button');
      inc.type = 'button';
      inc.textContent = '+';
      inc.setAttribute('aria-label', 'One more ' + it.name);
      inc.setAttribute('data-inc', slug);
      var rem = document.createElement('button');
      rem.type = 'button';
      rem.className = 'yr-remove';
      rem.textContent = 'Remove';
      rem.setAttribute('aria-label', 'Remove ' + it.name + ' from your stash');
      rem.setAttribute('data-remove', slug);
      ctl.appendChild(dec);
      ctl.appendChild(qty);
      ctl.appendChild(inc);
      li.appendChild(a);
      li.appendChild(meta);
      li.appendChild(ctl);
      li.appendChild(rem);
      list.appendChild(li);
    });
    var total = one('[data-yr-stash-total]');
    if(total) total.textContent = slugs.length ? ('Total items: ' + n) : '';
  }
  function openStash(){
    if(!drawer) return;
    lastFocus = document.activeElement;
    drawer.hidden = false;
    showBackdrop();
    if(stashBtn) stashBtn.setAttribute('aria-expanded', 'true');
    var c = one('[data-yr-stash-close]');
    if(c) c.focus();
  }
  function closeStash(){
    if(!drawer || drawer.hidden) return;
    drawer.hidden = true;
    hideBackdropIfIdle();
    if(stashBtn) stashBtn.setAttribute('aria-expanded', 'false');
    if(lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function addToStash(slug, n){
    if(!bySlug[slug]) return;
    stash[slug] = (stash[slug] || 0) + (n || 1);
    saveStash();
    renderStash();
    openStash();
  }
  document.addEventListener('click', function(e){
    var t = e.target;
    if(!t || !t.closest) return;
    var add = t.closest('[data-stash-add]');
    if(add){
      var n = 1;
      if(add.getAttribute('data-stash-with-qty')){
        var scope = (add.closest && add.closest('[data-yr-product]')) || document;
        var qv = scope.querySelector('[data-qty-val]');
        if(qv) n = Math.max(1, parseInt(qv.textContent, 10) || 1);
      }
      addToStash(add.getAttribute('data-stash-add'), n);
      return;
    }
    var inc = t.closest('[data-inc]');
    if(inc){ var s1 = inc.getAttribute('data-inc'); stash[s1] = (stash[s1] || 0) + 1; saveStash(); renderStash(); return; }
    var dec = t.closest('[data-dec]');
    if(dec){
      var s2 = dec.getAttribute('data-dec');
      stash[s2] = Math.max(0, (stash[s2] || 0) - 1);
      if(!stash[s2]) delete stash[s2];
      saveStash();
      renderStash();
      return;
    }
    var rem = t.closest('[data-remove]');
    if(rem){ delete stash[rem.getAttribute('data-remove')]; saveStash(); renderStash(); return; }
  });
  if(stashBtn) stashBtn.addEventListener('click', openStash);
  var stashClose = one('[data-yr-stash-close]');
  if(stashClose) stashClose.addEventListener('click', closeStash);
  if(backdrop) backdrop.addEventListener('click', function(){ closeSearch(); closeStash(); });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape'){ closeSearch(); closeStash(); }
  });
  renderStash();
})();
