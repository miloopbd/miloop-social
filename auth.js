import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, updateProfile, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { auth, db } from "./firebase.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

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

// Add password recovery without changing the existing login form markup.
const forgotButton = document.createElement("button");
forgotButton.type = "button";
forgotButton.id = "forgotPassword";
forgotButton.className = "link-btn";
forgotButton.textContent = "Forgot password?";
forgotButton.style.display = "block";
forgotButton.style.margin = "10px 0";
passwordInput.closest(".auth-label")?.insertAdjacentElement("afterend", forgotButton);

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

function showError(message, success = false) {
  errorBox.textContent = message;
  errorBox.style.color = success ? "#087443" : "";
}
function setMode(next) {
  mode = next;
  const signup = mode === "signup";
  title.textContent = signup ? "Create your account" : "Sign in to MILOOP";
  intro.textContent = signup ? "A few details and you’re in." : "Connect with your community.";
  nameLabel.hidden = !signup;
  nameInput.required = signup;
  passwordInput.autocomplete = signup ? "new-password" : "current-password";
  forgotButton.hidden = signup || !!currentUser;
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
async function updateAccountUI(user) {
  currentUser = user;
  openButton.textContent = user ? "Account" : "Sign in";
  signOutButton.hidden = !user;
  forgotButton.hidden = !!user || mode === "signup";

  let displayName = "Guest";
  if (user) {
    displayName = user.displayName?.trim() || user.email?.split("@")[0] || "MILOOP member";
    // The editable MILOOP profile name is stored in publicProfiles.
    try {
      const profileSnap = await getDoc(doc(db, "publicProfiles", user.uid));
      const profileName = profileSnap.exists() ? profileSnap.data()?.displayName?.trim() : "";
      if (profileName) displayName = profileName;
    } catch (error) {
      console.warn("Could not load public profile name:", error);
    }
    // Ignore a slow profile response if another account has since signed in.
    if (currentUser?.uid !== user.uid) return;
  }

  const initial = user ? displayName.charAt(0).toUpperCase() : "G";
  $("profile").textContent = initial;
  document.querySelectorAll(".user-mini b").forEach(el => el.textContent = displayName);
  document.querySelectorAll(".compose-prompt").forEach(el => {
    el.textContent = user ? `What’s on your mind, ${displayName}?` : "Sign in to share with your loop";
  });

  const postDialogUser = document.querySelector("#postDialog .dialog-user");
  if (postDialogUser) {
    const name = postDialogUser.querySelector("b");
    const avatar = postDialogUser.querySelector(".avatar");
    if (name) name.textContent = displayName;
    if (avatar) avatar.textContent = initial;
  }

  const welcome = document.querySelector(".welcome h1");
  if (welcome) welcome.innerHTML = user
    ? `Welcome back, ${escapeText(displayName)} <span>✦</span>`
    : 'Welcome to MILOOP <span>✦</span>';
}
function escapeText(value) {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function configReady() {
  return firebaseConfig && firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("PASTE_") && firebaseConfig.projectId && !firebaseConfig.projectId.startsWith("PASTE_");
}
openButton.addEventListener("click", () => {
  setMode("signin");
  if (currentUser) {
    title.textContent = "Your MILOOP account";
    intro.textContent = currentUser.email || "You’re signed in.";
    nameLabel.hidden = true;
    emailInput.value = currentUser.email || "";
    passwordInput.hidden = true;
    forgotButton.hidden = true;
    submit.hidden = true;
    switchText.textContent = "Signed in as";
    switchButton.hidden = true;
  } else {
    passwordInput.hidden = false;
    forgotButton.hidden = false;
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

forgotButton.addEventListener("click", async () => {
  const email = emailInput.value.trim().toLowerCase();
  if (!email) {
    showError("Enter your account email address first.");
    emailInput.focus();
    return;
  }
  if (!emailInput.checkValidity()) {
    showError("Please enter a valid email address.");
    emailInput.focus();
    return;
  }
  forgotButton.disabled = true;
  forgotButton.textContent = "Sending reset link…";
  showError("");
  try {
    await sendPasswordResetEmail(auth, email);
    showError("If an account exists for this email, a password reset link has been sent. Check your inbox and spam folder.", true);
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      showError("If an account exists for this email, a password reset link has been sent. Check your inbox and spam folder.", true);
    } else {
      showError(friendlyError(error));
    }
  } finally {
    forgotButton.disabled = false;
    forgotButton.textContent = "Forgot password?";
  }
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  submit.disabled = true;
  submit.textContent = mode === "signup" ? "Creating account…" : "Signing in…";
  showError("");
  try {
    const email = emailInput.value.trim().toLowerCase();
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
