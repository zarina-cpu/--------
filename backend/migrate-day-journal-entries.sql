ALTER TABLE day_journals ADD COLUMN IF NOT EXISTS stress_entries JSONB NOT NULL DEFAULT '[]';
ALTER TABLE day_journals ADD COLUMN IF NOT EXISTS lesson_entries JSONB NOT NULL DEFAULT '[]';
ALTER TABLE day_journals ADD COLUMN IF NOT EXISTS note_entries JSONB NOT NULL DEFAULT '[]';

UPDATE day_journals
SET stress_entries = jsonb_build_array(
  jsonb_build_object('id', 'legacy-stress', 'text', stress_text, 'created_at', updated_at)
)
WHERE coalesce(stress_text, '') <> '' AND stress_entries = '[]'::jsonb;

UPDATE day_journals
SET lesson_entries = jsonb_build_array(
  jsonb_build_object('id', 'legacy-lesson', 'text', lesson_text, 'created_at', updated_at)
)
WHERE coalesce(lesson_text, '') <> '' AND lesson_entries = '[]'::jsonb;

UPDATE day_journals
SET note_entries = jsonb_build_array(
  jsonb_build_object('id', 'legacy-note', 'text', note_text, 'created_at', updated_at)
)
WHERE coalesce(note_text, '') <> '' AND note_entries = '[]'::jsonb;
