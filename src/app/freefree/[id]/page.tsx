import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { freefreeCategoryLabel, freefreePosterKindMeta, resolveFreefreePosterKind } from '@/lib/freefree-categories'
import OpenpoiAttribution from '../_components/OpenpoiAttribution'
import { likeFreefree, commentFreefree, useCoupon } from '../actions'

export default async function FreefreeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: post } = await supabase.from('freefree_posts').select('*').eq('id', id).single()
  if (!post) notFound()

  // 掲載者情報（org の場合は組織情報も取得）
  let orgInfo: { name: string; type: 'civic_group' | 'business' | 'government' } | null = null
  if (post.poster_type === 'org') {
    const { data: o } = await supabase
      .from('organizations')
      .select('name, type')
      .eq('id', post.poster_id)
      .single()
    if (o) orgInfo = { name: o.name, type: o.type as 'civic_group' | 'business' | 'government' }
  }
  const posterKind = resolveFreefreePosterKind(post.poster_type, orgInfo?.type)
  const posterMeta = freefreePosterKindMeta(posterKind)

  const { data: supports } = await supabase
    .from('supports')
    .select('id, kind, body, created_at, members(display_name)')
    .eq('post_id', id)
    .order('created_at', { ascending: false })

  const likes = supports?.filter((s) => s.kind === 'like') ?? []
  const comments = supports?.filter((s) => s.kind === 'comment') ?? []

  // クーポン取得（有効期限内のみ）
  const nowIso = new Date().toISOString()
  const { data: coupons } = await supabase
    .from('coupons')
    .select('id, content, conditions, usage_limit, expires_at, created_at')
    .eq('post_id', id)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })

  // クーポンごとの使用回数 + 自分が使ったか
  const couponIds = (coupons ?? []).map((c) => c.id)
  const usesByCoupon = new Map<string, { total: number; usedBySelf: boolean }>()
  if (couponIds.length > 0) {
    const { data: allUses } = await supabase
      .from('coupon_uses')
      .select('coupon_id, member_id')
      .in('coupon_id', couponIds)
    ;(allUses ?? []).forEach((u) => {
      const cur = usesByCoupon.get(u.coupon_id) ?? { total: 0, usedBySelf: false }
      cur.total += 1
      if (user && u.member_id === user.id) cur.usedBySelf = true
      usesByCoupon.set(u.coupon_id, cur)
    })
  }

  async function handleLike() { 'use server'; await likeFreefree(id) }
  async function handleComment(formData: FormData) {
    'use server'
    await commentFreefree(id, String(formData.get('body') ?? ''))
  }
  async function handleUseCoupon(formData: FormData) {
    'use server'
    await useCoupon(String(formData.get('coupon_id') ?? ''), id)
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 md:p-12">
      <article className="max-w-2xl mx-auto space-y-6">
        <nav className="text-xs text-slate-500"><Link href="/freefree" className="hover:underline">← FreeFree</Link></nav>

        <header className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${posterMeta.badgeClass}`}>{posterMeta.badge}</span>
            <span className="text-xs text-slate-500">{freefreeCategoryLabel(post.category)}</span>
            {post.import_source === 'openpoi' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300">📥 公開データ由来</span>
            )}
          </div>
          <h1 className="text-3xl font-serif font-bold">{post.title}</h1>
          {orgInfo && <p className="text-sm text-slate-600 dark:text-slate-400">by {orgInfo.name}</p>}
          {post.location && <p className="text-sm text-slate-500">📍 {post.location}</p>}
        </header>

        {post.images && post.images.length > 0 && (
          <div className={post.images.length === 1 ? '' : 'grid grid-cols-2 md:grid-cols-3 gap-2'}>
            {post.images.map((url: string, i: number) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block">
                <img src={url} alt={`画像 ${i + 1}`} className={post.images.length === 1 ? 'w-full max-h-96 object-cover rounded-lg border border-slate-200 dark:border-slate-700' : 'w-full aspect-square object-cover rounded-lg border border-slate-200 dark:border-slate-700'} />
              </a>
            ))}
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 border rounded-lg p-6">
          <p className="whitespace-pre-wrap">{post.body}</p>
        </div>

        {post.import_source === 'openpoi' && (
          <OpenpoiAttribution licenses={post.import_licenses} attributions={post.import_attributions} />
        )}

        {Array.isArray(post.links) && post.links.length > 0 && (
          <section className="bg-white dark:bg-slate-900 border rounded-lg p-6 space-y-2">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">🔗 関連リンク</h2>
            <ul className="space-y-1.5">
              {(post.links as { label: string; url: string }[]).map((l) => (
                <li key={l.url}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-sm text-sky-700 dark:text-sky-400 hover:underline break-all"
                  >
                    {l.label} ↗
                  </a>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-slate-400">リンク先は外部サイトです。内容についてCBIは責任を負いません。</p>
          </section>
        )}

        {coupons && coupons.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">🎟 利用できるクーポン</h2>
            {coupons.map((c) => {
              const uses = usesByCoupon.get(c.id) ?? { total: 0, usedBySelf: false }
              const full = c.usage_limit !== null && uses.total >= c.usage_limit
              const daysLeft = Math.max(0, Math.ceil((new Date(c.expires_at).getTime() - Date.now()) / 86400_000))
              return (
                <div key={c.id} className="bg-amber-50 dark:bg-amber-900/20 border-2 border-dashed border-amber-300 dark:border-amber-700 rounded-lg p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="text-base font-bold text-amber-900 dark:text-amber-200">{c.content}</div>
                    <div className="text-xs text-amber-700 dark:text-amber-400">
                      {c.usage_limit !== null ? `${uses.total} / ${c.usage_limit} 使用済` : `${uses.total} 使用済`}
                      <span className="mx-1">·</span>
                      あと{daysLeft}日
                    </div>
                  </div>
                  {c.conditions && <div className="text-xs text-amber-800 dark:text-amber-300">条件: {c.conditions}</div>}
                  <div className="flex items-center gap-2 pt-1">
                    {user ? (
                      uses.usedBySelf ? (
                        <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">✓ あなたは使用済みです</span>
                      ) : full ? (
                        <span className="text-xs text-slate-500">使用上限に達しました</span>
                      ) : (
                        <form action={handleUseCoupon}>
                          <input type="hidden" name="coupon_id" value={c.id} />
                          <Button type="submit" size="sm" variant="outline">このクーポンを使う</Button>
                        </form>
                      )
                    ) : (
                      <Link href={`/login?next=/freefree/${id}`} className="text-xs text-amber-700 dark:text-amber-400 underline">
                        ログインして使う
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </section>
        )}

        <section className="bg-white dark:bg-slate-900 border rounded-lg p-6 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm">応援 {likes.length} / コメント {comments.length}</span>
            {user && (
              <form action={handleLike}>
                <Button type="submit" size="sm">👍 応援する</Button>
              </form>
            )}
          </div>

          {user && (
            <form action={handleComment} className="space-y-2">
              <textarea name="body" rows={2} placeholder="応援メッセージを書く" className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
              <div className="flex justify-end">
                <Button type="submit" size="sm" variant="outline">コメント送信</Button>
              </div>
            </form>
          )}

          {comments.length > 0 && (
            <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              {comments.slice(0, 20).map((c) => {
                const mem = Array.isArray(c.members) ? c.members[0] : c.members
                return (
                  <div key={c.id} className="text-sm">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{mem?.display_name ?? '匿名'}</span>
                    <span className="text-xs text-slate-400 ml-2">{new Date(c.created_at).toLocaleDateString('ja-JP')}</span>
                    <p className="text-slate-600 dark:text-slate-400 mt-0.5">{c.body}</p>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </article>
    </div>
  )
}
