-- Target PostgreSQL schema. Apply only after infrastructure and backup policy are approved.
create extension if not exists pgcrypto;
create extension if not exists citext;

create type platform_role as enum ('user', 'platform_admin');
create type account_status as enum ('invited', 'active', 'suspended', 'deleted');
create type organization_role as enum ('owner', 'admin', 'billing_admin', 'clinician');
create type subscription_status as enum ('trialing', 'active', 'past_due', 'paused', 'canceled');

create table app_user (
  id uuid primary key default gen_random_uuid(),
  login citext not null unique check (login ~ '^[a-z0-9-]{4,64}$'),
  email citext unique,
  display_name text not null check (char_length(display_name) between 2 and 160),
  platform_role platform_role not null default 'user',
  status account_status not null default 'invited',
  two_factor_enabled boolean not null default false,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table organization (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 200),
  slug citext not null unique,
  billing_email citext,
  status account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table organization_membership (
  organization_id uuid not null references organization(id) on delete restrict,
  user_id uuid not null references app_user(id) on delete restrict,
  role organization_role not null,
  status account_status not null default 'active',
  joined_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table auth_session (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  ip_hash bytea,
  user_agent text,
  created_at timestamptz not null default now()
);
create index auth_session_user_active_idx on auth_session(user_id, expires_at) where revoked_at is null;

create table organization_invitation (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id) on delete cascade,
  login citext not null,
  role organization_role not null,
  token_hash bytea not null unique,
  invited_by uuid not null references app_user(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table subscription (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organization(id) on delete restrict,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan_code text not null,
  status subscription_status not null,
  currency char(3) not null,
  unit_amount integer not null check (unit_amount >= 0),
  seats integer not null default 1 check (seats > 0),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

create table payment_webhook_event (
  provider_event_id text primary key,
  event_type text not null,
  payload_sha256 bytea not null,
  processed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now()
);

create table security_audit_event (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  request_id uuid,
  actor_user_id uuid references app_user(id),
  organization_id uuid references organization(id),
  action text not null,
  target_type text,
  target_id text,
  outcome text not null check (outcome in ('success', 'failure')),
  metadata jsonb not null default '{}'::jsonb,
  constraint audit_metadata_is_object check (jsonb_typeof(metadata) = 'object')
);
create index security_audit_event_time_idx on security_audit_event(occurred_at desc);
create index security_audit_event_actor_idx on security_audit_event(actor_user_id, occurred_at desc);
create index security_audit_event_org_idx on security_audit_event(organization_id, occurred_at desc);

comment on table security_audit_event is 'Append-only security trail. Never store passwords, session tokens, payment card data, or clinical payloads in metadata.';
comment on table payment_webhook_event is 'Idempotency ledger. Raw Stripe webhook payloads are not persisted.';
