const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('\n\x1b[1m\x1b[36m===================================================\x1b[0m');
console.log('\x1b[1m\x1b[35m  🏆 Starting QuizMaster Platform (Unified 3000) 🏆  \x1b[0m');
console.log('\x1b[1m\x1b[36m===================================================\x1b[0m\n');
console.log('  \x1b[32m✔\x1b[0m App URL      -> \x1b[4mhttp://0.0.0.0:3000\x1b[0m\n');
console.log('  \x1b[33mCredentials:\x1b[0m');
console.log('  - Admin   : Username \x1b[1madmin\x1b[0m  | Password \x1b[1mAdminPassword123!\x1b[0m');
console.log('  - Student : Username \x1b[1mstudent\x1b[0m (ID: \x1b[1mQM-DEMO1\x1b[0m) | Password \x1b[1mStudent12345!\x1b[0m\n');
console.log('---------------------------------------------------\n');

// 1. Ensure client build exists
const distIndex = path.resolve(__dirname, 'client/dist/index.html');
if (!fs.existsSync(distIndex)) {
  console.log('[build] Building client website for single-service hosting on port 3000...');
  try {
    execSync('npm --prefix client run build', { stdio: 'inherit', cwd: __dirname });
    console.log('[build] Client build complete.');
  } catch (err) {
    console.warn('[build] Warning during client build:', err.message);
  }
}

// 2. Start the unified server
process.env.PORT = process.env.PORT || '3000';
require('./server/src/server.js');
