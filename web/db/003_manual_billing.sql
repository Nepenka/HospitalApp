-- Manual billing ledger used before a payment provider is connected.
-- Entries are append-only; incorrect entries are voided for auditability.

create type billing_entry_type as enum ('charge', 'payment');
create type billing_currency as enum ('USD', 'BYN', 'RUB');

create table billing_entry (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id) on delete restrict,
  entry_type billing_entry_type not null,
  currency billing_currency not null,
  amount_minor bigint not null check (amount_minor > 0),
  effective_date date not null,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  created_by uuid not null references app_user(id) on delete restrict,
  voided_at timestamptz,
  voided_by uuid references app_user(id) on delete restrict,
  constraint billing_void_pair check ((voided_at is null) = (voided_by is null))
);

create index billing_entry_org_date_idx on billing_entry(organization_id, effective_date desc);
create index billing_entry_active_due_idx on billing_entry(effective_date) where voided_at is null and entry_type = 'charge';

comment on column billing_entry.amount_minor is 'Amount in cents/kopecks: 100 equals one USD, BYN or RUB.';
