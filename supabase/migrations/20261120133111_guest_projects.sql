-- Guest access uses 256-bit random capabilities. No service-role key is used.
create schema if not exists bipv_private;
revoke all on schema bipv_private from public, anon, authenticated;
create function public.bipv_workspace_hash()
returns text language sql stable security invoker set search_path = '' as $$
  select case when (coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb ->> 'x-workspace-key') ~ '^[a-f0-9]{64}$'
    then encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb ->> 'x-workspace-key', 'UTF8')), 'hex')
    else null end;
$$;
revoke all on function public.bipv_workspace_hash() from public;
grant execute on function public.bipv_workspace_hash() to anon, authenticated;
create table public.bipv_projects (
  id uuid primary key,
  owner_key_hash text not null default public.bipv_workspace_hash() check (owner_key_hash ~ '^[a-f0-9]{64}$'),
  name text not null check (char_length(name) between 1 and 100),
  scene jsonb not null check (jsonb_typeof(scene) = 'object' and octet_length(scene::text) <= 65000
      and scene->>'schema_version' = '1.0.0'),
  revision integer not null default 1 check (revision between 1 and 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bipv_projects_owner_updated_idx on public.bipv_projects(owner_key_hash, updated_at desc);
alter table public.bipv_projects enable row level security;
alter table public.bipv_projects force row level security;
revoke all on public.bipv_projects from anon, authenticated;
grant select(id, name, scene, revision, created_at, updated_at) on public.bipv_projects to anon, authenticated;
grant insert(id, name, scene) on public.bipv_projects to anon, authenticated;
grant update(name, scene, revision) on public.bipv_projects to anon, authenticated;
grant delete on public.bipv_projects to anon, authenticated;
create policy guest_select on public.bipv_projects for select to anon, authenticated
  using (owner_key_hash = (select public.bipv_workspace_hash()));
create policy guest_insert on public.bipv_projects for insert to anon, authenticated
  with check (owner_key_hash = (select public.bipv_workspace_hash()));
create policy guest_update on public.bipv_projects for update to anon, authenticated
  using (owner_key_hash = (select public.bipv_workspace_hash()))
  with check (owner_key_hash = (select public.bipv_workspace_hash()));
create policy guest_delete on public.bipv_projects for delete to anon, authenticated
  using (owner_key_hash = (select public.bipv_workspace_hash()));
create function bipv_private.guard_project()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    perform pg_catalog.pg_advisory_xact_lock(738421001);
    if (select count(*) from public.bipv_projects) >= 1000 then
      raise exception 'Demo global project limit reached' using errcode = '23514';
    end if;
    if (select count(*) from public.bipv_projects where owner_key_hash = NEW.owner_key_hash) >= 10 then
      raise exception 'Guest workspace limit: 10 projects' using errcode = '23514';
    end if;
  else
    if NEW.revision <> OLD.revision + 1 then
      raise exception 'Revision must advance by one' using errcode = '23514';
    end if;
  end if;
  NEW.updated_at := pg_catalog.now();
  return NEW;
end;
$$;
revoke all on function bipv_private.guard_project() from public, anon, authenticated;
create trigger guard_project before insert or update on public.bipv_projects
  for each row execute function bipv_private.guard_project();
comment on table public.bipv_projects is 'R1 capability-scoped guest projects. 10/workspace, 1000 total, 65KB/scene. Not named-user authentication.';
