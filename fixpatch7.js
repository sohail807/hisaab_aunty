const fs = require('fs'); let p = fs.readFileSync('patch7.js', 'utf8');
const i = p.indexOf('rep("if (extra.length)');
if (i < 0) throw new Error('not found');
p = p.slice(0, i) + `rep("if (extra.length) text += '\\\\n\\\\n' + extra.join(' ');", "if (extra.length) text += (fume ? ' ' : '\\\\n\\\\n') + extra.join(' ');");
fs.writeFileSync('src/aunty.js', a); console.log('aunty patched');
`;
fs.writeFileSync('patch7.js', p);
