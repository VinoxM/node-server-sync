UPDATE bangumi_images
SET origin_url = REPLACE(origin_url, 'https://lain.bgm.tv/pic/', 'https://lain.bgm.tv/r/400/pic/'), status=0
WHERE origin_url LIKE 'https://lain.bgm.tv/pic/%';