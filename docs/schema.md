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
      now() - interval '8 hours',
      'Launching a new workflow tool for agencies',
      'We are validating demand and looking for early users.',
      '{"subreddit":"saas","score":112}'::jsonb
    ),
    (
      'x',
      'tweet_demo_002',
      'https://x.com/example/status/1000000000000000002',
      'builder_beta',
      now() - interval '7 hours',
      'Need better approval workflows',
      'Current approval process is too slow for content teams.',
      '{"retweets":7,"likes":54}'::jsonb
    ),
    (
      'youtube',
      'yt_demo_003',
      'https://youtube.com/watch?v=demo003',
      'pm_gamma',
      now() - interval '6 hours',
      'Commenting on B2B onboarding benchmarks',
      'Curious how teams structure first-week activation.',
      '{"channel":"UC123456789demo","likes":18}'::jsonb
    ),
    (
      'reddit',
      't3_demo_004',
      'https://reddit.com/r/startups/comments/demo_004',
      'ops_delta',
      now() - interval '5 hours',
      'How are teams handling churn analysis?',
      'Looking for practical methods for early-stage churn diagnostics.',
      '{"subreddit":"startups","score":49}'::jsonb
    ),
    (
      'x',
      'tweet_demo_005',
      'https://x.com/example/status/1000000000000000005',
      'growth_epsilon',
      now() - interval '4 hours',
      'Struggling with outbound personalization',
      'Need a repeatable strategy for segmented outreach.',
      '{"retweets":11,"likes":73}'::jsonb
    ),
    (
      'reddit',
      't3_demo_006',
      'https://reddit.com/r/marketing/comments/demo_006',
      'cmo_zeta',
      now() - interval '3 hours',
      'Attribution debate in multi-touch funnels',
      'Team split between first-touch and weighted attribution.',
      '{"subreddit":"marketing","score":87}'::jsonb
    ),
    (
      'youtube',
      'yt_demo_007',
      'https://youtube.com/watch?v=demo007',
      'founder_eta',
      now() - interval '2 hours',
      'Launch review: community-led growth',
      'Posting our launch retrospective and what worked.',
      '{"channel":"UC123456789demo","likes":124}'::jsonb
    ),
    (
      'x',
      'tweet_demo_008',
      'https://x.com/example/status/1000000000000000008',
      'revops_theta',
      now() - interval '70 minutes',
      'Need templates for customer handoff',
      'Sales to CS handoff is inconsistent and error-prone.',
      '{"retweets":4,"likes":29}'::jsonb
    ),
    (
      'reddit',
      't3_demo_009',
      'https://reddit.com/r/entrepreneur/comments/demo_009',
      'solo_iota',
      now() - interval '50 minutes',
      'Solo founder asks for pricing feedback',
      'Unsure whether to launch usage-based or tiered plans.',
      '{"subreddit":"entrepreneur","score":22}'::jsonb
    )
  returning id, source_content_id, source
),
seeded_state as (
  insert into public.content_state (
    content_id,
    state,
    is_trashed,
    trashed_at,
    trashed_reason,
    priority,
    ai_confidence
  )
  select
    id,
    case
      when source_content_id = 't3_demo_001' then 'ingested'
      when source_content_id in ('tweet_demo_002', 'yt_demo_003') then 'opportunity_review'
      when source_content_id in ('t3_demo_004', 'tweet_demo_005') then 'drafting_queue'
      when source_content_id = 't3_demo_006' then 'approval_review'
      when source_content_id in ('yt_demo_007', 'tweet_demo_008') then 'ready_to_publish'
      else 'ingested'
    end,
    case when source_content_id = 't3_demo_009' then true else false end,
    case when source_content_id = 't3_demo_009' then now() - interval '20 minutes' else null end,
    case when source_content_id = 't3_demo_009' then 'low_relevance_seed_example' else null end,
    case
      when source_content_id in ('yt_demo_007', 'tweet_demo_008') then 1
      when source_content_id = 't3_demo_006' then 2
      when source_content_id in ('t3_demo_004', 'tweet_demo_005') then 3
      else 4
    end,
    case
      when source_content_id = 'yt_demo_007' then 95.40
      when source_content_id = 'tweet_demo_008' then 92.10
      when source_content_id = 't3_demo_006' then 89.75
      when source_content_id in ('t3_demo_004', 'tweet_demo_005') then 84.20
      when source_content_id in ('tweet_demo_002', 'yt_demo_003') then 77.80
      else 62.50
    end
  from seeded_content
  returning content_id, state, is_trashed
),
seeded_comments_selected as (
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
    sc.id,
    case
      when sc.source_content_id = 't3_demo_004'
        then 'Your churn-analysis question is timely. Which segment shows the steepest drop first?'
      when sc.source_content_id = 'tweet_demo_005'
        then 'For outreach, what variable are you personalizing first: role, trigger, or problem?'
      when sc.source_content_id = 't3_demo_006'
        then 'Attribution arguments usually hide goal mismatch. What decision is this model meant to drive?'
      when sc.source_content_id = 'yt_demo_007'
        then 'Great launch recap. Which channel produced the highest-intent replies post-launch?'
      else 'Clean handoff templates start with ownership clarity. Which field is most often missing?'
    end,
    'gpt-5-mini',
    0.40,
    'v1.1',
    '{"toxicity":false,"pii":false}'::jsonb,
    true,
    'agent'
  from seeded_content sc
  where sc.source_content_id in ('t3_demo_004', 'tweet_demo_005', 't3_demo_006', 'yt_demo_007', 'tweet_demo_008')
  returning id, content_id
),
seeded_comments_alternates as (
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
    sc.id,
    case
      when sc.source_content_id = 't3_demo_004'
        then 'Interesting topic. What data source do you trust most for churn signals right now?'
      else 'Handoff quality is usually process + tooling. Which one breaks first for your team?'
    end,
    'gpt-5-mini',
    0.65,
    'v1.1-alt',
    '{"toxicity":false,"pii":false}'::jsonb,
    false,
    'agent'
  from seeded_content sc
  where sc.source_content_id in ('t3_demo_004', 'tweet_demo_008')
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
    sc.id,
    'ingested',
    null,
    null,
    'system',
    'scraper-daemon',
    jsonb_build_object('source', sc.source, 'seed', true)
  from seeded_content sc

  union all

  select
    ss.content_id,
    'classified',
    null,
    null,
    'agent',
    'scraper-subagent',
    jsonb_build_object('triage_bucket', ss.state, 'seed', true)
  from seeded_state ss
  where ss.state in ('opportunity_review', 'drafting_queue', 'approval_review', 'ready_to_publish')
    and ss.is_trashed = false

  union all

  select
    ss.content_id,
    'state_moved',
    'ingested',
    ss.state,
    'system',
    'pipeline-automation',
    jsonb_build_object('note', 'fake seeded transition', 'seed', true)
  from seeded_state ss
  where ss.state <> 'ingested'
    and ss.is_trashed = false

  union all

  select
    scs.content_id,
    'comment_generated',
    null,
    null,
    'agent',
    'comment-subagent',
    jsonb_build_object('model', 'gpt-5-mini', 'seed', true)
  from seeded_comments_selected scs

  union all

  select
    ss.content_id,
    'trashed',
    'ingested',
    null,
    'agent',
    'scraper-subagent',
    jsonb_build_object('reason', 'low_relevance_seed_example', 'seed', true)
  from seeded_state ss
  where ss.is_trashed = true

  union all

  select
    scs.content_id,
    'posted',
    null,
    null,
    'user',
    'chrome-extension',
    jsonb_build_object('status', 'submitted', 'seed', true)
  from seeded_comments_selected scs
  join seeded_content sc on sc.id = scs.content_id
  where sc.source_content_id = 'yt_demo_007'

  returning 1
),
seeded_posting_events as (
  insert into public.posting_events (
    content_id,
    generated_comment_id,
    status,
    error_message
  )
  select
    scs.content_id,
    scs.id,
    case
      when sc.source_content_id = 'yt_demo_007' then 'submitted'
      when sc.source_content_id = 'tweet_demo_008' then 'deleted'
      else 'autofilled'
    end,
    case
      when sc.source_content_id = 'tweet_demo_008' then 'user_deleted_before_submit'
      else null
    end
  from seeded_comments_selected scs
  join seeded_content sc on sc.id = scs.content_id
  where sc.source_content_id in ('yt_demo_007', 'tweet_demo_008')
  returning id
),
seeded_posting_events_opened as (
  insert into public.posting_events (
    content_id,
    generated_comment_id,
    status,
    error_message
  )
  select
    scs.content_id,
    scs.id,
    'opened',
    null
  from seeded_comments_selected scs
  join seeded_content sc on sc.id = scs.content_id
  where sc.source_content_id = 't3_demo_006'
  returning id
),
seeded_defined_lists as (
  insert into public.defined_lists (list_type, source, value, is_active, notes)
  values
    ('subreddit', 'reddit', 'saas', true, 'seed list'),
    ('keyword', 'x', 'approval workflow', true, 'seed keyword'),
    ('subreddit', 'reddit', 'startups', true, 'seed list'),
    ('keyword', 'reddit', 'churn', true, 'seed keyword'),
    ('account', 'x', '@workflowstudio', true, 'seed account'),
    ('channel', 'youtube', 'UC123456789demo', true, 'seed channel'),
    ('channel', 'youtube', 'UC987654321demo', false, 'inactive seed channel')
  returning 1
)
select
  (select count(*) from seeded_transactions) as tx_count,
  (select count(*) from seeded_comments_alternates) as alt_comment_count,
  (select count(*) from seeded_posting_events) as posting_event_count,
  (select count(*) from seeded_posting_events_opened) as opened_event_count,
  (select count(*) from seeded_defined_lists) as defined_list_count;

commit;
```
