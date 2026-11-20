begin;
lock table public.bipv_projects in share row exclusive mode;
create table public.bipv_project_revisions (
  project_id uuid not null references public.bipv_projects(id) on delete cascade,
  revision integer not null,
  name text not null,
  scene jsonb not null,
  saved_at timestamptz not null,
  primary key (project_id, revision)
);
alter table public.bipv_project_revisions enable row level security;
alter table public.bipv_project_revisions force row level security;
revoke all on public.bipv_project_revisions from public, anon, authenticated;
grant select on public.bipv_project_revisions to anon, authenticated;
create policy guest_read_revisions on public.bipv_project_revisions
  for select to anon, authenticated using (
    exists (select 1 from public.bipv_projects p where p.id = project_id)
  );
insert into public.bipv_project_revisions (project_id, revision, name, scene, saved_at)
select id, revision, name, scene, updated_at from public.bipv_projects;

create function bipv_private.capture_project_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.bipv_project_revisions (project_id, revision, name, scene, saved_at)
  values (NEW.id, NEW.revision, NEW.name, NEW.scene, NEW.updated_at);
  delete from public.bipv_project_revisions
  where project_id = NEW.id and revision <= NEW.revision - 20;
  return NEW;
end;
$$;
revoke all on function bipv_private.capture_project_revision() from public, anon, authenticated;
create trigger capture_project_revision after insert or update on public.bipv_projects
  for each row execute function bipv_private.capture_project_revision();
commit;
