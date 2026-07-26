export const selectPreyResourcesQuery = `SELECT wildcards, task_points
       FROM character_prey_resources
       WHERE character_id = $1`;
