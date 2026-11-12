import {auth,db} from "./firebase.js";
import {uploadMedia} from "./cloudinary.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {collection,addDoc,getDocs,query,limit,where,doc,deleteDoc,setDoc,serverTimestamp,Timestamp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const $=id=>document.getElementById(id);let user=null;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const panel=$("chatStatusPanel");
$("chatStatusOpen").onclick=()=>{panel.hidden=false;load();};
$("chatStatusClose").onclick=()=>panel.hidden=true;
async function load(){
 if(!user)return;
 try{
  const snap=await getDocs(query(collection(db,"statuses"),limit(100)));
  const now=Date.now(),items=snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.expiresAt?.toDate?.().getTime()>now).sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));
  $("chatStatusFeed").innerHTML=items.map(s=>'<article class="chat-status-item"><div><b>'+esc(s.displayName||"MILOOP member")+'</b><p>'+esc(s.text||"")+'</p>'+(s.mediaUrl?'<a href="'+esc(s.mediaUrl)+'" target="_blank" rel="noopener">View '+esc(s.mediaType||"media")+'</a>':"")+'<small>Expires '+esc(s.expiresAt.toDate().toLocaleString())+'</small></div>'+(s.uid===user.uid?'<button data-status-delete="'+esc(s.id)+'">Delete</button>':"")+'</article>').join("")||'<p class="chat-empty">No active statuses yet.</p>';
  $("chatStatusFeed").querySelectorAll("[data-status-delete]").forEach(b=>b.onclick=async()=>{if(confirm("Delete this status?")){await deleteDoc(doc(db,"statuses",b.dataset.statusDelete));load();}});
 }catch(e){$("chatStatusFeed").textContent="Could not load statuses: "+e.message;}
}
$("chatStatusForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!user)return;
 const text=$("chatStatusText").value.trim(),file=$("chatStatusMedia").files?.[0];if(!text&&!file)return;
 try{
  let media={};if(file){const up=await uploadMedia(file);media={mediaUrl:up.url,mediaType:up.type};}
  await addDoc(collection(db,"statuses"),{uid:user.uid,displayName:user.displayName||user.email?.split("@")[0]||"MILOOP member",text,...media,createdAt:serverTimestamp(),expiresAt:Timestamp.fromDate(new Date(Date.now()+86400000))});
  $("chatStatusText").value="";$("chatStatusMedia").value="";load();window.MILOOPChat?.notify?.("Status shared for 24 hours.");
 }catch(err){window.MILOOPChat?.notify?.("Status could not be shared: "+err.message);}
});
onAuthStateChanged(auth,u=>{user=u;});
