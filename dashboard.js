// dashboard.js
// منطق لوحة تحكم المستخدم: عرض البيانات، التعدين التجريبي، المستويات،
// نظام الإحالة، طلبات السحب، وتسجيل الخروج.

import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  doc,
  getDoc,
  updateDoc,
  increment,
  runTransaction,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const userNameEl = document.getElementById("userName");
const serialIdEl = document.getElementById("serialId");
const userEmailEl = document.getElementById("userEmail");
const balanceEl = document.getElementById("balance");
const miningStatusEl = document.getElementById("miningStatus");
const miningCounterEl = document.getElementById("miningCounter");
const rateNoteEl = document.getElementById("rateNote");
const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");
const logoutButton = document.getElementById("logoutButton");

const currentLevelLabel = document.getElementById("currentLevelLabel");
const currentRateLabel = document.getElementById("currentRateLabel");
const nextLevelBox = document.getElementById("nextLevelBox");
const nextLevelLabel = document.getElementById("nextLevelLabel");
const upgradeButton = document.getElementById("upgradeButton");
const levelMsg = document.getElementById("levelMsg");

const referralLinkInput = document.getElementById("referralLinkInput");
const copyReferralBtn = document.getElementById("copyReferralBtn");
const referralCountEl = document.getElementById("referralCountEl");
const referralEarningsEl = document.getElementById("referralEarningsEl");

const withdrawAmountInput = document.getElementById("withdrawAmount");
const withdrawWalletInput = document.getElementById("withdrawWallet");
const withdrawButton = document.getElementById("withdrawButton");
const withdrawMsg = document.getElementById("withdrawMsg");
const withdrawHistory = document.getElementById("withdrawHistory");
const minWithdrawNote = document.getElementById("minWithdrawNote");

// ---------- إعدادات مستويات التعدين ----------
// كل مستوى: level، rate (نقطة/ثانية)، cost (تكلفة الترقية إليه من المستوى السابق)
const LEVELS = [
  { level: 1, rate: 0.10, cost: 0 },
  { level: 2, rate: 0.25, cost: 500 },
  { level: 3, rate: 0.50, cost: 2000 },
  { level: 4, rate: 1.00, cost: 5000 },
  { level: 5, rate: 2.00, cost: 15000 }
];

const MIN_WITHDRAW = 100;
minWithdrawNote.textContent = MIN_WITHDRAW;

let currentUid = null;
let currentBalance = 0;
let currentLevel = 1;
let sessionPoints = 0;
let intervalId = null;

function rateForLevel(level) {
  const found = LEVELS.find((l) => l.level === level);
  return found ? found.rate : LEVELS[0].rate;
}

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
  await loadWithdrawHistory();
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
    currentLevel = data.miningLevel ?? 1;

    userNameEl.textContent = data.email ? data.email.split("@")[0] : "مستخدم";
    userEmailEl.textContent = data.email ?? "---";
    serialIdEl.textContent = data.serialId ?? "---";
    balanceEl.textContent = currentBalance.toFixed(2);

    renderLevelBox();
    renderRateNote();

    // رابط الإحالة
    if (data.serialId) {
      referralLinkInput.value = `${window.location.origin}${window.location.pathname.replace("dashboard.html", "")}index.html?ref=${data.serialId}`;
    }
    referralCountEl.textContent = data.referralCount ?? 0;
    referralEarningsEl.textContent = (data.referralEarnings ?? 0).toFixed(2);
  } catch (err) {
    console.error("خطأ في تحميل بيانات المستخدم:", err);
  }
}

function renderRateNote() {
  const rate = rateForLevel(currentLevel).toFixed(2);
  rateNoteEl.textContent = rate;
  currentRateLabel.textContent = `${rate} / ثانية`;
}

function renderLevelBox() {
  currentLevelLabel.textContent = currentLevel;

  const next = LEVELS.find((l) => l.level === currentLevel + 1);
  if (!next) {
    nextLevelLabel.textContent = "أعلى مستوى تم الوصول إليه";
    upgradeButton.style.display = "none";
    return;
  }

  nextLevelLabel.textContent = `المستوى ${next.level} (${next.rate.toFixed(2)} / ثانية) — التكلفة: ${next.cost} نقطة`;
  upgradeButton.style.display = "inline-block";
  upgradeButton.disabled = currentBalance < next.cost;
}

// ---------- ترقية مستوى التعدين ----------
upgradeButton.addEventListener("click", async () => {
  levelMsg.textContent = "";
  const next = LEVELS.find((l) => l.level === currentLevel + 1);
  if (!next) return;

  if (currentBalance < next.cost) {
    levelMsg.textContent = "رصيدك غير كافٍ لهذه الترقية.";
    return;
  }

  upgradeButton.disabled = true;

  try {
    const userRef = doc(db, "users", currentUid);

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(userRef);
      const data = snap.data();
      const balanceNow = data.balance ?? 0;
      const levelNow = data.miningLevel ?? 1;

      if (levelNow !== currentLevel) {
        throw new Error("تم تحديث المستوى من مكان آخر، أعد المحاولة.");
      }
      if (balanceNow < next.cost) {
        throw new Error("رصيدك غير كافٍ لهذه الترقية.");
      }

      transaction.update(userRef, {
        balance: balanceNow - next.cost,
        miningLevel: next.level
      });
    });

    currentBalance -= next.cost;
    currentLevel = next.level;
    balanceEl.textContent = currentBalance.toFixed(2);
    renderLevelBox();
    renderRateNote();
    levelMsg.textContent = `تمت الترقية إلى المستوى ${next.level}.`;
  } catch (err) {
    levelMsg.textContent = "خطأ: " + err.message;
  } finally {
    renderLevelBox();
  }
});

// ---------- نسخ رابط الإحالة ----------
copyReferralBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(referralLinkInput.value);
    copyReferralBtn.textContent = "تم النسخ!";
    setTimeout(() => (copyReferralBtn.textContent = "نسخ الرابط"), 1500);
  } catch (err) {
    referralLinkInput.select();
    document.execCommand("copy");
  }
});

// ---------- بدء التعدين (محاكاة) ----------
startButton.addEventListener("click", () => {
  if (intervalId) return; // يعمل مسبقًا

  miningStatusEl.textContent = "يعمل";

  intervalId = setInterval(() => {
    sessionPoints += rateForLevel(currentLevel);
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
      renderLevelBox();
    } catch (err) {
      console.error("خطأ في حفظ النقاط:", err);
    }
  }

  sessionPoints = 0;
  miningCounterEl.textContent = "0.00";
}

// ---------- طلب سحب ----------
withdrawButton.addEventListener("click", async () => {
  withdrawMsg.textContent = "";

  const amount = parseFloat(withdrawAmountInput.value);
  const wallet = withdrawWalletInput.value.trim();

  if (!wallet) {
    withdrawMsg.textContent = "أدخل عنوان المحفظة.";
    return;
  }
  if (isNaN(amount) || amount < MIN_WITHDRAW) {
    withdrawMsg.textContent = `الحد الأدنى للسحب هو ${MIN_WITHDRAW} نقطة.`;
    return;
  }
  if (amount > currentBalance) {
    withdrawMsg.textContent = "رصيدك غير كافٍ لهذا المبلغ.";
    return;
  }

  withdrawButton.disabled = true;

  try {
    const userRef = doc(db, "users", currentUid);

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(userRef);
      const data = snap.data();
      const balanceNow = data.balance ?? 0;

      if (balanceNow < amount) {
        throw new Error("رصيدك غير كافٍ لهذا المبلغ.");
      }

      transaction.update(userRef, { balance: balanceNow - amount });
    });

    await addDoc(collection(db, "withdrawals"), {
      uid: currentUid,
      serialId: serialIdEl.textContent,
      email: userEmailEl.textContent,
      amount: amount,
      walletAddress: wallet,
      status: "pending",
      requestedAt: serverTimestamp()
    });

    currentBalance -= amount;
    balanceEl.textContent = currentBalance.toFixed(2);
    renderLevelBox();

    withdrawMsg.textContent = "تم إرسال طلب السحب بنجاح، بانتظار مراجعة الإدارة.";
    withdrawAmountInput.value = "";
    withdrawWalletInput.value = "";
    await loadWithdrawHistory();
  } catch (err) {
    withdrawMsg.textContent = "خطأ: " + err.message;
  } finally {
    withdrawButton.disabled = false;
  }
});

async function loadWithdrawHistory() {
  try {
    const wRef = collection(db, "withdrawals");
    const q = query(wRef, where("uid", "==", currentUid));
    const snapshot = await getDocs(q);

    const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => {
      const ta = a.requestedAt?.toMillis ? a.requestedAt.toMillis() : 0;
      const tb = b.requestedAt?.toMillis ? b.requestedAt.toMillis() : 0;
      return tb - ta;
    });

    if (items.length === 0) {
      withdrawHistory.innerHTML = '<p class="mining-note">لا توجد طلبات سحب سابقة.</p>';
      return;
    }

    const statusLabels = {
      pending: "قيد المراجعة",
      approved: "تمت الموافقة",
      rejected: "مرفوض"
    };

    withdrawHistory.innerHTML = items.map((item) => `
      <div class="withdraw-item">
        <span>${item.amount.toFixed(2)} نقطة — ${item.walletAddress}</span>
        <span class="status status-${item.status}">${statusLabels[item.status] || item.status}</span>
      </div>
    `).join("");
  } catch (err) {
    console.error("خطأ في تحميل طلبات السحب:", err);
  }
}
