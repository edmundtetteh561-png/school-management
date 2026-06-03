const http = require('http');
const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD;
if (!adminPassword) {
  console.error('Set DEFAULT_ADMIN_PASSWORD before running login_check.');
  process.exit(1);
}
const data = JSON.stringify({ username: 'admin', password: adminPassword });
const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('STATUS:' + res.statusCode);
    console.log('BODY:' + body);
  });
});

req.on('error', (err) => {
  console.error('ERR:' + err.message);
});
req.write(data);
req.end();
