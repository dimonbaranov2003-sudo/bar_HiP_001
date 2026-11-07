/* Общий модуль: чтение и запись общих данных (data/state.json в репозитории) и админ-режим. */
(function(){
  var CFG={owner:'dimonbaranov2003-sudo', repo:'bar_HiP_001', path:'data/state.json'};
  var TK='hip:token:'+CFG.repo, CK='hip:cache:'+CFG.repo;   // ключ и кэш привязаны к репозиторию: на одном github.io они не смешиваются между репозиториями
  var HIP=window.HIP={cfg:CFG};
  function ls(k,v){ try{ if(v===undefined) return localStorage.getItem(k); if(v===null) localStorage.removeItem(k); else localStorage.setItem(k,v); }catch(e){} return null; }
  function token(){ return ls(TK)||''; }
  HIP.isAdmin=function(){ return !!token(); };
  function mark(){ if(document.body) document.body.classList.toggle('hip-admin',HIP.isAdmin()); }

  // ---------- числа и выражения: + − × ÷ и скобки; «х» (русская), x, × и * — умножение ----------
  function normExpr(src){ return String(src).toLowerCase().replace(/\s+/g,'').replace(/,/g,'.').replace(/[х×x*]/g,'*').replace(/[÷:\/]/g,'/'); }
  HIP.parse=function(src){
    if(src===undefined||src===null) return null;
    var t=normExpr(src).replace(/[+\-*\/.]+$/,''); if(!t) return null;
    var o=(t.match(/\(/g)||[]).length, c=(t.match(/\)/g)||[]).length; while(c<o){ t+=')'; c++; }
    var tok=t.match(/\d+\.?\d*|\.\d+|[+\-*\/()]/g); if(!tok||tok.join('')!==t) return null;
    var p=0;
    function expr(){ var v=term(); while(tok[p]==='+'||tok[p]==='-'){ var op=tok[p++], r=term(); if(v===null||r===null) return null; v=op==='+'?v+r:v-r; } return v; }
    function term(){ var v=factor(); while(tok[p]==='*'||tok[p]==='/'){ var op=tok[p++], r=factor(); if(v===null||r===null) return null; v=op==='*'?v*r:(r===0?null:v/r); } return v; }
    function factor(){
      var x=tok[p]; if(x===undefined) return null;
      if(x==='-'){ p++; var f=factor(); return f===null?null:-f; }
      if(x==='+'){ p++; return factor(); }
      if(x==='('){ p++; var v=expr(); if(tok[p]!==')') return null; p++; return v; }
      if(/^[\d.]/.test(x)){ p++; return parseFloat(x); }
      return null;
    }
    var res=expr(); if(res===null||p!==tok.length||!isFinite(res)) return null;
    return Math.round(res*1000)/1000;
  };
  HIP.fmt=function(n){ return String(Math.round(n*1000)/1000).replace('.',','); };

  // ---------- чтение: для всех, без пароля ----------
  HIP.read=function(path){
    path=path||CFG.path; var CKP=path===CFG.path?CK:CK+':'+path;
    function cached(){ try{ return JSON.parse(ls(CKP)||'null'); }catch(x){ return null; } }
    return fetch(path+'?t='+Date.now(),{cache:'no-store'}).then(function(r){
      if(r.status===404) return null; if(!r.ok) throw new Error('HTTP '+r.status); return r.json();
    }).then(function(d){
      var c=cached();
      if(c&&(!d||(c.updated&&d.updated&&c.updated>d.updated))) return c;   // свою свежую запись показываем сразу, пока Pages обновляется
      if(d) ls(CKP,JSON.stringify(d));
      return d;
    }).catch(function(e){ var c=cached(); if(c){ c.__cached=true; return c; } throw e; });
  };

  // ---------- запись: только с токеном (проверяет сам GitHub) ----------
  function api(method,url,body){
    return fetch('https://api.github.com'+url,{method:method,headers:{'Authorization':'Bearer '+token(),'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}).catch(function(e){
      // запрос вообще не дошёл до GitHub (сеть, блокировка, режим экономии трафика) — это не ошибка ключа
      var er=new Error('Запрос не дошёл до GitHub ('+((e&&e.message)||'ошибка сети')+'). Это сеть или блокировка, не ключ. Попробуй другой интернет (Wi-Fi или мобильный) или открой карту в Safari или Chrome, не из Telegram.'); er.net=true; throw er;
    });
  }
  function b64(s){ return btoa(unescape(encodeURIComponent(s))); }
  function unb64(b){ return decodeURIComponent(escape(atob(String(b).replace(/\n/g,'')))); }
  function explain(status){
    if(status===401) return 'GitHub не принял ключ (неверный или истёк срок).';
    if(status===403||status===404) return 'GitHub не пустил запись в '+CFG.owner+'/'+CFG.repo+'. Скорее всего, в этом браузере сохранён старый ключ без прав записи. Нажми на подпись d.b wish, выйди из админ-режима и войди заново свежим ключом (Repository access: '+CFG.repo+', Contents: Read and write).';
    return 'GitHub ответил ошибкой '+status+'.';
  }
  HIP.check=function(){
    return api('GET','/repos/'+CFG.owner+'/'+CFG.repo).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ return {ok:r.ok,status:r.status,branch:j.default_branch}; }); });
  };
  HIP.update=async function(mutate,path){
    if(!HIP.isAdmin()) throw new Error('Нужен админ-режим.');
    path=path||CFG.path; var CKP=path===CFG.path?CK:CK+':'+path, CONTENTS='/repos/'+CFG.owner+'/'+CFG.repo+'/contents/'+path;
    for(var tries=0;tries<3;tries++){
      var r=await api('GET',CONTENTS), st={v:1}, sha;
      if(r.status===200){ var j=await r.json(); sha=j.sha; st=JSON.parse(unb64(j.content)); }
      else if(r.status===404){
        // 404 бывает и когда файла ещё нет, и когда ключ вообще не видит репозиторий — различаем
        var rr=await api('GET','/repos/'+CFG.owner+'/'+CFG.repo);
        if(!rr.ok) throw new Error(rr.status===401?explain(401):'Ключ не видит репозиторий '+CFG.owner+'/'+CFG.repo+'. Либо ключ выдан на другой репозиторий, либо на сайте лежит старый core.js с другим именем репозитория.');
      }
      else throw new Error(explain(r.status));
      st=mutate(st)||st; st.updated=new Date().toISOString();
      var body={message:(path===CFG.path?'Остатки: ':'Данные ('+path+'): ')+st.updated, content:b64(JSON.stringify(st))}; if(sha) body.sha=sha;
      var put=await api('PUT',CONTENTS,body);
      if(put.ok){ ls(CKP,JSON.stringify(st)); return st; }
      if(put.status!==409&&put.status!==422) throw new Error(explain(put.status));
    }
    throw new Error('Не удалось сохранить: файл менялся одновременно. Попробуй ещё раз.');
  };

  // ---------- ТТК: кэш и разворот рецепта в сырьё (премиксы раскладываются пропорционально) ----------
  HIP.cached=function(path){ path=path||CFG.path; var CKP=path===CFG.path?CK:CK+':'+path; try{ return JSON.parse(ls(CKP)||'null'); }catch(x){ return null; } };
  HIP.ttkPath='data/ttk.json';
  function ttkCard(t,id){ var a=(t&&t.cards)||[]; for(var i=0;i<a.length;i++) if(a[i].id===id) return a[i]; return null; }
  // объём премикса: заявленный выход, иначе сумма жидких частей
  // Премикс «как есть» → готовый рецепт партии:
  //  • из коктейля (c.src): состав коктейля × число порций + вода на порцию (c.water);
  //  • вручную с c.fill: недостающий до выхода объём добавляется водой.
  // источники «из коктейля»: [{c:id коктейля, x:порций, w:воды на порцию, мл}] или null для ручного премикса
  HIP.ttkSrcs=function(c){
    if(c&&Array.isArray(c.srcs)) return c.srcs;
    if(c&&typeof c.src==='string') return c.src?[{c:c.src,x:(c.make&&c.make.by==='n')?c.make.x:1,w:c.water||0}]:[];
    return null;
  };
  function mlSum(a){ var s=0; (a||[]).forEach(function(x){ if(x.q>0&&(x.p||x.u==='мл')) s+=x.q; }); return s; }
  // Одна порция коктейля для премикса: что идёт в бутылку, что подают отдельно, сколько воды заменяет лёд.
  // Режимы воды (r.wm): 'out' — до готового выхода ТТК (выход − все жидкие ингредиенты), 'own' — своё число (r.w), 'none' — без воды.
  HIP.ttkPortion=function(t,r){
    var s0=ttkCard(t,r.c); if(!s0) return null;
    var all=(s0.ings||[]).filter(function(x){ return x.q>0; }), per=all.filter(function(x){ return !x.nop; }), sep=all.filter(function(x){ return x.nop; });
    var mlAll=mlSum(all), wm=r.wm||(r.w>0?'own':'none'), w=0;
    if(wm==='own') w=r.w>0?r.w:0; else if(wm==='out'&&s0.out>0) w=Math.max(0,s0.out-mlAll);
    return {card:s0,per:per,sep:sep,w:Math.round(w*10)/10,unit:mlSum(per)+Math.round(w*10)/10,mlAll:mlAll,wm:wm};
  };
  HIP.ttkRes=function(t,c){
    if(!c||c.type!=='premix') return c;
    var r={}, k; for(k in c) r[k]=c[k];
    function rd(v,m){ return Math.round(v*m)/m; }
    var rows=HIP.ttkSrcs(c);
    if(rows){
      var mk=c.make||{}, tot=0, base=[];
      rows.forEach(function(q){ var pt=HIP.ttkPortion(t,q); if(!pt||!(q.x>0)) return; base.push({per:pt.per,w:pt.w,x:q.x,sep:pt.sep,name:pt.card.name}); tot+=pt.unit*q.x; });
      var kf=(mk.by==='v'&&mk.x>0&&tot>0)?mk.x/tot:1, map={}, out=[], water=0, np=0, sepl=[];
      base.forEach(function(b){
        np+=b.x*kf; water+=b.w*b.x*kf;
        if(b.sep.length) sepl.push({n:b.name,items:b.sep.map(function(x){ return {n:x.n,q:x.q,u:x.p?'мл':x.u}; })});
        b.per.forEach(function(x){ var key=x.k?'k:'+x.k:(x.p?'p:'+x.p:'n:'+x.n+'|'+x.u), q=x.q*b.x*kf;
          if(map[key]) map[key].q+=q; else { var o={}, kk; for(kk in x) o[kk]=x[kk]; o.q=q; map[key]=o; out.push(o); } });
      });
      out.forEach(function(o){ o.q=rd(o.q,1000); });
      if(water>0) out.push({n:'Вода',u:'мл',q:rd(water,1000)});
      r.ings=out; r.vol=tot>0?rd(tot*kf,10):0; r.portions=tot>0?rd(np,100):0; r.sep=sepl;
      return r;
    }
    if(c.fill&&c.vol>0){ var sm=mlSum(c.ings); if(c.vol>sm+0.5) r.ings=(c.ings||[]).concat([{n:'Вода',u:'мл',q:rd(c.vol-sm,10)}]); }
    return r;
  };
  HIP.ttkVol=function(c){
    if(c&&c.vol>0) return c.vol; var s=0;
    ((c&&c.ings)||[]).forEach(function(x){ if(x.q>0&&(x.p||x.u==='мл')) s+=x.q; });
    return s;
  };
  // Развернуть карточку: всё, что входит в 1 порцию (mult=1) или в mult порций, до сырья.
  // Возвращает [{k,n,q,u,sq,free}] — k есть у позиций из остатков; sq — количество в единицах остатков (л/кг/шт).
  HIP.ttkExpand=function(t,id,mult,_seen){
    var c=HIP.ttkRes(t,ttkCard(t,id)), out=[]; if(!c) return out; mult=mult==null?1:mult; _seen=(_seen||[]).concat([id]);
    (c.ings||[]).forEach(function(x){
      if(x.p){
        if(_seen.indexOf(x.p)>-1) return; var sub=HIP.ttkRes(t,ttkCard(t,x.p)); if(!sub) return;
        var v=HIP.ttkVol(sub); if(!(v>0)||!(x.q>0)) return;
        HIP.ttkExpand(t,x.p,mult*x.q/v,_seen).forEach(function(r){ out.push(r); });
      } else if(x.q>0){
        var q=x.q*mult, u=x.u||'', sq=q;
        if(x.k&&(u==='мл'||u==='г')) sq=q/1000;
        out.push({k:x.k||null,n:x.n,q:Math.round(q*1000)/1000,u:u,sq:Math.round(sq*100000)/100000,free:!x.k});
      }
    });
    return out;
  };

  // ---------- окна ----------
  var cssDone=false;
  function injectCss(){
    if(cssDone) return; cssDone=true; var s=document.createElement('style');
    s.textContent='.hip-ov{position:fixed;inset:0;z-index:300;background:rgba(10,6,4,.6);display:flex;align-items:flex-end;justify-content:center}.hip-sh{width:100%;max-width:520px;box-sizing:border-box;background:var(--bg,#241611);color:var(--ink,#F4ECDF);border-radius:12px 12px 0 0;border-top:1px solid var(--row-line,rgba(232,181,126,.26));padding:20px 16px calc(20px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:10px;font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI","Helvetica Neue",Arial,sans-serif;line-height:1.45}.hip-sh h3{margin:0;font:700 1.15rem ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI","Helvetica Neue",Arial,sans-serif}.hip-sh p{margin:0;font-size:.86rem;line-height:1.45;color:var(--muted,#C9B4A2);word-break:break-word}.hip-sh label{font-size:.78rem;font-weight:500;color:var(--muted,#C9B4A2);margin-bottom:-4px}.hip-sh input{width:100%;box-sizing:border-box;height:40px;border-radius:6px;border:1px solid var(--row-line,rgba(232,181,126,.26));background:var(--field,rgba(244,236,223,.07));color:inherit;font:500 1rem ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI","Helvetica Neue",Arial,sans-serif;padding:0 12px;-webkit-appearance:none;appearance:none}.hip-sh input:focus{outline:none;border-color:var(--accent,#C88A4E);box-shadow:0 0 0 2px rgba(200,138,78,.35)}.hip-sh button{height:40px;border-radius:6px;border:1px solid var(--row-line,rgba(232,181,126,.26));background:var(--field,rgba(244,236,223,.07));color:var(--ink,#F4ECDF);font:500 .92rem ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI","Helvetica Neue",Arial,sans-serif;box-shadow:none}.hip-sh button.main{background:var(--accent,#C88A4E);border-color:transparent;color:var(--bg,#241611);font-weight:600}.hip-sh .err{color:#E58B80;font-size:.82rem}';
    document.head.appendChild(s);
  }
  HIP.dialog=function(html){
    injectCss(); var ov=document.createElement('div'), sh=document.createElement('div'); ov.className='hip-ov'; sh.className='hip-sh'; sh.innerHTML=html; ov.appendChild(sh); document.body.appendChild(ov);
    function close(){ if(ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.addEventListener('click',function(e){ if(e.target===ov) close(); });
    return {el:sh,close:close};
  };
  HIP.adminDialog=function(onDone){
    var d;
    if(HIP.isAdmin()){
      d=HIP.dialog('<h3>Админ-режим включён</h3><p>Можно отправлять остатки, менять нормы и вносить данные. Ключ хранится только в браузере этого телефона.</p><button class="main" id="hip-edit">Править остатки и нормы</button><button id="hip-ok">Закрыть</button><button id="hip-out">Выйти из админ-режима</button>');
      d.el.querySelector('#hip-ok').onclick=d.close;
      d.el.querySelector('#hip-edit').onclick=function(){ d.close(); if(/stock\.html/.test(location.pathname)) location.hash='#edit'; else location.href='stock.html#edit'; };
      d.el.querySelector('#hip-out').onclick=function(){ ls(TK,null); mark(); d.close(); if(typeof HIP.onChange==='function') HIP.onChange(); };
      return;
    }
    d=HIP.dialog('<h3>Вход для админа</h3><p>Вставь ключ доступа GitHub (его создают один раз). Он проверяется самим GitHub и хранится только на этом телефоне.</p><input id="hip-t" type="password" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Ключ доступа"/><p class="err" id="hip-e"></p><button class="main" id="hip-go">Подключить</button><button id="hip-x">Отмена</button>');
    var t=d.el.querySelector('#hip-t'), e=d.el.querySelector('#hip-e');
    d.el.querySelector('#hip-x').onclick=d.close;
    d.el.querySelector('#hip-go').onclick=function(){
      var v=t.value.trim(); if(!v){ e.textContent='Вставь ключ.'; return; }
      e.textContent='Проверяю…'; ls(TK,v);
      HIP.check().then(function(r){
        if(r.ok){ mark(); d.close(); if(typeof HIP.onChange==='function') HIP.onChange(); if(typeof onDone==='function') onDone(); }
        else{ ls(TK,null); mark(); e.textContent=r.status===401?'Ключ не подошёл. Проверь, что скопировал его целиком.':'Нет доступа к репозиторию: '+r.status+'. Проверь, что ключ выдан на нужный репозиторий.'; }
      }).catch(function(){ ls(TK,null); mark(); e.textContent='Нет связи с GitHub. Проверь интернет.'; });
    };
  };
  HIP.bindSig=function(){
    var img=document.querySelector('.sig img, footer img');
    if(img&&!img.__hip){ img.__hip=1; img.style.cursor='pointer'; img.addEventListener('click',function(){ HIP.adminDialog(); }); }
    mark();
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',HIP.bindSig); else HIP.bindSig();
})();
