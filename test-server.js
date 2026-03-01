// Simple server test script
const http = require('http');

function testServer() {
    const options = {
        hostname: 'localhost',
        port: 10000,
        path: '/api/health',
        method: 'GET',
        timeout: 5000
    };

    const req = http.request(options, (res) => {
        console.log(`✅ Server is running - Status: ${res.statusCode}`);
        let data = '';
        res.on('data', (chunk) => {
            data += chunk;
        });
        res.on('end', () => {
            console.log('Response:', data);
        });
    });

    req.on('error', (err) => {
        console.error('❌ Server connection failed:', err.message);
        console.log('💡 Make sure to start the server with: cd backend && npm start');
    });

    req.on('timeout', () => {
        console.error('❌ Server request timeout');
        req.destroy();
    });

    req.end();
}

console.log('🔍 Testing server connection...');
testServer();