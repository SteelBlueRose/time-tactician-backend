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
      COALESCE(json_agg(DISTINCT ts.*) FILTER (WHERE ts.id IS NOT NULL), '[]') as time_slots,
      COALESCE(json_agg(DISTINCT sub.id) FILTER (WHERE sub.id IS NOT NULL), '[]') as subtask_ids,
      CASE 
        WHEN rp.id IS NOT NULL THEN json_build_object(
          'frequency', rp.frequency, 
          'interval', rp.interval, 
          'specific_days', rp.specific_days
        ) 
        ELSE NULL 
      END as recurrence
    FROM tasks t
    LEFT JOIN time_slots ts ON t.id = ts.task_id
    LEFT JOIN tasks sub ON t.id = sub.parent_task_id
    LEFT JOIN habits h ON t.id = h.task_id
    LEFT JOIN recurrence_patterns rp ON h.recurrence_id = rp.id
    ${whereClause}
    GROUP BY t.id, rp.id
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
  const { title, description, priority, deadline, estimated_time, reward_points, time_slots, parent_task_id, recurrence } = req.body;
  let finalDeadline = deadline;
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    if (parent_task_id && !deadline) {
      const parentTask = await client.query('SELECT deadline FROM tasks WHERE id = $1 AND user_id = $2', [parent_task_id, req.user.id]);
      if (parentTask.rows.length > 0) {
        finalDeadline = parentTask.rows[0].deadline;
      }
    }

    const newTaskResult = await client.query(
      'INSERT INTO tasks (user_id, title, description, priority, deadline, estimated_time, reward_points, parent_task_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [req.user.id, title, description, priority, finalDeadline, estimated_time, reward_points, parent_task_id]
    );
    const newTask = newTaskResult.rows[0];

    if (time_slots && Array.isArray(time_slots)) {
      for (const slot of time_slots) {
        await client.query(
          'INSERT INTO task_time_slots (task_id, start_time, end_time) VALUES ($1, $2, $3)',
          [newTask.id, slot.start_time, slot.end_time]
        );
      }
    }

    if (recurrence && recurrence.frequency) {
      const { frequency, interval, specific_days } = recurrence;
      const newRecurrence = await client.query(
        'INSERT INTO recurrence_patterns (frequency, interval, specific_days) VALUES ($1, $2, $3) RETURNING id',
        [frequency, interval, specific_days]
      );
      const recurrenceId = newRecurrence.rows[0].id;

      await client.query(
        'INSERT INTO habits (user_id, task_id, recurrence_id) VALUES ($1, $2, $3)',
        [req.user.id, newTask.id, recurrenceId]
      );
    }

    await client.query('COMMIT');
    
    const result = await db.query(
      `SELECT t.*, 
              COALESCE(json_agg(ts.*) FILTER (WHERE ts.id IS NOT NULL), '[]') as time_slots,
              rp.frequency, rp.interval, rp.specific_days
       FROM tasks t
       LEFT JOIN task_time_slots ts ON t.id = ts.task_id
       LEFT JOIN habits h ON t.id = h.task_id
       LEFT JOIN recurrence_patterns rp ON h.recurrence_id = rp.id
       WHERE t.id = $1 AND t.user_id = $2
       GROUP BY t.id, rp.frequency, rp.interval, rp.specific_days`,
      [newTask.id, req.user.id]
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
      await client.query('DELETE FROM task_time_slots WHERE task_id = $1', [task.id]);

      // Insert new time slots
      if (task.time_slots && task.time_slots.length > 0) {
        for (const slot of task.time_slots) {
          await client.query(
            'INSERT INTO task_time_slots (task_id, start_time, end_time) VALUES ($1, $2, $3)',
            [task.id, slot.start_time, slot.end_time]
          );
        }
      }

      // Update task state based on whether it has time slots
      const hasTimeSlots = task.time_slots && task.time_slots.length > 0;
      const newState = hasTimeSlots ? 'Scheduled' : 'Created';
      await client.query(
        'UPDATE tasks SET state = $1 WHERE id = $2 AND user_id = $3',
        [newState, task.id, req.user.id]
      );
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

// @route   PUT /api/tasks/:id
// @desc    Update a task
router.put('/:id', auth, async (req, res) => {
  const { title, description, priority, deadline, estimated_time, reward_points, state, time_slots, recurrence } = req.body;
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const updatedTaskResult = await client.query(
      'UPDATE tasks SET title = $1, description = $2, priority = $3, deadline = $4, estimated_time = $5, reward_points = $6, state = $7, updated_at = CURRENT_TIMESTAMP WHERE id = $8 AND user_id = $9 RETURNING *',
      [title, description, priority, deadline, estimated_time, reward_points, state, req.params.id, req.user.id]
    );

    if (updatedTaskResult.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ msg: 'Task not found or user not authorized' });
    }

    if (time_slots && Array.isArray(time_slots)) {
      await client.query('DELETE FROM task_time_slots WHERE task_id = $1', [req.params.id]);
      for (const slot of time_slots) {
        await client.query(
          'INSERT INTO task_time_slots (task_id, start_time, end_time) VALUES ($1, $2, $3)',
          [req.params.id, slot.start_time, slot.end_time]
        );
      }
    }

    const habitResult = await client.query('SELECT * FROM habits WHERE task_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    const existingHabit = habitResult.rows[0];

    if (recurrence && recurrence.frequency) {
      const { frequency, interval, specific_days } = recurrence;
      if (existingHabit) {
        await client.query(
          'UPDATE recurrence_patterns SET frequency = $1, interval = $2, specific_days = $3 WHERE id = $4',
          [frequency, interval, specific_days, existingHabit.recurrence_id]
        );
      } else {
        const newRecurrence = await client.query(
          'INSERT INTO recurrence_patterns (frequency, interval, specific_days) VALUES ($1, $2, $3) RETURNING id',
          [frequency, interval, specific_days]
        );
        const recurrenceId = newRecurrence.rows[0].id;
        await client.query(
          'INSERT INTO habits (user_id, task_id, recurrence_id) VALUES ($1, $2, $3)',
          [req.user.id, req.params.id, recurrenceId]
        );
      }
    } else if (existingHabit) {
      await client.query('DELETE FROM habits WHERE id = $1', [existingHabit.id]);
      await client.query('DELETE FROM recurrence_patterns WHERE id = $1', [existingHabit.recurrence_id]);
    }

    await client.query('COMMIT');
    
    const result = await db.query(
      `SELECT t.*, 
              COALESCE(json_agg(ts.*) FILTER (WHERE ts.id IS NOT NULL), '[]') as time_slots,
              rp.frequency, rp.interval, rp.specific_days
       FROM tasks t
       LEFT JOIN task_time_slots ts ON t.id = ts.task_id
       LEFT JOIN habits h ON t.id = h.task_id
       LEFT JOIN recurrence_patterns rp ON h.recurrence_id = rp.id
       WHERE t.id = $1 AND t.user_id = $2
       GROUP BY t.id, rp.frequency, rp.interval, rp.specific_days`,
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
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Get the task's reward points
    const taskResult = await client.query('SELECT reward_points FROM tasks WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);

    if (taskResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ msg: 'Task not found or user not authorized' });
    }

    const { reward_points } = taskResult.rows[0];

    // Update the user's reward points
    await client.query('UPDATE users SET reward_points = reward_points + $1 WHERE id = $2', [
      reward_points,
      req.user.id,
    ]);

    // Update the task's state to 'Completed'
    const updatedTask = await client.query(
      "UPDATE tasks SET state = 'Completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 RETURNING *",
      [req.params.id, req.user.id]
    );

    await client.query('COMMIT');
    res.json(updatedTask.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err.message);
    res.status(500).send('Server Error');
  } finally {
    client.release();
  }
});

// @route   DELETE /api/tasks/:id
// @desc    Delete a task
router.delete('/:id', auth, async (req, res) => {
  const client = await db.getClient();

  const deleteTaskWithSubtasks = async (taskId, client) => {
    // Find subtasks
    const subtasks = await client.query('SELECT id FROM tasks WHERE parent_task_id = $1 AND user_id = $2', [
      taskId,
      req.user.id,
    ]);

    // Recursively delete subtasks
    for (const subtask of subtasks.rows) {
      await deleteTaskWithSubtasks(subtask.id, client);
    }

    // Delete the task itself
    const deleteTask = await client.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING *', [
      taskId,
      req.user.id,
    ]);

    return deleteTask;
  };

  try {
    await client.query('BEGIN');

    const deleteTask = await deleteTaskWithSubtasks(req.params.id, client);

    if (deleteTask.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ msg: 'Task not found or user not authorized' });
    }

    await client.query('COMMIT');
    res.json({ msg: 'Task and all its subtasks removed' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err.message);
    res.status(500).send('Server Error');
  } finally {
    client.release();
  }
});

module.exports = router;