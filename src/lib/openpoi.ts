// OpenPOI API クライアント（サーバー専用）。
// 仕様: https://docs.openpoiapi.com/ （認証不要・GET /v1/search ・ /v1/suggest）
// 利用規約: 検索結果の保存は可。licenses / attributions を一緒に保存し、画面に出すときは
//           「OpenPOI API」を出典として記載し https://openpoiapi.com/attribution.html へリンクする。

import type { Bbox, OpenpoiFacility } from './freefree-import-core'
import { SEARCH_LIMIT } from './freefree-import-core'

function base(): string {
  return (process.env.OPENPOI_API_BASE || 'https://api.openpoiapi.com').replace(/\/+$/, '')
}

async function getJson(url: string): Promise<unknown> {
  let lastErr = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1000))
    let res: Response
    try {
      res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000), cache: 'no-store' })
    } catch (e) {
      lastErr = `接続失敗: ${e instanceof Error ? e.message : String(e)}`
      continue
    }
    // 429 は API Gateway 由来。一度だけ待って再試行する
    if (res.status === 429 || res.status >= 500) { lastErr = `OpenPOI API が HTTP ${res.status} を返しました`; continue }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`OpenPOI API が HTTP ${res.status} を返しました: ${body.slice(0, 200)}`)
    }
    try {
      return await res.json()
    } catch {
      throw new Error('OpenPOI API の応答が JSON ではありませんでした')
    }
  }
  throw new Error(lastErr || 'OpenPOI API に接続できませんでした')
}

/** bbox 内の施設を最大 200 件取得する（ページ送りは無い） */
export async function searchBbox(b: Bbox): Promise<OpenpoiFacility[]> {
  const qs = new URLSearchParams({ bbox: b.map((n) => n.toFixed(6)).join(','), limit: String(SEARCH_LIMIT) })
  const data = (await getJson(`${base()}/v1/search?${qs}`)) as { results?: unknown }
  if (!data || !Array.isArray(data.results)) throw new Error('OpenPOI API の応答形式が想定と異なります（results がありません）')
  return data.results as OpenpoiFacility[]
}

/** 市区町村名から検索範囲（bbox）を引く。/v1/suggest の vocabulary(place) の bbox を使う */
export async function resolveCityBbox(prefecture: string, city: string): Promise<Bbox> {
  const qs = new URLSearchParams({ q: city, limit: '1', fields: 'minimal' })
  const data = (await getJson(`${base()}/v1/suggest?${qs}`)) as {
    vocabulary?: { type?: string; city?: string; prefecture?: string; bbox?: number[] }[]
  }
  const hit = (data.vocabulary ?? []).find(
    (v) => v.type === 'place' && v.city === city && (!prefecture || !v.prefecture || v.prefecture === prefecture) && Array.isArray(v.bbox) && v.bbox.length === 4,
  )
  if (!hit?.bbox) throw new Error(`「${prefecture}${city}」の範囲を OpenPOI で特定できませんでした。地図範囲（bbox）で指定してください`)
  // 座標の外れ値で広がることがあり、逆に縁の施設が漏れることもあるため、少し余白を足す
  const m = 0.02
  return [hit.bbox[0] - m, hit.bbox[1] - m, hit.bbox[2] + m, hit.bbox[3] + m]
}
