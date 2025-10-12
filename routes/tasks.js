const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

// @route   GET /api/tasks
// @desc    Get all tasks for a user, with optional status filtering
router.get('/', auth, async (req, res) => {
  const { status } = req.query;
  let whereClause = 'WHERE t.user_id = $1';
  const params = [req.user.id];

  if (status) {
    if (status === 'completed') {
      whereClause += ' AND t.state = $2';
      params.push('Completed');
    } else if (status === 'incomplete') {
      whereClause += ' AND t.state != $2';
      params.push('Completed');
    }
  }

  const query = `
    SELECT 
      t.id, t.user_id, t.title, t.description, t.priority, t.deadline, 
      t.estimated_time, t.parent_task_id, t.created_at, t.updated_at, t.state, t.reward_points,
      COALESCE(json_agg(ts.*) FILTER (WHERE ts.id IS NOT NULL), '[]') as time_slots
    FROM tasks t
    LEFT JOIN time_slots ts ON t.id = ts.task_id
    ${whereClause}
    GROUP BY t.id
  `;

  try {
    const tasks = await db.query(query, params);
    res.json(tasks.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/tasks
// @desc    Add a new task
router.post('/', auth, async (req, res) => {
  const { title, description, priority, deadline, estimated_time } = req.body;
  try {
    const newTask = await db.query(
      'INSERT INTO tasks (user_id, title, description, priority, deadline, estimated_time) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.user.id, title, description, priority, deadline, estimated_time]
    );
    res.json(newTask.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/tasks/:id
// @desc    Update a task
router.put('/:id', auth, async (req, res) => {
  const { title, description, priority, deadline, estimated_time, state, time_slots } = req.body;
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const updatedTask = await client.query(
      'UPDATE tasks SET title = $1, description = $2, priority = $3, deadline = $4, estimated_time = $5, state = $6, updated_at = CURRENT_TIMESTAMP WHERE id = $7 AND user_id = $8 RETURNING *',
      [title, description, priority, deadline, estimated_time, state, req.params.id, req.user.id]
    );

    if (updatedTask.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ msg: 'Task not found or user not authorized' });
    }

    if (time_slots && Array.isArray(time_slots)) {
      await client.query('DELETE FROM time_slots WHERE task_id = $1 AND user_id = $2', [req.params.id, req.user.id]);

      for (const slot of time_slots) {
        await client.query(
          'INSERT INTO time_slots (user_id, task_id, start_time, end_time, slot_type) VALUES ($1, $2, $3, $4, $5)',
          [req.user.id, req.params.id, slot.start_time, slot.end_time, 'WorkingHours']
        );
      }
    }

    await client.query('COMMIT');
    // Re-fetch the task with its aggregated time slots to return the updated data
    const result = await db.query(
      `SELECT t.*, COALESCE(json_agg(ts.*) FILTER (WHERE ts.id IS NOT NULL), '[]') as time_slots
       FROM tasks t
       LEFT JOIN time_slots ts ON t.id = ts.task_id
       WHERE t.id = $1 AND t.user_id = $2
       GROUP BY t.id`,
      [req.params.id, req.user.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err.message);
    res.status(500).send('Server Error');
  } finally {
    client.release();
  }
});

// @route   PUT /api/tasks/schedule
// @desc    Update the schedule for multiple tasks
router.put('/schedule', auth, async (req, res) => {
  const { tasks } = req.body; // Expect an array of tasks with time_slots
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    for (const task of tasks) {
      // Clear existing time slots for the task
      await client.query('DELETE FROM time_slots WHERE task_id = $1 AND user_id = $2', [task.id, req.user.id]);

      // Insert new time slots
      if (task.time_slots && task.time_slots.length > 0) {
        for (const slot of task.time_slots) {
          await client.query(
            'INSERT INTO time_slots (user_id, task_id, start_time, end_time, slot_type) VALUES ($1, $2, $3, $4, $5)',
            [req.user.id, task.id, slot.start_time, slot.end_time, 'WorkingHours'] // Assuming scheduled tasks are 'WorkingHours'
          );
        }
      }
    }

    await client.query('COMMIT');
    res.json({ msg: 'Schedule updated successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err.message);
    res.status(500).send('Server Error');
  } finally {
    client.release();
  }
});


// @route   POST /api/tasks/:id/start
// @desc    Start a task
router.post('/:id/start', auth, async (req, res) => {
  try {
    const updatedTask = await db.query(
      "UPDATE tasks SET state = 'InProgress', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 RETURNING *",
      [req.params.id, req.user.id]
    );

    if (updatedTask.rows.length === 0) {
      return res.status(404).json({ msg: 'Task not found or user not authorized' });
    }

    res.json(updatedTask.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/tasks/:id/complete
// @desc    Complete a task
router.post('/:id/complete', auth, async (req, res) => {
  try {
    const updatedTask = await db.query(
      "UPDATE tasks SET state = 'Completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 RETURNING *",
      [req.params.id, req.user.id]
    );

    if (updatedTask.rows.length === 0) {
      return res.status(404).json({ msg: 'Task not found or user not authorized' });
    }

    res.json(updatedTask.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE /api/tasks/:id
// @desc    Delete a task
router.delete('/:id', auth, async (req, res) => {
    try {
      const deleteTask = await db.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING *', [
        req.params.id,
        req.user.id,
      ]);
  
      if (deleteTask.rows.length === 0) {
        return res.status(404).json({ msg: 'Task not found or user not authorized' });
      }
  
      res.json({ msg: 'Task removed' });
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  });

module.exports = router;
