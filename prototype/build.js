const fs=require('fs');const r=f=>fs.readFileSync('src/'+f,'utf8');
const js=['logic.js','backend.js','aunty.js','llm.js','tests.js','ui-phone.js','ui-ledger.js','ui-dash.js'].map(r).join('\n');
// The code is inlined in one <script>. The text "</script" anywhere inside it (even in a string) ends the script early and the rest of the code shows up as page text.
{ const bad = js.match(/<\/script|<!--/i); if (bad) { const at = js.indexOf(bad[0]); const line = js.slice(0, at).split('\n').length; console.error('BUILD STOPPED: the code contains "' + bad[0] + '" (about line ' + line + ' of the joined code). Write it as two pieces, for example \'<\' + \'/script>\'.'); process.exit(1); } }
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hisaab Aunty prototype</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${r('style.css')}</style></head><body><div class="stage"><div class="phone-col"><div class="phone-wrap"><div class="phone" id="phone" data-theme="light"></div><div class="phone-note">Phone app on the left, developer dashboard on the right. Nothing leaves your browser.</div></div></div><div class="dash-col" id="dash"></div></div>
<script>${js}
buildDash(); bootPhone();
</script></body></html>`;
// the built page must have exactly one closing script tag (an opening "<script" inside a string is harmless)
if ((html.match(/<\/script>/gi) || []).length !== 1) { console.error('BUILD STOPPED: the page must contain exactly one closing script tag.'); process.exit(1); }
fs.writeFileSync('hisaab-aunty-prototype.html',html);console.log('built',html.length);
