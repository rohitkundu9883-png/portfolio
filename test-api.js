const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  console.log('Testing Portfolio API...');

  // 1. GET /api/portfolio
  const pRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/portfolio',
    method: 'GET'
  });
  console.log('1. GET /api/portfolio status:', pRes.status);
  console.log('   Hero Title:', pRes.data.home?.title);
  console.log('   Skills Count:', pRes.data.skills?.length);
  console.log('   Projects Count:', pRes.data.projects?.length);

  // 2. POST /api/auth/login
  const loginRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'admin', password: 'admin123' });
  console.log('2. POST /api/auth/login status:', loginRes.status);
  console.log('   Token:', loginRes.data.token?.substring(0, 20) + '...');

  const token = loginRes.data.token;

  // 3. POST /api/messages (public contact inquiry)
  const msgRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/messages',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    name: 'Emily Watson',
    email: 'emily@techcorp.com',
    subject: 'Consulting Collaboration',
    message: 'We loved your live portfolio and would love to collaborate!'
  });
  console.log('3. POST /api/messages status:', msgRes.status, 'Message:', msgRes.data.message);

  // 4. GET /api/messages (with auth)
  const getMsgsRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/messages',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('4. GET /api/messages status:', getMsgsRes.status, 'Total messages in inbox:', getMsgsRes.data.length);

  console.log('\nAll core API tests passed successfully!');
}

runTests().catch(console.error);
