-- ローカル開発用。実AIを呼ばずに、分類済みテーマの選択・絞り込みを確認する。
-- 既存投稿の分類を上書きせず、専用の固定IDだけを追加する。
INSERT OR IGNORE INTO concern_clusters
  (id, legacy_label, legacy_summary, label, summary, status, model_version, created_at, updated_at)
VALUES
  ('dev-theme-help', '人に頼るのがむずかしい', '仕事や家庭で、一人で抱えてしまう声。', '人に頼るのがむずかしい', '仕事や家庭で、一人で抱えてしまう声。', 'ready', 'local-demo', '2026-09-23T09:00:00.000Z', '2026-09-23T09:00:00.000Z'),
  ('dev-theme-rest', 'ゆっくり休みたい', '忙しい毎日の中で、自分の時間が取れない声。', 'ゆっくり休みたい', '忙しい毎日の中で、自分の時間が取れない声。', 'ready', 'local-demo', '2026-09-23T09:00:00.000Z', '2026-09-23T09:00:00.000Z'),
  ('dev-theme-words', '気持ちを伝えたい', '身近な人に、思いをうまく伝えられない声。', '気持ちを伝えたい', '身近な人に、思いをうまく伝えられない声。', 'ready', 'local-demo', '2026-09-23T09:00:00.000Z', '2026-09-23T09:00:00.000Z');

INSERT OR IGNORE INTO concerns
  (id, user_id, body, age_group, gender_code, region_code, cluster_id, visibility_status, processing_status, created_at, updated_at)
VALUES
  ('dev-theme-help-a', (SELECT id FROM users WHERE line_user_id = 'dev:demo-b'), '仕事をお願いしたいけど、相手も忙しそうで、結局いつも自分で抱えてしまいます。', '40s', 'male', 'hyogo', 'dev-theme-help', 'published', 'ready', '2026-09-23T09:00:00.000Z', '2026-09-23T09:00:00.000Z'),
  ('dev-theme-help-b', (SELECT id FROM users WHERE line_user_id = 'dev:demo-c'), '家事を少し手伝ってほしい。でも、疲れて帰ってくる家族に言い出しづらいです。', '30s', 'no_answer', 'tokyo', 'dev-theme-help', 'published', 'ready', '2026-09-23T10:00:00.000Z', '2026-09-23T10:00:00.000Z'),
  ('dev-theme-rest-a', (SELECT id FROM users WHERE line_user_id = 'dev:demo-a'), '授業とアルバイトが続いて、何も考えずに休む時間がほしいです。', '20s', 'female', 'osaka', 'dev-theme-rest', 'published', 'ready', '2026-09-23T11:00:00.000Z', '2026-09-23T11:00:00.000Z'),
  ('dev-theme-rest-b', (SELECT id FROM users WHERE line_user_id = 'dev:demo-b'), '休日も仕事の連絡が気になって、休んでいるはずなのに落ち着きません。', '40s', 'male', 'hyogo', 'dev-theme-rest', 'published', 'ready', '2026-09-23T12:00:00.000Z', '2026-09-23T12:00:00.000Z'),
  ('dev-theme-words-a', (SELECT id FROM users WHERE line_user_id = 'dev:demo-a'), '友人に本当の気持ちを伝えたいのに、つい大丈夫と言ってしまいます。', '20s', 'female', 'osaka', 'dev-theme-words', 'published', 'ready', '2026-09-23T13:00:00.000Z', '2026-09-23T13:00:00.000Z'),
  ('dev-theme-words-b', (SELECT id FROM users WHERE line_user_id = 'dev:demo-c'), '家族と話すと、伝えたいこととは違う意味に受け取られてしまいます。', '30s', 'no_answer', 'tokyo', 'dev-theme-words', 'published', 'ready', '2026-09-23T14:00:00.000Z', '2026-09-23T14:00:00.000Z');
