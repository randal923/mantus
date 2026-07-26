export const creditTaskPointsQuery = `UPDATE character_prey_resources
       SET task_points = task_points + $2
       WHERE character_id = $1
       RETURNING task_points`;
