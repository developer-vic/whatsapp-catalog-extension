// Firebase initialization shared between popup and background scripts

// Ensure Firebase SDKs are loaded before this script
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBXbzHXTKbT5qwPw9N8TJLIk5QSREDRc8U",
  authDomain: "catalog-uploader.firebaseapp.com",
  projectId: "catalog-uploader",
  storageBucket: "catalog-uploader.firebasestorage.app",
  messagingSenderId: "451635953611",
  appId: "1:451635953611:web:1bf7325aad0db15a6c004e",
  measurementId: "G-CTSS0ZX6LM" 
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


