const MILESTONE_DAYS = [7, 14, 21];

function countDistinctLogDays(logs) {
  const days = new Set();
  for (const log of logs || []) {
    days.add(new Date(log).toDateString());
  }
  return days.size;
}

function milestoneAchievementTitle(habitTitle, milestone) {
  return `Вы уже ${milestone} дней с привычкой «${habitTitle}»`;
}

async function ensureHabitMilestoneAchievements(db, userId, habit) {
  const dayCount = countDistinctLogDays(habit.logs);
  const created = [];

  for (const milestone of MILESTONE_DAYS) {
    if (dayCount < milestone) continue;

    const exists = await db.query(
      `SELECT id FROM achievements
       WHERE user_id = $1 AND habit_id = $2 AND milestone_day = $3 AND type = 'habit_milestone'`,
      [userId, habit.id, milestone]
    );
    if (exists.rows.length > 0) continue;

    const title = milestoneAchievementTitle(habit.title, milestone);
    const inserted = await db.query(
      `INSERT INTO achievements (user_id, title, type, habit_id, milestone_day)
       VALUES ($1, $2, 'habit_milestone', $3, $4)
       RETURNING id, title, type, completed_at, habit_id, milestone_day`,
      [userId, title, habit.id, milestone]
    );
    created.push(inserted.rows[0]);
  }

  return created;
}

async function syncAllHabitMilestonesForUser(db, userId, habits) {
  const allCreated = [];
  for (const habit of habits) {
    const created = await ensureHabitMilestoneAchievements(db, userId, habit);
    allCreated.push(...created);
  }
  return allCreated;
}

module.exports = {
  MILESTONE_DAYS,
  countDistinctLogDays,
  ensureHabitMilestoneAchievements,
  syncAllHabitMilestonesForUser,
};
