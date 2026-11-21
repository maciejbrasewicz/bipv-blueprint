-- Expand the existing JSON contract. Existing v1 documents and all access policies remain valid.
alter table public.bipv_projects drop constraint bipv_projects_scene_check;
alter table public.bipv_projects add constraint bipv_projects_scene_check check (
  jsonb_typeof(scene) = 'object'
  and octet_length(scene::text) <= 65000
  and (
    scene->>'schema_version' = '1.0.0'
    or (
      scene->>'schema_version' = '2.0.0'
      and jsonb_typeof(scene->'geometry') = 'object'
      and scene->'geometry'->>'schema_version' = '1.0.0'
    )
  ) is true
);
