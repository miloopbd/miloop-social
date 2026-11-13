import { auth, db } from "./firebase.js";
import { uploadMedia } from "./cloudinary.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, addDoc, getDocs, query, orderBy, limit, doc, updateDoc, arrayUnion, arrayRemove, increment, serverTimestamp, writeBatch, where } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = id => document.getElementById(id);
const feed = $("reelsFeed");
const uploadDialog = $("reelUploadDialog");
const commentsDialog = $("reelCommentsDialog");
let currentUser = null;
let activeCommentPost = null;
let toastTimer = null;
let observer = null;
let audioUnlocked = false;
let activeReelVideo = null;
const viewedThisSession = new Set();
const profileCache = new Map();

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function initials(name) {
  return String(name || "M").trim().split(/\s+/).slice(0,2).map(part => part[0] || "").join("").toUpperCase();
}
function toast(message) {
  const el = $("reelsToast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}
function timeLabel(value) {
  const date = value?.toDate ? value.toDate() : (value ? new Date(value) : null);
  if (!date || Number.isNaN(date.getTime())) return "Recently";
  const sec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (sec < 60) return "Just now";
  if (sec < 3600) return Math.floor(sec / 60) + "m ago";
  if (sec < 86400) return Math.floor(sec / 3600) + "h ago";
  return Math.floor(sec / 86400) + "d ago";
}
async function getProfile(uid) {
  if (!uid) return {};
  if (profileCache.has(uid)) return profileCache.get(uid);
  try {
    const { getDoc } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    const snap = await getDoc(doc(db, "publicProfiles", uid));
    const data = snap.exists() ? snap.data() : {};
    profileCache.set(uid, data);
    return data;
  } catch (error) {
    console.warn("Reels profile lookup failed:", error);
    return {};
  }
}
function mediaFor(post) {
  if (Array.isArray(post.mediaItems) && post.mediaItems.length) {
    return post.mediaItems.filter(item => item?.url && ["image","video"].includes(item.type));
  }
  if (post.mediaUrl && ["image","video"].includes(post.mediaType)) {
    return [{ url: post.mediaUrl, type: post.mediaType }];
  }
  return [];
}
function mediaElement(item, index) {
  const url = esc(item.url);
  if (item.type === "video") {
    return '<video class="reel-video" src="' + url + '" playsinline loop muted preload="' + (index < 2 ? "auto" : "metadata") + '" aria-label="MILOOP video"></video><div class="reel-video-progress" aria-hidden="true"><span></span></div><button class="reel-play-toggle" type="button" data-reel-play aria-label="Play or pause">Ⅱ</button><button class="reel-fullscreen" type="button" data-reel-fullscreen aria-label="Full screen">⛶</button>';
  }
  return '<img src="' + url + '" alt="MILOOP photo" loading="' + (index < 2 ? "eager" : "lazy") + '">';
}
function renderCards(items) {
  if (!items.length) {
    feed.innerHTML = '<div class="reel-empty"><div class="reel-empty-icon">▷</div><b>No Reels yet</b><p>Be the first to share a short video or photo with your community.</p><button type="button" data-reel-upload>＋ Create the first Reel</button></div>';
    return;
  }
  feed.innerHTML = items.map((item, index) => {
    const post = item.post;
    const liked = !!(currentUser && Array.isArray(post.likes) && post.likes.includes(currentUser.uid));
    const avatar = item.profile.avatarUrl ? '<img src="' + esc(item.profile.avatarUrl) + '" alt="">' : esc(initials(post.authorName));
    const typeLabel = item.media.type === "video" ? "▶ Video" : "▧ Photo";
    const viewCount = Number(post.viewCount) || 0;
    const media = mediaElement(item.media, index);
    return '<article class="reel-card" data-post-id="' + esc(post.id) + '" data-author-uid="' + esc(post.authorUid || "") + '" data-media-type="' + esc(item.media.type) + '">' +
      '<div class="reel-media">' + media + '</div><div class="reel-shade"></div>' +

      '<div class="reel-copy"><div class="reel-author"><div class="reel-avatar">' + avatar + '</div><div><div class="reel-author-name">' + esc(post.authorName || "MILOOP member") + '</div><div class="reel-author-time">' + esc(timeLabel(post.createdAt)) + '</div></div></div>' +
      (post.text ? '<div class="reel-caption">' + esc(post.text) + '</div>' : '') + '<span class="reel-type">' + typeLabel + '</span></div>' +
      '<div class="reel-actions"><button class="reel-action ' + (liked ? "liked" : "") + '" type="button" data-reel-like aria-label="Like">' + (liked ? "♥" : "♡") + '<small>' + (Number(post.likeCount) || 0) + '</small></button>' +
      '<button class="reel-action" type="button" data-reel-comments aria-label="Comments">▢<small>Comment</small></button>' +
      '<button class="reel-action" type="button" data-reel-share aria-label="Share">↗<small>Share</small></button></div></article>';
  }).join("");
  observeVideos();
}
function unlockReelAudio() {
  audioUnlocked = true;
  feed.querySelectorAll("video.reel-video").forEach(video => {
    video.muted = false;
    video.volume = 1;
  });
  const video = activeReelVideo || feed.querySelector(".reel-card video.reel-video");
  if (video) {
    video.muted = false;
    video.volume = 1;
    const result = video.play();
    if (result?.catch) result.catch(error => {
      console.warn("Reel sound playback blocked:", error);
      toast("এই ভিডিওতে সাউন্ড চালু করা যাচ্ছে না।");
    });
  }
  const button = document.getElementById("reelEnableSound");
  if (button) { button.textContent = "🔊 Sound On"; button.classList.add("sound-enabled"); }
}

function playReelVideo(video) {
  if (!video) return;
  video.muted = !audioUnlocked;
  video.volume = 1;
  video.play().catch(error => { console.warn("Reel playback blocked:", error); });
}
function observeVideos() {
  if (observer) observer.disconnect();
  const cards = feed.querySelectorAll(".reel-card");
  if (!("IntersectionObserver" in window)) {
    cards.forEach(card => { const video = card.querySelector("video"); if (video) { activeReelVideo = video; playReelVideo(video); } recordReelView(card); });
    return;
  }
  observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const video = entry.target.querySelector("video");
      if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
        recordReelView(entry.target);
        if (video) { activeReelVideo = video; playReelVideo(video); }
      } else if (video) { video.pause(); if (activeReelVideo === video) activeReelVideo = null; }
    });
  }, { root: feed, threshold: [0,0.65,1] });
  cards.forEach(card => {
    observer.observe(card);
    const video = card.querySelector("video");
    if (video) video.addEventListener("timeupdate", () => {
      const bar = card.querySelector(".reel-video-progress span");
      if (bar && video.duration) bar.style.width = ((video.currentTime / video.duration) * 100) + "%";
    });
  });
}
async function recordReelView(card) {
  const postId = card.dataset.postId;
  const authorUid = card.dataset.authorUid;
  if (!currentUser || !postId || !authorUid || authorUid === currentUser.uid || viewedThisSession.has(postId)) return;
  viewedThisSession.add(postId);
  try {
    const profile = await getProfile(currentUser.uid);
    const displayName = (profile.displayName || currentUser.displayName || currentUser.email?.split("@")[0] || "MILOOP member").trim();
    const batch = writeBatch(db);
    batch.set(doc(db, "posts", postId, "views", currentUser.uid), {
      uid: currentUser.uid,
      displayName,
      viewedAt: serverTimestamp()
    });
    batch.update(doc(db, "posts", postId), { viewCount: increment(1) });
    await batch.commit();
    const count = card.querySelector(".reel-view-count small");
    if (count) count.textContent = (Number(count.textContent.replace(/,/g, "")) + 1).toLocaleString();
  } catch (error) {
    // A denied create usually means this member already viewed this Reel.
    if (error.code !== "permission-denied" && error.code !== "already-exists") {
      viewedThisSession.delete(postId);
      console.warn("Reel view could not be recorded:", error);
    }
  }
}
function formatCount(value) {
  return new Intl.NumberFormat().format(Number(value) || 0);
}
async function openCreatorAnalytics() {
  if (!currentUser) { toast("Sign in to view Creator Analytics."); return; }
  const dialog = $("reelAnalyticsDialog");
  const content = $("reelAnalyticsContent");
  content.innerHTML = '<div class="reels-loading"><span class="reels-spinner"></span><small>Preparing your creator insights…</small></div>';
  dialog.showModal();
  try {
    const snap = await getDocs(query(collection(db, "posts"), where("authorUid", "==", currentUser.uid), limit(100)));
    const posts = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(post => mediaFor(post).length && !post.sponsored);
    const totals = posts.reduce((sum, post) => ({
      views: sum.views + (Number(post.viewCount) || 0),
      likes: sum.likes + (Number(post.likeCount) || 0)
    }), { views: 0, likes: 0 });
    const ranked = [...posts].sort((a,b) => (Number(b.viewCount)||0) - (Number(a.viewCount)||0)).slice(0,5);
    content.innerHTML = '<div class="reel-analytics-stats">' +
      '<div><small>Total Reels</small><b>' + formatCount(posts.length) + '</b></div>' +
      '<div><small>Total Views</small><b>' + formatCount(totals.views) + '</b></div>' +
      '<div><small>Total Likes</small><b>' + formatCount(totals.likes) + '</b></div></div>' +
      '<h3 class="reel-analytics-title">Top Reels</h3>' +
      (ranked.length ? ranked.map((post,i) => '<div class="reel-analytics-row"><span>' + (i+1) + '</span><div><b>' + esc((post.text || "Untitled Reel").slice(0,72)) + '</b><small>' + esc(post.mediaType === "video" ? "Video" : "Photo") + '</small></div><strong>◉ ' + formatCount(post.viewCount) + '</strong></div>').join("") : '<p class="reels-upload-help">Your published Reels and insights will appear here.</p>') +
      '<p class="reels-upload-help">Insights show counts from your latest 100 media posts.</p>';
  } catch (error) {
    console.error("Creator analytics failed:", error);
    content.innerHTML = '<p class="reels-error">Could not load insights. Please try again.</p>';
  }
}
async function loadReels() {
  feed.innerHTML = '<div class="reels-loading"><span class="reels-spinner"></span><b>Loading Reels…</b><small>Finding moments from your community</small></div>';
  try {
    const snap = await getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(80)));
    const posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const mediaPosts = posts.filter(post => mediaFor(post).length && !post.sponsored);
    const authors = [...new Set(mediaPosts.map(post => post.authorUid).filter(Boolean))];
    await Promise.all(authors.map(uid => getProfile(uid)));
    const items = mediaPosts.flatMap(post => mediaFor(post).map((media, mediaIndex) => ({
      post,
      media,
      mediaIndex,
      profile: profileCache.get(post.authorUid) || {}
    })));
    renderCards(items);
  } catch (error) {
    console.error("Could not load MILOOP Reels:", error);
    feed.innerHTML = '<div class="reel-empty"><div class="reel-empty-icon">!</div><b>Reels could not load</b><p>Check your connection and try again.</p><button type="button" data-reel-retry>Try again</button></div>';
  }
}
async function requireLogin() {
  if (currentUser) return true;
  toast("Please sign in to share or react.");
  return false;
}
function openUpload() {
  if (!currentUser) {
    toast("Sign in from the Home page to create a Reel.");
    return;
  }
  $("reelUploadError").textContent = "";
  uploadDialog.showModal();
}
$("openReelUpload").addEventListener("click", openUpload);
$("closeReelUpload").addEventListener("click", () => uploadDialog.close());
uploadDialog.addEventListener("click", event => { if (event.target === uploadDialog) uploadDialog.close(); });
$("reelFile").addEventListener("change", () => {
  const file = $("reelFile").files?.[0];
  const preview = $("reelPreview");
  preview.innerHTML = "";
  if (!file) return;
  const url = URL.createObjectURL(file);
  const node = document.createElement(file.type.startsWith("video/") ? "video" : "img");
  node.src = url;
  if (node.tagName === "VIDEO") { node.controls = true; node.muted = true; node.playsInline = true; }
  preview.append(node);
});
$("reelUploadForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!await requireLogin()) return;
  const file = $("reelFile").files?.[0];
  const caption = $("reelCaption").value.trim();
  const errorEl = $("reelUploadError");
  const button = $("publishReel");
  if (!file) { errorEl.textContent = "Choose a photo or video first."; return; }
  button.disabled = true;
  button.textContent = "Uploading…";
  errorEl.textContent = "";
  try {
    const uploaded = await uploadMedia(file);
    const profile = await getProfile(currentUser.uid);
    const authorName = (profile.displayName || currentUser.displayName || currentUser.email?.split("@")[0] || "MILOOP member").trim();
    await addDoc(collection(db, "posts"), {
      authorUid: currentUser.uid,
      authorName,
      text: caption,
      mediaUrl: uploaded.url,
      mediaType: uploaded.type,
      mediaPath: uploaded.publicId || "",
      createdAt: serverTimestamp(),
      likes: [],
      likeCount: 0,
      viewCount: 0,
      background: "plain",
      feeling: ""
    });
    uploadDialog.close();
    $("reelUploadForm").reset();
    $("reelPreview").innerHTML = "";
    toast("Your Reel has been shared!");
    await loadReels();
    feed.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    console.error("Reel upload failed:", error);
    errorEl.textContent = error.message || "Could not share this Reel. Please try again.";
  } finally {
    button.disabled = false;
    button.textContent = "Share to Reels";
  }
});
document.getElementById("reelEnableSound")?.addEventListener("click", unlockReelAudio);
feed.addEventListener("click", async event => {
  const card = event.target.closest(".reel-card");
  if (event.target.closest("[data-reel-upload]")) { openUpload(); return; }
  if (event.target.closest("[data-reel-retry]")) { loadReels(); return; }
  if (!card) return;
  const postId = card.dataset.postId;
  if (event.target.closest("[data-reel-play]")) {
    const video = card.querySelector("video");
    if (video) { activeReelVideo = video; if (!audioUnlocked) unlockReelAudio(); else if (video.paused) playReelVideo(video); else video.pause(); event.target.closest("[data-reel-play]").textContent = video.paused ? "▶" : "Ⅱ"; }
    return;
  }
  if (event.target.closest("[data-reel-fullscreen]")) {
    const media = card.querySelector("video, img");
    if (media?.requestFullscreen) media.requestFullscreen().catch(() => toast("Full screen is unavailable."));
    else toast("Full screen is unavailable on this browser.");
    return;
  }

  if (event.target.closest("[data-reel-like]")) {
    if (!await requireLogin()) return;
    const button = event.target.closest("[data-reel-like]");
    const liked = button.classList.contains("liked");
    button.disabled = true;
    try {
      const ref = doc(db, "posts", postId);
      if (liked) await updateDoc(ref, { likes: arrayRemove(currentUser.uid), likeCount: increment(-1) });
      else await updateDoc(ref, { likes: arrayUnion(currentUser.uid), likeCount: increment(1) });
      button.classList.toggle("liked", !liked);
      button.innerHTML = (!liked ? "♥" : "♡") + "<small>" + Math.max(0, (Number(button.querySelector("small")?.textContent) || 0) + (liked ? -1 : 1)) + "</small>";
    } catch (error) {
      console.error("Reel reaction failed:", error);
      toast("Could not update your reaction.");
    } finally { button.disabled = false; }
    return;
  }
  if (event.target.closest("[data-reel-comments]")) {
    activeCommentPost = postId;
    await loadComments(postId);
    commentsDialog.showModal();
    return;
  }
  if (event.target.closest("[data-reel-share]")) {
    const url = location.origin + location.pathname + "#reel-" + postId;
    try {
      if (navigator.share) await navigator.share({ title: "MILOOP Reel", text: "Watch this moment on MILOOP", url });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(url); toast("Reel link copied."); }
      else toast("Sharing is not available on this browser.");
    } catch (error) { if (error.name !== "AbortError") toast("Could not share this Reel."); }
  }
});
async function loadComments(postId) {
  const list = $("reelCommentsList");
  list.innerHTML = '<div class="reels-loading"><span class="reels-spinner"></span><small>Loading comments…</small></div>';
  try {
    const snap = await getDocs(query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc"), limit(80)));
    if (!snap.size) { list.innerHTML = '<p class="reels-upload-help">No comments yet. Start the conversation.</p>'; return; }
    const comments = await Promise.all(snap.docs.map(async d => {
      const c=d.data(); let avatar="";
      if(c.uid){try{const p=await getDoc(doc(db,"publicProfiles",c.uid));avatar=p.exists()?p.data().avatarUrl||"":"";}catch(e){console.warn("Reel commenter profile unavailable",e);}}
      const initial=esc((c.displayName||"M").trim().charAt(0).toUpperCase());
      return '<article class="reel-comment"><div class="reel-comment-avatar">'+(avatar?'<img src="'+esc(avatar)+'" alt="" loading="lazy">':initial)+'</div><div class="reel-comment-content"><b>' + esc(c.displayName || "MILOOP member") + '</b><p>' + esc(c.text || "") + '</p><small>' + esc(timeLabel(c.createdAt)) + '</small></div></article>';
    }));
    list.innerHTML = comments.join("");
    list.scrollTop = list.scrollHeight;
  } catch (error) {
    console.error("Could not load Reel comments:", error);
    list.innerHTML = '<p class="reels-upload-help">Comments could not be loaded.</p>';
  }
}
$("closeReelComments").addEventListener("click", () => commentsDialog.close());
$("openCreatorAnalytics").addEventListener("click", openCreatorAnalytics);
$("closeReelAnalytics").addEventListener("click", () => $("reelAnalyticsDialog").close());
$("reelAnalyticsDialog").addEventListener("click", event => { if (event.target === $("reelAnalyticsDialog")) $("reelAnalyticsDialog").close(); });
commentsDialog.addEventListener("click", event => { if (event.target === commentsDialog) commentsDialog.close(); });
$("reelCommentForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!await requireLogin() || !activeCommentPost) return;
  const input = $("reelCommentInput");
  const text = input.value.trim();
  if (!text) return;
  const button = $("reelCommentForm").querySelector("button");
  button.disabled = true;
  try {
    const profile = await getProfile(currentUser.uid);
    const displayName = profile.displayName || currentUser.displayName || currentUser.email?.split("@")[0] || "MILOOP member";
    await addDoc(collection(db, "posts", activeCommentPost, "comments"), {
      uid: currentUser.uid,
      displayName,
      text,
      createdAt: serverTimestamp()
    });
    input.value = "";
    await loadComments(activeCommentPost);
  } catch (error) {
    console.error("Could not add Reel comment:", error);
    toast("Could not send your comment.");
  } finally { button.disabled = false; }
});
onAuthStateChanged(auth, user => {
  currentUser = user;
  $("openReelUpload").textContent = user ? "＋ Create" : "Sign in";
  if (!user) {
    $("openReelUpload").onclick = () => { location.href = "index.html"; };
  } else {
    $("openReelUpload").onclick = openUpload;
    observeVideos();
  }
});
loadReels();
