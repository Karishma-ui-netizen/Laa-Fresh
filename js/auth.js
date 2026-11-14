/**
 * Laa Fresh Stock Manager - Authentication, RBAC, Users & Audit Trail
 */
/* ================= LOGIN, ROLES & AUDIT ================= */
var AUTH={users:[],cur:null,last:Date.now()},AUDIT=null,
USERS_KEY='laaFreshUsersV1',AUDIT_KEY='laaFreshAuditV1',SESS_KEY='laaFreshSession',IDLE_MS=30*60*1000,
USER_TABS=['dashboard','inward','operations','mapping','storage','outward','vendors','reports'],  /* tabs a normal User may open */
OP_TABS=['mapping','outward'];  /* Operation Team members only see Stock Mapping & Outward Dispatch */
function lsGet(k,d){try{let v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}}
function loadUsers(){AUTH.users=lsGet(USERS_KEY,[]);if(!Array.isArray(AUTH.users))AUTH.users=[]}
function saveUsers(){if(!lsSet(USERS_KEY,AUTH.users))toast('Could not save users: browser storage is full.','err')}
function curUser(){return AUTH.cur}
function curBy(){return AUTH.cur?AUTH.cur.username:''}
function isAdmin(){return !!AUTH.cur&&AUTH.cur.role==='admin'}
function isOpRole(){return !!AUTH.cur&&(AUTH.cur.role==='operation'||AUTH.cur.role==='op')}
function canTab(id){
  if(!AUTH.cur)return false;
  if(isAdmin())return true;
  if(isOpRole())return OP_TABS.includes(id);
  return USER_TABS.includes(id);
}
function needAdmin(what){if(isAdmin())return true;toast('Only an Admin can '+what+'.','err');auditEvent('Blocked action','Tried to '+what);return false}
function uid(){return 'u'+Date.now().toString(36)+rndHex(3)}
function hex(b){return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function rndHex(n){let a=new Uint8Array(n);if(window.crypto&&crypto.getRandomValues)crypto.getRandomValues(a);else for(let i=0;i<n;i++)a[i]=Math.floor(Math.random()*256);return hex(a)}
async function hashPw(pw,salt,fallback){
 try{if(!fallback&&window.crypto&&crypto.subtle){let k=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveBits']);let b=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},k,256);return 'p1$'+hex(b)}}catch(e){}
 let s=salt+'|'+pw,h=0xdeadbeef,g=0x41c6ce57;for(let r=0;r<3000;r++){for(let i=0;i<s.length;i++){let c=s.charCodeAt(i);h=Math.imul(h^c,2654435761);g=Math.imul(g^c,1597334677)}h=Math.imul(h^(h>>>16),2246822507)^Math.imul(g^(g>>>13),3266489909);g=Math.imul(g^(g>>>16),2246822507)^Math.imul(h^(h>>>13),3266489909)}
 return 'f1$'+(g>>>0).toString(16).padStart(8,'0')+(h>>>0).toString(16).padStart(8,'0')}
async function makeHash(pw){let salt=rndHex(16);return {salt,hash:await hashPw(pw,salt)}}
async function verifyPw(u,pw){return (await hashPw(pw,u.salt,String(u.hash).startsWith('f1$')))===u.hash}

/* audit store: separate from app data, so "Clear all saved data" / restore never wipes it */
function auditAll(){if(!Array.isArray(AUDIT)){AUDIT=lsGet(AUDIT_KEY,null);if(!Array.isArray(AUDIT))AUDIT=((state&&state.activityLog)||[]).map(a=>({at:a.at,by:a.by||'',role:a.role||'',action:a.action,details:a.details}))}return AUDIT}
function auditPush(e){let a=auditAll();a.push({at:e.at||new Date().toISOString(),by:e.by||'',role:e.role||'',action:e.action,details:e.details||''});if(a.length>8000)a.splice(0,a.length-8000);lsSet(AUDIT_KEY,a)}
function auditEvent(action,details,as){let u=as||AUTH.cur;auditPush({action,details,by:u?u.username:'',role:u?u.role:''})}
function fmtAt(iso){return iso?new Date(iso).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'medium'}):'—'}
function localDay(iso){let d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}
function userLabel(un){if(!un)return '<span class="mini">before sign-in was added</span>';let u=AUTH.users.find(x=>x.username===un);return u?`<strong>${esc(u.name)}</strong> <span class="mini">(${esc(un)})</span>`:esc(un)}
function roleTag(r){
  if(!r)return '<span class="mini">—</span>';
  if(r==='admin')return '<span class="rtag admin">Admin</span>';
  if(r==='operation'||r==='op')return '<span class="rtag op">Operation Team</span>';
  return '<span class="rtag user">User</span>';
}

/* sign-in screens */
function authShow(mode,msg){
 document.body.classList.add('locked');let a=document.getElementById('auth');a.style.display='flex';
 let logo=(document.querySelector('.logo img')||{}).src||'',
 head=`<div class="alogo">${logo?`<img src="${logo}" alt="Laa Fresh">`:'🐟'}</div>`,body='';
 let quickBtn = `
   <div style="margin-top:14px;padding-top:12px;border-top:1px dashed #e2e8f0;text-align:center">
     <div style="display:flex;flex-direction:column;gap:8px">
       <button type="button" class="btn light sm" style="width:100%;border-color:#bce5ca;background:#edf9f1;color:#12805a;font-weight:750" onclick="quickAdminSignIn()">⚡ Quick Access: Enter as Admin</button>
       <button type="button" class="btn light sm" style="width:100%;border-color:#bae6fd;background:#f0f9ff;color:#0284c7;font-weight:750" onclick="quickOpSignIn()">🔪 Quick Access: Ramesh (Operation Team)</button>
     </div>
     <div class="mini" style="margin-top:6px;color:var(--muted)">1-click instant access without typing credentials</div>
   </div>
 `;
 if(mode==='setup')body=`<h2>Welcome to Laa Fresh</h2><p>Create the first <b>Admin</b> account or use 1-click Quick Access below.</p><div class="field"><label>Your full name</label><input id="aName" autocomplete="name" value="Manager"></div><div class="field"><label>Username</label><input id="aUser" autocomplete="username" autocapitalize="none" value="admin"></div><div class="field"><label>Password (min 6 characters)</label><input id="aPass" type="password" autocomplete="new-password" value="admin123"></div><div class="field"><label>Confirm password</label><input id="aPass2" type="password" autocomplete="new-password" value="admin123"></div><button class="btn">Create Admin &amp; sign in</button>${quickBtn}`;
 else if(mode==='change')body=`<h2>Choose your password</h2><p>Hello ${esc(AUTH.cur.name)}, please set your own password before you continue.</p><div class="field"><label>New password (min 6 characters)</label><input id="aPass" type="password" autocomplete="new-password"></div><div class="field"><label>Confirm new password</label><input id="aPass2" type="password" autocomplete="new-password"></div><button class="btn">Save password &amp; continue</button>`;
 else body=`<h2>Sign in</h2><p>Laa Fresh Stock Manager</p><div class="field"><label>Username</label><input id="aUser" autocomplete="username" autocapitalize="none" value="admin"></div><div class="field"><label>Password</label><input id="aPass" type="password" autocomplete="current-password" value="admin123"></div><button class="btn">Sign in</button>${quickBtn}`;
 a.innerHTML=`<form class="authcard" id="authForm">${head}<div class="autherr${msg?' show':''}" id="authErr">${esc(msg||'')}</div>${body}</form>`;
 document.getElementById('authForm').onsubmit=e=>{e.preventDefault();authSubmit(mode)};
 let f=a.querySelector('input');if(f)setTimeout(()=>f.focus(),30)}

window.quickAdminSignIn = async function() {
  loadUsers();
  let admin = AUTH.users.find(u => u.role === 'admin' && u.active);
  if (!admin) {
    let h = await makeHash('admin123');
    admin = {
      id: uid(),
      name: 'Manager',
      username: 'admin',
      role: 'admin',
      active: true,
      salt: h.salt,
      hash: h.hash,
      createdAt: new Date().toISOString(),
      createdBy: 'Quick Access',
      lastLogin: new Date().toISOString(),
      fails: 0,
      lockUntil: 0,
      mustChange: false
    };
    AUTH.users.push(admin);
    saveUsers();
  }
  startSession(admin);
};

window.quickOpSignIn = async function() {
  loadUsers();
  let opUser = AUTH.users.find(u => (u.role === 'operation' || u.role === 'op') && u.active);
  if (!opUser) {
    let h = await makeHash('ramesh123');
    opUser = {
      id: uid(),
      name: 'Ramesh',
      username: 'ramesh',
      role: 'operation',
      active: true,
      salt: h.salt,
      hash: h.hash,
      createdAt: new Date().toISOString(),
      createdBy: 'Quick Access',
      lastLogin: new Date().toISOString(),
      fails: 0,
      lockUntil: 0,
      mustChange: false
    };
    AUTH.users.push(opUser);
    saveUsers();
  }
  startSession(opUser);
};
function authErr(m){let e=document.getElementById('authErr');e.textContent=m;e.classList.add('show')}
async function authSubmit(mode){
 let v=id=>(document.getElementById(id)||{}).value||'';
 if(mode==='setup'){loadUsers();if(AUTH.users.length)return authShow('login');
  let name=v('aName').trim(),un=v('aUser').trim().toLowerCase(),p=v('aPass'),p2=v('aPass2');
  if(!name||!un)return authErr('Enter your name and a username.');if(!/^[a-z0-9._-]{3,30}$/.test(un))return authErr('Username: 3–30 letters, numbers, dot, dash or underscore.');
  if(p.length<6)return authErr('Password must be at least 6 characters.');if(p!==p2)return authErr('The two passwords do not match.');
  let h=await makeHash(p),u={id:uid(),name,username:un,role:'admin',active:true,salt:h.salt,hash:h.hash,createdAt:new Date().toISOString(),createdBy:'first setup',lastLogin:'',fails:0,lockUntil:0,mustChange:false};
  AUTH.users.push(u);saveUsers();auditEvent('First Admin account created',un+' ('+name+')',u);return startSession(u)}
 if(mode==='change'){let p=v('aPass'),p2=v('aPass2');if(p.length<6)return authErr('Password must be at least 6 characters.');if(p!==p2)return authErr('The two passwords do not match.');
  loadUsers();let u=AUTH.users.find(x=>x.id===AUTH.cur.id);if(!u)return logout();let h=await makeHash(p);Object.assign(u,{salt:h.salt,hash:h.hash,mustChange:false});saveUsers();AUTH.cur=u;auditEvent('Password changed','Chosen at first sign-in');return enterApp()}
 loadUsers();let un=v('aUser').trim().toLowerCase(),p=v('aPass'),u=AUTH.users.find(x=>x.username===un);
 if(u&&u.lockUntil>Date.now())return authErr('Too many wrong attempts. Try again in '+Math.ceil((u.lockUntil-Date.now())/1000)+' seconds.');
 let ok=!!u&&u.active&&await verifyPw(u,p);
 if(!ok){if(u&&u.active){u.fails=(u.fails||0)+1;if(u.fails>=5){u.fails=0;u.lockUntil=Date.now()+60000;auditEvent('Account temporarily locked','5 wrong passwords',u)}saveUsers()}
  auditEvent('Sign-in failed',u&&!u.active?'Disabled account':'Wrong username or password',{username:un||'(blank)',role:''});return authErr('Wrong username or password, or the account is disabled.')}
 u.fails=0;u.lockUntil=0;u.lastLogin=new Date().toISOString();saveUsers();startSession(u)}
function startSession(u){AUTH.cur=u;AUTH.last=Date.now();try{sessionStorage.setItem(SESS_KEY,JSON.stringify({id:u.id}))}catch(e){}auditEvent('Signed in','',u);if(u.mustChange)return authShow('change');enterApp()}
function updateNavForRole(){
  let nav = document.querySelector('nav');
  if(!nav) return;
  let btns = nav.querySelectorAll('button[data-tab]');
  btns.forEach(b => {
    let tab = b.getAttribute('data-tab');
    if (!canTab(tab)) {
      b.style.display = 'none';
    } else {
      b.style.display = '';
    }
  });
}
function enterApp(){
  document.getElementById('auth').style.display='none';
  document.getElementById('auth').innerHTML='';
  document.body.classList.remove('locked');
  document.body.classList.toggle('r-user',!isAdmin());
  document.body.classList.toggle('r-op', isOpRole());
  updateNavForRole();
  renderChip();
  if (isOpRole()) {
    go('mapping');
  } else {
    go('dashboard');
  }
  renderAll();
}
function logout(reason){if(AUTH.cur)auditEvent(reason||'Signed out','');AUTH.cur=null;try{sessionStorage.removeItem(SESS_KEY)}catch(e){}document.getElementById('modal').classList.remove('show');loadUsers();authShow(AUTH.users.length?'login':'setup',reason?'You were signed out: '+reason.toLowerCase()+'.':'')}
function renderChip(){let u=AUTH.cur,c=document.getElementById('userChip');if(!c)return;c.innerHTML=u?`<span>👤 <b>${esc(u.name)}</b></span>${roleTag(u.role)}<button class="chipbtn" type="button" onclick="changeMyPw()">Change password</button><button class="chipbtn" type="button" onclick="logout()">Sign out</button>`:''}

function openForm(html,handler){showModal(html+'<div class="formerr mini err" style="margin:8px 0 0;min-height:16px"></div><div class="actions" style="margin-top:10px"><button class="btn light" data-cancel type="button">Cancel</button><button class="btn" data-save type="button">Save</button></div>');
 let d=document.getElementById('dialog');d.querySelector('[data-save]').onclick=async()=>{let r=await handler(d);if(r)d.querySelector('.formerr').textContent=r;else closeModal()}}
window.changeMyPw=()=>openForm('<div class="big">🔑</div><h3>Change my password</h3><div class="formgrid" style="grid-template-columns:1fr;margin:12px 0"><div class="field"><label>Current password</label><input id="cpOld" type="password" autocomplete="current-password"></div><div class="field"><label>New password (min 6 characters)</label><input id="cpNew" type="password" autocomplete="new-password"></div><div class="field"><label>Confirm new password</label><input id="cpNew2" type="password" autocomplete="new-password"></div></div>',async d=>{
 let o=d.querySelector('#cpOld').value,n=d.querySelector('#cpNew').value,n2=d.querySelector('#cpNew2').value;loadUsers();let u=AUTH.users.find(x=>x.id===AUTH.cur.id);
 if(!u||!(await verifyPw(u,o)))return 'Current password is wrong.';if(n.length<6)return 'New password must be at least 6 characters.';if(n!==n2)return 'The two new passwords do not match.';
 let h=await makeHash(n);Object.assign(u,{salt:h.salt,hash:h.hash,mustChange:false});saveUsers();AUTH.cur=u;auditEvent('Password changed','By the user');toast('Password changed.','ok')});

/* user management (Admin) */
function activeAdmins(){return AUTH.users.filter(u=>u.role==='admin'&&u.active)}
function auditCounts(){let m={};auditAll().forEach(a=>{if(!a.by)return;let o=m[a.by]||(m[a.by]={n:0,last:''});o.n++;if(a.at>o.last)o.last=a.at});return m}
function renderUsers(){if(!isAdmin())return;loadUsers();let cnt=auditCounts();
 document.getElementById('userTable').innerHTML=table(['Person','Role','Status','Last sign-in','Actions logged','Manage'],AUTH.users.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(u=>{let me=AUTH.cur&&u.id===AUTH.cur.id,c=cnt[u.username]||{n:0,last:''};
  return [`<strong>${esc(u.name)}</strong>${me?' <span class="mini">(you)</span>':''}<div class="mini">${esc(u.username)}${u.mustChange?' · must set new password':''}</div>`,
  me?roleTag(u.role):`<select style="width:auto;padding:6px 8px" onchange="uRole('${u.id}',this.value)"><option value="user"${u.role==='user'?' selected':''}>User (Staff)</option><option value="operation"${u.role==='operation'||u.role==='op'?' selected':''}>Operation Team</option><option value="admin"${u.role==='admin'?' selected':''}>Admin</option></select>`,
  `<span class="tag ${u.active?'good':'bad'}">${u.active?'Active':'Disabled'}</span>`,`<span class="mini">${u.lastLogin?esc(fmtAt(u.lastLogin)):'never'}</span>`,`${c.n}${c.last?`<div class="mini">last: ${esc(fmtAt(c.last))}</div>`:''}`,
  `<div class="actions" style="flex-wrap:nowrap"><button class="icon-btn" type="button" onclick="uReset('${u.id}')">Reset password</button>${me?'':`<button class="icon-btn" type="button" onclick="uToggle('${u.id}')">${u.active?'Disable':'Enable'}</button><button class="icon-btn" type="button" onclick="uDel('${u.id}')">Delete</button>`}</div>`]}));
 renderAudit()}
window.uRole=(id,role)=>{if(!needAdmin('change roles'))return;loadUsers();let u=AUTH.users.find(x=>x.id===id);if(!u||u.role===role)return;
 if(u.role==='admin'&&u.active&&activeAdmins().length<=1){toast('There must be at least one active Admin.','err');return renderUsers()}
 let old=u.role;u.role=role;saveUsers();auditEvent('User role changed',`${u.username}: ${old} → ${role}`);
 let roleTitle = role==='admin'?'an Admin':(role==='operation'?'Operation Team':'a User');
 toast(`${u.name} is now ${roleTitle}.`,'ok');renderUsers()};
window.uToggle=id=>{if(!needAdmin('enable or disable users'))return;loadUsers();let u=AUTH.users.find(x=>x.id===id);if(!u)return;
 if(u.active&&u.role==='admin'&&activeAdmins().length<=1)return toast('There must be at least one active Admin.','err');
 u.active=!u.active;saveUsers();auditEvent(u.active?'User enabled':'User disabled',u.username);renderUsers()};
window.uDel=id=>{if(!needAdmin('delete users'))return;loadUsers();let u=AUTH.users.find(x=>x.id===id);if(!u)return;
 if(u.role==='admin'&&u.active&&activeAdmins().length<=1)return toast('There must be at least one active Admin.','err');
 showModal(`<div class="big">🗑</div><h3>Delete ${esc(u.name)}?</h3><p>They will no longer be able to sign in. Everything they did stays in the audit trail. You can also just <b>Disable</b> the account instead.</p><div class="actions"><button class="btn light" data-cancel>Keep</button><button class="btn danger" data-ok>Delete user</button></div>`,()=>{loadUsers();AUTH.users=AUTH.users.filter(x=>x.id!==id);saveUsers();auditEvent('User deleted',u.username+' ('+u.name+')');renderUsers();toast('User deleted.','ok')})};
window.uReset=id=>{if(!needAdmin('reset passwords'))return;loadUsers();let u=AUTH.users.find(x=>x.id===id);if(!u)return;
 openForm(`<div class="big">🔑</div><h3>Reset password · ${esc(u.name)}</h3><p>Set a temporary password. They will be asked to choose their own at the next sign-in.</p><div class="field"><label>Temporary password (min 6 characters)</label><input id="rpNew" type="text" autocomplete="off"></div>`,async d=>{
  let p=d.querySelector('#rpNew').value;if(p.length<6)return 'Password must be at least 6 characters.';loadUsers();let x=AUTH.users.find(z=>z.id===id);if(!x)return 'User no longer exists.';
  let h=await makeHash(p);Object.assign(x,{salt:h.salt,hash:h.hash,mustChange:true,fails:0,lockUntil:0});saveUsers();auditEvent('Password reset by Admin',x.username);toast('Password reset.','ok');renderUsers()})};

/* audit view */
function auditFiltered(){let u=document.getElementById('auUser').value,ac=document.getElementById('auAction').value,f=document.getElementById('auFrom').value,t=document.getElementById('auTo').value,q=(document.getElementById('auQ').value||'').toLowerCase();
 return auditAll().filter(a=>(!u||(u==='__none__'?!a.by:a.by===u))&&(!ac||a.action===ac)&&(!f||(a.at&&localDay(a.at)>=f))&&(!t||(a.at&&localDay(a.at)<=t))&&(!q||(a.action+' '+a.details+' '+a.by).toLowerCase().includes(q))).slice().reverse()}
function renderAudit(){let all=auditAll(),us=document.getElementById('auUser'),ac=document.getElementById('auAction'),uv=us.value,av=ac.value,
 names=[...new Set(all.map(a=>a.by).filter(Boolean).concat(AUTH.users.map(u=>u.username)))].sort();
 us.innerHTML='<option value="">All users</option>'+names.map(n=>{let u=AUTH.users.find(x=>x.username===n);return `<option value="${esc(n)}">${esc(u?u.name+' ('+n+')':n)}</option>`}).join('')+(all.some(a=>!a.by)?'<option value="__none__">Before sign-in was added</option>':'');
 ac.innerHTML='<option value="">All actions</option>'+[...new Set(all.map(a=>a.action))].sort().map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
 if([...us.options].some(o=>o.value===uv))us.value=uv;if([...ac.options].some(o=>o.value===av))ac.value=av;
 let L=auditFiltered(),shown=L.slice(0,400);document.getElementById('auInfo').textContent=L.length?`Showing latest ${shown.length} of ${L.length} matching entries (newest first). Export CSV to get all of them.`:'';
 document.getElementById('auTable').innerHTML=L.length?table(['When','Who','Role','Action','Details'],shown.map(a=>[`<span class="mini">${esc(fmtAt(a.at))}</span>`,userLabel(a.by),roleTag(a.role),`<strong>${esc(a.action)}</strong>`,esc(a.details)])):'<div class="empty">No matching activity.</div>'}
function auditCsv(){let L=auditFiltered(),rows=[['When','Username','Name','Role','Action','Details'],...L.map(a=>{let u=AUTH.users.find(x=>x.username===a.by);return [a.at?new Date(a.at).toLocaleString('en-IN'):'',a.by,u?u.name:'',a.role,a.action,a.details]})];
 download('laa-fresh-audit-'+dateNow()+'.csv',rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n'),'text/csv')}

/* role guards for sensitive functions (the tabs are also hidden for Users) */
function applyRoleGuards(){
  ({editProduct:'edit products',deleteProduct:'delete products',deleteSupplier:'remove suppliers',deleteCustomer:'remove customers',purgeTx:'permanently delete entries',vDeleteExtraBill:'delete additional bills'}) && Object.entries({editProduct:'edit products',deleteProduct:'delete products',deleteSupplier:'remove suppliers',deleteCustomer:'remove customers',purgeTx:'permanently delete entries',vDeleteExtraBill:'delete additional bills'}).forEach(([n,w])=>{let f=window[n];if(typeof f==='function'&&!f._guarded){let g=function(){if(!needAdmin(w))return;return f.apply(this,arguments)};g._guarded=true;window[n]=g}});
  ['emptyBin','clearBtn','backupBtn'].forEach(id=>{let el=document.getElementById(id),o=el&&el.onclick;if(o&&!o._guarded){let g=function(e){if(!needAdmin('do that'))return;return o.call(this,e)};g._guarded=true;el.onclick=g}});
  let el=document.getElementById('restoreFile'),o=el&&el.onchange;if(el&&(!o||!o._guarded)){let g=function(e){if(!isAdmin()){e.target.value='';return needAdmin('restore backups')}if(o)return o.call(this,e)};g._guarded=true;el.onchange=g}
  let rt=document.getElementById('vRateTable');if(rt&&!rt._guarded){rt._guarded=true;rt.addEventListener('change',e=>{if(!isAdmin()){e.stopImmediatePropagation();toast('Only an Admin can change rates.','err');auditEvent('Blocked action','Tried to change a vendor rate');vRates()}},true)}
}

function authInit(){
  applyRoleGuards();
  document.getElementById('userForm').onsubmit=async e=>{
    e.preventDefault();
    if(!needAdmin('add users'))return;
    loadUsers();
    let name=document.getElementById('nuName').value.trim(),
        un=document.getElementById('nuUser').value.trim().toLowerCase(),
        p=document.getElementById('nuPass').value,
        roleVal=document.getElementById('nuRole').value;
    let role = roleVal==='admin'?'admin':(roleVal==='operation'?'operation':'user');
    if(!name||!un)return toast('Enter the name and username.','err');
    if(!/^[a-z0-9._-]{3,30}$/.test(un))return toast('Username: 3–30 letters, numbers, dot, dash or underscore.','err');
    if(AUTH.users.some(u=>u.username===un))return toast('That username already exists.','err');
    if(p.length<6)return toast('Password must be at least 6 characters.','err');
    let h=await makeHash(p);
    AUTH.users.push({id:uid(),name,username:un,role,active:true,salt:h.salt,hash:h.hash,createdAt:new Date().toISOString(),createdBy:curBy(),lastLogin:'',fails:0,lockUntil:0,mustChange:true});
    saveUsers();
    let roleTitle = role==='admin'?'an Admin':(role==='operation'?'Operation Team':'a User');
    auditEvent('User created',`${un} (${name}) as ${roleTitle}`);
    e.target.reset();
    toast(`${name} added as ${roleTitle}.`,'ok');
    renderUsers();
  };
  ['auUser','auAction','auFrom','auTo'].forEach(i=>document.getElementById(i).onchange=renderAudit);
  document.getElementById('auQ').oninput=renderAudit;
  document.getElementById('auExport').onclick=auditCsv;
  document.getElementById('auFrom').value='';
  document.getElementById('auTo').value='';
  ['click','keydown','touchstart'].forEach(ev=>document.addEventListener(ev,()=>{AUTH.last=Date.now()},true));
  setInterval(()=>{if(AUTH.cur&&Date.now()-AUTH.last>IDLE_MS)logout('Signed out after 30 minutes of inactivity')},30000);
  window.addEventListener('storage',e=>{
    if(e.key===USERS_KEY&&AUTH.cur){
      loadUsers();
      let u=AUTH.users.find(x=>x.id===AUTH.cur.id);
      if(!u||!u.active)logout('Your account was changed by an Admin');
      else if(u.role!==AUTH.cur.role){AUTH.cur=u;enterApp()}
    }
  });
  loadUsers();
  let sid=null;
  try{sid=(JSON.parse(sessionStorage.getItem(SESS_KEY))||{}).id}catch(e){}
  let su=sid&&AUTH.users.find(x=>x.id===sid&&x.active&&!x.mustChange);
  if(su){AUTH.cur=su;enterApp()}else if(!AUTH.users.length){quickAdminSignIn()}else authShow('login');
}

