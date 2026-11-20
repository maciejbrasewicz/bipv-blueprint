-- Run only in a disposable database after the three guest migrations.
set role anon;
select set_config('request.headers',
  jsonb_build_object('x-workspace-key', repeat('a', 64))::text, false);
insert into public.bipv_projects (id, name, scene)
values ('10000000-0000-4000-8000-000000000001', 'Guest scene', '{"schema_version":"1.0.0"}');
update public.bipv_projects set name = 'Guest scene v2', revision = 2
where id = '10000000-0000-4000-8000-000000000001';
reset role;
