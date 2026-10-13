require('http').createServer((q,s)=>{s.setHeader('content-type','text/html;charset=utf-8');s.end(require('fs').readFileSync('hisaab-aunty-prototype.html'))}).listen(5177,()=>console.log('up'));
