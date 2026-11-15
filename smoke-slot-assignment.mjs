import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const html = path.resolve('mestre11-cadeado.html');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const pageErrors=[];
page.on('pageerror', error => { pageErrors.push(error.message); });
try {
  await page.goto(pathToFileURL(html).href + '?qaSlots', { waitUntil: 'domcontentloaded' });
  // Wait until the app's opening overlay has completed before using the UI.
  await page.waitForFunction(() => { const opening=document.querySelector('#moOpening'); return !opening || opening.hidden; }, null, { timeout: 15000 });
  // Run the real app UI's career creation flow; S remains private inside its IIFE.
  if (!(await page.evaluate(() => !!window.__slotQA?.state()?.squad?.length))) {
    await page.locator('#createCareerBtn').waitFor({ timeout: 15000 });
    await page.locator('#createCareerBtn').click();
    for (const id of ['#cwCountryNext', '#cwDivisionNext', '#start']) {
      const button = page.locator(id);
      if (await button.count()) await button.first().click({ timeout: 10000 });
    }
    await page.waitForFunction(() => !!window.__slotQA?.state()?.squad?.length, null, { timeout: 20000 });
  }
  const result = await page.evaluate(() => {
    const qa = window.__slotQA, S = qa.state();
    if (!qa || !S) throw new Error('QA bridge/state unavailable');
    const formations = ['4-3-3','4-4-2','3-4-3','3-5-2','4-2-3-1','4-1-4-1','5-3-2'];
    const formationResults = formations.map(formation => {
      qa.formation(formation);
      const slots = qa.schema();
      return { formation, count: slots.length, unique: new Set(slots.map(x => x.id)).size };
    });
    // Dedicated deterministic mock XI (only in this isolated browser context).
    S.squad = Array.from({length: 14}, (_, i) => ({ id:`qa-${i}`, name:`QA Player ${i}`, pos:i===0?'GOL':i<5?'ZAG':i<9?'MC':i<12?'PE':'PD', rating:70+i, energy:90, role:i<11?'titular':i<13?'banco':'reserva', starter:i<11 }));
    qa.formation('4-3-3'); S.slotAssignments = {}; qa.ensure();
    let slots = qa.schema(), before = {...S.slotAssignments};
    const left = slots.find(x => x.role==='att' && x.index===0), right = slots.find(x => x.role==='att' && x.index===2);
    qa.assign(left.id, 'qa-9'); qa.assign(right.id, 'qa-8');
    const wingerSwap = S.slotAssignments[left.id]==='qa-9' && S.slotAssignments[right.id]==='qa-8' && slots.filter(x=>x.id!==left.id&&x.id!==right.id).every(x=>S.slotAssignments[x.id]===before[x.id]);
    qa.assign(right.id, 'qa-11');
    const reserveInheritsSlot = S.slotAssignments[right.id]==='qa-11' && S.squad.find(p=>p.id==='qa-8').role==='reserva' && !S.squad.find(p=>p.id==='qa-8').starter;
    const uniqueAssignments = new Set(Object.values(S.slotAssignments)).size === Object.values(S.slotAssignments).length;
    const widths = [65,135].map(widthPct => { S.tactical={...(S.tactical||{}),widthPct,attackDepth:80}; return qa.schema().map(x=>Math.max(4,Math.min(96,50+(x.x-50)*widthPct/100))); });
    const widthChanges = JSON.stringify(widths[0])!==JSON.stringify(widths[1]);
    qa.formation('4-1-4-1');
    const remapSafe = qa.schema().length===11 && new Set(Object.values(S.slotAssignments)).size===Object.values(S.slotAssignments).length;
    return {formationResults,wingerSwap,reserveInheritsSlot,uniqueAssignments,widthChanges,remapSafe};
  });
  if (pageErrors.length) throw new Error('Page errors: '+pageErrors.join(' | '));
  console.log(JSON.stringify(result,null,2));
  if (result.formationResults.some(x=>x.count!==11||x.unique!==11) || !result.wingerSwap || !result.reserveInheritsSlot || !result.uniqueAssignments || !result.widthChanges || !result.remapSafe) throw new Error('slot assignment assertions failed');
  console.log('PASS: seven formations, unique slot IDs, independent winger swap, bench replacement, tactical width, formation remap');
} finally { await browser.close(); }
