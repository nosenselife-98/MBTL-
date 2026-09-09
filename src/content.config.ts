import { defineCollection, reference, z } from 'astro:content';
import { glob } from 'astro/loaders';

const characters = defineCollection({
	loader: glob({ pattern: '**/*.yaml', base: './src/content/characters' }),
	schema: z.object({
		// 表示名(例: 牛若丸)
		name: z.string(),
		// ふりがな
		nameKana: z.string().optional(),
		// 英語表記(海外向け表記・検索用)
		nameEn: z.string().optional(),
		// キャッチコピー・二つ名
		title: z.string().optional(),
		// 立ち回りタイプの簡単な説明(例: スピード特化のラッシュキャラ)
		playstyle: z.string().optional(),
		// 体力
		health: z.number().int().positive().optional(),
		// アイコン・立ち絵などの画像パス(public配下を想定)
		image: z.string().optional(),
	}),
});

const moves = defineCollection({
	loader: glob({ pattern: '**/*.yaml', base: './src/content/moves' }),
	schema: z.object({
		// 対象キャラクター(charactersコレクションのidを参照)
		character: reference('characters'),
		// 技名・入力コマンド表記(例: 5A, 2C, 214B)
		name: z.string(),
		// 技の通称・呼び名があれば(例: 一閃)
		displayName: z.string().optional(),
		// 入力コマンド(表記ゆれがある場合、nameと分けて明記)
		input: z.string(),
		// 発生(フレーム)
		startup: z.number().int().nonnegative().optional(),
		// 持続(フレーム)
		active: z.number().int().nonnegative().optional(),
		// 全体硬直(フレーム)
		recovery: z.number().int().nonnegative().optional(),
		// ガード硬直差(マイナスで不利)
		onBlock: z.number().int().optional(),
		// ヒット硬直差
		onHit: z.number().int().optional(),
		// ダメージ
		damage: z.number().int().nonnegative().optional(),
		// 攻撃属性(上段・中段・下段・投げ)
		attribute: z.enum(['上段', '中段', '下段', '投げ']).optional(),
		// 補足(用途・注意点など自由記述)
		notes: z.string().optional(),
	}),
});

const combos = defineCollection({
	loader: glob({ pattern: '**/*.yaml', base: './src/content/combos' }),
	schema: z.object({
		// 対象キャラクター(charactersコレクションのidを参照)
		character: reference('characters'),
		// コンボの名称・用途(例: 基礎コンボ、端限定コンボ)
		name: z.string(),
		// コンボルート表記(例: "5A > 5B > 5C > 214B")
		route: z.string(),
		// トータルダメージ
		damage: z.number().int().nonnegative().optional(),
		// 始動位置の制約
		position: z.enum(['どこでも', '画面端', '画面中央']).optional(),
		// 難易度の目安
		difficulty: z.enum(['簡単', '普通', '難しい']).optional(),
		// 補足(始動条件・注意点など自由記述)
		notes: z.string().optional(),
	}),
});

export const collections = { characters, moves, combos };
