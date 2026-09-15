'use strict';
/**
 * auditData.js
 *
 * data/ 内の全キャラクターJSON (*.json) とフォールバック用JS (*-data.js) を対象に
 *   1. フレーム値 (startup/active/recovery/overall/onBlock/invul/cost/damage) の全角→半角正規化
 *   2. onBlock を解析した isPunishable の自動補正 (-5以下 => true, それ以外 => false)
 *   3. damage を解析した totalDamage (数値) の自動付与
 * を行い、JSON/JS 両方に同じ内容を書き戻す。
 *
 * 実行: node scripts/auditData.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// ---------------------------------------------------------------------------
// 1. 全角 → 半角 正規化
// ---------------------------------------------------------------------------

// このデータセットでは "ー"(長音記号) や "−"(全角マイナス) がマイナス記号の
// 代用として混入しているため、技術的なフレーム値フィールド限定でハイフンへ統一する。
const DASH_VARIANTS = /[ー−‐‑–—]/g;

function normalizeFrameValue(raw) {
  if (typeof raw !== 'string') return raw;

  let s = raw;

  // 全角英数字 (０-９Ａ-Ｚａ-ｚ) を半角へ
  s = s.replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );

  // よく使われる全角記号を半角へ
  const symbolMap = {
    '＋': '+',
    '－': '-',
    '～': '~',
    '，': ',',
    '、': ',',
    '／': '/',
    '（': '(',
    '）': ')',
    '：': ':',
    '　': ' ',
  };
  s = s.replace(/[＋－～，、／（）：　]/g, (ch) => symbolMap[ch]);

  // マイナス記号として使われがちな類似文字を半角ハイフンへ統一
  s = s.replace(DASH_VARIANTS, '-');

  // 連続空白の圧縮 + トリム
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

// 正規化対象フィールド（フレーム関連・数値関連のみ。notes/name等の自然文は対象外）
const FRAME_FIELDS = [
  'startup',
  'active',
  'recovery',
  'overall',
  'onBlock',
  'invul',
  'cost',
  'damage',
];

// ---------------------------------------------------------------------------
// 2. isPunishable 補正
// ---------------------------------------------------------------------------

function extractNumbers(value) {
  if (typeof value === 'number') return [value];
  if (typeof value !== 'string') return [];
  const matches = value.match(/-?\d+(?:\.\d+)?/g);
  if (!matches) return [];
  return matches.map(Number);
}

function computeIsPunishable(onBlockValue) {
  const numbers = extractNumbers(onBlockValue);
  if (numbers.length === 0) return false;
  const worst = Math.min(...numbers);
  return worst <= -5;
}

// ---------------------------------------------------------------------------
// 3. totalDamage 算出
// ---------------------------------------------------------------------------

// "600, 510*4" や "800+700" のような単純な加算/乗算式を安全に計算する。
// (乗算記号は * / x / X / × のいずれにも対応)
function evalSimpleFormula(formula) {
  const terms = formula.split(/\+|,/);
  let total = 0;
  for (const rawTerm of terms) {
    const term = rawTerm.trim();
    if (term === '') continue;
    const factors = term.split(/[*xX×]/).map((f) => f.trim());
    if (factors.some((f) => !/^\d+(\.\d+)?$/.test(f))) return null;
    const product = factors.reduce((acc, f) => acc * parseFloat(f), 1);
    total += product;
  }
  return total;
}

function computeTotalDamage(rawDamage) {
  if (typeof rawDamage === 'number') return rawDamage;
  if (typeof rawDamage !== 'string') return null;

  const value = rawDamage.trim();
  if (value === '' || value === '-') return null;

  // ケース A: 末尾が "(1280)" や "(~2011)" のような
  // 「かっこ内が数字のみ(頭に~可)」の場合、これはゲーム側が既に算出した
  // (ダメージ補正込みの) 実際の合計値なので、それを最優先で採用する。
  const trailingParen = value.match(/\(~?\s*(\d+)\s*\)\s*$/);
  if (trailingParen) {
    return parseInt(trailingParen[1], 10);
  }

  // ケース B: "(500*3) 1395" のように、かっこ書きの式の後ろに
  // 素の合計値だけが続く場合、その末尾の数値を採用する。
  const parenThenNumber = value.match(/^\(.+\)\s*(\d+)\s*$/);
  if (parenThenNumber) {
    return parseInt(parenThenNumber[1], 10);
  }

  // ケース C: "1400/1540" のように "/" だけで区切られた複数値は
  // 通常時/カウンターヒット時などの代替値であり多段ヒットの合算ではないため、
  // 基本値である先頭の値を採用する。
  if (/^\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?$/.test(value)) {
    return parseFloat(value.split('/')[0].trim());
  }

  // ケース D: 括弧・角括弧の注釈を取り除いた上で、
  // "200*3" / "200x3" / "600, 510*4" / "800+700" のような式を計算する。
  const withoutBrackets = value
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .trim();

  const computed = evalSimpleFormula(withoutBrackets);
  if (computed !== null) return computed;

  // ケース E: 上記いずれにも該当しない場合、先頭の数値のみを採用する
  // (例: "1900 [Min: 456]" → 1900, "4800 [4800 ~ 6960 in BH]" → 4800)。
  const leading = value.match(/^-?\d+(\.\d+)?/);
  if (leading) return parseFloat(leading[0]);

  return null;
}

// ---------------------------------------------------------------------------
// メイン処理
// ---------------------------------------------------------------------------

const summary = [];

function processCharacter(baseName) {
  const jsonPath = path.join(DATA_DIR, `${baseName}.json`);
  const jsPath = path.join(DATA_DIR, `${baseName}-data.js`);

  if (!fs.existsSync(jsonPath)) return;

  const rawJson = fs.readFileSync(jsonPath, 'utf8');
  const data = JSON.parse(rawJson);

  let normalizedCount = 0;
  let punishableChangedCount = 0;
  let totalDamageAddedCount = 0;

  if (Array.isArray(data.moves)) {
    for (const move of data.moves) {
      // 1. フレーム値の正規化
      for (const field of FRAME_FIELDS) {
        if (typeof move[field] === 'string') {
          const normalized = normalizeFrameValue(move[field]);
          if (normalized !== move[field]) {
            move[field] = normalized;
            normalizedCount++;
          }
        }
      }

      // 2. isPunishable の自動補正
      const shouldBePunishable = computeIsPunishable(move.onBlock);
      if (move.isPunishable !== shouldBePunishable) {
        punishableChangedCount++;
      }
      move.isPunishable = shouldBePunishable;

      // 3. totalDamage の算出・付与
      const totalDamage = computeTotalDamage(move.damage);
      if (totalDamage !== null) {
        if (move.totalDamage !== totalDamage) {
          totalDamageAddedCount++;
        }
        move.totalDamage = totalDamage;
      } else if ('totalDamage' in move) {
        delete move.totalDamage;
      }
    }
  }

  const newJson = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(jsonPath, newJson, 'utf8');

  // *-data.js の再生成 (先頭の "window.__X_DATA__ = " と末尾の ";" 部分を維持)
  if (fs.existsSync(jsPath)) {
    const rawJs = fs.readFileSync(jsPath, 'utf8');
    const firstBrace = rawJs.indexOf('{');
    const lastBrace = rawJs.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error(`${jsPath}: JSONオブジェクトの境界を検出できませんでした`);
    }
    const prefix = rawJs.slice(0, firstBrace);
    const suffix = rawJs.slice(lastBrace + 1);
    const newJs = prefix + JSON.stringify(data, null, 2) + suffix;
    fs.writeFileSync(jsPath, newJs, 'utf8');
  }

  summary.push({
    character: baseName,
    moves: Array.isArray(data.moves) ? data.moves.length : 0,
    normalizedCount,
    punishableChangedCount,
    totalDamageAddedCount,
  });
}

const characterNames = fs
  .readdirSync(DATA_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));

for (const name of characterNames) {
  processCharacter(name);
}

// ---------------------------------------------------------------------------
// サマリー出力
// ---------------------------------------------------------------------------

console.log('=== auditData.js 実行結果サマリー ===');
console.log(
  `対象キャラクター数: ${summary.length} / 対象技数合計: ${summary.reduce(
    (a, s) => a + s.moves,
    0
  )}`
);
console.log('');
console.log(
  'キャラクター'.padEnd(12),
  '技数'.padStart(6),
  '正規化件数'.padStart(10),
  'isPunishable変更'.padStart(16),
  'totalDamage付与'.padStart(16)
);
for (const s of summary) {
  console.log(
    s.character.padEnd(12),
    String(s.moves).padStart(6),
    String(s.normalizedCount).padStart(10),
    String(s.punishableChangedCount).padStart(16),
    String(s.totalDamageAddedCount).padStart(16)
  );
}

const totals = summary.reduce(
  (acc, s) => ({
    normalizedCount: acc.normalizedCount + s.normalizedCount,
    punishableChangedCount: acc.punishableChangedCount + s.punishableChangedCount,
    totalDamageAddedCount: acc.totalDamageAddedCount + s.totalDamageAddedCount,
  }),
  { normalizedCount: 0, punishableChangedCount: 0, totalDamageAddedCount: 0 }
);

console.log('');
console.log('=== 合計 ===');
console.log(`正規化 (フレーム値クレンジング): ${totals.normalizedCount} 件`);
console.log(`isPunishable 変更: ${totals.punishableChangedCount} 件`);
console.log(`totalDamage 付与/更新: ${totals.totalDamageAddedCount} 件`);
