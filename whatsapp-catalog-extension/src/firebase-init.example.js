// Firebase initialization template.
// Copy this file to `src/firebase-init.js` and fill in your project credentials.

/* global firebase */

const firebaseConfig = {
  apiKey: 'REPLACE_WITH_API_KEY',
  authDomain: 'REPLACE_WITH_PROJECT_ID.firebaseapp.com',
  projectId: 'REPLACE_WITH_PROJECT_ID',
  storageBucket: 'REPLACE_WITH_PROJECT_ID.appspot.com',
  messagingSenderId: 'REPLACE_WITH_SENDER_ID',
  appId: 'REPLACE_WITH_APP_ID',
  measurementId: 'REPLACE_WITH_MEASUREMENT_ID'
};

if (typeof firebase === 'undefined') {
  throw new Error('Firebase SDK not loaded before firebase-init.js');
}

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const firebaseAuth = firebase.auth();
const firebaseFirestore = firebase.firestore();

if (typeof self !== 'undefined') {
  self.firebaseAuth = firebaseAuth;
  self.firebaseFirestore = firebaseFirestore;
  self.firebaseApp = firebase.app();
}

const firebaseConstants = {
  FIRESTORE_BASE_URL: 'https://firestore.googleapis.com/v1',
  FIREBASE_PROJECT_ID: firebase.app().options.projectId || firebaseConfig.projectId,
  FIREBASE_STORAGE_BUCKET: firebase.app().options.storageBucket || firebaseConfig.storageBucket
};

if (typeof self !== 'undefined') {
  self.firebaseConstants = firebaseConstants;
}


