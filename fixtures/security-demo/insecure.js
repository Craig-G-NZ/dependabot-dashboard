/**
 * Intentional insecure patterns for CodeQL / code-scanning demos.
 * Not used by the production Worker.
 */

const express = require('express');
const app = express();

// js/clear-text-storage-sensitive-data — stores password in a cookie in clear text
app.get('/login', function (req, res) {
  const password = req.query.password;
  res.cookie('password', password);
  res.send('ok');
});

// js/eval-injection — eval of request input
app.get('/run', function (req, res) {
  const code = req.query.code;
  eval(code);
  res.send('ran');
});

// js/sql-injection — string-concatenated SQL
app.get('/user', function (req, res) {
  const id = req.query.id;
  const query = "SELECT * FROM users WHERE id = '" + id + "'";
  res.send(query);
});

module.exports = app;
