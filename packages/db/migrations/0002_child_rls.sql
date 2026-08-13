-- Child records inherit ownership through their parent. These policies prevent
-- direct REST/database access from bypassing the owning user's root row.
alter table topic_opportunities enable row level security;
alter table trend_signals enable row level security;
alter table script_versions enable row level security;
alter table transcript_words enable row level security;
alter table caption_cues enable row level security;
alter table publish_destinations enable row level security;
alter table chat_messages enable row level security;

create policy own_topic_opportunities on topic_opportunities for all
using (exists(select 1 from trend_runs r where r.id=run_id and r.user_id=auth.uid()))
with check (exists(select 1 from trend_runs r where r.id=run_id and r.user_id=auth.uid()));
create policy own_trend_signals on trend_signals for all
using (exists(select 1 from trend_runs r where r.id=run_id and r.user_id=auth.uid()))
with check (exists(select 1 from trend_runs r where r.id=run_id and r.user_id=auth.uid()));
create policy own_script_versions on script_versions for all
using (exists(select 1 from scripts s where s.id=script_id and s.user_id=auth.uid()))
with check (exists(select 1 from scripts s where s.id=script_id and s.user_id=auth.uid()));
create policy own_transcript_words on transcript_words for all
using (exists(select 1 from video_projects v where v.id=project_id and v.user_id=auth.uid()))
with check (exists(select 1 from video_projects v where v.id=project_id and v.user_id=auth.uid()));
create policy own_caption_cues on caption_cues for all
using (exists(select 1 from video_projects v where v.id=project_id and v.user_id=auth.uid()))
with check (exists(select 1 from video_projects v where v.id=project_id and v.user_id=auth.uid()));
create policy own_publish_destinations on publish_destinations for all
using (exists(select 1 from publish_jobs j where j.id=job_id and j.user_id=auth.uid()))
with check (exists(select 1 from publish_jobs j where j.id=job_id and j.user_id=auth.uid()));
create policy own_chat_messages on chat_messages for all
using (exists(select 1 from chat_threads t where t.id=thread_id and t.user_id=auth.uid()))
with check (exists(select 1 from chat_threads t where t.id=thread_id and t.user_id=auth.uid()));
