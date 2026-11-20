const CACHE="vereinskassa-v22";
const ASSETS=["./","./index.html","./styles.css","./app.js","./manifest.webmanifest"];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener("activate",e=>e.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim()})()));
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET") return;
  const u=new URL(e.request.url);
  if(u.origin===self.location.origin && (u.pathname.endsWith("/app.js")||u.pathname.endsWith("/styles.css")||u.pathname.endsWith("/index.html")||u.pathname.endsWith("/"))){
    e.respondWith(fetch(e.request,{cache:"no-store"}).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request)));
    return;
  }
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
});
self.addEventListener("push",event=>{
  let data={};
  try{data=event.data?event.data.json():{}}catch(_error){data={body:event.data?.text()||"Neuer Beleg wurde hochgeladen."}}
  const title=data.title||"Neuer Beleg";
  const options={
    body:data.body||"Ein neuer Beleg wurde erfolgreich eingereicht.",
    tag:data.tag||"new-receipt",
    renotify:true,
    data:{url:data.url||"./"}
  };
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||"./",self.location.origin).href;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    for(const client of windows){
      if("navigate" in client) await client.navigate(target);
      return client.focus();
    }
    return self.clients.openWindow(target);
  })());
});

