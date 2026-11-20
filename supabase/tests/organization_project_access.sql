-- Caller runs this in a disposable database or an explicit transaction that
-- is rolled back. IDs below belong solely to these test fixtures.
insert into auth.users(id) values
  ('26110000-0000-4000-8000-000000000001'),
  ('26110000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"26110000-0000-4000-8000-000000000001","is_anonymous":false}', true);
select set_config('bipv.test_org_a', public.bipv_create_organization('Test organization A')::text, true);
select set_config('request.jwt.claims', '{"sub":"26110000-0000-4000-8000-000000000002","is_anonymous":false}', true);
select set_config('bipv.test_org_b', public.bipv_create_organization('Test organization B')::text, true);

reset role;
set local role anon;
select set_config('request.headers',
  jsonb_build_object('x-workspace-key', repeat('d', 64))::text, true);
insert into public.bipv_projects (id, name, scene)
values ('26110000-0000-4000-8000-000000000003', 'Test claim source', '{"schema_version":"1.0.0"}');
update public.bipv_projects set name = 'Test claim source updated', revision = 2
where id = '26110000-0000-4000-8000-000000000003';

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"26110000-0000-4000-8000-000000000001","is_anonymous":false}', true);
do $$
declare
  a uuid := current_setting('bipv.test_org_a')::uuid;
  b uuid := current_setting('bipv.test_org_b')::uuid;
  guest uuid := '26110000-0000-4000-8000-000000000003';
begin
  if (select array_agg(id) from public.bipv_my_organizations()) is distinct from array[a] then
    raise exception 'Membership list crossed organization boundaries';
  end if;
  begin
    perform public.bipv_create_organization_project(b, gen_random_uuid(), 'Blocked', '{"schema_version":"1.0.0"}');
    raise exception 'Cross-organization project insertion succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.bipv_claim_project(a, guest, 1);
    raise exception 'Stale guest revision was accepted';
  exception when sqlstate 'PT409' then null;
  end;
  perform set_config('request.headers', jsonb_build_object('x-workspace-key', repeat('e', 64))::text, true);
  begin
    perform public.bipv_claim_project(a, guest, 2);
    raise exception 'Foreign guest key was accepted';
  exception when sqlstate 'PT404' then null;
  end;
  perform set_config('request.headers', jsonb_build_object('x-workspace-key', repeat('d', 64))::text, true);
  if public.bipv_claim_project(a, guest, 2) <> guest or public.bipv_claim_project(a, guest, 2) <> guest then
    raise exception 'Claim changed project identity';
  end if;
  if (select array_agg(revision order by revision) from public.bipv_project_revisions where project_id = guest)
     is distinct from array[1, 2] then
    raise exception 'The move modified revision history';
  end if;
  begin
    perform public.bipv_claim_project(b, guest, 2);
    raise exception 'The project was moved into another organization';
  exception when insufficient_privilege then null;
  end;
  insert into storage.objects(bucket_id, name) values ('bipv-project-assets', a || '/' || guest || '/photo.jpg');
  begin
    insert into storage.objects(bucket_id, name) values ('bipv-project-assets', b || '/' || guest || '/photo.jpg');
    raise exception 'Storage accepted a false organization prefix';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"26110000-0000-4000-8000-000000000002","is_anonymous":false}', true);
do $$
declare
  guest uuid := '26110000-0000-4000-8000-000000000003';
begin
  if exists (select 1 from public.bipv_projects where id = guest)
      or exists (select 1 from public.bipv_project_revisions where project_id = guest)
      or exists (select 1 from storage.objects where bucket_id = 'bipv-project-assets') then
    raise exception 'A second organization read private project data or assets despite the former guest key';
  end if;
end;
$$;

reset role;
insert into bipv_private.organization_members(organization_id, user_id, role)
values (current_setting('bipv.test_org_a')::uuid, '26110000-0000-4000-8000-000000000002', 'viewer');
set local role authenticated;
do $$
declare
  guest uuid := '26110000-0000-4000-8000-000000000003';
begin
  if not exists (select 1 from public.bipv_projects where id = guest)
      or not exists (select 1 from storage.objects where bucket_id = 'bipv-project-assets') then
    raise exception 'Viewer cannot see an authorized project and its attachment';
  end if;
  update public.bipv_projects set name = 'Forbidden', revision = 3 where id = guest;
  if found then raise exception 'Viewer was allowed to update'; end if;
  if bipv_private.can_access_project_asset(
    current_setting('bipv.test_org_a') || '/' || guest || '/photo.jpg', true
  ) then raise exception 'Viewer was allowed to write assets'; end if;
end;
$$;

reset role;
delete from bipv_private.organization_members
where organization_id = current_setting('bipv.test_org_a')::uuid
  and user_id = '26110000-0000-4000-8000-000000000002';
set local role authenticated;
do $$
begin
  if exists (select 1 from public.bipv_projects where id = '26110000-0000-4000-8000-000000000003')
     or exists (select 1 from storage.objects where bucket_id = 'bipv-project-assets') then
    raise exception 'An unchanged JWT still has access after revocation';
  end if;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"26110000-0000-4000-8000-000000000001","is_anonymous":true}', true);
do $$
begin
  if exists (select 1 from public.bipv_my_organizations()) then raise exception 'Anonymous Auth account listed memberships'; end if;
  begin
    perform public.bipv_create_organization('Blocked');
    raise exception 'Anonymous Auth account created an organization';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set local role anon;
do $$
begin
  if exists (select 1 from public.bipv_projects where id = '26110000-0000-4000-8000-000000000003') then
    raise exception 'Old guest key still has access';
  end if;
end;
$$;
reset role;
