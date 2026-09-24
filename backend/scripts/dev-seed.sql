-- ローカル開発専用のサンプルデータ。remote D1へ適用しない。
-- INSERT OR IGNORE で make dev を繰り返しても既存の投稿・回答を壊さない。
-- 開発認証APIが先に作成したユーザーにも紐づけられるよう、後続データはline_user_idから実IDを参照する。

INSERT OR IGNORE INTO users (
  id,
  line_user_id,
  birth_year,
  birth_month,
  gender_code,
  region_code,
  created_at,
  updated_at
)
VALUES
  (
    'dev-user-a',
    'dev:demo-a',
    2002,
    4,
    'female',
    'osaka',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'dev-user-b',
    'dev:demo-b',
    1985,
    8,
    'male',
    'hyogo',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'dev-user-c',
    'dev:demo-c',
    1995,
    11,
    'no_answer',
    'tokyo',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  );

INSERT OR IGNORE INTO concerns (
  id,
  user_id,
  body,
  age_group,
  gender_code,
  region_code,
  visibility_status,
  processing_status,
  created_at,
  updated_at
)
VALUES
  (
    'dev-concern-a',
    (SELECT id FROM users WHERE line_user_id = 'dev:demo-a'),
    '昼休みの食堂がいつも混んでいて、食べ終わるころには休憩時間がなくなってしまいます。',
    '20s',
    'female',
    'osaka',
    'published',
    'ready',
    '2026-09-20T09:00:00.000Z',
    '2026-09-20T09:00:00.000Z'
  ),
  (
    'dev-concern-b',
    (SELECT id FROM users WHERE line_user_id = 'dev:demo-b'),
    '駅から家までの道が暗く、仕事の帰りが遅い日は少し不安です。',
    '40s',
    'male',
    'hyogo',
    'published',
    'ready',
    '2026-09-21T09:00:00.000Z',
    '2026-09-21T09:00:00.000Z'
  ),
  (
    'dev-concern-c',
    (SELECT id FROM users WHERE line_user_id = 'dev:demo-c'),
    '病院の予約が電話とウェブで分かれていて、どこから申し込めばよいのか分かりにくいです。',
    '30s',
    'no_answer',
    'tokyo',
    'published',
    'ready',
    '2026-09-22T09:00:00.000Z',
    '2026-09-22T09:00:00.000Z'
  );

INSERT OR IGNORE INTO quizzes (
  id,
  quiz_date,
  status,
  created_at,
  published_at,
  hidden_at
)
VALUES (
  'dev-quiz-' || strftime('%Y-%m-%d', 'now', '+9 hours'),
  strftime('%Y-%m-%d', 'now', '+9 hours'),
  'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  NULL
);

INSERT OR IGNORE INTO quiz_participants (
  id,
  quiz_id,
  user_id,
  concern_id,
  display_order,
  age_group_snapshot,
  gender_snapshot,
  region_code_snapshot,
  explanation
)
SELECT
  'dev-quiz-' || strftime('%Y-%m-%d', 'now', '+9 hours') || '-a',
  'dev-quiz-' || strftime('%Y-%m-%d', 'now', '+9 hours'),
  (SELECT id FROM users WHERE line_user_id = 'dev:demo-a'),
  'dev-concern-a',
  1,
  '20s',
  'female',
  'osaka',
  '昼休みに落ち着いて食事をしたいという声でした。'
WHERE EXISTS (
  SELECT 1 FROM quizzes
  WHERE id = 'dev-quiz-' || strftime('%Y-%m-%d', 'now', '+9 hours')
);

INSERT OR IGNORE INTO quiz_participants (
  id,
  quiz_id,
  user_id,
  concern_id,
  display_order,
  age_group_snapshot,
  gender_snapshot,
  region_code_snapshot,
  explanation
)
SELECT
  'dev-quiz-' || strftime('%Y-%m-%d', 'now', '+9 hours') || '-b',
  'dev-quiz-' || strftime('%Y-%m-%d', 'now', '+9 hours'),
  (SELECT id FROM users WHERE line_user_id = 'dev:demo-b'),
  'dev-concern-b',
  2,
  '40s',
  'male',
  'hyogo',
  '帰り道の明るさを気にかける声でした。'
WHERE EXISTS (
  SELECT 1 FROM quizzes
  WHERE id = 'dev-quiz-' || strftime('%Y-%m-%d', 'now', '+9 hours')
);

INSERT OR IGNORE INTO quiz_participants (
  id,
  quiz_id,
  user_id,
  concern_id,
  display_order,
  age_group_snapshot,
  gender_snapshot,
  region_code_snapshot,
  explanation
)
SELECT
  'dev-quiz-' || strftime('%Y-%m-%d', 'now', '+9 hours') || '-c',
  'dev-quiz-' || strftime('%Y-%m-%d', 'now', '+9 hours'),
  (SELECT id FROM users WHERE line_user_id = 'dev:demo-c'),
  'dev-concern-c',
  3,
  '30s',
  'no_answer',
  'tokyo',
  '予約方法が分かりにくいという声でした。'
WHERE EXISTS (
  SELECT 1 FROM quizzes
  WHERE id = 'dev-quiz-' || strftime('%Y-%m-%d', 'now', '+9 hours')
);

INSERT OR IGNORE INTO quiz_options (quiz_id, concern_id, display_order)
SELECT
  'dev-quiz-' || strftime('%Y-%m-%d', 'now', '+9 hours'),
  'dev-concern-a',
  1
WHERE EXISTS (
  SELECT 1 FROM quizzes
  WHERE id = 'dev-quiz-' || strftime('%Y-%m-%d', 'now', '+9 hours')
);

INSERT OR IGNORE INTO quiz_options (quiz_id, concern_id, display_order)
SELECT
  'dev-quiz-' || strftime('%Y-%m-%d', 'now', '+9 hours'),
  'dev-concern-b',
  2
WHERE EXISTS (
  SELECT 1 FROM quizzes
  WHERE id = 'dev-quiz-' || strftime('%Y-%m-%d', 'now', '+9 hours')
);

INSERT OR IGNORE INTO quiz_options (quiz_id, concern_id, display_order)
SELECT
  'dev-quiz-' || strftime('%Y-%m-%d', 'now', '+9 hours'),
  'dev-concern-c',
  3
WHERE EXISTS (
  SELECT 1 FROM quizzes
  WHERE id = 'dev-quiz-' || strftime('%Y-%m-%d', 'now', '+9 hours')
);
