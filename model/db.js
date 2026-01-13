const { Pool } = require('pg');
require('dotenv').config();

const isDev = process.env.NODE_ENV === 'development';

const connectionString = isDev
  ? process.env.LOCAL_DATABASE_URL
  : process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  ssl: isDev ? false : { rejectUnauthorized: false },
});

module.exports = pool;