'use strict';

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'mariadb',
  port:               Number(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD,
  database:           process.env.DB_NAME     || 'lunch',
  waitForConnections: true,
  connectionLimit:    10,
  namedPlaceholders:  true,
});

module.exports = pool;
