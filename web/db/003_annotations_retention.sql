-- Target PostgreSQL migration; the prototype still uses encrypted file stores.
alter table organization add column deleted_record_retention_years integer not null default 5
  check (deleted_record_retention_years between 1 and 100);

alter table examination
  add column physician_comment text check (char_length(physician_comment) <= 4000),
  add column reaction_date date,
  add column reaction_time time(0),
  add constraint reaction_time_requires_date check (reaction_time is null or reaction_date is not null);

comment on column examination.physician_comment is 'Separate physician annotation; never an override of the calculated conclusion.';
comment on column examination.reaction_date is 'Known local onset date; NULL means unknown. Does not determine the acute_onset tri-state.';
comment on column examination.reaction_time is 'Optional local onset time in Europe/Minsk; NULL means unknown, not midnight.';
comment on column organization.deleted_record_retention_years is 'Calendar years after soft deletion; applies only to deleted_at IS NOT NULL. Backups require a separate policy.';
