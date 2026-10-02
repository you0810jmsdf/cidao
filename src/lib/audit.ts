// 書き込み操作の記録（誰が・いつ・どこから）。
//
// 目的は悪質な投稿への対応。被害届や捜査関係事項照会に応じる必要が出たときに、
// 投稿者を辿る手掛かりを残しておく。閲覧だけの利用者は記録しない。
//
// ・生のIPアドレスと User-Agent を保存する（保存期間90日、pg_cron が自動削除）
// ・audit_logs は INSERT ポリシーを持たないため service_role で書く
// ・記録の失敗で本来の操作（投稿など）を失敗させない。best-effort に徹する
//
// ⚠ 利用規約の改定（第6条の利用目的にIP取得を追加）と TERMS_VERSION の更新が前提。

import { headers } from 'next/headers'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// 投票（castVote）は意図的に含めない。
// このシステムは投票の秘密を守る設計で、votes は本人にも見えず、通知にも投票者を
// 残していない。audit_logs は運営が閲覧できるため、投票を記録すると
// 「誰がどの提案に投票したか」が運営に見えてしまい、設計方針に反する。
export type AuditAction =
  | 'freefree.create'
  | 'freefree.comment'
  | 'freefree.like'
  | 'freefree.import'
  | 'event.create'
  | 'proposal.create'
  | 'message.send'
  | 'org.create'
  | 'org.delete'

function adminClient() {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!supaUrl || !serviceKey) return null
  return createSupabaseClient(supaUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Vercel は x-forwarded-for に「クライアントIP, プロキシ1, プロキシ2…」と積む。
// 先頭がクライアント。x-real-ip があればそちらを優先する。
function clientIp(h: Headers): string | null {
  const real = h.get('x-real-ip')?.trim()
  if (real) return real
  const fwd = h.get('x-forwarded-for')
  if (!fwd) return null
  const first = fwd.split(',')[0]?.trim()
  return first || null
}

/**
 * 書き込み操作を1件記録する。
 *
 * 呼び出し側は await して構わないが、失敗しても例外は投げない。
 * 投稿そのものは成立させ、記録だけ落ちる（記録のために投稿を失わせない）。
 */
export async function recordWrite(input: {
  actorId: string
  action: AuditAction
  targetType?: string
  targetId?: string | null
  detail?: Record<string, unknown>
  isAdmin?: boolean
}): Promise<void> {
  try {
    const admin = adminClient()
    if (!admin) {
      console.warn('[audit] service role not configured; skipped', input.action)
      return
    }

    const h = await headers()
    const ip = clientIp(h)
    // inet 型なので形が怪しい値は入れない（挿入エラーで記録ごと落ちるのを避ける）
    const safeIp = ip && /^[0-9a-fA-F:.]+$/.test(ip) ? ip : null

    const { error } = await admin.from('audit_logs').insert({
      actor_type: input.isAdmin ? 'admin' : 'member',
      actor_id: input.actorId,
      action: input.action,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      detail: input.detail ?? null,
      ip: safeIp,
      user_agent: h.get('user-agent')?.slice(0, 500) ?? null,
    })
    if (error) console.warn('[audit] insert failed:', error.message)
  } catch (e) {
    console.warn('[audit] skipped:', e instanceof Error ? e.message : String(e))
  }
}
