"""CDP smoke test for the stable-slot lineup feature (run against isolated Android test WebView)."""
import json, urllib.request, time, websocket, itertools
pages=json.load(urllib.request.urlopen('http://localhost:9222/json'))
page=next(p for p in pages if p.get('type')=='page' and 'game.gerentefutebol.local' in p.get('url',''))
ws=websocket.create_connection(page['webSocketDebuggerUrl'],timeout=20,suppress_origin=True)
seq=itertools.count(1)
def js(expr):
    i=next(seq); ws.send(json.dumps({'id':i,'method':'Runtime.evaluate','params':{'expression':expr,'returnByValue':True,'awaitPromise':True}}))
    while True:
        r=json.loads(ws.recv())
        if r.get('id')!=i: continue
        if r['result'].get('exceptionDetails'): raise RuntimeError(r['result']['exceptionDetails'])
        return r['result']['result'].get('value')
def check(expr):
    v=js(expr); print('ASSERT',expr,'=>',v,flush=True)
    if not v: raise AssertionError(expr)
# Launch an isolated career through the game's own UI.
if not js("!!window.S && Array.isArray(S.squad)"):
    js("document.getElementById('createCareerBtn')?.click()")
    time.sleep(.4); js("document.getElementById('cwCountryNext')?.click()")
    time.sleep(.2); js("document.getElementById('cwDivisionNext')?.click()")
    time.sleep(.2); js("document.getElementById('start')?.click()")
    time.sleep(2)
check("!!window.S && Array.isArray(S.squad) && S.squad.length>=11")
# Isolate setup in this emulator career: one keeper, four defenders including a right/left central defender,
# and three attackers incl. left/right wingers; bench replacement should leave all other slot IDs intact.
js("""(()=>{let roles=[['GOL','GK'],['ZAG','CB-L'],['ZAG','CB-R'],['LE','LB'],['LD','RB'],['VOL','DM'],['MC','CM'],['MEI','AM'],['PE','LW'],['PD','RW'],['ATA','ST'],['PD','SUB']];S.squad=roles.map(([pos,name],i)=>({id:'smoke-'+i,name,pos,rating:70+i,age:25,energy:90,role:i<11?'titular':'banco',starter:i<11}));S.club='Smoke FC';S.formation='4-3-3';S.tactical={...(S.tactical||{}),widthPct:100,attackDepth:50};S.slotAssignments={};m11EnsureSlots();storeActiveCareer();return JSON.stringify({slots:m11SlotSchema().map(x=>[x.id,x.label]),assignments:S.slotAssignments})})()""")
check("m11SlotSchema().length===11 && new Set(Object.values(S.slotAssignments)).size===11 && Object.values(S.slotAssignments).every(id=>S.squad.some(p=>p.id===id))")
# Explicitly assign the wingers and swap them, without shifting any other position.
check("(()=>{let a=m11SlotSchema().find(x=>x.role==='att'&&x.index===0),b=m11SlotSchema().find(x=>x.role==='att'&&x.index===2);return !!a&&!!b})()")
js("(()=>{let [l,r]=m11SlotSchema().filter(x=>x.role==='att'&&(x.index===0||x.index===2));let before=JSON.stringify(Object.fromEntries(Object.entries(S.slotAssignments).filter(([k])=>k!==l.id&&k!==r.id)));m11Assign(l.id,'smoke-9');m11Assign(r.id,'smoke-8');window.__otherSlotsBefore=before;window.__wingSlots=[l.id,r.id]})()")
check("S.slotAssignments[window.__wingSlots[0]]==='smoke-9' && S.slotAssignments[window.__wingSlots[1]]==='smoke-8' && JSON.stringify(Object.fromEntries(Object.entries(S.slotAssignments).filter(([k])=>!window.__wingSlots.includes(k))))===window.__otherSlotsBefore")
# Swap right and left center backs. Their identity follows the slot, not sorted array position.
js("(()=>{let [l,r]=m11SlotSchema().filter(x=>x.role==='def'&&(x.index===0||x.index===3));m11Assign(l.id,'smoke-2');m11Assign(r.id,'smoke-1');window.__cbSlots=[l.id,r.id]})()")
check("S.slotAssignments[window.__cbSlots[0]]==='smoke-2' && S.slotAssignments[window.__cbSlots[1]]==='smoke-1'")
# Incoming reserve into a named, occupied slot demotes only the outgoing player, with all other slots unchanged.
js("(()=>{let slot=window.__wingSlots[1],before=JSON.stringify(Object.fromEntries(Object.entries(S.slotAssignments).filter(([k])=>k!==slot)));m11Assign(slot,'smoke-11');window.__replacementBefore=before;return true})()")
check("S.slotAssignments[window.__wingSlots[1]]==='smoke-11' && S.squad.find(p=>p.id==='smoke-8').role==='reserva' && !S.squad.find(p=>p.id==='smoke-8').starter && JSON.stringify(Object.fromEntries(Object.entries(S.slotAssignments).filter(([k])=>k!==window.__wingSlots[1])))===window.__replacementBefore")
# Coordinates (width and attacking depth) update pitch positions but do not alter slot identity.
js("(()=>{let f=document.querySelector('[data-tab=\"Táticas\"]');f?.click();render();let before=JSON.stringify(S.slotAssignments);S.tactical.widthPct=135;S.tactical.attackDepth=85;storeActiveCareer();window.__coordsAfter=trainingFormationPositions(S.formation).map(p=>p.x);window.__assignBeforeReload=before;return true})()")
check("S.tactical.widthPct===135 && S.tactical.attackDepth===85 && JSON.stringify(S.slotAssignments)===window.__assignBeforeReload")
# Reload verifies persistence and unique player identities / formation schema.
js("location.reload()")
time.sleep(3)
check("!!window.S && S.tactical.widthPct===135 && S.tactical.attackDepth===85 && new Set(Object.values(S.slotAssignments)).size===11")
check("S.slotAssignments[window.__wingSlots?.[0]||m11SlotSchema().find(x=>x.role==='att'&&x.index===0).id]==='smoke-9'")
# Ensure the simulation's 11 home tokens name the exact slot player via data-player-id and slot-token metadata.
js("(()=>{window.matchTimer&&clearInterval(window.matchTimer);showMatch({opponent:'Santos',home:true,possession:50,competition:'Smoke'},0,0);return true})()")
time.sleep(.5)
check("document.querySelectorAll('#livePitch .home-token').length===11 && [...document.querySelectorAll('#livePitch .home-token')].every(t=>t.dataset.playerId && t.dataset.slotToken && S.slotAssignments[t.dataset.slotToken]===t.dataset.playerId && t.title===S.squad.find(p=>p.id===t.dataset.playerId).name)")
print('PASS stable slot IDs, winger and CB swap, reserve replacement, tactical coordinates, reload persistence, exact 11 named match tokens',flush=True)
