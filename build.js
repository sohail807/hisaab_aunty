const fs=require('fs');const r=f=>fs.readFileSync('src/'+f,'utf8');
const js=['logic.js','backend.js','aunty.js','llm.js','tests.js','ui-phone.js','ui-ledger.js','ui-dash.js'].map(r).join('\n');
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hisaab Aunty prototype</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${r('style.css')}</style></head><body><div class="stage"><div class="phone-col"><div class="phone-wrap"><div class="phone" id="phone" data-theme="light"></div><div class="phone-note">Phone app on the left, developer dashboard on the right. Nothing leaves your browser.</div></div></div><div class="dash-col" id="dash"></div></div>
<script>${js}
buildDash(); bootPhone();
</script></body></html>`;
fs.writeFileSync('hisaab-aunty-prototype.html',html);console.log('built',html.length);
