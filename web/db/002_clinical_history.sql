-- Target PostgreSQL schema for identifiable clinical data.
-- Apply only after privacy jurisdiction, retention, backups, encryption and access policies are approved.

create type clinical_tri_state as enum ('yes', 'no', 'unknown');

create table patient (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id) on delete restrict,
  full_name text not null check (char_length(full_name) between 3 and 200),
  created_by uuid not null references app_user(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index patient_org_name_idx on patient(organization_id, lower(full_name));

create table examination (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id) on delete restrict,
  patient_id uuid not null references patient(id) on delete restrict,
  probable_allergen text check (probable_allergen is null or char_length(probable_allergen) <= 200),
  allergen_contact clinical_tri_state not null default 'unknown',
  acute_onset clinical_tri_state not null default 'unknown',
  examined_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references app_user(id) on delete restrict,
  updated_by uuid not null references app_user(id) on delete restrict,
  algorithm_version text not null,
  catalog_version text not null,
  severity_grade smallint not null check (severity_grade between 0 and 5),
  selected_symptoms jsonb not null,
  vitals jsonb not null,
  severity_result jsonb not null,
  clinical_conclusion jsonb not null,
  row_version integer not null default 1 check (row_version > 0),
  deleted_at timestamptz,
  deleted_by uuid references app_user(id) on delete restrict,
  constraint selected_symptoms_array check (jsonb_typeof(selected_symptoms) = 'array'),
  constraint vitals_object check (jsonb_typeof(vitals) = 'object'),
  constraint severity_result_object check (jsonb_typeof(severity_result) = 'object'),
  constraint clinical_conclusion_object check (jsonb_typeof(clinical_conclusion) = 'object')
);
create index examination_org_date_idx on examination(organization_id, examined_at desc) where deleted_at is null;
create index examination_patient_date_idx on examination(patient_id, examined_at desc) where deleted_at is null;

comment on table examination is 'Versioned calculation snapshots retain the exact algorithm and clinical result saved by the clinician.';
comment on column examination.selected_symptoms is 'Versioned snapshot; recalculate only during an explicit clinician edit.';
