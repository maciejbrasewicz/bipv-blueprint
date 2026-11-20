begin;

-- Expand only. Guest projects and their revision history keep their current access model.
create table bipv_private.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);

create table bipv_private.organization_members (
  organization_id uuid not null references bipv_private.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'designer', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_members_user_id_idx
  on bipv_private.organization_members(user_id, organization_id);

alter table bipv_private.organizations enable row level security;
alter table bipv_private.organizations force row level security;
alter table bipv_private.organization_members enable row level security;
alter table bipv_private.organization_members force row level security;

revoke all on bipv_private.organizations, bipv_private.organization_members
  from public, anon, authenticated;

commit;
