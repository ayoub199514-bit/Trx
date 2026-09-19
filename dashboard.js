// dashboard.js
// منطق لوحة تحكم المستخدم: عرض البيانات، رصيد TRX، شراء العضويات،
// التعدين التجريبي (بحد أقصى لكل دورة)، نظام الإحالة، طلبات السحب، وتسجيل الخروج.

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
  serverTimestamp,
  Timestamp
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

const trxBalanceEl = document.getElementById("trxBalanceEl");
const currentPlanLabel = document.getElementById("currentPlanLabel");
const currentRateLabel = document.getElementById("currentRateLabel");
const expiryLabel = document.getElementById("expiryLabel");
const cycleCapLabel = document.getElementById("cycleCapLabel");
const plansGrid = document.getElementById("plansGrid");
const planMsg = document.getElementById("planMsg");

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

// ---------- إعدادات خطط العضوية ----------
// ملاحظة: الأسعار (priceTRX) والمدة (durationDays) كما طلبتها بالضبط.
// معدل التعدين (rate) والحد الأقصى لكل دورة (cap) قيم مبدئية يسهل تعديلها من هنا.
const PLANS = [
  { level: 1, label: "المستوى الأول", priceTRX: 0.000001, durationDays: 30, rate: 0.10, cap: 1000 },
  { level: 2, label: "المستوى الثاني", priceTRX: 0.000002, durationDays: 60, rate: 0.20, cap: 2500 },
  { level: 3, label: "المستوى الثالث", priceTRX: 0.000003, durationDays: 90, rate: 0.35, cap: 5000 },
  { level: 4, label: "المستوى الخاص", priceTRX: 1, durationDays: 90, rate: 1.00, cap: 50000 }
];

const MIN_WITHDRAW = 100;
minWithdrawNote.textContent = MIN_WITHDRAW;

let currentUid = null;
let currentBalance = 0;
let currentTrxBalance = 0;
let currentMiningLevel = 0; // 0 = لا توجد عضوية نشطة
let currentCycleCap = 0;
let currentEarnedThisCycle = 0;
let membershipExpiresAt = null; // Date أو null
let sessionPoints = 0;
let intervalId = null;

function planForLevel(level) {
  return PLANS.find((p) => p.level === level) || null;
}

function membershipIsActive() {
  if (!currentMiningLevel) return false;
  if (!membershipExpiresAt) return false;
  if (Date.now() > membershipExpiresAt.getTime()) return false;
  if (currentEarnedThisCycle >= currentCycleCap) return false;
  return true;
}

// ---------- تسجيل الخروج ----------
logoutButton.addEventListener("click", () => {
  stopMining(false);
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
    currentTrxBalance = data.trxBalance ?? 0;
    currentMiningLevel = data.miningLevel ?? 0;
    currentCycleCap = data.cycleCap ?? 0;
    currentEarnedThisCycle = data.earnedThisCycle ?? 0;
    membershipExpiresAt = data.membershipExpiresAt?.toDate ? data.membershipExpiresAt.toDate() : null;

    userNameEl.textContent = data.email ? data.email.split("@")[0] : "مستخدم";
    userEmailEl.textContent = data.email ?? "---";
    serialIdEl.textContent = data.serialId ?? "---";
    balanceEl.textContent = currentBalance.toFixed(2);
    trxBalanceEl.textContent = `${currentTrxBalance.toFixed(6)} TRX`;

    renderMembershipBox();
    renderPlans();

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

function renderMembershipBox() {
  const plan = planForLevel(currentMiningLevel);
  const active = membershipIsActive();

  if (!plan) {
    currentPlanLabel.textContent = "لا توجد عضوية نشطة";
    currentRateLabel.textContent = "0.00 / ثانية";
    expiryLabel.textContent = "---";
    cycleCapLabel.textContent = "0 / 0";
    rateNoteEl.textContent = "0.00";
    return;
  }

  currentPlanLabel.textContent = active ? plan.label : `${plan.label} (منتهية)`;
  currentRateLabel.textContent = `${plan.rate.toFixed(2)} / ثانية`;
  expiryLabel.textContent = membershipExpiresAt
    ? membershipExpiresAt.toLocaleDateString("ar-EG")
    : "---";
  cycleCapLabel.textContent = `${currentEarnedThisCycle.toFixed(2)} / ${currentCycleCap}`;
  rateNoteEl.textContent = active ? plan.rate.toFixed(2) : "0.00";
}

function renderPlans() {
  plansGrid.innerHTML = PLANS.map((plan) => {
    const isCurrent = plan.level === currentMiningLevel && membershipIsActive();
    const canAfford = currentTrxBalance >= plan.priceTRX;
    return `
      <div class="plan-card ${isCurrent ? "active-plan" : ""}">
        <div class="plan-name">${plan.label}</div>
        <div class="plan-price">${plan.priceTRX} TRX</div>
        <div class="plan-meta">
          المدة: ${plan.durationDays} يوم<br>
          المعدل: ${plan.rate.toFixed(2)}/ثانية<br>
          الحد: ${plan.cap} نقطة
        </div>
        <button data-level="${plan.level}" ${!canAfford ? "disabled" : ""}>
          ${isCurrent ? "تجديد" : "شراء"}
        </button>
      </div>
    `;
  }).join("");

  plansGrid.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => buyPlan(parseInt(btn.dataset.level, 10)));
  });
}

// ---------- شراء / تجديد عضوية ----------
async function buyPlan(level) {
  planMsg.textContent = "";
  const plan = planForLevel(level);
  if (!plan) return;

  if (currentTrxBalance < plan.priceTRX) {
    planMsg.textContent = "رصيد TRX غير كافٍ لهذه الخطة.";
    return;
  }

  // إيقاف أي تعدين جاري قبل تبديل الخطة (دون حفظ النقاط المعلّقة يدويًا هنا؛ سنحفظها أولاً)
  await stopMining(true);

  try {
    const userRef = doc(db, "users", currentUid);
    const expiresAt = new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000);

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(userRef);
      const data = snap.data();
      const trxNow = data.trxBalance ?? 0;

      if (trxNow < plan.priceTRX) {
        throw new Error("رصيد TRX غير كافٍ لهذه الخطة.");
      }

      transaction.update(userRef, {
        trxBalance: trxNow - plan.priceTRX,
        miningLevel: plan.level,
        cycleCap: plan.cap,
        earnedThisCycle: 0,
        membershipExpiresAt: Timestamp.fromDate(expiresAt)
      });
    });

    currentTrxBalance -= plan.priceTRX;
    currentMiningLevel = plan.level;
    currentCycleCap = plan.cap;
    currentEarnedThisCycle = 0;
    membershipExpiresAt = expiresAt;

    trxBalanceEl.textContent = `${currentTrxBalance.toFixed(6)} TRX`;
    renderMembershipBox();
    renderPlans();
    planMsg.textContent = `تم تفعيل ${plan.label} بنجاح.`;
  } catch (err) {
    planMsg.textContent = "خطأ: " + err.message;
  }
}

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

  if (!membershipIsActive()) {
    miningStatusEl.textContent = "متوقف";
    planMsg.textContent = "لا توجد عضوية نشطة أو وصلت للحد الأقصى — اشترِ خطة لبدء التعدين.";
    return;
  }

  const plan = planForLevel(currentMiningLevel);
  miningStatusEl.textContent = "يعمل";

  intervalId = setInterval(() => {
    if (currentEarnedThisCycle + sessionPoints + plan.rate > currentCycleCap) {
      // وصلنا للحد الأقصى لهذه الدورة: نحفظ ما تبقى ثم نوقف
      stopMining(true);
      planMsg.textContent = "وصلت للحد الأقصى لهذه الدورة. اشترِ عضوية جديدة لمتابعة التعدين.";
      return;
    }
    sessionPoints += plan.rate;
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
      const pointsToSave = sessionPoints;

      await updateDoc(userRef, {
        balance: increment(pointsToSave),
        earnedThisCycle: increment(pointsToSave)
      });

      currentBalance += pointsToSave;
      currentEarnedThisCycle += pointsToSave;
      balanceEl.textContent = currentBalance.toFixed(2);
      renderMembershipBox();
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
