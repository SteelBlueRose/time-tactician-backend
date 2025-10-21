const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

// @route   GET /api/time-slots
// @desc    Get all time slots for a user
router.get('/', auth, async (req, res) => {
  try {
    const timeSlots = await db.query(`
      SELECT 
        ts.*, 
        CASE 
          WHEN rp.id IS NOT NULL THEN json_build_object(
            'frequency', rp.frequency, 
            'interval', rp.interval, 
            'specific_days', rp.specific_days
          ) 
          ELSE NULL 
        END as recurrence
      FROM time_slots ts 
      LEFT JOIN recurrence_patterns rp ON ts.recurrence_id = rp.id 
      WHERE ts.user_id = $1`, 
      [req.user.id]
    );
    res.json(timeSlots.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/time-slots
// @desc    Add a new time slot
router.post('/', auth, async (req, res) => {
  const { start_minutes, end_minutes, slot_type, recurrence } = req.body;
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    let recurrenceId = null;
    if (recurrence && recurrence.frequency) {
      const { frequency, interval, specific_days } = recurrence;
      const newRecurrence = await client.query(
        'INSERT INTO recurrence_patterns (frequency, interval, specific_days) VALUES ($1, $2, $3) RETURNING id',
        [frequency, interval, specific_days]
      );
      recurrenceId = newRecurrence.rows[0].id;
    }

    const newTimeSlot = await client.query(
      'INSERT INTO time_slots (user_id, start_minutes, end_minutes, slot_type, recurrence_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.user.id, start_minutes, end_minutes, slot_type, recurrenceId]
    );

    await client.query('COMMIT');
    res.json(newTimeSlot.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err.message);
    res.status(500).send('Server Error');
  } finally {
    client.release();
  }
});

// @route   PUT /api/time-slots/:id
// @desc    Update a time slot
router.put('/:id', auth, async (req, res) => {
  const { start_minutes, end_minutes, slot_type, recurrence } = req.body;
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const existingTimeSlotResult = await client.query('SELECT recurrence_id FROM time_slots WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);

    if (existingTimeSlotResult.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ msg: 'Time slot not found or user not authorized' });
    }

    let recurrenceId = existingTimeSlotResult.rows[0].recurrence_id;

    if (recurrence && recurrence.frequency) {
      const { frequency, interval, specific_days } = recurrence;
      if (recurrenceId) {
        await client.query(
          'UPDATE recurrence_patterns SET frequency = $1, interval = $2, specific_days = $3 WHERE id = $4',
          [frequency, interval, specific_days, recurrenceId]
        );
      } else {
        const newRecurrence = await client.query(
          'INSERT INTO recurrence_patterns (frequency, interval, specific_days) VALUES ($1, $2, $3) RETURNING id',
          [frequency, interval, specific_days]
        );
        recurrenceId = newRecurrence.rows[0].id;
      }
    } else if (recurrenceId) {
      recurrenceId = null;
    }

    const updatedTimeSlot = await client.query(
      'UPDATE time_slots SET start_minutes = $1, end_minutes = $2, slot_type = $3, recurrence_id = $4 WHERE id = $5 AND user_id = $6 RETURNING *',
      [start_minutes, end_minutes, slot_type, recurrenceId, req.params.id, req.user.id]
    );

    await client.query('COMMIT');
    res.json(updatedTimeSlot.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err.message);
    res.status(500).send('Server Error');
  } finally {
    client.release();
  }
});

// @route   DELETE /api/time-slots/:id
// @desc    Delete a time slot
router.delete('/:id', auth, async (req, res) => {
    try {
      const deleteTimeSlot = await db.query('DELETE FROM time_slots WHERE id = $1 AND user_id = $2 RETURNING *', [
        req.params.id,
        req.user.id,
      ]);
  
      if (deleteTimeSlot.rows.length === 0) {
        return res.status(404).json({ msg: 'Time slot not found or user not authorized' });
      }
  
      res.json({ msg: 'Time slot removed' });
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  });

module.exports = router;
