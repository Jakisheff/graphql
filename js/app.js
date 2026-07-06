import { signin, gql, getToken, setToken, clearToken, userIdFromToken } from "./api.js";
import { xpOverTimeChart, barChart, donutChart, formatXP } from "./charts.js";

const $ = (id) => document.getElementById(id);

/* ===================== GraphQL queries =====================
   The project requires all three query styles:
   - normal        → USER_QUERY
   - with arguments→ XP_QUERY / PROGRESS_QUERY (where / order_by)
   - nested        → object { } and user { } inside XP_QUERY / PROGRESS_QUERY
*/

// normal query: the authenticated user's own row
const USER_QUERY = `
{
  user {
    id
    login
    attrs
    createdAt
    auditRatio
    totalUp
    totalDown
  }
}`;

// query with arguments + nesting: XP transactions with their object
const XP_QUERY = `
query XP($type: String!) {
  transaction(
    where: { type: { _eq: $type } }
    order_by: { createdAt: asc }
  ) {
    amount
    createdAt
    path
    object {
      name
      type
    }
  }
}`;

// query with arguments + nesting: graded progress with object and user
const PROGRESS_QUERY = `
query Progress($userId: Int!) {
  progress(
    where: { userId: { _eq: $userId }, grade: { _is_null: false } }
    order_by: { createdAt: asc }
  ) {
    grade
    path
    createdAt
    object {
      name
      type
    }
    user {
      login
    }
  }
}`;

// query with arguments: best skills (highest amount per skill transaction type)
const SKILLS_QUERY = `
{
  transaction(
    where: { type: { _like: "skill_%" } }
    order_by: [{ type: asc }, { amount: desc }]
    distinct_on: type
  ) {
    type
    amount
  }
}`;

/* ===================== view switching ===================== */

function showLogin() {
  $("login-view").classList.remove("hidden");
  $("profile-view").classList.add("hidden");
  $("login-form").reset();
  $("login-error").classList.add("hidden");
}

function showProfile() {
  $("login-view").classList.add("hidden");
  $("profile-view").classList.remove("hidden");
}

function logout() {
  clearToken();
  showLogin();
}

/* ===================== login ===================== */

$("login-form").addEventListener("submit", async (evt) => {
  evt.preventDefault();
  const identifier = $("identifier").value.trim();
  const password = $("password").value;
  const errorEl = $("login-error");
  errorEl.classList.add("hidden");

  if (!identifier || !password) {
    errorEl.textContent = "Please fill in both fields.";
    errorEl.classList.remove("hidden");
    return;
  }

  const btn = $("login-btn");
  btn.disabled = true;
  btn.textContent = "Signing in…";
  try {
    setToken(await signin(identifier, password));
    showProfile();
    await loadProfile();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign in";
  }
});

$("logout-btn").addEventListener("click", logout);

/* ===================== data helpers ===================== */

// Headline XP = module XP: skip transactions earned inside a piscine
// (the piscine completion reward itself, e.g. ".../piscine-js", still counts).
function isModuleXP(tx) {
  return !/\/piscine-[^/]+\//.test(tx.path);
}

function prettyName(tx) {
  if (tx.object?.name && tx.object.name !== "0") return tx.object.name;
  return tx.path.split("/").filter(Boolean).pop() ?? tx.path;
}

/* ===================== profile ===================== */

async function loadProfile() {
  $("profile-loading").classList.remove("hidden");
  $("profile-error").classList.add("hidden");
  $("profile-body").classList.add("hidden");

  try {
    const userId = userIdFromToken(getToken());

    const [userData, xpData, skillsData] = await Promise.all([
      gql(USER_QUERY),
      gql(XP_QUERY, { type: "xp" }),
      gql(SKILLS_QUERY),
    ]);

    const user = userData.user[0];
    const progressData = await gql(PROGRESS_QUERY, { userId: userId ?? user.id });

    render(user, xpData.transaction, progressData.progress, skillsData.transaction);
    $("profile-loading").classList.add("hidden");
    $("profile-body").classList.remove("hidden");
  } catch (err) {
    if (err.unauthorized) {
      logout();
      $("login-error").textContent = err.message;
      $("login-error").classList.remove("hidden");
      return;
    }
    $("profile-loading").classList.add("hidden");
    $("profile-error").textContent = `Could not load profile: ${err.message}`;
    $("profile-error").classList.remove("hidden");
  }
}

function render(user, transactions, progress, skills) {
  /* ----- identity ----- */
  const attrs = user.attrs ?? {};
  const first = attrs.firstName ?? attrs.firstname ?? "";
  const last = attrs.lastName ?? attrs.lastname ?? "";
  const fullName = `${first} ${last}`.trim() || user.login;

  $("header-login").textContent = user.login;
  $("avatar").textContent = (fullName[0] ?? "?").toUpperCase();
  $("user-name").textContent = fullName;
  $("user-login").textContent = `@${user.login} · #${user.id}`;
  const memberSince = new Date(user.createdAt);
  $("user-meta").textContent =
    `${attrs.email ?? ""} ${attrs.email ? "· " : ""}since ${memberSince.toLocaleDateString()}`;

  /* ----- XP ----- */
  const moduleTx = transactions.filter(isModuleXP);
  const totalXP = moduleTx.reduce((sum, tx) => sum + tx.amount, 0);
  $("total-xp").textContent = formatXP(totalXP);
  $("xp-note").textContent = `${moduleTx.length} XP transactions in the main curriculum`;

  /* ----- audits ----- */
  const up = user.totalUp ?? 0;
  const down = user.totalDown ?? 0;
  const ratio = user.auditRatio ?? (down ? up / down : 0);
  $("audit-ratio").textContent = ratio.toFixed(2);
  $("audit-up").textContent = formatXP(up);
  $("audit-down").textContent = formatXP(down);
  const maxAudit = Math.max(up, down, 1);
  $("audit-up-bar").style.width = `${(up / maxAudit) * 100}%`;
  $("audit-down-bar").style.width = `${(down / maxAudit) * 100}%`;

  /* ----- projects pass/fail ----- */
  // keep the latest graded attempt per project
  const latest = new Map();
  for (const p of progress) {
    if (p.object?.type !== "project") continue;
    latest.set(p.path, p);
  }
  const graded = [...latest.values()];
  const passed = graded.filter((p) => p.grade >= 1).length;
  const failed = graded.length - passed;
  $("projects-passed").textContent = `${passed} passed`;
  $("projects-note").textContent = failed
    ? `${failed} failed attempt${failed > 1 ? "s" : ""} · ${graded.length} projects graded`
    : `${graded.length} projects graded`;

  /* ----- charts ----- */

  // 1. cumulative XP over time
  let cum = 0;
  const points = moduleTx.map((tx) => {
    cum += tx.amount;
    return { date: new Date(tx.createdAt), cum, amount: tx.amount, label: prettyName(tx) };
  });
  xpOverTimeChart($("chart-xp-time"), points);

  // 2. XP by project (top 10)
  const byProject = new Map();
  for (const tx of moduleTx) {
    const name = prettyName(tx);
    byProject.set(name, (byProject.get(name) ?? 0) + tx.amount);
  }
  const topProjects = [...byProject.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  barChart($("chart-xp-project"), topProjects);

  // 3. audit ratio donut
  donutChart(
    $("chart-audit"),
    [
      { label: "Done", value: up, color: "#2dd4bf", display: formatXP(up) },
      { label: "Received", value: down, color: "#7c5cff", display: formatXP(down) },
    ],
    ratio.toFixed(2),
    "audit ratio",
  );

  // 4. pass/fail donut
  donutChart(
    $("chart-passfail"),
    [
      { label: "Pass", value: passed, color: "#3fb950" },
      { label: "Fail", value: failed, color: "#f85149" },
    ],
    graded.length ? `${Math.round((passed / graded.length) * 100)}%` : "–",
    "success rate",
  );

  // 5. best skills (bonus, hidden when the cursus has no skill transactions)
  const topSkills = skills
    .map((s) => ({
      name: s.type.replace(/^skill_/, "").replace(/-/g, " "),
      value: s.amount,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  if (topSkills.length > 0) {
    $("skills-card").classList.remove("hidden");
    barChart($("chart-skills"), topSkills, {
      color: "#7c5cff",
      valueFmt: (v) => `${v}%`,
    });
  }
}

/* ===================== init ===================== */

if (getToken()) {
  showProfile();
  loadProfile();
} else {
  showLogin();
}
