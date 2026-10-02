'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { FREEFREE_CATEGORIES, freefreeCategoryLabel, FREEFREE_PERIODS } from '@/lib/freefree-categories'
import {
  buildPostDraft,
  checkPublishable,
  openpoiCategoryLabel,
  type CandidateEdits,
} from '@/lib/freefree-import-core'
import OpenpoiAttribution from '@/app/freefree/_components/OpenpoiAttribution'
import {
  dismissCandidateUpdate,
  publishCandidates,
  runOpenpoiFetch,
  saveCandidateEdits,
  setCandidatesExcluded,
  type FetchInput,
  type FetchSummary,
  type PublishItemResult,
} from '../actions'

export type CandidateRow = {
  id: string
  name: string
  name_kana: string | null
  prefecture: string | null
  city: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  openpoi_category: string | null
  business_type: string | null
  openpoi_source: string | null
  phone: string | null
  website: string | null
  opening_hours: string | null
  description: string | null
  licenses: string[]
  attributions: string[]
  category: string | null
  category_reason: string | null
  import_status: 'candidate' | 'publishing' | 'imported' | 'excluded' | 'failed'
  duplicate_status: 'none' | 'possible' | 'duplicate'
  duplicate_reason: string | null
  duplicate_of_post_id: string | null
  duplicate_of_candidate_id: string | null
  freefree_post_id: string | null
  import_error: string | null
  edits: CandidateEdits | null
  edited: boolean
  update_available: boolean
  update_diff: { fields?: Record<string, { from: unknown; to: unknown }> } | null
  last_seen_at: string
  raw_data: unknown
}

export type RunRow = {
  id: string
  kind: 'fetch' | 'publish'
  region_key: string | null
  status: string
  counts: Record<string, unknown> | null
  error: string | null
  started_at: string
  finished_at: string | null
}

export type Stats = {
  total: number; candidate: number; imported: number; excluded: number; failed: number; publishing: number
  duplicate: number; possible: number; uncategorized: number; updates: number
}

type Props = {
  rows: CandidateRow[]
  totalCount: number
  page: number
  pageSize: number
  filters: { status: string; dup: string; cat: string; q: string }
  stats: Stats
  runs: RunRow[]
  defaultRegion: { prefecture: string; city: string }
}

const STATUS_LABEL: Record<string, string> = {
  candidate: '候補', publishing: '登録処理中', imported: '登録済み', excluded: '除外', failed: '失敗',
}
const STATUS_CLASS: Record<string, string> = {
  candidate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  publishing: 'bg-amber-100 text-amber-800',
  imported: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  excluded: 'bg-slate-200 text-slate-500',
  failed: 'bg-red-100 text-red-800',
}

const input = 'w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm'

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${className}`}>{children}</span>
}

function DupBadge({ r }: { r: CandidateRow }) {
  if (r.duplicate_status === 'none') return <span className="text-xs text-slate-400">—</span>
  const dup = r.duplicate_status === 'duplicate'
  return (
    <span title={r.duplicate_reason ?? ''}>
      <Badge className={dup ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}>{dup ? '重複' : '重複の可能性'}</Badge>
      {r.duplicate_reason && <span className="block text-[11px] text-slate-500 mt-0.5">{r.duplicate_reason}</span>}
    </span>
  )
}

function CategoryCell({ r }: { r: CandidateRow }) {
  const key = r.edits?.category || r.category
  return key
    ? <span className="text-xs">{freefreeCategoryLabel(key)}</span>
    : <Badge className="bg-orange-100 text-orange-800">未分類</Badge>
}

export default function OpenpoiImportManager({ rows, totalCount, page, pageSize, filters, stats, runs, defaultRegion }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useState<Map<string, CandidateRow>>(new Map())
  const [detail, setDetail] = useState<CandidateRow | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize))
  const selectableOnPage = rows.filter((r) => r.import_status === 'candidate' || r.import_status === 'failed')
  const allOnPageSelected = selectableOnPage.length > 0 && selectableOnPage.every((r) => selected.has(r.id))

  function toggle(r: CandidateRow) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(r.id)) next.delete(r.id)
      else next.set(r.id, r)
      return next
    })
  }
  function toggleAllOnPage() {
    setSelected((prev) => {
      const next = new Map(prev)
      if (allOnPageSelected) selectableOnPage.forEach((r) => next.delete(r.id))
      else selectableOnPage.forEach((r) => next.set(r.id, r))
      return next
    })
  }

  function qs(over: Record<string, string | number>) {
    const p = new URLSearchParams()
    const merged: Record<string, string | number> = { ...filters, page, ...over }
    for (const [k, v] of Object.entries(merged)) {
      if (v === '' || v === 'all' || (k === 'status' && v === 'candidate') || (k === 'page' && v === 0)) continue
      p.set(k, String(v))
    }
    const s = p.toString()
    return s ? `?${s}` : '?'
  }

  function exclude(ids: string[], excluded: boolean) {
    setError(null); setMessage(null)
    startTransition(async () => {
      const r = await setCandidatesExcluded(ids, excluded)
      if (!r.ok) { setError(r.error); return }
      setMessage(`${r.data.changed}件を${excluded ? '除外' : '候補に戻'}しました`)
      setSelected(new Map())
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <StatsBar stats={stats} filters={filters} qs={qs} />
      <FetchPanel defaultRegion={defaultRegion} onDone={() => router.refresh()} />

      {/* フィルタ（GET フォーム。URL で状態を持つので戻る・共有ができる） */}
      <form method="get" className="bg-white dark:bg-slate-900 border rounded-lg p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <input name="q" defaultValue={filters.q} placeholder="施設名・住所で検索" className={input} />
        <select name="status" defaultValue={filters.status} className={input} aria-label="状態">
          <option value="candidate">候補（登録済み・除外を除く）</option>
          <option value="all">すべて</option>
          <option value="imported">登録済みのみ</option>
          <option value="excluded">除外のみ</option>
          <option value="failed">失敗のみ</option>
          <option value="publishing">登録処理中のみ</option>
        </select>
        <select name="dup" defaultValue={filters.dup} className={input} aria-label="重複">
          <option value="all">重複判定：すべて</option>
          <option value="flagged">重複・可能性のみ</option>
          <option value="duplicate">重複のみ</option>
          <option value="possible">重複の可能性のみ</option>
          <option value="none">重複なしのみ</option>
        </select>
        <select name="cat" defaultValue={filters.cat} className={input} aria-label="カテゴリー">
          <option value="all">カテゴリー：すべて</option>
          <option value="uncat">未分類のみ</option>
          {FREEFREE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <div className="flex gap-2">
          <Button type="submit" size="sm" className="flex-1">絞り込む</Button>
          <Link href="?" className="inline-flex items-center px-3 text-xs text-slate-500 hover:underline">解除</Link>
        </div>
      </form>

      {(message || error) && (
        <div className={`rounded border p-3 text-sm ${error ? 'border-red-300 bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-200' : 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200'}`}>
          {error ?? message}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{totalCount.toLocaleString()}件中 {rows.length === 0 ? 0 : page * pageSize + 1}〜{page * pageSize + rows.length}件を表示</span>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllOnPage} disabled={selectableOnPage.length === 0} />
          このページを全選択
        </label>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border rounded-lg p-8 text-center text-sm text-slate-500">
          該当する候補はありません。上の「OpenPOIから取得」で候補を取り込んでください。
        </div>
      ) : (
        <>
          {/* PC: 表 */}
          <div className="hidden md:block bg-white dark:bg-slate-900 border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-slate-500">
                <tr className="text-left">
                  <th className="p-2 w-8"></th>
                  <th className="p-2">施設名 / 住所</th>
                  <th className="p-2">FreeFree<br />カテゴリー</th>
                  <th className="p-2">OpenPOI<br />カテゴリー</th>
                  <th className="p-2">電話 / Web</th>
                  <th className="p-2">緯度経度</th>
                  <th className="p-2">重複判定</th>
                  <th className="p-2">状態</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const selectable = r.import_status === 'candidate' || r.import_status === 'failed'
                  return (
                    <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800 align-top">
                      <td className="p-2"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r)} disabled={!selectable} aria-label={`${r.name}を選択`} /></td>
                      <td className="p-2 max-w-xs">
                        <div className="font-medium">{r.edits?.title || r.name}{r.edited && <span className="ml-1 text-[11px] text-sky-700">編集済み</span>}</div>
                        <div className="text-xs text-slate-500">{r.address || [r.prefecture, r.city].filter(Boolean).join('')}</div>
                        {r.update_available && <Badge className="bg-sky-100 text-sky-800 mt-1">OpenPOI側に更新あり</Badge>}
                      </td>
                      <td className="p-2"><CategoryCell r={r} /></td>
                      <td className="p-2 text-xs text-slate-500">{openpoiCategoryLabel(r.openpoi_category)}</td>
                      <td className="p-2 text-xs text-slate-500">
                        {(r.edits?.phone || r.phone) ?? '—'}
                        {(r.edits?.website || r.website) && <a href={(r.edits?.website || r.website)!} target="_blank" rel="noopener noreferrer nofollow" className="block text-sky-700 hover:underline truncate max-w-[10rem]">Web ↗</a>}
                      </td>
                      <td className="p-2 text-[11px] text-slate-500 whitespace-nowrap">{r.latitude?.toFixed(5)}<br />{r.longitude?.toFixed(5)}</td>
                      <td className="p-2 max-w-[12rem]"><DupBadge r={r} /></td>
                      <td className="p-2"><Badge className={STATUS_CLASS[r.import_status]}>{STATUS_LABEL[r.import_status]}</Badge></td>
                      <td className="p-2 whitespace-nowrap space-x-1">
                        <Button size="sm" variant="outline" onClick={() => setDetail(r)}>詳細</Button>
                        {r.import_status === 'excluded'
                          ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => exclude([r.id], false)}>戻す</Button>
                          : selectable && <Button size="sm" variant="ghost" disabled={pending} onClick={() => exclude([r.id], true)}>除外</Button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* スマホ: カード */}
          <ul className="md:hidden space-y-2">
            {rows.map((r) => {
              const selectable = r.import_status === 'candidate' || r.import_status === 'failed'
              return (
                <li key={r.id} className="bg-white dark:bg-slate-900 border rounded-lg p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1" checked={selected.has(r.id)} onChange={() => toggle(r)} disabled={!selectable} aria-label={`${r.name}を選択`} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium break-words">{r.edits?.title || r.name}</div>
                      <div className="text-xs text-slate-500 break-words">{r.address || [r.prefecture, r.city].filter(Boolean).join('')}</div>
                    </div>
                    <Badge className={STATUS_CLASS[r.import_status]}>{STATUS_LABEL[r.import_status]}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <CategoryCell r={r} />
                    <span>/ {openpoiCategoryLabel(r.openpoi_category)}</span>
                    {r.update_available && <Badge className="bg-sky-100 text-sky-800">更新あり</Badge>}
                  </div>
                  {r.duplicate_status !== 'none' && <DupBadge r={r} />}
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setDetail(r)}>詳細</Button>
                    {r.import_status === 'excluded'
                      ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => exclude([r.id], false)}>戻す</Button>
                      : selectable && <Button size="sm" variant="ghost" disabled={pending} onClick={() => exclude([r.id], true)}>除外</Button>}
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {pageCount > 1 && (
        <nav className="flex items-center justify-center gap-3 text-sm">
          {page > 0 ? <Link href={qs({ page: page - 1 })} className="underline">← 前へ</Link> : <span className="text-slate-300">← 前へ</span>}
          <span className="text-slate-500">{page + 1} / {pageCount}</span>
          {page + 1 < pageCount ? <Link href={qs({ page: page + 1 })} className="underline">次へ →</Link> : <span className="text-slate-300">次へ →</span>}
        </nav>
      )}

      <PublishBar selected={selected} onClear={() => setSelected(new Map())} onExclude={(ids) => exclude(ids, true)} onDone={() => { setSelected(new Map()); router.refresh() }} />
      <RunHistory runs={runs} />

      {detail && (
        <DetailModal
          row={detail}
          onClose={() => setDetail(null)}
          onSaved={() => { setDetail(null); router.refresh() }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function StatsBar({ stats, filters, qs }: { stats: Stats; filters: Props['filters']; qs: (o: Record<string, string | number>) => string }) {
  const items: { label: string; value: number; href: string; tone?: string }[] = [
    { label: '候補', value: stats.candidate, href: qs({ status: 'candidate', dup: 'all', cat: 'all', page: 0 }) },
    { label: '重複', value: stats.duplicate, href: qs({ status: 'candidate', dup: 'duplicate', cat: 'all', page: 0 }), tone: 'text-red-700' },
    { label: '重複の可能性', value: stats.possible, href: qs({ status: 'candidate', dup: 'possible', cat: 'all', page: 0 }), tone: 'text-amber-700' },
    { label: '未分類', value: stats.uncategorized, href: qs({ status: 'candidate', dup: 'all', cat: 'uncat', page: 0 }), tone: 'text-orange-700' },
    { label: '登録済み', value: stats.imported, href: qs({ status: 'imported', dup: 'all', cat: 'all', page: 0 }), tone: 'text-emerald-700' },
    { label: '除外', value: stats.excluded, href: qs({ status: 'excluded', dup: 'all', cat: 'all', page: 0 }) },
    { label: '失敗', value: stats.failed + stats.publishing, href: qs({ status: 'failed', dup: 'all', cat: 'all', page: 0 }), tone: 'text-red-700' },
  ]
  void filters
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
      {items.map((i) => (
        <Link key={i.label} href={i.href} className="bg-white dark:bg-slate-900 border rounded-lg p-3 hover:border-slate-400 transition">
          <div className={`text-xl font-bold ${i.tone ?? ''}`}>{i.value.toLocaleString()}</div>
          <div className="text-[11px] text-slate-500">{i.label}</div>
        </Link>
      ))}
      {stats.updates > 0 && <p className="col-span-full text-xs text-sky-700">OpenPOI側に更新のあった候補が{stats.updates}件あります（詳細で差分を確認できます。FreeFree投稿は自動では変わりません）。</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------

function FetchPanel({ defaultRegion, onDone }: { defaultRegion: { prefecture: string; city: string }; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'city' | 'bbox' | 'center'>('city')
  const [prefecture, setPrefecture] = useState(defaultRegion.prefecture)
  const [city, setCity] = useState(defaultRegion.city)
  const [bbox, setBbox] = useState({ minLng: '', minLat: '', maxLng: '', maxLat: '' })
  const [center, setCenter] = useState({ lat: '', lng: '', radius: '1000' })
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<FetchSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  function build(dryRun: boolean): FetchInput | null {
    if (mode === 'city') return { dryRun, region: { mode: 'city', prefecture, city } }
    if (mode === 'bbox') {
      const b = [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat].map(Number)
      if (b.some((n) => !Number.isFinite(n))) { setError('範囲の4つの数値を入力してください'); return null }
      return { dryRun, region: { mode: 'bbox', bbox: b } }
    }
    const [lat, lng, radiusM] = [center.lat, center.lng, center.radius].map(Number)
    if ([lat, lng, radiusM].some((n) => !Number.isFinite(n))) { setError('緯度・経度・半径を入力してください'); return null }
    return { dryRun, region: { mode: 'center', lat, lng, radiusM } }
  }

  function run(dryRun: boolean) {
    setError(null); setResult(null)
    const body = build(dryRun)
    if (!body) return
    if (!dryRun && !confirm('OpenPOI から取得して「候補」に保存します（FreeFreeにはまだ公開されません）。実行しますか？')) return
    startTransition(async () => {
      const r = await runOpenpoiFetch(body)
      if (!r.ok) { setError(r.error); return }
      setResult(r.data)
      if (!dryRun) onDone()
    })
  }

  return (
    <section className="bg-white dark:bg-slate-900 border rounded-lg">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4 text-left">
        <span className="font-semibold">🌐 OpenPOIから取得</span>
        <span className="text-xs text-slate-500">{open ? '閉じる' : '開く'}</span>
      </button>
      {open && (
        <div className="p-4 pt-0 space-y-4">
          <div className="flex flex-wrap gap-3 text-sm">
            {([['city', '地域（市区町村）で検索'], ['bbox', '地図範囲（緯度経度の矩形）'], ['center', '中心点＋半径']] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="fetch-mode" checked={mode === k} onChange={() => setMode(k)} /> {l}
              </label>
            ))}
          </div>

          {mode === 'city' && (
            <div className="grid gap-2 sm:grid-cols-2 max-w-md">
              <label className="text-xs text-slate-500">都道府県<input className={input} value={prefecture} onChange={(e) => setPrefecture(e.target.value)} /></label>
              <label className="text-xs text-slate-500">市区町村<input className={input} value={city} onChange={(e) => setCity(e.target.value)} /></label>
              <p className="sm:col-span-2 text-[11px] text-slate-500">初期値は印西市。他の市（白井市・鎌ケ谷市・成田市など）も、名前を入れるだけで取得できます。</p>
            </div>
          )}
          {mode === 'bbox' && (
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 max-w-2xl">
              {([['minLng', '西端の経度'], ['minLat', '南端の緯度'], ['maxLng', '東端の経度'], ['maxLat', '北端の緯度']] as const).map(([k, l]) => (
                <label key={k} className="text-xs text-slate-500">{l}<input className={input} inputMode="decimal" value={bbox[k]} onChange={(e) => setBbox({ ...bbox, [k]: e.target.value })} placeholder={k.includes('Lng') ? '140.10' : '35.78'} /></label>
              ))}
              <p className="col-span-full text-[11px] text-slate-500">経度0.6°・緯度0.5°以内。市区町村名での絞り込みは行いません。</p>
            </div>
          )}
          {mode === 'center' && (
            <div className="grid gap-2 grid-cols-3 max-w-md">
              <label className="text-xs text-slate-500">緯度<input className={input} inputMode="decimal" value={center.lat} onChange={(e) => setCenter({ ...center, lat: e.target.value })} placeholder="35.8049" /></label>
              <label className="text-xs text-slate-500">経度<input className={input} inputMode="decimal" value={center.lng} onChange={(e) => setCenter({ ...center, lng: e.target.value })} placeholder="140.1512" /></label>
              <label className="text-xs text-slate-500">半径(m)<input className={input} inputMode="numeric" value={center.radius} onChange={(e) => setCenter({ ...center, radius: e.target.value })} /></label>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => run(true)}>{pending ? '処理中…' : '🧪 Dry Run（DBに書き込まない）'}</Button>
            <Button type="button" disabled={pending} onClick={() => run(false)}>候補として取得・保存</Button>
          </div>
          <p className="text-[11px] text-slate-500">OpenPOI は1回200件までしか返さないため、範囲を自動で分割して取得します（最大80回・40秒）。完了まで十数秒かかることがあります。</p>

          {error && <p className="rounded border border-red-300 bg-red-50 text-red-800 p-2 text-sm">{error}</p>}
          {result && <FetchResult s={result} />}
        </div>
      )}
    </section>
  )
}

function FetchResult({ s }: { s: FetchSummary }) {
  const rows: [string, number | string][] = [
    ['OpenPOI から取得（重複除去後）', s.fetched],
    ['対象外の市区町村として除外', s.outOfCity],
    ['名称・座標なしで取り込めない', s.invalid],
    ['新規に候補になる（登録予定）', s.newCandidates],
    ['　うち 重複', s.newDuplicate],
    ['　うち 重複の可能性', s.newPossible],
    ['　うち 重複なし', s.newNone],
    ['　うち カテゴリー不明（未分類）', s.newUncategorized],
    ['すでに候補にある（変更なし）', s.alreadyKnown],
    ['すでに候補にある（内容を更新）', s.refreshed],
    ['登録済み・編集済みで更新あり（印のみ）', s.updateFlagged],
    ['OpenPOI へのリクエスト回数', s.requests],
  ]
  return (
    <div className="rounded border border-slate-200 dark:border-slate-700 p-3 space-y-2">
      <p className="font-semibold text-sm">{s.dryRun ? '🧪 Dry Run の結果（DBは書き換えていません）' : '✅ 取得して候補に保存しました'}</p>
      <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-slate-100 dark:border-slate-800 py-0.5"><dt className="text-slate-600 dark:text-slate-400">{k}</dt><dd className="font-medium">{v}</dd></div>
        ))}
      </dl>
      {(s.aborted || s.truncatedCells > 0) && (
        <p className="text-sm text-amber-800 bg-amber-50 rounded p-2">
          ⚠ 取りこぼしの可能性があります（{s.abortReason ?? `${s.truncatedCells}区画が上限件数のまま`}）。範囲を狭めてもう一度取得してください。
        </p>
      )}
      {s.failedWrites > 0 && <p className="text-sm text-red-700">⚠ {s.failedWrites}件の書き込みに失敗しました。もう一度実行すると続きから保存されます。</p>}
      {s.samples.length > 0 && (
        <details>
          <summary className="text-xs text-slate-500 cursor-pointer">新規候補の例（{s.samples.length}件）</summary>
          <ul className="text-xs mt-1 space-y-0.5">
            {s.samples.map((x, i) => <li key={i}>{x.name} — {x.address ?? '住所なし'} — {x.category ? freefreeCategoryLabel(x.category) : '未分類'} — 重複: {x.duplicate}</li>)}
          </ul>
        </details>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

const CHUNK = 25

function PublishBar({ selected, onClear, onExclude, onDone }: {
  selected: Map<string, CandidateRow>
  onClear: () => void
  onExclude: (ids: string[]) => void
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState<'p_1week' | 'p_1month' | 'p_3months'>('p_3months')
  const [pin, setPin] = useState(false)
  const [allowPossible, setAllowPossible] = useState(false)
  const [allowDuplicate, setAllowDuplicate] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState('')
  const [results, setResults] = useState<PublishItemResult[]>([])
  const [error, setError] = useState<string | null>(null)

  const list = useMemo(() => [...selected.values()], [selected])
  const plan = useMemo(() => list.map((r) => {
    const draft = buildPostDraft(r, r.edits ?? {})
    return { r, chk: checkPublishable(r, draft, { allowDuplicate, confirmPossible: allowPossible }) }
  }), [list, allowDuplicate, allowPossible])
  const okCount = plan.filter((p) => p.chk.ok).length
  const blocked = plan.filter((p) => !p.chk.ok)

  if (selected.size === 0 && results.length === 0) return null

  async function execute(dryRun: boolean) {
    setError(null); setResults([])
    if (!dryRun && !confirm(`${okCount}件を FreeFree に登録（公開）します。よろしいですか？\n掲載期間：${FREEFREE_PERIODS.find((p) => p.key === period)?.label}`)) return
    setRunning(true)
    const ids = plan.filter((p) => p.chk.ok).map((p) => p.r.id)
    const all: PublishItemResult[] = []
    for (let i = 0; i < ids.length; i += CHUNK) {
      setProgress(`${Math.min(i + CHUNK, ids.length)} / ${ids.length} 件を処理中…`)
      const r = await publishCandidates({ ids: ids.slice(i, i + CHUNK), period, dryRun, allowDuplicate, confirmPossible: allowPossible, metaversePin: pin })
      if (!r.ok) {
        setError(`${all.length}件まで処理済みで中断しました: ${r.error}`)
        break
      }
      all.push(...r.data.items)
      setResults([...all])
    }
    setRunning(false)
    setProgress('')
    if (!dryRun) onDone()
  }

  const published = results.filter((r) => r.outcome === 'published').length
  const would = results.filter((r) => r.outcome === 'would_publish').length
  const failed = results.filter((r) => r.outcome === 'failed')
  const skipped = results.filter((r) => r.outcome === 'skipped')

  return (
    <section className="sticky bottom-3 bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-600 rounded-lg shadow-lg p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">選択中 {selected.size}件</span>
        {selected.size > 0 && <>
          <Button size="sm" onClick={() => setOpen(!open)} disabled={running}>FreeFreeへ登録…</Button>
          <Button size="sm" variant="outline" disabled={running} onClick={() => { if (confirm(`${selected.size}件を除外します。よろしいですか？`)) onExclude([...selected.keys()]) }}>選択を除外</Button>
          <Button size="sm" variant="ghost" disabled={running} onClick={onClear}>選択解除</Button>
        </>}
        {selected.size === 0 && results.length > 0 && <Button size="sm" variant="ghost" onClick={() => setResults([])}>結果を閉じる</Button>}
      </div>

      {open && selected.size > 0 && (
        <div className="space-y-3 border-t pt-3">
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <label className="text-xs text-slate-500">掲載期間（期間を過ぎると自動で非公開になります）
              <select className={input} value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}>
                {FREEFREE_PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </label>
            <div className="space-y-1.5 text-xs">
              <label className="flex items-center gap-2"><input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} /> メタバース印西のお店ピンにも出す（住所があるもの）</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={allowPossible} onChange={(e) => setAllowPossible(e.target.checked)} /> 「重複の可能性」のものも登録する（確認済み）</label>
              <label className="flex items-center gap-2 text-red-700"><input type="checkbox" checked={allowDuplicate} onChange={(e) => setAllowDuplicate(e.target.checked)} /> 「重複」と判定されたものも登録する</label>
            </div>
          </div>

          <p className="text-sm">登録できる：<strong>{okCount}件</strong>　／　登録しない：{blocked.length}件</p>
          {blocked.length > 0 && (
            <ul className="text-xs text-slate-600 dark:text-slate-400 max-h-32 overflow-y-auto space-y-0.5">
              {blocked.map((b) => <li key={b.r.id}>・{b.r.name} — {!b.chk.ok && b.chk.reason}</li>)}
            </ul>
          )}
          <p className="text-[11px] text-slate-500">登録した掲載は、あなたのアカウントの個人掲載として作成され、出典（OpenPOI API）が表示されます。メンバーへの新着通知・公式SNSの定期紹介の対象にはなりません。</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={running || okCount === 0} onClick={() => execute(true)}>🧪 Dry Run（登録せず確認だけ）</Button>
            <Button size="sm" disabled={running || okCount === 0} onClick={() => execute(false)}>{running ? progress : `${okCount}件を登録する`}</Button>
          </div>
        </div>
      )}

      {error && <p className="rounded border border-red-300 bg-red-50 text-red-800 p-2 text-sm">{error}</p>}
      {results.length > 0 && (
        <div className="text-sm space-y-1">
          <p>
            {would > 0 && <span>🧪 登録できる見込み：<strong>{would}件</strong>　</span>}
            {published > 0 && <span>✅ 登録成功：<strong>{published}件</strong>　</span>}
            {skipped.length > 0 && <span>⏭ スキップ：{skipped.length}件　</span>}
            {failed.length > 0 && <span className="text-red-700">❌ 失敗：{failed.length}件</span>}
          </p>
          {[...skipped, ...failed, ...results.filter((r) => r.outcome === 'published' && r.message)].length > 0 && (
            <ul className="text-xs max-h-32 overflow-y-auto space-y-0.5">
              {[...failed, ...skipped, ...results.filter((r) => r.outcome === 'published' && r.message)].map((r) => <li key={r.id}>・{r.name} — {r.message}</li>)}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------

function DetailModal({ row, onClose, onSaved }: { row: CandidateRow; onClose: () => void; onSaved: () => void }) {
  const [edits, setEdits] = useState<CandidateEdits>(row.edits ?? {})
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const locked = row.import_status === 'imported' || row.import_status === 'publishing'

  const draft = useMemo(() => buildPostDraft(row, edits), [row, edits])
  const generated = useMemo(() => buildPostDraft(row, { ...edits, body: undefined }).body, [row, edits])
  const set = (k: keyof CandidateEdits, v: string) => setEdits((e) => ({ ...e, [k]: v }))
  const fieldVal = (k: 'address' | 'phone' | 'website' | 'opening_hours') => edits[k] ?? row[k] ?? ''

  function save() {
    setError(null)
    startTransition(async () => {
      const r = await saveCandidateEdits(row.id, edits)
      if (!r.ok) { setError(r.error); return }
      onSaved()
    })
  }
  function dismiss() {
    startTransition(async () => {
      const r = await dismissCandidateUpdate(row.id)
      if (!r.ok) { setError(r.error); return }
      onSaved()
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-3 md:p-8" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="bg-slate-50 dark:bg-slate-950 rounded-xl w-full max-w-5xl p-4 md:p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{row.name}</h2>
            <p className="text-xs text-slate-500">{STATUS_LABEL[row.import_status]} ／ OpenPOI データ元：{row.openpoi_source ?? '不明'} ／ 最終確認：{new Date(row.last_seen_at).toLocaleString('ja-JP')}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>✕ 閉じる</Button>
        </div>

        {row.duplicate_status !== 'none' && (
          <div className={`rounded border p-3 text-sm ${row.duplicate_status === 'duplicate' ? 'border-red-300 bg-red-50 text-red-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
            <strong>{row.duplicate_status === 'duplicate' ? '重複と判定' : '重複の可能性'}</strong>：{row.duplicate_reason}
            {row.duplicate_of_post_id && <> — <Link className="underline" href={`/freefree/${row.duplicate_of_post_id}`} target="_blank">既存のFreeFree掲載を見る ↗</Link></>}
            {row.duplicate_of_candidate_id && <> — 他の候補と重複（候補ID: {row.duplicate_of_candidate_id.slice(0, 8)}）</>}
          </div>
        )}
        {row.update_available && (
          <div className="rounded border border-sky-300 bg-sky-50 text-sky-900 p-3 text-sm space-y-1">
            <strong>OpenPOI側に更新があります</strong>（FreeFree投稿・編集内容は自動では変わりません）
            <ul className="text-xs list-disc pl-5">
              {Object.entries(row.update_diff?.fields ?? {}).map(([k, v]) => <li key={k}>{k}：{String(v.from ?? '（空）')} → {String(v.to ?? '（空）')}</li>)}
              {Object.keys(row.update_diff?.fields ?? {}).length === 0 && <li>ライセンス・帰属表示の変更など</li>}
            </ul>
            <Button size="sm" variant="outline" onClick={dismiss} disabled={pending}>確認した（印を消す）</Button>
          </div>
        )}
        {row.import_error && <p className="rounded border border-red-300 bg-red-50 text-red-800 p-2 text-sm">前回の登録エラー：{row.import_error}</p>}

        <div className="grid gap-4 lg:grid-cols-2">
          {/* 編集 */}
          <div className="space-y-3 bg-white dark:bg-slate-900 border rounded-lg p-4">
            <h3 className="text-sm font-semibold">掲載内容を修正</h3>
            <label className="block text-xs text-slate-500">タイトル（40字まで）
              <input className={input} maxLength={40} disabled={locked} value={edits.title ?? ''} placeholder={row.name} onChange={(e) => set('title', e.target.value)} />
            </label>
            <label className="block text-xs text-slate-500">カテゴリー {!draft.category && <span className="text-orange-700">（未分類：選択が必要です）</span>}
              <select className={input} disabled={locked} value={edits.category ?? row.category ?? ''} onChange={(e) => set('category', e.target.value)}>
                <option value="">未分類</option>
                {FREEFREE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <span className="text-[11px]">{row.category_reason}</span>
            </label>
            <label className="block text-xs text-slate-500">住所<input className={input} disabled={locked} value={fieldVal('address')} onChange={(e) => set('address', e.target.value)} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-slate-500">電話番号<input className={input} disabled={locked} value={fieldVal('phone')} onChange={(e) => set('phone', e.target.value)} placeholder="OpenPOIには電話情報がありません" /></label>
              <label className="block text-xs text-slate-500">営業時間<input className={input} disabled={locked} value={fieldVal('opening_hours')} onChange={(e) => set('opening_hours', e.target.value)} /></label>
            </div>
            <label className="block text-xs text-slate-500">WebサイトURL<input className={input} disabled={locked} value={fieldVal('website')} onChange={(e) => set('website', e.target.value)} placeholder="https://" /></label>
            <label className="block text-xs text-slate-500">
              本文（1000字まで）
              <textarea className={input} rows={9} disabled={locked} value={edits.body ?? generated} onChange={(e) => set('body', e.target.value)} />
              {edits.body !== undefined && <button type="button" className="underline text-[11px]" onClick={() => setEdits((e) => { const n = { ...e }; delete n.body; return n })}>自動生成の本文に戻す</button>}
            </label>
            {error && <p className="text-sm text-red-700">{error}</p>}
            {locked
              ? <p className="text-xs text-slate-500">登録済みの候補は、ここでは編集できません。{row.freefree_post_id && <Link className="underline" href={`/freefree/${row.freefree_post_id}`} target="_blank">FreeFree掲載を開く ↗</Link>}</p>
              : <Button onClick={save} disabled={pending}>{pending ? '保存中…' : '修正内容を保存'}</Button>}
            <p className="text-[11px] text-slate-500">修正内容は OpenPOI の再取得で上書きされません。</p>
          </div>

          {/* プレビュー */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">FreeFreeでの表示プレビュー</h3>
            <article className="space-y-3">
              <header className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="bg-slate-100 text-slate-700">👤 個人（運営登録）</Badge>
                  <span className="text-xs text-slate-500">{draft.category ? freefreeCategoryLabel(draft.category) : '未分類'}</span>
                </div>
                <h4 className="text-2xl font-serif font-bold">{draft.title}</h4>
                {draft.location && <p className="text-sm text-slate-500">📍 {draft.location}</p>}
              </header>
              <div className="bg-white dark:bg-slate-900 border rounded-lg p-4"><p className="whitespace-pre-wrap text-sm">{draft.body}</p></div>
              {draft.links.length > 0 && (
                <div className="bg-white dark:bg-slate-900 border rounded-lg p-4 text-sm">
                  <p className="text-xs font-semibold mb-1">🔗 関連リンク</p>
                  {draft.links.map((l) => <p key={l.url} className="text-sky-700 break-all">{l.label} ↗ {l.url}</p>)}
                </div>
              )}
              <OpenpoiAttribution licenses={row.licenses} attributions={row.attributions} />
            </article>
          </div>
        </div>

        <details className="bg-white dark:bg-slate-900 border rounded-lg p-3 text-xs">
          <summary className="cursor-pointer text-slate-600">OpenPOI の元データ（raw）</summary>
          <p className="mt-2">緯度経度：{row.latitude}, {row.longitude}　／　businessType：{row.business_type}　／　ライセンス：{row.licenses.join(' / ') || '（なし）'}</p>
          <pre className="mt-2 overflow-x-auto bg-slate-50 dark:bg-slate-800 p-2 rounded">{JSON.stringify(row.raw_data, null, 2)}</pre>
        </details>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function RunHistory({ runs }: { runs: RunRow[] }) {
  if (runs.length === 0) return null
  return (
    <section className="bg-white dark:bg-slate-900 border rounded-lg p-4 space-y-2">
      <h2 className="text-sm font-semibold">インポート履歴（直近{runs.length}件）</h2>
      <ul className="text-xs space-y-1">
        {runs.map((r) => (
          <li key={r.id} className="flex flex-wrap gap-x-3 border-b border-slate-100 dark:border-slate-800 pb-1">
            <span className="text-slate-500">{new Date(r.started_at).toLocaleString('ja-JP')}</span>
            <span>{r.kind === 'fetch' ? '取得' : '登録'}</span>
            <span className={r.status === 'success' ? 'text-emerald-700' : r.status === 'failed' ? 'text-red-700' : r.status === 'running' ? 'text-amber-700' : 'text-amber-700'}>{r.status}</span>
            {r.region_key && <span className="text-slate-500">{r.region_key}</span>}
            {r.counts && <span className="text-slate-500">{summarizeCounts(r)}</span>}
            {r.error && <span className="text-red-700">{r.error}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

function summarizeCounts(r: RunRow): string {
  const c = r.counts ?? {}
  if (r.kind === 'fetch') return `新規${c.newCandidates ?? 0}／更新${c.refreshed ?? 0}／既知${c.alreadyKnown ?? 0}／リクエスト${c.requests ?? 0}回`
  return `成功${c.published ?? 0}／スキップ${c.skipped ?? 0}／失敗${c.failed ?? 0}`
}
