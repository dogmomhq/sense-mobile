const WebSocket = require('ws');
const URL = process.env.SENSE_WS || 'wss://web-production-c6ec6.up.railway.app';
const TESTKEY = process.env.E2E_TEST_KEY || '';
const ANSWER = parseInt(process.env.OPP_ANSWER || '1', 10); // 0=Correct, 1=WrongA
const s = { ws: new WebSocket(URL), token:null, handle:null, done:false };
const send=(o)=>{try{s.ws.send(JSON.stringify(o));}catch(e){}};
s.ws.on('open',()=>send({type:'register',preferredHandle:'Bot'+(Date.now()%100000)}));
s.ws.on('message',d=>{let m;try{m=JSON.parse(d);}catch{return;}
  if(m.type==='registered'){s.token=m.token;s.handle=m.handle;console.log('[opp] registered',s.handle);
    send({type:'queue',name:s.handle,tier:1,paymentMode:'credits',token:s.token,test:true,testKey:TESTKEY});}
  if(m.type==='async-question'){console.log('[opp] question -> answer idx',ANSWER,m.matchId);
    send({type:'async-answer',matchId:m.matchId,answerIndex:ANSWER,clientTime:4000});}
  if(m.type==='async-result'){console.log('[opp] RESULT you=',m.you.result,'opp=',m.opponent.result,'match=',m.matchId);s.done=true;setTimeout(()=>process.exit(0),400);}
  if(m.type==='queue-failed'||m.type==='error')console.log('[opp] srv',JSON.stringify(m));
});
s.ws.on('error',e=>console.log('[opp] ws',e.message));
setTimeout(()=>{console.log('[opp] exit done='+s.done);process.exit(0);},150000);
