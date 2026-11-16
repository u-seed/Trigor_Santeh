#!/usr/bin/env python3
"""Извлекает из PDF-прайса TRIGOR все позиции, фото и ссылки «Фото+» -> raw.json + img/
Использование: python3 extract_pdf.py price.pdf папка_вывода"""
import pdfplumber, json, io, os, re, sys
from PIL import Image
SRC=sys.argv[1]; OUT=sys.argv[2]
os.makedirs(OUT+'/img',exist_ok=True)
pdf=pdfplumber.open(SRC)
items=[]; sections=[]; cur_section=None
imgcache={}
unmatched=[]
for pn,p in enumerate(pdf.pages):
    tbs=p.find_tables()
    if not tbs: continue
    tb=max(tbs,key=lambda t:len(t.rows))
    imgs=[im for im in p.images if im['x0']<190 and im['x1']>20]
    for row in tb.rows:
        cells=[ (p.crop(c).extract_text() if c else '') for c in row.cells]
        cells=[(c or '').strip() for c in cells]
        if len(cells)<8: continue
        no,_,art,mat,desc,fp,qty,price=cells[:8]
        top,bot=row.bbox[1],row.bbox[3]
        if no in('№',) or 'Прайс-лист' in no or 'Оглавление' in ''.join(cells): continue
        isnum=re.fullmatch(r'\d+',no)
        if not isnum: continue
        art=art or fp
        HEADERS=('Нагревалети','Подводки','ТРАПЫ','Смесителя','Смесители-нержавейка','Нержавейка')
        is_header = (not art) or desc.strip() in HEADERS or desc.strip().startswith('Комплектующие') or desc.strip().startswith('Латунь серия')
        if is_header:
            # section header row?
            txt=desc or ' '.join(c for c in cells if c)
            if txt and not re.search(r'\d{2}\.\d{2}\.\d{4}',txt):
                cur_section=txt.replace('\n',' ').strip(); sections.append((pn+1,no,cur_section))
            continue
        # find image
        best=None
        for im in imgs:
            cy=(im['top']+im['bottom'])/2
            if top-2<=cy<=bot+2: best=im;break
        if not best:
            for im in imgs:
                if im['top']<=top+3 and im['bottom']>=bot-3: best=im;break
        fn=None
        if best:
            try:
                data=best['stream'].get_data()
            except Exception as e: data=None
            # use pillow via page crop for reliable decode
            bb=(best['x0'],best['top'],best['x1'],best['bottom'])
            key=(pn,tuple(round(x) for x in bb))
            try:
                pim=p.crop(bb).to_image(resolution=200).original.convert('RGB')
            except Exception as e:
                pim=None
        else:
            pim=None
        rl=[h for h in p.hyperlinks if (h.get('uri') or '').startswith('http') and top-1<=(h['top']+h['bottom'])/2<=bot+1]
        rl.sort(key=lambda h:-h['x0'])
        link=rl[0]['uri'] if rl else None
        items.append(dict(link=link,no=int(no) if isnum else no,page=pn+1,section=cur_section,art=art.replace('\n',''),mat=mat.replace('\n',''),desc=desc,fotoplus=fp.replace('\n',''),qty=qty,price=price,_im=pim))
        if pim is None: unmatched.append((pn+1,no))
# save images
for it in items:
    im=it.pop('_im')
    if im is not None:
        im.thumbnail((360,360))
        name=f"{it['no']}.jpg"
        im.save(f"{OUT}/img/{name}",quality=82,optimize=True)
        it['img']=f"img/{name}"
    else: it['img']=None
json.dump(items,open(OUT+'/raw.json','w'),ensure_ascii=False,indent=1)
print(len(items),'items; no image:',unmatched)
print('sections:'); 
for s in sections: print(s)
