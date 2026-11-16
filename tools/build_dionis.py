#!/usr/bin/env python3
"""raw.json (результат extract_dionis.py) -> data-dionis.js + img-d/ для приложения.
Использование: python3 build_dionis.py папка_с_raw папка_сайта 06.11.2026"""
import json, re, sys, os, shutil, collections
RAW, OUT = sys.argv[1], sys.argv[2]
DATE = sys.argv[3] if len(sys.argv) > 3 else ''
raw = json.load(open(os.path.join(RAW, 'raw.json')))
def norm(s): return re.sub(r'\s+', ' ', (s or '').replace('\n', ' ')).strip()

# --- исправления артефактов PDF (перетекание строк, склейка артикулов) ---
for it in raw:
    ls = it['desc'].split('\n')
    if ls and ls[0].strip().lower() == 'душа' and len(ls) > 1: ls = ls[1:]          # №191: хвост соседней строки
    it['desc'] = '\n'.join(ls)
    m = re.match(r'^([A-Z]+\d+-\d+)(?=[A-Z])', it['art'])                             # №88: «DNE10-305DNE6-FW-203»
    if m: it['art'] = m.group(1)

CAT_FIX = {48: 'Раковина'}                                  # в PDF «Смеситель для H»
def category(it):
    if it['no'] in CAT_FIX: return CAT_FIX[it['no']]
    n, d = it['no'], norm(it['desc']).lower()
    first = norm(it['desc'].split('\n')[0]).lower()
    if n >= 201: return 'Комплектующие'
    if 'биде' in d: return 'Биде'
    if 'душевой комплект' in first or re.search(r'3 ?в ?1', first): return 'Душевые стойки'
    if 'кухн' in first or first.startswith('моно-кран') : return 'Кухня'
    if 'раковин' in first or 'умывальник' in first: return 'Раковина'
    if 'ванн' in first or 'душ' in first: return 'Ванна и душ'
    if 'кухн' in d: return 'Кухня'
    return 'Раковина' if 'раковин' in d else 'Ванна и душ'

COLORS = [('Чёрный', [r'черн', r'чёрн']), ('Золото', [r'золот']), ('Графит', [r'графит']), ('Бронза', [r'бронз', r'медн']),
          ('Хром', [r'хром']), ('Сатин', [r'сатин', r'никел', r'нержавейка$']), ('Серый', [r'сер', r'бетон']), ('Белый', [r'бел'])]
def surface(it):
    d = norm(it['desc'])
    m = re.search(r'(?:Поверхность|покрытие)\s*[:\-]?\s*(.+?)(?=\s*(?:Материал|Керамическ|картридж|Латунные|Тип креп|В комплекте|/|;|$))', d, re.I)
    return m.group(1).strip(' :/-;,') if m else ''
def pick(t):
    t = t.lower().replace('ё', 'е')
    for name, keys in COLORS:
        if any(re.search(k.replace('чёрн', 'черн'), t) for k in keys): return name
    return ''
SPOUT = re.compile(r'(?:с\s+)?(?:белым|черным|серым|черн\s?ым|белый|черный|серый)\s+(?:каучуков\w*|силиконов\w*)|(?:каучуков|силиконов)\w*\s+(?:с\s+)?(?:бело-молочным\s+)?излив\w*', re.I)
def color(it):
    s = surface(it)
    c = pick(s)
    if c: return c
    d = SPOUT.sub(' ', norm(it['desc']))
    d = re.sub(r'(?:Материал|материал)\s+\S+', ' ', d)
    if it['no'] < 201:
        m = re.search(r'(?:Хромированн|хром)\w*', d, re.I)
        if re.search(r'покрытие-хром|хромированная поверхность', d, re.I): return 'Хром'
        if re.search(r'\bчерн', d, re.I): return 'Чёрный'
        if re.search(r'золот', d, re.I): return 'Золото'
    else:
        if 'хромирован' in d.lower(): return 'Хром'
        if re.search(r'черн', d, re.I): return 'Чёрный'
        if re.search(r'бел', d, re.I): return 'Белый'
    return ''

def material(it):
    d = norm(it['desc']).lower()
    if 'нержавейк' in d and 'материал' in d: return 'Нержавейка'
    if re.search(r'материал\s*:?\s*zn', d): return 'Цинк'
    if 'пластик' in d: return 'Пластик'
    if it['no'] <= 12: return 'Нержавейка'          # раздел «Смесители из нержавейки» в шапке прайса
    return 'Не указан'                              # материал в прайсе не написан

def kit(it, cat):
    return '3 в 1' if cat == 'Душевые стойки' and re.search(r'3 ?в ?1', norm(it['desc']).lower()) else ''
def cartridge(it):
    m = re.search(r'картридж[^Øø\d]*[Øø]\s*(\d+)', norm(it['desc'])); return m.group(1) + ' мм' if m else ''
def price(s):
    s = re.sub(r'\s', '', s); m = re.search(r'(\d+)[,.](\d+)', s)
    return float(m.group(1) + '.' + m.group(2)) if m else None
def pack(s):
    m = re.search(r'=\s*(\d+)', s); return int(m.group(1)) if m else 1

TITLE_FIX = {48: 'Смеситель для раковины', 49: 'Смеситель для кухни', 28: 'Смеситель для душа', 95: 'Смеситель для душа', 154: 'Смеситель для душевой кабины'}
def make_title(it, cat):
    if it['no'] in TITLE_FIX: return TITLE_FIX[it['no']]
    lines = [l.strip() for l in it['desc'].split('\n') if l.strip()]
    flat = norm(it['desc'])
    if cat == 'Комплектующие': return flat[:110]
    t = re.split(r'\s*(?:Поверхность|поверхность|Керамическ|Материал|материал|Латунные|Тип креп|В комплекте|покрытие)', flat)[0].strip(' :/;-,.')
    if len(t) < 6: t = norm(lines[0]) if lines else it['art']
    low = t.lower()
    if low.startswith('ванна длинная'): t = 'Смеситель для ванны, длинный излив'
    elif low.startswith('умывальник короткий'): t = 'Смеситель для умывальника, короткий'
    elif low.startswith('кухня/'): t = 'Смеситель для кухни'
    elif low.startswith('душевой комплект'): t = 'Душевой комплект 3 в 1 с тропическим душем'
    t = t.replace('кухн с', 'кухни с').replace('ван и', 'ванн и').replace('черн ым', 'черным')
    return t[:1].upper() + t[1:]

imgdir = os.path.join(OUT, 'img-d'); os.makedirs(imgdir, exist_ok=True)
for f in os.listdir(imgdir): os.remove(os.path.join(imgdir, f))
items = []
for it in raw:
    cat = category(it)
    lines = [l.strip() for l in it['desc'].split('\n') if l.strip()]
    img = None
    if it.get('img'):
        shutil.copy(os.path.join(RAW, it['img']), os.path.join(imgdir, str(it['no']) + '.jpg')); img = f"img-d/{it['no']}.jpg"
    items.append(dict(id=1000 + it['no'], no=it['no'], art=it['art'], cat=cat, mat=material(it), color=color(it), surface=surface(it),
        kit=kit(it, cat), cart=cartridge(it), title=norm(make_title(it, cat)), desc=norm(it['desc']), lines=lines,
        pack=pack(it['pack']), packText=norm(it['pack']), price=price(it['price']), img=img, link=it.get('link')))
cnt = collections.Counter(i['art'] for i in items)
for i in items: i['key'] = 'D:' + (i['art'] if cnt[i['art']] == 1 else f"{i['art']}~{i['price']}")
order = ['Раковина', 'Ванна и душ', 'Душевые стойки', 'Кухня', 'Биде', 'Комплектующие']
meta = dict(date=DATE, cats=[c for c in order if any(i['cat'] == c for i in items)], count=len(items), packWord='в коробке', packNoun='коробка')
open(os.path.join(OUT, 'data-dionis.js'), 'w', encoding='utf-8').write(
    'window.CATALOG_DIONIS=' + json.dumps(dict(meta=meta, items=items), ensure_ascii=False, separators=(',', ':')) + ';')
print(len(items), collections.Counter(i['cat'] for i in items))
print('colors', collections.Counter(i['color'] for i in items)); print('mat', collections.Counter(i['mat'] for i in items))
print('noimg', [i['no'] for i in items if not i['img']], 'noprice', [i['no'] for i in items if i['price'] is None])
