import { OPENPOI_ATTRIBUTION_URL } from '@/lib/freefree-import-core'

// OpenPOI 由来の掲載に付ける出典表示（FreeFree詳細・管理画面プレビュー共通）。
// OpenPOI の利用条件（https://docs.openpoiapi.com/ 「出典・ライセンス」）:
//   ・画面に出すときは「OpenPOI API」を出典として記載し、出典・ライセンスページへリンクする
//   ・加工して公開する場合は、加工したことと加工した主体を記載する
//   ・licenses / attributions は保存しておき、示せる状態にする（画面表示は必須ではないが併記する）
export default function OpenpoiAttribution({ licenses, attributions }: { licenses?: string[] | null; attributions?: string[] | null }) {
  const lic = (licenses ?? []).filter(Boolean)
  const att = (attributions ?? []).filter(Boolean)
  return (
    <section className="bg-white dark:bg-slate-900 border rounded-lg p-4 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
      <p>
        施設情報提供：
        <a href={OPENPOI_ATTRIBUTION_URL} target="_blank" rel="noopener noreferrer" className="text-sky-700 dark:text-sky-400 hover:underline">OpenPOI API</a>
        <span className="mx-1">·</span>
        公開データを OpenPOI API が加工し、CBI が名称・住所等を整えて掲載しています。
      </p>
      {(lic.length > 0 || att.length > 0) && (
        <details>
          <summary className="cursor-pointer select-none">データ提供元・ライセンスの詳細</summary>
          <ul className="mt-1 list-disc pl-5 space-y-0.5">
            {att.map((a) => <li key={a}>{a}</li>)}
            {lic.length > 0 && <li>ライセンス：{lic.join(' / ')}</li>}
          </ul>
        </details>
      )}
    </section>
  )
}
