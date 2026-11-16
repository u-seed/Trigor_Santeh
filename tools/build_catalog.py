#!/usr/bin/env python3
"""Разбирает raw.json (результат extract_pdf.py) -> data.js для приложения.
Категории, цвета, типы определяются по описанию товара."""
import json, re, sys, os, shutil, collections

RAW, OUT = sys.argv[1], sys.argv[2]          # raw.json , папка сайта
raw = json.load(open(os.path.join(RAW, 'raw.json')))

def norm(s): return re.sub(r'\s+', ' ', (s or '').replace('\n', ' ')).strip()

def category(it):
    n, d = it['no'], norm(it['desc']).lower()
    first = norm(it['desc'].split('\n')[0]).lower()
    # разделы нижней части прайса определяются по номерам позиций в PDF
    if 597 <= n <= 604: return 'Водонагреватели'
    if 606 <= n <= 614: return 'Подводки'
    if 616 <= n <= 617: return 'Трапы'
    if n >= 618:        return 'Комплектующие'
    if 'гигиен' in d or 'биде' in d: return 'Биде'
    if 'стойк' in first or 'душевой комплект' in first or 'ддуу' in first or re.search(r'3 ?в ?1|2 ?в ?1|4 ?в ?1', first) or 'тропическ' in d: return 'Душевые стойки'
    if 'кухн' in d: return 'Кухня'
    if 'раковин' in d or 'умывальник' in d: return 'Раковина'
    if 'ванн' in d or 'душ' in d: return 'Ванна и душ'
    return 'Другое'

COLORS = [('Чёрный', [r'черн', r'черы', r'чёрн']), ('Золото', [r'золот']), ('Графит', [r'графит', r'uhfabn']),
          ('Бронза', [r'бронз', r'медн', r'антик(?!ор)']), ('Хром', [r'хром']),
          ('Сатин', [r'сатин', r'никел', r'нержав']), ('Серый', [r'сер', r'cthsq']), ('Белый', [r'бел'])]
def surface(it):
    d = norm(it['desc'])
    m = re.search(r'(?:Поверхность|покрытие|Цвет|Покрытие)\s*[:\-]?\s*(.+?)(?=\s*(?:Материал|Керамическ|картридж|Кранбуксы|Тип креп|В комплекте|Цвет:|/|;|$))', d, re.I)
    return m.group(1).strip(' :/-;') if m else ''
def pick(text):
    t = text.lower().replace('ё', 'е')
    for name, keys in COLORS:
        if any(re.search(k.replace('чёрн', 'черн'), t) for k in keys): return name
    return ''
SPOUT = re.compile(r'(?:с\s+)?(?:белым|черным|серым|белый|черный|серый|чёрным)\s+каучуков\w*|каучуков\w*\s+(?:белым|черным|серым|белый|черный|серый)\s*(?:гибким)?|(?:с\s+)?(?:белым|черным|серым|черыйм|черныйм)\s+излив\w*', re.I)
def color(it):
    c = pick(surface(it))
    if c: return c
    d = SPOUT.sub(' ', norm(it['desc']))
    d = re.sub(r'антикоррозийн\w*', ' ', d, flags=re.I)
    if it['no'] < 597:
        c = pick(d)
        if c: return c
        if 'нерж' in it['mat'].lower(): return 'Сатин'
        return ''
    return pick(d) if it['no'] >= 597 else ''

def kit(it, cat):
    d = norm(it['desc']).lower()
    if cat != 'Душевые стойки': return ''
    for k in ('4 ?в ?1', '3 ?в ?1', '2 ?в ?1'):
        if re.search(k, d): return k[0] + ' в 1'
    return ''

def material(it):
    m = it['mat'].lower()
    if 'нерж' in m: return 'Нержавейка'
    if 'латун' in m: return 'Латунь'
    if 'цинк' in m: return 'Цинк'
    if 'пласт' in m: return 'Пластик'
    if 'силикон' in m: return 'Силикон'
    d = norm(it['desc']).lower()
    if re.search(r'материал[:\s]*zn|zn/', d): return 'Цинк'
    return it['mat'].capitalize()

def cartridge(it):
    m = re.search(r'картридж[^Øø\d]*[Øø]\s*(\d+)', norm(it['desc']))
    return m.group(1) + ' мм' if m else ''

def price(s):
    s = re.sub(r'\s', '', s)          # в PDF встречается «$ 1 9 , 9 5»
    m = re.search(r'(\d+)[,.](\d+)', s)
    return float(m.group(1) + '.' + m.group(2)) if m else None

# общие фото групп (подводки) — одна картинка на несколько строк
imgdir = os.path.join(OUT, 'img'); os.makedirs(imgdir, exist_ok=True)
for f in os.listdir(imgdir): os.remove(os.path.join(imgdir, f))
byno = {i['no']: i for i in raw}
share = {606: 608, 607: 608, 609: 608, 610: 608}
for a, b in share.items():
    if a in byno and byno[b].get('img'): byno[a]['img'] = byno[b]['img']

# ручные правки опечаток в исходном прайсе: {номер: цвет}
OVERRIDE_COLOR = {418: 'Золото', 411: 'Другой'}
# в PDF последняя строка описания соседней позиции иногда «перетекает» в начало следующей ячейки — убираем
SPILL_DROP = {2: 1, 514: 1, 544: 1, 557: 1, 560: 1}       # номер: сколько первых строк выбросить
GARBLED = {517, 521, 526}                                  # «дДуушшаевой» -> «Душевой» (наложение текста)
for it in raw:
    ls = it['desc'].split('\n')
    if it['no'] in SPILL_DROP: ls = ls[SPILL_DROP[it['no']]:]
    if it['no'] in GARBLED: ls[0] = ls[0].replace('дДуушшаевой', 'Душевой')
    if ls and ls[0][:1].islower(): ls[0] = ls[0][:1].upper() + ls[0][1:]
    it['desc'] = '\n'.join(ls)
    it['desc'] = it['desc'].replace('кухнисерым', 'кухни серым')

items = []
for it in raw:
    cat = category(it)
    lines = [l.strip() for l in it['desc'].split('\n') if l.strip()]
    flat = norm(it['desc'])
    if cat in ('Подводки', 'Комплектующие', 'Трапы', 'Водонагреватели'):
        title = flat[:110]
    else:
        title = re.split(r'\s*(?:Поверхность|поверхность|Керамическ|Материал|материал|Цвет:|Покрытие|покрытие|Тип креп|В комплекте|Кранбуксы|Картридж|картридж)', flat)[0].strip(' :/;-,')
        if len(title) < 6: title = norm(lines[0]) if lines else it['art']
    DEF = {'Раковина': 'Смеситель для раковины', 'Ванна и душ': 'Смеситель для ванны', 'Душевые стойки': 'Душевая стойка',
           'Кухня': 'Смеситель для кухни', 'Биде': 'Смеситель для биде'}
    if title.lower().startswith(('в комплекте', 'кронштейном', 'душевая стойка с кронштейном')) and cat in DEF: title = DEF[cat]
    title = title.replace('для для', 'для').replace('кухнии', 'кухни')
    low = title.lower()
    if low.startswith('ванна длинная'): title = 'Смеситель для ванны, длинный излив' + (', двухвентильный' if 'двухвентил' in low else '')
    elif low.startswith('умывальник'): title = 'Смеситель для умывальника'
    title = title[:1].upper() + title[1:]
    img = None
    if it.get('img'):
        src = os.path.join(RAW, it['img']); dst = os.path.join(imgdir, os.path.basename(it['img']))
        shutil.copy(src, dst); img = 'img/' + os.path.basename(it['img'])
    p = price(it['price'])
    items.append(dict(
        id=it['no'], art=it['art'], cat=cat, mat=material(it), color=OVERRIDE_COLOR.get(it['no'], color(it)), surface=surface(it),
        kit=kit(it, cat), cart=cartridge(it), title=norm(title), desc=norm(it['desc']), lines=lines,
        pack=int(re.sub(r'\D', '', it['qty']) or 1), price=p, img=img, link=it.get('link')))
# уникальный ключ для корзины (артикул; если в прайсе повторяется — артикул+цена)
cnt = collections.Counter(i['art'] for i in items)
for i in items: i['key'] = i['art'] if cnt[i['art']] == 1 else f"{i['art']}~{i['price']}"
order = ['Раковина', 'Ванна и душ', 'Душевые стойки', 'Кухня', 'Биде', 'Водонагреватели', 'Подводки', 'Трапы', 'Комплектующие', 'Другое']
meta = dict(date=(sys.argv[3] if len(sys.argv) > 3 else ''), cats=[c for c in order if any(i['cat'] == c for i in items)], count=len(items))
open(os.path.join(OUT, 'data.js'), 'w', encoding='utf-8').write(
    'window.CATALOG=' + json.dumps(dict(meta=meta, items=items), ensure_ascii=False, separators=(',', ':')) + ';')
c = collections.Counter(i['cat'] for i in items)
print(len(items), 'items'); print(c)
print('colors', collections.Counter(i['color'] for i in items))
print('kits', collections.Counter(i['kit'] for i in items))
print('mat', collections.Counter(i['mat'] for i in items))
print('noimg', [i['id'] for i in items if not i['img']])
