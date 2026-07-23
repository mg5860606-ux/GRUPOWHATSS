(function(){
var params=new URLSearchParams(window.location.search);
var otherUid=params.get('uid')||'';
var otherName=decodeURIComponent(params.get('name')||'Usuario');
var otherColor=decodeURIComponent(params.get('color')||'#3498db');
if(!otherUid){window.location.href='chat.html';return;}

var cfg={apiKey:"AIzaSyDgtqqGgjGgYmmNYg9cxhHIc-VIPASz3uE",authDomain:"grupos-whats-app.firebaseapp.com",projectId:"grupos-whats-app",storageBucket:"grupos-whats-app.appspot.com",messagingSenderId:"326359053624",appId:"1:326359053624:web:6a73ed5758052f2331e8be"};
if(!firebase.apps.length)firebase.initializeApp(cfg);
var db=firebase.firestore(),auth=firebase.auth(),storage=firebase.storage();
var COLORS=['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db','#9b59b6','#e84393','#00b894','#6c5ce7','#fd79a0','#00cec9','#74b9ff','#a29bfe','#ff6348'];
var PAGE_SIZE=30,firstDoc=null,allMessages=[];
var myNick=localStorage.getItem('gw_chat_nick')||'';
var myColor=localStorage.getItem('gw_chat_color')||'';
var myUid=localStorage.getItem('gw_chat_uid')||'';
var unsub=null,pendingImgData=null,pendingVideoData=null,pendingVideoFile=null;
var mediaRecorder=null,audioChunks=[],recInterval=null,recSeconds=0;
var profilesCache={},forwardData=null,fullImgSrc=null,presenceUnsub=null;
var heartbeatInterval=null,typingUnsub=null;
var chatId='';var lastSeenMsgId='';
var blockedUsers=[];try{blockedUsers=JSON.parse(localStorage.getItem('gw_blocked_users')||'[]');}catch(e){blockedUsers=[];}
var selMode=false,selMsgs={},linkPreviewCache={};

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
function scrollBottom(){var c=document.getElementById('chatMessages');if(!c)return;requestAnimationFrame(function(){c.scrollTop=c.scrollHeight;});}

function loadProfile(uid){
    if(profilesCache[uid])return Promise.resolve(profilesCache[uid]);
    return loadProfileFresh(uid);
}
function loadProfileFresh(uid){
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

// ===== UPDATE CONVERSATION METADATA (for inbox) =====
function updateConversation(lastMessage,type,otherUidForUnread){
    if(!myNick||!chatId)return Promise.resolve();
    var unread={};
    if(otherUidForUnread){
        unread[otherUidForUnread]=firebase.firestore.FieldValue.increment(1);
    }
    return db.collection('chatConversations').doc(chatId).set({
        participants:[myUid,otherUid],
        lastMessage:lastMessage||'',
        lastType:type||'text',
        lastTimestamp:firebase.firestore.FieldValue.serverTimestamp(),
        lastSender:myUid,
        lastSenderName:myNick,
        lastSenderColor:myColor,
        otherName:otherName,
        otherColor:otherColor,
        unread:unread
    },{merge:true}).catch(function(e){console.error('Conv update error:',e);});
}

var onEl=document.getElementById('otherName');onEl.textContent=otherName;onEl.style.cursor='pointer';onEl.onclick=function(){openProfile(otherUid);};
var oAv=document.getElementById('otherAvatar');
oAv.style.background=otherColor;oAv.style.cursor='pointer';oAv.onclick=function(){openProfile(otherUid);};
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
    loadProfileFresh(uid).then(function(prof){
        var isMe=uid===myUid,box=document.getElementById('profileModalBox');
        var name=(prof&&prof.name)||(isMe?myNick:(uid===otherUid?otherName:'Usuario'));
        var bio=(prof&&prof.bio)||'',photo=(prof&&prof.photo)||'',cover=(prof&&prof.cover)||'';
        var color=isMe?myColor:otherColor;
        var en=escHtml(name),eb=escHtml(bio),eu=escHtml(uid),ep=escUrl(photo),ec=escHtml(color),ecv=escUrl(cover);
        var init=getInitials(name),hasCapa=ecv||ep;
        var h='<div style="position:relative"><div style="position:relative;height:180px;overflow:hidden;background:linear-gradient(180deg,#1a252f,#2c3e50)">'+(hasCapa?'<div style="position:absolute;inset:0;background-image:url(\''+(ecv||ep)+'\');background-size:cover;background-position:center;filter:blur(20px);transform:scale(1.1);opacity:.5"></div>':'')+'<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(26,37,47,.3),rgba(44,62,80,.7))"></div><button onclick="closeProfileModal()" style="position:absolute;top:12px;right:12px;background:rgba(255,255,255,.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;font-size:1rem;cursor:pointer;z-index:10;display:flex;align-items:center;justify-content:center"><i class="fas fa-times"></i></button><div style="position:absolute;bottom:-40px;left:50%;transform:translateX(-50%);width:90px;height:90px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:900;color:#fff;overflow:hidden;border:3px solid #fff;box-shadow:0 2px 12px rgba(0,0,0,.3);background:'+ec+'">'+(photo?'<img src="'+ep+'" style="width:100%;height:100%;object-fit:cover">':init)+'</div></div><div style="padding:48px 20px 16px;text-align:center"><div style="font-size:1.2rem;font-weight:800;color:#1a252f">'+en+'</div>'+(bio?'<div style="font-size:.82rem;color:#666;margin-top:4px">'+eb+'</div>':'<div style="font-size:.82rem;color:#bbb;margin-top:4px;font-style:italic">Sem bio</div>')+'</div><div style="padding:0 20px 20px"><div style="font-size:.72rem;font-weight:800;color:#888;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Mídias</div><div id="profMediaGrid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin-bottom:16px;min-height:50px"><div style="grid-column:1/-1;text-align:center;color:#bbb;font-size:.78rem;padding:10px">Carregando...</div></div>';
        if(!isMe){
            h+='<button onclick="closeProfileModal()" style="width:100%;background:#f0f0f0;color:#555;border:none;padding:11px;border-radius:10px;font-size:.88rem;font-weight:800;cursor:pointer">Fechar</button>';
        }else{
            h+='<div style="border-top:1px solid #f0f0f0;padding-top:14px"><label style="font-size:.82rem;color:#888;cursor:pointer;display:block;text-align:center;margin-bottom:6px;padding:8px;border:2px dashed #ddd;border-radius:10px"><i class="fas fa-image"></i> Foto de capa <input type="file" accept="image/*" style="display:none" onchange="previewCoverPhoto(event)"></label><img id="profCoverPrev" src="'+ecv+'" style="display:'+(cover?'block':'none')+';width:100%;height:90px;object-fit:cover;border-radius:10px;margin-bottom:10px"><input id="profNameIn" placeholder="Seu nome" value="'+en+'" maxlength="20" style="width:100%;padding:10px 14px;border:2px solid #ddd;border-radius:10px;font-size:.9rem;outline:none;margin-bottom:8px;font-family:inherit"><textarea id="profBioIn" placeholder="Sua bio..." maxlength="150" style="width:100%;padding:10px 14px;border:2px solid #ddd;border-radius:10px;font-size:.85rem;outline:none;margin-bottom:8px;font-family:inherit;resize:none;height:60px">'+eb+'</textarea><label style="font-size:.78rem;color:#888;cursor:pointer;display:block;text-align:center;margin:6px 0"><i class="fas fa-camera"></i> Trocar foto de perfil <input type="file" accept="image/*" style="display:none" onchange="previewProfilePhoto(event)"></label><img id="profPhotoPrev" src="'+ep+'" style="display:none;width:50px;height:50px;object-fit:cover;border-radius:50%;margin:0 auto 8px"><button onclick="saveMyProfile()" style="width:100%;background:#25d366;color:#fff;border:none;padding:11px;border-radius:10px;font-size:.88rem;font-weight:700;cursor:pointer">Salvar</button></div>';
        }else{
            h+='<button onclick="closeProfileModal()" style="width:100%;background:#f0f0f0;color:#555;border:none;padding:11px;border-radius:10px;font-size:.88rem;font-weight:800;cursor:pointer">Fechar</button>';
        }
        h+='</div></div>';box.innerHTML=h;
        document.getElementById('profileModal').classList.add('sh');
        // Load media
        db.collection('privateMessages').where('uid','==',uid).where('chatId','==',chatId).where('type','==','image').orderBy('timestamp','desc').limit(6).get().then(function(snap){
            var grid=document.getElementById('profMediaGrid');if(!grid)return;
            grid.innerHTML='';
            if(snap.empty){grid.innerHTML='<div style="grid-column:1/-1;text-align:center;color:#bbb;font-size:.78rem;padding:10px">Nenhuma midia compartilhada</div>';return;}
            snap.forEach(function(doc){var d=doc.data();if(d.imageUrl){var di=document.createElement('img');di.src=escUrl(d.imageUrl);di.style='width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;cursor:pointer';di.onclick=function(){openFullImg(d.imageUrl);};grid.appendChild(di);}});
        }).catch(function(){var grid=document.getElementById('profMediaGrid');if(grid)grid.innerHTML='<div style="grid-column:1/-1;text-align:center;color:#bbb;font-size:.78rem;padding:10px">Nenhuma midia encontrada</div>';});
    });
};
window.openMyProfile=function(){openProfile(myUid);};
window.closeProfileModal=function(){document.getElementById('profileModal').classList.remove('sh');};
var _profilePhotoData='',_coverPhotoData='';
window.previewCoverPhoto=function(e){
    var f=e.target.files[0];if(!f)return;
    if(f.size>20*1024*1024){alert('Imagem muito grande. Maximo 20MB.');return;}
    var r=new FileReader();r.onload=function(ev){
        openCropModal(ev.target.result, 2, function(cropped){
            _coverPhotoData = cropped;
            document.getElementById('profCoverPrev').src = cropped;
            document.getElementById('profCoverPrev').style.display = 'block';
        },'top');
    };r.readAsDataURL(f);
};
window.previewProfilePhoto=function(e){
    var f=e.target.files[0];if(!f)return;
    if(f.size>20*1024*1024){alert('Imagem muito grande. Maximo 20MB.');return;}
    var r=new FileReader();r.onload=function(ev){
        openCropModal(ev.target.result, 1, function(cropped){
            _profilePhotoData = cropped;
            document.getElementById('profPhotoPrev').src = cropped;
            document.getElementById('profPhotoPrev').style.display = 'block';
        },'center');
    };r.readAsDataURL(f);
};
window.saveMyProfile=function(){
    var name=document.getElementById('profNameIn').value.trim(),bio=document.getElementById('profBioIn').value.trim();
    if(!name||name.length<2){document.getElementById('profNameIn').style.borderColor='#e74c3c';return;}
    var data={name:name,bio:bio};
    if(_coverPhotoData){data.cover=_coverPhotoData;}
    if(_profilePhotoData){data.photo=_profilePhotoData;}
    var saveBtn=document.querySelector('.psb');
    if(saveBtn){saveBtn.textContent='Salvando...';saveBtn.disabled=true;}
    ensureAuth().then(function(){return db.collection('chatProfiles').doc(myUid).set(data,{merge:true});}).then(function(){
        myNick=name;localStorage.setItem('gw_chat_nick',name);
        var cached=profilesCache[myUid]||{};cached.name=name;cached.bio=bio;
        if(_profilePhotoData)cached.photo=_profilePhotoData;
        profilesCache[myUid]=cached;
        _profilePhotoData='';
        closeProfileModal();
    }).catch(function(e){console.error(e);if(saveBtn){saveBtn.textContent='Salvar';saveBtn.disabled=false;}
        if(e.message&&e.message.indexOf('too large')!==-1){alert('Foto muito grande. Tente uma imagem menor.');}
        else{alert('Erro ao salvar perfil. Tente novamente.');}
    });
};

// ===== CROP MODAL =====
var cropState={imgData:null,x:0,y:0,scale:1,frameW:0,frameH:0,callback:null,dragging:false,startX:0,startY:0,startImgX:0,startImgY:0,baseScale:1,baseW:0,baseH:0,zoom:1,minZoom:1,maxZoom:5,lastPinchDist:0};

window.openCropModal=function(imgData,aspectRatio,callback,position,maxW,maxH){
    cropState.imgData=imgData;cropState.callback=callback;
    var img=new Image();img.onload=function(){
        var frame=document.getElementById('cropFrame');
        var maxFw=Math.min(window.innerWidth||document.documentElement.clientWidth,500)-20;
        var fw=Math.max(maxFw,200);var fh=fw/aspectRatio;
        frame.style.aspectRatio=aspectRatio;
        var iw=img.naturalWidth,ih=img.naturalHeight;
        var scale;if(iw/ih>aspectRatio){scale=fh/ih;}else{scale=fw/iw;}
        var dw=iw*scale,dh=ih*scale;
        var ix=(fw-dw)/2,iy=position==='top'?0:(fh-dh)/2;
        cropState.scale=scale;cropState.baseScale=scale;cropState.baseW=dw;cropState.baseH=dh;
        cropState.zoom=1;cropState.x=ix;cropState.y=iy;cropState.frameW=fw;cropState.frameH=fh;
        var imgEl=document.getElementById('cropImage');
        imgEl.src=imgData;imgEl.style.width=dw+'px';imgEl.style.height=dh+'px';
        imgEl.style.left=ix+'px';imgEl.style.top=iy+'px';
        cropState.maxW=maxW||800;cropState.maxH=maxH||400;
        document.getElementById('cropZoomLevel').textContent='100%';
        document.getElementById('cropModal').classList.add('sh');
    };img.src=imgData;
};

function initCropDrag(e){
    if(e.touches&&e.touches.length!==1)return;
    var t=e.touches?e.touches[0]:e;
    cropState.dragging=true;cropState.startX=t.clientX;cropState.startY=t.clientY;
    cropState.startImgX=cropState.x;cropState.startImgY=cropState.y;e.preventDefault();
}
function moveCropDrag(e){
    if(!cropState.dragging)return;
    var t=e.touches?e.touches[0]:e;
    var dx=t.clientX-cropState.startX,dy=t.clientY-cropState.startY;
    var imgEl=document.getElementById('cropImage');
    cropState.x=cropState.startImgX+dx;cropState.y=cropState.startImgY+dy;
    var dw=parseFloat(imgEl.style.width),dh=parseFloat(imgEl.style.height);
    cropState.x=Math.min(0,Math.max(cropState.frameW-dw,cropState.x));
    cropState.y=Math.min(0,Math.max(cropState.frameH-dh,cropState.y));
    imgEl.style.left=cropState.x+'px';imgEl.style.top=cropState.y+'px';e.preventDefault();
}
function endCropDrag(e){cropState.dragging=false;}

function applyCropZoom(){
    var imgEl=document.getElementById('cropImage');
    var newS=cropState.baseScale*cropState.zoom;
    var newW=cropState.baseW*cropState.zoom;
    var newH=cropState.baseH*cropState.zoom;
    var cx=cropState.x+parseFloat(imgEl.style.width)/2;
    var cy=cropState.y+parseFloat(imgEl.style.height)/2;
    cropState.x=cx-newW/2;cropState.y=cy-newH/2;
    cropState.x=Math.min(0,Math.max(cropState.frameW-newW,cropState.x));
    cropState.y=Math.min(0,Math.max(cropState.frameH-newH,cropState.y));
    cropState.scale=newS;
    imgEl.style.width=newW+'px';imgEl.style.height=newH+'px';
    imgEl.style.left=cropState.x+'px';imgEl.style.top=cropState.y+'px';
    document.getElementById('cropZoomLevel').textContent=Math.round(cropState.zoom*100)+'%';
}
window.cropZoomIn=function(){if(cropState.zoom>=cropState.maxZoom)return;cropState.zoom=Math.min(cropState.zoom+.25,cropState.maxZoom);applyCropZoom();};
window.cropZoomOut=function(){if(cropState.zoom<=cropState.minZoom)return;cropState.zoom=Math.max(cropState.zoom-.25,cropState.minZoom);applyCropZoom();};

window.confirmCrop=function(){
    if(!cropState.imgData)return;
    var canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    var cropX=Math.round(-cropState.x/cropState.scale);
    var cropY=Math.round(-cropState.y/cropState.scale);
    var cropW=Math.round(cropState.frameW/cropState.scale);
    var cropH=Math.round(cropState.frameH/cropState.scale);
    var maxCw=cropState.maxW||800,maxCh=cropState.maxH||400,cw,ch;
    if(cropW>maxCw||cropH>maxCh){var r=Math.min(maxCw/cropW,maxCh/cropH);cw=Math.round(cropW*r);ch=Math.round(cropH*r);}else{cw=cropW;ch=cropH;}
    canvas.width=cw;canvas.height=ch;
    var img=new Image();img.onload=function(){
        ctx.drawImage(img,cropX,cropY,cropW,cropH,0,0,cw,ch);
        var result=canvas.toDataURL('image/jpeg',0.85);
        if(cropState.callback)cropState.callback(result);
        cancelCrop();
    };img.src=cropState.imgData;
};
window.cancelCrop=function(){document.getElementById('cropModal').classList.remove('sh');cropState.imgData=null;cropState.callback=null;};

(function(){
    var frame=document.getElementById('cropFrame');
    if(!frame)return;
    frame.addEventListener('mousedown',initCropDrag);
    frame.addEventListener('touchstart',function(e){
        if(e.touches.length===2){cropState.lastPinchDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);}
        else if(e.touches.length===1){initCropDrag(e);}
    },{passive:false});
    frame.addEventListener('wheel',function(e){e.preventDefault();if(e.deltaY<0)cropZoomIn();else cropZoomOut();},{passive:false});
    document.addEventListener('mousemove',moveCropDrag);
    document.addEventListener('touchmove',function(e){
        if(e.touches.length===2){e.preventDefault();var dist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);var diff=dist-cropState.lastPinchDist;if(Math.abs(diff)>15){if(diff>0)cropZoomIn();else cropZoomOut();cropState.lastPinchDist=dist;}}
        else if(e.touches.length===1&&cropState.dragging){moveCropDrag(e);}
    },{passive:false});
    document.addEventListener('mouseup',endCropDrag);
    document.addEventListener('touchend',function(e){cropState.dragging=false;});
})();

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
    'Objetos':['\u{1F4F1}','\u{1F4BB}','\u{1F4F7}','\u{1F4F9}','\u{1F4FA}','\u{1F4A1}','\u{1F4B0}','\u{1F4E6}','\u{1F4DD}','\u{1F511}','\u{1F50D}','\u{1F512}','\u{1F514}','\u{1F4E3}','\u{1F4E2}','\u{1F4BD}','\u{1F4BE}','\u{1F4BF}','\u{1F4C0}','\u{1F50B}','\u{1F50C}','\u{1F381}','\u{1F389}','\u{1F38A}','\u{1F388}','\u{1F386}','\u{1F387}','\u{1F380}','\u{1F48E}','\u{1F48D}','\u{1F525}','\u{2728}','\u{2B50}','\u{1F4AF}','\u{1F319}','\u{1F5A4}','\u{26BD}','\u{26BE}','\u{1F3B5}','\u{1F3BC}','\u{1F3B6}'],
    'Animados':[]
};

window._trackRecentSticker=function(s){
    var rec;try{rec=JSON.parse(localStorage.getItem('gw_recent_stickers')||'[]');}catch(e){rec=[];}
    rec=rec.filter(function(x){return x!==s;});
    rec.unshift(s);
    if(rec.length>30)rec=rec.slice(0,30);
    localStorage.setItem('gw_recent_stickers',JSON.stringify(rec));
};
function buildStickersPicker(){
    var el=document.getElementById('stickersPicker');
    var saved;try{saved=JSON.parse(localStorage.getItem('gw_saved_stickers')||'[]');}catch(e){saved=[];}
    var custom;try{custom=JSON.parse(localStorage.getItem('gw_custom_stickers')||'[]');}catch(e){custom=[];}
    var rec;try{rec=JSON.parse(localStorage.getItem('gw_recent_stickers')||'[]');}catch(e){rec=[];}
    STICKER_TABS['Recentes']=rec;
    var tabHtml='<div class="sb"><i class="fas fa-search"></i><input type="text" id="stickerSearch" placeholder="Buscar sticker..." oninput="searchStickers(this.value)"></div><div class="spt">';
    var tabs=Object.keys(STICKER_TABS);
    if(custom.length>0||saved.length>0)tabHtml+='<button class="sact" onclick="showStickerTab(\'salvos\')">&#x2764; Meus</button>';
    if(custom.length>0)tabHtml+='<button onclick="showStickerTab(\'meus-stickers\')"><i class="fas fa-user"></i></button>';
    tabs.forEach(function(t,i){tabHtml+='<button'+(i===0&&saved.length===0&&custom.length===0?' class="sact"':'')+' onclick="showStickerTab(\''+t+'\')">'+t+'</button>';});
    tabHtml+='</div><div class="spc"><div id="stickerTabContent"></div></div>';
    el.innerHTML=tabHtml;
    if(custom.length>0)showStickerTab('meus-stickers');else if(saved.length>0)showStickerTab('salvos');else showStickerTab(tabs[0]);
}
window.searchStickers=function(q){
    var content=document.getElementById('stickerTabContent');
    if(!q||q.length<2){document.querySelectorAll('.spt button').forEach(function(b){b.style.display='';});showStickerTab(document.querySelector('.spt button.sact')?document.querySelector('.spt button.sact').textContent.replace('\u2764 ','').trim():'');return;}
    var ql=q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    var allSticks=[];
    Object.keys(STICKER_TABS).forEach(function(t){STICKER_TABS[t].forEach(function(s){allSticks.push({s:s,cat:t});});});
    var custom;try{custom=JSON.parse(localStorage.getItem('gw_custom_stickers')||'[]');}catch(e){custom=[];}
    custom.forEach(function(c){allSticks.push({s:c.data,cat:'custom'});});
    var results=allSticks.filter(function(item){
        if(item.s.indexOf('data:')===0||item.s.indexOf('http')===0)return false;
        var name=(EMOJI_NAMES[item.s]||item.cat||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
        var cat=item.cat.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
        return name.indexOf(ql)!==-1||cat.indexOf(ql)!==-1;
    });
    document.querySelectorAll('.spt button').forEach(function(b){b.style.display=results.length>0?'none':'';});
    var h='<div class="sg">';
    if(results.length===0){
        h+='<div class="semp"><i class="fas fa-search"></i>Nenhum sticker encontrado para "'+escHtml(q)+'".</div>';
    }else{
        results.forEach(function(item){
            if(item.s.indexOf('data:')===0||item.s.indexOf('http')===0){
                h+='<div class="si" onclick="sendSticker(\''+item.s+'\')"><img src="'+escUrl(item.s)+'"></div>';
            }else{
                h+='<div class="si" onclick="sendSticker(\''+item.s+'\')" title="'+escHtml(EMOJI_NAMES[item.s]||item.cat)+'">'+item.s+'</div>';
            }
        });
    }
    h+='</div>';
    content.innerHTML=h;
};
window.showStickerTab=function(tab){
    var content=document.getElementById('stickerTabContent');
    if(tab==='Animados'){
        content.innerHTML='<div class="sg"><div class="semp"><i class="fas fa-circle-notch fa-spin"></i>Carregando stickers animados...</div></div>';
        document.querySelectorAll('.spt button').forEach(function(b){b.classList.remove('sact');if(b.textContent===tab)b.classList.add('sact');});
        fetch('https://api.giphy.com/v1/stickers/trending?api_key=dc6zaTOxFJmzC&limit=24&rating=g').then(function(r){return r.json();}).then(function(data){
            if(!data.data||data.data.length===0){content.innerHTML='<div class="sg"><div class="semp"><i class="fas fa-search"></i>Nenhum sticker animado encontrado.</div></div>';return;}
            var h='<div class="sg">';
            data.data.forEach(function(g){h+='<div class="si" onclick="sendGif(\''+g.images.fixed_height.url+'\')"><img src="'+g.images.fixed_height_small.url+'" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:6px"></div>';});
            h+='</div>';
            content.innerHTML=h;
        }).catch(function(){content.innerHTML='<div class="sg"><div class="semp"><i class="fas fa-exclamation-triangle"></i>Erro ao carregar stickers animados.</div></div>';});
        return;
    }
    if(tab==='meus-stickers'){
        var custom;try{custom=JSON.parse(localStorage.getItem('gw_custom_stickers')||'[]');}catch(e){custom=[];}
        var h='<div class="sg">';
        if(custom.length===0){
            h+='<div class="semp"><i class="fas fa-upload"></i>Nenhum sticker personalizado.<br><button onclick="uploadCustomSticker()">Adicionar sticker</button></div>';
        }else{
            custom.forEach(function(st,idx){
                h+='<div class="si" onclick="sendSticker(\''+st.data+'\')" title="Enviar"><img src="'+escUrl(st.data)+'">';
                h+='<button class="ssr" onclick="event.stopPropagation();removeCustomSticker('+idx+')" title="Remover"><i class="fas fa-times"></i></button>';
                h+='</div>';
            });
            h+='<div class="semp"><button onclick="uploadCustomSticker()"><i class="fas fa-plus"></i> Adicionar</button></div>';
        }
        h+='</div>';
        content.innerHTML=h;
        document.querySelectorAll('.spt button').forEach(function(b){b.classList.remove('sact');if(b.innerHTML.indexOf('fa-user')!==-1)b.classList.add('sact');});
        return;
    }
    var sticks;try{sticks=tab==='salvos'?JSON.parse(localStorage.getItem('gw_saved_stickers')||'[]'):(STICKER_TABS[tab]||[]);}catch(e){sticks=tab==='salvos'?[]:(STICKER_TABS[tab]||[]);}
    var h='<div class="sg">';
    if(sticks.length===0){
        if(tab==='salvos')h+='<div class="semp"><i class="fas fa-heart"></i>Nenhum sticker salvo ainda.<br><button onclick="showStickerTab(\''+Object.keys(STICKER_TABS).filter(function(t){return t!=='Recentes';})[0]+'\')">Explorar stickers</button></div>';
        else if(tab==='Recentes')h+='<div class="semp"><i class="fas fa-history"></i>Nenhum sticker usado ainda.<br>Toque em um sticker para ele aparecer aqui.</div>';
        else h+='<div class="semp"><i class="fas fa-search"></i>Nenhum sticker nesta categoria.</div>';
    }else{
        sticks.forEach(function(s){
            if(s.indexOf('data:')===0||s.indexOf('http')===0){
                h+='<div class="si" onclick="sendSticker(\''+s+'\')" title="Enviar"><img src="'+escUrl(s)+'"></div>';
            }else{
                h+='<div class="si" onclick="sendSticker(\''+s+'\')" title="Enviar">'+s;
            }
            if(tab!=='salvos')h+='<button class="ssv" onclick="event.stopPropagation();saveStickerToKb(\''+s+'\')" title="Salvar sticker"><i class="fas fa-plus"></i></button>';
            else h+='<button class="ssr" onclick="event.stopPropagation();removeSavedSticker(\''+s+'\')" title="Remover dos salvos"><i class="fas fa-times"></i></button>';
            h+='</div>';
        });
    }
    h+='</div>';
    content.innerHTML=h;
    document.querySelectorAll('.spt button').forEach(function(b){b.classList.remove('sact');if(b.textContent.replace('\u2764 ','')===tab||b.innerHTML.indexOf(tab)!==-1||(tab==='salvos'&&b.innerHTML.indexOf('fa-heart')!==-1))b.classList.add('sact');});
};
window.saveStickerToKb=function(s){
    var saved;try{saved=JSON.parse(localStorage.getItem('gw_saved_stickers')||'[]');}catch(e){saved=[];}
    if(!saved.includes(s)){saved.push(s);localStorage.setItem('gw_saved_stickers',JSON.stringify(saved));}
    showStickerTab('salvos');
};
window.removeSavedSticker=function(s){
    var saved;try{saved=JSON.parse(localStorage.getItem('gw_saved_stickers')||'[]');}catch(e){saved=[];}
    saved=saved.filter(function(x){return x!==s;});
    localStorage.setItem('gw_saved_stickers',JSON.stringify(saved));
    showStickerTab('salvos');
};
window.uploadCustomSticker=function(){
    var inp=document.createElement('input');inp.type='file';inp.accept='image/png,image/webp,image/gif,image/jpeg';
    inp.onchange=function(e){
        var f=e.target.files[0];if(!f)return;
        if(f.size>5*1024*1024){alert('Imagem muito grande. Maximo 5MB.');return;}
        var r=new FileReader();r.onload=function(ev){
            var img=new Image();img.onload=function(){
                var max=512,w=img.width,h=img.height,ratio=Math.min(max/w,max/h,1);
                w=Math.round(w*ratio);h=Math.round(h*ratio);
                var c=document.createElement('canvas');c.width=w;c.height=h;
                var ctx=c.getContext('2d');ctx.drawImage(img,0,0,w,h);
                var data=c.toDataURL('image/webp',0.85);
                if(data.length>500*1024){data=c.toDataURL('image/png',0.8);}
                var custom;try{custom=JSON.parse(localStorage.getItem('gw_custom_stickers')||'[]');}catch(e){custom=[];}
                if(custom.length>=20){alert('Maximo de 20 stickers personalizados. Remova alguns para adicionar novos.');return;}
                custom.push({data:data,added:Date.now()});
                localStorage.setItem('gw_custom_stickers',JSON.stringify(custom));
                buildStickersPicker();showStickerTab('meus-stickers');
            };img.src=ev.target.result;
        };r.readAsDataURL(f);
    };inp.click();
};
window.removeCustomSticker=function(idx){
    var custom;try{custom=JSON.parse(localStorage.getItem('gw_custom_stickers')||'[]');}catch(e){custom=[];}
    if(!confirm('Remover este sticker personalizado?'))return;
    custom.splice(idx,1);
    localStorage.setItem('gw_custom_stickers',JSON.stringify(custom));
    showStickerTab('meus-stickers');
};
var EMOJI_NAMES={'\u{1F600}':'rosto sorrindo','\u{1F603}':'sorrindo boca aberta','\u{1F604}':'sorrindo olhos sorrindo','\u{1F601}':'sorrindo olhos apertados','\u{1F602}':'chorando rindo','\u{1F609}':'piscando','\u{1F60A}':'sorrindo olhos fechados','\u{1F60D}':'cora\u00E7\u00E3o olhos','\u{1F618}':'beijo','\u{1F60E}':'\u00F3culos escuros legal','\u{1F970}':'cara carinhosa','\u{1F607}':'santo inocente','\u{1F608}':'diabo sorrindo','\u{1F61C}':'sarc\u00E1stico','\u{1F60F}':'sorriso ir\u00F4nico','\u{2764}':'cora\u00E7\u00E3o','\u{1F499}':'cora\u00E7\u00E3o azul','\u{1F49A}':'cora\u00E7\u00E3o verde','\u{1F49B}':'cora\u00E7\u00E3o amarelo','\u{1F49C}':'cora\u00E7\u00E3o roxo','\u{1F5A4}':'cora\u00E7\u00E3o preto','\u{1F494}':'cora\u00E7\u00E3o partido','\u{1F495}':'dois cora\u00E7\u00F5es','\u{1F436}':'cachorro','\u{1F431}':'gato','\u{1F43B}':'urso','\u{1F981}':'le\u00E3o','\u{1F43A}':'lobo','\u{1F434}':'cavalo','\u{1F40D}':'cobra','\u{1F985}':'\u00E1guia','\u{1F426}':'p\u00E1ssaro','\u{1F414}':'galinha','\u{1F427}':'pinguim','\u{1F435}':'macaco','\u{1F648}':'macaco nao ve','\u{1F437}':'porco','\u{1F43C}':'cachorro','\u{1F33A}':'flor','\u{1F338}':'flor rosa','\u{1F339}':'rosa','\u{1F33B}':'girassol','\u{2615}':'caf\u00E9','\u{1F37A}':'cerveja','\u{1F37B}':'cervejas','\u{1F378}':'drink','\u{1F354}':'hamburguer','\u{1F355}':'pizza','\u{1F370}':'bolo','\u{1F36B}':'chocolate','\u{1F382}':'bolo aniversario','\u{1F34E}':'ma\u00E7\u00E3','\u{1F34A}':'laranja','\u{1F34C}':'banana','\u{1F349}':'uva','\u{1F353}':'morango','\u{1F31F}':'estrela brilhante','\u{2B50}':'estrela','\u{2728}':'brilho','\u{1F308}':'arco iris','\u{2600}':'sol','\u{1F319}':'lua','\u{2601}':'nuvem','\u{2744}':'floco neve','\u{26C5}':'sol nuvem','\u{1F525}':'fogo','\u{1F4A1}':'lampada','\u{1F4F1}':'celular','\u{1F4BB}':'computador','\u{1F4F7}':'camera','\u{1F4B0}':'dinheiro','\u{1F511}':'chave','\u{1F512}':'cadeado','\u{1F389}':'festa','\u{1F388}':'balao','\u{1F381}':'presente','\u{1F3B5}':'nota musical','\u{1F3B6}':'musica','\u{1F3C6}':'trofeu','\u{26BD}':'futebol','\u{1F3C0}':'basquete','\u{1F680}':'foguete','\u{2708}':'aviao','\u{1F697}':'carro','\u{1F6B2}':'bicicleta','\u{1F3E0}':'casa','\u{1F3EB}':'escola','\u{26EA}':'igreja','\u{1F4DD}':'documento','\u{1F4AC}':'fala','\u{1F44D}':'joinha positivo','\u{1F44E}':'joinha negativo','\u{1F44F}':'palmas','\u{270A}':'mao levantada','\u{1F44B}':'tchau','\u{1F44C}':'ok','\u{1F918}':'rock','\u{1F44A}':'punho','\u{1F91E}':'corno','\u{1F4AA}':'musculo','\u{1F64F}':'rezando','\u{1F48B}':'beijo labios','\u{1F440}':'olhos','\u{1F444}':'boca','\u{1F4A9}':'cocozinho','\u{1F62D}':'chorando','\u{1F622}':'chorando alto','\u{1F62B}':'cansado','\u{1F631}':'gritando medo','\u{1F621}':'nervoso','\u{1F620}':'bravo','\u{1F624}':'nervoso','\u{1F92A}':'nojo','\u{1F928}':'pensativo','\u{1F914}':'pensando','\u{1F610}':'neutro','\u{1F611}':'sem expressao','\u{1F636}':'sem boca','\u{1F644}':'rolar olhos','\u{1F92C}':'careta','\u{1F975}':'febre','\u{1F976}':'frio','\u{1F929}':'feliz','\u{1F973}':'festejando','\u{1F60C}':'aliviado','\u{1F634}':'dormindo','\u{1F60B}':'salivando','\u{1F61E}':'decepcionado','\u{1F61F}':'preocupado','\u{1F632}':'pasmo','\u{1F628}':'assustado'};

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
    }).then(function(){updateConversation('','image',otherUid);}).catch(function(e){console.error(e);});
};
window.closeGifPicker=function(){document.getElementById('gifPopup').classList.remove('sh');};
window.deleteMyMessage=function(id){if(!confirm('Apagar esta mensagem?'))return;ensureAuth().then(function(){return db.collection('privateMessages').doc(id).delete();}).then(function(){}).catch(function(e){console.error(e);alert('Erro ao apagar mensagem.');});};
window.ctxDeleteMsg=function(){var ctx=document.getElementById('msgContextMenu');var id=ctx.dataset.msgId;ctx.classList.remove('sh');if(id)deleteMyMessage(id);};
window.ctxEditMsg=function(){var ctx=document.getElementById('msgContextMenu');var id=ctx.dataset.msgId;ctx.classList.remove('sh');if(!id)return;var msg=allMessages.find(function(m){return m.id===id;});if(!msg||msg.type!=='text'){alert('So e possivel editar mensagens de texto.');return;}document.getElementById('editMsgInput').value=msg.text||'';document.getElementById('editMsgModal').dataset.msgId=id;document.getElementById('editMsgModal').classList.add('sh');};
window.confirmEditMsg=function(){var modal=document.getElementById('editMsgModal');var id=modal.dataset.msgId;var text=document.getElementById('editMsgInput').value.trim();if(!text){alert('A mensagem nao pode ficar vazia.');return;}modal.classList.remove('sh');ensureAuth().then(function(){return db.collection('privateMessages').doc(id).update({text:text});}).then(function(){}).catch(function(e){console.error(e);alert('Erro ao editar mensagem.');});};
document.addEventListener('click',function(e){var ctx=document.getElementById('msgContextMenu');if(ctx&&!e.target.closest('.mctx'))ctx.classList.remove('sh');});

window.previewImg=function(e){
    var f=e.target.files[0];if(!f)return;
    if(f.size>20*1024*1024){alert('Imagem muito grande. Maximo 20MB.');e.target.value='';return;}
    var r=new FileReader();r.onload=function(ev){
        var dataUrl=ev.target.result;
        var img=new Image();img.onload=function(){
            var aspect=img.naturalWidth/img.naturalHeight;
            openCropModal(dataUrl, aspect, function(cropped){
                pendingImgData=cropped;
                document.getElementById('imgPreviewThumb').src=cropped;
                document.getElementById('imgPreviewBar').classList.add('sh');
            },'center',1200,1200);
        };img.onerror=function(){alert('Erro ao processar a imagem.');e.target.value='';};
        img.src=dataUrl;
    };r.readAsDataURL(f);e.target.value='';
};
window.cancelImgPreview=function(){pendingImgData=null;document.getElementById('imgPreviewBar').classList.remove('sh');};
window.sendImage=function(){
    if(!pendingImgData||!myNick)return;
    var data={chatId:chatId,type:'image',imageUrl:pendingImgData,username:myNick,color:myColor,uid:myUid,timestamp:firebase.firestore.FieldValue.serverTimestamp(),status:'sent',viewOnce:_viewOnceMode.img||false};
    ensureAuth().then(function(){return db.collection('privateMessages').add(data);}).then(function(){cancelImgPreview();_viewOnceMode.img=false;var btn=document.getElementById('imgVoBtn');if(btn)btn.classList.remove('active');updateConversation('','image',otherUid);}).catch(function(e){console.error(e);});
};
function uploadToStorage(file,path){
    return new Promise(function(resolve,reject){
        var ref=storage.ref(path);
        var task=ref.put(file);
        task.on('state_changed',null,function(e){reject(e);},function(){task.snapshot.ref.getDownloadURL().then(resolve).catch(reject);});
    });
}
window.previewVideo=function(e){
    var f=e.target.files[0];if(!f)return;
    if(f.size>30*1024*1024){alert('Video muito grande. Maximo 30MB.');e.target.value='';return;}
    pendingVideoFile=f;
    var r=new FileReader();r.onload=function(ev){
        pendingVideoData=ev.target.result;
        document.getElementById('videoPreviewThumb').src=pendingVideoData;
        document.getElementById('videoPreviewBar').classList.add('sh');
    };r.readAsDataURL(f);e.target.value='';
};
window.cancelVideoPreview=function(){pendingVideoData=null;pendingVideoFile=null;document.getElementById('videoPreviewBar').classList.remove('sh');var btn=document.querySelector('#videoPreviewBar .sip');if(btn){btn.textContent='Enviar';btn.disabled=false;}};
window.sendVideoFile=function(){
    if(!pendingVideoFile||!myNick)return;
    var btn=document.querySelector('#videoPreviewBar .sip');if(btn){btn.textContent='Enviando...';btn.disabled=true;}
    ensureAuth().then(function(){
        var path='private/'+chatId+'/videos/'+myUid+'_'+Date.now()+'.mp4';
        return uploadToStorage(pendingVideoFile,path);
    }).then(function(url){
        return db.collection('privateMessages').add({chatId:chatId,type:'video',videoUrl:url,username:myNick,color:myColor,uid:myUid,timestamp:firebase.firestore.FieldValue.serverTimestamp(),viewOnce:_viewOnceMode.video||false});
    }).then(function(){cancelVideoPreview();_viewOnceMode.video=false;var btn2=document.getElementById('videoVoBtn');if(btn2)btn2.classList.remove('active');updateConversation('','video',otherUid);}).catch(function(e){console.error(e);if(btn){btn.textContent='Enviar';btn.disabled=false;}alert('Erro ao enviar video.');});
};
window.sendSticker=function(s){
    if(!myNick)return;
    _trackRecentSticker(s);
    ensureAuth().then(function(){return db.collection('privateMessages').add({chatId:chatId,type:'sticker',sticker:s,username:myNick,color:myColor,uid:myUid,timestamp:firebase.firestore.FieldValue.serverTimestamp(),status:'sent'});}).then(function(){updateConversation('','sticker',otherUid);}).catch(function(e){console.error(e);});
};

window.openForward=function(url,type){forwardData={url:url,type:type};document.getElementById('forwardModal').classList.add('sh');};
window.closeForwardModal=function(){forwardData=null;document.getElementById('forwardModal').classList.remove('sh');};
window.forwardToChat=function(){
    if(!forwardData||!myNick)return;
    var data={chatId:chatId,username:myNick,color:myColor,uid:myUid,timestamp:firebase.firestore.FieldValue.serverTimestamp()};
    if(forwardData.type==='image'){data.type='image';data.imageUrl=forwardData.url;}
    else if(forwardData.type==='video'){data.type='video';data.videoUrl=forwardData.url;}
    else if(forwardData.type==='sticker'){data.type='sticker';data.sticker=forwardData.url;}
    else if(forwardData.type==='text'){data.text=forwardData.url;}
    ensureAuth().then(function(){return db.collection('privateMessages').add(data);}).then(function(){closeForwardModal();updateConversation(data.text||'','forward',otherUid);}).catch(function(e){console.error(e);alert('Erro ao reenviar.');});
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
            ensureAuth().then(function(){return db.collection('privateMessages').add({chatId:chatId,type:'audio',audioData:r.result,username:myNick,color:myColor,uid:myUid,timestamp:firebase.firestore.FieldValue.serverTimestamp()});}).then(function(){updateConversation('','audio',otherUid);}).catch(function(e){console.error(e);});
        };r.readAsDataURL(blob);
    },300);
};
window.sendDocument=function(e){
    var f=e.target.files[0];if(!f||!myNick)return;
    if(f.size>20*1024*1024){alert('Documento muito grande. Maximo 20MB.');e.target.value='';return;}
    var ext=f.name.split('.').pop().toUpperCase();
    var path='privatedocs/'+chatId+'/'+myUid+'_'+Date.now()+'_'+f.name;
    ensureAuth().then(function(){return uploadToStorage(f,path);}).then(function(url){
        return db.collection('privateMessages').add({chatId:chatId,type:'document',docName:f.name,docUrl:url,docSize:f.size,docExt:ext,username:myNick,color:myColor,uid:myUid,timestamp:firebase.firestore.FieldValue.serverTimestamp(),status:'sent'});
    }).then(function(){updateConversation('','document',otherUid);}).catch(function(e){console.error(e);alert('Erro ao enviar documento.');});
    e.target.value='';
};
window.openMediaGallery=function(){
    document.getElementById('mediaGalleryModal').classList.add('sh');
    var grid=document.getElementById('mediaGalleryGrid');
    grid.innerHTML='<div style="grid-column:1/-1;text-align:center;color:#bbb;font-size:.82rem;padding:30px">Carregando...</div>';
    db.collection('privateMessages').where('chatId','==',chatId).where('type','in',['image','video']).orderBy('timestamp','desc').limit(30).get().then(function(snap){
        grid.innerHTML='';
        if(snap.empty){grid.innerHTML='<div style="grid-column:1/-1;text-align:center;color:#bbb;padding:30px">Nenhuma midia encontrada.</div>';return;}
        snap.forEach(function(doc){
            var d=doc.data();
            var url=escUrl(d.imageUrl||d.videoUrl||'');
            if(!url)return;
            var el=document.createElement(d.type==='video'?'video':'img');
            el.src=url;
            if(d.type==='video'){el.muted=true;el.style='width:100%;aspect-ratio:1;object-fit:cover;border-radius:4px;cursor:pointer';el.onclick=function(){openFullImg(url);};}
            else{el.style='width:100%;aspect-ratio:1;object-fit:cover;border-radius:4px;cursor:pointer';el.onclick=function(){openFullImg(url);};}
            grid.appendChild(el);
        });
    }).catch(function(){grid.innerHTML='<div style="grid-column:1/-1;text-align:center;color:#bbb;padding:30px">Erro ao carregar.</div>';});
};
window.toggleSelectionMode=function(){
    selMode=!selMode;
    document.getElementById('selBar').classList.toggle('sh',selMode);
    if(!selMode){selMsgs={};document.getElementById('selCount').textContent='0 selecionadas';document.getElementById('selDelete').disabled=true;document.getElementById('selForward').disabled=true;document.querySelectorAll('.sel-on').forEach(function(e){e.classList.remove('sel-on');});}
};
window.exitSelectionMode=function(){selMode=false;document.getElementById('selBar').classList.remove('sh');selMsgs={};document.getElementById('selCount').textContent='0 selecionadas';document.getElementById('selDelete').disabled=true;document.getElementById('selForward').disabled=true;document.querySelectorAll('.sel-on').forEach(function(e){e.classList.remove('sel-on');});};
window.toggleSelectMsg=function(id,e){
    if(!selMode)return;
    e.stopPropagation();
    var el=document.getElementById('msg_'+id);
    if(!el)return;
    if(selMsgs[id]){delete selMsgs[id];el.classList.remove('sel-on');}
    else{selMsgs[id]=true;el.classList.add('sel-on');}
    var c=Object.keys(selMsgs).length;
    document.getElementById('selCount').textContent=c+' selecionada'+(c!==1?'s':'');
    document.getElementById('selDelete').disabled=c===0;
    document.getElementById('selForward').disabled=c===0;
};
window.batchDelete=function(){
    var ids=Object.keys(selMsgs);
    if(ids.length===0)return;
    if(!confirm('Apagar '+ids.length+' mensagem(ns)?'))return;
    ids.forEach(function(id){db.collection('privateMessages').doc(id).delete().catch(function(){});});
    exitSelectionMode();
};
window.batchForward=function(){
    var ids=Object.keys(selMsgs);
    if(ids.length===0)return;
    var msgs=allMessages.filter(function(m){return ids.indexOf(m.id)!==-1;});
    msgs.forEach(function(msg){
        var data={chatId:chatId,type:msg.type||'text',username:myNick,color:myColor,uid:myUid,timestamp:firebase.firestore.FieldValue.serverTimestamp(),status:'sent'};
        if(msg.text)data.text=msg.text;
        if(msg.imageUrl)data.imageUrl=msg.imageUrl;
        if(msg.videoUrl)data.videoUrl=msg.videoUrl;
        if(msg.sticker)data.sticker=msg.sticker;
        if(msg.audioData)data.audioData=msg.audioData;
        if(msg.docName){data.type='document';data.docName=msg.docName;data.docUrl=msg.docUrl;data.docSize=msg.docSize;data.docExt=msg.docExt;}
        ensureAuth().then(function(){return db.collection('privateMessages').add(data);}).catch(function(e){console.error(e);});
    });
    updateConversation('','forward',otherUid);
    exitSelectionMode();alert('Reenviando '+ids.length+' mensagem(ns)...');
};
window.sendMessage=function(){
    var inp=document.getElementById('chatInput'),text=inp.value.trim();
    if(!text||!myNick)return;
    var msgData={chatId:chatId,type:'text',text:text,username:myNick,color:myColor,uid:myUid,timestamp:firebase.firestore.FieldValue.serverTimestamp(),status:'sent'};
    var urlMatch=text.match(/https?:\/\/[^\s]+/);
    if(urlMatch&&!linkPreviewCache[urlMatch[0]]){
        var u=urlMatch[0];
        fetch('https://api.allorigins.win/raw?url='+encodeURIComponent(u)).then(function(r){return r.text();}).then(function(html){
            var t=(html.match(/<title>([^<]+)<\/title>/i)||[])[1]||'';
            var d=(html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i)||html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i)||[])[1]||'';
            var i=(html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)||[])[1]||'';
            linkPreviewCache[u]={title:t,desc:d,img:i};
        }).catch(function(){});
    }
    if(replyToData){msgData.replyTo={id:replyToData.id,username:replyToData.username,text:replyToData.text};}
    ensureAuth().then(function(){return db.collection('privateMessages').add(msgData);}).then(function(){inp.value='';inp.style.height='auto';inp.dispatchEvent(new Event('input'));cancelReply();inp.focus();updateConversation(text,'text',otherUid);}).catch(function(e){console.error(e);});
};

var lastDateKey='';
function renderMessage(msg){
    var list=document.getElementById('messagesList'),isMine=msg.uid===myUid;
    if(msg.timestamp){
        var d3=msg.timestamp.toDate?msg.timestamp.toDate():new Date(msg.timestamp);
        var dk3=d3.getFullYear()+'-'+(d3.getMonth()+1)+'-'+d3.getDate();
        if(dk3!==lastDateKey){lastDateKey=dk3;var sep=document.createElement('div');sep.className='ms';sep.textContent=formatDateSep(msg.timestamp);list.appendChild(sep);}
    }
    var bubble=document.createElement('div');bubble.className='mb'+(isMine?' mn':'')+' msg-enter';bubble.id='msg_'+msg.id;
    if(!isMine)bubble.innerHTML=makeAvatar(msg.uid,msg.username,msg.color);
    var content=document.createElement('div');content.className='mc';
    if(msg.replyTo){var rq=document.createElement('div');rq.className='mrq';rq.innerHTML='<div class="mrqn">'+escHtml(msg.replyTo.username||'')+'</div><div class="mrqt">'+escHtml(msg.replyTo.text||'').substring(0,80)+'</div>';content.appendChild(rq);}
    if(msg.type==='image'&&msg.imageUrl){
        var safeImg=escUrl(msg.imageUrl);
        var isViewOnce=msg.viewOnce&&!isMine;
        var img=document.createElement('img');img.className='mi'+(isViewOnce?' mi-vo':'');img.src=safeImg;
        if(isViewOnce){
            img.style.filter='blur(20px)';img.style.cursor='pointer';
            var voOverlay=document.createElement('div');voOverlay.className='vo-overlay';
            voOverlay.innerHTML='<i class="fas fa-eye"></i><span>Toque para ver</span>';
            voOverlay.onclick=function(e){e.stopPropagation();openViewOnceMsg(msg.id,safeImg,img,voOverlay);};
            content.appendChild(voOverlay);
        }else{
            img.onclick=function(){openFullImg(safeImg);};
        }
        content.appendChild(img);
        if(!isViewOnce){
            var acts=document.createElement('div');acts.className='mact';
            var si=escHtml(safeImg);
            acts.innerHTML='<button onclick="openFullImg(\''+si+'\')"><i class="fas fa-expand"></i> Ver</button><button onclick="downloadMedia(\''+si+'\')"><i class="fas fa-download"></i> Baixar</button><button onclick="openForward(\''+si+'\',\'image\')" class="fwd-btn" style="display:none"><i class="fas fa-share"></i> Reenviar</button>';
            content.appendChild(acts);
        }else{
            var vtag=document.createElement('div');vtag.className='vo-tag';
            vtag.innerHTML='<i class="fas fa-circle-notch"></i> Visualização única';
            content.appendChild(vtag);
        }
    }else if(msg.type==='video'){
        var vidSafe=msg.videoUrl||'';
        var isVidViewOnce=msg.viewOnce&&!isMine;
        if(isVidViewOnce&&msg.videoUrl){
            var vCont=document.createElement('div');vCont.style.position='relative';vCont.style.display='inline-block';vCont.style.width='100%';
            var vThumb=document.createElement('div');vThumb.style.width='100%';vThumb.style.minHeight='120px';vThumb.style.background='#eee';vThumb.style.borderRadius='8px';vThumb.style.display='flex';vThumb.style.alignItems='center';vThumb.style.justifyContent='center';vThumb.style.filter='blur(20px)';
            vThumb.innerHTML='<i class="fas fa-video" style="font-size:2rem;color:#ccc"></i>';
            vCont.appendChild(vThumb);
            var vOverlay=document.createElement('div');vOverlay.className='vo-overlay';
            vOverlay.innerHTML='<i class="fas fa-eye"></i><span>Toque para ver</span>';
            vOverlay.onclick=function(e){e.stopPropagation();openViewOnceMsg(msg.id,vidSafe,vThumb,vOverlay);};
            vCont.appendChild(vOverlay);
            content.appendChild(vCont);
        }else{
            if(msg.videoUrl&&msg.videoUrl.indexOf('data:')===0){var vd=document.createElement('video');vd.className='mi';vd.src=msg.videoUrl;vd.controls=true;vd.style.marginTop='3px';content.appendChild(vd);}
        }
        var vacts=document.createElement('div');vacts.className='mact';
        var vu=escHtml(escUrl(msg.videoUrl||''));
        vacts.innerHTML='<button onclick="downloadMedia(\''+vu+'\')"><i class="fas fa-download"></i> Baixar</button><button onclick="openForward(\''+vu+'\',\'video\')" class="fwd-btn" style="display:none"><i class="fas fa-share"></i> Reenviar</button>';
        content.appendChild(vacts);
    }else if(msg.type==='sticker'){var st=document.createElement('div');st.className='mst';if(msg.sticker&&(msg.sticker.indexOf('data:')===0||msg.sticker.indexOf('http')===0)){var si=document.createElement('img');si.src=escUrl(msg.sticker);si.loading='lazy';si.onclick=function(){openFullImg(msg.sticker);};st.appendChild(si);}else{st.textContent=msg.sticker;}content.appendChild(st);var sacts=document.createElement('div');sacts.className='mact';var se=escHtml(msg.sticker);sacts.innerHTML='<button onclick="openFullImg(\''+se+'\')"><i class="fas fa-expand"></i> Ver</button><button onclick="openForward(\''+se+'\',\'sticker\')" class="fwd-btn" style="display:none"><i class="fas fa-share"></i> Reenviar</button>';content.appendChild(sacts);}
    else if(msg.type==='audio'&&msg.audioData){var aw=document.createElement('div');aw.className='mau';var au=document.createElement('audio');au.controls=true;au.src=msg.audioData;aw.appendChild(au);content.appendChild(aw);}
    else if(msg.type==='document'&&msg.docUrl){
        var dc=document.createElement('a');dc.className='mdoc';dc.href=escUrl(msg.docUrl);dc.target='_blank';
        var icons={PDF:'fa-file-pdf',DOC:'fa-file-word',DOCX:'fa-file-word',XLS:'fa-file-excel',XLSX:'fa-file-excel',PPT:'fa-file-powerpoint',PPTX:'fa-file-powerpoint',ZIP:'fa-file-archive',RAR:'fa-file-archive',TXT:'fa-file-alt'};
        dc.innerHTML='<i class="fas '+(icons[msg.docExt]||'fa-file')+'"></i><div><div class="mdn">'+escHtml(msg.docName||'Documento')+'</div><div class="mds">'+msg.docExt+' - '+(msg.docSize?Math.round(msg.docSize/1024)+'KB':'')+'</div></div>';
        content.appendChild(dc);
    }else if(msg.text){
        var tx=document.createElement('div');tx.className='mt';tx.textContent=msg.text;
        var urlMatch=msg.text.match(/https?:\/\/[^\s]+/);
        if(urlMatch&&linkPreviewCache[urlMatch[0]]){
            var lp=linkPreviewCache[urlMatch[0]];
            var lpd=document.createElement('div');lpd.className='mlkp';
            var lph='';
            if(lp.img)lph+='<img src="'+escUrl(lp.img)+'" loading="lazy">';
            lph+='<div class="mlkc">';
            if(lp.title)lph+='<div class="mlkt">'+escHtml(lp.title)+'</div>';
            if(lp.desc)lph+='<div class="mlkd">'+escHtml(lp.desc)+'</div>';
            lph+='<div class="mlku">'+escHtml(urlMatch[0])+'</div></div>';
            lpd.innerHTML=lph;
            lpd.onclick=function(){window.open(urlMatch[0],'_blank');};
            content.appendChild(lpd);
        }
        var tm=document.createElement('div');tm.className='mti';tm.textContent=formatTime(msg.timestamp);
        var tw=document.createElement('div');tw.className='mtw';tw.appendChild(tx);tw.appendChild(tm);
        if(isMine&&msg.status){var sts=document.createElement('span');sts.className='msts';
            if(msg.status==='sent')sts.innerHTML='<i class="fas fa-check sck"></i>';
            else if(msg.status==='delivered')sts.innerHTML='<i class="fas fa-check-double sck"></i>';
            else if(msg.status==='read')sts.innerHTML='<i class="fas fa-check-double sck sr"></i>';
            tw.appendChild(sts);}
        content.appendChild(tw);
        var tact=document.createElement('div');tact.className='mact';tact.innerHTML='<button onclick="openForward(\''+escHtml(msg.text)+'\',\'text\')" class="fwd-btn" style="display:none"><i class="fas fa-share"></i> Reenviar</button>';content.appendChild(tact);
    }else{var tm=document.createElement('div');tm.className='mti';tm.textContent=formatTime(msg.timestamp);if(isMine&&msg.status){var sts=document.createElement('span');sts.className='msts';if(msg.status==='sent')sts.innerHTML='<i class="fas fa-check sck"></i>';else if(msg.status==='delivered')sts.innerHTML='<i class="fas fa-check-double sck"></i>';else if(msg.status==='read')sts.innerHTML='<i class="fas fa-check-double sck sr"></i>';var w2=document.createElement('div');w2.className='mtw';w2.appendChild(tm);w2.appendChild(sts);content.appendChild(w2);}else{content.appendChild(tm);}}
    var rab=document.createElement('div');rab.className='rab';rab.id='rab_'+msg.id;rab.style.display='none';
    var ractions=msg.reactions||{};
    SEARCH_EMOJIS.forEach(function(emoji){if(ractions[emoji]&&ractions[emoji].length>0){var bt=document.createElement('button');bt.textContent=emoji;var cnt=document.createElement('span');cnt.className='rcnt';cnt.textContent=ractions[emoji].length;bt.appendChild(cnt);if(ractions[emoji].indexOf(myUid)!==-1)bt.style.background='rgba(0,168,132,.15)';bt.onclick=function(e){e.stopPropagation();toggleReaction(msg.id,emoji);};rab.appendChild(bt);}});
    var addReact=document.createElement('button');addReact.textContent='+';addReact.style.opacity='.5';addReact.style.fontSize='.7rem';addReact.onclick=function(e){e.stopPropagation();openReactionPicker(msg.id,e);};rab.appendChild(addReact);
    if(rab.childNodes.length>1)content.appendChild(rab);
    bubble.appendChild(content);
    bubble.onclick=function(e){
        if(selMode){e.preventDefault();toggleSelectMsg(msg.id,e);return;}
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
function renderAll(msgs){var l=document.getElementById('messagesList');l.innerHTML='';lastDateKey='';msgs.forEach(function(m){renderMessage(m);var b=document.getElementById('msg_'+m.id);if(b){b.classList.remove('msg-enter');b.classList.add('msg-enter-bulk');}});scrollBottom();}

function listenMessages(){
    unsub=db.collection('privateMessages').where('chatId','==',chatId).orderBy('timestamp','desc').limit(PAGE_SIZE).onSnapshot(function(snap){
        var msgs=[];firstDoc=snap.docs.length>0?snap.docs[snap.docs.length-1]:null;
        snap.forEach(function(doc){var d=Object.assign({id:doc.id},doc.data());msgs.push(d);});
        allMessages=msgs.reverse().filter(function(m){return blockedUsers.indexOf(m.uid)===-1;});
        var latestMsg=allMessages.length>0?allMessages[allMessages.length-1]:null;
        allMessages.some(function(m){if(m.uid===myUid&&m.status==='sent'&&m.id){db.collection('privateMessages').doc(m.id).update({status:'delivered'}).catch(function(){});return true;}return false;});
        if(latestMsg&&latestMsg.id!==lastSeenMsgId&&lastSeenMsgId!==''){
            if(latestMsg.uid!==myUid&&document.hidden){
                try{
                    if('Notification' in window&&Notification.permission==='granted'){
                        new Notification(latestMsg.username||'Chat Privado',{body:latestMsg.text||'Enviou uma midia',icon:'logo.svg',tag:'gwchat_'+Date.now()});
                    }
                }catch(e){}
                // Increment unread for inbox
                db.collection('chatConversations').doc(chatId).set({
                    ['unread.'+myUid]:firebase.firestore.FieldValue.increment(1),
                    lastTimestamp:firebase.firestore.FieldValue.serverTimestamp()
                },{merge:true}).catch(function(){});
            }
            if(latestMsg.uid!==myUid&&!document.hidden){
                db.collection('privateMessages').doc(latestMsg.id).update({status:'read'}).catch(function(){});
                // Clear unread when viewing chat
                db.collection('chatConversations').doc(chatId).set({
                    ['unread.'+myUid]:0,
                    lastTimestamp:firebase.firestore.FieldValue.serverTimestamp()
                },{merge:true}).catch(function(){});
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

window.openViewOnceMsg=function(msgId,safeImg,imgEl,overlayEl){
    ensureAuth().then(function(){
        return db.collection('privateMessages').doc(msgId).update({viewedAt:firebase.firestore.FieldValue.serverTimestamp(),viewedBy:myUid});
    }).catch(function(){});
    imgEl.style.filter='none';imgEl.style.cursor='default';
    if(overlayEl)overlayEl.remove();
    imgEl.onclick=function(){openFullImg(safeImg);};
};
window.openFullImg=function(src){fullImgSrc=src;document.getElementById('fullImgEl').src=src;document.getElementById('fullImgOverlay').classList.add('sh');};
window.closeFullImg=function(){document.getElementById('fullImgOverlay').classList.remove('sh');};
window.downloadFullImg=function(){if(!fullImgSrc)return;var a=document.createElement('a');a.href=fullImgSrc;a.download='gruposwhats_'+Date.now()+'.png';a.click();};
window.toggleAttach=function(){document.getElementById('attachPopup').classList.toggle('sh');};
window.closeAttach=function(){document.getElementById('attachPopup').classList.remove('sh');};
window.downloadMedia=function(src){var a=document.createElement('a');a.href=src;a.download='gruposwhats_media.png';a.click();};
var SEARCH_EMOJIS=['\u2764\uFE0F','\u{1F602}','\u{1F62D}','\u{1F44D}','\u{1F525}','\u{1F44F}','\u{1F60E}','\u{1F914}','\u{1F621}','\u{1F389}'];
var replyToData=null,typingTimeout=null,lastTypingUpdate=0;
var _viewOnceMode={img:false,video:false};

window.saveNickname=function(){
    var nick=document.getElementById('nickInput').value.trim();
    if(!nick||nick.length<2){document.getElementById('nickInput').style.borderColor='#e74c3c';return;}
    myNick=nick;localStorage.setItem('gw_chat_nick',nick);
    document.getElementById('nickModal').classList.remove('sh');
    ensureAuth().then(function(){goOnline();listenMessages();listenTyping();requestNotificationPermission();});
};

document.getElementById('chatMessages').addEventListener('click',function(e){
    if(e.target.closest('button')||e.target.closest('img')||e.target.closest('video')||e.target.closest('a')||e.target.closest('input')||e.target.closest('.map'))return;
    var popup=document.getElementById('msgActionsPopup');popup.style.display='none';
    var mb=e.target.closest('.mb');if(!mb)return;
    var mc=mb.querySelector('.mc');if(!mc)return;
    var rect=mc.getBoundingClientRect();
    var msgId=mb.querySelector('.rab');msgId=msgId?msgId.id.replace('rab_',''):'';
    var reactDiv=document.getElementById('mapReactions');reactDiv.innerHTML='';
    var rab=mb.querySelector('.rab');
    if(rab){rab.querySelectorAll('button').forEach(function(b){var c=b.cloneNode(true);c.onclick=function(ev){ev.stopPropagation();b.click();popup.style.display='none';};reactDiv.appendChild(c);});}
    else{SEARCH_EMOJIS.slice(0,6).forEach(function(em){var bt=document.createElement('button');bt.textContent=em;bt.onclick=function(ev){ev.stopPropagation();if(msgId)toggleReaction(msgId,em);popup.style.display='none';};reactDiv.appendChild(bt);});}
    var addBtn=document.createElement('button');addBtn.className='add-emoji';addBtn.textContent='+';
    addBtn.onclick=function(ev){ev.stopPropagation();popup.style.display='none';if(msgId)openReactionPicker(msgId,ev);};
    reactDiv.appendChild(addBtn);
    var fwdBtn=mb.querySelector('.fwd-btn');
    var actDiv=document.getElementById('mapActions');actDiv.innerHTML='';
    var div=document.getElementById('mapDivider');
    if(fwdBtn){var fc=fwdBtn.cloneNode(true);fc.onclick=function(ev){ev.stopPropagation();fwdBtn.click();popup.style.display='none';};actDiv.appendChild(fc);div.style.display='';}else{div.style.display='none';}
    var pw=Math.min(280,window.innerWidth-20);
    var left=rect.left+rect.width/2-pw/2;
    var top=rect.top-10;
    popup.style.width=pw+'px';
    if(top<5){top=rect.bottom+10;popup.classList.remove('map-above');}else{popup.classList.add('map-above');}
    if(left<5)left=5;
    if(left+pw>window.innerWidth-5)left=window.innerWidth-pw-5;
    popup.style.left=left+'px';popup.style.top=top+'px';popup.style.display='';
    setTimeout(function(){document.addEventListener('click',_closeMsgActions);},0);
});
var _closeMsgActions=function(e){var popup=document.getElementById('msgActionsPopup');if(popup&&!popup.contains(e.target)){popup.style.display='none';document.removeEventListener('click',_closeMsgActions);}};
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
        // Update conversation typing status for inbox
        db.collection('chatConversations').doc(chatId).set({
            ['typing.'+myUid]:true,
            lastTimestamp:firebase.firestore.FieldValue.serverTimestamp()
        },{merge:true}).catch(function(){});
    }
    clearTimeout(typingTimeout);
    typingTimeout=setTimeout(function(){
        ensureAuth().then(function(){
            return db.collection('chatPresence').doc(myUid).set({typing:false},{merge:true});
        }).catch(function(){});
        // Clear typing status in conversation
        db.collection('chatConversations').doc(chatId).set({
            ['typing.'+myUid]:firebase.firestore.FieldValue.delete()
        },{merge:true}).catch(function(){});
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

window.toggleViewOnce=function(type){
    _viewOnceMode[type]=!_viewOnceMode[type];
    var btn=document.getElementById(type==='img'?'imgVoBtn':'videoVoBtn');
    if(btn){btn.classList.toggle('active',_viewOnceMode[type]);}
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
