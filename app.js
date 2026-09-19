// app.js
// منطق صفحة تسجيل الدخول / إنشاء حساب جديد.

import { auth, db } from "./firebase-config.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  doc,
  setDoc,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const loginTab = document.getElementById("loginTab");
const signupTab = document.getElementById("signupTab");
const submitBtn = document.getElementById("submitBtn");
const authMsg = document.getElementById("authMsg");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");

let mode = "login"; // أو "signup"

loginTab.addEventListener("click", () => {
  mode = "login";
  loginTab.classList.add("active");
  signupTab.classList.remove("active");
  submitBtn.textContent = "دخول";
  authMsg.textContent = "";
});

signupTab.addEventListener("click", () => {
  mode = "signup";
  signupTab.classList.add("active");
  loginTab.classList.remove("active");
  submitBtn.textContent = "إنشاء الحساب";
  authMsg.textContent = "";
});

// إذا كان المستخدم مسجّلًا دخوله مسبقًا، أرسله مباشرة للوحة التحكم
onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.href = "dashboard.html";
  }
});

submitBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  authMsg.textContent = "";

  if (!email || !password) {
    authMsg.textContent = "الرجاء إدخال البريد الإلكتروني وكلمة المرور.";
    return;
  }

  if (password.length < 6) {
    authMsg.textContent = "كلمة المرور يجب أن تكون 6 أحرف على الأقل.";
    return;
  }

  submitBtn.disabled = true;

  try {
    if (mode === "signup") {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const newSerialId = await generateSerialId();

      await setDoc(doc(db, "users", credential.user.uid), {
        email: email,
        serialId: newSerialId,
        balance: 0,
        createdAt: serverTimestamp()
      });
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
    // onAuthStateChanged سيتكفّل بإعادة التوجيه تلقائيًا بعد نجاح العملية
  } catch (err) {
    authMsg.textContent = "خطأ: " + translateError(err.code);
    submitBtn.disabled = false;
  }
});

// توليد رقم حساب تسلسلي فريد بصيغة MX-000001 باستخدام عدّاد في Firestore
async function generateSerialId() {
  const counterRef = doc(db, "counters", "users");

  const newCount = await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    const current = counterDoc.exists() ? counterDoc.data().count : 0;
    const next = current + 1;
    transaction.set(counterRef, { count: next });
    return next;
  });

  return "MX-" + String(newCount).padStart(6, "0");
}

function translateError(code) {
  const map = {
    "auth/email-already-in-use": "هذا البريد الإلكتروني مستخدم مسبقًا.",
    "auth/invalid-email": "صيغة البريد الإلكتروني غير صحيحة.",
    "auth/weak-password": "كلمة المرور ضعيفة جدًا.",
    "auth/user-not-found": "لا يوجد حساب بهذا البريد الإلكتروني.",
    "auth/wrong-password": "كلمة المرور غير صحيحة.",
    "auth/invalid-credential": "بيانات الدخول غير صحيحة."
  };
  return map[code] || code;
}
