create extension if not exists pgcrypto;

-- Drizzle owns the full column definitions. This migration adds the security
-- invariants that PostgreSQL must enforce independently of application code.
alter table if exists users enable row level security;
alter table if exists platform_connections enable row level security;
alter table if exists creator_content_items enable row level security;
alter table if exists niche_versions enable row level security;
alter table if exists trend_runs enable row level security;
alter table if exists scripts enable row level security;
alter table if exists video_projects enable row level security;
alter table if exists publish_jobs enable row level security;
alter table if exists social_posts enable row level security;
alter table if exists comments enable row level security;
alter table if exists comment_analysis_runs enable row level security;
alter table if exists chat_threads enable row level security;
alter table if exists agent_tool_runs enable row level security;
alter table if exists background_jobs enable row level security;
alter table if exists audit_events enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'platform_connections','creator_content_items','niche_versions',
    'trend_runs','scripts','video_projects','publish_jobs','social_posts',
    'comments','comment_analysis_runs','chat_threads','agent_tool_runs','background_jobs','audit_events'
  ] loop
    execute format('drop policy if exists own_rows on %I', table_name);
    execute format(
      'create policy own_rows on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())',
      table_name
    );
  end loop;
end $$;

-- users.id is the authenticated user id and therefore uses id rather than user_id.
create policy own_rows on users for all using (id = auth.uid()) with check (id = auth.uid());
