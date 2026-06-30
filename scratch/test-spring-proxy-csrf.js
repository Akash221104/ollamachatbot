const http = require('http');

console.log('1. Getting login page to extract CSRF token...');

const getReq = http.get('http://localhost:8080/login', (res) => {
  let html = '';
  res.on('data', (chunk) => html += chunk);
  res.on('end', () => {
    // Extract CSRF token from the form
    const csrfMatch = html.match(/name="_csrf"\s+value="([^"]+)"/);
    if (!csrfMatch) {
      console.error('Could not find CSRF token in HTML!');
      return;
    }
    const csrfToken = csrfMatch[1];
    console.log('CSRF Token:', csrfToken);

    const cookies = res.headers['set-cookie'];
    const sessionCookie = cookies ? cookies[0].split(';')[0] : '';
    console.log('Initial Cookie:', sessionCookie);

    console.log('2. Authenticating...');
    const loginData = `username=akash&password=password123&_csrf=${csrfToken}`;

    const loginReq = http.request({
      hostname: 'localhost',
      port: 8080,
      path: '/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': sessionCookie,
        'Content-Length': Buffer.byteLength(loginData)
      }
    }, (loginRes) => {
      console.log('Login Status:', loginRes.statusCode);
      
      const loginCookies = loginRes.headers['set-cookie'];
      const authCookie = loginCookies ? loginCookies[0].split(';')[0] : sessionCookie;
      console.log('Auth Cookie:', authCookie);

      console.log('3. Sending Chat request...');
      const chatPayload = JSON.stringify({ message: 'what is cdac' });

      const chatReq = http.request({
        hostname: 'localhost',
        port: 8080,
        path: '/api/widget/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'Cookie': authCookie,
          'Content-Length': Buffer.byteLength(chatPayload)
        }
      }, (chatRes) => {
        console.log('Chat Status:', chatRes.statusCode);
        console.log('Chat Headers:', chatRes.headers);
        chatRes.setEncoding('utf8');
        chatRes.on('data', (chunk) => {
          console.log('CHUNK:', chunk);
        });
        chatRes.on('end', () => {
          console.log('Stream ended.');
        });
      });

      chatReq.on('error', (err) => {
        console.error('Chat error:', err);
      });

      chatReq.write(chatPayload);
      chatReq.end();
    });

    loginReq.write(loginData);
    loginReq.end();
  });
});
