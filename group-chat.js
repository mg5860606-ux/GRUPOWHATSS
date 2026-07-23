(function(){
var params=new URLSearchParams(window.location.search);
var groupId=params.get('id')||'';
var inviteCode=params.get('code')||'';
if(!groupId&&!inviteCode){window.location.href='inbox.html';return;}

var cfg={apiKey:"AIzaSyDgtqqGgjGgYmmNYg9cxhHIc-VIPASz3uE",authDomain:"grupos-whats-app.firebaseapp.com",projectId:"grupos-whats-app",storageBucket:"grupos-whats-app.appspot.com",messagingSenderId:"326359053624",appId:"1:326359053624:web:6a73ed5758052f2331e8be"};
if(!firebase.apps.length)firebase.initializeApp(cfg);
var db=firebase.firestore(),auth=firebase.auth(),storage=firebase.storage();
var COLORS=['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db','#9b59b6','#e84393','#00b894','#6c5ce7','#fd79a0','#00cec9','#74b9ff','#a29bfe','#ff6348'];
var PAGE_SIZE=30,firstDoc=null,allMessages=[];
var myNick=localStorage.getItem('gw_chat_nick')||'';
var myColor=localStorage.getItem('gw_chat_color')||'';
var myUid=localStorage.getItem('gw_chat_uid')||'';
var unsub=null,pendingImgData=null,pendingVideoData=null,pendingVideoFile=null;
var replyToData=null,linkPreviewCache={};
var groupData=null,groupMembers=[],lastDateKey='';
var typingTimeout=null,lastTypingUpdate=0;
var typingUnsub=null;
var SEARCH_EMOJIS=['\u2764\uFE0F','\u{1F602}','\u{1F62D}','\u{1F44D}','\u{1F525}','\u{1F44F}','\u{1F60E}','\u{1F914}','\u{1F621}','\u{1F389}'];

if(!myUid){myUid='u_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);localStorage.setItem('gw_chat_uid',myUid);}
if(!myColor){myColor=COLORS[Math.floor(Math.random()*COLORS.length)];localStorage.setItem('gw_chat_color',myColor);}

function ensureAuth(){return auth.signInAnonymously().catch(function(e){console.warn(e);return Promise.reject(e);});}
function getInitials(n){var p=n.trim().split(/\s+/);return p.length>=2?(p[0][0]+p[1][0]).toUpperCase():n.substring(0,2).toUpperCase();}
function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');}
function escUrl(s){return(s&&(/^https?:\/\//.test(s)||/^data:image\//.test(s)||/^data:video\//.test(s)||/^data:audio\//.test(s)))?s:'';}
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

function loadGroupData(){
    return new Promise(function(resolve,reject){
        // If invite code, find group by code
        if(inviteCode&&!groupId){
            db.collection('groups').where('inviteCode','==',inviteCode).limit(1).get().then(function(snap){
                if(snap.empty){alert('Grupo nao encontrado ou link invalido.');window.location.href='inbox.html';return;}
                snap.forEach(function(doc){groupId=doc.id;joinGroup(doc.id);resolve(doc.data());});
            }).catch(function(e){console.error(e);alert('Erro ao buscar grupo.');window.location.href='inbox.html';});
            return;
        }
        db.collection('groups').doc(groupId).get().then(function(snap){
            if(!snap.exists){alert('Grupo nao encontrado.');window.location.href='inbox.html';return;}
            var data=snap.data();
            groupData=data;
            groupMembers=data.members||[];
            // Auto-join if not member
            if(groupMembers.indexOf(myUid)===-1){
                joinGroup(groupId).then(function(){resolve(data);});
            }else{
                resolve(data);
            }
        }).catch(function(e){console.error(e);alert('Erro ao carregar grupo.');});
    });
}

function joinGroup(gid){
    return db.collection('groups').doc(gid).update({
        members:firebase.firestore.FieldValue.arrayUnion(myUid)
    }).then(function(){
        // Add to user's conversations
        db.collection('chatConversations').doc('group_'+gid).set({
            participants:[myUid],
            isGroup:true,
            groupId:gid,
            lastTimestamp:firebase.firestore.FieldValue.serverTimestamp()
        },{merge:true}).catch(function(){});
        // Add system message
        db.collection('groupMessages').add({
            groupId:gid,
            type:'system',
            text:myNick+' entrou no grupo.',
            username:'Sistema',
            uid:'system',
            timestamp:firebase.firestore.FieldValue.serverTimestamp()
        }).catch(function(){});
    }).catch(function(e){console.error(e);});
}

function renderHeader(data){
    document.getElementById('groupName').textContent=data.name||'Grupo';
    var count=(data.members||[]).length;
    document.getElementById('groupSub').textContent=count+' membros';
    var av=document.getElementById('groupAvatar');
    if(data.photo){av.innerHTML='<img src="'+escUrl(data.photo)+'">';}else{av.textContent=getInitials(data.name||'G');}
}

function renderModalInfo(data){
    var isAdmin=data.admins&&data.admins.indexOf(myUid)!==-1;
    document.getElementById('modalGroupName').textContent=data.name||'Grupo';
    document.getElementById('modalGroupMemberCount').textContent=(data.members||[]).length+' membros';
    var avContainer=document.getElementById('modalGroupAvatar');
    var initial=document.getElementById('modalGroupInitial');
    if(data.photo){initial.innerHTML='<img src="'+escUrl(data.photo)+'" style="width:100%;height:100%;object-fit:cover">';}else{initial.textContent=getInitials(data.name||'G');}
    // Show admin controls
    document.getElementById('adminGroupControls').style.display=isAdmin?'flex':'none';
    // Render members
    var list=document.getElementById('membersList');
    list.innerHTML='';
    (data.members||[]).forEach(function(uid){
        loadProfileFresh(uid).then(function(prof){
            var isMemberAdmin=data.admins&&data.admins.indexOf(uid)!==-1;
            var isMe=uid===myUid;
            var name=(prof&&prof.name)||(uid===myUid?myNick:'Usuario');
            var color=prof&&prof.color?prof.color:COLORS[Math.abs(uid.split('').reduce(function(a,c){return a+c.charCodeAt(0);},0))%COLORS.length];
            var item=document.createElement('div');item.className='member-item';
            item.innerHTML='<div class="ma" style="background:'+color+'">'+(prof&&prof.photo?'<img src="'+escUrl(prof.photo)+'">':getInitials(name))+'</div><div class="minfo"><div class="mnome">'+escHtml(name)+(isMe?' <span style="font-size:.68rem;color:#888">(você)</span>':'')+'</div><div class="mstatus">'+(isMemberAdmin?'<span class="badge-admin">Admin</span>':'')+'</div></div>';
            if(isAdmin&&isMemberAdmin&&uid!==myUid){
                var rmBtn=document.createElement('button');rmBtn.className='btn-sm btn-danger';rmBtn.textContent='Remover';rmBtn.style.marginLeft='auto';
                rmBtn.onclick=function(){removeMember(uid);};
                item.appendChild(rmBtn);
            }
            list.appendChild(item);
        });
    });
}

// ===== EDIT GROUP NAME (admin only) =====
window.editGroupName=function(){
    if(!groupData)return;
    if(!groupData.admins||groupData.admins.indexOf(myUid)===-1){alert('Apenas administradores podem editar o nome do grupo.');return;}
    var currentName=groupData.name||'Grupo';
    var newName=prompt('Digite o novo nome do grupo:',currentName);
    if(!newName||newName.trim()===currentName||newName.trim().length<2)return;
    newName=newName.trim();
    ensureAuth().then(function(){
        return db.collection('groups').doc(groupId).update({name:newName});
    }).then(function(){
        groupData.name=newName;
        renderHeader(groupData);
        renderModalInfo(groupData);
        // Update conversation
        db.collection('chatConversations').doc('group_'+groupId).set({groupName:newName},{merge:true}).catch(function(){});
        // Add system message
        db.collection('groupMessages').add({
            groupId:groupId,type:'system',
            text:myNick+' alterou o nome do grupo para "'+newName+'".',
            username:'Sistema',uid:'system',
            timestamp:firebase.firestore.FieldValue.serverTimestamp()
        }).catch(function(){});
    }).catch(function(e){console.error(e);alert('Erro ao alterar nome do grupo.');});
};

// ===== GROUP PHOTO (admin only) =====
window.updateGroupPhoto=function(){
    if(!groupId)return;
    if(!groupData||!groupData.admins||groupData.admins.indexOf(myUid)===-1){alert('Apenas administradores podem alterar a foto do grupo.');return;}
    var inp=document.createElement('input');inp.type='file';inp.accept='image/png,image/webp,image/jpeg';
    inp.onchange=function(e){
        var f=e.target.files[0];if(!f)return;
        if(f.size>10*1024*1024){alert('Imagem muito grande. Maximo 10MB.');return;}
        var r=new FileReader();r.onload=function(ev){
            var img=new Image();img.onload=function(){
                // Crop square from center + resize to 512x512
                var cropSize=Math.min(img.width,img.height);
                var sx=(img.width-cropSize)/2,sy=(img.height-cropSize)/2;
                var c=document.createElement('canvas');c.width=512;c.height=512;
                var ctx=c.getContext('2d');
                ctx.drawImage(img,sx,sy,cropSize,cropSize,0,0,512,512);
                var dataUrl=c.toDataURL('image/webp',0.85);
                // Upload to storage or store directly
                ensureAuth().then(function(){
                    // Convert data URL to blob for storage
                    var byteString=atob(dataUrl.split(',')[1]);
                    var mimeString=dataUrl.split(',')[0].split(':')[1].split(';')[0];
                    var ab=new ArrayBuffer(byteString.length);
                    var ia=new Uint8Array(ab);
                    for(var i=0;i<byteString.length;i++){ia[i]=byteString.charCodeAt(i);}
                    var blob=new Blob([ab],{type:mimeString});
                    var path='groups/'+groupId+'/photo_'+Date.now()+'.webp';
                    return uploadToStorage(blob,path);
                }).then(function(url){
                    return db.collection('groups').doc(groupId).update({photo:url});
                }).then(function(){
                    groupData.photo=url;
                    renderHeader(groupData);
                    renderModalInfo(groupData);
                    db.collection('groupMessages').add({
                        groupId:groupId,type:'system',
                        text:myNick+' alterou a foto do grupo.',
                        username:'Sistema',uid:'system',
                        timestamp:firebase.firestore.FieldValue.serverTimestamp()
                    }).catch(function(){});
                }).catch(function(e){console.error(e);alert('Erro ao atualizar foto.');});
            };img.src=ev.target.result;
        };r.readAsDataURL(f);
    };inp.click();
};

// ===== JOIN BY INVITE =====
window.joinGroupByCode=function(){
    var code=prompt('Digite o codigo de convite do grupo:');
    if(code&&code.trim()){window.location.href='group-chat.html?code='+encodeURIComponent(code.trim());}
};

// ===== INIT =====
function initApp(){
    ensureAuth().then(function(){
        loadGroupData().then(function(data){
            renderHeader(data);
            renderModalInfo(data);
            listenMessages();
            buildEmojiPicker();
            listenTyping();
            // Update conversation lastTimestamp periodically
            setInterval(function(){
                db.collection('chatConversations').doc('group_'+groupId).set({
                    participants:[myUid],
                    isGroup:true,
                    groupId:groupId,
                    lastTimestamp:firebase.firestore.FieldValue.serverTimestamp()
                },{merge:true}).catch(function(){});
            },60000);
        });
    }).catch(function(){alert('Erro de autenticacao. Recarregue a pagina.');});
}

// ===== SEND MESSAGE =====
window.sendMessage=function(){
    var inp=document.getElementById('chatInput'),text=inp.value.trim();
    if(!text||!myNick||!groupId)return;
    var msgData={groupId:groupId,type:'text',text:text,username:myNick,color:myColor,uid:myUid,timestamp:firebase.firestore.FieldValue.serverTimestamp()};
    ensureAuth().then(function(){return db.collection('groupMessages').add(msgData);}).then(function(){
        inp.value='';inp.style.height='38px';inp.focus();
        // Update group lastMessage
        db.collection('groups').doc(groupId).set({lastMessage:text,lastTimestamp:firebase.firestore.FieldValue.serverTimestamp(),lastSender:myUid,lastSenderName:myNick},{merge:true}).catch(function(){});
        db.collection('chatConversations').doc('group_'+groupId).set({lastMessage:text,lastTimestamp:firebase.firestore.FieldValue.serverTimestamp(),lastType:'text',lastSender:myUid},{merge:true}).catch(function(){});
    }).catch(function(e){console.error(e);});
};

// Input handler
document.getElementById('chatInput').addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}});
document.getElementById('chatInput').addEventListener('input',function(){
    this.style.height='auto';this.style.height=Math.min(this.scrollHeight,70)+'px';
    handleTyping();
});

// ===== EMOJI PICKER =====
var EMOJIS={'Frequentes':['\u{1F600}','\u{1F602}','\u{1F60D}','\u{1F970}','\u{1F60E}','\u{1F929}','\u{1F62D}','\u{1F97A}','\u{1F621}','\u{1F92F}','\u{1F973}','\u{1F634}','\u{1F644}','\u{1F914}','\u{1F92B}','\u{1F92D}','\u{1F608}','\u{1F480}','\u{1F921}','\u{1F47B}','\u{2764}\u{FE0F}','\u{1F525}','\u{2728}','\u{1F4AF}','\u{1F44F}','\u{1F64F}','\u{1F4AA}','\u{1F389}','\u{1FAE1}','\u{1F91D}','\u{1F440}','\u{1F44D}','\u{1F44E}','\u{270A}','\u{1F44A}','\u{1F64C}','\u{1F918}','\u{1F64D}','\u{1F64E}','\u{1F972}','\u{1F975}','\u{1F976}','\u{1F92A}','\u{1F928}','\u{1F9D0}','\u{1F60B}','\u{1F618}','\u{1F61C}','\u{1F61D}','\u{1F924}','\u{1F614}','\u{1F62C}','\u{1F62E}','\u{1F62F}','\u{1F632}','\u{1F633}','\u{1F635}','\u{1F636}','\u{1F637}','\u{1F911}','\u{1F913}','\u{1F607}','\u{1F606}','\u{1F605}','\u{1F604}','\u{1F601}','\u{1F603}','\u{1F60A}','\u{1F609}','\u{1F60F}','\u{1F610}','\u{1F611}','\u{1F615}','\u{1F616}','\u{1F61A}','\u{1F61B}','\u{1F61E}','\u{1F61F}','\u{1F620}','\u{1F622}','\u{1F623}','\u{1F624}','\u{1F625}','\u{1F628}','\u{1F629}','\u{1F62A}','\u{1F62B}','\u{1F630}','\u{1F631}'],'Maos':['\u{1F44B}','\u{1F590}\u{FE0F}','\u{270B}','\u{1F44C}','\u{270C}\u{FE0F}','\u{1F91E}','\u{1F44D}','\u{1F44E}','\u{270A}','\u{1F44A}','\u{1F44F}','\u{1F64F}','\u{1F450}','\u{1F932}','\u{1F91F}'],'Coracoes':['\u{2764}\u{FE0F}','\u{1F9E1}','\u{1F49B}','\u{1F49A}','\u{1F499}','\u{1F49C}','\u{1F5A4}','\u{1F90D}','\u{1F90E}','\u{1F494}','\u{1F495}','\u{1F496}','\u{1F497}','\u{1F498}','\u{1F49D}','\u{1F49E}','\u{1F49F}'],'Animais':['\u{1F436}','\u{1F431}','\u{1F439}','\u{1F430}','\u{1F98A}','\u{1F43B}','\u{1F43C}','\u{1F428}','\u{1F42F}','\u{1F43E}','\u{1F435}','\u{1F648}','\u{1F649}','\u{1F64A}','\u{1F412}','\u{1F414}','\u{1F427}','\u{1F426}','\u{1F424}','\u{1F983}','\u{1F425}','\u{1F985}','\u{1F986}','\u{1F987}','\u{1F989}','\u{1F43A}','\u{1F417}','\u{1F434}','\u{1F984}','\u{1F418}','\u{1F99B}','\u{1F40E}','\u{1F403}','\u{1F407}','\u{1F437}','\u{1F416}','\u{1F415}','\u{1F408}','\u{1F400}','\u{1F405}','\u{1F406}'],'Comida':['\u{1F34E}','\u{1F348}','\u{1F34F}','\u{1F34A}','\u{1F34B}','\u{1F34C}','\u{1F349}','\u{1F353}','\u{1F351}','\u{1F344}','\u{1F354}','\u{1F355}','\u{1F32D}','\u{1F32E}','\u{1F32F}','\u{1F359}','\u{1F35A}','\u{1F35B}','\u{1F35C}','\u{1F35D}','\u{1F35E}','\u{1F35F}','\u{1F361}','\u{1F362}','\u{1F363}','\u{1F370}','\u{1F382}','\u{1F371}','\u{1F36B}','\u{1F36C}','\u{1F36D}','\u{1F36A}','\u{1F366}','\u{1F369}','\u{1F36E}','\u{1F36F}','\u{1F9C0}','\u{1F37C}','\u{2615}','\u{1F375}','\u{1F376}','\u{1F37A}','\u{1F37B}','\u{1F378}','\u{1F379}','\u{1F377}','\u{1F37E}','\u{1F943}','\u{1F942}','\u{1F9C2}','\u{1F9C3}','\u{1F964}','\u{1F963}','\u{1F96E}','\u{1F96F}','\u{1F95E}','\u{1F9C7}','\u{1F9C1}','\u{1F962}','\u{1F961}','\u{1F95F}','\u{1F95A}','\u{1F95B}','\u{1F95C}','\u{1F95D}','\u{1F9C8}','\u{1F9C9}','\u{1F9CA}','\u{1F969}','\u{1F96A}','\u{1F96B}','\u{1F356}','\u{1F357}','\u{1F959}','\u{1F958}','\u{1F373}','\u{1F9C6}'],'Objetos':['\u{1F4F1}','\u{1F4BB}','\u{1F4F7}','\u{1F4F9}','\u{1F4FA}','\u{1F4A1}','\u{1F4B0}','\u{1F4E6}','\u{1F4DD}','\u{1F511}','\u{1F50D}','\u{1F512}','\u{1F514}','\u{1F4E3}','\u{1F4E2}','\u{1F4BD}','\u{1F4BE}','\u{1F4BF}','\u{1F4C0}','\u{1F50B}','\u{1F50C}','\u{1F381}','\u{1F389}','\u{1F38A}','\u{1F388}','\u{1F386}','\u{1F387}','\u{1F380}','\u{1F48E}','\u{1F48D}','\u{1F525}','\u{2728}','\u{2B50}','\u{1F4AF}','\u{1F319}','\u{1F5A4}','\u{26BD}','\u{26BE}','\u{1F3B5}','\u{1F3BC}','\u{1F3B6}']};

function buildEmojiPicker(){
    var el=document.getElementById('emojiPicker');
    if(!el)return;
    var h='';
    for(var sec in EMOJIS){
        h+='<div class="est">'+sec+'</div><div class="eg">';
        EMOJIS[sec].forEach(function(e){h+='<span class="ei" onclick="insertEmoji(\''+e+'\')">'+e+'</span>';});
        h+='</div>';
    }
    el.innerHTML=h;
}

window.insertEmoji=function(e){
    var inp=document.getElementById('chatInput'),s=inp.selectionStart,end=inp.selectionEnd;
    inp.value=inp.value.substring(0,s)+e+inp.value.substring(end);
    inp.selectionStart=inp.selectionEnd=s+e.length;inp.focus();
    inp.dispatchEvent(new Event('input'));
};
window.toggleEmojiPicker=function(){
    document.getElementById('attachPopup').classList.remove('sh');
    var ep=document.getElementById('emojiPicker');
    ep.classList.toggle('sh');
};

// ===== TYPING INDICATOR =====
function handleTyping(){
    if(!myNick||!groupId)return;
    var now=Date.now();
    if(now-lastTypingUpdate>2000){
        lastTypingUpdate=now;
        db.collection('groups').doc(groupId).set({
            ['typing.'+myUid]:{nick:myNick,ts:firebase.firestore.FieldValue.serverTimestamp()}
        },{merge:true}).catch(function(){});
    }
    clearTimeout(typingTimeout);
    typingTimeout=setTimeout(function(){
        db.collection('groups').doc(groupId).set({
            ['typing.'+myUid]:firebase.firestore.FieldValue.delete()
        },{merge:true}).catch(function(){});
    },3000);
}

function listenTyping(){
    if(typingUnsub)typingUnsub();
    if(!groupId)return;
    typingUnsub=db.collection('groups').doc(groupId).onSnapshot(function(doc){
        var bar=document.getElementById('typingBar');
        var txt=document.getElementById('typingText');
        if(!bar||!txt)return;
        if(doc.exists){
            var typingData=doc.data().typing||{};
            var typingNicks=[];
            for(var uid in typingData){
                if(uid!==myUid&&typingData[uid]&&typingData[uid].nick){
                    typingNicks.push(typingData[uid].nick);
                }
            }
            if(typingNicks.length>0){
                var label=typingNicks.length===1?typingNicks[0]+' esta digitando...':typingNicks[0]+' e mais '+(typingNicks.length-1)+' estao digitando...';
                txt.textContent=label;
                bar.classList.add('sh');
            }else{
                bar.classList.remove('sh');
            }
        }else{
            bar.classList.remove('sh');
        }
    });
}

// ===== REACTIONS =====
function openReactionPicker(msgId,e){
    e.stopPropagation();
    var picker=document.getElementById('reactionPicker');
    var grid=document.getElementById('reactionGrid');
    if(!picker||!grid)return;
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
        return db.collection('groupMessages').doc(msgId).get();
    }).then(function(doc){
        if(!doc.exists)return;
        var data=doc.data();
        var reactions=data.reactions||{};
        var arr=reactions[emoji]||[];
        var idx=arr.indexOf(myUid);
        if(idx===-1)arr.push(myUid);else arr.splice(idx,1);
        reactions[emoji]=arr;
        return db.collection('groupMessages').doc(msgId).update({reactions:reactions});
    }).catch(function(e){console.error(e);});
};

// ===== IMAGE =====
window.previewImg=function(e){
    var f=e.target.files[0];if(!f)return;
    if(f.size>20*1024*1024){alert('Imagem muito grande. Maximo 20MB.');e.target.value='';return;}
    var r=new FileReader();r.onload=function(ev){
        var img=new Image();img.onload=function(){
            var maxW=1200,maxH=1200,w=img.width,h=img.height;
            if(w>maxW||h>maxH){var ratio=Math.min(maxW/w,maxH/h);w=Math.round(w*ratio);h=Math.round(h*ratio);}
            var c=document.createElement('canvas');c.width=w;c.height=h;
            var ctx=c.getContext('2d');ctx.drawImage(img,0,0,w,h);
            pendingImgData=c.toDataURL('image/jpeg',0.7);
            document.getElementById('imgPreviewThumb').src=pendingImgData;
            document.getElementById('imgPreviewBar').classList.add('sh');
        };img.src=ev.target.result;
    };r.readAsDataURL(f);e.target.value='';
};
window.cancelImgPreview=function(){pendingImgData=null;document.getElementById('imgPreviewBar').classList.remove('sh');};
window.sendImage=function(){
    if(!pendingImgData||!myNick||!groupId)return;
    ensureAuth().then(function(){return db.collection('groupMessages').add({groupId:groupId,type:'image',imageUrl:pendingImgData,username:myNick,color:myColor,uid:myUid,timestamp:firebase.firestore.FieldValue.serverTimestamp()});}).then(function(){cancelImgPreview();}).catch(function(e){console.error(e);});
};

// ===== VIDEO =====
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
window.cancelVideoPreview=function(){pendingVideoData=null;pendingVideoFile=null;document.getElementById('videoPreviewBar').classList.remove('sh');};
window.sendVideoFile=function(){
    if(!pendingVideoFile||!myNick||!groupId)return;
    var btn=document.querySelector('#videoPreviewBar .sip');if(btn){btn.textContent='Enviando...';btn.disabled=true;}
    ensureAuth().then(function(){
        var path='groups/'+groupId+'/videos/'+myUid+'_'+Date.now()+'.mp4';
        return uploadToStorage(pendingVideoFile,path);
    }).then(function(url){
        return db.collection('groupMessages').add({groupId:groupId,type:'video',videoUrl:url,username:myNick,color:myColor,uid:myUid,timestamp:firebase.firestore.FieldValue.serverTimestamp()});
    }).then(function(){cancelVideoPreview();}).catch(function(e){console.error(e);if(btn){btn.textContent='Enviar';btn.disabled=false;}});
};

// ===== DOCUMENT =====
window.sendDocument=function(e){
    var f=e.target.files[0];if(!f||!myNick||!groupId)return;
    if(f.size>20*1024*1024){alert('Documento muito grande. Maximo 20MB.');return;}
    var ext=f.name.split('.').pop().toUpperCase();
    ensureAuth().then(function(){
        var path='groups/'+groupId+'/docs/'+myUid+'_'+Date.now()+'_'+f.name;
        return uploadToStorage(f,path);
    }).then(function(url){
        return db.collection('groupMessages').add({groupId:groupId,type:'document',docName:f.name,docUrl:url,docSize:f.size,docExt:ext,username:myNick,color:myColor,uid:myUid,timestamp:firebase.firestore.FieldValue.serverTimestamp()});
    }).catch(function(e){console.error(e);});
    e.target.value='';
};

function uploadToStorage(file,path){
    return new Promise(function(resolve,reject){
        var ref=storage.ref(path);
        var task=ref.put(file);
        task.on('state_changed',null,function(e){reject(e);},function(){task.snapshot.ref.getDownloadURL().then(resolve).catch(reject);});
    });
}

// ===== LISTEN MESSAGES =====
function listenMessages(){
    if(unsub)unsub();
    unsub=db.collection('groupMessages').where('groupId','==',groupId).orderBy('timestamp','asc').onSnapshot(function(snap){
        snap.docChanges().forEach(function(change){
            var msg=change.doc.data();msg.id=change.doc.id;
            if(change.type==='added'){
                renderMessage(msg);
            }else if(change.type==='modified'){
                // Update message reactions in place
                var existing=document.getElementById('msg_'+msg.id);
                if(existing){
                    // Build just the reactions bar for this message
                    var newRab=null;
                    if(msg.reactions){
                        newRab=document.createElement('div');newRab.className='rab';
                        for(var em in msg.reactions){
                            var users=msg.reactions[em];
                            if(users&&users.length>0){
                                newRab.appendChild(buildReactionButton(em,users,msg.id));
                            }
                        }
                        if(newRab.children.length===0)newRab=null;
                    }
                    var oldRab=existing.querySelector('.rab');
                    if(newRab){
                        if(oldRab)oldRab.replaceWith(newRab);
                        else existing.querySelector('.mc').appendChild(newRab);
                    }else if(oldRab){
                        oldRab.remove();
                    }
                }
            }
        });
    },function(err){
        console.error('Group msgs err:',err);
        document.getElementById('messagesList').innerHTML='<div class="ms" style="color:#f85149">Erro ao carregar mensagens</div>';
    });
}

function buildReactionButton(em,users,msgId){
    var rb=document.createElement('button');
    rb.textContent=em;
    rb.onclick=function(){toggleReaction(msgId,em);};
    var cnt=document.createElement('span');cnt.className='rcnt';cnt.textContent=users.length;
    rb.appendChild(cnt);
    return rb;
}

// ===== RENDER MESSAGE =====
function renderMessage(msg){
    var list=document.getElementById('messagesList'),isMine=msg.uid===myUid;
    if(msg.type==='system'){var d=document.createElement('div');d.className='ms';d.textContent=msg.text;list.appendChild(d);return;}
    if(msg.timestamp){var d2=msg.timestamp.toDate?msg.timestamp.toDate():new Date(msg.timestamp);var dk=d2.getFullYear()+'-'+(d2.getMonth()+1)+'-'+d2.getDate();if(dk!==lastDateKey){lastDateKey=dk;var sep=document.createElement('div');sep.className='ms';sep.textContent=formatDateSep(msg.timestamp);list.appendChild(sep);}}
    var bubble=document.createElement('div');bubble.className='mb'+(isMine?' mn':'')+' msg-enter';bubble.id='msg_'+msg.id;
    if(!isMine){
        var avDiv=document.createElement('div');avDiv.className='ma';avDiv.style.background=msg.color||COLORS[0];
        avDiv.innerHTML=getInitials(msg.username||'?');
        avDiv.onclick=function(){};
        bubble.appendChild(avDiv);
    }
    var content=document.createElement('div');content.className='mc';
    if(!isMine){var u=document.createElement('div');u.className='mu';u.style.color=msg.color||COLORS[0];u.textContent=msg.username||'Usuario';content.appendChild(u);}
    if(msg.type==='image'&&msg.imageUrl){
        var safeImg=escUrl(msg.imageUrl);
        var img=document.createElement('img');img.className='mi';img.src=safeImg;
        img.onclick=function(){openFullImg(safeImg);};content.appendChild(img);
        var acts=document.createElement('div');acts.className='mact';acts.style.display='flex';acts.style.gap='6px';acts.style.marginTop='4px';
        var si=escHtml(safeImg);
        acts.innerHTML='<button onclick="openFullImg(\''+si+'\')" style="background:none;border:none;color:#128C7E;font-size:.72rem;font-weight:600;cursor:pointer"><i class="fas fa-expand"></i> Ver</button>';
        content.appendChild(acts);
    }else if(msg.type==='video'&&msg.videoUrl){
        var vu=escUrl(msg.videoUrl);
        var lk=document.createElement('a');lk.className='mlk';lk.href=vu;lk.target='_blank';lk.textContent='🎬 Ver video';
        content.appendChild(lk);
    }else if(msg.type==='document'&&msg.docUrl){
        var dc=document.createElement('a');dc.className='mlk';dc.href=escUrl(msg.docUrl);dc.target='_blank';
        var icons={PDF:'fa-file-pdf',DOC:'fa-file-word',DOCX:'fa-file-word',XLS:'fa-file-excel',XLSX:'fa-file-excel',PPT:'fa-file-powerpoint',PPTX:'fa-file-powerpoint',ZIP:'fa-file-archive',RAR:'fa-file-archive',TXT:'fa-file-alt'};
        dc.innerHTML='<i class="fas '+(icons[msg.docExt]||'fa-file')+'"></i> '+escHtml(msg.docName||'Documento')+' ('+msg.docExt+')';
        content.appendChild(dc);
    }else if(msg.text){
        var tx=document.createElement('div');tx.className='mt';tx.textContent=msg.text;
        var tm=document.createElement('div');tm.className='mti';tm.textContent=formatTime(msg.timestamp);
        var tw=document.createElement('div');tw.style.display='flex';tw.style.alignItems='flex-end';tw.style.gap='4px';tw.appendChild(tx);tw.appendChild(tm);
        content.appendChild(tw);
    }
    // Reactions
    if(msg.reactions){
        var rab=document.createElement('div');rab.className='rab';
        var hasReact=false;
        for(var em in msg.reactions){
            var users=msg.reactions[em];
            if(users&&users.length>0){
                hasReact=true;
                var rb=document.createElement('button');
                rb.textContent=em;
                rb.onclick=function(emoji,msgId){return function(){toggleReaction(msgId,emoji);};}(em,msg.id);
                var cnt=document.createElement('span');cnt.className='rcnt';cnt.textContent=users.length;
                rb.appendChild(cnt);
                rab.appendChild(rb);
            }
        }
        if(hasReact)content.appendChild(rab);
    }
    // Add reaction button
    var reactBtn=document.createElement('button');reactBtn.className='react-add-btn';
    reactBtn.innerHTML='<i class="far fa-smile"></i>';
    reactBtn.title='Adicionar reação';
    reactBtn.onclick=function(e){e.stopPropagation();openReactionPicker(msg.id,e);};
    content.appendChild(reactBtn);
    bubble.appendChild(content);
    list.appendChild(bubble);
}

// ===== GROUP INFO =====
window.openGroupInfo=function(){
    if(groupData){
        renderModalInfo(groupData);
        document.getElementById('groupInfoModal').classList.add('sh');
    }
};
window.closeGroupInfo=function(){document.getElementById('groupInfoModal').classList.remove('sh');};
document.getElementById('groupInfoModal').addEventListener('click',function(e){if(e.target===this)closeGroupInfo();});

// ===== INVITE LINK =====
window.copyInviteLink=function(){
    var code=groupData?groupData.inviteCode:'';
    if(!code&&groupData&&groupData.id)code=groupData.id;
    if(!code)return;
    var link=window.location.origin+'/GRUPOSWHATSS/group-chat.html?code='+encodeURIComponent(code);
    if(navigator.clipboard){navigator.clipboard.writeText(link).then(function(){
        document.getElementById('inviteBadge').textContent='Copiado!';
        setTimeout(function(){document.getElementById('inviteBadge').textContent='Copiar';},2000);
    });}else{alert('Link de convite: '+link);}
};

// ===== LEAVE GROUP =====
window.leaveGroup=function(){
    if(!confirm('Tem certeza que deseja sair do grupo "'+(groupData?groupData.name:'')+'"?'))return;
    ensureAuth().then(function(){
        return db.collection('groups').doc(groupId).update({
            members:firebase.firestore.FieldValue.arrayRemove(myUid)
        });
    }).then(function(){
        db.collection('chatConversations').doc('group_'+groupId).delete().catch(function(){});
        db.collection('groupMessages').add({
            groupId:groupId,type:'system',
            text:myNick+' saiu do grupo.',
            username:'Sistema',uid:'system',
            timestamp:firebase.firestore.FieldValue.serverTimestamp()
        }).catch(function(){});
        window.location.href='inbox.html';
    }).catch(function(e){console.error(e);alert('Erro ao sair do grupo.');});
};

// ===== REMOVE MEMBER (admin) =====
function removeMember(uid){
    if(!confirm('Remover este membro do grupo?'))return;
    ensureAuth().then(function(){
        return db.collection('groups').doc(groupId).update({
            members:firebase.firestore.FieldValue.arrayRemove(uid)
        });
    }).then(function(){
        db.collection('groupMessages').add({
            groupId:groupId,type:'system',
            text:'Um membro foi removido do grupo.',
            username:'Sistema',uid:'system',
            timestamp:firebase.firestore.FieldValue.serverTimestamp()
        }).catch(function(){});
        closeGroupInfo();
        loadGroupData().then(function(data){renderModalInfo(data);});
    }).catch(function(e){console.error(e);alert('Erro ao remover membro.');});
}

// ===== CLOSE PICKERS ON OUTSIDE CLICK =====
document.addEventListener('click',function(e){
    if(!e.target.closest('#reactionPicker')&&!e.target.closest('.react-add-btn')){
        document.getElementById('reactionPicker').classList.remove('sh');
    }
});

// ===== FULL IMAGE =====
window.openFullImg=function(src){
    document.getElementById('fullImgView').src=src;
    document.getElementById('fullImgModal').classList.add('sh');
};
window.closeFullImg=function(){document.getElementById('fullImgModal').classList.remove('sh');};

// ===== ATTACH =====
window.toggleAttach=function(){
    var ap=document.getElementById('attachPopup');
    ap.classList.toggle('sh');
};
window.closeAttach=function(){document.getElementById('attachPopup').classList.remove('sh');};
document.addEventListener('click',function(e){
    if(!e.target.closest('#attachPopup')&&!e.target.closest('#clipBtn')){
        document.getElementById('attachPopup').classList.remove('sh');
    }
});

// ===== PROFILES =====
var profilesCache={};
function loadProfileFresh(uid){
    if(profilesCache[uid])return Promise.resolve(profilesCache[uid]);
    return db.collection('chatProfiles').doc(uid).get().then(function(s){
        if(s.exists){profilesCache[uid]=s.data();return s.data();}return null;
    }).catch(function(){return null;});
}

// ===== NICK CHECK =====
if(!myNick){
    var n=prompt('Digite seu nome para entrar no grupo:');
    if(n&&n.trim().length>=2){myNick=n.trim();localStorage.setItem('gw_chat_nick',myNick);}
    else{window.location.href='inbox.html';return;}
}

// ===== START =====
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',initApp);}else{initApp();}
})();
