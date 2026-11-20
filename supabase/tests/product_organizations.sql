insert into auth.users (id) values ('20000000-0000-4000-8000-000000000001');
insert into bipv_private.organizations (id, name)
values ('30000000-0000-4000-8000-000000000001', 'Fixture org');
insert into bipv_private.organization_members (organization_id, user_id, role)
values ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'owner');

do $$
begin
  if not (select bool_and(relrowsecurity and relforcerowsecurity)
          from pg_class where oid in (
      'bipv_private.organizations'::regclass, 'bipv_private.organization_members'::regclass)) then
    raise exception 'RLS must be enabled and enforced on both organization tables';
  end if;
  if has_schema_privilege('anon', 'bipv_private', 'USAGE')
     or has_schema_privilege('authenticated', 'bipv_private', 'USAGE')
     or has_table_privilege('anon', 'bipv_private.organizations', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'bipv_private.organizations', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('anon', 'bipv_private.organization_members', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'bipv_private.organization_members', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'Organization schema and rows must remain private until policies exist';
  end if;
end;
$$;

set role anon;
select set_config('request.headers',
  jsonb_build_object('x-workspace-key', repeat('a', 64))::text, false);
do $$
begin
  if (select revision from public.bipv_projects
      where id = '10000000-0000-4000-8000-000000000001') is distinct from 2 then
    raise exception 'Existing guest revision was lost';
  end if;
  if (select array_agg(revision order by revision) from public.bipv_project_revisions
      where project_id = '10000000-0000-4000-8000-000000000001') is distinct from array[1,2] then
    raise exception 'Existing history was lost';
  end if;
end;
$$;

update public.bipv_projects set name = 'Guest scene v3', revision = 3
where id = '10000000-0000-4000-8000-000000000001';
do $$
begin
  if (select array_agg(revision order by revision) from public.bipv_project_revisions
      where project_id = '10000000-0000-4000-8000-000000000001') is distinct from array[1,2,3] then
    raise exception 'New guest revisions no longer persist';
  end if;
end;
$$;

select set_config('request.headers',
  jsonb_build_object('x-workspace-key', repeat('b', 64))::text, false);
do $$
begin
  if exists (select 1 from public.bipv_projects)
     or exists (select 1 from public.bipv_project_revisions) then
    raise exception 'Second guest capability can see the first guest project';
  end if;
end;
$$;
reset role;
