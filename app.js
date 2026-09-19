// app.js
// منطق صفحة تسجيل الدخول / إنشاء حساب جديد + نظام الإحالة.

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
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const loginTab = document.getElementById("loginTab");
const signupTab = document.getElementById("signupTab");
const submitBtn = document.getElementById("submitBtn");
const authMsg = document.getElementById("authMsg");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const referralBanner = document.getElementById("referralBanner");

// مكافآت نظام الإحالة
const REFERRAL_BONUS_REFERRER = 50;   // ما يحصل عليه صاحب رابط الإحالة
const REFERRAL_BONUS_NEW_USER = 20;   // ما يحصل عليه المستخدم الجديد المُحال

let mode = "login"; // أو "signup"

// ---------- التقاط رمز الإحالة من الرابط (?ref=SERIAL) ----------
const urlParams = new URLSearchParams(window.location.search);
const refCode = (urlParams.get("ref") || "").trim();

if (refCode && referralBanner) {
  referralBanner.textContent = `تمت دعوتك عبر رمز إحالة: ${refCode} — ستحصل على ${REFERRAL_BONUS_NEW_USER} نقطة إضافية عند إنشاء حسابك.`;
  referralBanner.style.display = "block";
  // نجعل تبويب "حساب جديد" مفعّلًا مباشرة لتسهيل الانضمام عبر رابط الإحالة
  signupTab.click();
}

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

      // التحقق من صحة رمز الإحالة ومنح المكافآت
      let validReferrer = null;
      let startingBalance = 0;

      if (refCode) {
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("serialId", "==", refCode));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          const referrerDoc = snapshot.docs[0];
          // لا يمكن للمستخدم إحالة نفسه بنفس رقم الحساب (احتياط إضافي)
          if (referrerDoc.id !== credential.user.uid) {
            validReferrer = refCode;
            startingBalance = REFERRAL_BONUS_NEW_USER;

            await updateDoc(doc(db, "users", referrerDoc.id), {
              balance: increment(REFERRAL_BONUS_REFERRER),
              referralCount: increment(1),
              referralEarnings: increment(REFERRAL_BONUS_REFERRER)
            });
          }
        }
      }

      await setDoc(doc(db, "users", credential.user.uid), {
        email: email,
        serialId: newSerialId,
        balance: startingBalance,
        miningLevel: 1,
        referralCode: newSerialId,
        referredBy: validReferrer,
        referralCount: 0,
        referralEarnings: 0,
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

// توليد رقم حساب تسلسلي فريد يبدأ من 19950000 ويزيد بمقدار 1 لكل حساب جديد
async function generateSerialId() {
  const counterRef = doc(db, "counters", "users");
  const START_ID = 19950000;

  const newCount = await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    const current = counterDoc.exists() ? counterDoc.data().count : (START_ID - 1);
    const next = current + 1;
    transaction.set(counterRef, { count: next });
    return next;
  });

  return String(newCount);
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
