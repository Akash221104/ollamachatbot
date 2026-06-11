const http = require('http');

const url = 'http://10.210.8.100:51434/api/tags';

console.log('Testing connection to:', url);

const req = http.get(url, (res) => {
  console.log('Status code:', res.statusCode);
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('Response:', data);
  });
});

req.on('error', (err) => {
  console.error('Error occurred:', err);
});
