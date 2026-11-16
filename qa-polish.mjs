import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const html=path.resolve('mestre11-polish-qa.html');
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1024,height:768}});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});
const tab=async name=>{await page.evaluate(n=>document.querySelector(`[data-tab="${n}"]`)?.click(),name);await page.waitForFunction(n=>window.currentTab===n,name,{timeout:10000})};
try{
 await page.goto(pathToFileURL(html).href+'?qaSlots',{waitUntil:'load',timeout:30000});
 // Boot hides the splash after a short timer. Give the file-origin page a little extra time,
 // then report all diagnostics instead of timing out without showing the cause.
 await page.waitForTimeout(1200);
 const boot=await page.evaluate(()=>({opening:!!document.querySelector('#moOpening'),hidden:!!document.querySelector('#moOpening')?.hidden,careerHome:!!document.querySelector('#careerHome'),careerHidden:!!document.querySelector('#careerHome')?.classList.contains('hidden'),probe:!!window.__slotQA,body:document.body.innerText.slice(0,300)}));
 if(!boot.opening||!boot.hidden)throw new Error('App boot did not complete: '+JSON.stringify({boot,errors}));
 await page.locator('#createCareerBtn').click();for(const id of ['#cwCountryNext','#cwDivisionNext','#start'])await page.locator(id).click();
 await page.waitForFunction(()=>!!window.__slotQA?.state()?.squad?.length,null,{timeout:10000});
 const stars=await page.evaluate(()=>['Cristiano Ronaldo','Lionel Messi','Kylian Mbappé','Giorgian de Arrascaeta','Pedro'].map(name=>({name,overall:window.__slotQA.curatedRating(name)})));
 if(stars.some(x=>x.overall<82))throw new Error('Curated star ratings were not available: '+JSON.stringify(stars));
 console.log('PASS curated star OVERALL map',JSON.stringify(stars));
 const abroad=await page.evaluate(()=>window.__slotQA.marketFiltered('Internacionais'));
 if(!abroad.length||abroad.some(p=>!p.source||p.source==='Santos'||p.source==='Flamengo'))throw new Error('International market includes Brazil-based clubs or is empty');
 console.log('PASS international market filters by club location; sample '+abroad.slice(0,3).map(p=>`${p.source}: ${p.value}`).join(', '));
 await page.evaluate(()=>window.__slotQA.formation('4-2-3-1'));
 await tab('Elenco');
 await page.waitForFunction(()=>document.querySelectorAll('.squad-mini-pitch .squad-field-player').length===11,null,{timeout:10000});
 const squadBoxes=await page.locator('.squad-mini-pitch .squad-field-player').evaluateAll(xs=>xs.map(x=>{let r=x.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,slot:x.dataset.slotToken,label:x.textContent}}));
 if(squadBoxes.some(x=>!x.slot||!x.label))throw new Error('Elenco formation has missing slot/player labels');
 const collides=a=>a.some((x,i)=>a.some((y,j)=>j>i&&x.left<y.right&&x.right>y.left&&x.top<y.bottom&&x.bottom>y.top));
 if(collides(squadBoxes))throw new Error('Elenco pitch has overlapping player labels');
 console.log('PASS Elenco 4-2-3-1: 11 slot-linked labels with no overlap at 1024x768');
 await tab('Treino');await page.locator('#openTrainingStudio').click();
 await page.waitForSelector('#trainingPitch .training-player-token');
 const trainingBoxes=await page.locator('#trainingPitch .training-player-token').evaluateAll(xs=>xs.map(x=>{let r=x.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,slot:x.dataset.slotToken,id:x.dataset.playerId,label:x.querySelector('b')?.textContent}}));
 if(trainingBoxes.length!==11||new Set(trainingBoxes.map(x=>x.id)).size!==11||trainingBoxes.some(x=>!x.slot||!x.label))throw new Error('Training pitch does not have 11 distinct slot-linked labeled players');
 if(collides(trainingBoxes))throw new Error('Training pitch labels collide');
 console.log('PASS training screen shows 11 non-overlapping slot-linked player tokens');
 const p=await page.evaluate(()=>{let p=window.__slotQA.state().squad.find(x=>x.starter);window.__slotQA.trainingXP(p.name,3);let s=window.__slotQA.state();s.trainingPlan={session:'Técnica',intensity:'Normal',attack:p.name,defense:p.name,fitness:p.name};return {name:p.name,id:p.id,rating:p.rating}});
 await page.locator('[data-choice-group="session"][data-choice="Técnica"]').click();
 await page.locator('#runTraining').click();
 await page.waitForFunction(()=>document.querySelector('#runTraining')?.textContent.includes('concluído'),null,{timeout:30000});
 const grown=await page.evaluate(name=>{let p=window.__slotQA.state().squad.find(x=>x.name===name);return {rating:p.rating,xp:p.trainingXP,progress:document.querySelector('#trainingProgressText')?.textContent}},p.name);
 if(grown.rating<=p.rating||!Number.isFinite(grown.xp))throw new Error('Repeated training did not convert accumulated XP into GER: '+JSON.stringify({p,grown}));
 console.log('PASS gradual technical training gains '+p.name+' GER '+p.rating+'→'+grown.rating+' XP remainder '+grown.xp);
 await page.locator('#closeTraining').click();
 for(const form of ['4-3-3','4-4-2','3-4-3','3-5-2','4-2-3-1','4-1-4-1','5-3-2']){
  await tab('Táticas');
  await page.locator(`[data-formation="${form}"]`).click();
  await tab('Elenco');
  await page.waitForFunction(()=>document.querySelectorAll('.squad-mini-pitch .squad-field-player').length===11,null,{timeout:10000});
  const n=await page.locator('.squad-mini-pitch .squad-field-player').count();
  if(n!==11)throw new Error(`${form} rendered ${n} field players`);
 }
 console.log('PASS all seven formations retain exactly 11 occupants');
 if(errors.length)throw new Error(errors.join(' | '));
 await page.screenshot({path:'scratch/mestre11-polish-smoke.png',fullPage:true});
 console.log('PASS Mestre 11 polished UI, progressive training, market pricing, ratings');
} catch(e){
 try{await page.screenshot({path:'scratch/mestre11-polish-smoke.png',fullPage:true})}catch{}
 console.error(e);throw e;
} finally {await context.close();await browser.close()}
