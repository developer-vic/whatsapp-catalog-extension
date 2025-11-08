// Firebase initialization shared between popup and background scripts

// Ensure Firebase SDKs are loaded before this script
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "apiKey",
  authDomain: "app-name.firebaseapp.com",
  projectId: "app-nam",
  storageBucket: "app-nam.firebasestorage.app",
  messagingSenderId: "1234556",
  appId: "1:1234556:web:1abcd3456",
  measurementId: "G-ABCDEF"
};

if (typeof firebase === 'undefined') {
  throw new Error('Firebase SDK not loaded before firebase-init.js');
}

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const firebaseAuth = firebase.auth();
const firebaseFirestore = firebase.firestore();
const firebaseStorage = firebase.storage();

if (typeof self !== 'undefined') {
  self.firebaseAuth = firebaseAuth;
  self.firebaseFirestore = firebaseFirestore;
  self.firebaseApp = firebase.app();
  self.firebaseStorage = firebaseStorage;
}

