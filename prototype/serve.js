// Serves the single-file prototype on http://localhost:5177. Always reads the file next to this script, so a rebuild shows up on refresh.
const http = require('http'), fs = require('fs'), path = require('path');
const FILE = path.join(__dirname, 'hisaab-aunty-prototype.html');
http.createServer((q, s) => { s.setHeader('content-type', 'text/html;charset=utf-8'); s.setHeader('cache-control', 'no-store'); s.end(fs.readFileSync(FILE)); })
  .listen(5177, '127.0.0.1', () => console.log('Prototype on http://localhost:5177 (serving ' + FILE + ')'));
