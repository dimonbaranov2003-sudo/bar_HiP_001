/* Общий модуль: чтение и запись общих данных (data/state.json в репозитории) и админ-режим. */
(function(){
  var CFG={owner:'dimonbaranov2003-sudo', repo:'HiP_001', path:'data/state.json'};
  var TK='hip:token', CK='hip:cache';
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
  HIP.read=function(){
    function cached(){ try{ return JSON.parse(ls(CK)||'null'); }catch(x){ return null; } }
    return fetch(CFG.path+'?t='+Date.now(),{cache:'no-store'}).then(function(r){
      if(r.status===404) return null; if(!r.ok) throw new Error('HTTP '+r.status); return r.json();
    }).then(function(d){
      var c=cached();
      if(c&&(!d||(c.updated&&d.updated&&c.updated>d.updated))) return c;   // свою свежую запись показываем сразу, пока Pages обновляется
      if(d) ls(CK,JSON.stringify(d));
      return d;
    }).catch(function(e){ var c=cached(); if(c){ c.__cached=true; return c; } throw e; });
  };

  // ---------- запись: только с токеном (проверяет сам GitHub) ----------
  function api(method,url,body){
    return fetch('https://api.github.com'+url,{method:method,headers:{'Authorization':'Bearer '+token(),'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  }
  function b64(s){ return btoa(unescape(encodeURIComponent(s))); }
  function unb64(b){ return decodeURIComponent(escape(atob(String(b).replace(/\n/g,'')))); }
  function explain(status){
    if(status===401) return 'GitHub не принял ключ (неверный или истёк срок).';
    if(status===403||status===404) return 'У ключа нет прав записи в репозиторий (нужно Contents: Read and write).';
    return 'GitHub ответил ошибкой '+status+'.';
  }
  HIP.check=function(){
    return api('GET','/repos/'+CFG.owner+'/'+CFG.repo).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ return {ok:r.ok,status:r.status,branch:j.default_branch}; }); });
  };
  var CONTENTS='/repos/'+CFG.owner+'/'+CFG.repo+'/contents/'+CFG.path;
  HIP.update=async function(mutate){
    if(!HIP.isAdmin()) throw new Error('Нужен админ-режим.');
    for(var tries=0;tries<3;tries++){
      var r=await api('GET',CONTENTS), st={v:1}, sha;
      if(r.status===200){ var j=await r.json(); sha=j.sha; st=JSON.parse(unb64(j.content)); }
      else if(r.status!==404) throw new Error(explain(r.status));
      st=mutate(st)||st; st.updated=new Date().toISOString();
      var body={message:'Остатки: '+st.updated, content:b64(JSON.stringify(st))}; if(sha) body.sha=sha;
      var put=await api('PUT',CONTENTS,body);
      if(put.ok){ ls(CK,JSON.stringify(st)); return st; }
      if(put.status!==409&&put.status!==422) throw new Error(explain(put.status));
    }
    throw new Error('Не удалось сохранить: файл менялся одновременно. Попробуй ещё раз.');
  };

  // ---------- окна ----------
  var cssDone=false;
  function injectCss(){
    if(cssDone) return; cssDone=true; var s=document.createElement('style');
    s.textContent='.hip-ov{position:fixed;inset:0;z-index:300;background:rgba(10,6,4,.6);display:flex;align-items:flex-end;justify-content:center}.hip-sh{width:100%;max-width:520px;box-sizing:border-box;background:var(--bg,#241611);color:var(--ink,#F4ECDF);border-radius:20px 20px 0 0;padding:20px 18px calc(20px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:10px;font-family:Manrope,sans-serif}.hip-sh h3{margin:0;font:500 1.2rem Fraunces,serif}.hip-sh p{margin:0;font-size:.82rem;line-height:1.45;color:var(--muted,#B49C89);word-break:break-word}.hip-sh label{font-size:.72rem;color:var(--muted,#B49C89);margin-bottom:-4px}.hip-sh input{width:100%;box-sizing:border-box;height:46px;border-radius:12px;border:1.5px solid var(--line,#5a4a3a);background:var(--surface,#2c2015);color:inherit;font:600 1rem Manrope,sans-serif;padding:0 14px}.hip-sh input:focus{outline:none;border-color:var(--accent-ink,#E8B57E)}.hip-sh button{height:46px;border-radius:12px;border:1.5px solid var(--accent-ink,#E8B57E);background:var(--surface,#2c2015);color:var(--accent-ink,#E8B57E);font:700 .92rem Manrope,sans-serif}.hip-sh button.main{background:var(--accent-ink,#E8B57E);color:var(--bg,#241611)}.hip-sh .err{color:#E0786A}';
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
