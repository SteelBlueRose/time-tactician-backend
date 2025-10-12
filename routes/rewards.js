const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

// @route   GET /api/rewards
// @desc    Get all rewards for a user
// Support filtering by status (active/completed)
router.get('/', auth, async (req, res) => {
  try {
    let query = 'SELECT * FROM rewards WHERE user_id = $1';
    let params = [req.user.id];

    if (req.query.status) {
      if (req.query.status === 'active') {
        query += ' AND state = $2';
        params.push('Active');
      } else if (req.query.status === 'retrieved' || req.query.status === 'completed') {
        query += ' AND state = $2';
        params.push('Completed');
      }
    }

    const rewards = await db.query(query, params);
    res.json(rewards.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/rewards
// @desc    Add a new reward
router.post('/', auth, async (req, res) => {
  const { title, description, cost } = req.body;
  try {
    const newReward = await db.query(
      'INSERT INTO rewards (user_id, title, description, cost) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.id, title, description, cost]
    );
    res.json(newReward.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/rewards/:id
// @desc    Update a reward
router.put('/:id', auth, async (req, res) => {
    const { title, description, cost, state } = req.body;
    try {
      const updatedReward = await db.query(
        'UPDATE rewards SET title = $1, description = $2, cost = $3, state = $4 WHERE id = $5 AND user_id = $6 RETURNING *',
        [title, description, cost, state, req.params.id, req.user.id]
      );
  
      if (updatedReward.rows.length === 0) {
        return res.status(404).json({ msg: 'Reward not found or user not authorized' });
      }
  
      res.json(updatedReward.rows[0]);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  });

// @route   DELETE /api/rewards/:id
// @desc    Delete a reward
router.delete('/:id', auth, async (req, res) => {
    try {
      const deleteReward = await db.query('DELETE FROM rewards WHERE id = $1 AND user_id = $2 RETURNING *', [
        req.params.id,
        req.user.id,
      ]);
  
      if (deleteReward.rows.length === 0) {
        return res.status(404).json({ msg: 'Reward not found or user not authorized' });
      }
  
      res.json({ msg: 'Reward removed' });
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  });

module.exports = router;
