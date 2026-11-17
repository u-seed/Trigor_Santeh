(function () {
'use strict';
var SUPS = [
  { id: 'trigor', name: 'Тригор', logo: ['TRI', 'GOR'], data: window.CATALOG },
  { id: 'dionis', name: 'Дионис', logo: ['DIO', 'NIS'], data: window.CATALOG_DIONIS }
].filter(function (x) { return x.data; });
var SUP = {};
SUPS.forEach(function (x) { SUP[x.id] = x; x.data.items.forEach(function (i) { i.sup = x.id; }); });
var ALL = [].concat.apply([], SUPS.map(function (x) { return x.data.items; }));   // оба прайса: для корзины и поиска по ключу
var ITEMS = [], META = {};                                                          // текущий прайс (выбран переключателем)
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var nf = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
var money = function (n) { return '$' + nf.format(n); };               // доллары — как в прайсе
var DEFAULT_RATE = 450;                                                  // курс по умолчанию, ₸ за $ (меняется в приложении)
var rate = function () { var r = parseFloat(String(settings.rate).replace(',', '.')); return r > 0 ? r : DEFAULT_RATE; };
var kzt = function (usd) { return new Intl.NumberFormat('ru-RU').format(Math.round(usd * rate())).replace(/\u00a0/g, ' ') + ' ₸'; };  // тенге — основная валюта
var int = function (n) { return new Intl.NumberFormat('ru-RU').format(n); };

/* ---------- безопасное хранилище ---------- */
var store = {
  get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

var byId = {}, byKey = {};
ALL.forEach(function (i) { byId[i.id] = i; byKey[i.key] = i; });

/* ---------- справочники ---------- */
var COLOR_HEX = { 'Хром': 'linear-gradient(135deg,#f3f5f7,#aeb6bf)', 'Чёрный': '#1c1c1e', 'Золото': 'linear-gradient(135deg,#e6c872,#b8902f)',
  'Графит': '#5a5f66', 'Сатин': 'linear-gradient(135deg,#d8d2c4,#a79f8d)', 'Белый': '#fbfbfa', 'Серый': '#9ca1a8',
  'Бронза': 'linear-gradient(135deg,#a77649,#6e4528)', 'Другой': 'conic-gradient(#d9b38c,#9db8a0,#9aa7c8,#d9b38c)' };
var COLOR_ORDER = ['Хром', 'Чёрный', 'Золото', 'Графит', 'Серый', 'Белый', 'Сатин', 'Бронза', 'Другой'];
var MAT_ORDER = ['Латунь', 'Цинк', 'Нержавейка', 'Пластик', 'Силикон', 'Не указан'];
var PRESETS = [{ l: 'до 5 000 ₸', a: 0, b: 5000 }, { l: '5–10 тыс', a: 5000, b: 10000 }, { l: '10–20 тыс', a: 10000, b: 20000 }, { l: 'от 20 тыс', a: 20000, b: null }];  // в тенге
var SYN = { 'битые': 'биде', 'бидэ': 'биде', 'бидет': 'биде', 'биди': 'биде', 'душ': 'душ', 'лейки': 'лейк' };
var ICON_IMG = '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/></svg>';
var NOIMG = '<div class="noimg">' + ICON_IMG + '<span>фото нет в прайсе</span></div>';

/* ---------- состояние ---------- */
var S = {
  sup: store.get('sup', 'trigor'), tab: 'all', q: '', color: {}, mat: {}, kit: {}, extra: {}, pmin: null, pmax: null,
  sort: store.get('sort', 'pdf'), view: store.get('view', 'grid')
};
var cart = store.get('cart', {});   // key -> qty
var settings = store.get('settings', { rate: String(DEFAULT_RATE), budget: '' });
if (!(parseFloat(settings.rate) > 0)) settings.rate = String(DEFAULT_RATE);
(function cleanCart() {
  var lost = 0;
  Object.keys(cart).forEach(function (k) { if (!byKey[k] || !(cart[k] > 0)) { delete cart[k]; lost++; } });
  if (lost) { store.set('cart', cart); setTimeout(function () { toast('Некоторых товаров из корзины нет в новом прайсе: ' + lost); }, 600); }
})();

/* ---------- поиск ---------- */
function nz(s) {
  return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/(\d)\s*в\s*1(?!\d)/g, '$1в1').replace(/[«»"“”(),;:]+/g, ' ').replace(/\s+/g, ' ').trim();
}
var LAT = { 'а': 'a', 'в': 'b', 'с': 'c', 'е': 'e', 'н': 'h', 'к': 'k', 'м': 'm', 'о': 'o', 'р': 'p', 'т': 't', 'х': 'x', 'у': 'y' };
function latin(s) { return s.toLowerCase().replace(/[-_\s.]/g, '').replace(/[а-я]/g, function (c) { return LAT[c] || c; }); }
ALL.forEach(function (i) {
  var syn = i.cat === 'Биде' ? ' бидэ битые гигиенический' : '';
  // основной поиск — без строки «В комплекте…» (иначе «лейка» находит все душевые стойки, у которых она в комплекте)
  var core = i.desc.replace(/в\s*комплекте.*$/i, '');
  var extra = [i.art, i.title, i.cat, i.mat, i.color, i.kit, i.cart && ('картридж ' + i.cart), i.surface].join(' ') + syn;
  i._hay = nz(core + ' ' + extra);
  i._hayFull = nz(i.desc + ' ' + extra);
  i._art = latin(i.art);
});
function stem(t) {
  if (SYN[t]) t = SYN[t];
  if (/\d/.test(t)) return t;
  if (t.length >= 7) return t.slice(0, -2);
  if (t.length >= 5) return t.slice(0, -1);
  return t;
}
function searchTokens(q) { return nz(q).split(' ').filter(Boolean).map(stem); }
function matchQ(i, toks, full) {
  var hay = full ? i._hayFull : i._hay;
  for (var k = 0; k < toks.length; k++) {
    var t = toks[k];
    if (hay.indexOf(t) !== -1) continue;
    if (/\d/.test(t) && i._art.indexOf(latin(t)) !== -1) continue;
    return false;
  }
  return true;
}

/* ---------- фильтрация ---------- */
function inTab(i) { return S.tab === 'all' || i.cat === S.tab; }
function has(o) { return Object.keys(o).length > 0; }
function passes(i, skip, toks, full) {
  if (skip !== 'color' && has(S.color) && !S.color[i.color || 'Другой']) return false;
  if (skip !== 'mat' && has(S.mat) && !S.mat[i.mat]) return false;
  if (skip !== 'kit' && has(S.kit) && !S.kit[i.kit]) return false;
  if (skip !== 'price') {
    if (S.pmin != null && (i.price == null || i.price * rate() < S.pmin)) return false;
    if (S.pmax != null && (i.price == null || i.price * rate() > S.pmax)) return false;
  }
  if (S.extra.link && !i.link) return false;
  if (S.extra.photo && !i.img) return false;
  if (toks.length && !matchQ(i, toks, full)) return false;
  return true;
}
function sorted(list) {
  var l = list.slice();
  var pr = function (i) { return i.price == null ? Infinity : i.price; };
  if (S.sort === 'priceAsc') l.sort(function (a, b) { return pr(a) - pr(b) || a.id - b.id; });
  else if (S.sort === 'priceDesc') l.sort(function (a, b) { return (b.price == null ? -1 : b.price) - (a.price == null ? -1 : a.price) || a.id - b.id; });
  else if (S.sort === 'art') l.sort(function (a, b) { return a.art.localeCompare(b.art, 'ru', { numeric: true }); });
  else if (S.sort === 'title') l.sort(function (a, b) { return a.title.localeCompare(b.title, 'ru') || pr(a) - pr(b); });
  return l;
}

/* ---------- вкладки ---------- */
function cartTotals() {
  var pos = 0, pcs = 0, sum = 0, packs = 0;
  Object.keys(cart).forEach(function (k) {
    var i = byKey[k]; if (!i) return;
    pos++; pcs += cart[k]; sum += (i.price || 0) * cart[k]; packs += Math.ceil(cart[k] / (i.pack || 1));
  });
  return { pos: pos, pcs: pcs, sum: sum, packs: packs };
}
function renderTabs() {
  var counts = { all: ITEMS.length };
  ITEMS.forEach(function (i) { counts[i.cat] = (counts[i.cat] || 0) + 1; });
  var t = cartTotals();
  var h = '<button class="tab' + (S.tab === 'all' ? ' on' : '') + '" data-tab="all">Все <span class="n">' + counts.all + '</span></button>';
  META.cats.forEach(function (c) {
    h += '<button class="tab' + (S.tab === c ? ' on' : '') + '" data-tab="' + esc(c) + '">' + esc(c) + ' <span class="n">' + counts[c] + '</span></button>';
  });
  h += '<button class="tab cart' + (S.tab === 'cart' ? ' on' : '') + '" data-tab="cart">🛒 Корзина' + (room ? ' 👥' : '') + ' <span class="n">' + (t.pos ? t.pcs + ' шт · ' + kzt(t.sum) : 'пусто') + '</span></button>';
  var el = $('#tabs'); var keep = el.scrollLeft; el.innerHTML = h; el.scrollLeft = keep;
  var on = $('.tab.on', el);
  if (on && !el._scrolled) { el._scrolled = true; on.scrollIntoView({ inline: 'center', block: 'nearest' }); }
}

/* ---------- фильтры (панель) ---------- */
function facet(name, field, order, skipEmpty) {
  var toks = searchTokens(S.q);
  var base = ITEMS.filter(function (i) { return inTab(i) && passes(i, name, toks); });
  var tabItems = ITEMS.filter(inTab);
  var counts = {}, all = {};
  tabItems.forEach(function (i) { var v = field(i); if (v) all[v] = 1; });
  base.forEach(function (i) { var v = field(i); if (v) counts[v] = (counts[v] || 0) + 1; });
  Object.keys(S[name]).forEach(function (v) { all[v] = 1; });
  var vals = Object.keys(all).sort(function (a, b) {
    var ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'ru');
  });
  return { vals: vals, counts: counts };
}
function chipHTML(name, v, cnt, swatch) {
  var on = S[name][v];
  return '<button type="button" class="chip' + (on ? ' on' : '') + (!cnt && !on ? ' zero' : '') + '" data-f="' + name + '" data-v="' + esc(v) + '">' +
    (swatch ? '<i class="sw" style="background:' + COLOR_HEX[v] + '"></i>' : '') + esc(v) + ' <span class="c">' + (cnt || 0) + '</span></button>';
}
function renderFilters() {
  var f;
  f = facet('color', function (i) { return i.color || (i.cat === 'Комплектующие' || i.cat === 'Подводки' || i.cat === 'Трапы' || i.cat === 'Водонагреватели' ? '' : 'Другой'); }, COLOR_ORDER);
  $('#fColor').hidden = f.vals.length < 2;
  $('#fColor .chips').innerHTML = f.vals.map(function (v) { return chipHTML('color', v, f.counts[v], true); }).join('');
  f = facet('mat', function (i) { return i.mat; }, MAT_ORDER);
  $('#fMat').hidden = f.vals.length < 2;
  $('#fMat .chips').innerHTML = f.vals.map(function (v) { return chipHTML('mat', v, f.counts[v]); }).join('');
  f = facet('kit', function (i) { return i.kit; }, ['2 в 1', '3 в 1', '4 в 1']);
  $('#fKit').hidden = f.vals.length === 0;
  $('#fKit .chips').innerHTML = f.vals.map(function (v) { return chipHTML('kit', v, f.counts[v]); }).join('');
  // цена
  var prices = ITEMS.filter(inTab).map(function (i) { return i.price; }).filter(function (p) { return p != null; });
  var lo = Math.min.apply(null, prices), hi = Math.max.apply(null, prices);
  $('#pMin').placeholder = 'от ' + (isFinite(lo) ? int(Math.floor(lo * rate())) : 0);
  $('#pMax').placeholder = 'до ' + (isFinite(hi) ? int(Math.ceil(hi * rate())) : 0);
  $('#pPresets').innerHTML = PRESETS.map(function (p, ix) {
    var on = S.pmin === p.a && S.pmax === p.b || (p.a === 0 && S.pmin == null && S.pmax === p.b && p.b != null && false);
    return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-preset="' + ix + '">' + p.l + '</button>';
  }).join('');
  $$('#fExtra .chip').forEach(function (b) { b.classList.toggle('on', !!S.extra[b.dataset.extra]); });
  var n = Object.keys(S.color).length + Object.keys(S.mat).length + Object.keys(S.kit).length + Object.keys(S.extra).length + (S.pmin != null || S.pmax != null ? 1 : 0);
  var b = $('#filtersCount'); b.hidden = !n; b.textContent = n;
}

/* ---------- карточки ---------- */
function specChips(i) {
  var h = '';
  if (i.color) h += '<span class="spec"><i class="sw" style="background:' + COLOR_HEX[i.color] + '"></i>' + esc(i.color) + '</span>';
  if (i.mat) h += '<span class="spec">' + esc(i.mat) + '</span>';
  if (i.cart) h += '<span class="spec">картридж Ø' + esc(i.cart.replace(' мм', '')) + '</span>';
  return h;
}
function packWord(i) { return SUP[i.sup].data.meta.packWord || 'в уп.'; }
function packNoun(i) { return SUP[i.sup].data.meta.packNoun || 'упаковка'; }
function buyHTML(i, big) {
  if (i.price == null) return '<div class="buy"><button class="add" disabled>Цена по запросу</button></div>';
  var q = cart[i.key] || 0;
  var h;
  if (q) {
    h = '<div class="buy"><div class="stepper"><button type="button" data-act="dec" data-id="' + i.id + '" aria-label="Меньше">−</button>' +
      '<input type="number" inputmode="numeric" min="0" value="' + q + '" data-act="set" data-id="' + i.id + '" aria-label="Количество">' +
      '<button type="button" data-act="inc" data-id="' + i.id + '" aria-label="Больше">+</button></div>' +
      '<button type="button" class="add in" data-act="tocart">✓ ' + kzt(i.price * q) + '</button></div>';
  } else {
    h = '<div class="buy"><div class="stepper"><button type="button" data-act="pdec" data-id="' + i.id + '" aria-label="Меньше">−</button>' +
      '<input type="number" inputmode="numeric" min="1" value="1" data-pend="' + i.id + '" aria-label="Количество">' +
      '<button type="button" data-act="pinc" data-id="' + i.id + '" aria-label="Больше">+</button></div>' +
      '<button type="button" class="add" data-act="add" data-id="' + i.id + '">В корзину</button></div>';
  }
  if (i.pack > 1) h += '<button type="button" class="packbtn" data-act="pack" data-id="' + i.id + '">+ ' + packNoun(i) + ' (' + i.pack + ' шт)</button>';
  return h;
}
function imgHTML(i) {
  return i.img ? '<img src="' + esc(i.img) + '" alt="' + esc(i.art) + '" loading="lazy" decoding="async">' : NOIMG;
}
function cardHTML(i) {
  var inc = cart[i.key] ? ' incart' : '';
  var priceH = i.price == null ? '<span class="ask">цена по запросу</span>' : '<b>' + kzt(i.price) + '</b><small>(' + money(i.price) + ') · за шт · ' + packWord(i) + ' ' + i.pack + '</small>';
  return '<article class="card' + inc + '" data-id="' + i.id + '">' +
    '<div class="c-img" data-act="open" data-id="' + i.id + '">' + imgHTML(i) + '<span class="tag">' + esc(i.art) + '</span>' + (i.kit ? '<span class="tag kit">' + esc(i.kit) + '</span>' : '') + '</div>' +
    '<div class="c-body"><div class="c-main">' +
    '<div class="c-art">№ ' + (i.no || i.id) + '</div>' +
    '<div class="c-title" data-act="open" data-id="' + i.id + '">' + esc(i.title) + '</div>' +
    '<div class="specs">' + specChips(i) + '</div></div>' +
    '<div class="c-foot"><div class="row2"><div class="price">' + priceH + '</div>' +
    (i.link ? '<a class="morelink" href="' + esc(i.link) + '" target="_blank" rel="noopener">Фото+ ↗</a>' : '') + '</div>' +
    '<div class="buyslot">' + buyHTML(i) + '</div></div></div></article>';
}
var lastList = [];
function renderGrid() {
  var toks = searchTokens(S.q);
  lastList = ITEMS.filter(function (i) { return inTab(i) && passes(i, null, toks); });
  if (!lastList.length && toks.length) { // ничего не нашли по названию — ищем и в составе комплекта
    lastList = ITEMS.filter(function (i) { return inTab(i) && passes(i, null, toks, true); });
  }
  lastList = sorted(lastList);
  if (toks.length && S.sort === 'pdf') { // при поиске сначала те, у кого слово есть в названии
    var tn = function (i) { // 0 — название начинается с запроса, 1 — слово есть в названии, 2 — только в описании
      var t = nz(i.title);
      if (!toks.every(function (k) { return t.indexOf(k) !== -1; })) return 2;
      return t.indexOf(toks[0]) === 0 ? 0 : 1;
    };
    var sc = new Map(lastList.map(function (i) { return [i, tn(i)]; }));
    lastList = [0, 1, 2].reduce(function (r, n) { return r.concat(lastList.filter(function (i) { return sc.get(i) === n; })); }, []);
  }
  var g = $('#grid');
  g.className = 'grid' + (S.view === 'list' ? ' list' : '');
  g.innerHTML = lastList.map(cardHTML).join('');
  $('#empty').hidden = lastList.length > 0;
  var tot = ITEMS.filter(inTab).length;
  $('#resCount').innerHTML = 'Найдено: <b>' + lastList.length + '</b>' + (lastList.length !== tot ? ' из ' + tot : '');
}
function refreshCard(id) {
  var i = byId[id], el = $('.card[data-id="' + id + '"]');
  if (el) { var slot = $('.buyslot', el); if (slot) slot.innerHTML = buyHTML(i); el.classList.toggle('incart', !!cart[i.key]); }
}

/* ---------- корзина ---------- */
function saveCart() { store.set('cart', cart); if (typeof pushCart === 'function') pushCart(); }
function setQty(id, q) {
  var i = byId[id]; if (!i || i.price == null) return;
  q = Math.max(0, Math.floor(+q || 0));
  if (q > 9999) q = 9999;
  if (q) cart[i.key] = q; else delete cart[i.key];
  saveCart(); afterCartChange(id);
}
function afterCartChange(id) {
  if (id != null) refreshCard(id);
  renderTabs(); renderCartBadges();
  if (S.tab === 'cart') renderCart();
  if (!$('#modal').hidden && modalId != null) renderModalBuy();
}
function renderCartBadges() {
  var t = cartTotals();
  $('#cartTopSum').textContent = kzt(t.sum);
  var b = $('#cartTopCount'); b.hidden = !t.pos; b.textContent = t.pcs;
  var bar = $('#cartBar'); bar.hidden = !t.pos || S.tab === 'cart';
  $('#cbCount').textContent = t.pcs; $('#cbPos').textContent = t.pos; $('#cbSum').textContent = kzt(t.sum);
}
function renderCart() {
  var keys = Object.keys(cart).filter(function (k) { return byKey[k]; });
  $('#cartEmpty').hidden = keys.length > 0; $('#cartBody').hidden = keys.length === 0;
  $('.cart-actions').hidden = keys.length === 0;
  if (!keys.length) return;
  $('#cartList').innerHTML = keys.map(function (k) {
    var i = byKey[k], q = cart[k];
    return '<div class="ci" data-id="' + i.id + '">' +
      '<div class="ci-img" data-act="open" data-id="' + i.id + '">' + (i.img ? '<img src="' + esc(i.img) + '" alt="">' : NOIMG) + '</div>' +
      '<div class="ci-main"><div class="c-art">' + (SUPS.length > 1 ? '<b class="suptag ' + i.sup + '">' + SUP[i.sup].name + '</b> ' : '') + esc(i.art) + (i.color ? ' · ' + esc(i.color) : '') + '</div>' +
      '<div class="t">' + esc(i.title) + '</div>' +
      '<div class="u">' + kzt(i.price) + ' (' + money(i.price) + ') × ' + q + ' шт' + (i.pack > 1 ? ' · ' + packWord(i) + ' ' + i.pack : '') + '</div></div>' +
      '<div class="ci-side"><div class="ci-sum">' + kzt(i.price * q) + '<small>(' + money(i.price * q) + ')</small></div>' +
      '<div class="ci-qty" style="display:none">' + q + ' шт</div>' +
      '<div class="stepper"><button type="button" data-act="dec" data-id="' + i.id + '" aria-label="Меньше">−</button>' +
      '<input type="number" inputmode="numeric" min="0" value="' + q + '" data-act="set" data-id="' + i.id + '" aria-label="Количество">' +
      '<button type="button" data-act="inc" data-id="' + i.id + '" aria-label="Больше">+</button></div>' +
      '<button class="ci-rm" type="button" data-act="rm" data-id="' + i.id + '">Удалить</button></div></div>';
  }).join('');
  renderSummary();
}
function renderSummary() {
  var t = cartTotals();
  $('#sPos').textContent = t.pos; $('#sPcs').textContent = t.pcs;
  $('#sPacks').textContent = (Math.round(t.packs * 10) / 10).toString().replace('.', ',');
  $('#sTotal').innerHTML = kzt(t.sum) + '<small>(' + money(t.sum) + ')</small>';
  $('#kztRow').hidden = true;
  var bud = parseFloat(settings.budget);
  var box = $('#budgetBox'); box.hidden = !(bud > 0);
  if (bud > 0) {
    var sumK = t.sum * rate(), pct = Math.min(100, sumK / bud * 100), over = sumK > bud;
    $('#budgetBar').style.width = pct + '%'; $('#budgetBar').classList.toggle('over', over);
    var tx = $('#budgetText'); tx.classList.toggle('over', over);
    tx.textContent = over ? 'Выше бюджета на ' + kzt((sumK - bud) / rate()) : 'Осталось ' + kzt((bud - sumK) / rate()) + ' из ' + int(bud) + ' ₸';
  }
}
function cartText() {
  var t = cartTotals(), out = [];
  SUPS.forEach(function (sp) {
    var n = 0, lines = [];
    Object.keys(cart).forEach(function (k) {
      var i = byKey[k]; if (!i || i.sup !== sp.id) return; n++;
      lines.push(n + '. ' + i.art + ' — ' + i.title + (i.color ? ' (' + i.color.toLowerCase() + ')' : '') + ' — ' + cart[k] + ' шт × ' + kzt(i.price) + ' = ' + kzt(i.price * cart[k]) + ' (' + money(i.price * cart[k]) + ')');
    });
    if (n) out.push((SUPS.length > 1 ? sp.name.toUpperCase() + '\n' : '') + lines.join('\n'));
  });
  var dates = SUPS.map(function (x) { return x.data.meta.date; }).filter(function (v, ix, arr) { return arr.indexOf(v) === ix; }).join(', ');
  return 'Заказ · Тригор Сантех (прайс от ' + dates + ')\n\n' + out.join('\n\n') + '\n\nИтого: ' + t.pcs + ' шт, ' + kzt(t.sum) + ' (' + money(t.sum) + ', курс ' + rate() + ' ₸/$)';
}
function copyText(s, msg) {
  function fb() {
    var ta = document.createElement('textarea'); ta.value = s; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast(msg || 'Скопировано'); } catch (e) { toast('Не удалось скопировать'); }
    document.body.removeChild(ta);
  }
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(s).then(function () { toast(msg || 'Скопировано'); }, fb); else fb();
}
function downloadCsv() {
  var rows = [['Поставщик', '№', 'Артикул', 'Название', 'Цвет', 'Материал', 'Цена ₸', 'Кол-во', 'Сумма ₸', 'Цена $', 'Сумма $', 'В уп.']];
  Object.keys(cart).forEach(function (k) {
    var i = byKey[k]; if (!i) return;
    rows.push([SUP[i.sup].name, i.no || i.id, i.art, i.title, i.color, i.mat, Math.round(i.price * rate()), cart[k], Math.round(i.price * cart[k] * rate()), String(i.price).replace('.', ','), String(Math.round(i.price * cart[k] * 100) / 100).replace('.', ','), i.pack]);
  });
  var t = cartTotals(); rows.push(['', '', '', '', '', '', '', t.pcs, Math.round(t.sum * rate()), '', String(Math.round(t.sum * 100) / 100).replace('.', ','), 'курс ' + rate()]);
  var csv = '﻿' + rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(';'); }).join('\r\n');
  var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'trigor-zakaz.csv'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------- карточка товара (модальное окно) ---------- */
var modalId = null;
function renderModalBuy() {
  var i = byId[modalId]; if (!i) return;
  $('#mBuy').innerHTML = buyHTML(i);
}
function openModal(id) {
  var i = byId[id]; if (!i) return; modalId = id;
  $('#mImg').innerHTML = i.img ? '<img src="' + esc(i.img) + '" alt="' + esc(i.art) + '">' : NOIMG;
  $('#mArt').textContent = SUP[i.sup].name + ' · ' + i.art + ' · № ' + (i.no || i.id) + ' · ' + i.cat;
  $('#mTitle').textContent = i.title;
  $('#mChips').innerHTML = specChips(i) + (i.kit ? '<span class="spec">' + esc(i.kit) + '</span>' : '');
  var lines = i.lines.slice();
  if (lines.length > 1 && nz(lines[0]) === nz(i.title)) lines.shift();
  else if (lines.length && nz(i.title).indexOf(nz(lines[0])) === 0 && nz(lines[0]).length > 8) lines.shift();
  $('#mLines').innerHTML = lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('');
  $('#mPrice').innerHTML = i.price == null ? '<span style="font-size:20px;color:var(--muted)">Цена по запросу</span>' : kzt(i.price) + '<small>(' + money(i.price) + ') · за шт · ' + (i.sup === 'dionis' ? 'в коробке ' : 'в упаковке ') + i.pack + ' шт</small>';
  renderModalBuy();
  var a = $('#mLink'); a.hidden = !i.link; if (i.link) a.href = i.link;
  $('#modal').hidden = false; document.body.style.overflow = 'hidden';
}
function closeModal() { $('#modal').hidden = true; modalId = null; document.body.style.overflow = ''; }

/* ---------- мелочи ---------- */
var toastT;
function toast(m) { var t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 2200); }

/* ---------- маршрутизация вкладок ---------- */
function setTab(tab, noHash) {
  S.tab = tab;
  $('#viewCatalog').hidden = tab === 'cart'; $('#viewCart').hidden = tab !== 'cart';
  if (!noHash) { try { history.replaceState(null, '', tab === 'all' ? location.pathname + location.search : '#' + encodeURIComponent(tab)); } catch (e) {} }
  // убрать выбранные значения, которых нет на этой вкладке (набор «N в 1» только у стоек)
  if (tab !== 'cart') {
    renderTabs(); renderFilters(); renderGrid();
  } else { renderTabs(); renderCart(); }
  renderCartBadges();
  window.scrollTo({ top: 0, behavior: 'auto' });
}
function setSupplier(id, keepTab) {
  if (!SUP[id]) id = SUPS[0].id;
  S.sup = id; store.set('sup', id);
  ITEMS = SUP[id].data.items; META = SUP[id].data.meta;
  var lg = SUP[id].logo; $('#logo').innerHTML = lg[0] + '<span>' + lg[1] + '</span>';
  $('#priceDate').textContent = META.date || '—';
  document.title = SUP[id].name + ' — каталог';
  $$('#sup [data-sup]').forEach(function (b) {
    var on = b.dataset.sup === id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
  });
  if (!keepTab) { S.color = {}; S.mat = {}; S.kit = {}; S.extra = {}; S.pmin = S.pmax = null; S.q = ''; $('#q').value = ''; $('#qClear').hidden = true; $('#pMin').value = ''; $('#pMax').value = ''; setTab('all'); }
}
function renderSupSwitch() {
  $('#sup').innerHTML = SUPS.map(function (x) {
    return '<button type="button" class="sup-btn ' + x.id + '" data-sup="' + x.id + '"><b>' + x.name + '</b><span>' + x.data.items.length + ' товаров</span></button>';
  }).join('');
}
function tabFromHash() {
  var h = decodeURIComponent((location.hash || '').slice(1));
  if (h === 'cart' || META.cats.indexOf(h) >= 0) return h;
  return 'all';
}
function refreshAll() { renderTabs(); renderFilters(); renderGrid(); }
function resetFilters() { S.color = {}; S.mat = {}; S.kit = {}; S.extra = {}; S.pmin = S.pmax = null; S.q = ''; $('#q').value = ''; $('#qClear').hidden = true; $('#pMin').value = ''; $('#pMax').value = ''; refreshAll(); }

/* ---------- события ---------- */
document.addEventListener('click', function (e) {
  var t = e.target;
  var sb = t.closest('[data-sup]'); if (sb) { setSupplier(sb.dataset.sup); return; }
  var tab = t.closest('[data-tab]'); if (tab) { setTab(tab.dataset.tab); return; }
  var f = t.closest('[data-f]');
  if (f) { var o = S[f.dataset.f], v = f.dataset.v; if (o[v]) delete o[v]; else o[v] = true; refreshAll(); return; }
  var pr = t.closest('[data-preset]');
  if (pr) {
    var p = PRESETS[+pr.dataset.preset];
    if (S.pmin === p.a && S.pmax === p.b) { S.pmin = S.pmax = null; } else { S.pmin = p.a; S.pmax = p.b; }
    $('#pMin').value = S.pmin == null ? '' : S.pmin; $('#pMax').value = S.pmax == null ? '' : S.pmax; refreshAll(); return;
  }
  var ex = t.closest('[data-extra]'); if (ex) { var k = ex.dataset.extra; if (S.extra[k]) delete S.extra[k]; else S.extra[k] = true; refreshAll(); return; }
  var a = t.closest('[data-act]'); if (!a) return;
  var act = a.dataset.act, id = +a.dataset.id, i = byId[id];
  if (act === 'open') { openModal(id); }
  else if (act === 'inc') setQty(id, (cart[i.key] || 0) + 1);
  else if (act === 'dec') setQty(id, (cart[i.key] || 0) - 1);
  else if (act === 'rm') { setQty(id, 0); toast('Удалено из корзины'); }
  else if (act === 'pinc' || act === 'pdec') {
    var inp = a.parentNode.querySelector('input'); var v2 = Math.max(1, (parseInt(inp.value, 10) || 1) + (act === 'pinc' ? 1 : -1)); inp.value = v2;
  }
  else if (act === 'add') {
    var inp2 = a.parentNode.querySelector('input'); var n = Math.max(1, parseInt(inp2.value, 10) || 1);
    setQty(id, n); toast('Добавлено: ' + i.art + ' × ' + n);
  }
  else if (act === 'pack') { setQty(id, (cart[i.key] || 0) + i.pack); toast('+' + i.pack + ' шт · ' + i.art); }
  else if (act === 'tocart') { closeModal(); setTab('cart'); }
});
document.addEventListener('change', function (e) {
  var t = e.target;
  if (t.dataset && t.dataset.act === 'set') setQty(+t.dataset.id, t.value);
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && !$('#modal').hidden) closeModal();
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.act === 'set') e.target.blur();
});
document.addEventListener('error', function (e) {
  var im = e.target;
  if (im && im.tagName === 'IMG' && !im._failed) { im._failed = true; var p = im.parentNode; if (p) p.innerHTML = NOIMG; }
}, true);
$('#modal').addEventListener('click', function (e) { if (e.target.hasAttribute('data-close')) closeModal(); });

var qT;
$('#q').addEventListener('input', function (e) {
  S.q = e.target.value; $('#qClear').hidden = !S.q;
  clearTimeout(qT); qT = setTimeout(function () { if (S.tab === 'cart') setTab('all'); renderFilters(); renderGrid(); renderTabs(); }, 120);
});
$('#qClear').addEventListener('click', function () { $('#q').value = ''; S.q = ''; $('#qClear').hidden = true; refreshAll(); $('#q').focus(); });
function priceInput() {
  var a = parseFloat($('#pMin').value.replace(',', '.')), b = parseFloat($('#pMax').value.replace(',', '.'));
  S.pmin = isNaN(a) ? null : a; S.pmax = isNaN(b) ? null : b; renderFilters(); renderGrid();
}
$('#pMin').addEventListener('input', priceInput); $('#pMax').addEventListener('input', priceInput);
$('#sort').value = S.sort;
$('#sort').addEventListener('change', function (e) { S.sort = e.target.value; store.set('sort', S.sort); renderGrid(); });
function setView(v) { S.view = v; store.set('view', v); $('#vGrid').classList.toggle('on', v === 'grid'); $('#vList').classList.toggle('on', v === 'list'); renderGrid(); }
$('#vGrid').addEventListener('click', function () { setView('grid'); });
$('#vList').addEventListener('click', function () { setView('list'); });
$('#filtersBtn').addEventListener('click', function () {
  var f = $('#filters'); f.hidden = !f.hidden; this.setAttribute('aria-expanded', String(!f.hidden));
});
$('#resetFilters').addEventListener('click', resetFilters);
$('#emptyReset').addEventListener('click', resetFilters);
$('#cartTop').addEventListener('click', function () { setTab('cart'); });
$('#cartBar').addEventListener('click', function () { setTab('cart'); });
$('#toCatalog').addEventListener('click', function () { setTab('all'); });
$('#cCopy').addEventListener('click', function () { copyText(cartText(), 'Список скопирован'); });
$('#cCsv').addEventListener('click', downloadCsv);
$('#cPrint').addEventListener('click', function () { window.print(); });
$('#cClear').addEventListener('click', function () { if (confirm('Очистить корзину?')) { cart = {}; saveCart(); afterCartChange(); refreshAll(); } });
$('#cShare').addEventListener('click', function () {
  var txt = cartText();
  if (navigator.share) navigator.share({ title: 'Заказ · Тригор Сантех', text: txt }).catch(function () {}); else copyText(txt, 'Список скопирован — вставьте в WhatsApp или почту');
});
function showRate() { $('#rateBtn').textContent = rate().toString().replace('.', ',') + ' ₸'; $('#rate').value = rate(); }
function setRate(v) {
  settings.rate = String(v); store.set('settings', settings); showRate();
  renderCartBadges(); renderTabs(); refreshAll(); if (S.tab === 'cart') renderCart(); if (!$('#modal').hidden && modalId != null) openModal(modalId);
}
$('#rateBtn').addEventListener('click', function () {
  var v = prompt('Курс: сколько тенге за 1 доллар?', rate());
  if (v == null) return; v = parseFloat(String(v).replace(',', '.'));
  if (v > 0) setRate(v);
});
showRate();
$('#budget').value = settings.budget;
$('#rate').addEventListener('change', function (e) { var v = parseFloat(String(e.target.value).replace(',', '.')); if (v > 0) setRate(v); else showRate(); });
$('#budget').addEventListener('input', function (e) { settings.budget = e.target.value; store.set('settings', settings); renderSummary(); });
window.addEventListener('hashchange', function () { var t = tabFromHash(); if (t !== S.tab) setTab(t, true); });

/* ---------- общая корзина: два телефона видят одну корзину (хранится в бесплатном JSON-хранилище jsonblob.com, ключ — длинный код) ---------- */
var BLOB = 'https://jsonblob.com/api/jsonBlob';
var room = store.get('room', null);
var devId = store.get('devId', null) || (function () { var d = Math.random().toString(36).slice(2, 10); store.set('devId', d); return d; })();
var sync = { rev: 0, dirty: false, pushT: null, timer: null, checked: 0, err: '' };
function jb(method, id, body) {
  return fetch(BLOB + (id ? '/' + id : ''), { method: method, cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
}
function packCart(rev) { return { app: 'trigor-santeh', rev: rev, by: devId, cart: cart }; }
function cleanRemote(c) { var o = {}; Object.keys(c || {}).forEach(function (k) { if (byKey[k] && c[k] > 0) o[k] = Math.round(c[k]); }); return o; }
function applyRemote(data) {
  cart = cleanRemote(data.cart); sync.rev = data.rev || 0; store.set('cart', cart);
  afterCartChange(); refreshAll();
}
function pushCart() {
  if (!room) return;
  sync.dirty = true; clearTimeout(sync.pushT);
  sync.pushT = setTimeout(doPush, 500);
}
function doPush() {
  if (!room) return;
  var rev = sync.rev + 1;
  jb('PUT', room, packCart(rev)).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    sync.rev = rev; sync.dirty = false; sync.err = ''; sync.checked = Date.now(); renderShare();
  }).catch(function () { sync.err = 'Нет связи — изменения отправятся, когда появится интернет'; renderShare(); sync.pushT = setTimeout(doPush, 8000); });
}
function poll() {
  if (!room || document.hidden || sync.dirty) return;
  jb('GET', room).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (d) {
    sync.err = ''; sync.checked = Date.now();
    if (sync.dirty) return;
    var newer = d.rev > sync.rev || (d.rev === sync.rev && d.by !== devId && JSON.stringify(cleanRemote(d.cart)) !== JSON.stringify(cart));
    if (newer) { applyRemote(d); toast('Корзина обновлена с другого телефона'); }
    renderShare();
  }).catch(function () { sync.err = 'Нет связи с общей корзиной'; renderShare(); });
}
function startSync() { clearInterval(sync.timer); if (room) { sync.timer = setInterval(poll, 5000); poll(); } }
document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
window.addEventListener('online', poll);
function roomLink() { return location.origin + location.pathname + '?room=' + room; }
function createRoom() {
  if (room) return;
  toast('Создаю общую корзину…');
  jb('POST', null, packCart(1)).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var loc = r.headers.get('Location') || r.headers.get('location') || '';
    var id = loc.split('/').pop();
    if (!/^[\w-]{8,}$/.test(id)) throw new Error('no id');
    room = id; store.set('room', id); sync.rev = 1; sync.err = '';
    renderTabs(); renderShare(); startSync();
    shareLink();
  }).catch(function () { toast('Не получилось создать общую корзину: нет связи с сервисом'); });
}
function joinRoom(raw) {
  var m = String(raw || '').match(/room=([\w-]+)/), id = m ? m[1] : String(raw || '').trim();
  if (!/^[\w-]{8,}$/.test(id)) { toast('Код не похож на правильный'); return; }
  jb('GET', id).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (d) {
    if (!d || d.app !== 'trigor-santeh') throw new Error('bad');
    var remote = cleanRemote(d.cart);
    if (Object.keys(cart).length && JSON.stringify(remote) !== JSON.stringify(cart) && !confirm('У вас в корзине уже есть товары. Заменить их общей корзиной?')) return;
    room = id; store.set('room', id); applyRemote(d); renderTabs(); renderShare(); startSync(); toast('Подключено к общей корзине');
  }).catch(function () { toast('Не удалось подключиться: проверьте код и интернет'); });
}
function leaveRoom() {
  if (!confirm('Отключиться от общей корзины? Товары останутся у вас на телефоне, но обновляться перестанут.')) return;
  clearInterval(sync.timer); clearTimeout(sync.pushT); room = null; store.set('room', null); sync.dirty = false; renderTabs(); renderShare();
}
function shareLink() {
  var url = roomLink();
  if (navigator.share) navigator.share({ title: 'Тригор Сантех — общая корзина', text: 'Общая корзина:', url: url }).catch(function () {});
  else copyText(url, 'Ссылка скопирована — отправьте её второму телефону');
}
function renderShare() {
  var el = $('#sharePanel'); if (!el) return;
  if (!room) {
    el.className = 'share';
    el.innerHTML = '<div class="share-t"><b>👥 Общая корзина</b><span>Чтобы вы оба видели одну корзину на своих телефонах</span></div>' +
      '<div class="share-b"><button class="btn" type="button" data-share="create">Создать общую корзину</button>' +
      '<button class="btn ghost" type="button" data-share="join">У меня есть ссылка или код</button></div>';
    return;
  }
  var t = sync.checked ? new Date(sync.checked).toLocaleTimeString('ru-RU') : '…';
  el.className = 'share on' + (sync.err ? ' err' : '');
  el.innerHTML = '<div class="share-t"><b>👥 Общая корзина подключена</b><span>' + (sync.err ? esc(sync.err) : 'Изменения видны на обоих телефонах · обновлено ' + t) + '</span></div>' +
    '<div class="share-b"><button class="btn" type="button" data-share="link">Отправить ссылку</button>' +
    '<button class="btn ghost" type="button" data-share="code">Скопировать код</button>' +
    '<button class="btn link danger" type="button" data-share="leave">Отключить</button></div>';
}
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-share]'); if (!b) return;
  var a = b.dataset.share;
  if (a === 'create') createRoom();
  else if (a === 'join') { var v = prompt('Вставьте ссылку или код общей корзины'); if (v) joinRoom(v); }
  else if (a === 'link') shareLink();
  else if (a === 'code') copyText(room, 'Код скопирован');
  else if (a === 'leave') leaveRoom();
});
(function joinFromUrl() {
  var m = location.search.match(/[?&]room=([\w-]+)/);
  if (!m) return;
  try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
  if (m[1] !== room) setTimeout(function () { joinRoom(m[1]); }, 300);
})();

/* ---------- старт ---------- */
renderSupSwitch();
setSupplier(S.sup, true);
$('#filters').hidden = window.matchMedia('(max-width:720px)').matches;
$('#filtersBtn').setAttribute('aria-expanded', String(!$('#filters').hidden));
$('#vGrid').classList.toggle('on', S.view === 'grid'); $('#vList').classList.toggle('on', S.view === 'list');
renderCartBadges();
renderShare(); startSync();
setTab(tabFromHash(), true);
})();
