require('dotenv').config({ debug: true });
const express = require('express');
const app = express();
const port = process.env.PORT || 3001;
const cors = require('cors');

const whitelist = ['http://localhost:3000', process.env.FRONTEND_URL];
const corsOptions = {
  origin: function (origin, callback) {
    if (whitelist.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};
app.use(cors(corsOptions));

// Init Middleware
app.use(express.json({ extended: false }));

// Define Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/rewards', require('./routes/rewards'));
app.use('/api/time-slots', require('./routes/time-slots'));
app.use('/api/user', require('./routes/user'));

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
