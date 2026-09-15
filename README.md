# MBTL 対戦特化型ダッシュボード

『MELTY BLOOD: TYPE LUMINA』の対戦カード(1P vs 2P)ごとにフレームデータ・対策メモ・当たり判定画像を並べて確認できる、非公式のファン制作ツールです。

キャラクター選択画面で1P/2Pを選ぶと、両キャラのフレームデータ表が左右に並んだダッシュボードに切り替わります。技コマンドで検索したり、確定反撃のある技をハイライトしたり、技の行を開くと当たり判定画像や対策メモを確認できます。

## 使い方

ビルド不要の素の HTML/CSS/JS です。ただし `data/*.json` を `fetch()` で読み込むため、`index.html` を直接ダブルクリックして `file://` で開くと CORS 制限で技データが読み込めません。プロジェクト直下で簡易サーバーを立てて開いてください。

```sh
# 例: Python
python -m http.server 8000

# 例: Node (npx)
npx serve .
```

その後ブラウザで `http://localhost:8000/` を開きます。

## ディレクトリ構成

```
index.html            # アプリ本体(キャラセレ〜ダッシュボードの全ロジック)
data/
  <char>.json          # キャラごとのフレームデータ本体(fetchで読み込む一次データ)
  <char>-data.js        # 上記のfetch失敗時に使う埋め込みフォールバック(window.__XXX_DATA__)
  tactics-data.js       # キャラ別の対策メモ(scripts/buildTactics.jsで生成)
  hitbox-data.js         # 技コマンド→当たり判定画像の対応表(scripts/buildHitboxMap.jsで生成)
images/
  Characters/            # キャラセレ・ヘッダー用の立ち絵
  Input_ila/             # 技コマンド表示用の方向/ボタンアイコン
  MoveMotions/            # 当たり判定画像の元素材(キャラごとのフォルダ)
  bg/, logo/              # 背景・ロゴ
scripts/
  buildHitboxMap.js      # images/MoveMotions/ の画像をdata/<char>.jsonの技コマンドに紐付け、hitbox-data.jsを生成
  buildTactics.js         # 対策メモのテキストから tactics-data.js を生成
  auditData.js            # data/ 内のフレーム値表記ゆれ正規化・isPunishable/totalDamageの自動補正
```

## データを更新するとき

1. `data/<char>.json` の技データ(フレーム値・特記事項など)を直接編集する。
2. `node scripts/auditData.js` — 全角/半角表記ゆれの正規化と `isPunishable`/`totalDamage` の再計算。
3. `node scripts/buildHitboxMap.js` — `images/MoveMotions/` の画像をコマンドに紐付け直し、`data/hitbox-data.js` を再生成。
4. 対策メモを更新した場合は `node scripts/buildTactics.js` も実行(ソースのテキストはローカル専用フォルダに置いており、このリポジトリには含まれていません)。

## 権利表記について

本ツールは個人のファン制作物であり、『MELTY BLOOD: TYPE LUMINA』の開発・運営元とは一切関係ありません。作中キャラクターの名称・画像等の著作権は © TYPE-MOON / Project LUMINA / FRENCH-BREAD に帰属します。
