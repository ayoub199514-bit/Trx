// admin.js
// لوحة تحكم الإدارة: تسجيل دخول، البحث عن حساب برقم الحساب (serialId)، وتعديل الرصيد يدويًا.

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { auth, db } from "./firebase-config.js";

// !! مهم: ضع هنا الـ UID الخاص بحساب الأدمن (تجده في Firebase Console > Authentication)
// هذا فقط تحقق إضافي في الواجهة؛ الحماية الحقيقية يجب أن تكون في Firestore rules.
const ADMIN_UID = "3zoMCTW55hZkdgju68Yk7bqEUi33";

const loginBox = document.getElementById("loginBox");
const adminPanel = document.getElementById("adminPanel");
const loginMsg = document.getElementById("loginMsg");

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const searchBtn = document.getElementById("searchBtn");
const addBtn = document.getElementById("addBtn");
const subBtn = document.getElementById("subBtn");

const resultBox = document.getElementById("resultBox");
const actionsBox = document.getElementById("actionsBox");
const msgBox = document.getElementById("msgBox");

let currentUserDocId = null; // معرف مستند المستخدم الحالي في Firestore بعد البحث

// تسجيل خروج تلقائي عند فتح الصفحة، حتى يُطلب البريد وكلمة المرور في كل مرة
// (بدل أن يبقى Firebase مسجّلاً الدخول تلقائيًا من الجلسة السابقة)
signOut(auth).catch(() => {});

// ---------- تسجيل الدخول ----------
loginBtn.addEventListener("click", async () => {
  const email = document.getElementById("adminEmail").value.trim();
  const password = document.getElementById("adminPassword").value;

  if (!email || !password) {
    loginMsg.textContent = "أدخل البريد الإلكتروني وكلمة المرور.";
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    loginMsg.textContent = "فشل تسجيل الدخول: " + err.message;
  }
});

logoutBtn.addEventListener("click", () => {
  signOut(auth);
});

// ---------- مراقبة حالة تسجيل الدخول ----------
onAuthStateChanged(auth, (user) => {
  if (user && user.uid === ADMIN_UID) {
    loginBox.style.display = "none";
    adminPanel.style.display = "block";
    loginMsg.textContent = "";
  } else {
    loginBox.style.display = "block";
    adminPanel.style.display = "none";
    if (user && user.uid !== ADMIN_UID) {
      loginMsg.textContent = "هذا الحساب لا يملك صلاحية الإدارة.";
      signOut(auth);
    }
  }
});

// ---------- البحث عن حساب برقم الحساب ----------
searchBtn.addEventListener("click", async () => {
  const serial = document.getElementById("searchSerial").value.trim();
  resultBox.textContent = "";
  actionsBox.style.display = "none";
  currentUserDocId = null;

  if (!serial) {
    resultBox.textContent = "أدخل رقم الحساب أولاً.";
    return;
  }

  try {
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("serialId", "==", serial));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      resultBox.textContent = "لم يتم العثور على حساب بهذا الرقم.";
      return;
    }

    const userDoc = snapshot.docs[0];
    const data = userDoc.data();
    currentUserDocId = userDoc.id;

    resultBox.innerHTML = `
      البريد الإلكتروني: ${data.email ?? "---"}<br>
      الرصيد الحالي: ${(data.balance ?? 0).toFixed(2)}
    `;
    actionsBox.style.display = "block";
  } catch (err) {
    resultBox.textContent = "خطأ أثناء البحث: " + err.message;
  }
});

// ---------- شحن الرصيد (زيادة) ----------
addBtn.addEventListener("click", () => adjustBalance(1));

// ---------- سحب من الرصيد (خفض) ----------
subBtn.addEventListener("click", () => adjustBalance(-1));

async function adjustBalance(sign) {
  msgBox.textContent = "";

  if (!currentUserDocId) {
    msgBox.textContent = "ابحث عن حساب أولاً.";
    return;
  }

  const amount = parseFloat(document.getElementById("amountInput").value);
  if (isNaN(amount) || amount <= 0) {
    msgBox.textContent = "أدخل مبلغًا صحيحًا أكبر من صفر.";
    return;
  }

  try {
    const userRef = doc(db, "users", currentUserDocId);
    await updateDoc(userRef, {
      balance: increment(sign * amount)
    });

    msgBox.textContent = sign > 0
      ? `تم شحن ${amount.toFixed(2)} بنجاح.`
      : `تم خفض ${amount.toFixed(2)} بنجاح.`;

    // إعادة تحديث الرصيد المعروض
    searchBtn.click();
    document.getElementById("amountInput").value = "";
  } catch (err) {
    msgBox.textContent = "خطأ أثناء التحديث: " + err.message;
  }
}
