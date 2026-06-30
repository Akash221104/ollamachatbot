const http = require('http');

const payload = JSON.stringify({
  apiKey: "ORG_DLTX831QKRBKB1V3",
  userId: "101",
  userName: "akash",
  message: "what is cdac"
});

console.log('Sending request to Next.js API...');

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/widget/chat',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'Content-Length': Buffer.byteLength(payload)
  }
}, (res) => {
  console.log('STATUS:', res.statusCode);
  console.log('HEADERS:', res.headers);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    console.log('BODY CHUNK:', chunk);
  });
  res.on('end', () => {
    console.log('No more data in response.');
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

// write data to request body
req.write(payload);
req.end();
