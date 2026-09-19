// dashboard.js
// منطق لوحة تحكم المستخدم: عرض البيانات، التعدين التجريبي، تسجيل الخروج.

import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  doc,
  getDoc,
  updateDoc,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const userNameEl = document.getElementById("userName");
const serialIdEl = document.getElementById("serialId");
const userEmailEl = document.getElementById("userEmail");
const balanceEl = document.getElementById("balance");
const miningStatusEl = document.getElementById("miningStatus");
const miningCounterEl = document.getElementById("miningCounter");
const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");
const logoutButton = document.getElementById("logoutButton");

const RATE_PER_SECOND = 0.10;

let currentUid = null;
let currentBalance = 0;
let sessionPoints = 0;
let intervalId = null;

// ---------- تسجيل الخروج ----------
logoutButton.addEventListener("click", () => {
  stopMining(false); // إيقاف بدون حفظ (سيُحفظ يدويًا إن أراد المستخدم قبل الخروج)
  signOut(auth);
});

// ---------- مراقبة حالة تسجيل الدخول ----------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUid = user.uid;
  await loadUserData();
});

async function loadUserData() {
  try {
    const userRef = doc(db, "users", currentUid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      userNameEl.textContent = "مستخدم";
      return;
    }

    const data = snap.data();
    currentBalance = data.balance ?? 0;

    userNameEl.textContent = data.email ? data.email.split("@")[0] : "مستخدم";
    userEmailEl.textContent = data.email ?? "---";
    serialIdEl.textContent = data.serialId ?? "---";
    balanceEl.textContent = currentBalance.toFixed(2);
  } catch (err) {
    console.error("خطأ في تحميل بيانات المستخدم:", err);
  }
}

// ---------- بدء التعدين (محاكاة) ----------
startButton.addEventListener("click", () => {
  if (intervalId) return; // يعمل مسبقًا

  miningStatusEl.textContent = "يعمل";

  intervalId = setInterval(() => {
    sessionPoints += RATE_PER_SECOND;
    miningCounterEl.textContent = sessionPoints.toFixed(2);
  }, 1000);
});

// ---------- إيقاف التعدين وحفظ النقاط في الرصيد ----------
stopButton.addEventListener("click", () => stopMining(true));

async function stopMining(save) {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  miningStatusEl.textContent = "متوقف";

  if (save && sessionPoints > 0 && currentUid) {
    try {
      const userRef = doc(db, "users", currentUid);
      await updateDoc(userRef, {
        balance: increment(sessionPoints)
      });
      currentBalance += sessionPoints;
      balanceEl.textContent = currentBalance.toFixed(2);
    } catch (err) {
      console.error("خطأ في حفظ النقاط:", err);
    }
  }

  sessionPoints = 0;
  miningCounterEl.textContent = "0.00";
}
