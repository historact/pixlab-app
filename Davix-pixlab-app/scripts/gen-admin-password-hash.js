#!/usr/bin/env node
const bcrypt = require('bcrypt');

const input = process.argv[2];
const cost = 12;

if (!input) {
  console.error('Usage: node scripts/gen-admin-password-hash.js "YourPassword"');
  console.error('Recommended bcrypt cost: 10-12 (default 12).');
  process.exit(1);
}

bcrypt.hash(input, cost)
  .then(hash => {
    console.log(hash);
  })
  .catch(err => {
    console.error('Failed to generate bcrypt hash:', err.message);
    process.exit(1);
  });
