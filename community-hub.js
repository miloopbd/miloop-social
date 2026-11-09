import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection, collectionGroup, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc,
  query, orderBy, limit, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = id => document.getElementById(id);
let user = null;
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const name = () => user?.displayName || user?.email?.split("@")[0] || "MILOOP member";
const dayKey = (date = new Date()) => { const p = new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Dhaka",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date); const v = Object.fromEntries(p.map(x=>[x.type,x.value])); return v.year+"-"+v.month+"-"+v.day; };
const hub = document.createElement("section");
hub.id = "communityHub";
hub.innerHTML = '<div class="hub-head"><div><span class="hub-kicker">MILOOP COMMUNITY</span><h2 id="hubTitle">Community Hub</h2></div><button id="hubClose" aria-label="Close">×</button></div><div class="hub-tabs" id="hubTabs"></div><div id="hubContent" aria-live="polite"></div>';
document.body.append(hub);
const css = document.createElement("style");
css.textContent = `
#communityHub{display:none;position:fixed;z-index:80;inset:4vh max(12px,calc((100vw - 760px)/2));max-height:92vh;overflow:auto;background:#fff;color:#17233d;border:1px solid #e5ebf5;border-radius:20px;box-shadow:0 24px 80px #13264a35;padding:20px;font-family:'DM Sans',sans-serif}
#communityHub.open{display:block}.hub-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.hub-head h2{font-size:22px;margin:4px 0}.hub-kicker{font-size:9px;font-weight:800;letter-spacing:1.5px;color:#155eef}.hub-head>button{border:0;border-radius:50%;width:34px;height:34px;font-size:22px;background:#f0f4fa;color:#52627d}
.hub-tabs{display:flex;gap:7px;overflow:auto;padding:3px 0 13px}.hub-tabs button{white-space:nowrap;border:1px solid #e1e8f2;background:#f7f9fc;color:#52627d;border-radius:20px;padding:8px 12px;font:700 10px 'DM Sans';cursor:pointer}.hub-tabs button.active{background:#155eef;color:#fff;border-color:#155eef}
.hub-card{border:1px solid #e7edf5;border-radius:13px;padding:14px;margin:9px 0;background:#fff}.hub-card h3{font-size:14px;margin:0 0 8px}.hub-card p{font-size:11px;line-height:1.6;color:#61708a;white-space:pre-wrap}.hub-muted{font-size:10px;color:#8b97aa}.hub-form input,.hub-form textarea,.hub-form select{box-sizing:border-box;width:100%;padding:11px;border:1px solid #dfe7f2;border-radius:9px;margin:6px 0;font:12px 'DM Sans';background:#fff;color:#17233d}.hub-form textarea{min-height:75px;resize:vertical}.hub-btn{border:0;border-radius:9px;background:#155eef;color:#fff;padding:10px 14px;font:700 11px 'DM Sans';cursor:pointer;margin:5px 5px 5px 0}.hub-btn.alt{background:#edf3ff;color:#155eef}.hub-btn:disabled{opacity:.55;cursor:wait}.hub-option{display:flex;gap:8px;align-items:center;padding:8px 0;font-size:11px}.hub-option input{width:auto;margin:0}.hub-empty{padding:18px;text-align:center;color:#8995a8;font-size:11px}.hub-row{display:flex;gap:8px;align-items:center;justify-content:space-between;border-top:1px solid #eef1f6;padding:10px 0;font-size:11px}.hub-row>div{min-width:0;flex:1}.hub-row small{display:block;color:#8995a8;margin-top:4px}.hub-badge{display:inline-block;border-radius:20px;background:#eef4ff;color:#155eef;padding:6px 9px;margin:3px;font-size:10px;font-weight:700}.hub-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.hub-qr{display:block;width:210px;height:210px;max-width:100%;margin:12px auto}.hub-safe{font-size:10px;color:#76849a;line-height:1.6;background:#f6f8fc;border-radius:9px;padding:10px}
.hub-monet-hero{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:20px;border-radius:16px;background:linear-gradient(125deg,#102b62,#155eef 65%,#4d8cff);color:#fff;margin:8px 0 14px;overflow:hidden}.hub-monet-hero h3{font-size:19px;margin:9px 0 6px}.hub-monet-hero p{color:#dce8ff;font-size:11px;line-height:1.6;margin:0;max-width:380px}.hub-monet-tag{font-size:9px;letter-spacing:1.2px;font-weight:800;color:#c6dcff}.hub-monet-mark{width:64px;height:64px;flex:none;border:1px solid #ffffff65;border-radius:20px;display:grid;place-items:center;font-size:34px;font-weight:800;background:#ffffff18}.hub-monet-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.hub-monet-card{border:1px solid #e6ecf5;border-radius:13px;padding:14px;background:#fff;min-width:0}.hub-monet-card h3{font-size:13px;margin:8px 0}.hub-monet-card p{min-height:65px}.hub-monet-icon{width:34px;height:34px;border-radius:11px;background:#edf3ff;color:#155eef;display:grid;place-items:center;font-size:18px}.hub-monet-status{display:inline-block;background:#f0f4fb;color:#52627d;border-radius:20px;padding:5px 8px;font-size:9px;font-weight:700;margin:3px 0 8px}.hub-monet-stats,.hub-monet-admin-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}.hub-monet-stats>div,.hub-monet-admin-grid>div{background:#f6f8fc;border-radius:10px;padding:12px;display:grid;gap:4px}.hub-monet-stats b{font-size:22px;color:#155eef}.hub-monet-stats small,.hub-monet-admin-grid small{font-size:9px;color:#8793a7}.hub-monet-head{display:flex;justify-content:space-between;gap:10px;align-items:start}.hub-monet-admin-grid b{font-size:10px}.hub-monet-admin-grid strong{font-size:17px;color:#155eef}.hub-monet-form{border-top:1px solid #edf1f7;margin-top:14px;padding-top:13px}.hub-monet-preview{border:1px solid #dce7ff;background:#f7faff;border-radius:12px;padding:14px;margin-top:12px}.hub-monet-preview h3{font-size:14px;margin:9px 0 5px}.hub-monet-preview b{font-size:10px;color:#52627d}.hub-monet-preview small{font-size:9px;color:#8793a7}@media(max-width:600px){.hub-monet-grid{grid-template-columns:1fr}.hub-monet-card p{min-height:0}.hub-monet-hero h3{font-size:17px}.hub-monet-mark{width:48px;height:48px}.hub-monet-admin-grid,.hub-monet-stats{grid-template-columns:1fr 1fr}.hub-monet-head{display:block}}
@media(max-width:600px){#communityHub{inset:8px;max-height:calc(100dvh - 16px);padding:14px;border-radius:15px}.hub-head h2{font-size:19px}.hub-grid{grid-template-columns:1fr}}
`;
document.head.append(css);

const features = [
 ["monetization","Monetization"],["polls","Polls"],["questions","Ask Miloop"],["streak","Daily Streak"],["badges","Achievements"],
 ["saved","Bookmarks"],["events","Events"],["challenge","Challenge"],["birthday","Birthdays"],
 ["qr","QR Profile"],["leaderboard","Leaderboard"]
];
function toast(msg){const el=$("toast");if(el){el.textContent=msg;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2600);}}
function open(tab="polls"){
  if(!user){$("authOpen")?.click();toast("Sign in to use Community Hub.");return;}
  hub.classList.add("open");
  $("hubTabs").innerHTML=features.map(([id,label])=>'<button data-hub-tab="'+id+'" class="'+(id===tab?"active":"")+'">'+label+'</button>').join("");
  $("hubTabs").querySelectorAll("button").forEach(b=>b.onclick=()=>open(b.dataset.hubTab));
  render(tab);
}
function close(){hub.classList.remove("open");}
$("hubClose").onclick=close;
document.addEventListener("keydown",e=>{if(e.key==="Escape")close();});
function setContent(title,html){$("hubTitle").textContent=title;$("hubContent").innerHTML=html;}
async function docs(path,sortField="createdAt",max=30){
 const ref=collection(db,...path);return getDocs(query(ref,orderBy(sortField,"desc"),limit(max)));
}
async function render(tab){
 $("hubTabs").querySelectorAll("button").forEach(b=>b.classList.toggle("active",b.dataset.hubTab===tab));
 try{
  if(tab==="monetization") await monetization();
  if(tab==="polls") await polls();
  if(tab==="questions") await questions();
  if(tab==="streak") await streak();
  if(tab==="badges") await badges();
  if(tab==="saved") await bookmarks();
  if(tab==="events") await events();
  if(tab==="challenge") await challenge();
  if(tab==="birthday") await birthday();
  if(tab==="qr") await qr();
  if(tab==="leaderboard") await leaderboard();
 }catch(e){console.error("Community Hub:",e);$("hubContent").innerHTML='<div class="hub-card">Could not load this feature: '+esc(e.code||e.message||"Unknown error")+'. Check the latest Firestore Rules.</div>';}
}
async function monetization(){
 setContent("MILOOP Monetization",`
 <div class="hub-monet-hero"><div><span class="hub-monet-tag">CREATOR ECONOMY · PREVIEW</span><h3>Build value with your community.</h3><p>Explore future earning tools for creators and community partners.</p></div><div class="hub-monet-mark">M</div></div>
 <div class="hub-monet-grid">
  <article class="hub-monet-card"><span class="hub-monet-icon">✦</span><h3>MILOOP Premium</h3><p>Optional profile themes, exclusive badge, custom profile accents and future premium features.</p><span class="hub-monet-status">Planned feature</span><button class="hub-btn" type="button" data-monet-action="premium">Explore Premium</button></article>
  <article class="hub-monet-card"><span class="hub-monet-icon">▣</span><h3>Sponsored Posts</h3><p>Clearly labelled partner posts may help brands reach the community. Sponsored content will be reviewed before display.</p><span class="hub-monet-status">Admin-managed · Preview</span><button class="hub-btn" type="button" data-monet-action="sponsor">Create ad preview</button></article>
  <article class="hub-monet-card"><span class="hub-monet-icon">♡</span><h3>Support Creator</h3><p>A future way for community members to appreciate creators. No payment is collected in this preview.</p><span class="hub-monet-status">Coming later</span><button class="hub-btn" type="button" data-monet-action="support">See creator support</button></article>
 </div>
 <div id="monetActionPanel" class="hub-card"><h3>Monetization overview</h3><p>All three modules are included in this preview. Payment collection, subscriptions and creator payouts are not active.</p><div class="hub-monet-stats"><div><b>3</b><small>Modules planned</small></div><div><b>0</b><small>Live payments</small></div><div><b>0</b><small>Active campaigns</small></div></div></div>
 <div class="hub-card"><div class="hub-monet-head"><div><h3>Admin Monetization Desk</h3><p>Manage future premium access and sponsored content proposals.</p></div><span class="hub-monet-status">Demo dashboard</span></div>
  <div class="hub-monet-admin-grid"><div><b>Premium members</b><strong>0</strong><small>Demo data only</small></div><div><b>Campaigns</b><strong>0</strong><small>Demo data only</small></div><div><b>Creator support</b><strong>Not active</strong><small>Payment feature off</small></div></div>
  <form id="sponsorPreviewForm" class="hub-form hub-monet-form"><h3>Sponsored post preview</h3><input id="sponsorBrand" maxlength="60" placeholder="Partner / brand name" required><input id="sponsorTitle" maxlength="100" placeholder="Campaign headline" required><textarea id="sponsorDescription" maxlength="400" placeholder="Write a short, honest description" required></textarea><button class="hub-btn" type="submit">Preview sponsored post</button></form>
  <div id="sponsorPreview" aria-live="polite"></div>
 </div>
 <p class="hub-safe">Safety & transparency: Sponsored posts must be clearly labelled and reviewed. Any real subscription, advertising agreement or money transfer must be arranged by a responsible adult and comply with applicable laws and provider rules. MILOOP does not collect payment details here.</p>`);
 const panel=$("monetActionPanel");
 document.querySelectorAll("[data-monet-action]").forEach(b=>b.onclick=()=>{
  const type=b.dataset.monetAction;
  if(type==="premium") panel.innerHTML='<h3>✦ MILOOP Premium</h3><p>Planned benefits: Premium profile badge, profile themes, extra profile customization and optional community perks.</p><span class="hub-monet-status">Preview only · No subscription available</span>';
  if(type==="sponsor") $("sponsorBrand")?.focus();
  if(type==="support") panel.innerHTML='<h3>♡ Support Creator</h3><p>Creator appreciation is planned for a later release. No money, card details or payout information is requested or processed.</p><span class="hub-monet-status">Not active</span>';
 });
 $("sponsorPreviewForm").onsubmit=e=>{
  e.preventDefault();
  const brand=esc($("sponsorBrand").value.trim()),title=esc($("sponsorTitle").value.trim()),desc=esc($("sponsorDescription").value.trim());
  $("sponsorPreview").innerHTML='<article class="hub-monet-preview"><span class="hub-monet-status">SPONSORED · PREVIEW ONLY</span><h3>'+title+'</h3><b>'+brand+'</b><p>'+desc+'</p><small>This is a local preview. It has not been published or sent to anyone.</small></article>';
 };
}
async function polls(){
 setContent("Miloop Polls",'<div class="hub-card"><h3>Create a poll</h3><form id="pollForm" class="hub-form"><input id="pollTitle" maxlength="120" placeholder="Ask your community…" required><input class="pollChoice" maxlength="70" placeholder="Option 1" required><input class="pollChoice" maxlength="70" placeholder="Option 2" required><input class="pollChoice" maxlength="70" placeholder="Option 3 (optional)"><input class="pollChoice" maxlength="70" placeholder="Option 4 (optional)"><button class="hub-btn">Publish poll</button></form></div><div id="pollList">Loading polls…</div>');
 $("pollForm").onsubmit=async e=>{e.preventDefault();const choices=[...e.currentTarget.querySelectorAll(".pollChoice")].map(x=>x.value.trim()).filter(Boolean);if(choices.length<2||new Set(choices).size!==choices.length){toast("Add at least two different options.");return;}try{await addDoc(collection(db,"polls"),{title:$("pollTitle").value.trim(),options:choices,uid:user.uid,displayName:name(),createdAt:serverTimestamp()});toast("Poll published.");polls();}catch(err){toast("Poll failed: "+(err.code||err.message));}};
 const snap=await docs(["polls"]);const target=$("pollList");if(!target)return;
 target.innerHTML=snap.empty?'<div class="hub-empty">No polls yet. Start the first one!</div>':"";
 for(const d of snap.docs){const p=d.data(),vote=await getDoc(doc(db,"polls",d.id,"votes",user.uid)),votes=await getDocs(collection(db,"polls",d.id,"votes"));const counts={};votes.forEach(v=>counts[v.data().option]=(counts[v.data().option]||0)+1);
  const card=document.createElement("div");card.className="hub-card";card.innerHTML='<h3>'+esc(p.title)+'</h3><p>By '+esc(p.displayName||"MILOOP member")+' · '+votes.size+' votes</p>'+p.options.map((o,i)=>'<label class="hub-option"><input type="radio" name="poll-'+d.id+'" value="'+i+'" '+(vote.exists()?"disabled":"")+'><span>'+esc(o)+'</span><b>'+((counts[i]||0))+'</b></label>').join("")+'<button class="hub-btn" data-vote="'+d.id+'" '+(vote.exists()?"disabled":"")+'>'+(vote.exists()?"Voted":"Vote")+'</button>';
  target.append(card);
 }
 target.querySelectorAll("[data-vote]").forEach(b=>b.onclick=async()=>{const id=b.dataset.vote,choice=target.querySelector('input[name="poll-'+id+'"]:checked');if(!choice){toast("Choose an option first.");return;}try{await setDoc(doc(db,"polls",id,"votes",user.uid),{uid:user.uid,option:Number(choice.value),createdAt:serverTimestamp()});toast("Your vote is saved.");polls();}catch(e){toast("Vote failed: "+(e.code||e.message));}});
}
async function questions(){
 setContent("Ask Miloop",'<div class="hub-card"><h3>Ask a question</h3><form id="questionForm" class="hub-form"><input id="questionTitle" maxlength="120" placeholder="Your question" required><textarea id="questionBody" maxlength="800" placeholder="Add some context (optional)"></textarea><button class="hub-btn">Post question</button></form></div><div id="questionList">Loading questions…</div>');
 $("questionForm").onsubmit=async e=>{e.preventDefault();try{await addDoc(collection(db,"questions"),{title:$("questionTitle").value.trim(),body:$("questionBody").value.trim(),uid:user.uid,displayName:name(),createdAt:serverTimestamp()});toast("Question posted.");questions();}catch(err){toast("Could not post: "+(err.code||err.message));}};
 const snap=await docs(["questions"]);const list=$("questionList");if(!list)return;list.innerHTML=snap.empty?'<div class="hub-empty">No questions yet.</div>':"";
 for(const d of snap.docs){const q=d.data(),answers=await getDocs(query(collection(db,"questions",d.id,"answers"),orderBy("createdAt","asc"),limit(20)));const card=document.createElement("div");card.className="hub-card";card.innerHTML='<h3>'+esc(q.title)+'</h3><p>'+esc(q.body||"")+'</p><small class="hub-muted">Asked by '+esc(q.displayName||"Member")+' · '+answers.size+' answers</small><div>'+answers.docs.map(a=>'<div class="hub-row"><div>'+esc(a.data().text)+'<small>'+esc(a.data().displayName||"Member")+'</small></div></div>').join("")+'</div><form class="hub-form" data-answer="'+d.id+'"><input maxlength="500" placeholder="Write a helpful answer…" required><button class="hub-btn alt">Answer</button></form>';
  list.append(card);
 }
 list.querySelectorAll("[data-answer]").forEach(f=>f.onsubmit=async e=>{e.preventDefault();try{await addDoc(collection(db,"questions",f.dataset.answer,"answers"),{uid:user.uid,displayName:name(),text:f.querySelector("input").value.trim(),createdAt:serverTimestamp()});toast("Answer added.");questions();}catch(err){toast("Answer failed: "+(err.code||err.message));}});
}
async function streak(){
 const ref=doc(db,"streaks",user.uid),snap=await getDoc(ref),s=snap.data()||{},today=dayKey(),last=s.lastActiveDay||"",already=last===today;
 setContent("Daily Streak",'<div class="hub-card" style="text-align:center"><div style="font-size:42px">🔥</div><h3>'+Number(s.currentStreak||0)+' day streak</h3><p>Keep your learning and community habit going, one day at a time.</p><div class="hub-grid"><div><b>'+Number(s.totalPoints||0)+'</b><small class="hub-muted"> points</small></div><div><b>'+Number(s.longestStreak||0)+'</b><small class="hub-muted"> best streak</small></div></div><button class="hub-btn" id="checkIn" '+(already?"disabled":"")+'>'+(already?"Today completed ✓":"Check in today · +5 points")+'</button></div><p class="hub-safe">Streaks are for fun. Missing a day is okay—there is no penalty.</p>');
 $("checkIn").onclick=async()=>{try{const fresh=(await getDoc(ref)).data()||{},now=dayKey();if(fresh.lastActiveDay===now){toast("You already checked in today.");return;}const yesterday=dayKey(new Date(Date.now()-86400000)),next=fresh.lastActiveDay===yesterday?Number(fresh.currentStreak||0)+1:1;await setDoc(ref,{uid:user.uid,displayName:name(),lastActiveDay:now,currentStreak:next,longestStreak:Math.max(next,Number(fresh.longestStreak||0)),totalPoints:Number(fresh.totalPoints||0)+5,updatedAt:serverTimestamp()},{merge:true});toast("Daily check-in saved! +5 points.");streak();}catch(e){toast("Check-in failed: "+(e.code||e.message));}};
}
async function badges(){
 const snap=await getDoc(doc(db,"streaks",user.uid)),s=snap.data()||{},points=Number(s.totalPoints||0),days=Number(s.longestStreak||0);
 const all=[["First Loop","Complete your first daily check-in",points>=5],["Five-Day Focus","Reach a 5-day streak",days>=5],["Ten-Day Trail","Reach a 10-day streak",days>=10],["Community Builder","Earn 50 points",points>=50],["Loop Legend","Earn 100 points",points>=100]];
 setContent("Miloop Achievements",'<div class="hub-card"><h3>Your badges</h3><p>Earn badges by taking part in positive community activities.</p>'+all.map(x=>'<span class="hub-badge" style="opacity:'+(x[2]?1:.38)+'">'+(x[2]?"🏅 ":"🔒 ")+esc(x[0])+'</span><p class="hub-muted">'+esc(x[1])+'</p>').join("")+'</div>');
}
async function bookmarks(){
 setContent("Smart Bookmarks",'<div class="hub-card"><h3>Saved posts</h3><p>Save a post from its Bookmark action in the feed, then find it here.</p></div><div id="bookmarkList">Loading saved posts…</div>');
 const snap=await docs(["bookmarks",user.uid,"items"]);const list=$("bookmarkList");if(!list)return;
 if(snap.empty){list.innerHTML='<div class="hub-empty">No saved posts yet. Use the Bookmark action on a feed post.</div>';return;}
 list.innerHTML="";
 for(const d of snap.docs){const data=d.data(),post=await getDoc(doc(db,"posts",d.id));const p=post.exists()?post.data():null;const card=document.createElement("div");card.className="hub-card";card.innerHTML='<h3>'+(p?esc(p.authorName||"Saved post"):"Post unavailable")+'</h3><p>'+esc(p?.text||data.text||"This post may have been deleted.")+'</p><button class="hub-btn alt" data-unsave="'+d.id+'">Remove bookmark</button>';list.append(card);}
 list.querySelectorAll("[data-unsave]").forEach(b=>b.onclick=async()=>{await deleteDoc(doc(db,"bookmarks",user.uid,"items",b.dataset.unsave));bookmarks();});
}
async function events(){
 setContent("Miloop Events",'<div class="hub-card"><h3>Create a community event</h3><form id="eventForm" class="hub-form"><input id="eventTitle" maxlength="100" placeholder="Event name" required><input id="eventDate" type="datetime-local" required><textarea id="eventDesc" maxlength="500" placeholder="Details"></textarea><button class="hub-btn">Publish event</button></form></div><div id="eventList">Loading events…</div>');
 $("eventForm").onsubmit=async e=>{e.preventDefault();const date=new Date($("eventDate").value);if(!Number.isFinite(date.getTime())||date.getTime()<Date.now()){toast("Choose a future date and time.");return;}try{await addDoc(collection(db,"events"),{title:$("eventTitle").value.trim(),description:$("eventDesc").value.trim(),startsAt:date,uid:user.uid,displayName:name(),createdAt:serverTimestamp()});toast("Event published.");events();}catch(err){toast("Event failed: "+(err.code||err.message));}};
 const snap=await docs(["events"]);const list=$("eventList");if(!list)return;const active=snap.docs.filter(d=>d.data().startsAt?.toDate?.()&&d.data().startsAt.toDate()>new Date());list.innerHTML=active.length?"":'<div class="hub-empty">No upcoming events yet.</div>';
 for(const d of active){const e=d.data(),rsvp=await getDoc(doc(db,"eventRsvps",d.id,"members",user.uid));const card=document.createElement("div");card.className="hub-card";card.innerHTML='<h3>'+esc(e.title)+'</h3><p>'+esc(e.description||"")+'</p><small class="hub-muted">'+esc(e.startsAt.toDate().toLocaleString())+' · Hosted by '+esc(e.displayName||"Member")+'</small><div><button class="hub-btn" data-rsvp="'+d.id+'" '+(rsvp.exists()?"disabled":"")+'>'+(rsvp.exists()?"You’re going ✓":"I’m interested")+'</button></div>';list.append(card);}
 list.querySelectorAll("[data-rsvp]").forEach(b=>b.onclick=async()=>{try{await setDoc(doc(db,"eventRsvps",b.dataset.rsvp,"members",user.uid),{uid:user.uid,displayName:name(),createdAt:serverTimestamp()});toast("Your interest is recorded.");events();}catch(e){toast("Could not RSVP: "+(e.code||e.message));}});
}
const challenges=[
 {id:"weekly-1",title:"Study Skills Check",question:"Which is a useful way to organize study tasks?",options:["Write a short task list","Ignore deadlines","Keep every task secret"],answer:0,explain:"A short task list can help you remember what to do and plan your time."},
 {id:"weekly-2",title:"Creative Challenge",question:"Share one practical study habit that helps you learn.",options:["Write a short tip","Skip sleep","Study without breaks"],answer:null,explain:"There are many helpful approaches. Share a respectful, realistic tip."}
];
async function challenge(){
 const c=challenges[0],entry=await getDoc(doc(db,"challengeEntries",c.id,"entries",user.uid));
 setContent("Miloop Challenge",'<div class="hub-card"><span class="hub-badge">WEEKLY</span><h3>'+esc(c.title)+'</h3><p>'+esc(c.question)+'</p>'+c.options.map((o,i)=>'<label class="hub-option"><input type="radio" name="challengeAnswer" value="'+i+'" '+(entry.exists()?"disabled":"")+'><span>'+esc(o)+'</span></label>').join("")+'<button class="hub-btn" id="submitChallenge" '+(entry.exists()?"disabled":"")+'>'+(entry.exists()?"Submitted ✓":"Submit answer")+'</button><p class="hub-muted" id="challengeResult">'+(entry.exists()?(entry.data().correct?"Correct! ":"Answer recorded. ")+esc(c.explain):"")+'</p></div><div class="hub-card"><h3>Creative Challenge</h3><p>'+esc(challenges[1].question)+'</p><form id="creativeChallenge" class="hub-form"><textarea maxlength="400" placeholder="Share a positive, safe idea…" required></textarea><button class="hub-btn alt">Submit idea</button></form></div>');
 $("submitChallenge").onclick=async()=>{const selected=document.querySelector('input[name="challengeAnswer"]:checked');if(!selected){toast("Choose an answer.");return;}const correct=Number(selected.value)===c.answer;try{await setDoc(doc(db,"challengeEntries",c.id,"entries",user.uid),{uid:user.uid,correct,createdAt:serverTimestamp()});$("challengeResult").textContent=(correct?"Correct! ":"Not quite. ")+c.explain;toast(correct?"Well done!":"Answer recorded.");challenge();}catch(e){toast("Could not submit: "+(e.code||e.message));}};
 $("creativeChallenge").onsubmit=async e=>{e.preventDefault();try{await setDoc(doc(db,"challengeEntries",challenges[1].id,"entries",user.uid),{uid:user.uid,text:e.currentTarget.querySelector("textarea").value.trim(),createdAt:serverTimestamp()});toast("Challenge submitted.");e.currentTarget.reset();}catch(err){toast("Could not submit: "+(err.code||err.message));}};
}
async function birthday(){
 const current=await getDoc(doc(db,"birthdayOptIns",user.uid)),data=current.data()||{};
 setContent("Birthday Reminders",'<div class="hub-card"><h3>Choose to share your birthday</h3><p>Only the month and day are saved—never your birth year. This is optional and can be removed any time.</p><form id="birthdayForm" class="hub-form"><input id="birthdayDate" type="date" value="'+(data.monthDay?"2000-"+esc(data.monthDay):"")+'"><label class="hub-option"><input id="birthdayConsent" type="checkbox" '+(data.enabled?"checked":"")+'> I agree to show my birthday (month and day only) to signed-in Miloop members.</label><button class="hub-btn">Save preference</button><button class="hub-btn alt" type="button" id="birthdayRemove">Remove birthday</button></form></div><div id="birthdayList">Loading opt-in birthdays…</div>');
 $("birthdayForm").onsubmit=async e=>{e.preventDefault();const val=$("birthdayDate").value,consent=$("birthdayConsent").checked;if(!consent){toast("Tick the consent box or remove your birthday.");return;}if(!val){toast("Choose month and day.");return;}try{await setDoc(doc(db,"birthdayOptIns",user.uid),{uid:user.uid,displayName:name(),monthDay:val.slice(5),enabled:true,updatedAt:serverTimestamp()});toast("Birthday preference saved.");birthday();}catch(err){toast("Could not save: "+(err.code||err.message));}};
 $("birthdayRemove").onclick=async()=>{try{await deleteDoc(doc(db,"birthdayOptIns",user.uid));toast("Birthday preference removed.");birthday();}catch(e){toast("Could not remove: "+(e.code||e.message));}};
 const snap=await getDocs(query(collection(db,"birthdayOptIns"),where("enabled","==",true),limit(100)));const today=new Date(),todayKey=String(today.getMonth()+1).padStart(2,"0")+"-"+String(today.getDate()).padStart(2,"0");const upcoming=snap.docs.map(d=>d.data()).filter(x=>x.monthDay).sort((a,b)=>a.monthDay.localeCompare(b.monthDay));$("birthdayList").innerHTML='<div class="hub-card"><h3>Community birthdays</h3>'+ (upcoming.length?upcoming.map(x=>'<div class="hub-row"><div>'+esc(x.displayName||"MILOOP member")+'<small>'+esc(x.monthDay)+'</small></div>'+(x.monthDay===todayKey?'<span class="hub-badge">Today 🎉</span>':"")+'</div>').join(""):'<p>No members have opted in yet.</p>')+'</div>';
}
async function qr(){
 setContent("Miloop QR Profile",'<div class="hub-card" style="text-align:center"><h3>Share your profile</h3><p>Anyone who scans this QR code can open your Miloop profile after signing in.</p><canvas id="profileQr" class="hub-qr"></canvas><p class="hub-muted">'+esc(location.origin+location.pathname+"?profile="+user.uid)+'</p><button class="hub-btn" id="downloadQr">Download QR</button><button class="hub-btn alt" id="copyProfile">Copy profile link</button></div>');
 const url=new URL(location.href);url.search="";url.searchParams.set("profile",user.uid);url.hash="";
 try{const QRCode=await import("https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm");await QRCode.toCanvas($("profileQr"),url.href,{width:210,margin:2});}catch(e){$("profileQr").replaceWith(Object.assign(document.createElement("p"),{textContent:"QR library unavailable. Use Copy profile link."}));}
 $("downloadQr").onclick=()=>{const canvas=$("profileQr");if(canvas?.toDataURL){const a=document.createElement("a");a.href=canvas.toDataURL("image/png");a.download="miloop-profile-qr.png";a.click();}};
 $("copyProfile").onclick=async()=>{try{await navigator.clipboard.writeText(url.href);toast("Profile link copied.");}catch(e){toast("Copy unavailable in this browser.");}};
}
async function leaderboard(){
 const snap=await getDocs(query(collection(db,"streaks"),orderBy("totalPoints","desc"),limit(30)));
 setContent("Community Leaderboard",'<div class="hub-card"><h3>Top community contributors</h3><p>Rankings are based on daily check-in points. It is just for fun—everyone can participate at their own pace.</p><div id="leaderRows">'+(snap.empty?'<div class="hub-empty">No scores yet. Start with a daily check-in!</div>':snap.docs.map((d,i)=>'<div class="hub-row"><b>#'+(i+1)+'</b><div>'+esc(d.data().displayName||"MILOOP member")+'<small>'+Number(d.data().currentStreak||0)+' day streak</small></div><strong>'+Number(d.data().totalPoints||0)+' pts</strong></div>').join(""))+'</div></div>');
}
document.addEventListener("click",e=>{
 const b=e.target.closest("[data-hub-open]");if(b){e.preventDefault();open(b.dataset.hubOpen);}
 const save=e.target.closest('[data-action="bookmark"]');if(save){e.preventDefault();e.stopPropagation();if(!user){$("authOpen")?.click();return;}const post=save.closest("[data-id]");if(post){const id=post.dataset.id;getDoc(doc(db,"posts",id)).then(s=>{if(!s.exists())return;const p=s.data();return setDoc(doc(db,"bookmarks",user.uid,"items",id),{postId:id,text:p.text||"",authorName:p.authorName||"",createdAt:serverTimestamp()});}).then(()=>toast("Post bookmarked.")).catch(err=>toast("Bookmark failed: "+(err.code||err.message)));}}
});
onAuthStateChanged(auth,u=>{user=u;});
window.MILOOPCommunityHub={open,close};

const sideNav=document.querySelector(".left nav");
if(sideNav){const a=document.createElement("a");a.href="#community";a.textContent="✦ ";const span=document.createElement("span");span.textContent="Community Hub";a.append(span);a.addEventListener("click",e=>{e.preventDefault();open("monetization");});sideNav.append(a);}
function addBookmarkControls(){
 document.querySelectorAll("#posts .post").forEach(card=>{
  const actions=card.querySelector(".post-actions");
  if(actions&&!actions.querySelector('[data-action="bookmark"]')){
   const b=document.createElement("button");b.type="button";b.dataset.action="bookmark";b.innerHTML="<span>▱</span>Save";actions.append(b);
  }
 });
}
new MutationObserver(addBookmarkControls).observe(document.getElementById("posts")||document.body,{childList:true,subtree:true});
addBookmarkControls();
