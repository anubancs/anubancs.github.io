import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://qinfo.co';
const REPORT_URL = 'https://qinfo.co/pages/index.html?reportAttendStat21';
const USERNAME = process.env.QINFO_USERNAME;
const PASSWORD = process.env.QINFO_PASSWORD;
const HOST_ID = process.env.QINFO_HOST_ID || '1060220117';
const YEAR = Number(process.env.QINFO_ACADEMIC_YEAR || new Date().getFullYear());
const TZ = 'Asia/Bangkok';

if (!USERNAME || !PASSWORD) throw new Error('Missing QINFO_USERNAME or QINFO_PASSWORD GitHub Actions secrets');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: 'th-TH', timezoneId: TZ });
const page = await context.newPage();
const jsonResponses = [];
const responseTasks = [];

page.on('response', response => {
  const task = (async () => {
    const ct = response.headers()['content-type'] || '';
    if (!ct.includes('json') && !/getCountStudent|getStuByCid|morning_attendance/i.test(response.url())) return;
    try {
      if (response.status() < 200 || response.status() >= 300) return;
      const body = await response.json();
      jsonResponses.push({ url: response.url(), body });
    } catch { /* non-JSON response; deliberately ignore */ }
  })();
  responseTasks.push(task);
});

function visible(locator) { return locator.isVisible().catch(() => false); }
async function login() {
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);

  // Q-Info presents login as a modal/popup. Locate visible credential fields without
  // assuming a single framework-specific modal implementation.
  const passwordInputs = page.locator('input[type="password"]:visible');
  if (!(await passwordInputs.first().isVisible().catch(() => false))) {
    const opener = page.getByText(/เข้าสู่ระบบ|ลงชื่อเข้าใช้|login/i).first();
    if (await opener.isVisible().catch(() => false)) await opener.click();
  }
  await passwordInputs.first().waitFor({ state: 'visible', timeout: 20000 });
  const passwordInput = passwordInputs.first();
  const allVisibleInputs = page.locator('input:visible');
  const count = await allVisibleInputs.count();
  let usernameInput = null;
  for (let i = 0; i < count; i++) {
    const item = allVisibleInputs.nth(i);
    const type = (await item.getAttribute('type') || 'text').toLowerCase();
    const meta = [await item.getAttribute('name'), await item.getAttribute('id'), await item.getAttribute('placeholder')].join(' ').toLowerCase();
    if (type !== 'password' && /(user|login|account|email|ชื่อผู้ใช้)/i.test(meta)) { usernameInput = item; break; }
  }
  if (!usernameInput) {
    for (let i = 0; i < count; i++) {
      const item = allVisibleInputs.nth(i);
      if ((await item.getAttribute('type') || 'text').toLowerCase() !== 'password') { usernameInput = item; break; }
    }
  }
  if (!usernameInput) throw new Error('Login popup appeared but username field was not identifiable');

  await usernameInput.fill(USERNAME);
  await passwordInput.fill(PASSWORD);

  // The Q-Info popup may render its action as a styled div/link rather than
  // a native <button>. Try semantic and visible form controls, then submit by
  // pressing Enter in the password field (standard HTML form behavior).
  const candidates = page.getByRole('button', { name: /เข้าสู่ระบบ|ลงชื่อเข้าใช้|login|sign in/i });
  const candidateCount = await candidates.count();
  let submitted = false;
  for (let i = 0; i < candidateCount; i++) {
    if (await candidates.nth(i).isVisible().catch(() => false)) {
      await candidates.nth(i).click();
      submitted = true;
      break;
    }
  }
  if (!submitted) {
    const form = passwordInput.locator('xpath=ancestor::form[1]');
    const formActions = form.locator('button:visible, input[type="submit"]:visible, [role="button"]:visible, a:visible');
    const actionCount = await formActions.count();
    for (let i = 0; i < actionCount; i++) {
      const action = formActions.nth(i);
      const label = [
        await action.innerText().catch(() => ''),
        await action.getAttribute('aria-label').catch(() => ''),
        await action.getAttribute('title').catch(() => ''),
        await action.getAttribute('value').catch(() => '')
      ].join(' ');
      if (/เข้าสู่ระบบ|ลงชื่อเข้าใช้|login|sign.?in|ยืนยัน/i.test(label)) {
        await action.click();
        submitted = true;
        break;
      }
    }
  }
  if (!submitted) {
    try {
      await passwordInput.press('Enter');
      submitted = true;
    } catch {
      throw new Error('Could not submit the Q-Info login form using a visible action or Enter key');
    }
  }

  await page.waitForTimeout(3500);
  const bodyText = await page.locator('body').innerText().catch(() => '');
  if (/captcha|ยืนยันตัวตน|two.factor|verification code/i.test(bodyText)) {
    throw new Error('Q-Info requires an interactive CAPTCHA/MFA step; automation will not bypass it');
  }
  if (await passwordInputs.first().isVisible().catch(() => false)) {
    throw new Error('Login was not confirmed. Check credentials or Q-Info login flow.');
  }
}

function walk(value, predicate, found = []) {
  if (!value || typeof value !== 'object') return found;
  if (predicate(value)) found.push(value);
  if (Array.isArray(value)) for (const v of value) walk(v, predicate, found);
  else for (const v of Object.values(value)) walk(v, predicate, found);
  return found;
}
function unwrap(value) {
  if (typeof value === 'string') { try { return JSON.parse(value); } catch { return value; } }
  return value;
}
function normGender(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (['m','male','ชาย','1'].includes(v)) return 'm';
  if (['f','female','หญิง','2'].includes(v)) return 'f';
  return null;
}
function normStatus(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (['m','ขาดเรียน','ขาด','absent'].includes(v)) return 'absent';
  if (['ol','ลาป่วย','ป่วย','sick'].includes(v)) return 'sick';
  if (['s','ลากิจ','personal leave','leave'].includes(v)) return 'leave';
  if (['l','มาสาย','สาย','late'].includes(v)) return 'late';
  return 'normal';
}
function pickRows(root) {
  return walk(root, x => Array.isArray(x) && x.length > 0 && x.some(y => y && typeof y === 'object' && ('EducationClassDescription' in y || 'CID' in y)));
}
function dateBangkok() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function dateCompact(iso) { return iso.replaceAll('-', ''); }

try {
  await login();

  // Open the authenticated report shell first and discover the actual report
  // navigation exposed to this account. Q-Info may redirect unknown/direct
  // report URLs to its default school-conclusion page.
  await page.goto(BASE + '/pages/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  // Navigate through the exact menu hierarchy exposed by the teacher account.
  // Direct query-string navigation can be redirected to the default dashboard.
  const menuSteps = [
    { label: '2. รายงาน', pattern: /2\s*\.?\s*รายงาน/ },
    { label: '2.2 สถิติการมาเรียน', pattern: /2\s*\.?\s*2\s*สถิติการมาเรียน|สถิติการมาเรียน/ },
    { label: '2.2.1 รายวัน', pattern: /2\s*\.?\s*2\s*\.?\s*1\s*รายวัน|รายวัน/ }
  ];
  const clickedMenu = [];
  for (const step of menuSteps) {
    let clicked = false;
    // Teacher menus may be rendered inside an iframe.
    for (const context of page.frames()) {
      const candidates = context.getByText(step.pattern);
      const count = await candidates.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const item = candidates.nth(i);
        if (await item.isVisible().catch(() => false)) {
          await item.click({ timeout: 8000 }).catch(async () => {
            await item.evaluate(el => el.click()).catch(() => {});
          });
          clicked = true;
          clickedMenu.push(step.label + (context === page.mainFrame() ? '' : ' [iframe]'));
          await page.waitForTimeout(900);
          break;
        }
      }
      if (clicked) break;
    }
    if (!clicked) break;
  }
  const reportNav = [];
  for (const context of page.frames()) {
    const items = await context.locator('a[href], [onclick], [role="menuitem"], li, button').evaluateAll(nodes =>
      nodes.map(node => ({
        text: (node.innerText || node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100),
        href: node.getAttribute('href') || '',
        onclick: node.getAttribute('onclick') || ''
      })).filter(x => /รายงาน|สถิติ|มาเรียน|รายวัน|attendance|reportAttendStat21/i.test(x.text + ' ' + x.href + ' ' + x.onclick)).slice(0, 40)
    ).catch(() => []);
    if (items.length) reportNav.push({ frame: context.url().slice(0, 180), items });
  }
  if (clickedMenu.length !== menuSteps.length) {
    // Client-side redirects can abort goto; inspect the settled page afterward.
    await page.goto(REPORT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(error => {
      if (!/ERR_ABORTED|Navigation interrupted/i.test(String(error))) throw error;
    });
  }
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(3000);

  // The report page can render without automatically firing its year-change
  // handler in a headless session. Trigger the same handler used by the year
  // selector, then wait for the enrollment request rather than sleeping blindly.
  const countResponsePromise = page.waitForResponse(
    response => /getCountStudent/i.test(response.url()),
    { timeout: 30000 }
  ).catch(() => null);
  await page.waitForTimeout(2500);
  const reportTrigger = await page.evaluate(() => {
    if (typeof window.yearChange === 'function') {
      window.yearChange();
      return 'yearChange';
    }
    const selector = document.querySelector('#year, select[name="year"]');
    if (selector) {
      selector.dispatchEvent(new Event('change', { bubbles: true }));
      return 'year-select-change';
    }
    return 'no-year-control';
  });
  await countResponsePromise;
  await page.waitForTimeout(2500);
  await Promise.allSettled(responseTasks);

  const parsed = jsonResponses.map(x => ({ url: x.url, body: unwrap(x.body) }));
  const countPayloads = parsed.filter(x => /getCountStudent/i.test(x.url));
  const attendanceDocs = parsed.flatMap(x => walk(x.body, o => o && typeof o === 'object' && o.attend && typeof o.attend === 'object' && o.classRoomEdu));
  const rosterArrays = parsed.flatMap(x => pickRows(x.body)).filter(a => a.some(x => x && x.CID && x.EducationClassDescription !== undefined));
  if (!countPayloads.length) {
    const reportState = [];
    for (const context of page.frames()) {
      const state = await context.evaluate(() => ({
        title: document.title,
        url: location.pathname + location.search,
        yearChangeAvailable: typeof window.yearChange === 'function',
        yearValue: document.querySelector('#year, select[name="year"]')?.value || null,
        relevantText: (document.body?.innerText || '').split('\\n')
          .map(x => x.trim()).filter(x => /รายงาน|สถิติ|มาเรียน|รายวัน|เมนู|หน้าหลัก|attendance|report/i.test(x)).slice(0, 35),
        links: Array.from(document.querySelectorAll('a[href], [onclick], [role="menuitem"]'))
          .map(x => ({ text: (x.innerText || x.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 80),
            href: x.getAttribute('href') || '', onclick: x.getAttribute('onclick') || '' }))
          .filter(x => x.text || x.href || x.onclick).slice(0, 60)
      })).catch(() => ({ url: context.url(), inaccessible: true }));
      reportState.push(state);
    }
    throw new Error('Could not observe getCountStudent response after triggering ' + reportTrigger +
      '; reportState=' + JSON.stringify({ frames: reportState, reportNav, clickedMenu }));
  }
  if (!attendanceDocs.length) throw new Error('Could not observe morning_attendance JSON; verify report page/date and authorized access');
  if (!rosterArrays.length) throw new Error('Could not observe student roster response needed to map attendance IDs to classes');

  const doc = attendanceDocs.find(d => String(d.hostid) === HOST_ID && String(d.recdate) === dateCompact(dateBangkok())) || attendanceDocs[0];
  const roster = rosterArrays.sort((a,b) => b.length-a.length)[0];
  const enrollmentRoot = countPayloads.map(x => x.body);
  const enrollmentRows = walk(enrollmentRoot, o => o && typeof o === 'object' && o.EducationClassDescription !== undefined && o.Room !== undefined && o.St !== undefined);
  if (!enrollmentRows.length) throw new Error('Enrollment totals were received but could not be normalized');

  const roomChecked = doc.classRoomEdu || {};
  const byClass = new Map();
  const ensure = (label) => {
    if (!byClass.has(label)) byClass.set(label, { class_name: label, total_m: 0, total_f: 0, normal_m: 0, normal_f: 0, late_m: 0, late_f: 0, absent_m: 0, absent_f: 0, sick_m: 0, sick_f: 0, leave_m: 0, leave_f: 0, checked: false });
    return byClass.get(label);
  };
  for (const row of enrollmentRows) {
    const label = [row.EducationClassDescription, row.Room].filter(v => v !== undefined && v !== null && String(v).trim() !== '').join('/');
    const target = ensure(label);
    target.total_m += Number(row.StM || 0);
    target.total_f += Number(row.StF || 0);
  }

  const attend = doc.attend || {};
  const checkedKeys = new Set(Object.keys(roomChecked).filter(k => roomChecked[k]));
  for (const student of roster) {
    const cid = String(student.CID);
    if (!(cid in attend)) continue;
    const gender = normGender(student.Gender);
    if (!gender) throw new Error('Unknown gender encoding in Q-Info roster; refusing to publish potentially incorrect totals');
    const label = [student.EducationClassDescription, student.Room].filter(v => v !== undefined && v !== null && String(v).trim() !== '').join('/');
    const target = ensure(label);
    const status = normStatus(attend[cid]);
    if (status !== 'normal') target[`${status}_${gender}`] += 1;
    // The presence of any attendance entry for a roster member confirms this room
    // has attendance data. This avoids guessing Q-Info's internal room-key format.
    target.checked = true;
  }

  // For checked rooms, derive normal attendance as enrollment minus all recorded
  // exceptions. Unchecked rooms remain explicitly marked and are not treated as zero.
  for (const r of byClass.values()) {
    if (!r.checked) continue;
    for (const g of ['m','f']) {
      r[`normal_${g}`] = Math.max(0, r[`total_${g}`] - r[`late_${g}`] - r[`absent_${g}`] - r[`sick_${g}`] - r[`leave_${g}`]);
    }
  }
  const rows = [...byClass.values()].sort((a,b) => a.class_name.localeCompare(b.class_name, 'th'));
  const checkedRows = rows.filter(r => r.checked);
  if (!checkedRows.length || checkedRows.length !== rows.length) throw new Error(`Attendance is incomplete: checked ${checkedRows.length} of ${rows.length} class/room groups; refusing to publish school-wide totals`);
  const sum = key => checkedRows.reduce((n,r) => n + Number(r[key] || 0), 0);
  const students = sum('total_m') + sum('total_f');
  const present = sum('normal_m') + sum('normal_f') + sum('late_m') + sum('late_f');
  const absent = sum('absent_m') + sum('absent_f') + sum('sick_m') + sum('sick_f') + sum('leave_m') + sum('leave_f');
  if (!students || present + absent !== students) throw new Error(`Aggregate validation failed (students=${students}, present+absent=${present+absent}); refusing to publish`);

  const reportDate = dateBangkok();
  const report = {
    report_date: reportDate,
    academic_year: YEAR,
    source: 'Q-Info',
    updated_at: new Date().toISOString(),
    totals: { students, present, absent, late: sum('late_m')+sum('late_f'), sick: sum('sick_m')+sum('sick_f'), leave: sum('leave_m')+sum('leave_f'), absent_unexcused: sum('absent_m')+sum('absent_f'), present_percent: Number((present/students*100).toFixed(2)), absent_percent: Number((absent/students*100).toFixed(2)) },
    class_rows: rows.map(({class_name,checked,...r}) => ({ class_name, checked, ...r }))
  };
  const outDir = path.join(process.cwd(), 'data', 'attendance', 'daily');
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, `${reportDate}.json`), JSON.stringify(report, null, 2) + '\n');
  const indexPath = path.join(process.cwd(), 'data', 'attendance', 'index.json');
  let index = [];
  try { index = JSON.parse(await fs.readFile(indexPath, 'utf8')); } catch {}
  index = [reportDate, ...index.filter(d => d !== reportDate)].slice(0, 180);
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2) + '\n');
  console.log(`Published aggregate attendance for ${reportDate}: ${students} students; ${present} present; ${absent} absent.`);
} finally {
  await context.close();
  await browser.close();
}
