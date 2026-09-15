// Game＿System/【カジュアルキャラ対策】/ 配下の各キャラ対策テキストをパースし、
// data/tactics-data.js (window.__TACTICS_DATA__) を一括生成する。
//
// 実行方法: node scripts/buildTactics.js
'use strict';

const fs = require('fs');
const path = require('path');

const SOURCE_DIR = path.join(__dirname, '..', 'Game＿System', '【カジュアルキャラ対策】');
const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'tactics-data.js');

// ファイル名の先頭一致(*相当) -> キャラID(CHARACTERS[].id と一致させる)
const FILE_PREFIX_TO_ID = [
  ['【MBTL】対アルクェイド', 'arcueid'],
  ['【MBTL】対シエル', 'ciel'],
  ['【MBTL】対遠野志貴', 'shiki'],
  ['【MBTL】対秋葉', 'akiha'],
  ['【MBTL】対翡翠', 'hisui'],
  ['【MBTL】対琥珀', 'kohaku'],
  ['【MBTL】対ヒスコハ', 'maid'],
  ['【MBTL】対都古', 'miyako'],
  ['【MBTL】対軋間紅摩', 'kouma'],
  ['【MBTL】対ノエル', 'noel'],
  ['【MBTL】対ヴローヴ', 'vlov'],
  ['【MBTL】対ロア', 'roa'],
  ['【MBTL】対暴走アルクェイド', 'warc'],
  ['【MBTL】対セイバー', 'saber'],
  ['【MBTL】対死徒ノエル', 'dan'],
  ['【MBTL】対蒼崎青子', 'aoko'],
  ['【MBTL】対完全武装シエル', 'pciel'],
  ['【MBTL】対マーリオゥ', 'mario'],
  ['【MBTL】対ネコアルク', 'neco'],
  ['【MBTL】対マシュ', 'mash'],
  ['【MBTL】対牛若丸', 'ushiwaka'],
  ['【MBTL】対巌窟王', 'monte']
];

function resolveCharId(filename) {
  var hit = FILE_PREFIX_TO_ID.find(function (pair) { return filename.startsWith(pair[0]); });
  return hit ? hit[1] : null;
}

// 空行を境に段落を判定し、前後の空行を取り除きつつ連続する空行を1行に畳んで
// 「段落の区切りだけを保った」テキストへ正規化する。
function normalizeBlock(lines) {
  var out = [];
  var blankRun = false;
  lines.forEach(function (line) {
    var trimmed = line.trim();
    if (trimmed === '') {
      blankRun = true;
      return;
    }
    if (blankRun && out.length > 0) out.push('');
    blankRun = false;
    out.push(trimmed);
  });
  return out.join('\n').trim();
}

// 箇条書きの導入文(「気をつけるべき技は以下」「以下対策すべき技。」等)は文言が
// ファイルごとに揺れる上、他の地の文と同じ行に句読点なしで同居している場合すら
// あるため、行単位ではなく「。」区切りの文単位で判定する。「以下」と「技」を
// 両方含む文だけを導入文とみなして取り除き、同じ行の他の文(概要として有効な
// 地の文)は残す。
function stripAnnounceSentences(line) {
  if (!/以下/.test(line)) return line;
  var sentences = line.split('。').filter(function (s) { return s !== ''; });
  var kept = sentences.filter(function (s) { return !(/以下/.test(s) && /技/.test(s)); });
  return kept.length > 0 ? kept.join('。') + '。' : '';
}

// ほとんどのファイルは「○技名」だけの行の次行から本文が始まるが、一部のファイル
// (死徒ノエル等)は「○技名は〜。」のように見出しと本文の1文目が同じ行に同居して
// いる。後者を検出したら、(1)箇条書きから得た既知の技名で最長一致する接頭辞、
// (2)助詞の手前までの短い名詞句、(3)最初の句点まで、の順にフォールバックしながら
// 技名相当の見出しを推定する。
var TITLE_SPLIT_PARTICLES = ['には', 'とは', 'は', 'が', 'を', 'に', 'で', 'と', 'の'];

function splitSmushedTitle(content, keyPointBaseNames) {
  var matched = keyPointBaseNames
    .filter(function (name) { return name && content.indexOf(name) === 0; })
    .sort(function (a, b) { return b.length - a.length; })[0];
  if (matched) return matched;

  for (var p = 0; p < TITLE_SPLIT_PARTICLES.length; p++) {
    var idx = content.indexOf(TITLE_SPLIT_PARTICLES[p]);
    if (idx > 0 && idx <= 12) return content.slice(0, idx);
  }

  var periodIdx = content.indexOf('。');
  return periodIdx > 0 ? content.slice(0, Math.min(periodIdx, 20)) : content.slice(0, 20);
}

function parseTacticsFile(rawText) {
  var lines = rawText.split('\n');

  var bulletStart = lines.findIndex(function (l) { return /^・/.test(l.trim()); });
  var sectionIdxs = [];
  lines.forEach(function (l, idx) { if (/^○/.test(l.trim())) sectionIdxs.push(idx); });

  // ごく一部のファイルは箇条書きの前に(技解説ではない)一般的な心構えの「○」節が
  // 挟まることがあるため、概要と箇条書きの範囲は「箇条書き開始行より前にある
  // 最初の○節」を上限として区切る(無ければ箇条書き開始行が上限)。
  var sectionBeforeBullets = -1;
  for (var s = 0; s < sectionIdxs.length; s++) {
    if (bulletStart === -1 || sectionIdxs[s] < bulletStart) { sectionBeforeBullets = sectionIdxs[s]; break; }
  }
  var summaryUpperBound = bulletStart === -1 ? lines.length : bulletStart;
  if (sectionBeforeBullets !== -1) summaryUpperBound = sectionBeforeBullets;

  // ---- summary: 冒頭(1行目のタイトルを除く)から箇条書き/導入文の手前まで ----
  var summaryLines = lines.slice(1, summaryUpperBound).map(stripAnnounceSentences);
  var summary = normalizeBlock(summaryLines);

  // ---- 「・」で始まる箇条書き(技名+補足の生テキスト) ----
  var bulletTexts = [];
  if (bulletStart !== -1) {
    var bulletsEnd = lines.length;
    for (var s2 = 0; s2 < sectionIdxs.length; s2++) {
      if (sectionIdxs[s2] >= bulletStart) { bulletsEnd = sectionIdxs[s2]; break; }
    }
    for (var b = bulletStart; b < bulletsEnd; b++) {
      var t = lines[b].trim();
      if (t.charAt(0) === '・') bulletTexts.push(t.slice(1).trim());
    }
  }
  // 箇条書きの技名部分だけを取り出したベース名(例: "邪魔よ！(衝撃波を纏って…)" -> "邪魔よ！")。
  // moveNotes とのキー突き合わせ、および見出しと本文が同居する行の分割推定の両方に使う。
  var keyPointBaseNames = bulletTexts
    .map(function (b) { return b.replace(/[(（].*$/, '').trim(); })
    .filter(Boolean);

  // ---- moveNotes: 「○技名」で始まる各セクションのタイトルと本文 ----
  var moveNotes = {};
  sectionIdxs.forEach(function (idx, si) {
    var content = lines[idx].trim().replace(/^○/, '').trim();
    var end = si + 1 < sectionIdxs.length ? sectionIdxs[si + 1] : lines.length;
    var key, bodyLines;
    if (content.indexOf('。') === -1) {
      // クリーンな見出し単独行。本文は次行から。
      // "邪魔よ！(以下「波動1段・2段・3段目」)" のような読み替え注記は技名から除く。
      // "姉妹の絆誕生編(交代)" のように名前の一部である括弧はそのまま残す。
      key = content.replace(/\s*\(以下[^)]*\)\s*$/, '').trim();
      bodyLines = lines.slice(idx + 1, end);
    } else {
      // 見出しと本文の1文目が同じ行に同居しているケース。行全体(見出し部分含む)を
      // 本文の1行目として残しつつ、技名相当の見出しを別途推定する。
      key = splitSmushedTitle(content, keyPointBaseNames);
      bodyLines = [content].concat(lines.slice(idx + 1, end));
    }
    var body = normalizeBlock(bodyLines);
    if (key && body) moveNotes[key] = body;
  });

  // ---- keyPoints: ドロワー表示用に {label, desc} の配列へ整形 ----
  // desc は対応する moveNotes 本文の1文目(最初の「。」まで)。箇条書き由来のラベルは
  // 括弧を全部落とすのに対し、単独行見出しの moveNotes キーは "AD(おまけ)" のように
  // 技名の一部として括弧を残すことがあるため、完全一致で見つからなければ「キー側の
  // 括弧を落とすと一致する」「どちらかがどちらかの接頭辞になっている」の順で拾う。
  // それでも見つからない場合は該当セクションが存在しないということなので空文字のまま
  // にする(呼び出し側でラベルのみ表示させるため)。
  var moveNoteKeys = Object.keys(moveNotes);
  function resolveMoveNoteKey(label) {
    if (moveNotes.hasOwnProperty(label)) return label;
    var strippedMatch = moveNoteKeys.find(function (k) {
      return k.replace(/[(（].*$/, '').trim() === label;
    });
    if (strippedMatch) return strippedMatch;
    var prefixMatches = moveNoteKeys.filter(function (k) {
      return k.indexOf(label) === 0 || label.indexOf(k) === 0;
    });
    if (prefixMatches.length > 0) {
      prefixMatches.sort(function (a, b) { return b.length - a.length; });
      return prefixMatches[0];
    }
    return null;
  }

  var keyPoints = keyPointBaseNames.map(function (label) {
    var matchedKey = resolveMoveNoteKey(label);
    var note = matchedKey ? moveNotes[matchedKey] : null;
    var desc = '';
    if (note) {
      var periodIdx = note.indexOf('。');
      desc = periodIdx !== -1 ? note.slice(0, periodIdx + 1) : note;
    }
    return { label: label, desc: desc };
  });

  return { summary: summary, keyPoints: keyPoints, moveNotes: moveNotes };
}

function main() {
  var files = fs.readdirSync(SOURCE_DIR).filter(function (f) { return f.endsWith('.txt'); });
  var data = {};
  var matchedIds = [];

  files.forEach(function (filename) {
    var id = resolveCharId(filename);
    if (!id) {
      console.warn('[skip] マッピングが見つかりません: ' + filename);
      return;
    }
    var fullPath = path.join(SOURCE_DIR, filename);
    var rawText = fs.readFileSync(fullPath, 'utf8')
      .replace(/^﻿/, '')
      .replace(/\r\n/g, '\n')
      .trim();
    var parsed = parseTacticsFile(rawText);
    data[id] = {
      summary: parsed.summary,
      keyPoints: parsed.keyPoints,
      moveNotes: parsed.moveNotes,
      rawText: rawText
    };
    matchedIds.push(id);
  });

  var expectedIds = FILE_PREFIX_TO_ID.map(function (pair) { return pair[1]; });
  var missing = expectedIds.filter(function (id) { return matchedIds.indexOf(id) === -1; });
  var orderedData = {};
  expectedIds.forEach(function (id) { if (data[id]) orderedData[id] = data[id]; });

  var header =
    '// キャラ別「対策メモ」データ。id は CHARACTERS[].id と一致させる。\n' +
    '// このファイルは scripts/buildTactics.js による自動生成物です(手編集は再生成で失われます)。\n' +
    '// 元データ: Game＿System/【カジュアルキャラ対策】/ 配下の各キャラ対策テキスト。\n' +
    '// 再生成する場合は `node scripts/buildTactics.js` を実行してください。\n' +
    '// 未登録キャラは index.html 側の getTacticsData() がフォールバック表示を行う。\n';
  var body = 'window.__TACTICS_DATA__ = ' + JSON.stringify(orderedData, null, 2) + ';\n';
  fs.writeFileSync(OUTPUT_FILE, header + body, 'utf8');

  console.log('抽出したキャラ数: ' + matchedIds.length + ' / ' + expectedIds.length);
  console.log('登録キー: ' + expectedIds.filter(function (id) { return orderedData[id]; }).join(', '));
  if (missing.length > 0) {
    console.error('欠落しているキャラID: ' + missing.join(', '));
    process.exitCode = 1;
  } else {
    console.log('全' + expectedIds.length + 'キャラ分のキーが欠落なく揃っています。');
  }
}

main();
