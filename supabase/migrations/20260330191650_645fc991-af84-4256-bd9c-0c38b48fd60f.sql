
create table public.whatsapp_template_logs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.whatsapp_templates(id) on delete set null,
  template_name text not null,
  action text not null,
  status text not null,
  request_payload jsonb,
  response_payload jsonb,
  error_message text,
  twilio_status_code int,
  content_sid text,
  user_id uuid references auth.users(id),
  created_at timestamptz default now()
);

alter table public.whatsapp_template_logs enable row level security;

create policy "Admins can view template logs"
  on public.whatsapp_template_logs for select
  to authenticated
  using (public.has_any_role(auth.uid(), array['ADMIN','MANAGER']::app_role[]));

create policy "System can insert template logs"
  on public.whatsapp_template_logs for insert
  to authenticated
  with check (true);
