CREATE INDEX IF NOT EXISTS `idx_rss_tt_subs_id` ON rss_episode_subtitle (`rss_subs_id`);

CREATE INDEX IF NOT EXISTS `idx_rss_ep_task_id` ON rss_episode_subtitle (`rss_task_id`);

CREATE INDEX IF NOT EXISTS `idx_rss_epf_subs_id` ON rss_episode_subtitle (`rss_subs_id`);

CREATE INDEX IF NOT EXISTS `idx_rss_epf_task_id` ON rss_episode_subtitle (`rss_task_id`);