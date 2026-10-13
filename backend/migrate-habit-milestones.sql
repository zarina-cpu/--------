-- Вехи привычек в достижениях (7 / 14 / 21 дней отметок)
ALTER TABLE achievements DROP CONSTRAINT IF EXISTS achievements_type_check;
ALTER TABLE achievements ADD CONSTRAINT achievements_type_check
  CHECK (type IN ('habit_archive', 'manual_achievement', 'habit_milestone'));

ALTER TABLE achievements ADD COLUMN IF NOT EXISTS habit_id INT REFERENCES habits(id) ON DELETE SET NULL;
ALTER TABLE achievements ADD COLUMN IF NOT EXISTS milestone_day INT;

CREATE UNIQUE INDEX IF NOT EXISTS achievements_habit_milestone_uidx
  ON achievements (user_id, habit_id, milestone_day)
  WHERE type = 'habit_milestone' AND habit_id IS NOT NULL AND milestone_day IS NOT NULL;
