const { Pool, types } = require('pg');
const config = require('./migration-config');

// Parse TIMESTAMP and TIMESTAMPTZ as dates
types.setTypeParser(1114, (stringValue) => {
  return new Date(stringValue + 'Z');
});

const pool = new Pool({
  connectionString: config.databaseUrl,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
};
