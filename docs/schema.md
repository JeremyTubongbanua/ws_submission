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

## 1) Extensions

```sql
create extension if not exists "pgcrypto";
```

## 2) Enums

```sql
create type public.content_source as enum ('reddit', 'x', 'youtube');

create type public.pipeline_state as enum (
  'ingested',
  'opportunity_review',
  'drafting_queue',
  'approval_review',
  'ready_to_publish'
);

create type public.actor_type as enum ('system', 'agent', 'user');

create type public.action_type as enum (
  'ingested',
  'classified',
  'state_moved',
  'comment_generated',
  'comment_regenerated',
  'approved',
  'rejected',
  'posted',
  'trashed'
);
```

## 3) Core Tables

### `defined_lists`

Stores subreddit targets, keyword targets, and source-specific selectors.

```sql
create table public.defined_lists (
  id uuid primary key default gen_random_uuid(),
  list_type text not null check (list_type in ('subreddit', 'keyword', 'account', 'channel')),
  source public.content_source not null,
  value text not null,
  is_active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, list_type, value)
);
```

### `agent_settings`

Feature flags for subagents (including Triage Manager on/off).

```sql
create table public.agent_settings (
  id smallint primary key default 1 check (id = 1),
  triage_manager_enabled boolean not null default false,
  filter_agent_enabled boolean not null default true,
  commenting_agent_enabled boolean not null default true,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### `content`

Canonical row for each scraped item.

```sql
create table public.content (
  id uuid primary key default gen_random_uuid(),
  source public.content_source not null,
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
```

### `content_state`

Single current state per content item.

```sql
create table public.content_state (
  content_id uuid primary key references public.content(id) on delete cascade,
  state public.pipeline_state not null default 'ingested',
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
```

### `generated_comments`

Stores model outputs and revision history.

```sql
create table public.generated_comments (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content(id) on delete cascade,
  draft_text text not null,
  model_name text not null,
  model_temperature numeric(3,2),
  prompt_version text,
  safety_flags jsonb not null default '{}'::jsonb,
  is_selected boolean not null default false,
  generated_by_actor public.actor_type not null default 'agent',
  generated_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create unique index generated_comments_one_selected_per_content_idx
  on public.generated_comments (content_id)
  where is_selected = true;
```

### `transactions`

Audit log for every action and state transition.

```sql
create table public.transactions (
  id bigserial primary key,
  content_id uuid not null references public.content(id) on delete cascade,
  action public.action_type not null,
  from_state public.pipeline_state,
  to_state public.pipeline_state,
  actor public.actor_type not null,
  actor_user_id uuid references auth.users(id),
  actor_label text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (
    (action = 'state_moved' and from_state is not null and to_state is not null)
    or (action <> 'state_moved')
  )
);
```

### `posting_events`

Track extension-side post attempts and outcomes.

```sql
create table public.posting_events (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content(id) on delete cascade,
  generated_comment_id uuid references public.generated_comments(id) on delete set null,
  status text not null check (status in ('opened', 'autofilled', 'submitted', 'failed')),
  error_message text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
```

## 4) Indexes

```sql
create index content_source_created_idx
  on public.content (source, source_created_at desc);

create index content_state_state_priority_idx
  on public.content_state (state, priority, last_transition_at asc);

create index transactions_content_created_idx
  on public.transactions (content_id, created_at desc);

create index transactions_action_created_idx
  on public.transactions (action, created_at desc);
```

## 5) Updated-At Trigger

```sql
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_defined_lists_updated_at
before update on public.defined_lists
for each row execute function public.set_updated_at();

create trigger set_agent_settings_updated_at
before update on public.agent_settings
for each row execute function public.set_updated_at();

create trigger set_content_updated_at
before update on public.content
for each row execute function public.set_updated_at();

create trigger set_content_state_updated_at
before update on public.content_state
for each row execute function public.set_updated_at();
```

## 6) Transition Function (recommended)

Use one DB function so all moves are validated and logged in `transactions`.

```sql
create or replace function public.move_content_state(
  p_content_id uuid,
  p_to_state public.pipeline_state,
  p_actor public.actor_type,
  p_actor_user_id uuid default null,
  p_actor_label text default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
as $$
declare
  v_from_state public.pipeline_state;
begin
  select state into v_from_state
  from public.content_state
  where content_id = p_content_id
  for update;

  if not found then
    raise exception 'content_state row missing for content_id %', p_content_id;
  end if;

  if v_from_state = p_to_state then
    return;
  end if;

  -- Guardrail: ready_to_publish should only come from approval_review
  if p_to_state = 'ready_to_publish' and v_from_state <> 'approval_review' then
    raise exception 'invalid transition % -> %', v_from_state, p_to_state;
  end if;

  update public.content_state
  set state = p_to_state,
      last_transition_at = now()
  where content_id = p_content_id;

  insert into public.transactions (
    content_id, action, from_state, to_state, actor, actor_user_id, actor_label, details
  ) values (
    p_content_id, 'state_moved', v_from_state, p_to_state, p_actor, p_actor_user_id, p_actor_label, p_details
  );
end;
$$;
```

### `trash_content` helper (recommended)

Trash a record without adding a sixth pipeline state; keeps your five state names intact.

```sql
create or replace function public.trash_content(
  p_content_id uuid,
  p_actor public.actor_type,
  p_actor_user_id uuid default null,
  p_actor_label text default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_from_state public.pipeline_state;
begin
  select state into v_from_state
  from public.content_state
  where content_id = p_content_id
  for update;

  if not found then
    raise exception 'content_state row missing for content_id %', p_content_id;
  end if;

  update public.content_state
  set is_trashed = true,
      trashed_at = now(),
      trashed_reason = p_reason,
      trashed_by_user_id = p_actor_user_id,
      last_transition_at = now()
  where content_id = p_content_id;

  insert into public.transactions (
    content_id, action, from_state, to_state, actor, actor_user_id, actor_label, details
  ) values (
    p_content_id, 'trashed', v_from_state, null, p_actor, p_actor_user_id, p_actor_label,
    jsonb_build_object('reason', p_reason)
  );
end;
$$;
```

## 7) Security (MVP)

For MVP speed, keep RLS off until auth boundaries are finalized.

```sql
alter table public.defined_lists disable row level security;
alter table public.agent_settings disable row level security;
alter table public.content disable row level security;
alter table public.content_state disable row level security;
alter table public.generated_comments disable row level security;
alter table public.transactions disable row level security;
alter table public.posting_events disable row level security;
```

## 8) Stage Silos (Plan Alignment)

To match the plan's stage silos while keeping normalized storage, this schema uses stage-specific views:

```sql
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
```

## 9) Minimal Insert Flow

1. Scraper inserts into `content`.
2. Scraper inserts matching row into `content_state` with `ingested`.
3. Filter agent/human calls `move_content_state(...)`.
4. Commenting agent inserts draft(s) into `generated_comments`.
5. Human marks one draft as `is_selected = true`, then move to `ready_to_publish`.
6. Extension records `posting_events` and final `posted` transaction.
7. If rejected at review checkpoints, call `trash_content(...)`.

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
  status text not null check (status in ('opened', 'autofilled', 'submitted', 'failed')),
  error_message text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- alter table public.defined_lists disable row level security;
-- alter table public.content disable row level security;
-- alter table public.content_state disable row level security;
-- alter table public.generated_comments disable row level security;
-- alter table public.transactions disable row level security;
-- alter table public.posting_events disable row level security;

commit;```
