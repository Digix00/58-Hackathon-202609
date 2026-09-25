-- ローカル動作確認専用のサンプルデータ。
-- 本番D1へ適用しないこと。固定ID + INSERT OR IGNORE で再実行しても重複しない。

INSERT OR IGNORE INTO users (
  id,
  line_user_id,
  created_at,
  updated_at
) VALUES
  ('local-seed-user-01', 'local-seed-line-user-01', '2026-09-16T10:00:00.000Z', '2026-09-16T10:00:00.000Z'),
  ('local-seed-user-02', 'local-seed-line-user-02', '2026-09-19T17:30:00.000Z', '2026-09-19T17:30:00.000Z'),
  ('local-seed-user-03', 'local-seed-line-user-03', '2026-09-21T08:45:00.000Z', '2026-09-21T08:45:00.000Z'),
  ('local-seed-user-04', 'local-seed-line-user-04', '2026-09-22T11:30:00.000Z', '2026-09-22T11:30:00.000Z'),
  ('local-seed-user-05', 'local-seed-line-user-05', '2026-09-23T18:15:00.000Z', '2026-09-23T18:15:00.000Z'),
  ('local-seed-user-06', 'local-seed-line-user-06', '2026-09-24T07:20:00.000Z', '2026-09-24T07:20:00.000Z');

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
) VALUES
  (
    'local-seed-concern-01',
    'local-seed-user-01',
    '朝の会議が続くと、昼休みに落ち着いて食事をする時間が足りません。',
    '20s',
    'female',
    'osaka',
    'published',
    'pending',
    '2026-09-16T10:15:00.000Z',
    '2026-09-16T10:15:00.000Z'
  ),
  (
    'local-seed-concern-02',
    'local-seed-user-02',
    '駅から家までの道に街灯が少なく、帰り道が少し不安です。',
    '40s',
    'male',
    'hyogo',
    'published',
    'pending',
    '2026-09-19T17:45:00.000Z',
    '2026-09-19T17:45:00.000Z'
  ),
  (
    'local-seed-concern-03',
    'local-seed-user-03',
    '病院の予約方法が複数に分かれていて、どこから申し込むか迷います。',
    NULL,
    'no_answer',
    'tokyo',
    'published',
    'pending',
    '2026-09-21T09:00:00.000Z',
    '2026-09-21T09:00:00.000Z'
  ),
  (
    'local-seed-concern-04',
    'local-seed-user-04',
    '図書館の自習席が埋まっていることが多く、静かに勉強できる場所がほしいです。',
    '30s',
    'non_binary',
    'kyoto',
    'published',
    'pending',
    '2026-09-22T12:00:00.000Z',
    '2026-09-22T12:00:00.000Z'
  ),
  (
    'local-seed-concern-05',
    'local-seed-user-05',
    '地域のイベント情報がそれぞれ別の場所にあり、予定を探しにくいです。',
    '50s',
    'other',
    'fukuoka',
    'published',
    'pending',
    '2026-09-23T18:30:00.000Z',
    '2026-09-23T18:30:00.000Z'
  ),
  (
    'local-seed-concern-06',
    'local-seed-user-06',
    '雨の日にバス停で待つ場所が狭く、傘を差したまま並ぶことになります。',
    'no_answer',
    'no_answer',
    'hokkaido',
    'published',
    'pending',
    '2026-09-24T07:30:00.000Z',
    '2026-09-24T07:30:00.000Z'
  );
