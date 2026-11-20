alter table public.bipv_projects drop constraint bipv_projects_scene_check;
alter table public.bipv_projects add constraint bipv_projects_scene_check
  check (jsonb_typeof(scene) = 'object' and octet_length(scene::text) <= 65000
    and scene ? 'schema_version' and scene->>'schema_version' = '1.0.0');
