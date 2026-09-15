'use strict';
/**
 * buildHitboxMap.js
 *
 * images/MoveMotions/ 配下の当たり判定(Hitbox)画像を各キャラの技データ(command)に
 * 紐付け、data/hitbox-data.js (window.__HITBOX_DATA__) を生成する。
 *
 * 画像ファイル名は Mizuumi Wiki からの転載でキャラごとに表記ゆれが大きいため、
 * 「キャラ名トークン→BE/チャージ有無→hb/hitbox 等の説明語→末尾の連番」の順に
 * 不要な部分を取り除いて技コマンドの正規化文字列(baseCanon)を抽出し、各キャラの
 * data/<id>.json 側の command 文字列を同じ規則で正規化したものと突き合わせる。
 *
 * 1コマンドにつき複数の画像(多段技の各段、派生技、BE版)が存在し得るため、各技
 * キーの値は「画像パスの配列」として出力する(各要素は { src, label? })。
 *   - 多段技: 同じコマンドに複数の画像が見つかった場合、ファイル名の連番
 *     (例: "_hb1"/"_hb2", "_1_hb"/"_2_hb", 末尾の "2B2" のような連番グルー)を
 *     手がかりに「1段目」「2段目」...とラベル付けする。
 *   - 派生技: "236A~B" のような派生コマンドの画像は、派生キー自身に加えて
 *     親コマンド("236A")の配列にも追加され、ラベルに派生コマンド表記を使う。
 *   - BE(溜め)版: 通常技が単発の画像しか持たない場合、対応するBE版画像が
 *     見つかればラベル「BE版」として追加する。
 *
 * 「翡翠＆琥珀(maid)」だけは専用フォルダ「Hisui & Kohaku」(固有技のみ H/K 接頭辞
 * 付きで格納)を最優先で探索し、見つからなければ command 末尾の (翡翠)/(琥珀) 表記
 * に応じて「Hisui」/「Kohaku」個別フォルダへフォールバックする。
 *
 * 実行: node scripts/buildHitboxMap.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MOTION_DIR = path.join(ROOT, 'images', 'MoveMotions');
const DATA_DIR = path.join(ROOT, 'data');
const OUT_PATH = path.join(DATA_DIR, 'hitbox-data.js');
const IMG_PREFIX = 'images/MoveMotions/';

// ---------------------------------------------------------------------------
// キャラID <-> フォルダ名
// ---------------------------------------------------------------------------

const CHAR_FOLDER = {
  arcueid: 'Arcueid Brunestud', ciel: 'Ciel', shiki: 'Shiki Tohno', akiha: 'Akiha Tohno',
  hisui: 'Hisui', kohaku: 'Kohaku', maid: 'Hisui & Kohaku', miyako: 'Miyako Arima',
  kouma: 'Kouma Kishima', noel: 'Noel', vlov: 'Vlov Arkhangel', roa: 'Michael Roa Valdamjong',
  warc: 'Red Arcueid', saber: 'Saber', dan: 'Dead Apostle Noel', aoko: 'Aoko Aozaki',
  pciel: 'Powered Ciel', mario: 'Mario Gallo Bestino', neco: 'Neco-Arc', mash: 'Mash Kyrielight',
  ushiwaka: 'Ushiwakamaru', monte: 'The Count of Monte Cristo'
};

// フォルダ内のファイル名先頭から取り除くキャラ名トークン列(長い/具体的なものを先に試す)
const NAME_TOKENS = {
  'Akiha Tohno': [['akiha']],
  'Aoko Aozaki': [['aoko']],
  'Arcueid Brunestud': [['arcueid']],
  'Ciel': [['ciel']],
  'Dead Apostle Noel': [['da', 'noel'], ['dan']],
  'Hisui & Kohaku': [['maids']],
  'Hisui': [['hisui']],
  'Kohaku': [['kohaku']],
  // 一部ファイルだけ "Kouma_Kishima_" の2トークン接頭辞なので、長い方を先に試す
  'Kouma Kishima': [['kouma', 'kishima'], ['kouma']],
  'Mario Gallo Bestino': [['mario']],
  'Mash Kyrielight': [['mash']],
  'Michael Roa Valdamjong': [['roa']],
  'Miyako Arima': [['miyako'], ['mi']],
  'Neco-Arc': [['neco']],
  'Noel': [['noel']],
  'Powered Ciel': [['poweredciel'], ['pciel']],
  'Red Arcueid': [['warc']],
  'Saber': [['saber']],
  'Shiki Tohno': [['tohno'], ['shiki']],
  'The Count of Monte Cristo': [['montecristo']],
  'Ushiwakamaru': [['ushiwakamaru'], ['ushi']],
  'Vlov Arkhangel': [['vlov']]
};

// ---------------------------------------------------------------------------
// ファイル名 -> { baseCanon, isCharged, seq, altHead, altSeq }
// ---------------------------------------------------------------------------

const DESCRIPTOR_WORDS = new Set(['hb', 'hitbox', 'fb']);

// "hb2"/"hb3" のように説明語に連番が付いたセグメントは、説明語として除去しつつ
// 連番(何段目/何枚目か)だけは seq として拾い上げる。
function matchDescriptor(segment) {
  const l = segment.toLowerCase();
  if (DESCRIPTOR_WORDS.has(l)) return { seq: null };
  const hbNum = l.match(/^hb(\d{1,2})$/);
  if (hbNum) return { seq: parseInt(hbNum[1], 10) };
  if (l.indexOf('hitbox') === 0) return { seq: null };
  if (l === 'full' || l.indexOf('full') === 0) return { seq: null };
  return null;
}

function stripExt(filename) {
  return filename.replace(/\.[a-zA-Z0-9]+$/, '');
}

function tryStripTokens(segments, tokenSeqs) {
  for (const seq of tokenSeqs) {
    if (segments.length < seq.length) continue;
    let ok = true;
    for (let i = 0; i < seq.length; i++) {
      if (segments[i].toLowerCase() !== seq[i]) { ok = false; break; }
    }
    if (ok) return segments.slice(seq.length);
  }
  return null;
}

function parseFilename(filename, folderName) {
  let base = stripExt(filename);
  base = base.replace(/^\d+px-/i, ''); // 先頭の解像度プレフィックス "175px-" 等

  // 末尾の " (1)" 重複ダウンロード連番(あれば拾っておくが、優先度は最も低い)
  let parenSeq = null;
  const trailingParen = base.match(/\s*\((\d+)\)$/);
  if (trailingParen) {
    parenSeq = parseInt(trailingParen[1], 10);
    base = base.slice(0, trailingParen.index);
  }

  let segments = base.split(/[_\-]/).filter(Boolean);

  if (segments.length && segments[0].toLowerCase() === 'mbtl') {
    segments = segments.slice(1);
  }

  const tokenSeqs = NAME_TOKENS[folderName] || [];
  const stripped = tryStripTokens(segments, tokenSeqs);
  if (stripped === null) return null; // キャラ名トークンが一致しないファイルは対象外
  segments = stripped;

  // セグメント途中に紛れ込んだ "(2)" 等の重複ダウンロード連番(例: "rapid2(2)_hb")
  // も同様に拾って取り除く。
  segments = segments.map((s) => {
    const m = s.match(/^(.*?)\((\d+)\)$/);
    if (m) {
      if (parenSeq == null) parenSeq = parseInt(m[2], 10);
      return m[1];
    }
    return s;
  }).filter(Boolean);

  if (segments.some((s) => s.toLowerCase() === 'color')) return null; // パレット見本
  if (segments.length === 0) return null;

  let isCharged = false;
  segments = segments.filter((s) => {
    var l = s.toLowerCase();
    if (l === 'be' || l === 'charged' || l.indexOf('charged') === 0) { isCharged = true; return false; }
    return true;
  });

  let descriptorSeq = null;
  segments = segments.filter((s) => {
    const d = matchDescriptor(s);
    if (d) { if (d.seq != null) descriptorSeq = d.seq; return false; }
    return true;
  });
  if (segments.length === 0) return null;

  // 末尾の明示的な連番セグメント ("_1" "_2" 等)
  let explicitSeq = null;
  if (segments.length > 1 && /^\d{1,2}$/.test(segments[segments.length - 1])) {
    explicitSeq = parseInt(segments[segments.length - 1], 10);
    segments = segments.slice(0, -1);
  }
  if (segments.length === 0) return null;

  const baseCanon = segments.join('').toLowerCase();
  if (!baseCanon) return null;

  const seq = explicitSeq != null ? explicitSeq : (descriptorSeq != null ? descriptorSeq : parenSeq);

  // 区切り文字なしで技コマンドに直接連番が付くケース(例: "2B2" = 2Bの2段目,
  // "236C2"/"236C3", "j2C2"〜"j2C6")。このゲームの表記でボタン文字(A/B/C/D/X)
  // 直後に区切りなしの数字1-9が来る実在コマンドは無い(rapid1/rapid2は既に
  // 単体で技コマンドと直接一致するため、ここでの分割対象になっても無害)。
  let altHead = null, altSeq = null;
  if (seq == null) {
    const m = baseCanon.match(/^(.*[a-dx])([1-9])$/i);
    if (m) { altHead = m[1]; altSeq = parseInt(m[2], 10); }
  }

  return { baseCanon, isCharged, seq, altHead, altSeq };
}

// ---------------------------------------------------------------------------
// json 側 command 文字列 -> baseCanon / isCharged / sister / バリアント展開
// ---------------------------------------------------------------------------

function simpleCanon(cmd) {
  return cmd.replace(/\([^)]*\)/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function parseCommand(cmd) {
  let sister = null;
  const parenMatch = cmd.match(/\(([^)]*)\)\s*$/);
  if (parenMatch) {
    const inner = parenMatch[1];
    if (inner.indexOf('翡翠') !== -1) sister = 'hisui';
    else if (inner.indexOf('琥珀') !== -1) sister = 'kohaku';
  }
  const isCharged = /\[.*\]/.test(cmd);
  // "jB~j2B" のような複合技の2つ目以降にある冗長な "j" を除去してから正規化する
  const work = cmd.replace(/~j/gi, '~');
  const baseCanon = simpleCanon(work);
  return { baseCanon, isCharged, sister };
}

// "236A~B/4B" のような "~X/Y" 形の分岐入力表記から、Wiki画像のファイル名が
// 通常前提としている具体形("236A~B" / "236A~4B")を両方とも候補として展開する。
// 素の(スラッシュを単純除去しただけの)baseCanonも引き続き候補の先頭に残すため、
// 既存の一致挙動を壊さない。
function commandBaseCanonVariants(cmd) {
  const work = cmd.replace(/~j/gi, '~');
  const variants = [simpleCanon(work)];

  const m = work.match(/~([^~()]*)\/([A-Za-z0-9[\]]+)/);
  if (m) {
    const tildeIdx = m.index; // "~" の位置
    const before = work.slice(0, tildeIdx + 1); // "236A~"
    const afterFull = work.slice(tildeIdx + 1);
    const slashPos = afterFull.indexOf('/');
    const leftPart = afterFull.slice(0, slashPos);
    const rest = afterFull.slice(slashPos + 1);
    const rightMatch = rest.match(/^[A-Za-z0-9[\]]+/);
    const rightPart = rightMatch ? rightMatch[0] : rest;
    const tail = rest.slice(rightPart.length);
    variants.push(simpleCanon(before + leftPart + tail));
    variants.push(simpleCanon(before + rightPart + tail));
  }

  return variants.filter((v, i, arr) => v && arr.indexOf(v) === i);
}

// ---------------------------------------------------------------------------
// 特殊エイリアス(技コマンドの記法とファイル名の単語が大きく異なるもの)
// ---------------------------------------------------------------------------

const SPECIAL_ALIASES = {
  da: ['shielda'],
  jda: ['airshielda', 'jshielda'],
  db: ['shieldb'],
  jdb: ['airshieldb', 'jshieldb'],
  dbc: ['shieldbc'],
  jdbc: ['airshieldbc'],
  '46ad': ['throw', 'groundthrow', 'grab'],
  j46ad: ['airthrow', 'jairthrow', 'jthrow'],
  rapid1: ['auto'],
  abcd: ['la']
};

function candidateKeysFor(baseCanon) {
  const keys = [baseCanon];
  (SPECIAL_ALIASES[baseCanon] || []).forEach((k) => keys.push(k));

  // 連係の続き技等で使われる汎用プレースホルダ "X" (例: 236X~X) を
  // 同一ボタンで揃えた具体形 (236AA/236BB/236CC) に展開して候補に加える。
  if (/x/.test(baseCanon)) {
    ['a', 'b', 'c'].forEach((ch) => keys.push(baseCanon.replace(/x/g, ch)));
  }
  // 逆に、json側が具体的なボタン (j214A 等) でも、Wiki側の画像が
  // 汎用プレースホルダ "X" (j214X 等) 1枚だけのことがあるため、
  // 末尾のA/B/Cを"X"に置き換えた形も候補に加える。
  const trailingBtn = baseCanon.match(/^(.+)[abc]$/);
  if (trailingBtn) keys.push(trailingBtn[1] + 'x');

  return keys.filter((v, i, arr) => arr.indexOf(v) === i);
}

// ---------------------------------------------------------------------------
// フォルダ index 構築: baseCanon -> [{ rel, seq }, ...] (charged/plain別)
// ---------------------------------------------------------------------------

function pushRecord(map, key, rec) {
  if (!map.has(key)) map.set(key, []);
  const bucket = map.get(key);
  const seqKey = rec.seq == null ? 1 : rec.seq;
  // 同じ連番の重複ダウンロードファイル("_hb2.png" と "_hb2 (1).png" 等)は
  // 1件にまとめる(ファイル一覧を「丸括弧を含まないものを先」に並べておくことで、
  // 最初に採用される方が常に見た目のきれいなファイル名になる)。
  const dup = bucket.find((b) => (b.seq == null ? 1 : b.seq) === seqKey);
  if (dup) return;
  bucket.push(rec);
}

function buildFolderIndex(folderName) {
  const dirPath = path.join(MOTION_DIR, folderName);
  const index = { charged: new Map(), plain: new Map() };
  if (!fs.existsSync(dirPath)) return index;

  const files = fs.readdirSync(dirPath)
    .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
    // 丸括弧付き(重複ダウンロード)のファイルを後回しにし、綺麗な方のファイル名を優先採用する
    .sort((a, b) => (a.indexOf('(') !== -1 ? 1 : 0) - (b.indexOf('(') !== -1 ? 1 : 0));

  for (const file of files) {
    const parsed = parseFilename(file, folderName);
    if (!parsed) continue;
    const rel = IMG_PREFIX + folderName + '/' + file;
    const map = parsed.isCharged ? index.charged : index.plain;
    pushRecord(map, parsed.baseCanon, { rel, seq: parsed.seq });
    if (parsed.altHead) {
      pushRecord(map, parsed.altHead, { rel, seq: parsed.altSeq });
    }
  }
  return index;
}

const folderIndexCache = new Map();
function getFolderIndex(folderName) {
  if (!folderIndexCache.has(folderName)) {
    folderIndexCache.set(folderName, buildFolderIndex(folderName));
  }
  return folderIndexCache.get(folderName);
}

// baseCanonVariants(複数候補)の各候補についてcandidateKeysForを展開し、最初に
// 見つかったバケツ(配列)を返す。isCharged=trueで見つからない場合のみ通常版
// バケツへフォールバックする(通常版→チャージ版の逆方向は誤ったポーズを見せる
// 恐れがあるため行わない)。
function findBucket(index, baseCanonVariants, isCharged) {
  for (const bc of baseCanonVariants) {
    for (const k of candidateKeysFor(bc)) {
      const bucket = (isCharged ? index.charged : index.plain).get(k);
      if (bucket && bucket.length) return bucket;
    }
  }
  if (isCharged) {
    for (const bc of baseCanonVariants) {
      for (const k of candidateKeysFor(bc)) {
        const bucket = index.plain.get(k);
        if (bucket && bucket.length) return bucket;
      }
    }
  }
  return [];
}

// BE(溜め)版画像だけを、通常版へのフォールバックなしで探す(BE拡張表示用)。
function findChargedOnlyBucket(index, baseCanonVariants) {
  for (const bc of baseCanonVariants) {
    for (const k of candidateKeysFor(bc)) {
      const bucket = index.charged.get(k);
      if (bucket && bucket.length) return bucket;
    }
  }
  return [];
}

function firstNonEmpty(arrays) {
  for (const a of arrays) {
    if (a && a.length) return a;
  }
  return [];
}

// ---------------------------------------------------------------------------
// バケツ(未ラベル)-> ラベル付き画像配列
// ---------------------------------------------------------------------------

function labelBucket(bucket) {
  if (!bucket || bucket.length === 0) return [];
  if (bucket.length === 1) return [{ src: bucket[0].rel }];
  const sorted = bucket.slice().sort((a, b) => {
    const sa = a.seq == null ? 1 : a.seq;
    const sb = b.seq == null ? 1 : b.seq;
    return sa - sb;
  });
  return sorted.map((b) => ({ src: b.rel, label: (b.seq == null ? 1 : b.seq) + '段目' }));
}

// ---------------------------------------------------------------------------
// Vlov専用: 「炎モード(F接頭辞)」「氷モード(I接頭辞)」でファイル名が分かれているが、
// data/vlov.json 側は同じ通常技/必殺技が command 文字列を共有したまま
// (Fire行/Ice行を) 2エントリ持つ特殊な構造になっている。ファイル名先頭の F/I を
// モード振り分けに使い、json側は move.name の「(通常時)」「(アイスモード)」表記で
// 対応するモードを判定する。
// ---------------------------------------------------------------------------

function buildVlovIndex() {
  const folderName = 'Vlov Arkhangel';
  const dirPath = path.join(MOTION_DIR, folderName);
  const idx = {
    fire: { charged: new Map(), plain: new Map() },
    ice: { charged: new Map(), plain: new Map() },
    universal: { charged: new Map(), plain: new Map() }
  };
  if (!fs.existsSync(dirPath)) return idx;

  const files = fs.readdirSync(dirPath)
    .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
    .sort((a, b) => (a.indexOf('(') !== -1 ? 1 : 0) - (b.indexOf('(') !== -1 ? 1 : 0));

  for (const file of files) {
    const parsed = parseFilename(file, folderName);
    if (!parsed) continue;
    let baseCanon = parsed.baseCanon;
    let altHead = parsed.altHead;
    let mode = 'universal';
    if (baseCanon.length > 1 && (baseCanon[0] === 'f' || baseCanon[0] === 'i')) {
      mode = baseCanon[0] === 'f' ? 'fire' : 'ice';
      baseCanon = baseCanon.slice(1);
      if (altHead) altHead = altHead.slice(1);
    }
    const rel = IMG_PREFIX + folderName + '/' + file;
    const map = parsed.isCharged ? idx[mode].charged : idx[mode].plain;
    pushRecord(map, baseCanon, { rel, seq: parsed.seq });
    if (altHead) {
      pushRecord(map, altHead, { rel, seq: parsed.altSeq });
    }
  }
  return idx;
}

function vlovMoveMode(move) {
  const n = move.name || '';
  if (n.indexOf('アイスモード') !== -1 || /^氷/.test(n)) return 'ice';
  if (n.indexOf('通常時') !== -1 || /^炎/.test(n)) return 'fire';
  return null;
}

// ---------------------------------------------------------------------------
// 派生技: 親コマンド探索("236A~B" の親は "236A")
// ---------------------------------------------------------------------------

function findParentMove(move, moves) {
  const cmd = move.command;
  const tildeIdx = cmd.indexOf('~');
  if (tildeIdx === -1) return null;
  const parentRaw = cmd.slice(0, tildeIdx);
  const parentCanon = simpleCanon(parentRaw);
  if (!parentCanon) return null;
  return moves.find((mv) => mv !== move && simpleCanon(mv.command) === parentCanon) || null;
}

// ---------------------------------------------------------------------------
// メイン処理
// ---------------------------------------------------------------------------

const result = {};
const stats = [];

for (const charId of Object.keys(CHAR_FOLDER)) {
  const jsonPath = path.join(DATA_DIR, charId + '.json');
  if (!fs.existsSync(jsonPath)) continue;

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const moves = Array.isArray(data.moves) ? data.moves : [];

  // command が同じキャラ内で重複している場合 (例: Vlov の炎/氷モードのように
  // 同じ command を Fire行/Ice行で共有している) は "command::name" を複合キーにし、
  // 一意な場合はそれまで通り command 単体をキーにする。実行時側も同じ優先順位で
  // 複合キー→単体キーの順に参照する。
  const commandCounts = {};
  moves.forEach((m) => { commandCounts[m.command] = (commandCounts[m.command] || 0) + 1; });
  function keyFor(move) {
    return commandCounts[move.command] > 1 ? (move.command + '::' + (move.name || '')) : move.command;
  }

  let vlovIndexCache = null;
  function getVlovIndex() {
    if (!vlovIndexCache) vlovIndexCache = buildVlovIndex();
    return vlovIndexCache;
  }

  // 各技ごとに { own: 未加工バケツ, isCharged } を求める
  function resolveOwnBucket(move) {
    const { isCharged, sister } = parseCommand(move.command);
    const variants = commandBaseCanonVariants(move.command);

    if (charId === 'vlov') {
      const idx = getVlovIndex();
      const mode = vlovMoveMode(move);
      if (mode === 'fire') return { bucket: firstNonEmpty([findBucket(idx.fire, variants, isCharged), findBucket(idx.universal, variants, isCharged)]), isCharged, chargedIdx: [idx.fire, idx.universal] };
      if (mode === 'ice') return { bucket: firstNonEmpty([findBucket(idx.ice, variants, isCharged), findBucket(idx.universal, variants, isCharged)]), isCharged, chargedIdx: [idx.ice, idx.universal] };
      return { bucket: findBucket(idx.universal, variants, isCharged), isCharged, chargedIdx: [idx.universal] };
    }

    if (charId === 'maid') {
      const maidsIndex = getFolderIndex('Hisui & Kohaku');
      const hisuiIndex = getFolderIndex('Hisui');
      const kohakuIndex = getFolderIndex('Kohaku');
      const hVariants = variants.map((v) => 'h' + v);
      const kVariants = variants.map((v) => 'k' + v);

      if (sister === 'hisui') {
        return {
          bucket: firstNonEmpty([findBucket(maidsIndex, hVariants, isCharged), findBucket(hisuiIndex, variants, isCharged)]),
          isCharged,
          chargedIdxCustom: () => firstNonEmpty([findChargedOnlyBucket(maidsIndex, hVariants), findChargedOnlyBucket(hisuiIndex, variants)])
        };
      }
      if (sister === 'kohaku') {
        return {
          bucket: firstNonEmpty([findBucket(maidsIndex, kVariants, isCharged), findBucket(kohakuIndex, variants, isCharged)]),
          isCharged,
          chargedIdxCustom: () => firstNonEmpty([findChargedOnlyBucket(maidsIndex, kVariants), findChargedOnlyBucket(kohakuIndex, variants)])
        };
      }
      return {
        bucket: firstNonEmpty([findBucket(maidsIndex, variants, isCharged), findBucket(hisuiIndex, variants, isCharged), findBucket(kohakuIndex, variants, isCharged)]),
        isCharged,
        chargedIdxCustom: () => firstNonEmpty([findChargedOnlyBucket(maidsIndex, variants), findChargedOnlyBucket(hisuiIndex, variants), findChargedOnlyBucket(kohakuIndex, variants)])
      };
    }

    const index = getFolderIndex(CHAR_FOLDER[charId]);
    return { bucket: findBucket(index, variants, isCharged), isCharged, chargedIdx: [index] };
  }

  // stage1(自身の画像) + stage2(BE拡張) を計算
  const perMoveImages = new Map();
  moves.forEach((move) => {
    const resolved = resolveOwnBucket(move);
    const items = labelBucket(resolved.bucket);

    if (!resolved.isCharged) {
      const variants = commandBaseCanonVariants(move.command);
      let beBucket = [];
      if (resolved.chargedIdxCustom) {
        beBucket = resolved.chargedIdxCustom();
      } else if (resolved.chargedIdx) {
        beBucket = firstNonEmpty(resolved.chargedIdx.map((idx) => findChargedOnlyBucket(idx, variants)));
      }
      if (beBucket && beBucket.length) {
        const existingSrcs = new Set(items.map((i) => i.src));
        beBucket.forEach((b) => {
          if (!existingSrcs.has(b.rel)) {
            items.push({ src: b.rel, label: 'BE版' });
            existingSrcs.add(b.rel);
          }
        });
      }
    }

    perMoveImages.set(move, items);
  });

  // stage3: 派生技の画像を親コマンドの配列にも追加する
  moves.forEach((move) => {
    const parent = findParentMove(move, moves);
    if (!parent) return;
    const childImgs = perMoveImages.get(move);
    if (!childImgs || !childImgs.length) return;
    const parentImgs = perMoveImages.get(parent);
    if (!parentImgs) return;
    const existingSrcs = new Set(parentImgs.map((i) => i.src));
    childImgs.forEach((ci) => {
      if (!existingSrcs.has(ci.src)) {
        const label = ci.label ? move.command + '(' + ci.label + ')' : move.command;
        parentImgs.push({ src: ci.src, label: label });
        existingSrcs.add(ci.src);
      }
    });
  });

  const map = {};
  let matched = 0;
  moves.forEach((move) => {
    const items = perMoveImages.get(move);
    if (items && items.length) {
      map[keyFor(move)] = items;
      matched++;
    }
  });

  result[charId] = map;
  stats.push({ charId, total: moves.length, matched });
}

fs.writeFileSync(OUT_PATH, 'window.__HITBOX_DATA__ = ' + JSON.stringify(result, null, 2) + ';\n', 'utf8');

console.log('=== buildHitboxMap.js 実行結果サマリー ===');
console.log('');
stats.forEach((s) => {
  const pct = s.total ? Math.round((s.matched / s.total) * 100) : 0;
  console.log(s.charId.padEnd(10), (s.matched + '/' + s.total).padStart(8), (pct + '%').padStart(5));
});
const totalMatched = stats.reduce((a, s) => a + s.matched, 0);
const totalMoves = stats.reduce((a, s) => a + s.total, 0);
console.log('');
console.log('合計: ' + totalMatched + '/' + totalMoves + ' 件の技に画像を紐付けました (' +
  (totalMoves ? Math.round((totalMatched / totalMoves) * 100) : 0) + '%)');
console.log('出力: ' + path.relative(ROOT, OUT_PATH));
