# -*- coding: utf-8 -*-
"""雰囲気6型のFVをAPIで生成する。

  python3 gen.py --photo          … 6型で使い回す「共通の写真」を1枚だけ作る
  python3 gen.py                  … 6型ぜんぶ（共通写真を参照画像として渡す）
  python3 gen.py 04               … 1型だけ
  python3 gen.py 06 --n 3         … ポップを3案出す（弱いとき用）
  python3 gen.py --no-ref         … 参照画像を使わず、写真も生成させる

写真を6型で共通にするのは配色を共通にするのと同じ理由。
写真が違うと「雰囲気の差」ではなく「写真の差」を見比べることになる。
実案件では写真はクライアント素材に差し替わるので、
**写真に頼らずに雰囲気が出せるか**がテンプレの実力。

鍵は ~/Desktop/LP生成/.env.local か ~/.zshrc から読む。**値は表示しない。**

出力： _ref/photo.png（共通写真） / _ref/fv_<番号>_<名前>.png
"""
import argparse, base64, json, os, re, sys, time, urllib.request, urllib.error, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '_ref')
PHOTO = os.path.join(OUT, 'photo.png')

# ブランド色＋保護色の2色構成。検証はNG 0件（配色の表は BRIEF.md）
PAL = {
    '地': '#ffffff',
    'ブランド色': '#0f2b4d',
    'ブランド淡': '#f1f4f8',
    '保護色': '#c15710',
    '保護色・淡': '#fdede3',
    '中性': '#5b6571',
}

# 文言は固定しない。SHARE Security（2026-08）のプロンプトと比べて分かったこと：
# 文字を一字一句固定すると、モデルは制約を満たすことに使い切ってデザインに余地が残らない。
# 指定するのは「分量」だけにして、「正確な再現は不要」と明示する。
COPY = ('大きなメインコピー2行、\n'
        '短い導入コピー1〜2行、\n'
        '3つ程度の短い訴求、\n'
        'CTAボタン1つ')

# 6型で使い回す共通写真。人物の顔を入れない＝表情が雰囲気を運ばないようにする。
# 業種が分からず、どの雰囲気にも寄らない中立な絵にする。
PHOTO_PROMPT = (
    '実写の写真を1枚。明るいオフィスの一角を、斜め上から見下ろした構図。'
    '木目の机の上に、開いたノートパソコン・閉じたノート・ペン・マグカップが置いてある。'
    '奥に大きな窓があり、自然光が左から差し込んでいる。'
    '\n■人物は写さない（手も顔も入れない）。'
    '\n■文字・ロゴ・ブランド名・画面の中身は一切写さない（パソコンの画面は無地）。'
    '\n■業種が分かるもの（図面・カルテ・商品・工具・制服など）は写さない。'
    '\n■色は落ち着いた中間色。派手な色や強い色味を入れない。'
    '\n■加工感のない自然な写真。イラスト・CG・合成に見せない。'
)

# 型ごとに渡すのは雰囲気の語だけ。本人が最初に挙げた語をそのまま使う。
#
# 実測（2026-09-04）。指定を減らすほど質は上がる：
#   ・pxや角丸の値まで指定  → 制約の消化で終わり、デザインが残らない
#   ・構図を平文で指定      → 割れるが、割れ方が指定した側の知識で頭打ちになる
#   ・雰囲気を段落＋NGで説明 → 段落自体が構図を縛る（「静かだが緊張感」等）
#   ・雰囲気の語だけ        → ここ
MOODS = [
    ('01', 'genki',     '元気',   {'mood': '元気（熱い・力強い・躍動感）'}),
    ('02', 'yawaraka',  'やわらか', {'mood': 'やわらか（温かい・やさしい・ナチュラル・和モダン）'}),
    ('03', 'seijitsu',  '誠実',   {'mood': '誠実（実直・素朴・信頼感・公的・事務的・整然・職人）'}),
    ('04', 'cool',      'クール',  {'mood': 'クール（硬派・無機質・硬質・かっちり・知的）'}),
    ('05', 'ochitsuki', '落ち着き', {'mood': '落ち着き（上品・高級・端正・繊細・モード）'}),
    ('06', 'pop',       'ポップ',  {'mood': 'ポップ（かわいい・おしゃれ・軽やか・カラフル・レトロ）'}),
]

# プロンプトは短くする。長い定型文はモデルの手癖を呼ぶだけで、どれも同じ絵になる。
# 残すのは4つ ── 何か／雰囲気／写真／色。
# 「1440px幅のブラウザで見たスクリーンショット」は落とさない。
# これが無いと広告バナーの絵になる（2026-09-04 実測）。


def prompt(name, spec, with_photo):
    # 写真の中身は指定しない。被写体を書くと寄る（机の俯瞰＝マクロ寄りになった）。
    # 揃えるのは枚数だけにして、何を写すかはモデルに任せる。
    photo = '添付の写真を使う。' if with_photo else '写真は2枚使う。'
    return (
        f'BtoB向けサービスサイトのファーストビュー。'
        f'1440px幅のブラウザで見た、実際のWebサイトのスクリーンショットとして。\n\n'
        f'雰囲気：{spec["mood"]}\n'
        f'この雰囲気に極端に振り切る。一目でこの雰囲気だと分かるところまで誇張する。'
        f'無難にまとめない。\n\n'
        f'{photo}\n'
        f'色は、ネイビー {PAL["ブランド色"]} と白・グレー。'
        f'オレンジ {PAL["保護色"]} を少しだけ。\n'
        f'文字は日本語。短く。'
    )


def load_env():
    env = {}
    for f in ['~/Desktop/LP生成/.env.local', '~/.zshrc', '~/.zshenv']:
        p = os.path.expanduser(f)
        if not os.path.exists(p):
            continue
        try:
            src = open(p, errors='ignore').read()
        except Exception:
            continue
        for m in re.finditer(r'^(?:export\s+)?([A-Z_]+)\s*=\s*["\']?([^"\'\s]+)', src, re.M):
            env.setdefault(m.group(1), m.group(2))
    for k in ('OPENAI_API_KEY', 'GEMINI_API_KEY'):
        if os.environ.get(k):
            env[k] = os.environ[k]
    return env


def post(url, payload, headers, timeout=600):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json', **headers})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:600]
    except Exception as e:
        return 'ERR', str(e)[:300]


def post_multipart(url, fields, files, headers, timeout=600):
    """images/edits は multipart。標準ライブラリだけで組む。"""
    b = '----' + uuid.uuid4().hex
    out = b''
    for k, v in fields:
        out += (f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n').encode()
    for k, path in files:
        out += (f'--{b}\r\nContent-Disposition: form-data; name="{k}"; '
                f'filename="{os.path.basename(path)}"\r\n'
                'Content-Type: image/png\r\n\r\n').encode()
        out += open(path, 'rb').read() + b'\r\n'
    out += f'--{b}--\r\n'.encode()
    req = urllib.request.Request(url, data=out, headers={
        'Content-Type': f'multipart/form-data; boundary={b}', **headers})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:600]
    except Exception as e:
        return 'ERR', str(e)[:300]


def b64_of(res):
    if isinstance(res, dict):
        d = res.get('data') or []
        if d:
            return d[0].get('b64_json')
    return None


def save_b64(b64, path):
    open(path, 'wb').write(base64.b64decode(b64))
    return os.path.getsize(path) // 1024


def main():
    ap = argparse.ArgumentParser(add_help=False)
    ap.add_argument('which', nargs='*', default=[])
    ap.add_argument('--photo', action='store_true', help='共通写真だけ作る')
    ap.add_argument('--no-ref', action='store_true', help='共通写真を渡さない')
    ap.add_argument('--openai-model', default='gpt-image-2')
    ap.add_argument('--size', default='1536x1024')
    ap.add_argument('--photo-size', default='1024x1024')
    ap.add_argument('--n', type=int, default=1)
    a = ap.parse_args()

    env = load_env()
    if 'OPENAI_API_KEY' not in env:
        print('OPENAI_API_KEY が見つからない'); return 1
    key = env['OPENAI_API_KEY']
    hdr = {'Authorization': 'Bearer ' + key}
    os.makedirs(OUT, exist_ok=True)

    if a.photo:
        t0 = time.time()
        st, res = post('https://api.openai.com/v1/images/generations',
                       {'model': a.openai_model, 'prompt': PHOTO_PROMPT,
                        'size': a.photo_size, 'n': 1}, hdr)
        b = b64_of(res)
        if not b:
            print(f'✕ 共通写真 status={st}'); print('  ', str(res)[:300]); return 1
        print(f'✓ 共通写真  {save_b64(b, PHOTO)}KB  {time.time()-t0:.0f}s  → {PHOTO}')
        return 0

    use_ref = (not a.no_ref) and os.path.exists(PHOTO)
    if not use_ref and not a.no_ref:
        print('共通写真がない。先に  python3 gen.py --photo  を実行する'); return 1

    targets = [m for m in MOODS if (not a.which or m[0] in a.which)]
    if not targets:
        print('該当なし'); return 1
    print(f'{a.openai_model} / {len(targets)}型 × {a.n}案 / '
          f'共通写真：{"使う" if use_ref else "使わない"}\n')

    fails = []
    for num, slug, name, spec in targets:
        for i in range(a.n):
            sfx = '' if a.n == 1 else f'_{chr(97+i)}'
            path = os.path.join(OUT, f'fv_{num}_{slug}{sfx}.png')
            t0 = time.time()
            p = prompt(name, spec, use_ref)
            if use_ref:
                st, res = post_multipart(
                    'https://api.openai.com/v1/images/edits',
                    # input_fidelity は gpt-image-2 が未対応（400になる）
                    [('model', a.openai_model), ('prompt', p),
                     ('size', a.size), ('n', '1')],
                    [('image[]', PHOTO)], hdr)
            else:
                st, res = post('https://api.openai.com/v1/images/generations',
                               {'model': a.openai_model, 'prompt': p,
                                'size': a.size, 'n': 1}, hdr)
            b = b64_of(res)
            if b:
                print(f'  ✓ {num} {name}{sfx}  {save_b64(b, path)}KB  {time.time()-t0:.0f}s')
            else:
                print(f'  ✕ {num} {name}{sfx}  status={st}')
                print('     ', str(res)[:300])
                fails.append(num + sfx)
    if fails:
        print('\n失敗:', ', '.join(fails))
    return 0


if __name__ == '__main__':
    sys.exit(main())
