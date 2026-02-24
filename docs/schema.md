# Supabase Schema

This schema is designed for the workflow in `docs/plan.md`:

`ingested -> opportunity_review -> drafting_queue -> approval_review -> ready_to_publish`

It uses a canonical `content` table plus a `content_state` pointer for current state, and a `transactions` ledger for every transition/action.

Display labels:
- `ingested` = Ingested
- `opportunity_review` = Opportunity Review
- `drafting_queue` = Drafting Queue
- `approval_review` = Approval Review
- `ready_to_publish` = Ready to Publish

Plan-aligned behavior:
- Items can be trashed from `ingested`, `opportunity_review`, or `approval_review`.
- Triage Manager automation is toggleable through DB config.

## Minimal Insert Flow

1. Scraper inserts into `content`.
2. Scraper inserts matching row into `content_state` with `ingested`.
3. Scraper triage/classification writes a `transactions` row with `action = 'classified'`.
4. Filter agent/human calls `move_content_state(...)`.
5. Commenting agent inserts draft(s) into `generated_comments`.
6. Human marks one draft as `is_selected = true`, then move to `ready_to_publish`.
7. Extension records `posting_events` and final `posted` transaction.
8. If rejected at review checkpoints, call `trash_content(...)`.

## SQL Editor Paste

```sql
begin;

create extension if not exists "pgcrypto";

drop view if exists public.v_ingested cascade;
drop view if exists public.v_opportunity_review cascade;
drop view if exists public.v_drafting_queue cascade;
drop view if exists public.v_approval_review cascade;
drop view if exists public.v_ready_to_publish cascade;
drop view if exists public.v_trashed cascade;

drop table if exists public.posting_events cascade;
drop table if exists public.transactions cascade;
drop table if exists public.generated_comments cascade;
drop table if exists public.content_state cascade;
drop table if exists public.content cascade;
drop table if exists public.defined_lists cascade;

create table public.defined_lists (
  id uuid primary key default gen_random_uuid(),
  list_type text not null check (list_type in ('subreddit', 'keyword', 'account', 'channel')),
  source text not null check (source in ('reddit', 'x', 'youtube')),
  value text not null,
  is_active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, list_type, value)
);

create table public.content (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('reddit', 'x', 'youtube')),
  source_content_id text not null,
  source_url text not null,
  source_author text,
  source_created_at timestamptz,
  title text,
  body_text text,
  raw_payload jsonb not null default '{}'::jsonb,
  scraped_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_content_id)
);

create table public.content_state (
  content_id uuid primary key references public.content(id) on delete cascade,
  state text not null default 'ingested'
    check (state in ('ingested','opportunity_review','drafting_queue','approval_review','ready_to_publish')),
  is_trashed boolean not null default false,
  trashed_at timestamptz,
  trashed_reason text,
  trashed_by_user_id uuid references auth.users(id),
  assigned_to uuid references auth.users(id),
  priority smallint not null default 3 check (priority between 1 and 5),
  ai_confidence numeric(5,2),
  last_transition_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.generated_comments (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content(id) on delete cascade,
  draft_text text not null,
  model_name text not null,
  model_temperature numeric(3,2),
  prompt_version text,
  safety_flags jsonb not null default '{}'::jsonb,
  is_selected boolean not null default false,
  generated_by_actor text not null default 'agent'
    check (generated_by_actor in ('system', 'agent', 'user')),
  generated_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.transactions (
  id bigserial primary key,
  content_id uuid not null references public.content(id) on delete cascade,
  action text not null
    check (action in ('ingested','classified','state_moved','comment_generated','comment_regenerated','approved','rejected','posted','trashed')),
  from_state text
    check (from_state is null or from_state in ('ingested','opportunity_review','drafting_queue','approval_review','ready_to_publish')),
  to_state text
    check (to_state is null or to_state in ('ingested','opportunity_review','drafting_queue','approval_review','ready_to_publish')),
  actor text not null
    check (actor in ('system','agent','user')),
  actor_user_id uuid references auth.users(id),
  actor_label text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (
    (action = 'state_moved' and from_state is not null and to_state is not null)
    or (action <> 'state_moved')
  )
);

create table public.posting_events (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content(id) on delete cascade,
  generated_comment_id uuid references public.generated_comments(id) on delete set null,
  status text not null check (status in ('opened', 'autofilled', 'submitted', 'failed', 'deleted')),
  error_message text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create unique index generated_comments_one_selected_per_content_idx
  on public.generated_comments (content_id)
  where is_selected = true;

create index content_state_state_priority_idx
  on public.content_state (state, priority, last_transition_at asc);

create index transactions_content_created_idx
  on public.transactions (content_id, created_at desc);

create index transactions_action_created_idx
  on public.transactions (action, created_at desc);

create view public.v_ingested as
select c.*, cs.*
from public.content c
join public.content_state cs on cs.content_id = c.id
where cs.state = 'ingested' and cs.is_trashed = false;

create view public.v_opportunity_review as
select c.*, cs.*
from public.content c
join public.content_state cs on cs.content_id = c.id
where cs.state = 'opportunity_review' and cs.is_trashed = false;

create view public.v_drafting_queue as
select c.*, cs.*
from public.content c
join public.content_state cs on cs.content_id = c.id
where cs.state = 'drafting_queue' and cs.is_trashed = false;

create view public.v_approval_review as
select c.*, cs.*
from public.content c
join public.content_state cs on cs.content_id = c.id
where cs.state = 'approval_review' and cs.is_trashed = false;

create view public.v_ready_to_publish as
select c.*, cs.*
from public.content c
join public.content_state cs on cs.content_id = c.id
where cs.state = 'ready_to_publish' and cs.is_trashed = false;

create view public.v_trashed as
select c.*, cs.*
from public.content c
join public.content_state cs on cs.content_id = c.id
where cs.is_trashed = true;

-- alter table public.defined_lists disable row level security;
-- alter table public.content disable row level security;
-- alter table public.content_state disable row level security;
-- alter table public.generated_comments disable row level security;
-- alter table public.transactions disable row level security;
-- alter table public.posting_events disable row level security;

commit;
```

## SQL Delete All Data But Not Tables

Run this to remove all rows while keeping your tables, indexes, and constraints.

```sql
begin;

truncate table public.posting_events restart identity cascade;
truncate table public.transactions restart identity cascade;
truncate table public.generated_comments restart identity cascade;
truncate table public.content_state restart identity cascade;
truncate table public.content restart identity cascade;
truncate table public.defined_lists restart identity cascade;

commit;
```

## SQL Editor Seed Data (Fake Rows)

Run this after the SQL Editor Paste block if you want test data in every table.

```sql
begin;

with seeded_content as (
  insert into public.content (
    source,
    source_content_id,
    source_url,
    source_author,
    source_created_at,
    title,
    body_text,
    raw_payload
  )
  values
    (
      'reddit',
      't3_demo_001',
      'https://reddit.com/r/saas/comments/demo_001',
      'founder_alpha',
      now() - interval '2 hours',
      'Launching a new workflow tool for agencies',
      'We are validating demand and looking for early users.',
      '{"subreddit":"saas","score":112}'::jsonb
    ),
    (
      'x',
      'tweet_demo_001',
      'https://x.com/example/status/1000000000000000001',
      'builder_beta',
      now() - interval '90 minutes',
      'Need better approval workflows',
      'Current approval process is too slow for content teams.',
      '{"retweets":7,"likes":54}'::jsonb
    )
  returning id
),
seeded_state as (
  insert into public.content_state (
    content_id,
    state,
    is_trashed,
    priority,
    ai_confidence
  )
  select
    id,
    case
      when row_number() over (order by id) = 1 then 'opportunity_review'
      else 'drafting_queue'
    end,
    false,
    case
      when row_number() over (order by id) = 1 then 2
      else 3
    end,
    case
      when row_number() over (order by id) = 1 then 91.25
      else 84.10
    end
  from seeded_content
  returning content_id, state
),
seeded_comments as (
  insert into public.generated_comments (
    content_id,
    draft_text,
    model_name,
    model_temperature,
    prompt_version,
    safety_flags,
    is_selected,
    generated_by_actor
  )
  select
    id,
    case
      when row_number() over (order by id) = 1
        then 'This launch is interesting. What user segment has the strongest pull so far?'
      else 'Approval friction is common. Where does your team lose the most time today?'
    end,
    'gpt-5-mini',
    0.40,
    'v1.0',
    '{"toxicity":false,"pii":false}'::jsonb,
    true,
    'agent'
  from seeded_content
  returning id, content_id
),
seeded_transactions as (
  insert into public.transactions (
    content_id,
    action,
    from_state,
    to_state,
    actor,
    actor_label,
    details
  )
  select
    ss.content_id,
    'classified',
    null,
    null,
    'system',
    'scraper-triage',
    jsonb_build_object('triage_bucket', ss.state, 'note', 'fake seeded triage')
  from seeded_state ss

  union all

  select
    ss.content_id,
    'state_moved',
    'ingested',
    ss.state,
    'system',
    'seed-script',
    jsonb_build_object('note', 'fake seeded transition')
  from seeded_state ss
)
insert into public.posting_events (
  content_id,
  generated_comment_id,
  status,
  error_message
)
select
  sc.content_id,
  sc.id,
  case
    when row_number() over (order by sc.content_id) = 1 then 'autofilled'
    else 'deleted'
  end,
  null
from seeded_comments sc;

insert into public.defined_lists (list_type, source, value, is_active, notes)
values
  ('subreddit', 'reddit', 'saas', true, 'seed list'),
  ('keyword', 'x', 'approval workflow', true, 'seed keyword'),
  ('channel', 'youtube', 'UC123456789demo', false, 'seed channel');

commit;
```
