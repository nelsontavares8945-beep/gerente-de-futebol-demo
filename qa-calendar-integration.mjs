import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const html=path.resolve('mestre11-calendar-integration-qa.html');
const browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const tab=async n=>{
  await page.evaluate(name=>{const item=document.querySelector(`[data-tab="${name}"]`);if(!item)throw new Error('No navigation item '+name);item.click()},n);
  await page.waitForFunction(name=>window.currentTab===name,n,{timeout:10000});
};
const check=async(label,fn)=>{if(!(await page.evaluate(fn)))throw Error('Assertion failed: '+label);console.log('PASS '+label)};
try{
await page.goto(pathToFileURL(html).href+'?qaSlots',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>{let e=document.querySelector('#moOpening');return !e||e.hidden},{timeout:30000});await page.locator('#createCareerBtn').click();for(let id of ['#cwCountryNext','#cwDivisionNext','#start'])await page.locator(id).click();await page.waitForFunction(()=>!!window.__slotQA?.state()?.squad?.length);
await check('career created with QA hooks',()=>!!window.__slotQA&&window.__slotQA.state().squad.length>0);await check('calendar day 1, match locked',()=>window.__slotQA.state().calendarDay===1&&!document.querySelector('#play'));
await tab('Elenco');let selectors=page.locator('[data-slot-select]');await selectors.first().waitFor();let slots=await selectors.evaluateAll(xs=>xs.map(x=>x.dataset.slotSelect)),before=await selectors.evaluateAll(xs=>xs.map(x=>x.value));if(slots.length!==11)throw Error('Expected 11 slot selectors');await selectors.first().selectOption(before[1]);let swap=await selectors.evaluateAll(xs=>xs.map(x=>x.value));if(swap[0]!==before[1]||swap[1]!==before[0])throw Error('Slot swap not isolated');await check('slot UI swaps only the selected occupants',()=>document.querySelectorAll('[data-slot-select]').length===11);
// Exercise real left/right winger and CB exchanges, preserving every other slot.
const schema=await page.evaluate(()=>window.__slotQA.schema());
const assignUI=async(slotId,playerId)=>{const ix=schema.findIndex(x=>x.id===slotId);await page.locator('[data-slot-select]').nth(ix).selectOption(playerId)};
const readAssign=()=>selectors.evaluateAll(xs=>Object.fromEntries(xs.map(x=>[x.dataset.slotSelect,x.value])));
for (const role of ['att','def']) {
  const pair=schema.filter(x=>x.role===role&&[0,2].includes(x.index));
  if(pair.length!==2)throw Error('Could not find both sides for '+role);
  let state=await readAssign(),snapshot={...state},p1=state[pair[0].id],p2=state[pair[1].id];
  await assignUI(pair[0].id,p2);state=await readAssign();
  if(state[pair[0].id]!==p2||state[pair[1].id]!==p1||Object.keys(state).some(k=>k!==pair[0].id&&k!==pair[1].id&&state[k]!==snapshot[k]))throw Error('Side swap displaced unrelated slots ('+role+')');
  console.log('PASS '+(role==='att'?'winger':'center-back')+' left/right swap without moving unrelated positions');
}
const bench=await page.evaluate(()=>window.__slotQA.state().squad.find(p=>p.role==='banco'&&!p.starter)?.id);
if(!bench)throw Error('No bench player available for replacement QA');
let beforeBench=await readAssign(),target=schema.find(x=>x.role==='att'&&x.index===0),outgoing=beforeBench[target.id];
await assignUI(target.id,bench);let afterBench=await readAssign();
const demoted=await page.evaluate(id=>{const p=window.__slotQA.state().squad.find(x=>x.id===id);return !!p&&!p.starter&&['banco','reserva'].includes(p.role)},outgoing);
if(afterBench[target.id]!==bench||!demoted||Object.keys(afterBench).some(k=>k!==target.id&&afterBench[k]!==beforeBench[k]))throw Error('Bench replacement changed unrelated slot or outgoing player not demoted');
console.log('PASS bench replacement affects only target; outgoing starter demoted');
await tab('Táticas');let wide=page.locator('[data-tactic="width"]');if(await wide.count())await wide.selectOption({label:'Ampla'});else{let w=page.locator('[data-coordinate="widthPct"]');if(!(await w.count()))throw Error('Tactical width control missing');await w.fill('70')}await check('tactics width control present',()=>!!document.querySelector('[data-tactic="width"]')||!!document.querySelector('[data-coordinate="widthPct"]'));
const depth=page.locator('[data-coordinate="attackDepth"]');if(!(await depth.count()))throw Error('Tactical attack-depth slider missing');
const attackSlot=schema.find(x=>x.role==='att'&&x.index===0);
const yFor=()=>page.locator(`[data-slot-token="${attackSlot.id}"]`).getAttribute('style');
await depth.fill('0');const shallow=await yFor();await depth.fill('100');const deep=await yFor();if(shallow===deep)throw Error('Depth slider did not move assigned attacker');
await check('tactical depth control moves players while keeping slot assignment',()=>Object.keys(window.__slotQA.state().slotAssignments||{}).length===11&&!!document.querySelector('[data-coordinate="attackDepth"]'));
console.log('PASS tactical attack depth changes attacking player position');
for(let day=1;day<=3;day++){await tab('Visão geral');await page.locator('[data-tip-nav="Treino"]').click();await page.locator('#openTrainingStudio').click();let recovery=page.locator('[data-choice-group="session"][data-choice="Recuperação"]');if(await recovery.count())await recovery.click();await page.locator('#runTraining').click();await page.waitForFunction(()=>/concluíd|finaliz|feito/i.test(document.querySelector('#runTraining')?.textContent||''),null,{timeout:30000});if (!(await page.evaluate(day=>{let s=window.__slotQA.state();return s.trainingDay===s.calendarDay&&s.matchTrainingDays===day},day))) throw Error('Training count mismatch on day '+day); console.log('PASS training '+day+' recorded');await page.locator('#closeTraining').click();await tab('Visão geral');await page.locator('#advanceCareerDay').click();if (!(await page.evaluate(day=>window.__slotQA.state().calendarDay===day+1,day)))throw Error('Wrong calendar day after advancing '+day); console.log('PASS advanced to day '+(day+1));if(day<3)await check('match locked before all three trainings',()=>!document.querySelector('#play'))}
await check('match unlocked on day 4 after 3 training days',()=>window.__slotQA.state().matchTrainingDays===3&&!!document.querySelector('#play')&&window.__slotQA.state().calendarDay===4);
await page.locator('#saveCareerNow').click();await page.locator('#restart').click();await page.locator('#openCareersBtn').click();await page.locator('[data-enter-career]').first().click();await check('career reopens with persisted day and lineup slots',()=>window.__slotQA.state().calendarDay===4&&Object.keys(window.__slotQA.state().slotAssignments||{}).length===11);
await page.locator('#play').click();await page.locator('#liveMatch').waitFor({timeout:20000});await check('match has 22 active player tokens',()=>document.querySelectorAll('#livePitch .match-player-token').length===22);
const matchSlots=await page.evaluate(()=>{const s=window.__slotQA.state(),assigned=s.slotAssignments;return [...document.querySelectorAll('#livePitch .match-player-token[data-slot-token]')].map(e=>({slot:e.dataset.slotToken,player:e.dataset.playerId,style:e.getAttribute('style')})).filter(x=>x.slot)});
if(matchSlots.length!==11||matchSlots.some(x=>window.__slotQA.state().slotAssignments[x.slot]!==x.player))throw Error('In-match tokens do not preserve the individual slot occupant');
const matchAttack=matchSlots.find(x=>x.slot===attackSlot.id);if(!matchAttack)throw Error('Attacking slot missing from match pitch');
console.log('PASS match tokens preserve slot/player mapping including the depth-adjusted attacker');let speed=page.locator('[data-speed="2"]');if(await speed.count())await speed.click();await page.waitForFunction(()=>document.querySelector('#matchState')?.textContent==='INTERVALO',null,{timeout:120000});await page.locator('#noSubsContinue').click();await page.waitForFunction(()=>document.querySelector('#matchState')?.textContent==='FIM DE JOGO',null,{timeout:120000});await check('full match reached 90 minutes',()=>document.querySelector('#matchMinute')?.textContent.includes('90')&&!document.querySelector('#matchSummary')?.classList.contains('hidden'));await page.locator('#matchExit').click();await page.locator('#saveCareerNow').click();await check('post-match career persisted',()=>window.__slotQA.state().dayMatchPlayed===true&&JSON.parse(localStorage.getItem('gdf-career-slots-v1')||'[]').length>0);if(errors.length)throw Error(errors.join('|'));await page.screenshot({path:'scratch/calendar-integration-smoke.png',fullPage:true});console.log('PASS integrated calendar + slot assignment browser UI smoke');
}finally{await context.close();await browser.close()}
