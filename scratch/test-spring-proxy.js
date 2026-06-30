const http = require('http');

console.log('1. Logging in to Spring Boot...');

const loginData = 'username=akash&password=password123';

const loginReq = http.request({
  hostname: 'localhost',
  port: 8080,
  path: '/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(loginData)
  }
}, (res) => {
  console.log('Login Status:', res.statusCode);
  console.log('Login Headers:', res.headers);
  
  const cookies = res.headers['set-cookie'];
  if (!cookies || cookies.length === 0) {
    console.error('No session cookie returned! Login failed.');
    return;
  }
  
  const sessionCookie = cookies[0].split(';')[0];
  console.log('Obtained Cookie:', sessionCookie);
  
  console.log('2. Sending Chat request via Spring Boot Proxy...');
  const chatPayload = JSON.stringify({ message: 'what is cdac' });
  
  const chatReq = http.request({
    hostname: 'localhost',
    port: 8080,
    path: '/api/widget/chat',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Cookie': sessionCookie,
      'Content-Length': Buffer.byteLength(chatPayload)
    }
  }, (chatRes) => {
    console.log('Chat Status:', chatRes.statusCode);
    console.log('Chat Headers:', chatRes.headers);
    chatRes.setEncoding('utf8');
    chatRes.on('data', (chunk) => {
      console.log('STREAM CHUNK RECEIVED:', chunk);
    });
    chatRes.on('end', () => {
      console.log('Stream ended.');
    });
  });
  
  chatReq.on('error', (err) => {
    console.error('Chat request failed:', err);
  });
  
  chatReq.write(chatPayload);
  chatReq.end();
});

loginReq.on('error', (err) => {
  console.error('Login request failed:', err);
});

loginReq.write(loginData);
loginReq.end();
