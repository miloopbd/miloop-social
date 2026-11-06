import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { auth, db } from "./firebase.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = id => document.getElementById(id);
const dialog = $("authDialog");
const form = $("authForm");
const title = $("authTitle");
const intro = $("authIntro");
const nameLabel = $("nameLabel");
const nameInput = $("authName");
const emailInput = $("authEmail");
const passwordInput = $("authPassword");
const submit = $("authSubmit");
const errorBox = $("authError");
const switchText = $("authSwitchText");
const switchButton = $("authSwitch");
const signOutButton = $("signOut");
const openButton = $("authOpen");
let mode = "signin";
let currentUser = null;

async function syncUserProfile(user) {
  if (!db || !user) return;
  const profileRef = doc(db, "users", user.uid);
  const profileSnap = await getDoc(profileRef);
  const profileData = {
    uid: user.uid,
    displayName: user.displayName || "",
    email: user.email || "",
    updatedAt: serverTimestamp()
  };
  if (!profileSnap.exists()) profileData.createdAt = serverTimestamp();
  await setDoc(profileRef, profileData, { merge: true });
}

function showError(message) { errorBox.textContent = message; }
function setMode(next) {
  mode = next;
  const signup = mode === "signup";
  title.textContent = signup ? "Create your account" : "Sign in to MILOOP";
  intro.textContent = signup ? "A few details and you’re in." : "Connect with your community.";
  nameLabel.hidden = !signup;
  nameInput.required = signup;
  passwordInput.autocomplete = signup ? "new-password" : "current-password";
  submit.textContent = signup ? "Create account" : "Sign in";
  switchText.textContent = signup ? "Already have an account?" : "New to MILOOP?";
  switchButton.textContent = signup ? "Sign in" : "Create account";
  showError("");
}
function friendlyError(error) {
  const code = error?.code || "";
  const messages = {
    "auth/email-already-in-use":"An account already exists with this email.",
    "auth/invalid-email":"Please enter a valid email address.",
    "auth/weak-password":"Choose a stronger password with at least 6 characters.",
    "auth/user-not-found":"No account was found with this email.",
    "auth/wrong-password":"The email or password is incorrect.",
    "auth/invalid-credential":"The email or password is incorrect.",
    "auth/too-many-requests":"Too many attempts. Please wait a while and try again.",
    "auth/network-request-failed":"Network problem. Check your internet connection.",
    "auth/operation-not-allowed":"Email/Password sign-in is not enabled in Firebase Authentication."
  };
  return messages[code] || "Authentication failed. Check your Firebase setup and try again.";
}
function updateAccountUI(user) {
  currentUser = user;
  openButton.textContent = user ? "Account" : "Sign in";
  signOutButton.hidden = !user;
  $("profile").textContent = user ? (user.displayName || user.email || "U").trim().charAt(0).toUpperCase() : "I";
  const displayName = user?.displayName || user?.email?.split("@")[0] || "Imran";
  document.querySelectorAll(".user-mini b").forEach(el => el.textContent = displayName);
  document.querySelectorAll(".compose-prompt").forEach(el => el.textContent = user ? `What’s on your mind, ${displayName}?` : "Sign in to share with your loop");
  const welcome = document.querySelector(".welcome h1");
  if (welcome) welcome.innerHTML = user ? `Welcome back, ${escapeText(displayName)} <span>✦</span>` : 'Welcome to MILOOP <span>✦</span>';
}
function escapeText(value) {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function configReady() {
  return firebaseConfig && firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("PASTE_") && firebaseConfig.projectId && !firebaseConfig.projectId.startsWith("PASTE_");
}
openButton.addEventListener("click", () => {
  setMode(currentUser ? "signin" : "signin");
  if (currentUser) {
    title.textContent = "Your MILOOP account";
    intro.textContent = currentUser.email || "You’re signed in.";
    nameLabel.hidden = true;
    emailInput.value = currentUser.email || "";
    passwordInput.hidden = true;
    submit.hidden = true;
    switchText.textContent = "Signed in as";
    switchButton.hidden = true;
  } else {
    passwordInput.hidden = false;
    submit.hidden = false;
    switchButton.hidden = false;
  }
  dialog.showModal();
});
$("authClose").addEventListener("click", () => dialog.close());
switchButton.addEventListener("click", () => {
  passwordInput.hidden = false;
  submit.hidden = false;
  switchButton.hidden = false;
  setMode(mode === "signin" ? "signup" : "signin");
});
form.addEventListener("submit", async event => {
  event.preventDefault();
  
  submit.disabled = true;
  submit.textContent = mode === "signup" ? "Creating account…" : "Signing in…";
  showError("");
  try {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (mode === "signup") {
      const name = nameInput.value.trim();
      if (name.length < 2) throw new Error("Please enter your name (at least 2 characters).");
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName: name });
      await syncUserProfile(credential.user);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
    dialog.close();
    form.reset();
    setMode("signin");
  } catch (error) {
    showError(error.message && !error.code ? error.message : friendlyError(error));
  } finally {
    submit.disabled = false;
    submit.textContent = mode === "signup" ? "Create account" : "Sign in";
  }
});
signOutButton.addEventListener("click", async () => {
  
  try {
    await signOut(auth);
    dialog.close();
    passwordInput.hidden = false;
    submit.hidden = false;
    switchButton.hidden = false;
    showError("");
  } catch (error) { showError(friendlyError(error)); }
});
document.querySelectorAll("[data-open-post]").forEach(button => button.addEventListener("click", event => {
  if (!currentUser) {
    event.preventDefault();
    event.stopImmediatePropagation();
    dialog.showModal();
    showError("Please sign in before creating a post.");
  }
}, true));

onAuthStateChanged(auth, user => {
  updateAccountUI(user);
  if (user) syncUserProfile(user).catch(error => {
    console.error("MILOOP profile sync error:", error);
    showError("You are signed in, but your profile could not sync. Check Firestore and its rules.");
  });
});
