import json,time,itertools,urllib.request,websocket,subprocess,os
PKG='br.com.gerentefutebol.redesignpreview'; ACT=f'{PKG}/br.com.gerentefutebol.redesignpreview.MainActivity'
def adb(*args,check=True):
 p=subprocess.run(['adb',*args],text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT);print('$ adb '+' '.join(args)+'\n'+p.stdout,flush=True)
 if check and p.returncode:raise RuntimeError(p.stdout)
 return p.stdout
def main():
 adb('wait-for-device')
 for _ in range(90):
  if adb('shell','getprop','sys.boot_completed',check=False).strip()=='1':break
  time.sleep(2)
 assert adb('shell','getprop','sys.boot_completed').strip()=='1'
 adb('install','-r','android/app/build/outputs/apk/debug/app-debug.apk');adb('logcat','-c');adb('shell','am','force-stop',PKG);adb('shell','am','start','-W','-n',ACT)
 # Dismiss Android immersive-mode first-use overlay so it cannot swallow taps.
 time.sleep(2);adb('shell','input','tap','1200','520',check=False);time.sleep(2)
 pid=''
 for _ in range(30):
  pid=adb('shell','pidof',PKG,check=False).strip()
  if pid:break
  time.sleep(1)
 assert pid
 adb('forward','tcp:9222',f'localabstract:webview_devtools_remote_{pid}')
 pages=[]
 for _ in range(45):
  try:
   pages=json.load(urllib.request.urlopen('http://localhost:9222/json',timeout=3))
   if any(x.get('type')=='page' for x in pages):break
  except Exception:pass
  time.sleep(1)
 page=next(x for x in pages if x.get('type')=='page'); ws=websocket.create_connection(page['webSocketDebuggerUrl'],timeout=120,suppress_origin=True);seq=itertools.count(1);errors=[]
 def js(expr):
  i=next(seq);ws.send(json.dumps({'id':i,'method':'Runtime.evaluate','params':{'expression':expr,'returnByValue':True,'awaitPromise':True}}))
  while 1:
   r=json.loads(ws.recv())
   if r.get('method')=='Runtime.exceptionThrown':errors.append(r)
   if r.get('id')==i:
    if r.get('result',{}).get('exceptionDetails'):raise Exception(r['result']['exceptionDetails'])
    return r['result']['result'].get('value')
 def ck(x,name):
  v=js(x);print(('PASS' if v else 'FAIL'),name,repr(v),flush=True)
  if not v:raise AssertionError(name)
 def wait(x,name):
  for _ in range(120):
   if js(x):print('PASS',name,flush=True);return
   time.sleep(.5)
  raise AssertionError(name)
 def click(sel):
  wait('!!document.querySelector('+json.dumps(sel)+')','found '+sel)
  js('document.querySelector('+json.dumps(sel)+').click()');time.sleep(.8)
 try:
  wait("document.querySelector('#careerHome')&&!document.querySelector('#careerHome').classList.contains('hidden')",'app and career center opened (no anniversary splash)')
  ck("document.querySelector('.brand') && document.querySelector('.brand').textContent.includes('MESTRE 11')",'page brand')
  js("localStorage.setItem('__qa_marker','persist-me')")
  click('#createCareerBtn');wait("document.querySelector('#setup')&&!document.querySelector('#setup').classList.contains('hidden')",'wizard shown');click('#cwCountryNext');click('#cwDivisionNext');click('#start')
  wait("!document.querySelector('#app').classList.contains('hidden')",'career start')
  wait("document.querySelector('#nav')&&document.querySelector('#nav').querySelector('[data-tab]')",'main navigation')
  ck("document.querySelector('#nav').innerText.includes('Visão')",'overview nav present')
  click("#nav [data-tab='Visão geral'], #nav [data-tab='Visão Geral']");time.sleep(2);ck("document.querySelector('#view').innerText.length>20",'overview content rendered')
  click("#nav [data-tab='Elenco']");time.sleep(2);ck("document.querySelector('#view').innerText.includes('ELENCO')||document.querySelector('#view').innerText.includes('Elenco')",'roster view rendered')
  ck("document.querySelectorAll('#view img').length>0",'player photos/images present')
  print('Elenco image count:',js("document.querySelectorAll('#view img').length"),'loaded:',js("Array.from(document.querySelectorAll('#view img')).filter(i=>i.complete&&i.naturalWidth>0).length"),flush=True)
  ck("JSON.stringify(Object.keys(localStorage)).includes('m11-preview-')",'preview namespaced storage')
  js("localStorage.setItem('__qa_career',localStorage.length+'')")
  ck('localStorage.length>0','career state stored')
  print('JS exceptions captured:',len(errors),flush=True)
  adb('shell','am','force-stop',PKG);adb('shell','am','start','-W','-n',ACT);time.sleep(4);adb('shell','input','tap','1200','520',check=False);time.sleep(1)
  pid=adb('shell','pidof',PKG,check=False).strip();adb('forward','tcp:9223',f'localabstract:webview_devtools_remote_{pid}')
  for _ in range(30):
   try:
    pp=json.load(urllib.request.urlopen('http://localhost:9223/json',timeout=3)); p2=next(x for x in pp if x.get('type')=='page');ws.close();ws=websocket.create_connection(p2['webSocketDebuggerUrl'],timeout=120,suppress_origin=True);break
   except Exception:time.sleep(1)
  ck("localStorage.getItem('__qa_marker')==='persist-me'",'localStorage survives relaunch')
  ck("localStorage.getItem('__qa_career')!==null",'career data survives relaunch')
  assert not errors,'uncaught JS exceptions occurred'
  print('PASS full Android 10 emulator QA',flush=True)
 finally:
  try:adb('shell','screencap','-p','/sdcard/qa-final.png',check=False);adb('pull','/sdcard/qa-final.png','scratch/android10-final.png',check=False)
  except:pass
  try:open('scratch/logcat.txt','w').write(adb('logcat','-d','-v','time','-s','AndroidRuntime:E','M11Preview:I','chromium:E','*:S',check=False))
  except:pass
if __name__=='__main__':main()
