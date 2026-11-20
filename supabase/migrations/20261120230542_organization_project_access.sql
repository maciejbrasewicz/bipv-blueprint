begin;

alter table public.bipv_projects
  add column organization_id uuid references bipv_private.organizations(id),
  alter column owner_key_hash drop not null,
  add constraint bipv_project_single_owner
    check ((organization_id is null) <> (owner_key_hash is null));

create index bipv_projects_organization_updated_idx
  on public.bipv_projects(organization_id, updated_at desc) where organization_id is not null;

grant usage on schema bipv_private to authenticated;
grant select (organization_id) on public.bipv_projects to authenticated;

-- Gate membership lookups against the live table on every request, including
-- for a still-valid token after an operator revokes membership.
create function bipv_private.studio_user()
returns uuid language sql stable security invoker set search_path = '' as $$
  select case when coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false'
    then (select auth.uid()) end
$$;
revoke all on function bipv_private.studio_user() from public, anon, authenticated;

create function bipv_private.organization_role(p_organization uuid)
returns text language sql stable security definer set search_path = '' as $$
  select role from bipv_private.organization_members
  where organization_id = p_organization and user_id = (select bipv_private.studio_user())
$$;
revoke all on function bipv_private.organization_role(uuid) from public, anon, authenticated;
grant execute on function bipv_private.organization_role(uuid) to authenticated;

create policy organization_select on public.bipv_projects for select to authenticated
  using (organization_id is not null and bipv_private.organization_role(organization_id) is not null);
create policy organization_update on public.bipv_projects for update to authenticated
  using (organization_id is not null and bipv_private.organization_role(organization_id) in ('owner', 'designer'))
  with check (organization_id is not null and bipv_private.organization_role(organization_id) in ('owner', 'designer'));
create policy organization_delete on public.bipv_projects for delete to authenticated
  using (organization_id is not null and bipv_private.organization_role(organization_id) = 'owner');

-- Existing capability policies match only guest rows because an assigned
-- project has a NULL guest hash and ownership columns are never writable by clients.
create or replace function bipv_private.guard_project()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    perform pg_catalog.pg_advisory_xact_lock(738421001);
    if (select count(*) from public.bipv_projects) >= 1000 then
      raise exception 'Studio global project limit reached' using errcode = '23514';
    end if;
    if NEW.organization_id is null then
      if (select count(*) from public.bipv_projects where owner_key_hash = NEW.owner_key_hash) >= 10 then
        raise exception 'Guest workspace limit: 10 projects' using errcode = '23514';
      end if;
    elsif (select count(*) from public.bipv_projects where organization_id = NEW.organization_id) >= 50 then
      raise exception 'Organization project limit reached' using errcode = '23514';
    end if;
  elsif OLD.organization_id is null and NEW.organization_id is not null and NEW.owner_key_hash is null
      and (NEW.id, NEW.name, NEW.scene, NEW.revision, NEW.created_at)
          is not distinct from (OLD.id, OLD.name, OLD.scene, OLD.revision, OLD.created_at) then
    return NEW;
  elsif NEW.revision <> OLD.revision + 1
      or (NEW.organization_id, NEW.owner_key_hash) is distinct from (OLD.organization_id, OLD.owner_key_hash) then
    raise exception 'Revision must advance by one without an ownership change' using errcode = '23514';
  end if;
  NEW.updated_at := pg_catalog.now();
  return NEW;
end;
$$;

create or replace trigger capture_project_revision after insert or update of revision on public.bipv_projects
  for each row execute function bipv_private.capture_project_revision();

create function bipv_private.my_studio_organizations()
returns table(id uuid, name text, role text) language sql stable security definer set search_path = '' as $$
  select o.id, o.name, m.role
  from bipv_private.organization_members m join bipv_private.organizations o on o.id = m.organization_id
  where m.user_id = (select bipv_private.studio_user())
  order by o.name, o.id
$$;

create function bipv_private.create_studio_organization(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := bipv_private.studio_user();
  v_id uuid;
begin
  if v_user is null then
    raise insufficient_privilege;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 1025));
  if (select count(*) from bipv_private.organization_members where user_id = v_user and role = 'owner') >= 5 then
    raise exception 'Organization limit reached' using errcode = '23514';
  end if;
  insert into bipv_private.organizations(name) values (pg_catalog.btrim(p_name)) returning id into v_id;
  insert into bipv_private.organization_members(organization_id, user_id, role)
    values (v_id, v_user, 'owner');
  return v_id;
end;
$$;

create function bipv_private.create_studio_project(p_organization uuid, p_project uuid, p_name text, p_scene jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(bipv_private.organization_role(p_organization) in ('owner', 'designer'), false) then
    raise insufficient_privilege;
  end if;
  insert into public.bipv_projects(id, organization_id, owner_key_hash, name, scene)
    values (p_project, p_organization, null, p_name, p_scene);
  return p_project;
end;
$$;

create function bipv_private.claim_studio_project(p_organization uuid, p_project uuid, p_revision integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_key text := public.bipv_workspace_hash();
  v_org uuid;
  v_revision integer;
begin
  if v_key is null
      or not coalesce(bipv_private.organization_role(p_organization) in ('owner', 'designer'), false) then
    raise insufficient_privilege;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(738421001);
  select organization_id, revision into v_org, v_revision from public.bipv_projects
  where id = p_project and (organization_id = p_organization or owner_key_hash = v_key)
  for update;
  if not found then
    raise sqlstate 'PT404' using message = 'Guest project not found';
  end if;
  if v_org = p_organization then
    return p_project;
  end if;
  if v_revision is distinct from p_revision then
    raise sqlstate 'PT409' using message = 'Guest revision changed';
  end if;
  if (select count(*) from public.bipv_projects where organization_id = p_organization) >= 50 then
    raise exception 'Organization project limit reached' using errcode = '23514';
  end if;
  update public.bipv_projects set organization_id = p_organization, owner_key_hash = null where id = p_project;
  return p_project;
end;
$$;

-- Data API entry points run with the caller's rights. Only the restricted
-- functions in the unexposed schema can create or assign ownership.
create function public.bipv_my_organizations()
returns table(id uuid, name text, role text) language sql stable security invoker set search_path = '' as $$
  select * from bipv_private.my_studio_organizations()
$$;
create function public.bipv_create_organization(p_name text)
returns uuid language sql security invoker set search_path = '' as $$
  select bipv_private.create_studio_organization(p_name)
$$;
create function public.bipv_create_organization_project(p_organization uuid, p_project uuid, p_name text, p_scene jsonb)
returns uuid language sql security invoker set search_path = '' as $$
  select bipv_private.create_studio_project(p_organization, p_project, p_name, p_scene)
$$;
create function public.bipv_claim_project(p_organization uuid, p_project uuid, p_revision integer)
returns uuid language sql security invoker set search_path = '' as $$
  select bipv_private.claim_studio_project(p_organization, p_project, p_revision)
$$;

revoke all on function bipv_private.my_studio_organizations(), bipv_private.create_studio_organization(text),
  bipv_private.create_studio_project(uuid, uuid, text, jsonb), bipv_private.claim_studio_project(uuid, uuid, integer),
  public.bipv_my_organizations(), public.bipv_create_organization(text),
  public.bipv_create_organization_project(uuid, uuid, text, jsonb), public.bipv_claim_project(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function bipv_private.my_studio_organizations(), bipv_private.create_studio_organization(text),
  bipv_private.create_studio_project(uuid, uuid, text, jsonb), bipv_private.claim_studio_project(uuid, uuid, integer),
  public.bipv_my_organizations(), public.bipv_create_organization(text),
  public.bipv_create_organization_project(uuid, uuid, text, jsonb), public.bipv_claim_project(uuid, uuid, integer)
  to authenticated;

-- Assets use <organization_id>/<project_id>/<object>. Use the project row
-- as the authority and reevaluate membership even when token claims are stale.
create function bipv_private.can_access_project_asset(p_name text, p_write boolean)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.bipv_projects p
    where p.id = case when pg_catalog.split_part(p_name, '/', 2) ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
      then pg_catalog.split_part(p_name, '/', 2)::uuid end
      and p.organization_id = case when pg_catalog.split_part(p_name, '/', 1) ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
      then pg_catalog.split_part(p_name, '/', 1)::uuid end
      and pg_catalog.split_part(p_name, '/', 3) <> ''
      and pg_catalog.array_length(pg_catalog.string_to_array(p_name, '/'), 1) = 3
      and case when p_write then bipv_private.organization_role(p.organization_id) in ('owner', 'designer')
        else bipv_private.organization_role(p.organization_id) is not null end
  )
$$;
revoke all on function bipv_private.can_access_project_asset(text, boolean) from public, anon, authenticated;
grant execute on function bipv_private.can_access_project_asset(text, boolean) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('bipv-project-assets', 'bipv-project-assets', false, 5242880);
create policy bipv_assets_read on storage.objects for select to authenticated
  using (bucket_id = 'bipv-project-assets' and bipv_private.can_access_project_asset(name, false));
create policy bipv_assets_add on storage.objects for insert to authenticated
  with check (bucket_id = 'bipv-project-assets' and bipv_private.can_access_project_asset(name, true));
create policy bipv_assets_edit on storage.objects for update to authenticated
  using (bucket_id = 'bipv-project-assets' and bipv_private.can_access_project_asset(name, true))
  with check (bucket_id = 'bipv-project-assets' and bipv_private.can_access_project_asset(name, true));
create policy bipv_assets_remove on storage.objects for delete to authenticated
  using (bucket_id = 'bipv-project-assets' and bipv_private.can_access_project_asset(name, true));

commit;
