import json, urllib.request, time, websocket, itertools
pages=json.load(urllib.request.urlopen('http://localhost:9222/json'))
page=next(p for p in pages if p.get('type')=='page' and 'game.gerentefutebol.local' in p.get('url',''))
ws=websocket.create_connection(page['webSocketDebuggerUrl'],timeout=30,suppress_origin=True)
seq=itertools.count(1)
def js(expr):
 i=next(seq);ws.send(json.dumps({'id':i,'method':'Runtime.evaluate','params':{'expression':expr,'returnByValue':True,'awaitPromise':True}}))
 while True:
  r=json.loads(ws.recv())
  if r.get('id')!=i:continue
  if r.get('result',{}).get('exceptionDetails'):raise RuntimeError(r['result']['exceptionDetails'])
  return r['result']['result'].get('value')
def check(expr):
 val=js(expr);print('ASSERT',expr,'=>',val,flush=True)
 if not val:raise AssertionError(expr)
def wait(expr,secs=30):
 for _ in range(secs*2):
  if js(expr):return
  time.sleep(.5)
 raise AssertionError('Timed out: '+expr)
def click(selector):
 check('!!document.querySelector('+json.dumps(selector)+')')
 js('document.querySelector('+json.dumps(selector)+').click()');time.sleep(.5)
wait("document.querySelector('#moOpening')?.hidden && document.querySelector('#careerHome') && !document.querySelector('#careerHome').classList.contains('hidden')")
for s in ['#createCareerBtn','#cwCountryNext','#cwDivisionNext','#start']:click(s)
wait("!!document.querySelector('#app') && !document.querySelector('#app').classList.contains('hidden')")
check("!!window.AndroidNavControl && !!document.querySelector('#systemNavLock')")
click('#systemNavLock');wait('window.AndroidNavControl.isLocked()');click('#systemNavLock');wait('!window.AndroidNavControl.isLocked()')
print('PASS Android GPU lock engages and releases in synthetic career',flush=True)
click('[data-tab="Base de jovens"]');wait("!!document.querySelector('[data-youth-sign]')")
check("document.querySelector('.m11-academy-shell').textContent.includes('Geração de talentos')")
click('[data-youth-sign]');wait("!!document.querySelector('[data-youth-train]')")
click('[data-youth-train]');check("document.querySelector('.m11-academy-shell').textContent.includes('Atletas contratados')")
print('PASS Android academy tab, prospect signing and training UI',flush=True)
click('[data-tab="Departamento médico"]');wait("!!document.querySelector('[data-med-rest]')")
check("document.querySelector('.m11-academy-shell').textContent.includes('Situação do elenco')")
print('PASS Android medical department and rest controls render',flush=True)
click('[data-tab="Olheiros"]');wait("!!document.querySelector('[data-network-watch]')")
click('[data-network-watch]');check("document.querySelector('.m11-academy-shell').textContent.includes('No relatório')")
check("!!document.querySelector('[data-scout-observe]')")
print('PASS Android scouting tab and follow target action',flush=True)
check("JSON.parse(localStorage.getItem('gdf-career-slots-v1')).length>0")
print('PASS career persisted to existing slots key',flush=True)
ws.close()
