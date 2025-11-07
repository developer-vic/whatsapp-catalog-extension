// Firebase initialization shared between popup and background scripts

// Ensure Firebase SDKs are loaded before this script
const firebaseConfig = {
  apiKey: "AIzaSyDSliEIQdxBhYrL6o9TZ4EEQIF6-PIzAJU",
  authDomain: "developervicc.firebaseapp.com",
  databaseURL: "https://developervicc-default-rtdb.firebaseio.com",
  projectId: "developervicc",
  storageBucket: "developervicc.appspot.com",
  messagingSenderId: "173684640461",
  appId: "1:173684640461:web:cce14b9c0260e48835f784",
  measurementId: "G-JJ05VLE30M"
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

