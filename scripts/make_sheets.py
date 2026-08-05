# -*- coding: utf-8 -*-
"""ESLの各セクションが必要とする「構造」で候補を絞り、確認用の一覧を作る。
   （最終判断は人／自分が目で見て行う）"""
import csv, json, os, re, sys
from PIL import Image, ImageDraw, ImageFont
LIB=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC=os.path.join(LIB,'_raw','allsections')
ALLOW={"教育","BtoB","コーポレート","採用","医療","士業","不動産","メディア","サービス",
       "金融","福祉","美容","ブライダル","フィットネス","自治体","公共","団体","文化施設",
       "スポーツ","建設","建築","製造","地域・自治体","既存"}
DENY={"EC","飲食","食品","小売","店舗","ブランド","観光","宿泊","レジャー","エンタメ","イベント","文化"}

def industries():
    m={}
    p=os.path.join(LIB,'harvest_sites.csv')
    for r in csv.DictReader(open(p,encoding='utf-8-sig')):
        u=(r.get('url') or '').strip()
        if not u.startswith('http'): continue
        d=re.sub(r'^https?://(www\.)?','',u).split('/')[0].lower()
        m[re.sub(r'[^0-9a-zA-Z]+','_',d)[:36]]=(r.get('industry') or '').strip()
    for r in csv.DictReader(open(os.path.join(LIB,'index.csv'),encoding='utf-8-sig')):
        sid=r.get('id','')
        if sid: m.setdefault(sid.rsplit('_s',1)[0],'既存')
    return m

# ESLのセクションが構造として必要とするもの
NEED={
 '01':('FV',            lambda f,i,n: i==0 and f['photo']>.35),
 '02':('CTA',           lambda f,i,n: f['ratio']>2.4 and f['ink']<7 and .3<i/max(1,n-1)<1),
 '03':('4つの特徴',      lambda f,i,n: f['cols']>=3 and f['table']<.96 and 1.3<f['ratio']<4.5 and f['ink']>3),
 '04':('POINT詳細',      lambda f,i,n: f['cols']<=2 and f['photo']>.22 and 1.1<f['ratio']<3.4 and f['ink']>4),
 '05':('英検合格率',      lambda f,i,n: f['cols']>=3 and f['photo']<.35 and f['ratio']>1.6 and f['ink']>3),
 '06':('レッスンの様子',   lambda f,i,n: f['photo']>.55 and f['cols']>=2 and f['ratio']>1.4),
 '09':('マネジャー紹介',   lambda f,i,n: f['cols']<=2 and .05<f['photo']<.42 and f['ink']>6 and f['ratio']<2.8),
 '10':('講師紹介',       lambda f,i,n: f['cols']>=3 and f['photo']>.32 and 1.4<f['ratio']<4),
 '12':('保護者の声',      lambda f,i,n: f['ink']>6 and f['photo']<.38 and f['ratio']<3.2),
 '13':('合格実績',       lambda f,i,n: f['photo']<.25 and f['ratio']>2.2 and f['cols']>=3 and f['ink']>3),
 '14':('他社比較',       lambda f,i,n: f['table']>.93 and f['photo']<.25 and f['cols']>=3 and f['ink']>4),
 '15':('教室紹介',       lambda f,i,n: i/max(1,n-1)>.4 and f['photo']>.2 and f['cols']<=3 and f['ink']>4),
 '17':('フッター',       lambda f,i,n: i>=n-2 and f['ink']>3),
}

def main():
    F=json.load(open(os.path.join(LIB,'_raw','features.json'),encoding='utf-8'))
    pos=json.load(open(os.path.join(LIB,'_raw','pos.json'),encoding='utf-8'))
    IND=industries()
    only=sys.argv[1] if len(sys.argv)>1 else None
    out=os.path.join(LIB,'_raw','sheets'); os.makedirs(out,exist_ok=True)
    for no,(name,fn) in NEED.items():
        if only and no!=only: continue
        c=[]
        for k,f in F.items():
            if f['ink']<2.2 or not(0.7<f['ratio']<9) or f['h']<170: continue
            g=IND.get(k.rsplit('_s',1)[0],'')
            if g in DENY or g not in ALLOW: continue
            i,n=pos.get(k,(0,1))
            try:
                if not fn(f,i,n): continue
            except Exception: continue
            c.append((f['chroma']*.5+f['ink']+f['photo']*20, k))
        c.sort(reverse=True)
        picked,per=[],{}
        for s,k in c:
            sl=k.rsplit('_s',1)[0]
            if per.get(sl,0)>=1: continue
            per[sl]=1; picked.append(k)
            if len(picked)>=30: break
        # 一覧画像
        COLS=5; CW=420; CH=330; PAD=6; LAB=22
        rows=(len(picked)+COLS-1)//COLS
        sh=Image.new('RGB',(COLS*(CW+PAD)+PAD, rows*(CH+LAB+PAD)+PAD),'#1b1b1b')
        d=ImageDraw.Draw(sh)
        def font(s):
            for p in ['/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc','/System/Library/Fonts/Helvetica.ttc']:
                try: return ImageFont.truetype(p,s)
                except Exception: pass
            return ImageFont.load_default()
        Ff=font(15)
        for j,k in enumerate(picked):
            im=Image.open(os.path.join(SRC,k+'.jpg')).convert('RGB')
            im=im.resize((CW,int(im.height*CW/im.width)))
            im=im.crop((0,0,CW,min(CH,im.height)))
            x=PAD+(j%COLS)*(CW+PAD); y=PAD+(j//COLS)*(CH+LAB+PAD)
            d.rectangle([x,y,x+CW,y+CH],fill='#2a2a2a'); sh.paste(im,(x,y))
            d.rectangle([x,y,x+52,y+22],fill='#000')
            d.text((x+5,y+3), f"{no}-{j+1}", font=Ff, fill='#fff')
            d.text((x+3,y+CH+2), k[:44], font=Ff, fill='#CCC')
        p=os.path.join(out,f'{no}.jpg'); sh.save(p,quality=84)
        json.dump(picked,open(os.path.join(out,f'{no}.json'),'w'))
        print(f"  {no} {name}: {len(picked)}件 → {p}")

main()
