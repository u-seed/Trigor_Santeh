#!/usr/bin/env python3
"""Извлекает позиции DIONIS из PDF-прайса -> raw.json + img/ (структура: №, фото, артикул, описание, Фото+, 1к=N шт, цена)
Использование: python3 extract_dionis.py price.pdf папка_вывода"""
import pdfplumber, json, os, re, sys
SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT + '/img', exist_ok=True)
pdf = pdfplumber.open(SRC)
items, sections, cur = [], [], None
for pn, p in enumerate(pdf.pages):
    tbs = p.find_tables()
    if not tbs: continue
    tb = max(tbs, key=lambda t: len(t.rows))
    imgs = [im for im in p.images if im['x0'] < 130 and im['x1'] > 20]
    for row in tb.rows:
        cells = [(p.crop(c).extract_text() if c else '') or '' for c in row.cells]
        cells = [c.strip() for c in cells]
        if len(cells) < 7: continue
        no, _, art, desc, fp, pack, price = cells[:7]
        if not re.fullmatch(r'\d+', no):
            txt = ' '.join(c for c in cells if c)
            if txt and not re.search(r'\d{2}\.\d{2}\.\d{4}|Фото товара|Базовая', txt) and not re.fullmatch(r'[\W\d]*', txt):
                cur = re.sub(r'\s+', ' ', txt); sections.append((pn + 1, cur))
            continue
        art = (art or fp).replace('\n', '')
        top, bot = row.bbox[1], row.bbox[3]
        best = None
        for im in imgs:
            cy = (im['top'] + im['bottom']) / 2
            if top - 2 <= cy <= bot + 2: best = im; break
        pim = None
        if best:
            try:
                bb = (max(best['x0'], 0), max(best['top'], 0), min(best['x1'], p.width), min(best['bottom'], p.height))
                pim = p.crop(bb).to_image(resolution=200).original.convert('RGB')
            except Exception: pim = None
        rl = [h for h in p.hyperlinks if (h.get('uri') or '').startswith('http') and top - 1 <= (h['top'] + h['bottom']) / 2 <= bot + 1]
        rl.sort(key=lambda h: -h['x0'])
        items.append(dict(no=int(no), page=pn + 1, section=cur, art=art, desc=desc, pack=pack, price=price, link=rl[0]['uri'] if rl else None, _im=pim))
for it in items:
    im = it.pop('_im')
    if im is not None and im.size[0] > 2 and im.size[1] > 2:
        im.thumbnail((360, 360)); im.save(f"{OUT}/img/{it['no']}.jpg", quality=82, optimize=True); it['img'] = f"img/{it['no']}.jpg"
    else: it['img'] = None
json.dump(items, open(OUT + '/raw.json', 'w'), ensure_ascii=False, indent=1)
print(len(items), 'items; no image:', [i['no'] for i in items if not i['img']])
for s in sections: print(s)
