// firebase-config.js
// إعداد Firebase — نسخة تعمل مباشرة كملف ثابت (بدون npm/webpack) عبر روابط CDN.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";

// إعدادات مشروعك في Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAUcN2d91gB-vwBH9Rl1AzD4VOoUmSDRWw",
  authDomain: "trxmyning.firebaseapp.com",
  databaseURL: "https://trxmyning-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "trxmyning",
  storageBucket: "trxmyning.firebasestorage.app",
  messagingSenderId: "461376604119",
  appId: "1:461376604119:web:7560b1ea55952a69dc2d92",
  measurementId: "G-LK0GYVD8R5"
};

// تهيئة Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// تفعيل Analytics فقط إذا كان مدعومًا في بيئة التشغيل الحالية (يفشل بصمت في بعض المتصفحات/الوضع الخاص)
isSupported().then((supported) => {
  if (supported) {
    getAnalytics(app);
  }
});
