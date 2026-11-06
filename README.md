# MILOOP — Connect. Share. Belong.

A responsive social-networking front-end built with HTML, CSS, and vanilla JavaScript, with Firebase Authentication integration.

## Current milestone
- Premium blue-and-white responsive home feed
- Story strip, trending topics, and suggested people
- Create-post dialog and demo in-page post publishing
- Like interactions, search, and feed sorting
- Firebase email/password registration, sign-in, session persistence, and sign-out
- Responsive mobile navigation

## Firebase setup (required for real authentication)
1. Create a Firebase project at https://console.firebase.google.com/.
2. Add a **Web app** to the project.
3. In Firebase Authentication → Sign-in method, enable **Email/Password**.
4. In Firebase Authentication → Settings → Authorized domains, add your GitHub Pages domain (for example, `miloopbd.github.io`).
5. Open `firebase-config.js` and replace the placeholder values with the Firebase web app config from Project settings → Your apps.
6. Publish the updated files and test registration/sign-in on the deployed HTTPS site.

The Firebase web app config is intended for browser use. Do not put service-account private keys, Admin SDK credentials, or other server secrets in this file. Protect data with Firebase Security Rules; authentication alone does not secure Firestore or Storage.

## Current limitations
Posts are still demo-only and are not stored in Firestore. Profile data is currently limited to Firebase Authentication's display name and email. Database-backed posts, media, messaging, notifications, and moderation are future milestones.

## Run
Use a local static server or GitHub Pages. Firebase Authentication's authorized domain and browser environment must be configured for sign-in to work.

## Roadmap
1. Complete Firebase project configuration and test authentication.
2. Add Firestore-backed user profiles, posts, comments, likes, and follows.
3. Add Firebase Storage for carefully validated photo/video uploads.
4. Implement stories, messaging, and notifications.
5. Add reporting, blocking, moderation, and admin tools.
6. Review Firestore and Storage security rules before public launch.
