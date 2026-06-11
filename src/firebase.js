import { initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSyAACpqbaGqmxIQXQGbutiFcKfPaPcRLvEk",
  authDomain: "van-hanh-shop.firebaseapp.com",
  projectId: "van-hanh-shop",
  storageBucket: "van-hanh-shop.firebasestorage.app",
  messagingSenderId: "497676651730",
  appId: "1:497676651730:web:614e9c2996989e7aa6b10b"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export default app;
