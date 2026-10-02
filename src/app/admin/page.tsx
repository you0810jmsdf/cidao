import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function AdminHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: isAdmin, error } = await supabase.rpc('is_admin')
  if (error || !isAdmin) redirect('/')

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-6">
        <nav className="text-xs text-slate-500"><Link href="/" className="hover:underline">← ホーム</Link></nav>
        <header>
          <p className="text-xs tracking-[0.3em] text-slate-500 uppercase">Admin</p>
          <h1 className="text-3xl font-serif font-bold">管理画面</h1>
        </header>

        <ul className="grid gap-3 sm:grid-cols-2">
          <li>
            <Link
              href="/admin/analytics"
              className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 hover:border-slate-400 dark:hover:border-slate-600 transition"
            >
              <h2 className="text-lg font-semibold mb-1">アクセス分析</h2>
              <p className="text-sm text-slate-500">各ページのPV/VVを横断表示、前週比の増減とAIによる要因分析</p>
            </Link>
          </li>
          <li>
            <Link
              href="/admin/notice"
              className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 hover:border-slate-400 dark:hover:border-slate-600 transition"
            >
              <h2 className="text-lg font-semibold mb-1">お知らせ配信</h2>
              <p className="text-sm text-slate-500">登録メンバー全員のベル🔔・Webプッシュへ一斉配信、配信履歴の確認</p>
            </Link>
          </li>
          <li>
            <Link
              href="/admin/changelog"
              className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 hover:border-slate-400 dark:hover:border-slate-600 transition"
            >
              <h2 className="text-lg font-semibold mb-1">更新履歴</h2>
              <p className="text-sm text-slate-500">GitHub のコミットから自動取得した変更ログ</p>
            </Link>
          </li>
          <li>
            <Link
              href="/admin/audit"
              className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 hover:border-slate-400 dark:hover:border-slate-600 transition"
            >
              <h2 className="text-lg font-semibold mb-1">書き込み記録（IPアドレス）</h2>
              <p className="text-sm text-slate-500">悪質な投稿の発信者を辿るための記録。90日で自動削除</p>
            </Link>
          </li>
          <li>
            <Link
              href="/admin/freefree"
              className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 hover:border-slate-400 dark:hover:border-slate-600 transition"
            >
              <h2 className="text-lg font-semibold mb-1">FreeFree掲示板の管理</h2>
              <p className="text-sm text-slate-500">サンプル投稿の片付け、迷惑投稿の非公開化・削除</p>
            </Link>
          </li>
          <li>
            <Link
              href="/admin/claims"
              className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 hover:border-slate-400 dark:hover:border-slate-600 transition"
            >
              <h2 className="text-lg font-semibold mb-1">所属申告・新規団体キュー</h2>
              <p className="text-sm text-slate-500">所属申告の承認/却下、新規登録された団体の公開承認</p>
            </Link>
          </li>
          <li>
            <Link
              href="/admin/org-candidates"
              className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 hover:border-slate-400 dark:hover:border-slate-600 transition"
            >
              <h2 className="text-lg font-semibold mb-1">団体候補</h2>
              <p className="text-sm text-slate-500">イベント主催者名のうち未登録のものを、団体として仮登録 / 除外</p>
            </Link>
          </li>
          <li>
            <Link
              href="/admin/sns"
              className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 hover:border-slate-400 dark:hover:border-slate-600 transition"
            >
              <h2 className="text-lg font-semibold mb-1">SNS 定期紹介</h2>
              <p className="text-sm text-slate-500">FreeFree・イベント・団体の X/FB/LINE 紹介ローテーション、投稿ログ、手動実行</p>
            </Link>
          </li>
          <li>
            <Link
              href="/admin/freefree/openpoi"
              className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 hover:border-slate-400 dark:hover:border-slate-600 transition"
            >
              <h2 className="text-lg font-semibold mb-1">OpenPOIインポート</h2>
              <p className="text-sm text-slate-500">地域の店舗・施設をOpenPOIから取得し、重複確認のうえFreeFreeへ一括登録</p>
            </Link>
          </li>
          <li>
            <Link
              href="/admin/disaster-sources"
              className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 hover:border-slate-400 dark:hover:border-slate-600 transition"
            >
              <h2 className="text-lg font-semibold mb-1">災害タイムライン</h2>
              <p className="text-sm text-slate-500">市公式発表・気象庁・市長SNSの取得元管理、テスト取得、手動登録</p>
            </Link>
          </li>
          <li>
            <Link
              href="/admin/members"
              className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 hover:border-slate-400 dark:hover:border-slate-600 transition"
            >
              <h2 className="text-lg font-semibold mb-1">メンバー一覧（本登録済み）</h2>
              <p className="text-sm text-slate-500">メール確認済み・住所確認済み会員の一覧</p>
            </Link>
          </li>
          <li>
            <Link
              href="/admin/members/light"
              className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 hover:border-slate-400 dark:hover:border-slate-600 transition"
            >
              <h2 className="text-lg font-semibold mb-1">メンバー一覧（ライト）</h2>
              <p className="text-sm text-slate-500">LINEログインのみで自動作成された会員の一覧</p>
            </Link>
          </li>
          <li>
            <Link
              href="/admin/events/import"
              className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 hover:border-slate-400 dark:hover:border-slate-600 transition"
            >
              <h2 className="text-lg font-semibold mb-1">チラシ一括取り込み</h2>
              <p className="text-sm text-slate-500">集めたチラシ画像をまとめてAI読み取り、確認してからイベント登録</p>
            </Link>
          </li>
          <li>
            <Link
              href="/admin/approvals"
              className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 hover:border-slate-400 dark:hover:border-slate-600 transition"
            >
              <h2 className="text-lg font-semibold mb-1">電子決裁</h2>
              <p className="text-sm text-slate-500">CBI役員の起案・電子印・決裁記録（役員のみ利用可）</p>
            </Link>
          </li>
          <li>
            <Link
              href="/admin/timetrial"
              className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 hover:border-slate-400 dark:hover:border-slate-600 transition"
            >
              <h2 className="text-lg font-semibold mb-1">タイムトライアル記録</h2>
              <p className="text-sm text-slate-500">メタバース印西の公式ランキング・要確認記録の管理と手動リセット</p>
            </Link>
          </li>
          <li>
            <Link
              href="/admin/events"
              className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 hover:border-slate-400 dark:hover:border-slate-600 transition"
            >
              <h2 className="text-lg font-semibold mb-1">イベント参加者一覧</h2>
              <p className="text-sm text-slate-500">イベントごとの参加者・出欠状況を横断的に確認</p>
            </Link>
          </li>
        </ul>
      </div>
    </div>
  )
}
