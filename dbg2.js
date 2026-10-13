const vm=require('vm'),fs=require('fs');
vm.runInThisContext(['logic','backend','aunty'].map(f=>fs.readFileSync('src/'+f+'.js','utf8')).join('\n')+'\nglobalThis.G={createBackend,createDB,installAunty};');
(async()=>{const clock={t:Date.UTC(2026,9,11,6,30),now(){return this.t}};const B=G.createBackend({db:G.createDB(null),clock});G.installAunty(B);
const s=await B.api('POST','/v1/auth/signup',{body:{email:'a@x.com',password:'secret123',age_confirmed:true,consent_version:'1'}});
B.setGoal(s.body.user.id,{name:'Goa trip',cost_paise:2600000,deadline:'2027-02-11',free_income_paise:2200000});B.db.update('app_user',B.userById(s.body.user.id),{flow:null});
for(const m of process.argv.slice(2)){B.clearRL();const r=await B.api('POST','/v1/chat',{token:s.body.access_token,body:{message:m,client_message_id:Math.random()+''}});console.log(m,'=>',r.body.replies&&r.body.replies.map(x=>x.text));const t=B.lastTrace;console.log(t.outcome,JSON.stringify(t.guardrails.filter(g=>!g.ok)))}})();
