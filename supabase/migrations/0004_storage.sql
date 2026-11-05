-- Palms in Paradise: product photo storage.
-- Photos are public to read (they are shown on the store). Only staff with
-- the products area may add, replace or remove them. Uploads go straight from
-- the browser to storage with a short-lived signed URL created on the server.
-- Skipped automatically on a plain Postgres (tests) where storage is absent.
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage schema not present, skipping';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('product-photos', 'product-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  execute $p$
    create policy product_photos_staff_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'product-photos' and public.staff_can('products'))
  $p$;
  execute $p$
    create policy product_photos_staff_update on storage.objects for update to authenticated
      using (bucket_id = 'product-photos' and public.staff_can('products'))
  $p$;
  execute $p$
    create policy product_photos_staff_delete on storage.objects for delete to authenticated
      using (bucket_id = 'product-photos' and public.staff_can('products'))
  $p$;
end $$;
