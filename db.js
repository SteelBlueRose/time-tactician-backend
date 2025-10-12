const { Pool, types } = require('pg');

// Parse TIMESTAMP and TIMESTAMPTZ as dates
types.setTypeParser(1114, (stringValue) => {
  return new Date(stringValue + 'Z');
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
};
