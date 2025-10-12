const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

// @route   GET /api/time-slots
// @desc    Get all time slots for a user
router.get('/', auth, async (req, res) => {
  try {
    const timeSlots = await db.query('SELECT * FROM time_slots WHERE user_id = $1', [req.user.id]);
    res.json(timeSlots.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/time-slots
// @desc    Add a new time slot
router.post('/', auth, async (req, res) => {
  const { start_minutes, end_minutes, slot_type, recurrence_id } = req.body;
  try {
    const newTimeSlot = await db.query(
      'INSERT INTO time_slots (user_id, start_minutes, end_minutes, slot_type, recurrence_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.user.id, start_minutes, end_minutes, slot_type, recurrence_id]
    );
    res.json(newTimeSlot.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/time-slots/:id
// @desc    Update a time slot
router.put('/:id', auth, async (req, res) => {
    const { start_minutes, end_minutes, slot_type, recurrence_id } = req.body;
    try {
      const updatedTimeSlot = await db.query(
        'UPDATE time_slots SET start_minutes = $1, end_minutes = $2, slot_type = $3, recurrence_id = $4 WHERE id = $5 AND user_id = $6 RETURNING *',
        [start_minutes, end_minutes, slot_type, recurrence_id, req.params.id, req.user.id]
      );
  
      if (updatedTimeSlot.rows.length === 0) {
        return res.status(404).json({ msg: 'Time slot not found or user not authorized' });
      }
  
      res.json(updatedTimeSlot.rows[0]);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
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
