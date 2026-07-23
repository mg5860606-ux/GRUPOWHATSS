(function(){
var params=new URLSearchParams(window.location.search);
var otherUid=params.get('uid')||'';
var otherName=decodeURIComponent(params.get('name')||'Usuario');
var otherColor=decodeURIComponent(params.get('color')||'#3498db');
if(!otherUid){window.location.href='chat.html';return;}

var cfg={apiKey:"AIzaSyDgtqqGgjGgYmmNYg9cxhHIc-VIPASz3uE",authDomain:"grupos-whats-app.firebaseapp.com",projectId:"grupos-whats-app",storageBucket:"grupos-whats-app.appspot.com",messagingSenderId:"326359053624",appId:"1:326359053624:web:6a73ed5758052f2331e8be"};
if(!firebase.apps.length)firebase.initializeApp(cfg);
var db=firebase.firestore(),auth=firebase.auth();
var COLORS=['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db','#9b59b6','#e84393','#00b894','#6c5ce7','#fd79a0','#00cec9','#74b9ff','#a29bfe','#ff6348'];
var PAGE_SIZE=30,firstDoc=null,allMessages=[];
var myNick=localStorage.getItem('gw_chat_nick')||'';
var myColor=localStorage.getItem('gw_chat_color')||'';
var myUid=localStorage.getItem('gw_chat_uid')||'';
var unsub=null,pendingImgData=null,pendingVideoData=null;
var mediaRecorder=null,audioChunks=[],recInterval=null,recSeconds=0;
var profilesCache={},fullImgSrc=null,presenceUnsub=null;
var heartbeatInterval=null,typingUnsub=null;
var chatId='';var lastSeenMsgId='';

if(!myUid){myUid='u_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);localStorage.setItem('gw_chat_uid',myUid);}
if(!myColor){myColor=COLORS[Math.floor(Math.random()*COLORS.length)];localStorage.setItem('gw_chat_color',myColor);}

function makeChatId(a,b){return a<b?a+'_'+b:b+'_'+a;}
chatId=makeChatId(myUid,otherUid);

function ensureAuth(){return auth.signInAnonymously().catch(function(e){console.warn(e);return Promise.reject(e);});}
function getInitials(n){var p=n.trim().split(/\s+/);return p.length>=2?(p[0][0]+p[1][0]).toUpperCase():n.substring(0,2).toUpperCase();}
function getColor(n){var h=0;for(var i=0;i<n.length;i++)h=n.charCodeAt(i)+((h<<5)-h);return COLORS[Math.abs(h)%COLORS.length];}
function formatTime(ts){
    if(!ts)return'';var d=ts.toDate?ts.toDate():new Date(ts);
    var now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    var yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);
    var msgDay=new Date(d.getFullYear(),d.getMonth(),d.getDate());
    var time=d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    if(msgDay.getTime()===today.getTime())return time;
    if(msgDay.getTime()===yesterday.getTime())return'Ontem '+time;
    return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' '+time;
}
function formatDateSep(ts){
    if(!ts)return'';var d=ts.toDate?ts.toDate():new Date(ts);
    var now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    var yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);
    var msgDay=new Date(d.getFullYear(),d.getMonth(),d.getDate());
    if(msgDay.getTime()===today.getTime())return'HOJE';
    if(msgDay.getTime()===yesterday.getTime())return'ONTEM';
    var opts={day:'numeric',month:'long'};if(d.getFullYear()!==now.getFullYear())opts.year='numeric';
    return d.toLocaleDateString('pt-BR',opts).toUpperCase();
}
function scrollBottom(){var c=document.getElementById('chatMessages');requestAnimationFrame(function(){c.scrollTop=c.scrollHeight;});}

function loadProfile(uid){
    if(profilesCache[uid])return Promise.resolve(profilesCache[uid]);
    return db.collection('chatProfiles').doc(uid).get().then(function(s){
        if(s.exists){profilesCache[uid]=s.data();return s.data();}return null;
    }).catch(function(){return null;});
}
function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function escUrl(s){return (s && (/^https?:\/\//.test(s) || /^data:image\//.test(s) || /^data:video\//.test(s) || /^data:audio\//.test(s))) ? s : '';}
function loadProfileSync(uid){if(profilesCache[uid])return profilesCache[uid];loadProfile(uid);return null;}
function makeAvatar(uid,username,color,sz){
    sz=sz||34;var prof=loadProfileSync(uid);
    var eu=escHtml(uid),ec=escHtml(color);
    if(prof&&prof.photo)return '<div class="ma" style="width:'+sz+'px;height:'+sz+'px;background:'+ec+'"><img src="'+escUrl(prof.photo)+'"></div>';
    return '<div class="ma" style="width:'+sz+'px;height:'+sz+'px;background:'+ec+'">'+getInitials(username||'??')+'</div>';
}

document.getElementById('otherName').textContent=otherName;
var oAv=document.getElementById('otherAvatar');
oAv.style.background=otherColor;
loadProfile(otherUid).then(function(prof){
    if(prof&&prof.photo){oAv.innerHTML='<img src="'+escUrl(prof.photo)+'">';}else{oAv.innerHTML=getInitials(otherName);}
}).catch(function(){oAv.innerHTML=getInitials(otherName);});

function goOnline(){
    var presRef=db.collection('chatPresence').doc(myUid);
    presRef.set({uid:myUid,nick:myNick,ts:firebase.firestore.FieldValue.serverTimestamp(),color:myColor},{merge:true}).catch(function(){});
    presenceUnsub=db.collection('chatPresence').doc(otherUid).onSnapshot(function(snap){
        if(snap.exists){
            var data=snap.data(),ts=data.ts;
            if(ts){
                var tss=ts.toDate?ts.toDate().getTime():0;
                var online=Date.now()-tss<120000;
                document.getElementById('presenceDot').className=online?'od':'offd';
                document.getElementById('presenceText').textContent=online?'online':'offline';
            }else{
                document.getElementById('presenceDot').className='offd';
                document.getElementById('presenceText').textContent='offline';
            }
        }else{
            document.getElementById('presenceDot').className='offd';
            document.getElementById('presenceText').textContent='offline';
        }
    },function(){});
    heartbeatInterval=setInterval(function(){presRef.set({ts:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}).catch(function(){});},30000);
}

window.openProfile=function(uid){
    loadProfile(uid).then(function(prof){
        var isMe=uid===myUid,box=document.getElementById('profileModalBox');
        var name=(prof&&prof.name)||(isMe?myNick:(uid===otherUid?otherName:'Usuario'));
        var bio=(prof&&prof.bio)||'',photo=(prof&&prof.photo)||'';
        var color=isMe?myColor:otherColor;
        var en=escHtml(name),eb=escHtml(bio),eu=escHtml(uid),ep=escUrl(photo),ec=escHtml(color);
        var h='<div class="ph"><div class="paw" style="background:'+ec+'">';
        if(photo)h+='<img src="'+ep+'">';else h+=getInitials(name);
        h+='</div><div class="pn">'+en+'</div><div class="pid">'+eu+'</div></div><div class="pbd">';
        if(bio)h+='<div class="pbio">'+eb+'</div>';else h+='<div class="pbio em">Nenhuma bio definida</div>';
        if(isMe){
            h+='<div class="pfe"><input id="profNameIn" placeholder="Seu nome" value="'+en+'" maxlength="20"><textarea id="profBioIn" placeholder="Sua bio..." maxlength="150">'+eb+'</textarea>';
            h+='<label style="font-size:.75rem;color:#888;cursor:pointer;display:block;text-align:center;margin:4px 0"><i class="fas fa-camera"></i> Trocar foto <input type="file" accept="image/*" style="display:none" onchange="previewProfilePhoto(event)"></label>';
            h+='<img id="profPhotoPrev" src="'+ep+'" style="display:none;width:50px;height:50px;object-fit:cover;border-radius:50%;margin:0 auto 6px">';
            h+='<button class="psb" onclick="saveMyProfile()">Salvar</button></div>';
        }else{
            h+='<button class="pcb" onclick="closeProfileModal()">Fechar</button>';
        }
        h+='</div>';box.innerHTML=h;
        document.getElementById('profileModal').classList.add('sh');
    });
};
window.openMyProfile=function(){openProfile(myUid);};
window.closeProfileModal=function(){document.getElementById('profileModal').classList.remove('sh');};
var _profilePhotoData='';
window.previewProfilePhoto=function(e){
    var f=e.target.files[0];if(!f)return;
    if(f.size>5*1024*1024){alert('Imagem muito grande. Maximo 5MB.');return;}
    var r=new FileReader();r.onload=function(ev){
        var img=new Image();img.onload=function(){
            var maxSz=200,canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
            var w=img.width,h=img.height;
            if(w>maxSz||h>maxSz){if(w>h){h=Math.round(h*maxSz/w);w=maxSz;}else{w=Math.round(w*maxSz/h);h=maxSz;}}
            canvas.width=w;canvas.height=h;ctx.drawImage(img,0,0,w,h);
            _profilePhotoData=canvas.toDataURL('image/jpeg',0.7);
            document.getElementById('profPhotoPrev').src=_profilePhotoData;
            document.getElementById('profPhotoPrev').style.display='block';
        };img.src=ev.target.result;
    };r.readAsDataURL(f);
};
window.saveMyProfile=function(){
    var name=document.getElementById('profNameIn').value.trim(),bio=document.getElementById('profBioIn').value.trim();
    if(!name||name.length<2){document.getElementById('profNameIn').style.borderColor='#e74c3c';return;}
    var data={name:name,bio:bio};
    if(_profilePhotoData){data.photo=_profilePhotoData;}
    var btn=document.getElementById('myProfileBtn');
    var saveBtn=document.querySelector('.psb');
    if(saveBtn){saveBtn.textContent='Salvando...';saveBtn.disabled=true;}
    ensureAuth().then(function(){return db.collection('chatProfiles').doc(myUid).set(data,{merge:true});}).then(function(){
        myNick=name;localStorage.setItem('gw_chat_nick',name);
        var cached=profilesCache[myUid]||{};cached.name=name;cached.bio=bio;
        if(_profilePhotoData)cached.photo=_profilePhotoData;
        profilesCache[myUid]=cached;
        if(cached.photo)btn.innerHTML='<img src="'+escUrl(cached.photo)+'">';else btn.innerHTML='<i class="fas fa-user" style="font-size:.9rem"></i>';
        _profilePhotoData='';
        closeProfileModal();
    }).catch(function(e){console.error(e);if(saveBtn){saveBtn.textContent='Salvar';saveBtn.disabled=false;}
        if(e.message&&e.message.indexOf('too large')!==-1){alert('Foto muito grande. Tente uma imagem menor.');}
        else{alert('Erro ao salvar perfil. Tente novamente.');}
    });
};

var EMOJIS={'Frequentes':['\u{1F600}','\u{1F602}','\u{1F60D}','\u{1F970}','\u{1F60E}','\u{1F929}','\u{1F62D}','\u{1F97A}','\u{1F621}','\u{1F92F}','\u{1F973}','\u{1F634}','\u{1F644}','\u{1F914}','\u{1F92B}','\u{1F92D}','\u{1F608}','\u{1F480}','\u{1F921}','\u{1F47B}','\u{2764}\u{FE0F}','\u{1F525}','\u{2728}','\u{1F4AF}','\u{1F44F}','\u{1F64F}','\u{1F4AA}','\u{1F389}','\u{1FAE1}','\u{1F91D}','\u{1F440}','\u{1F44D}','\u{1F44E}','\u{270A}','\u{1F44A}','\u{1F64C}','\u{1F918}','\u{1F64D}','\u{1F64E}','\u{1F972}','\u{1F975}','\u{1F976}','\u{1F92A}','\u{1F928}','\u{1F9D0}','\u{1F60B}','\u{1F618}','\u{1F61C}','\u{1F61D}','\u{1F924}','\u{1F614}','\u{1F62C}','\u{1F62E}','\u{1F62F}','\u{1F632}','\u{1F633}','\u{1F635}','\u{1F636}','\u{1F637}','\u{1F911}','\u{1F913}','\u{1F607}','\u{1F606}','\u{1F605}','\u{1F604}','\u{1F601}','\u{1F603}','\u{1F60A}','\u{1F609}','\u{1F60F}','\u{1F610}','\u{1F611}','\u{1F615}','\u{1F616}','\u{1F61A}','\u{1F61B}','\u{1F61E}','\u{1F61F}','\u{1F620}','\u{1F622}','\u{1F623}','\u{1F624}','\u{1F625}','\u{1F628}','\u{1F629}','\u{1F62A}','\u{1F62B}','\u{1F630}','\u{1F631}'],'Maos':['\u{1F44B}','\u{1F590}\u{FE0F}','\u{270B}','\u{1F44C}','\u{270C}\u{FE0F}','\u{1F91E}','\u{1F44D}','\u{1F44E}','\u{270A}','\u{1F44A}','\u{1F44F}','\u{1F64F}','\u{1F450}','\u{1F932}','\u{1F91F}'],'Coracoes':['\u{2764}\u{FE0F}','\u{1F9E1}','\u{1F49B}','\u{1F49A}','\u{1F499}','\u{1F49C}','\u{1F5A4}','\u{1F90D}','\u{1F90E}','\u{1F494}','\u{1F495}','\u{1F496}','\u{1F497}','\u{1F498}','\u{1F49D}','\u{1F49E}','\u{1F49F}'],'Animais':['\u{1F436}','\u{1F431}','\u{1F439}','\u{1F430}','\u{1F98A}','\u{1F43B}','\u{1F43C}','\u{1F428}','\u{1F42F}','\u{1F43E}','\u{1F435}','\u{1F648}','\u{1F649}','\u{1F64A}','\u{1F412}','\u{1F414}','\u{1F427}','\u{1F426}','\u{1F424}','\u{1F983}','\u{1F425}','\u{1F985}','\u{1F986}','\u{1F987}','\u{1F989}','\u{1F43A}','\u{1F417}','\u{1F434}','\u{1F984}','\u{1F418}','\u{1F99B}','\u{1F40E}','\u{1F403}','\u{1F407}','\u{1F437}','\u{1F416}','\u{1F415}','\u{1F408}','\u{1F400}','\u{1F405}','\u{1F406}'],'Comida':['\u{1F34E}','\u{1F348}','\u{1F34F}','\u{1F34A}','\u{1F34B}','\u{1F34C}','\u{1F349}','\u{1F353}','\u{1F351}','\u{1F344}','\u{1F354}','\u{1F355}','\u{1F32D}','\u{1F32E}','\u{1F32F}','\u{1F359}','\u{1F35A}','\u{1F35B}','\u{1F35C}','\u{1F35D}','\u{1F35E}','\u{1F35F}','\u{1F361}','\u{1F362}','\u{1F363}','\u{1F370}','\u{1F382}','\u{1F371}','\u{1F36B}','\u{1F36C}','\u{1F36D}','\u{1F36A}','\u{1F366}','\u{1F369}','\u{1F36E}','\u{1F36F}','\u{1F9C0}','\u{1F37C}','\u{2615}','\u{1F375}','\u{1F376}','\u{1F37A}','\u{1F37B}','\u{1F378}','\u{1F379}','\u{1F377}','\u{1F37E}','\u{1F943}','\u{1F942}','\u{1F9C2}','\u{1F9C3}','\u{1F964}','\u{1F963}','\u{1F96E}','\u{1F96F}','\u{1F95E}','\u{1F9C7}','\u{1F9C1}','\u{1F962}','\u{1F961}','\u{1F95F}','\u{1F95A}','\u{1F95B}','\u{1F95C}','\u{1F95D}','\u{1F9C8}','\u{1F9C9}','\u{1F9CA}','\u{1F969}','\u{1F96A}','\u{1F96B}','\u{1F356}','\u{1F357}','\u{1F959}','\u{1F958}','\u{1F373}','\u{1F9C6}'],'Objetos':['\u{1F4F1}','\u{1F4BB}','\u{1F4F7}','\u{1F4F9}','\u{1F4FA}','\u{1F4A1}','\u{1F4B0}','\u{1F4E6}','\u{1F4DD}','\u{1F511}','\u{1F50D}','\u{1F512}','\u{1F514}','\u{1F4E3}','\u{1F4E2}','\u{1F4BD}','\u{1F4BE}','\u{1F4BF}','\u{1F4C0}','\u{1F50B}','\u{1F50C}','\u{1F381}','\u{1F389}','\u{1F38A}','\u{1F388}','\u{1F386}','\u{1F387}','\u{1F380}','\u{1F48E}','\u{1F48D}','\u{1F525}','\u{2728}','\u{2B50}','\u{1F4AF}','\u{1F319}','\u{1F5A4}','\u{26BD}','\u{26BE}','\u{1F3B5}','\u{1F3BC}','\u{1F3B6}']};

function buildEmojiPicker(){
    var el=document.getElementById('emojiPicker'),h='';
    for(var sec in EMOJIS){
        h+='<div class="est">'+sec+'</div><div class="eg">';
        EMOJIS[sec].forEach(function(e){h+='<span class="ei" onclick="insertEmoji(\''+e+'\')">'+e+'</span>';});
        h+='</div>';
    }
    el.innerHTML=h;
}

var STICKER_TABS={
    'Recentes':[],
    'Rostos':['\u{1F600}','\u{1F603}','\u{1F604}','\u{1F601}','\u{1F602}','\u{1F609}','\u{1F60A}','\u{1F607}','\u{1F60E}','\u{1F60D}','\u{1F970}','\u{1F618}','\u{1F61C}','\u{1F60B}','\u{1F60F}','\u{1F62C}','\u{1F913}','\u{1F608}','\u{1F636}','\u{1F610}','\u{1F62F}','\u{1F62E}','\u{1F9D0}','\u{1F635}','\u{1F624}','\u{1F620}','\u{1F637}','\u{1F975}','\u{1F976}','\u{1F97A}','\u{1F92A}','\u{1F928}','\u{1F61F}','\u{1F622}','\u{1F62D}','\u{1F631}','\u{1F628}','\u{1F623}','\u{1F62B}','\u{1F629}','\u{1F633}','\u{1F911}','\u{1F917}','\u{1F92D}','\u{1F92B}','\u{1F914}','\u{1F973}','\u{1F60C}','\u{1F614}','\u{1F606}','\u{1F634}','\u{1F632}','\u{1F61E}','\u{1F620}','\u{1F616}','\u{1F9F9}','\u{1F9F8}','\u{1FA71}','\u{1FA72}','\u{1F475}','\u{1F476}','\u{1F466}','\u{1F467}','\u{1F469}','\u{1F468}','\u{1F474}','\u{1F471}','\u{1F9D4}','\u{1F472}','\u{1F46F}','\u{1F9D1}','\u{1F470}','\u{1F935}','\u{1F478}','\u{1F934}','\u{1F64F}','\u{1F44F}','\u{1F64C}','\u{1F450}','\u{1F932}','\u{1F91E}','\u{1F44A}','\u{270A}','\u{1F44B}','\u{1F44D}','\u{1F44E}','\u{270B}','\u{1F44C}','\u{1F918}','\u{1F446}','\u{1F447}','\u{1F449}','\u{1F448}','\u{1F440}','\u{1FAC0}','\u{1FAC1}','\u{1F9B4}','\u{1F9B7}','\u{1F485}','\u{1F484}','\u{1F48B}','\u{1F44D}','\u{1F44E}','\u{270C}\u{FE0F}','\u{1F91C}','\u{1F91F}','\u{1F91B}','\u{1F91A}','\u{1F446}','\u{1F447}','\u{1F449}','\u{1F448}'],
    'Objetos':['\u{1F4F1}','\u{1F4BB}','\u{1F4F7}','\u{1F4F9}','\u{1F4FA}','\u{1F4A1}','\u{1F4B0}','\u{1F4E6}','\u{1F4DD}','\u{1F511}','\u{1F50D}','\u{1F512}','\u{1F514}','\u{1F4E3}','\u{1F4E2}','\u{1F4BD}','\u{1F4BE}','\u{1F4BF}','\u{1F4C0}','\u{1F50B}','\u{1F50C}','\u{1F381}','\u{1F389}','\u{1F38A}','\u{1F388}','\u{1F386}','\u{1F387}','\u{1F380}','\u{1F48E}','\u{1F48D}','\u{1F525}','\u{2728}','\u{2B50}','\u{1F4AF}','\u{1F319}','\u{1F5A4}','\u{26BD}','\u{26BE}','\u{1F3B5}','\u{1F3BC}','\u{1F3B6}']};

function buildStickersPicker(){
    var el=document.getElementById('stickersPicker');
    var saved;try{saved=JSON.parse(localStorage.getItem('gw_saved_stickers')||'[]');}catch(e){saved=[];}
    var tabHtml='<div class="spt">';
    var tabs=Object.keys(STICKER_TABS);
    if(saved.length>0)tabHtml+='<button class="sact" onclick="showStickerTab(\'salvos\')">Meus</button>';
    tabs.forEach(function(t,i){tabHtml+='<button'+(i===0&&saved.length===0?' class="sact"':'')+' onclick="showStickerTab(\''+t+'\')">'+t+'</button>';});
    tabHtml+='</div><div id="stickerTabContent"></div>';
    el.innerHTML=tabHtml;
    if(saved.length>0)showStickerTab('salvos');else showStickerTab(tabs[0]);
}
window.showStickerTab=function(tab){
    var content=document.getElementById('stickerTabContent');
    var sticks;try{sticks=tab==='salvos'?JSON.parse(localStorage.getItem('gw_saved_stickers')||'[]'):(STICKER_TABS[tab]||[]);}catch(e){sticks=tab==='salvos'?[]:(STICKER_TABS[tab]||[]);}
    var h='<div class="sg">';
    sticks.forEach(function(s){
        h+='<div class="si" onclick="sendSticker(\''+s+'\')">'+s;
        h+='<button class="ssv" onclick="event.stopPropagation();saveStickerToKb(\''+s+'\')" title="Salvar"><i class="fas fa-plus"></i></button>';
        h+='</div>';
    });
    h+='</div>';
    if(tab!=='salvos'&&sticks.length>0)h+='<div style="text-align:center;margin-top:6px"><button onclick="showStickerTab(\'salvos\')" style="background:#25d366;border:none;color:#fff;padding:5px 12px;border-radius:8px;font-size:.7rem;font-weight:700;cursor:pointer">Meus Stickers</button></div>';
    else if(tab==='salvos'&&sticks.length===0)h+='<div style="text-align:center;padding:20px;color:#bbb;font-size:.8rem">Nenhum sticker salvo ainda.</div>';
    content.innerHTML=h;
    document.querySelectorAll('.spt button').forEach(function(b){b.classList.remove('sact');if(b.textContent===tab||(tab==='salvos'&&b.textContent==='Meus'))b.classList.add('sact');});
};
window.saveStickerToKb=function(s){
    var saved;try{saved=JSON.parse(localStorage.getItem('gw_saved_stickers')||'[]');}catch(e){saved=[];}
    if(!saved.includes(s)){saved.push(s);localStorage.setItem('gw_saved_stickers',JSON.stringify(saved));}
    showStickerTab('salvos');
};

buildEmojiPicker();buildStickersPicker();

window.insertEmoji=function(e){
    var inp=document.getElementById('chatInput'),s=inp.selectionStart,end=inp.selectionEnd;
    inp.value=inp.value.substring(0,s)+e+inp.value.substring(end);
    inp.selectionStart=inp.selectionEnd=s+e.length;inp.focus();
    inp.dispatchEvent(new Event('input'));
};
window.toggleEmojiPicker=function(){
    var ep=document.getElementById('emojiPicker'),sp=document.getElementById('stickersPicker'),gp=document.getElementById('gifPopup');
    sp.classList.remove('sh');gp.classList.remove('sh');ep.classList.toggle('sh');
};
window.toggleStickersPicker=function(){
    var sp=document.getElementById('stickersPicker'),ep=document.getElementById('emojiPicker'),gp=document.getElementById('gifPopup');
    ep.classList.remove('sh');gp.classList.remove('sh');sp.classList.toggle('sh');
    if(sp.classList.contains('sh'))buildStickersPicker();
};

var gifSearchTimeout=null;
window.toggleGifPicker=function(){
    var gp=document.getElementById('gifPopup'),ep=document.getElementById('emojiPicker'),sp=document.getElementById('stickersPicker');
    ep.classList.remove('sh');sp.classList.remove('sh');gp.classList.toggle('sh');
};
document.getElementById('gifSearchInput').addEventListener('input',function(){
    clearTimeout(gifSearchTimeout);
    var q=this.value.trim();
    if(q.length<2){document.getElementById('gifGrid').innerHTML='<div class="gifload">Digite para buscar GIFs</div>';return;}
    gifSearchTimeout=setTimeout(function(){searchGifs();},500);
});
document.getElementById('gifSearchInput').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();searchGifs();}});
window.searchGifs=function(){
    var q=document.getElementById('gifSearchInput').value.trim();if(!q)return;
    document.getElementById('gifGrid').innerHTML='<div class="gifload"><i class="fas fa-circle-notch fa-spin"></i> Buscando...</div>';
    fetch('https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q='+encodeURIComponent(q)+'&limit=18&rating=g').then(function(r){return r.json();}).then(function(data){
        var grid=document.getElementById('gifGrid');grid.innerHTML='';
        if(!data.data||data.data.length===0){grid.innerHTML='<div class="gifload">Nenhum GIF encontrado</div>';return;}
        data.data.forEach(function(g){
            var img=document.createElement('img');
            img.src=g.images.fixed_height.url;
            img.alt=g.title||'GIF';
            img.loading='lazy';
            img.onclick=function(){sendGif(g.images.original.url);};
            grid.appendChild(img);
        });
    }).catch(function(){document.getElementById('gifGrid').innerHTML='<div class="gifload">Erro ao buscar GIFs</div>';});
};
window.sendGif=function(url){
    if(!myNick)return;
    closeGifPicker();
    ensureAuth().then(function(){
        return db.collection('privateMessages').add({chatId:chatId,type:'image',imageUrl:url,username:myNick,color:myColor,uid:myUid,timestamp:firebase.firestore.FieldValue.serverTimestamp()});
    }).catch(function(e){console.error(e);});
};
window.closeGifPicker=function(){document.getElementById('gifPopup').classList.remove('sh');};
window.deleteMyMessage=function(id){if(!confirm('Apagar esta mensagem?'))return;ensureAuth().then(function(){return db.collection('privateMessages').doc(id).delete();}).then(function(){}).catch(function(e){console.error(e);alert('Erro ao apagar mensagem.');});};
window.ctxDeleteMsg=function(){var ctx=document.getElementById('msgContextMenu');var id=ctx.dataset.msgId;ctx.classList.remove('sh');if(id)deleteMyMessage(id);};
window.ctxEditMsg=function(){var ctx=document.getElementById('msgContextMenu');var id=ctx.dataset.msgId;ctx.classList.remove('sh');if(!id)return;var msg=allMessages.find(function(m){return m.id===id;});if(!msg||msg.type!=='text'){alert('So e possivel editar mensagens de texto.');return;}document.getElementById('editMsgInput').value=msg.text||'';document.getElementById('editMsgModal').dataset.msgId=id;document.getElementById('editMsgModal').classList.add('sh');};
window.confirmEditMsg=function(){var modal=document.getElementById('editMsgModal');var id=modal.dataset.msgId;var text=document.getElementById('editMsgInput').value.trim();if(!text){alert('A mensagem nao pode ficar vazia.');return;}modal.classList.remove('sh');ensureAuth().then(function(){return db.collection('privateMessages').doc(id).update({text:text});}).then(function(){}).catch(function(e){console.error(e);alert('Erro ao editar mensagem.');});};
document.addEventListener('click',function(e){var ctx=document.getElementById('msgContextMenu');if(ctx&&!e.target.closest('.mctx'))ctx.classList.remove('sh');});

window.previewImg=function(e){
    var f=e.target.files[0];if(!f)return;
    if(f.size>300*1024){alert('Imagem muito grande. Maximo 300KB para envio direto.');e.target.value='';return;}
    var r=new FileReader();r.onload=function(ev){
        pendingImgData=ev.target.result;
        document.getElementById('imgPreviewThumb').src=pendingImgData;
        document.getElementById('imgPreviewBar').classList.add('sh');
    };r.readAsDataURL(f);e.target.value='';
};
window.cancelImgPreview=function(){pendingImgData=null;document.getElementById('imgPreviewBar').classList.remove('sh');};
window.sendImage=function(){
    if(!pendingImgData||!myNick)return;
    ensureAuth().then(function(){return db.collection('privateMessages').add({chatId:chatId,type:'image',imageUrl:pendingImgData,username:myNick,color:myColor,uid:myUid,timestamp:firebase.firestore.FieldValue.serverTimestamp()});}).then(function(){cancelImgPreview();}).catch(function(e){console.error(e);});
};
window.previewVideo=function(e){
    var f=e.target.files[0];if(!f)return;
    if(f.size>5*1024*1024){alert('Video muito grande. Maximo 5MB.');e.target.value='';return;}
    var r=new FileReader();r.onload=function(ev){
        pendingVideoData=ev.target.result;
        document.getElementById('videoPreviewThumb').src=pendingVideoData;
        document.getElementById('videoPreviewBar').classList.add('sh');
    };r.readAsDataURL(f);e.target.value='';
};
window.cancelVideoPreview=function(){pendingVideoData=null;document.getElementById('videoPreviewBar').classList.remove('sh');};
window.sendVideoFile=function(){
    if(!pendingVideoData||!myNick)return;
    ensureAuth().then(function(){return db.collection('privateMessages').add({chatId:chatId,type:'video',videoUrl:pendingVideoData,username:myNick,color:myColor,uid:myUid,timestamp:firebase.firestore.FieldValue.serverTimestamp()});}).then(function(){cancelVideoPreview();}).catch(function(e){console.error(e);});
};
window.sendSticker=function(s){
    if(!myNick)return;
    ensureAuth().then(function(){return db.collection('privateMessages').add({chatId:chatId,type:'sticker',sticker:s,username:myNick,color:myColor,uid:myUid,timestamp:firebase.firestore.FieldValue.serverTimestamp()});}).catch(function(e){console.error(e);});
};

window.startRecording=function(){
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){alert('Navegador nao suporta audio.');return;}
    navigator.mediaDevices.getUserMedia({audio:true}).then(function(stream){
        mediaRecorder=new MediaRecorder(stream);audioChunks=[];
        mediaRecorder.ondataavailable=function(e){if(e.data.size>0)audioChunks.push(e.data);};
        mediaRecorder.onstop=function(){stream.getTracks().forEach(function(t){t.stop();});};
        mediaRecorder.start();recSeconds=0;
        document.getElementById('recordingBar').classList.add('sh');
        document.getElementById('micBtn').classList.add('rec');
        recInterval=setInterval(function(){recSeconds++;document.getElementById('recTime').textContent=String(Math.floor(recSeconds/60)).padStart(2,'0')+':'+String(recSeconds%60).padStart(2,'0');},1000);
    }).catch(function(){alert('Permita o microfone.');});
};
window.cancelRecording=function(){
    if(mediaRecorder&&mediaRecorder.state!=='inactive')mediaRecorder.stop();
    clearInterval(recInterval);audioChunks=[];
    document.getElementById('recordingBar').classList.remove('sh');document.getElementById('micBtn').classList.remove('rec');
};
window.sendAudio=function(){
    if(mediaRecorder&&mediaRecorder.state!=='inactive')mediaRecorder.stop();
    clearInterval(recInterval);
    document.getElementById('recordingBar').classList.remove('sh');document.getElementById('micBtn').classList.remove('rec');
    setTimeout(function(){
        if(audioChunks.length===0)return;
        var blob=new Blob(audioChunks,{type:'audio/webm'});audioChunks=[];
        var r=new FileReader();r.onload=function(){
            ensureAuth().then(function(){return db.collection('privateMessages').add({chatId:chatId,type:'audio',audioData:r.result,username:myNick,color:myColor,uid:myUid,timestamp:firebase.firestore.FieldValue.serverTimestamp()});}).catch(function(e){console.error(e);});
        };r.readAsDataURL(blob);
    },300);
};
window.sendMessage=function(){
    var inp=document.getElementById('chatInput'),text=inp.value.trim();
    if(!text||!myNick)return;
    var msgData={chatId:chatId,type:'text',text:text,username:myNick,color:myColor,uid:myUid,timestamp:firebase.firestore.FieldValue.serverTimestamp()};
    if(replyToData){msgData.replyTo={id:replyToData.id,username:replyToData.username,text:replyToData.text};}
    ensureAuth().then(function(){return db.collection('privateMessages').add(msgData);}).then(function(){inp.value='';inp.style.height='auto';inp.dispatchEvent(new Event('input'));cancelReply();inp.focus();}).catch(function(e){console.error(e);});
};

var lastDateKey='';
function renderMessage(msg){
    var list=document.getElementById('messagesList'),isMine=msg.uid===myUid;
    if(msg.timestamp){
        var d3=msg.timestamp.toDate?msg.timestamp.toDate():new Date(msg.timestamp);
        var dk3=d3.getFullYear()+'-'+(d3.getMonth()+1)+'-'+d3.getDate();
        if(dk3!==lastDateKey){lastDateKey=dk3;var sep=document.createElement('div');sep.className='ms';sep.textContent=formatDateSep(msg.timestamp);list.appendChild(sep);}
    }
    var bubble=document.createElement('div');bubble.className='mb'+(isMine?' mn':'');bubble.id='msg_'+msg.id;
    if(!isMine)bubble.innerHTML=makeAvatar(msg.uid,msg.username,msg.color);
    var content=document.createElement('div');content.className='mc';
    if(msg.replyTo){var rq=document.createElement('div');rq.className='mrq';rq.innerHTML='<div class="mrqn">'+escHtml(msg.replyTo.username||'')+'</div><div class="mrqt">'+escHtml(msg.replyTo.text||'').substring(0,80)+'</div>';content.appendChild(rq);}
    if(msg.type==='image'&&msg.imageUrl){
        var safeImg=escUrl(msg.imageUrl);
        var img=document.createElement('img');img.className='mi';img.src=safeImg;
        img.onclick=function(){openFullImg(safeImg);};content.appendChild(img);
        var acts=document.createElement('div');acts.className='mact';
        var si=escHtml(safeImg);
        acts.innerHTML='<button onclick="openFullImg(\''+si+'\')"><i class="fas fa-expand"></i> Ver</button><button onclick="downloadMedia(\''+si+'\')"><i class="fas fa-download"></i> Baixar</button>';
        content.appendChild(acts);
    }else if(msg.type==='video'){
        if(msg.videoUrl&&msg.videoUrl.indexOf('data:')===0){var vd=document.createElement('video');vd.className='mi';vd.src=msg.videoUrl;vd.controls=true;vd.style.maxHeight='280px';vd.style.borderRadius='8px';vd.style.marginTop='3px';content.appendChild(vd);}
        var vacts=document.createElement('div');vacts.className='mact';
        vacts.innerHTML='<button onclick="downloadMedia(\''+escHtml(escUrl(msg.videoUrl||''))+'\')"><i class="fas fa-download"></i> Baixar</button>';
        content.appendChild(vacts);
    }else if(msg.type==='sticker'){var st=document.createElement('div');st.className='mst';st.textContent=msg.sticker;content.appendChild(st);}
    else if(msg.type==='audio'&&msg.audioData){var aw=document.createElement('div');aw.className='mau';var au=document.createElement('audio');au.controls=true;au.src=msg.audioData;aw.appendChild(au);content.appendChild(aw);}
    else if(msg.text){var tx=document.createElement('div');tx.className='mt';tx.textContent=msg.text;var tm=document.createElement('div');tm.className='mti';tm.textContent=formatTime(msg.timestamp);var tw=document.createElement('div');tw.className='mtw';tw.appendChild(tx);tw.appendChild(tm);content.appendChild(tw);}
    else{var tm=document.createElement('div');tm.className='mti';tm.textContent=formatTime(msg.timestamp);content.appendChild(tm);}
    var rab=document.createElement('div');rab.className='rab';rab.id='rab_'+msg.id;
    var ractions=msg.reactions||{};
    SEARCH_EMOJIS.forEach(function(emoji){if(ractions[emoji]&&ractions[emoji].length>0){var bt=document.createElement('button');bt.textContent=emoji;var cnt=document.createElement('span');cnt.className='rcnt';cnt.textContent=ractions[emoji].length;bt.appendChild(cnt);if(ractions[emoji].indexOf(myUid)!==-1)bt.style.background='rgba(0,168,132,.15)';bt.onclick=function(e){e.stopPropagation();toggleReaction(msg.id,emoji);};rab.appendChild(bt);}});
    var addReact=document.createElement('button');addReact.textContent='+';addReact.style.opacity='.5';addReact.style.fontSize='.7rem';addReact.onclick=function(e){e.stopPropagation();openReactionPicker(msg.id,e);};rab.appendChild(addReact);
    if(rab.childNodes.length>1)content.appendChild(rab);
    bubble.appendChild(content);
    bubble.onclick=function(e){
        if(e.target.closest('.mact')||e.target.closest('audio')||e.target.closest('video')||e.target.closest('.mu')||e.target.closest('.ma')||e.target.closest('.rab')||e.target.closest('.mrq'))return;
        if(e.target.closest('.mi')||e.target.closest('.mlk'))return;
        openReactionPicker(msg.id,e);
    };
    bubble.oncontextmenu=function(e){e.preventDefault();showMsgCtx(msg.id,e.clientX,e.clientY,isMine);};
    var longTimer,touchX=0,touchY=0;
    bubble.addEventListener('touchstart',function(e){
        touchX=e.touches[0].clientX;touchY=e.touches[0].clientY;
        longTimer=setTimeout(function(){showMsgCtx(msg.id,touchX,touchY,isMine);},600);
    },{passive:true});
    bubble.addEventListener('touchmove',function(e){touchX=e.touches[0].clientX;touchY=e.touches[0].clientY;clearTimeout(longTimer);},{passive:true});
    bubble.addEventListener('touchend',function(){clearTimeout(longTimer);});
    list.appendChild(bubble);
}
function renderAll(msgs){var l=document.getElementById('messagesList');l.innerHTML='';lastDateKey='';msgs.forEach(renderMessage);scrollBottom();}

function listenMessages(){
    unsub=db.collection('privateMessages').where('chatId','==',chatId).orderBy('timestamp','desc').limit(PAGE_SIZE).onSnapshot(function(snap){
        var msgs=[];firstDoc=snap.docs.length>0?snap.docs[snap.docs.length-1]:null;
        snap.forEach(function(doc){msgs.push(Object.assign({id:doc.id},doc.data()));});
        allMessages=msgs.reverse();
        var latestMsg=allMessages.length>0?allMessages[allMessages.length-1]:null;
        if(latestMsg&&latestMsg.id!==lastSeenMsgId&&lastSeenMsgId!==''){
            if(latestMsg.uid!==myUid&&document.hidden){
                try{
                    if('Notification' in window&&Notification.permission==='granted'){
                        new Notification(latestMsg.username||'Chat Privado',{body:latestMsg.text||'Enviou uma midia',icon:'logo.svg',tag:'gwchat_'+Date.now()});
                    }
                }catch(e){}
            }
        }
        if(latestMsg)lastSeenMsgId=latestMsg.id;
        renderAll(allMessages);
        loadingOlderCount=0;document.getElementById('loadingOlder').style.display='none';
        noMoreOlder=snap.docs.length<PAGE_SIZE;
    },function(e){console.error('Listen error:',e);});
}
var noMoreOlder=false,loadingOlderCount=0;
window.loadMoreMessages=function(){
    if(!firstDoc||noMoreOlder||loadingOlderCount>0)return;
    loadingOlderCount++;document.getElementById('loadingOlder').style.display='';
    db.collection('privateMessages').where('chatId','==',chatId).orderBy('timestamp','desc').startAfter(firstDoc).limit(PAGE_SIZE).get().then(function(snap){
        if(snap.empty){noMoreOlder=true;document.getElementById('loadingOlder').style.display='none';loadingOlderCount=0;return;}
        var c=document.getElementById('chatMessages'),prevH=c.scrollHeight;
        firstDoc=snap.docs[snap.docs.length-1];var older=[];
        snap.forEach(function(doc){older.push(Object.assign({id:doc.id},doc.data()));});
        allMessages=older.reverse().concat(allMessages);renderAll(allMessages);c.scrollTop=c.scrollHeight-prevH;
        if(snap.docs.length<PAGE_SIZE)noMoreOlder=true;
        loadingOlderCount=0;document.getElementById('loadingOlder').style.display='none';
    }).catch(function(){loadingOlderCount=0;document.getElementById('loadingOlder').style.display='none';});
};

window.openFullImg=function(src){fullImgSrc=src;document.getElementById('fullImgEl').src=src;document.getElementById('fullImgOverlay').classList.add('sh');};
window.closeFullImg=function(){document.getElementById('fullImgOverlay').classList.remove('sh');};
window.downloadFullImg=function(){if(!fullImgSrc)return;var a=document.createElement('a');a.href=fullImgSrc;a.download='gruposwhats_'+Date.now()+'.png';a.click();};
window.toggleAttach=function(){document.getElementById('attachPopup').classList.toggle('sh');};
window.closeAttach=function(){document.getElementById('attachPopup').classList.remove('sh');};
window.downloadMedia=function(src){var a=document.createElement('a');a.href=src;a.download='gruposwhats_media.png';a.click();};
var SEARCH_EMOJIS=['\u2764\uFE0F','\u{1F602}','\u{1F62D}','\u{1F44D}','\u{1F525}','\u{1F44F}','\u{1F60E}','\u{1F914}','\u{1F621}','\u{1F389}'];
var replyToData=null,typingTimeout=null,lastTypingUpdate=0;

window.saveNickname=function(){
    var nick=document.getElementById('nickInput').value.trim();
    if(!nick||nick.length<2){document.getElementById('nickInput').style.borderColor='#e74c3c';return;}
    myNick=nick;localStorage.setItem('gw_chat_nick',nick);
    document.getElementById('nickModal').classList.remove('sh');
    ensureAuth().then(function(){goOnline();listenMessages();listenTyping();requestNotificationPermission();});
};

document.getElementById('chatInput').addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}});
document.getElementById('chatInput').addEventListener('input',function(){
    this.style.height='auto';this.style.height=Math.min(this.scrollHeight,70)+'px';
    var hasText=this.value.trim().length>0;
    document.getElementById('micBtn').style.display=hasText?'none':'';
    document.getElementById('sendBtn').style.display=hasText?'':'none';
    handleTyping();
});
document.getElementById('nickInput').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();saveNickname();}});
document.getElementById('chatMessages').addEventListener('scroll',function(){
    if(this.scrollTop<80&&!noMoreOlder&&loadingOlderCount===0)loadMoreMessages();
});
document.addEventListener('click',function(e){
    if(!e.target.closest('.ep')&&!e.target.closest('.apop')&&!e.target.closest('.gifpop')){document.getElementById('emojiPicker').classList.remove('sh');}
    if(!e.target.closest('.sp')&&!e.target.closest('.apop')&&!e.target.closest('.gifpop')){document.getElementById('stickersPicker').classList.remove('sh');}
    if(!e.target.closest('.apop')&&!e.target.closest('#clipBtn'))closeAttach();
    if(!e.target.closest('.gifpop')&&!e.target.closest('.apop')&&!e.target.closest('#clipBtn')){document.getElementById('gifPopup').classList.remove('sh');}
    if(!e.target.closest('.rpk')&&!e.target.closest('.rab')&&!e.target.closest('.mb'))document.getElementById('reactionPicker').classList.remove('sh');
});

if(myNick){document.getElementById('nickModal').classList.remove('sh');ensureAuth().then(function(){goOnline();listenMessages();listenTyping();requestNotificationPermission();});}else{document.getElementById('nickModal').classList.add('sh');ensureAuth();}
db.collection('chatProfiles').doc(myUid).get().then(function(s){
    if(s.exists){var d=s.data();if(d.photo){document.getElementById('myProfileBtn').innerHTML='<img src="'+escUrl(d.photo)+'">';}}
}).catch(function(){});

window.addEventListener('beforeunload',function(){if(unsub)unsub();if(presenceUnsub)presenceUnsub();if(typingUnsub)typingUnsub();if(heartbeatInterval)clearInterval(heartbeatInterval);db.collection('chatPresence').doc(myUid).delete().catch(function(){});db.collection('chatPresence').doc(myUid).set({typing:false},{merge:true}).catch(function(){});});

function showMsgCtx(id,x,y,isMine){
    var ctx=document.getElementById('msgContextMenu');
    ctx.dataset.msgId=id;
    ctx.style.left=Math.min(x,window.innerWidth-180)+'px';
    ctx.style.top=Math.min(y,window.innerHeight-200)+'px';
    ctx.querySelectorAll('button').forEach(function(b){
        if(b.classList.contains('reply-btn')){b.style.display='';}
        else if(!isMine){b.style.display='none';}
        else{b.style.display='';}
    });
    ctx.classList.add('sh');
}

function handleTyping(){
    if(!myNick)return;
    var now=Date.now();
    if(now-lastTypingUpdate>2000){
        lastTypingUpdate=now;
        ensureAuth().then(function(){
            return db.collection('chatPresence').doc(myUid).set({typing:true,typingNick:myNick},{merge:true});
        }).catch(function(){});
    }
    clearTimeout(typingTimeout);
    typingTimeout=setTimeout(function(){
        ensureAuth().then(function(){
            return db.collection('chatPresence').doc(myUid).set({typing:false},{merge:true});
        }).catch(function(){});
    },3000);
}

function listenTyping(){
    if(typingUnsub)typingUnsub();
    typingUnsub=db.collection('chatPresence').doc(otherUid).onSnapshot(function(doc){
        var bar=document.getElementById('typingBar');
        var txt=document.getElementById('typingText');
        if(doc.exists&&doc.data().typing){
            txt.textContent=otherName+' esta digitando...';
            bar.classList.add('sh');
        }else{
            bar.classList.remove('sh');
        }
    },function(){});
}

function openReactionPicker(msgId,e){
    e.stopPropagation();
    var picker=document.getElementById('reactionPicker');
    var grid=document.getElementById('reactionGrid');
    grid.innerHTML='';
    SEARCH_EMOJIS.forEach(function(em){
        var btn=document.createElement('button');btn.className='rpki';btn.textContent=em;
        btn.onclick=function(ev){ev.stopPropagation();toggleReaction(msgId,em);picker.classList.remove('sh');};
        grid.appendChild(btn);
    });
    picker.classList.add('sh');
}

window.toggleReaction=function(msgId,emoji){
    ensureAuth().then(function(){
        return db.collection('privateMessages').doc(msgId).get();
    }).then(function(doc){
        if(!doc.exists)return;
        var data=doc.data();
        var reactions=data.reactions||{};
        var arr=reactions[emoji]||[];
        var idx=arr.indexOf(myUid);
        if(idx===-1)arr.push(myUid);else arr.splice(idx,1);
        reactions[emoji]=arr;
        return db.collection('privateMessages').doc(msgId).update({reactions:reactions});
    }).catch(function(e){console.error(e);});
};

window.cancelReply=function(){
    replyToData=null;
    document.getElementById('replyPreview').classList.remove('sh');
    document.getElementById('chatInput').focus();
};

window.ctxReplyMsg=function(){
    var ctx=document.getElementById('msgContextMenu');
    var id=ctx.dataset.msgId;
    ctx.classList.remove('sh');
    if(!id)return;
    var msg=allMessages.find(function(m){return m.id===id;});
    if(!msg)return;
    replyToData={id:msg.id,username:msg.username,text:msg.text||msg.sticker||'[midia]'};
    document.getElementById('replyName').textContent=msg.username||'';
    document.getElementById('replyText').textContent=(msg.text||msg.sticker||'[midia]').substring(0,100);
    document.getElementById('replyPreview').classList.add('sh');
    document.getElementById('chatInput').focus();
};

window.toggleSearch=function(){
    var bar=document.getElementById('searchBar');
    bar.classList.toggle('sh');
    if(bar.classList.contains('sh')){
        document.getElementById('searchInput').focus();
        document.getElementById('searchCount').textContent='';
    }else{
        document.getElementById('searchInput').value='';
        document.getElementById('searchCount').textContent='';
        renderAll(allMessages);
    }
};

document.getElementById('searchInput').addEventListener('input',function(){
    var q=this.value.trim().toLowerCase();
    if(!q){document.getElementById('searchCount').textContent='';renderAll(allMessages);return;}
    var filtered=allMessages.filter(function(m){return(m.text||'').toLowerCase().indexOf(q)!==-1||(m.username||'').toLowerCase().indexOf(q)!==-1;});
    document.getElementById('searchCount').textContent=filtered.length+' resultado'+(filtered.length!==1?'s':'');
    renderAll(filtered);
});

function requestNotificationPermission(){
    if('Notification' in window&&Notification.permission==='default'){
        try{Notification.requestPermission();}catch(e){}
    }
}
})();
