import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { freefreeCategoryLabel } from '@/lib/freefree-categories'
import FreefreeModerationRow, { type ModerationPost } from './_components/FreefreeModerationRow'
import ModerationRecordRow, { type RecordRow } from './_components/ModerationRecordRow'

// サンプル投稿の目印。seed-freefree.mjs が入れるものはタイトル先頭が [サンプル]
const SAMPLE_MARK = /^\s*\[?サンプル\]?/

export default async function AdminFreefreePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/freefree')

  const { data: me } = await supabase
    .from('members')
    .select('admin_role')
    .eq('id', user.id)
    .maybeSingle()
  const role = me?.admin_role as string | null | undefined
  if (role !== 'committee' && role !== 'super') redirect('/')

  // 運営は freefree_select_admin で全ステータスを見られる
  const { data: posts, error: postsError } = await supabase
    .from('freefree_posts')
    .select('id, title, body, status, category, location, created_at, expires_at, poster_type, poster_id, moderation_note, images')
    .order('created_at', { ascending: false })
    .limit(200)

  // org 掲載は団体名を出す
  const orgIds = (posts ?? []).filter((p) => p.poster_type === 'org').map((p) => p.poster_id)
  const orgNames = new Map<string, string>()
  if (orgIds.length > 0) {
    const { data: orgs } = await supabase.from('organizations').select('id, name').in('id', orgIds)
    ;(orgs ?? []).forEach((o) => orgNames.set(o.id, o.name))
  }

  const POSTER_LABEL: Record<string, string> = {
    member: '👤 個人',
    individual_business: '🛍 個人事業',
    org: '👥 団体',
  }

  const rows: ModerationPost[] = (posts ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    body: p.body,
    status: p.status,
    category: freefreeCategoryLabel(p.category),
    location: p.location,
    created_at: p.created_at,
    expires_at: p.expires_at,
    posterLabel:
      p.poster_type === 'org'
        ? `👥 ${orgNames.get(p.poster_id) ?? '団体'}`
        : (POSTER_LABEL[p.poster_type] ?? p.poster_type),
    moderationNote: (p.moderation_note as string | null) ?? null,
    looksLikeSample: SAMPLE_MARK.test(p.title),
    imageCount: ((p.images as string[] | null) ?? []).length,
  }))

  const visible = rows.filter((r) => r.status !== 'removed')
  const hidden = rows.filter((r) => r.status === 'removed')
  const samples = visible.filter((r) => r.looksLikeSample)

  // 対応記録（証拠保全）。掲載が削除済みでも残る
  const { data: records } = await supabase
    .from('moderation_records')
    .select('id, action, created_at, reason, snapshot, poster, evidence_paths, actor_id')
    .order('created_at', { ascending: false })
    .limit(100)

  const actorIds = Array.from(new Set((records ?? []).map((r) => r.actor_id).filter(Boolean) as string[]))
  const actorNames = new Map<string, string>()
  if (actorIds.length > 0) {
    const { data: as } = await supabase.from('members').select('id, display_name').in('id', actorIds)
    ;(as ?? []).forEach((a) => actorNames.set(a.id, a.display_name))
  }

  const recordRows: RecordRow[] = (records ?? []).map((r) => {
    const snap = (r.snapshot ?? {}) as Record<string, unknown>
    const poster = (r.poster ?? {}) as Record<string, unknown>
    return {
      id: r.id,
      action: r.action,
      createdAt: r.created_at,
      reason: r.reason,
      title: String(snap.title ?? '(タイトル不明)'),
      posterLabel: String(poster.org_name ?? poster.display_name ?? poster.poster_type ?? '不明'),
      evidenceCount: ((r.evidence_paths as string[] | null) ?? []).length,
      actorName: r.actor_id ? (actorNames.get(r.actor_id) ?? null) : null,
    }
  })

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-6">
        <nav className="text-xs text-slate-500"><Link href="/admin" className="hover:underline">← 管理画面</Link></nav>
        <header>
          <p className="text-xs tracking-[0.3em] text-slate-500 uppercase">Admin / FreeFree</p>
          <h1 className="text-3xl font-serif font-bold">FreeFree掲示板の管理</h1>
          <p className="text-sm text-slate-500 mt-1">
            サンプル投稿の片付けと、迷惑投稿・不適切投稿への対応。
            <strong className="font-medium">「非公開にする」は元に戻せます。</strong>
            まず非公開にして様子を見るのが安全です。
          </p>
          <p className="text-sm mt-2">
            <Link href="/admin/freefree/openpoi" className="text-sky-700 dark:text-sky-400 underline">📥 OpenPOIインポート管理</Link>
            <span className="text-slate-500">（地域の店舗・施設を確認してから一括登録）</span>
          </p>
        </header>

        {postsError && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-lg p-4 text-sm space-y-1">
            <p className="font-medium text-amber-900 dark:text-amber-200">掲載を読み込めませんでした</p>
            <p className="text-xs text-amber-800 dark:text-amber-300">
              マイグレーション <code>20260808120000_freefree_admin_moderation.sql</code> が未適用の可能性があります
              （下の一覧が 0 件に見えるのは、掲載が無いからではありません）。
            </p>
            <p className="text-[11px] text-amber-700 dark:text-amber-400 font-mono break-all">{postsError.message}</p>
          </div>
        )}

        <section className="bg-white dark:bg-slate-900 border rounded-lg p-5">
          <h2 className="text-lg font-semibold mb-1">
            公開中（{visible.length} 件
            {samples.length > 0 && <span className="text-violet-700 dark:text-violet-300">／うちサンプルらしきもの {samples.length} 件</span>}
            ）
          </h2>
          <p className="text-xs text-slate-500 mb-3">タイトルをクリックすると掲載ページが別タブで開きます。</p>
          {visible.length > 0 ? (
            <ul className="space-y-2">
              {visible.map((p) => <FreefreeModerationRow key={p.id} post={p} />)}
            </ul>
          ) : (
            <p className="text-sm text-slate-400 text-center py-4">公開中の掲載はありません</p>
          )}
        </section>

        <section className="bg-white dark:bg-slate-900 border rounded-lg p-5">
          <h2 className="text-lg font-semibold mb-1">非公開にしたもの（{hidden.length} 件）</h2>
          <p className="text-xs text-slate-500 mb-3">
            一覧・詳細ページから消えており、SNSの紹介候補からも外れています。必要なら元に戻せます。
          </p>
          {hidden.length > 0 ? (
            <ul className="space-y-2">
              {hidden.map((p) => <FreefreeModerationRow key={p.id} post={p} />)}
            </ul>
          ) : (
            <p className="text-sm text-slate-400 text-center py-4">非公開にした掲載はありません</p>
          )}
        </section>

        <section className="bg-white dark:bg-slate-900 border rounded-lg p-5">
          <h2 className="text-lg font-semibold mb-1">🗂 対応記録（{recordRows.length} 件）</h2>
          <p className="text-xs text-slate-500 mb-3">
            非公開・削除の操作をしたときに、掲載内容と投稿者の識別情報を凍結して残しています。
            掲載を完全に削除したあとも記録は残り、画像は非公開の保管庫に退避されています。
            被害届や捜査関係事項照会に応じる必要が出た場合は、ここから提出用データを取り出せます。
          </p>
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded p-3 mb-3 text-[11px] text-amber-900 dark:text-amber-200 space-y-1">
            <p>📌 提出用データには、投稿時のIPアドレス・端末情報（<strong>2026年8月8日以降の書き込みのみ</strong>）と、投稿者本人の直近の書き込み履歴が含まれます。それ以前の投稿にはIPの記録がありません。</p>
            <p>⚠ 書き込み記録は<strong>90日で自動削除</strong>されます。必要な記録は期限内にダウンロードしてください。一覧は<Link href="/admin/audit" className="underline">書き込み記録</Link>で確認できます。</p>
            <p>⚠ 第三者（警察を含む）への提供は法令に基づく手続きが必要です。運用ルールは法務確認のうえ定めてください。</p>
          </div>
          {recordRows.length > 0 ? (
            <ul className="space-y-2 max-h-[32rem] overflow-y-auto">
              {recordRows.map((r) => <ModerationRecordRow key={r.id} record={r} />)}
            </ul>
          ) : (
            <p className="text-sm text-slate-400 text-center py-4">対応記録はまだありません</p>
          )}
        </section>
      </div>
    </div>
  )
}
