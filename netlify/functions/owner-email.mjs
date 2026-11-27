import {randomInt,createHmac} from 'node:crypto';
const url='https://vumhcazmkvuihzgrfwvh.supabase.co';
const pub='sb_publishable_5MkHW4iIxOJ1tdqbnb8hxg_1qig3aLV';
const owner='4063c061-e079-4e7a-a02b-d4cc21d5ad68';
export default async req=>{
 const reply=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if(req.method!=='POST')return reply(405,{message:'Method not allowed'});
 try{
 const key=process.env.SUPABASE_SECRET_KEY, resend=process.env.RESEND_API_KEY;
 if(!key||!resend)return reply(503,{message:'Verification unavailable.'});
 const auth=req.headers.get('authorization')||'';
 if(!/^Bearer [\w.-]+$/.test(auth))return reply(401,{message:'Sign in first.'});
 const u=await fetch(url+'/auth/v1/user',{headers:{apikey:pub,Authorization:auth}});
 if(!u.ok||(await u.json()).id!==owner)return reply(403,{message:'Access denied.'});
 const claims=JSON.parse(Buffer.from(auth.split('.')[1],'base64url').toString());
 const sid=claims.session_id;
 if(claims.sub!==owner||!/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(sid))return reply(403,{message:'Invalid session.'});
 const raw=await req.text();if(raw.length>1000)return reply(400,{message:'Invalid request.'});
 const {action,code}=JSON.parse(raw);
 const hash=c=>createHmac('sha256',key).update('owner-email-v1:'+sid+':'+c).digest('hex');
 const rpc=async(action,digest='')=>{const r=await fetch(url+'/rest/v1/rpc/owner_email_action',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({p_session:sid,p_action:action,p_digest:digest})});if(!r.ok)throw Error('Database unavailable');return await r.json();};
 if(action==='send'){
 const otp=String(randomInt(0,1000000)).padStart(6,'0');
 const state=await rpc('send',hash(otp));
 if(state!=='send')return reply(429,{message:'Please wait before requesting another code.'});
 const mail=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+resend,'Content-Type':'application/json'},body:JSON.stringify({from:'Olli Handyman <onboarding@resend.dev>',to:['firicdigitalstudio@gmail.com'],subject:'Owner login verification code',text:`Your Olli Handyman verification code is ${otp}. It expires in 5 minutes. Do not share this code.`}),signal:AbortSignal.timeout(8000)});
 if(!mail.ok)return reply(503,{message:'Email delivery failed. Try again in 60 seconds.'});
 return reply(200,{message:'Code sent. Check your email.'});
 }
 if(action==='verify'&&typeof code==='string'&&/^\d{6}$/.test(code)){const state=await rpc('verify',hash(code));return reply(state==='verified'?200:400,{verified:state==='verified',message:state==='verified'?'Verified.':'Invalid, expired or locked code. Request a new code if needed.'});}
 if(action==='status')return reply(200,{verified:(await rpc('status'))==='verified'});
 if(action==='logout'){await rpc('logout');return reply(200,{message:'Signed out.'});}
 return reply(400,{message:'Invalid request.'});
 }catch{return reply(503,{message:'Verification temporarily unavailable.'});}
};
