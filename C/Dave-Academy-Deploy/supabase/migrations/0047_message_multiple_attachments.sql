-- Chat Phase 2, priority 3: multiple attachments per message (e.g. up to
-- 5 homework photos in one message). The existing single-attachment
-- columns on messages (attachment_url/name/type, 0009) are left exactly
-- as they are and keep being used for the single-attachment case - zero
-- behavior change there. A new message_attachments table holds the
-- attachments for a message that has more than one; the client decides
-- which path to use based on file count.

create table if not exists public.message_attachments (
  id bigint generated always as identity primary key,
  message_id bigint not null references public.messages (id) on delete cascade,
  url text not null,
  name text,
  type text,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists message_attachments_message_idx on public.message_attachments (message_id);

alter table public.message_attachments enable row level security;

-- Same visibility rule as the parent message - reuses can_read_message
-- (0009) rather than a second, possibly-divergent rule.
drop policy if exists message_attachments_select on public.message_attachments;
create policy message_attachments_select on public.message_attachments for select
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_attachments.message_id
        and public.can_read_message(m.sender_id, m.scope, m.recipient_id, m.level, m.context_type, m.context_id)
    )
  );

-- Insert is scoped to "you sent the parent message" - the message row's
-- own insert policy already ran can_send_message when that message was
-- created, so there's nothing further to re-check here.
drop policy if exists message_attachments_insert on public.message_attachments;
create policy message_attachments_insert on public.message_attachments for insert
  with check (
    exists (
      select 1 from public.messages m
      where m.id = message_attachments.message_id and m.sender_id = auth.uid()
    )
  );

-- Delete follows the same admin-only moderation rule as messages_delete_admin
-- (0009) - in practice this only matters if an attachment needs removing
-- without deleting the whole message; deleting the parent message already
-- cascades.
drop policy if exists message_attachments_delete_admin on public.message_attachments;
create policy message_attachments_delete_admin on public.message_attachments for delete using (is_admin());

-- Extend the chat attachment storage read gate (0046) to also cover
-- files referenced from message_attachments, not just the legacy
-- messages.attachment_url column.
create or replace function public.can_read_chat_attachment(p_path text)
returns boolean
language sql
stable security definer
set search_path = 'public'
as $$
  select exists (
    select 1 from public.messages m
    where m.attachment_url = p_path
      and public.can_read_message(m.sender_id, m.scope, m.recipient_id, m.level, m.context_type, m.context_id)
  )
  or exists (
    select 1 from public.message_attachments ma
    join public.messages m on m.id = ma.message_id
    where ma.url = p_path
      and public.can_read_message(m.sender_id, m.scope, m.recipient_id, m.level, m.context_type, m.context_id)
  );
$$;

-- Realtime, same as messages/message_reads in 0044, so a multi-attachment
-- message sent by someone else shows its images/PDFs immediately instead
-- of only after a reload.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_attachments'
  ) then
    alter publication supabase_realtime add table public.message_attachments;
  end if;
end $$;
