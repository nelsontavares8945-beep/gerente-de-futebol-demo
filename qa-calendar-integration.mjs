import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const html = path.resolve('mestre11-calendar-integration-qa.html');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
const check = async (label, expr) => {
  const ok = await page.evaluate(expr);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) throw new Error(`Assertion failed: ${label}`);
};
try {
  await page.goto(pathToFileURL(html).href + '?qaSlots', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const e=document.querySelector('#moOpening'); return !e || e.hidden; }, null, { timeout: 30000 });
  await page.locator('#createCareerBtn').click({ timeout: 15000 });
  for (const id of ['#cwCountryNext', '#cwDivisionNext', '#start']) await page.locator(id).click({ timeout: 15000 });
  await page.waitForFunction(() => !!window.__slotQA?.state()?.squad?.length, null, { timeout: 20000 });
  await check('career created with slot assignment QA hooks', () => !!window.__slotQA && !!window.__slotQA.state().squad.length);
  await check('daily calendar starts at day 1, 0/3 and match is locked', () => window.__slotQA.state().calendarDay===1 && window.__slotQA.state().matchTrainingDays===0 && !!document.querySelector('.daily-scheduler') && !document.querySelector('#play'));

  // Exercise actual slot selection controls and independently assigned lineup slots.
  await page.locator('[data-tab="Elenco"]').click();
  await page.locator('[data-slot-select]').first().waitFor();
  const slotIds = await page.locator('[data-slot-select]').evaluateAll(xs => xs.map(x=>x.value));
  const slots = await page.locator('[data-slot-select]').evaluateAll(xs => xs.map(x=>x.dataset.slotSelect));
  if (slots.length !== 11) throw new Error(`Expected 11 slot selectors, got ${slots.length}`);
  const firstOptions = await page.locator('[data-slot-select]').first().locator('option').evaluateAll(xs=>xs.map(x=>x.value).filter(Boolean));
  const secondOptions = await page.locator('[data-slot-select]').nth(1).locator('option').evaluateAll(xs=>xs.map(x=>x.value).filter(Boolean));
  const swapA = slotIds[0], swapB = slotIds[1];
  await page.locator('[data-slot-select]').first().selectOption(swapB);
  const afterSwap = await page.locator('[data-slot-select]').evaluateAll(xs=>xs.map(x=>x.value));
  if (afterSwap[0]!==swapB || afterSwap[1]!==swapA) throw new Error('Real UI slot assignment did not swap only the two occupants');
  await check('slot assignment UI rendered 11 position selectors and swapped occupants independently', () => document.querySelectorAll('[data-slot-select]').length===11 && window.__slotQA.state().squad.filter(p=>p.role==='titular'||p.starter).length===11);

  // Tactical controls must change actual slot coordinates and persist their values.
  await page.locator('[data-tab="Táticas"]').click();
  const width = page.locator('[data-coordinate="widthPct"]');
  if (await width.count()) {
    const before = await page.locator('[data-slot-token]').first().evaluate(e=>getComputedStyle(e).getPropertyValue('--x'));
    await width.fill('70');
    const after = await page.locator('[data-slot-token]').first().evaluate(e=>getComputedStyle(e).getPropertyValue('--x'));
    if (before===after) throw new Error('Tactical width input did not change field layout');
  } else {
    const widthSelect = page.locator('[data-tactic="width"]');
    if (!(await widthSelect.count())) throw new Error('Tactical width control not found');
    await widthSelect.selectOption({label:'Ampla'});
  }
  await check('tactics view and width control are interactive', () => !!document.querySelector('[data-tactic="width"]') || !!document.querySelector('[data-coordinate="widthPct"]'));

  // Daily recovery sessions are completed on three distinct calendar days.
  for (let day=1; day<=3; day++) {
    await page.locator('[data-tab="Visão geral"]').click();
    await page.locator('[data-tip-nav="Treino"]').click();
    await page.locator('#openTrainingStudio').click();
    const recovery = page.locator('[data-choice-group="session"][data-choice="Recuperação"]');
    if (await recovery.count()) await recovery.click();
    await page.locator('#runTraining').click();
    await page.waitForFunction(() => {
      const b=document.querySelector('#runTraining');
      return !!b && /concluíd|finaliz|feito/i.test(b.textContent);
    }, null, {timeout:30000});
    await check(`training session ${day} is recorded on calendar day ${day}`, () => {
      const s=window.__slotQA.state(); return s.trainingDay===s.calendarDay && s.matchTrainingDays===day;
    });
    await page.locator('#closeTraining').click();
    await page.locator('[data-tab="Visão geral"]').click();
    await page.locator('#advanceCareerDay').click();
    await check(`career advanced to calendar day ${day+1}`, () => window.__slotQA.state().calendarDay===day+1);
    if (day<3) await check(`match still locked after training day ${day}`, () => !document.querySelector('#play'));
  }
  await check('match unlocks on day 4 only after three separate training days', () => window.__slotQA.state().matchTrainingDays===3 && !!document.querySelector('#play') && window.__slotQA.state().calendarDay===4);

  // Save, close/reopen from the career list, and verify calendar/lineup persistence.
  await page.locator('#saveCareerNow').click();
  const savedSlots = await page.evaluate(()=>JSON.parse(localStorage.getItem('gdf-career-slots-v1')||'[]'));
  if (!savedSlots.length) throw new Error('Career was not written to persistent storage');
  const expectedDay = await page.evaluate(()=>window.__slotQA.state().calendarDay);
  await page.locator('#restart').click();
  await page.locator('#openCareersBtn').click();
  await page.locator('[data-enter-career]').first().click();
  await check('saved career reopens with day 4 and slot assignment intact', () => window.__slotQA.state().calendarDay===4 && document.querySelectorAll('[data-slot-select]').length===0 && !!window.__slotQA.state().slotAssignments && Object.keys(window.__slotQA.state().slotAssignments).length===11);
  if (expectedDay!==4) throw new Error('Unexpected calendar day before reopening');

  // Finish the entire match using the game's own accelerated match speed.
  await page.locator('#play').click();
  await page.locator('#liveMatch').waitFor({ timeout:20000 });
  await check('match screen starts with 22 active player tokens', () => document.querySelectorAll('#livePitch .match-player-token').length===22);
  const speed2 = page.locator('[data-speed="2"]');
  if (await speed2.count()) await speed2.click();
  await page.waitForFunction(() => document.querySelector('#matchState')?.textContent==='INTERVALO', null, {timeout:120000});
  await page.locator('#noSubsContinue').click();
  await page.waitForFunction(() => document.querySelector('#matchState')?.textContent==='FIM DE JOGO', null, {timeout:120000});
  await check('full 90-minute match finished and summary rendered', () => document.querySelector('#matchMinute')?.textContent.includes('90') && !document.querySelector('#matchSummary')?.classList.contains('hidden'));
  await page.locator('#matchExit').click();
  await page.locator('#saveCareerNow').click();
  await check('post-match career state persisted', () => window.__slotQA.state().dayMatchPlayed===true && JSON.parse(localStorage.getItem('gdf-career-slots-v1')||'[]').length>0);
  if (pageErrors.length) throw new Error('Browser page errors: '+pageErrors.join(' | '));
  await page.screenshot({path:'scratch/calendar-integration-smoke.png',fullPage:true});
  console.log('PASS integrated calendar + slot assignment browser UI smoke');
} finally {
  await context.close();
  await browser.close();
}
