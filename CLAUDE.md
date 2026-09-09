# MBTL Hub

MELTY BLOOD: TYPE LUMINA（MBTL）の攻略・フレームデータ情報サイト。

## 技術スタック

- Astro（静的サイト生成、`output: "static"`）
- Tailwind CSS v4（`@tailwindcss/vite` プラグイン方式。`tailwind.config.js` は使わず、`src/styles/global.css` の `@import "tailwindcss";` を起点にする）
- TypeScript（strict）
- Content Collections + Zod（データはスキーマ駆動で管理する。下記参照）

## 設計方針

### スキーマ駆動（Content Collections + Zod）

キャラクター・技（フレームデータ）・コンボといったゲームデータは、すべて `src/content/config.ts` に定義した Zod スキーマを唯一の正とする。

- ページ側やコンポーネント側で独自に型を定義しない。スキーマから推論した型（`CollectionEntry<'characters'>` など）を使う。
- データを追加・変更する際は、まずスキーマが実態に合っているかを確認し、合っていなければスキーマを直す。スキーマを無視した場当たり的なフィールド追加はしない。
- フレームデータ特有の値（発生・持続・硬直・ガード硬直差など）は空欄や未計測のケースがあるため、必須にすべきか optional にすべきかを都度検討する。

### 1キャラ先行検証

全キャラ分のデータを一度に作り込まず、まず「牛若丸」1キャラだけでスキーマ・表示・ビルドが一通り成立することを検証してから、他キャラへ展開する。スキーマの手戻りは他キャラのデータ入力前に済ませる。

## ディレクトリ構成

```
src/
  content/
    config.ts        # Zodスキーマ定義（characters / moves / combos）
    characters/       # キャラクター基本情報（1キャラ1エントリ）
    moves/            # 技フレームデータ
    combos/           # コンボレシピ
  layouts/
  pages/
  styles/
    global.css        # Tailwindのエントリポイント
```

（実際の構成は進行に応じて変わるため、作業前に `src/content/` の現状を確認すること。）

## 開発フロー

- 開発サーバーはバックグラウンドで起動する:

```
astro dev --background
```

バックグラウンドサーバーの管理は `astro dev stop` / `astro dev status` / `astro dev logs` で行う。

- 実行環境は Windows（PowerShell）。パス区切りや改行コードに起因する問題が出ないよう注意する。
- データ追加後は `npm run build` でスキーマ検証（Content Collections のバリデーション）とビルドが通ることを確認する。

## 参考ドキュメント

作業内容に関連するものは事前に確認する。

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Adding or managing content (Content Collections)](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- Full documentation: https://docs.astro.build
