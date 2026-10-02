-- =============================================================
-- FreeFree掲示板：OpenPOI API からの施設一括登録（インポート候補）
--
-- 流れ:
--   OpenPOI 取得 → 整形 → 重複判定 → freefree_import_candidates（候補）
--   → 運営が確認・修正 → FreeFree投稿として公開
--
-- 方針:
--   ・取得した施設は無条件で公開しない。必ず「候補」に保存する
--   ・既存の freefree_posts には触れない（列の追加のみ。既存行は変更されない）
--   ・候補・履歴テーブルは運営（committee / super）だけが読み書きできる（RLS）
--   ・OpenPOI の licenses / attributions と元レスポンス(raw_data)を保存する
--   ・OpenPOI には固有IDが無いので source_id は 名称+座標 から作る（アプリ側で生成）
-- =============================================================

-- ---------- インポート候補 ----------
create table if not exists public.freefree_import_candidates (
  id                  uuid primary key default gen_random_uuid(),
  source              text not null default 'openpoi',
  source_id           text not null,                       -- 名称+座標のハッシュ（OpenPOI固有IDは無い）
  region_key          text,                                -- 取得時の地域（例: chiba-inzai）

  -- OpenPOI 由来（再取得で本体は書き換えない）
  name                text not null,
  name_kana           text,
  prefecture          text,
  city                text,
  address             text,
  latitude            double precision,
  longitude           double precision,
  geocode_level       integer,
  openpoi_category    text,
  business_type       text,
  openpoi_source      text,                                -- jff / overture など代表ソース
  phone               text,                                -- OpenPOI は電話を返さない。運営が補う欄
  website             text,                                -- 同上
  opening_hours       text,                                -- 同上
  description         text,
  licenses            text[] not null default '{}',
  attributions        text[] not null default '{}',
  raw_data            jsonb  not null default '{}'::jsonb,
  content_hash        text,                                -- 差分検知用

  -- FreeFreeへの変換
  category            text,                                -- FreeFreeカテゴリキー。NULL = 未分類
  category_reason     text,

  -- 状態
  import_status       text not null default 'candidate'
                      check (import_status in ('candidate','publishing','imported','excluded','failed')),
  duplicate_status    text not null default 'none'
                      check (duplicate_status in ('none','possible','duplicate')),
  duplicate_reason    text,
  duplicate_of_post_id      uuid references public.freefree_posts(id) on delete set null,
  duplicate_of_candidate_id uuid references public.freefree_import_candidates(id) on delete set null,
  freefree_post_id    uuid references public.freefree_posts(id) on delete set null,
  import_error        text,

  -- 運営の編集（OpenPOI再取得で上書きしない）
  edits               jsonb  not null default '{}'::jsonb,
  edited              boolean not null default false,

  -- OpenPOI側の更新検知（FreeFree投稿は勝手に変えない）
  update_available    boolean not null default false,
  update_diff         jsonb,
  update_detected_at  timestamptz,

  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (source, source_id)
);

create index if not exists idx_ffic_status    on public.freefree_import_candidates (import_status);
create index if not exists idx_ffic_dup       on public.freefree_import_candidates (duplicate_status);
create index if not exists idx_ffic_category  on public.freefree_import_candidates (category);
create index if not exists idx_ffic_region    on public.freefree_import_candidates (region_key);
-- 二重登録の最終防止: 1つの FreeFree 投稿は1つの候補にしか結び付かない
create unique index if not exists idx_ffic_unique_post
  on public.freefree_import_candidates (freefree_post_id) where freefree_post_id is not null;

drop trigger if exists trg_ffic_updated on public.freefree_import_candidates;
create trigger trg_ffic_updated before update on public.freefree_import_candidates
  for each row execute function public.set_updated_at();

-- ---------- インポート履歴 ----------
create table if not exists public.freefree_import_runs (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.members(id) on delete set null,
  kind         text not null check (kind in ('fetch','publish')),
  region_key   text,
  params       jsonb not null default '{}'::jsonb,
  status       text not null default 'running' check (status in ('running','success','partial','failed')),
  counts       jsonb not null default '{}'::jsonb,
  error        text,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create index if not exists idx_ffir_started on public.freefree_import_runs (started_at desc);

-- ---------- RLS: 運営のみ ----------
alter table public.freefree_import_candidates enable row level security;
alter table public.freefree_import_runs       enable row level security;

drop policy if exists ffic_admin_all on public.freefree_import_candidates;
create policy ffic_admin_all on public.freefree_import_candidates
  for all using (public.is_committee_or_super()) with check (public.is_committee_or_super());

drop policy if exists ffir_admin_all on public.freefree_import_runs;
create policy ffir_admin_all on public.freefree_import_runs
  for all using (public.is_committee_or_super()) with check (public.is_committee_or_super());

-- ---------- freefree_posts: 出典表示用の列（追加のみ・既存行は NULL のまま） ----------
alter table public.freefree_posts
  add column if not exists import_source       text,
  add column if not exists import_licenses     text[],
  add column if not exists import_attributions text[];

comment on column public.freefree_posts.import_source is
  '公開データから運営が取り込んだ掲載のとき "openpoi"。通常の掲載は NULL。';
comment on column public.freefree_posts.import_licenses is
  '取込元データのライセンス（OpenPOI の licenses）。';
comment on column public.freefree_posts.import_attributions is
  '取込元データの帰属表示（OpenPOI の attributions）。';
