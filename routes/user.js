const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

// @route   GET /api/user/points
// @desc    Get user's reward points
router.get('/points', auth, async (req, res) => {
  try {
    const user = await db.query('SELECT reward_points FROM users WHERE id = $1', [req.user.id]);
    if (user.rows.length === 0) {
      return res.status(404).json({ msg: 'User not found' });
    }
    res.json({ points: user.rows[0].reward_points });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/user/me
// @desc    Get current user's data
router.get('/me', auth, async (req, res) => {
    try {
      const user = await db.query('SELECT id, username FROM users WHERE id = $1', [req.user.id]);
      if (user.rows.length === 0) {
        return res.status(404).json({ msg: 'User not found' });
      }
      res.json(user.rows[0]);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  });

module.exports = router;
