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
  increment,
  serverTimestamp
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

const refreshWithdrawBtn = document.getElementById("refreshWithdrawBtn");
const withdrawRequestsBox = document.getElementById("withdrawRequestsBox");

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
    loadWithdrawRequests();
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

// ---------- طلبات السحب المعلّقة ----------
refreshWithdrawBtn.addEventListener("click", () => loadWithdrawRequests());

async function loadWithdrawRequests() {
  withdrawRequestsBox.innerHTML = '<p class="empty-note">جارٍ التحميل...</p>';

  try {
    const wRef = collection(db, "withdrawals");
    const q = query(wRef, where("status", "==", "pending"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      withdrawRequestsBox.innerHTML = '<p class="empty-note">لا توجد طلبات سحب معلّقة حاليًا.</p>';
      return;
    }

    const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => {
      const ta = a.requestedAt?.toMillis ? a.requestedAt.toMillis() : 0;
      const tb = b.requestedAt?.toMillis ? b.requestedAt.toMillis() : 0;
      return ta - tb; // الأقدم أولًا
    });

    withdrawRequestsBox.innerHTML = items.map((item) => `
      <div class="withdraw-request-item" data-id="${item.id}" data-uid="${item.uid}" data-amount="${item.amount}">
        <div class="wr-row"><strong>${item.amount.toFixed(2)}</strong> نقطة — الحساب #${item.serialId ?? "---"}</div>
        <div class="wr-row">${item.email ?? "---"}</div>
        <div class="wr-row">المحفظة: ${item.walletAddress ?? "---"}</div>
        <div class="wr-actions">
          <button class="wr-approve" data-action="approve">قبول</button>
          <button class="wr-reject" data-action="reject">رفض (استرجاع الرصيد)</button>
        </div>
      </div>
    `).join("");

    withdrawRequestsBox.querySelectorAll(".withdraw-request-item").forEach((el) => {
      el.querySelectorAll("button").forEach((btn) => {
        btn.addEventListener("click", () => handleWithdrawAction(el, btn.dataset.action));
      });
    });
  } catch (err) {
    withdrawRequestsBox.innerHTML = `<p class="empty-note">خطأ في تحميل الطلبات: ${err.message}</p>`;
  }
}

async function handleWithdrawAction(el, action) {
  const withdrawId = el.dataset.id;
  const uid = el.dataset.uid;
  const amount = parseFloat(el.dataset.amount);

  el.querySelectorAll("button").forEach((b) => (b.disabled = true));

  try {
    const withdrawRef = doc(db, "withdrawals", withdrawId);

    if (action === "approve") {
      await updateDoc(withdrawRef, {
        status: "approved",
        processedAt: serverTimestamp()
      });
    } else {
      // الرفض: نسترجع المبلغ للمستخدم لأنه كان قد خُصم عند تقديم الطلب
      await updateDoc(withdrawRef, {
        status: "rejected",
        processedAt: serverTimestamp()
      });
      await updateDoc(doc(db, "users", uid), {
        balance: increment(amount)
      });
    }

    el.remove();
    if (!withdrawRequestsBox.querySelector(".withdraw-request-item")) {
      withdrawRequestsBox.innerHTML = '<p class="empty-note">لا توجد طلبات سحب معلّقة حاليًا.</p>';
    }
  } catch (err) {
    alert("خطأ أثناء معالجة الطلب: " + err.message);
    el.querySelectorAll("button").forEach((b) => (b.disabled = false));
  }
}
