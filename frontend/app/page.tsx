'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import {
  createRoom,
  fetchFriends, sendFriendRequest, acceptFriendRequest, removeFriend, searchUsers,
  fetchLeaderboard, fetchProfile,
  type FriendEntry, type FriendList, type LeaderboardEntry, type ProfileData,
} from '@/lib/api';
import { SERVER_HTTP } from '@/lib/constants';

// ─── GAME SCRIPT ─────────────────────────────────────────────────────────────
// 1280×720 pixel-art world: 4 brick-walled rooms with doorways, real CC0 tiles
// (Kenney RPG Urban Pack) + procedural character/bookshelves. Camera follows &
// zooms. IMPORTANT: no backticks or ${} inside — string concatenation only.
// ─────────────────────────────────────────────────────────────────────────────
const GAME_SCRIPT = `
(function(){
  if(window.__homeWorldStarted)return;
  window.__homeWorldStarted=true;

  var WW=960, WH=700, TS=16, CH_SCALE=0.72;

  /* ── ONE cozy home, fully shown on screen. Four furnished sections
     (Library, Leaderboard, Home, Friends) share a single open room,
     delineated by area rugs rather than walls. ───────────────────── */
  var WALL=180; /* orange-brick fill tile */

  /* Section labels, pinned to the four corners of the room. */
  var AREAS=[
    {label:'LIBRARY',     lc:0xe8d5b0, x:34,    y:34,    ox:0, oy:0},
    {label:'LEADERBOARD', lc:0xc084fc, x:WW-34, y:34,    ox:1, oy:0},
    {label:'HOME',        lc:0xf5c842, x:34,    y:WH-34, ox:0, oy:1},
    {label:'FRIENDS',     lc:0x4ade80, x:WW-34, y:WH-34, ox:1, oy:1},
  ];

  /* Area rugs that softly mark each section: {x,y,w,h,c} */
  var RUGS=[
    {x:58,  y:96,  w:330, h:210, c:0x8a6a3a}, /* LIBRARY  — parchment/gold */
    {x:572, y:96,  w:330, h:210, c:0x6a4a9a}, /* LEADERBOARD — purple     */
    {x:58,  y:392, w:330, h:250, c:0x9a3a1a}, /* HOME — warm red          */
    {x:572, y:392, w:330, h:250, c:0x2a7a44}, /* FRIENDS — green          */
  ];

  /* Furniture as tiles: {x,y centre, f:frame, s:scale} */
  var FURN=[
    /* LIBRARY (top-left) */
    {x:250,y:48,  f:359, s:2.0}, /* notice board on top wall  */
    {x:170,y:210, f:273, s:1.6}, {x:300,y:214, f:276, s:1.6}, {x:64,y:296, f:237, s:1.4},
    /* LEADERBOARD (top-right) */
    {x:720,y:48,  f:359, s:2.2}, /* rank board on top wall    */
    {x:820,y:214, f:273, s:1.6}, {x:902,y:300, f:235, s:1.7},
    /* HOME (bottom-left) */
    {x:96, y:470, f:303, s:1.9}, {x:178,y:458, f:272, s:1.7},
    {x:96, y:620, f:273, s:1.5}, {x:322,y:462, f:237, s:1.4},
    /* FRIENDS (bottom-right) */
    {x:712,y:466, f:270, s:1.9}, {x:712,y:542, f:276, s:1.5},
    {x:632,y:618, f:273, s:1.4}, {x:798,y:618, f:273, s:1.4},
    {x:888,y:472, f:359, s:1.9}, {x:904,y:560, f:235, s:1.6}, {x:612,y:466, f:237, s:1.4},
  ];

  /* Brick walls: outer ring only — it is a single open room. */
  var TW=24;
  var WALLS=[
    {x:0,y:0,w:WW,h:TW}, {x:0,y:WH-TW,w:WW,h:TW}, {x:0,y:0,w:TW,h:WH}, {x:WW-TW,y:0,w:TW,h:WH},
  ];

  /* Procedural bookshelves along the library's top wall: {x,y,w} */
  var SHELVES=[
    {x:42,y:30,w:78}, {x:128,y:30,w:78}, {x:330,y:30,w:78},
  ];

  /* Interaction zones (centres within the single room) */
  var ZONES=[
    {id:'notice-board', x:250, y:78,  r:60, label:'[E] Library Rooms'},
    {id:'reception',    x:300, y:214, r:58, label:'[E] New Room'},
    {id:'ranking-board',x:720, y:78,  r:64, label:'[E] Leaderboard'},
    {id:'wardrobe',     x:178, y:466, r:60, label:'[E] Wardrobe'},
    {id:'my-stats',     x:96,  y:610, r:58, label:'[E] My Stats'},
    {id:'add-friend',   x:888, y:480, r:60, label:'[E] Add Friend'},
    {id:'big-door',     x:480, y:78,  r:60, label:'ENTER LIBRARY'},
  ];

  /* ── Colour helpers ─────────────────────────────────────────────── */
  function lig(c){return(Math.min(255,(c>>16&0xff)+55)<<16)|(Math.min(255,(c>>8&0xff)+55)<<8)|Math.min(255,(c&0xff)+55);}
  function drk(c){return(Math.max(0,(c>>16&0xff)-40)<<16)|(Math.max(0,(c>>8&0xff)-40)<<8)|Math.max(0,(c&0xff)-40);}
  function h2i(h){return parseInt((h||'f59e0b').replace('#',''),16);}

  /* ── 4-direction top-down character ────────────────────────────── */
  function drawCharacter(g,app,dir,lp,isMe){
    g.clear();
    var hl=lig(app.shirt),dk=drk(app.shirt),skinDk=drk(app.skin),sw=Math.sin(lp);
    var fem=app.gender==='female';
    g.fillStyle(0x000000,0.22);g.fillEllipse(0,14,22,6);
    var fwd=dir==='right'?1:dir==='left'?-1:0;
    g.fillStyle(app.pants,1);
    if(dir==='left'||dir==='right'){g.fillEllipse(-3*fwd+sw*4,11,9,12);g.fillEllipse(4*fwd-sw*4,11,9,12);}
    else{g.fillEllipse(-5+sw*4,10,8,12);g.fillEllipse(5-sw*4,10,8,12);}
    g.fillStyle(app.shoes,1);
    if(dir==='left'||dir==='right'){g.fillEllipse(-3*fwd+sw*4,17,8,5);g.fillEllipse(4*fwd-sw*4,17,8,5);}
    else{g.fillEllipse(-5+sw*4,16,8,5);g.fillEllipse(5-sw*4,16,8,5);}
    g.fillStyle(dk,1);
    if(dir==='down'){g.fillEllipse(-11,-1+sw*3,8,14);}
    else if(dir==='up'){g.fillEllipse(11,-1-sw*3,8,14);}
    else{g.fillEllipse(-9*fwd,-1-sw*3,8,14);}
    g.fillStyle(app.shirt,1);g.fillRoundedRect(-9,-10,18,18,4);
    g.fillStyle(hl,0.18);g.fillRoundedRect(-7,-9,7,8,3);
    g.fillStyle(app.shirt,1);
    if(dir==='down'){g.fillEllipse(11,-1-sw*3,8,14);}
    else if(dir==='up'){g.fillEllipse(-11,-1+sw*3,8,14);}
    else{g.fillEllipse(9*fwd,-1+sw*3,8,14);}
    g.fillStyle(app.skin,1);g.fillEllipse(0,-11,7,5);g.fillCircle(0,-20,10);
    g.fillStyle(skinDk,0.2);g.fillCircle(0,-18,10);
    g.fillStyle(app.skin,1);g.fillCircle(0,-21,9);
    g.fillStyle(app.hair,1);
    if(fem){g.fillEllipse(0,-28,22,12);g.fillEllipse(-11,-21,11,20);g.fillEllipse(11,-21,11,20);}
    else{g.fillEllipse(0,-28,18,10);g.fillEllipse(-8,-24,7,10);g.fillEllipse(8,-24,7,10);}
    if(dir==='down'){g.fillStyle(0x1a0a00,1);g.fillCircle(-3,-21,2.2);g.fillCircle(3,-21,2.2);g.fillStyle(0xffffff,0.9);g.fillCircle(-2.2,-22,1);g.fillCircle(3.8,-22,1);}
    else if(dir==='left'||dir==='right'){var ex=dir==='right'?3:-3;g.fillStyle(0x1a0a00,1);g.fillCircle(ex,-21,2.2);g.fillStyle(0xffffff,0.9);g.fillCircle(ex+0.8,-22,1);}
    if(isMe){g.lineStyle(2,0xf5c842,1);g.strokeCircle(0,-20,13);}
  }

  /* ── Single wood floor + section rugs + outer walls ─────────────── */
  function buildWorld(sc){
    /* one warm wood floor across the whole home */
    sc.add.tileSprite(0,0,WW,WH,'tiles',82).setOrigin(0,0).setDepth(0);
    sc.add.rectangle(0,0,WW,WH,0x140a02,0.16).setOrigin(0,0).setDepth(1); /* cozy warmth */
    /* area rugs delineate the four sections (no inner walls) */
    RUGS.forEach(function(r){
      var g=sc.add.graphics();g.setDepth(2);
      g.fillStyle(r.c,0.30);g.fillRoundedRect(r.x,r.y,r.w,r.h,20);
      g.lineStyle(3,r.c,0.55);g.strokeRoundedRect(r.x,r.y,r.w,r.h,20);
      g.lineStyle(1,0xf5e8c0,0.10);g.strokeRoundedRect(r.x+6,r.y+6,r.w-12,r.h-12,16);
    });
    sc._walls=sc.physics.add.staticGroup();
    WALLS.forEach(function(w){
      sc.add.tileSprite(w.x,w.y,w.w,w.h,'tiles',WALL).setOrigin(0,0).setDepth(w.y+w.h);
      sc.add.rectangle(w.x,w.y,w.w,2,0xffe9b0,0.10).setOrigin(0,0).setDepth(w.y+w.h+0.1);
      sc.add.rectangle(w.x,w.y+w.h-2,w.w,2,0x000000,0.30).setOrigin(0,0).setDepth(w.y+w.h+0.1);
      var body=sc.add.rectangle(w.x+w.w/2,w.y+w.h/2,w.w,w.h);
      sc.physics.add.existing(body,true);
      sc._walls.add(body);
    });
  }

  /* ── Furniture (real pixel-art tiles) ───────────────────────────── */
  function placeFurniture(sc){
    FURN.forEach(function(f){
      sc.add.ellipse(f.x,f.y+7*f.s,15*f.s,6*f.s,0x000000,0.22).setDepth(f.y-1);
      sc.add.image(f.x,f.y,'tiles',f.f).setScale(f.s).setDepth(f.y);
    });
  }

  /* ── Procedural props (library identity + leaderboard) ──────────── */
  function drawProps(sc){
    var bk=[0xc84020,0xf5c842,0x2060a0,0x20a050,0xa040c0,0xe06020,0x60a020,0x8040c0];
    SHELVES.forEach(function(s){
      var g=sc.add.graphics();g.setDepth(s.y+38);
      var x=s.x,y=s.y,w=s.w,h=46;
      g.fillStyle(0x000000,0.25);g.fillRect(x+3,y+h-3,w,5);
      g.fillStyle(0x3a2410,1);g.fillRect(x,y,w,h);
      g.lineStyle(2,0x5c3a18,1);g.strokeRect(x,y,w,h);
      g.fillStyle(0x1d1006,1);g.fillRect(x+3,y+3,w-6,h-6);
      var rows=[y+4,y+23];
      for(var ri=0;ri<2;ri++){
        var bx=x+5;
        while(bx<x+w-7){var bw=4+((bx+ri)%3);var bh=14-((bx*2+ri)%4);g.fillStyle(bk[(bx+ri)%8],0.95);g.fillRect(bx,rows[ri]+(16-bh),bw,bh);bx+=bw+1;}
        g.fillStyle(0x5c3a18,1);g.fillRect(x+3,rows[ri]+16,w-6,2);
      }
    });
    /* leaderboard podium + trophies (top-right) */
    var px=648,py=150,pg=sc.add.graphics();pg.setDepth(py+70);
    pg.fillStyle(0x000000,0.25);pg.fillEllipse(px+62,py+80,160,22);
    pg.fillStyle(0xc8c8c8,1);pg.fillRect(px,py+32,42,52);
    pg.fillStyle(0xf5c842,1);pg.fillRect(px+46,py+10,42,74);
    pg.fillStyle(0xcd7f32,1);pg.fillRect(px+92,py+46,42,38);
    pg.lineStyle(1,0x000000,0.3);pg.strokeRect(px,py+32,42,52);pg.strokeRect(px+46,py+10,42,74);pg.strokeRect(px+92,py+46,42,38);
    var tg=sc.add.graphics();tg.setDepth(72);
    [0xf5c842,0xc8c8c8,0xcd7f32].forEach(function(c,i){var tx=636+i*26,ty=104;tg.fillStyle(c,1);tg.fillEllipse(tx,ty,16,12);tg.fillRect(tx-2,ty,4,7);tg.fillRect(tx-7,ty+7,14,3);});
    /* library notice-board notes (over board tile ~250,48) */
    var nb=sc.add.graphics();nb.setDepth(48+18);
    nb.fillStyle(0xf5e0b0,0.95);nb.fillRect(234,40,16,12);
    nb.fillStyle(0xd0e0f5,0.95);nb.fillRect(253,42,15,11);
    nb.fillStyle(0xf0d0d0,0.95);nb.fillRect(240,56,15,9);
    /* leaderboard rank-board bars (over board tile ~720,48) */
    var rb=sc.add.graphics();rb.setDepth(48+18);
    [0xf5c842,0xc8c8c8,0xcd7f32,0xa78bfa,0x8b7bd8].forEach(function(c,i){rb.fillStyle(c,0.92);rb.fillRect(697,36+i*8,54,5);});
    /* friends add-board "+" (over board tile ~888,472) */
    var ab=sc.add.graphics();ab.setDepth(472+18);
    ab.fillStyle(0x4ade80,0.92);ab.fillRect(886,464,4,20);ab.fillRect(878,472,20,4);
  }

  /* ── Big library door (tile + animated glow) ────────────────────── */
  function drawBigDoor(sc){
    var dx=WW/2,dy=34;
    sc._doorGlow=sc.add.graphics();sc._doorGlow.setDepth(dy+40);sc._doorGlowT=0;
    sc.add.image(dx,dy,'tiles',339).setScale(3.2).setDepth(dy+50);
  }

  /* ── Scene ──────────────────────────────────────────────────────── */
  var HomeScene={
    key:'HomeWorld',
    preload:function(){
      this.load.spritesheet('tiles','/assets/tiles/rpg-urban.png',{frameWidth:16,frameHeight:16});
    },
    create:function(){
      var sc=this;
      sc.cameras.main.setBackgroundColor('#0b0600');
      sc.physics.world.setBounds(0,0,WW,WH);

      /* tiled floors + brick walls */
      buildWorld(sc);

      /* section labels pinned to the four corners */
      AREAS.forEach(function(a){
        var hex='#'+a.lc.toString(16).padStart(6,'0');
        sc.add.text(a.x,a.y,a.label,{
          fontFamily:"'Space Mono',monospace",fontSize:'11px',fontStyle:'bold',
          color:hex,backgroundColor:'rgba(0,0,0,0.6)',padding:{x:6,y:3}
        }).setDepth(8000).setOrigin(a.ox,a.oy).setAlpha(0.92);
      });

      /* furniture tiles + procedural props */
      placeFurniture(sc);
      drawProps(sc);

      /* big library door */
      drawBigDoor(sc);

      /* always-visible little signs above each interaction spot */
      var ys={fontFamily:"'Space Mono',monospace",fontSize:'8px',color:'#f5c842',backgroundColor:'rgba(0,0,0,0.6)',padding:{x:4,y:2}};
      var ys2={fontFamily:"'Space Mono',monospace",fontSize:'8px',color:'#e8d5b0',backgroundColor:'rgba(0,0,0,0.55)',padding:{x:4,y:2}};
      sc.add.text(250, 70,'LIBRARY ROOMS',ys).setDepth(8000).setOrigin(0.5,1);
      sc.add.text(300, 192,'NEW ROOM',ys2).setDepth(8000).setOrigin(0.5,1);
      sc.add.text(720, 70,'LEADERBOARD',ys).setDepth(8000).setOrigin(0.5,1);
      sc.add.text(178, 432,'WARDROBE',ys2).setDepth(8000).setOrigin(0.5,1);
      sc.add.text(96,  588,'MY STATS',ys2).setDepth(8000).setOrigin(0.5,1);
      sc.add.text(888, 448,'ADD FRIEND',ys2).setDepth(8000).setOrigin(0.5,1);
      sc._doorSign=sc.add.text(WW/2,96,'▲  ENTER LIBRARY  ▲',{
        fontFamily:"'Space Mono',monospace",fontSize:'11px',color:'#f5c842',
        backgroundColor:'rgba(0,0,0,0.75)',padding:{x:8,y:5}
      }).setDepth(8000).setOrigin(0.5,0);
      sc._doorSignT=0;

      /* player */
      sc._app={
        gender:localStorage.getItem('sl_gender')||'male',
        skin:  h2i(localStorage.getItem('sl_skin')  ||'#f5c5a3'),
        hair:  h2i(localStorage.getItem('sl_hair')  ||'#1a0a00'),
        shirt: h2i(localStorage.getItem('sl_shirt') ||'#f59e0b'),
        pants: h2i(localStorage.getItem('sl_pants') ||'#1e2a4a'),
        shoes: h2i(localStorage.getItem('sl_shoes') ||'#1a1008'),
      };
      var spawnX=WW/2,spawnY=WH/2+30;
      sc._pG=sc.add.graphics();sc._pG.setDepth(spawnY);sc._pG.setScale(CH_SCALE);
      drawCharacter(sc._pG,sc._app,'down',0,true);
      var pName=localStorage.getItem('sl_display')||localStorage.getItem('sl_name')||'You';
      sc._nameTag=sc.add.text(0,0,pName,{
        fontFamily:"'Space Mono',monospace",fontSize:'9px',color:'#f5c842',
        backgroundColor:'rgba(0,0,0,0.55)',padding:{x:4,y:2}
      }).setDepth(9998).setOrigin(0.5,1);

      sc._player=sc.physics.add.image(spawnX,spawnY,'');
      sc._player.setVisible(false);sc._player.setCollideWorldBounds(true);
      sc._player.body.setCircle(8,0,0);sc._player.setDepth(spawnY);

      /* walls block the player */
      sc.physics.add.collider(sc._player,sc._walls);

      /* whole home shown at once — static camera, no follow/zoom */
      sc.cameras.main.setBounds(0,0,WW,WH);
      sc.cameras.main.roundPixels=true;
      sc.cameras.main.centerOn(WW/2,WH/2);

      /* keyboard */
      sc._keys=sc.input.keyboard.addKeys({
        up:Phaser.Input.Keyboard.KeyCodes.W,    down:Phaser.Input.Keyboard.KeyCodes.S,
        left:Phaser.Input.Keyboard.KeyCodes.A,  right:Phaser.Input.Keyboard.KeyCodes.D,
        up2:Phaser.Input.Keyboard.KeyCodes.UP,  down2:Phaser.Input.Keyboard.KeyCodes.DOWN,
        left2:Phaser.Input.Keyboard.KeyCodes.LEFT,right2:Phaser.Input.Keyboard.KeyCodes.RIGHT,
        interact:Phaser.Input.Keyboard.KeyCodes.E,
      });
      sc.input.keyboard.disableGlobalCapture();
      sc._dir='down';sc._lp=0;sc._bigDoorFading=false;

      sc._eLabel=sc.add.text(0,0,'',{
        fontFamily:"'Space Mono',monospace",fontSize:'9px',color:'#f5c842',
        backgroundColor:'rgba(0,0,0,0.7)',padding:{x:5,y:3}
      }).setDepth(9999).setVisible(false).setOrigin(0.5,1);

      window.addEventListener('sl:panelClosed',function(){sc.input.keyboard.disableGlobalCapture();});
      window.addEventListener('sl:appChanged',function(ev){
        var a=ev.detail;
        sc._app={gender:a.gender,skin:h2i(a.skin),hair:h2i(a.hair),shirt:h2i(a.shirt),pants:h2i(a.pants),shoes:h2i(a.shoes)};
        drawCharacter(sc._pG,sc._app,sc._dir,sc._lp,true);
      });
    },

    update:function(time,delta){
      var sc=this;
      if(sc._bigDoorFading)return;
      var k=sc._keys,speed=130,vx=0,vy=0;
      var typing=document.activeElement&&(document.activeElement.tagName==='INPUT'||document.activeElement.tagName==='TEXTAREA');
      if(!typing){
        if(k.left.isDown||k.left2.isDown){vx=-speed;sc._dir='left';}
        else if(k.right.isDown||k.right2.isDown){vx=speed;sc._dir='right';}
        if(k.up.isDown||k.up2.isDown){vy=-speed;sc._dir='up';}
        else if(k.down.isDown||k.down2.isDown){vy=speed;sc._dir='down';}
        if(vx&&vy){vx*=0.707;vy*=0.707;}
      }
      sc._player.setVelocity(vx,vy);
      if(vx!==0||vy!==0)sc._lp+=delta*0.004;
      sc._pG.setPosition(sc._player.x,sc._player.y);
      sc._pG.setDepth(sc._player.y+10);
      drawCharacter(sc._pG,sc._app,sc._dir,sc._lp,true);
      sc._nameTag.setPosition(sc._player.x,sc._player.y-28);

      /* zone proximity */
      var nearest=null,nearestDist=99999;
      ZONES.forEach(function(z){
        var dx=sc._player.x-z.x,dy=sc._player.y-z.y,dist=Math.sqrt(dx*dx+dy*dy);
        if(dist<z.r&&dist<nearestDist){nearest=z;nearestDist=dist;}
      });
      if(nearest){
        sc._eLabel.setText(nearest.label).setPosition(sc._player.x,sc._player.y-44).setVisible(true);
        sc._eLabel.setAlpha(0.7+0.3*Math.sin(time*0.006));
        if(!typing&&Phaser.Input.Keyboard.JustDown(k.interact)){
          if(nearest.id==='big-door'){sc._enterLibrary();}
          else{window.dispatchEvent(new CustomEvent('sl:interact',{detail:{type:nearest.id}}));}
        }
      } else {sc._eLabel.setVisible(false);}

      /* big door auto-trigger (top wall, centre) */
      var ddx=sc._player.x-WW/2,ddy=sc._player.y-46;
      if(Math.sqrt(ddx*ddx+ddy*ddy)<34&&!sc._bigDoorFading)sc._enterLibrary();

      /* door glow + sign pulse */
      sc._doorGlowT+=delta;
      var gi=0.16+0.13*Math.sin(sc._doorGlowT*0.003);
      sc._doorGlow.clear();sc._doorGlow.fillStyle(0xf5c842,gi);
      sc._doorGlow.fillEllipse(WW/2,64,96,34);
      sc._doorSign.setAlpha(0.72+0.28*Math.sin(sc._doorGlowT*0.004));
    },

    _enterLibrary:function(){
      var sc=this;if(sc._bigDoorFading)return;sc._bigDoorFading=true;
      sc.cameras.main.fadeOut(500,0,0,0);
      sc.cameras.main.once('camerafadeoutcomplete',function(){window.location.href='/game';});
    },
  };

  var BootScene={key:'Boot',preload:function(){},create:function(){
    var t=this.add.text(-999,-999,'a',{fontFamily:"'Space Mono',monospace",fontSize:'1px'});
    this.time.delayedCall(100,function(){t.destroy();this.scene.start('HomeWorld');},null,this);
  }};

  new Phaser.Game({
    type:Phaser.AUTO,backgroundColor:'#0b0600',parent:'home-world-container',
    pixelArt:true,roundPixels:true,
    physics:{default:'arcade',arcade:{gravity:{y:0},debug:false}},
    scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH,width:WW,height:WH},
    scene:[BootScene,HomeScene],
  });
})();
`;

// ─── Design tokens ────────────────────────────────────────────────────────────
const mono = "'Space Mono', monospace";
const serif = "var(--font-cinzel, 'Cinzel', serif)";

// ─── Colour palettes ──────────────────────────────────────────────────────────
const SKIN_TONES   = ['#fde8d0','#f5c5a3','#d4956e','#c07a4a','#8b5e3c','#5c3317'];
const HAIR_COLORS  = ['#1a0a00','#3d1f0a','#7a4520','#d4a62a','#8b2500','#c8c8c8','#1e4a8b','#6b21a8'];
const SHIRT_COLORS = ['#f59e0b','#7c3aed','#0891b2','#dc2626','#16a34a','#db2777','#2563eb','#ea580c'];
const PANTS_COLORS = ['#1e2a4a','#1a1a2e','#4a2c0e','#8b7355','#1a3a1a','#3a3a4a'];
const SHOE_COLORS  = ['#1a1008','#5c3317','#e8e8e8','#8b0000'];

interface CharApp { gender:string; skin:string; hair:string; shirt:string; pants:string; shoes:string; }

function hexN(h:string):number{ return parseInt((h||'f59e0b').replace('#',''),16); }
function lig2(c:number):number{ return(Math.min(255,(c>>16&0xff)+55)<<16)|(Math.min(255,(c>>8&0xff)+55)<<8)|Math.min(255,(c&0xff)+55); }
function hexRgb2(n:number,a=1):string{ const r=(n>>16)&0xff,g=(n>>8)&0xff,b=n&0xff; return a<1?`rgba(${r},${g},${b},${a})`:`rgb(${r},${g},${b})`; }

function drawPreview(canvas:HTMLCanvasElement, app:CharApp){
  const ctx=canvas.getContext('2d') as CanvasRenderingContext2D;
  if(!ctx)return;
  const W=canvas.width,H=canvas.height;
  ctx.clearRect(0,0,W,H);
  const shirt=hexN(app.shirt),hair=hexN(app.hair),skin=hexN(app.skin),pants=hexN(app.pants),shoes=hexN(app.shoes);
  const hl=lig2(shirt);const isFemale=app.gender==='female';
  ctx.save();ctx.translate(W/2,H*0.62);ctx.scale(2.2,2.2);
  const el=(x:number,y:number,w:number,h:number)=>{ctx.beginPath();ctx.ellipse(x,y,w/2,h/2,0,0,Math.PI*2);ctx.fill();};
  const ci=(x:number,y:number,r:number)=>{ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();};
  const rr=(x:number,y:number,w:number,h:number,r:number)=>{ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();ctx.fill();};
  ctx.fillStyle='rgba(0,0,0,0.22)';el(0,20,26,8);
  ctx.fillStyle=hexRgb2(pants);el(-6,13,10,14);el(6,13,10,14);
  ctx.fillStyle=hexRgb2(shoes);el(-6,20,10,6);el(6,20,10,6);
  ctx.fillStyle=hexRgb2(shirt);el(-14,-1,9,16);el(14,-1,9,16);
  ctx.fillStyle=hexRgb2(shirt);rr(-10,-10,20,20,5);
  ctx.fillStyle=hexRgb2(hl,0.2);rr(-8,-8,8,9,3);
  ctx.fillStyle=hexRgb2(skin);el(0,-12,8,6);ci(0,-22,11);
  ctx.fillStyle=hexRgb2(hair);
  if(isFemale){el(0,-30,24,13);el(-12,-22,12,22);el(12,-22,12,22);}
  else{el(0,-30,20,11);el(-9,-24,7,12);el(9,-24,7,12);}
  ctx.fillStyle='rgb(26,10,0)';ci(-3,-21,2.2);ci(3,-21,2.2);
  ctx.fillStyle='rgba(255,255,255,0.9)';ci(-2.2,-22,1);ci(3.8,-22,1);
  ctx.restore();
}

// ─── Panel shell ─────────────────────────────────────────────────────────────
function PanelShell({title,subtitle,accent='#f5c842',onClose,children}:{
  title:string; subtitle?:string; accent?:string; onClose:()=>void; children:React.ReactNode;
}){
  return(
    <motion.div initial={{x:'100%'}} animate={{x:0}} exit={{x:'100%'}}
      transition={{type:'tween',duration:0.2}}
      style={{position:'absolute',top:0,right:0,bottom:0,width:380,zIndex:500,
        background:'linear-gradient(180deg,#16080a 0%,#0e0600 100%)',
        borderLeft:`1px solid ${accent}28`,
        display:'flex',flexDirection:'column',overflow:'hidden',
        boxShadow:`-12px 0 40px rgba(0,0,0,0.6), inset 1px 0 0 ${accent}18`,
      }}>
      {/* Header */}
      <div style={{padding:'18px 20px 14px',borderBottom:`1px solid ${accent}18`,flexShrink:0,
        background:`linear-gradient(135deg,${accent}0c,transparent)`}}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
          <div>
            <div style={{fontFamily:serif,fontSize:16,fontWeight:700,color:accent,letterSpacing:'0.06em',lineHeight:1.2}}>{title}</div>
            {subtitle&&<div style={{fontFamily:mono,fontSize:9,color:'rgba(232,213,176,0.45)',marginTop:4,letterSpacing:'0.12em'}}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',
            color:'rgba(232,213,176,0.35)',fontSize:18,lineHeight:1,padding:'0 0 0 10px',
            transition:'color 0.15s'}}
            onMouseEnter={e=>(e.currentTarget.style.color='rgba(232,213,176,0.8)')}
            onMouseLeave={e=>(e.currentTarget.style.color='rgba(232,213,176,0.35)')}>✕</button>
        </div>
        {/* accent line */}
        <div style={{height:1,background:`linear-gradient(90deg,${accent},${accent}00)`,marginTop:12}}/>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'16px 20px'}}>{children}</div>
    </motion.div>
  );
}

// ─── Wardrobe panel ───────────────────────────────────────────────────────────
function Swatches({colors,value,onChange}:{colors:string[];value:string;onChange:(c:string)=>void}){
  return(
    <div style={{display:'flex',flexWrap:'wrap',gap:7}}>
      {colors.map(c=>(
        <button key={c} onClick={()=>onChange(c)} style={{
          width:24,height:24,borderRadius:'50%',background:c,border:'none',cursor:'pointer',padding:0,
          outline:value===c?'2px solid #f5c842':'2px solid transparent',outlineOffset:2,
          boxShadow:value===c?'0 0 8px rgba(245,200,66,0.5)':'none',
          transition:'box-shadow 0.15s, outline-offset 0.15s',
        }}/>
      ))}
    </div>
  );
}

function WardrobePanel({onClose}:{onClose:()=>void}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const [app,setApp]=useState<CharApp>({gender:'male',skin:'#f5c5a3',hair:'#1a0a00',shirt:'#f59e0b',pants:'#1e2a4a',shoes:'#1a1008'});
  useEffect(()=>{
    setApp({gender:localStorage.getItem('sl_gender')||'male',skin:localStorage.getItem('sl_skin')||'#f5c5a3',hair:localStorage.getItem('sl_hair')||'#1a0a00',shirt:localStorage.getItem('sl_shirt')||'#f59e0b',pants:localStorage.getItem('sl_pants')||'#1e2a4a',shoes:localStorage.getItem('sl_shoes')||'#1a1008'});
  },[]);
  useEffect(()=>{ if(canvasRef.current)drawPreview(canvasRef.current,app); },[app]);
  function setField(f:keyof CharApp,v:string){
    const next={...app,[f]:v};setApp(next);localStorage.setItem('sl_'+f,v);
    window.dispatchEvent(new CustomEvent('sl:appChanged',{detail:next}));
  }
  const Lbl=({s}:{s:string})=>(<div style={{fontFamily:mono,fontSize:8,letterSpacing:'0.16em',color:'rgba(232,213,176,0.4)',margin:'14px 0 7px',textTransform:'uppercase'}}>{s}</div>);
  return(
    <PanelShell title="Wardrobe" subtitle="CUSTOMISE YOUR SCHOLAR" accent="#f5c842" onClose={onClose}>
      <div style={{display:'flex',gap:16,marginBottom:16,alignItems:'center'}}>
        <div style={{background:'rgba(0,0,0,0.3)',borderRadius:10,padding:8,border:'1px solid rgba(245,200,66,0.12)',flexShrink:0}}>
          <canvas ref={canvasRef} width={80} height={110}/>
        </div>
        <div style={{flex:1}}>
          <div style={{fontFamily:mono,fontSize:9,color:'rgba(232,213,176,0.5)',letterSpacing:'0.12em',marginBottom:8}}>GENDER</div>
          <div style={{display:'flex',gap:8}}>
            {['male','female'].map(g=>(
              <button key={g} onClick={()=>setField('gender',g)} style={{
                flex:1,padding:'7px 0',fontFamily:mono,fontSize:9,cursor:'pointer',borderRadius:5,
                background:app.gender===g?'rgba(245,200,66,0.12)':'rgba(0,0,0,0.25)',
                border:app.gender===g?'1px solid rgba(245,200,66,0.5)':'1px solid rgba(255,255,255,0.06)',
                color:app.gender===g?'#f5c842':'rgba(232,213,176,0.4)',fontWeight:app.gender===g?700:400,
                transition:'all 0.15s',
              }}>{g.toUpperCase()}</button>
            ))}
          </div>
        </div>
      </div>
      <Lbl s="Skin Tone"/><Swatches colors={SKIN_TONES}  value={app.skin}  onChange={v=>setField('skin',v)}/>
      <Lbl s="Hair"/><Swatches colors={HAIR_COLORS}  value={app.hair}  onChange={v=>setField('hair',v)}/>
      <Lbl s="Clothing"/><Swatches colors={SHIRT_COLORS} value={app.shirt} onChange={v=>setField('shirt',v)}/>
      <Lbl s="Pants"/><Swatches colors={PANTS_COLORS} value={app.pants} onChange={v=>setField('pants',v)}/>
      <Lbl s="Shoes"/><Swatches colors={SHOE_COLORS}  value={app.shoes} onChange={v=>setField('shoes',v)}/>
    </PanelShell>
  );
}

// ─── Library panel ────────────────────────────────────────────────────────────
function LibraryPanel({onClose,onEnterGlobal,onCreate}:{onClose:()=>void;onEnterGlobal:()=>void;onCreate:()=>void}){
  const BigBtn=({icon,title,sub,accent,onClick}:{icon:string;title:string;sub:string;accent:string;onClick:()=>void})=>(
    <button onClick={onClick} style={{
      width:'100%',padding:'24px 20px',cursor:'pointer',textAlign:'left',marginBottom:14,
      background:`linear-gradient(135deg,${accent}0d,${accent}06)`,
      border:`1px solid ${accent}40`,borderRadius:14,transition:'all 0.2s',display:'flex',alignItems:'center',gap:18,
    }}
      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor=`${accent}80`;(e.currentTarget as HTMLElement).style.background=`linear-gradient(135deg,${accent}18,${accent}0a)`;}}
      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor=`${accent}40`;(e.currentTarget as HTMLElement).style.background=`linear-gradient(135deg,${accent}0d,${accent}06)`;}}>
      <span style={{fontSize:32,flexShrink:0}}>{icon}</span>
      <div>
        <div style={{fontFamily:serif,fontSize:16,color:accent,fontWeight:700,marginBottom:5}}>{title}</div>
        <div style={{fontFamily:mono,fontSize:9,color:'rgba(232,213,176,0.45)',letterSpacing:'0.1em'}}>{sub}</div>
      </div>
    </button>
  );
  return(
    <PanelShell title="Library" subtitle="WHERE SCHOLARS GATHER" accent="#f5c842" onClose={onClose}>
      <div style={{padding:'8px 0 4px'}}>
        <div style={{height:1,background:'linear-gradient(90deg,rgba(245,200,66,0.2),transparent)',marginBottom:24}}/>
        <BigBtn icon="📖" title="Enter Global Library" sub="JOIN THE GRAND HALL · ALWAYS OPEN" accent="#f5c842" onClick={onEnterGlobal}/>
        <BigBtn icon="🏛️" title="Create Library" sub="OPEN A PRIVATE STUDY CHAMBER" accent="#a78bfa" onClick={onCreate}/>
        <div style={{marginTop:10,fontFamily:mono,fontSize:8,color:'rgba(232,213,176,0.2)',textAlign:'center',letterSpacing:'0.12em'}}>
          Private chambers are visible only to invited scholars
        </div>
      </div>
    </PanelShell>
  );
}

// ─── Leaderboard panel ────────────────────────────────────────────────────────
interface LBEntry { name:string; displayName:string; weekly_secs:number; }
function LeaderboardPanel({onClose,username}:{onClose:()=>void;username:string}){
  const [board,setBoard]=useState<LBEntry[]>([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    fetch(SERVER_HTTP+'/leaderboard').then(r=>r.json()).then(d=>{setBoard(d||[]);setLoading(false);}).catch(()=>setLoading(false));
  },[]);
  function fmtH(s:number){const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h>0?h+'h '+String(m).padStart(2,'0')+'m':m+'m';}
  const max=board[0]?.weekly_secs||1;
  const MEDAL=['🥇','🥈','🥉'];
  const COLORS=['#f5c842','#c0c0c0','#cd7f32'];
  return(
    <PanelShell title="Leaderboard" subtitle="THIS WEEK'S TOP SCHOLARS" accent="#a78bfa" onClose={onClose}>
      {loading&&(
        <div style={{display:'flex',flexDirection:'column',gap:10,marginTop:8}}>
          {[0,1,2,3,4].map(i=><div key={i} style={{height:62,background:'rgba(167,139,250,0.05)',borderRadius:10,border:'1px solid rgba(167,139,250,0.1)',opacity:0.4+i*0.08}}/>)}
        </div>
      )}
      {!loading&&board.length===0&&(
        <div style={{textAlign:'center',padding:'48px 0'}}>
          <div style={{fontSize:32,marginBottom:12}}>🏆</div>
          <div style={{fontFamily:serif,fontSize:14,color:'rgba(232,213,176,0.4)'}}>No data yet</div>
          <div style={{fontFamily:mono,fontSize:9,color:'rgba(232,213,176,0.25)',marginTop:6}}>Start studying to appear here</div>
        </div>
      )}
      {board.slice(0,12).map((e,i)=>{
        const pct=Math.round((e.weekly_secs/max)*100);
        const isMe=e.name.toLowerCase()===username.toLowerCase();
        const accent=i<3?COLORS[i]:'#a78bfa';
        return(
          <div key={e.name} style={{
            marginBottom:10,padding:'12px 14px',borderRadius:10,
            background:isMe?'rgba(167,139,250,0.1)':'rgba(255,255,255,0.025)',
            border:`1px solid ${isMe?'rgba(167,139,250,0.4)':'rgba(255,255,255,0.06)'}`,
            position:'relative',overflow:'hidden',
          }}>
            {/* rank glow for top 3 */}
            {i<3&&<div style={{position:'absolute',top:0,left:0,right:0,height:1,background:`linear-gradient(90deg,${accent}60,${accent}00)`}}/>}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontFamily:mono,fontSize:i<3?16:10,minWidth:22,textAlign:'center'}}>{i<3?MEDAL[i]:'#'+(i+1)}</span>
                <div>
                  <div style={{fontFamily:serif,fontSize:12,color:isMe?'#c4b5fd':'#e8d5b0',fontWeight:700,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {e.displayName||e.name}
                    {isMe&&<span style={{fontFamily:mono,fontSize:8,color:'#a78bfa',marginLeft:6}}>(you)</span>}
                  </div>
                </div>
              </div>
              <div style={{fontFamily:mono,fontSize:11,color:accent,fontWeight:700,flexShrink:0}}>{fmtH(e.weekly_secs)}</div>
            </div>
            {/* progress bar */}
            <div style={{height:4,background:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden'}}>
              <motion.div initial={{width:0}} animate={{width:pct+'%'}} transition={{duration:0.8,delay:i*0.05,ease:'easeOut'}}
                style={{height:'100%',background:`linear-gradient(90deg,${accent}88,${accent})`,borderRadius:2}}/>
            </div>
            <div style={{fontFamily:mono,fontSize:8,color:'rgba(232,213,176,0.2)',marginTop:4,textAlign:'right'}}>{pct}% of top</div>
          </div>
        );
      })}
    </PanelShell>
  );
}

// ─── Stats panel ──────────────────────────────────────────────────────────────
interface ProfileStats { total_secs:number; weekly_secs:number; session_count:number; goal:string; displayName:string; bio:string; }
function StatsPanel({username,onClose}:{username:string;onClose:()=>void}){
  const [data,setData]=useState<ProfileStats|null>(null);
  useEffect(()=>{
    if(!username)return;
    fetch(SERVER_HTTP+'/profile/'+encodeURIComponent(username)).then(r=>r.json()).then(setData).catch(()=>{});
  },[username]);
  function fmtH(s:number){const h=Math.floor((s||0)/3600),m=Math.floor(((s||0)%3600)/60);return h>0?h+'h '+String(m).padStart(2,'0')+'m':m+'m';}
  const Metric=({label,value,sub,accent}:{label:string;value:string;sub?:string;accent:string})=>(
    <div style={{padding:'14px 16px',background:'rgba(255,255,255,0.025)',border:`1px solid ${accent}20`,borderRadius:10,position:'relative',overflow:'hidden'}}>
      <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${accent},${accent}00)`}}/>
      <div style={{fontFamily:mono,fontSize:8,color:`${accent}88`,letterSpacing:'0.16em',marginBottom:8}}>{label}</div>
      <div style={{fontFamily:serif,fontSize:22,fontWeight:700,color:accent,lineHeight:1}}>{value}</div>
      {sub&&<div style={{fontFamily:mono,fontSize:8,color:'rgba(232,213,176,0.3)',marginTop:6}}>{sub}</div>}
    </div>
  );
  return(
    <PanelShell title="My Stats" subtitle={username?('@'+username):''} accent="#4ade80" onClose={onClose}>
      {!username&&<div style={{fontFamily:mono,fontSize:9,color:'rgba(232,213,176,0.35)',textAlign:'center',padding:'40px 0'}}>Sign in to view your stats</div>}
      {username&&!data&&(
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
          {[0,1,2,3].map(i=><div key={i} style={{height:90,background:'rgba(74,222,128,0.03)',borderRadius:10,border:'1px solid rgba(74,222,128,0.08)',opacity:0.3+i*0.1}}/>)}
        </div>
      )}
      {data&&(
        <>
          <div style={{fontFamily:serif,fontSize:18,fontWeight:700,color:'#f5c842',marginBottom:4}}>{data.displayName||username}</div>
          <div style={{height:1,background:'linear-gradient(90deg,rgba(74,222,128,0.3),transparent)',marginBottom:16}}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
            <Metric label="THIS WEEK"   value={fmtH(data.weekly_secs)}   sub="Study time"    accent="#4ade80"/>
            <Metric label="ALL TIME"    value={fmtH(data.total_secs)}    sub="Total hours"   accent="#f5c842"/>
            <Metric label="SESSIONS"    value={String(data.session_count||0)} sub="Completed" accent="#a78bfa"/>
            <Metric label="AVG SESSION" value={data.session_count?(fmtH(Math.round((data.total_secs||0)/(data.session_count||1)))):'—'} sub="Per session" accent="#60a5fa"/>
          </div>
          {data.goal&&(
            <div style={{padding:'12px 14px',background:'rgba(245,200,66,0.05)',border:'1px solid rgba(245,200,66,0.15)',borderRadius:10,marginBottom:12}}>
              <div style={{fontFamily:mono,fontSize:8,color:'rgba(245,200,66,0.5)',letterSpacing:'0.14em',marginBottom:6}}>STUDY GOAL</div>
              <div style={{fontFamily:serif,fontSize:12,color:'#e8d5b0',lineHeight:1.6}}>{data.goal}</div>
            </div>
          )}
          {data.bio&&(
            <div style={{padding:'12px 14px',background:'rgba(255,255,255,0.025)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10}}>
              <div style={{fontFamily:mono,fontSize:8,color:'rgba(232,213,176,0.3)',letterSpacing:'0.14em',marginBottom:6}}>BIO</div>
              <div style={{fontFamily:mono,fontSize:10,color:'rgba(232,213,176,0.6)',lineHeight:1.7}}>{data.bio}</div>
            </div>
          )}
          <Link href="/profile" style={{display:'block',marginTop:14,padding:'10px 0',textAlign:'center',fontFamily:mono,fontSize:9,color:'#a78bfa',textDecoration:'none',background:'rgba(167,139,250,0.08)',border:'1px solid rgba(167,139,250,0.2)',borderRadius:8,letterSpacing:'0.1em',transition:'all 0.15s'}}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='rgba(167,139,250,0.15)';}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='rgba(167,139,250,0.08)';}}>
            EDIT PROFILE →
          </Link>
        </>
      )}
    </PanelShell>
  );
}

// ─── Friends panel ────────────────────────────────────────────────────────────
type FriendTab = 'friends'|'search'|'requests';
function FriendsPanel({username,onClose}:{username:string;onClose:()=>void}){
  const [tab,setTab]=useState<FriendTab>('friends');
  const [friends,setFriends]=useState<FriendList>({friends:[],sent:[],received:[],blocked:[]});
  const [loading,setLoading]=useState(true);
  const [searchQ,setSearchQ]=useState('');
  const [results,setResults]=useState<FriendEntry[]>([]);
  const [searching,setSearching]=useState(false);
  const [toast,setToast]=useState('');
  const toastRef=useRef<ReturnType<typeof setTimeout>>(null);
  const searchRef=useRef<ReturnType<typeof setTimeout>>(null);

  const notify=(m:string)=>{setToast(m);if(toastRef.current)clearTimeout(toastRef.current);toastRef.current=setTimeout(()=>setToast(''),2500);};

  const load=useCallback(async()=>{
    if(!username)return;
    try{const d=await fetchFriends(username);setFriends(d);}catch{}finally{setLoading(false);}
  },[username]);

  useEffect(()=>{load();},[load]);
  useEffect(()=>{const iv=setInterval(load,15000);return()=>clearInterval(iv);},[load]);

  useEffect(()=>{
    const q=searchQ.trim();
    if(q.length<2){setResults([]);return;}
    if(searchRef.current)clearTimeout(searchRef.current);
    setSearching(true);
    searchRef.current=setTimeout(async()=>{
      try{const r=await searchUsers(q,username);setResults(r);}catch{setResults([]);}finally{setSearching(false);}
    },350);
    return()=>{if(searchRef.current)clearTimeout(searchRef.current);};
  },[searchQ,username]);

  function rel(u:string):'none'|'friend'|'sent'|'received'|'blocked'{
    if(friends.friends.some(f=>f.username===u))return'friend';
    if(friends.sent.some(f=>f.username===u))return'sent';
    if(friends.received.some(f=>f.username===u))return'received';
    if(friends.blocked.some(f=>f.username===u))return'blocked';
    return'none';
  }

  async function add(u:string){try{await sendFriendRequest(username,u);notify('Request sent!');load();}catch(e:unknown){notify(e instanceof Error?e.message:'Failed');}}
  async function accept(u:string){try{await acceptFriendRequest(username,u);notify('Now friends!');load();}catch{notify('Failed');}}
  async function decline(u:string){try{await removeFriend(username,u);notify('Removed');load();}catch{}}

  const Chip=({active,label,count,onClick}:{active:boolean;label:string;count:number;onClick:()=>void})=>(
    <button onClick={onClick} style={{fontFamily:mono,fontSize:9,letterSpacing:'0.1em',padding:'5px 12px',
      borderRadius:4,cursor:'pointer',border:'none',
      background:active?'rgba(74,222,128,0.15)':'rgba(255,255,255,0.04)',
      color:active?'#4ade80':'rgba(232,213,176,0.35)',
      transition:'all 0.15s',display:'flex',alignItems:'center',gap:5}}>
      {label.toUpperCase()}
      {count>0&&<span style={{background:'rgba(74,222,128,0.2)',color:'#4ade80',borderRadius:8,fontSize:8,padding:'1px 5px'}}>{count}</span>}
    </button>
  );

  const Avatar=({name,size=32}:{name:string;size?:number})=>(
    <div style={{width:size,height:size,borderRadius:'50%',background:'rgba(74,222,128,0.1)',
      border:'1px solid rgba(74,222,128,0.2)',display:'flex',alignItems:'center',justifyContent:'center',
      fontFamily:mono,fontSize:size*0.35,fontWeight:700,color:'#4ade80',flexShrink:0}}>
      {(name||'?').slice(0,1).toUpperCase()}
    </div>
  );

  return(
    <PanelShell title="Friends" subtitle={username?('@'+username):''} accent="#4ade80" onClose={onClose}>
      {/* tabs */}
      <div style={{display:'flex',gap:6,marginBottom:16}}>
        <Chip active={tab==='friends'} label="Friends" count={friends.friends.length} onClick={()=>setTab('friends')}/>
        <Chip active={tab==='requests'} label="Requests" count={friends.received.length} onClick={()=>setTab('requests')}/>
        <Chip active={tab==='search'} label="Search" count={0} onClick={()=>setTab('search')}/>
      </div>

      {/* ── Friends tab ── */}
      {tab==='friends'&&(
        <>
          {loading&&<div style={{fontFamily:mono,fontSize:9,color:'rgba(232,213,176,0.3)',textAlign:'center',padding:'24px 0'}}>Loading…</div>}
          {!loading&&friends.friends.length===0&&(
            <div style={{textAlign:'center',padding:'32px 0'}}>
              <div style={{fontSize:28,marginBottom:10}}>👥</div>
              <div style={{fontFamily:serif,fontSize:13,color:'rgba(232,213,176,0.4)',marginBottom:6}}>No friends yet</div>
              <div style={{fontFamily:mono,fontSize:9,color:'rgba(232,213,176,0.25)',marginBottom:16}}>Search for scholars to add them</div>
              <button onClick={()=>setTab('search')} style={{fontFamily:mono,fontSize:9,cursor:'pointer',
                background:'rgba(74,222,128,0.1)',border:'1px solid rgba(74,222,128,0.3)',
                borderRadius:6,padding:'8px 18px',color:'#4ade80',letterSpacing:'0.08em'}}>
                FIND SCHOLARS
              </button>
            </div>
          )}
          {friends.friends.map(f=>(
            <div key={f.username} style={{display:'flex',alignItems:'center',gap:10,
              padding:'10px 12px',marginBottom:8,background:'rgba(255,255,255,0.025)',
              border:'1px solid rgba(255,255,255,0.06)',borderRadius:10}}>
              <Avatar name={f.displayName}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:serif,fontSize:12,color:'#e8d5b0',fontWeight:700,
                  overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.displayName}</div>
                <div style={{display:'flex',alignItems:'center',gap:6,marginTop:2}}>
                  <span style={{fontFamily:mono,fontSize:9,color:'rgba(232,213,176,0.35)'}}>@{f.username}</span>
                  {f.online&&<>
                    <span style={{width:5,height:5,borderRadius:'50%',background:'#4ade80',display:'inline-block',
                      boxShadow:'0 0 5px #4ade80'}}/>
                    <span style={{fontFamily:mono,fontSize:8,color:'#4ade80'}}>{f.roomLabel?'in '+f.roomLabel:'online'}</span>
                  </>}
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── Requests tab ── */}
      {tab==='requests'&&(
        <>
          {friends.received.length===0&&(
            <div style={{textAlign:'center',padding:'32px 0',fontFamily:mono,fontSize:9,color:'rgba(232,213,176,0.3)'}}>No pending requests</div>
          )}
          {friends.received.map(f=>(
            <div key={f.username} style={{display:'flex',alignItems:'center',gap:10,
              padding:'10px 12px',marginBottom:8,background:'rgba(74,222,128,0.04)',
              border:'1px solid rgba(74,222,128,0.15)',borderRadius:10}}>
              <Avatar name={f.displayName}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:serif,fontSize:12,color:'#e8d5b0',fontWeight:700}}>{f.displayName}</div>
                <div style={{fontFamily:mono,fontSize:9,color:'rgba(232,213,176,0.35)',marginTop:2}}>@{f.username}</div>
              </div>
              <div style={{display:'flex',gap:6}}>
                <button onClick={()=>accept(f.username)} style={{fontFamily:mono,fontSize:8,cursor:'pointer',
                  background:'rgba(74,222,128,0.15)',border:'1px solid rgba(74,222,128,0.4)',
                  borderRadius:4,padding:'5px 10px',color:'#4ade80'}}>✓</button>
                <button onClick={()=>decline(f.username)} style={{fontFamily:mono,fontSize:8,cursor:'pointer',
                  background:'rgba(248,113,113,0.08)',border:'1px solid rgba(248,113,113,0.25)',
                  borderRadius:4,padding:'5px 10px',color:'rgba(248,113,113,0.7)'}}>✕</button>
              </div>
            </div>
          ))}
          {friends.sent.length>0&&(
            <>
              <div style={{fontFamily:mono,fontSize:8,color:'rgba(232,213,176,0.2)',letterSpacing:'0.14em',margin:'14px 0 8px'}}>SENT</div>
              {friends.sent.map(f=>(
                <div key={f.username} style={{display:'flex',alignItems:'center',gap:10,
                  padding:'8px 12px',marginBottom:6,background:'rgba(255,255,255,0.02)',
                  border:'1px solid rgba(255,255,255,0.05)',borderRadius:8}}>
                  <Avatar name={f.displayName} size={26}/>
                  <div style={{flex:1,fontFamily:serif,fontSize:11,color:'rgba(232,213,176,0.5)',fontWeight:600}}>{f.displayName}</div>
                  <span style={{fontFamily:mono,fontSize:8,color:'rgba(251,146,60,0.6)',letterSpacing:'0.1em'}}>PENDING</span>
                </div>
              ))}
            </>
          )}
        </>
      )}

      {/* ── Search tab ── */}
      {tab==='search'&&(
        <>
          <div style={{position:'relative',marginBottom:14}}>
            <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Search @username…"
              style={{width:'100%',background:'rgba(0,0,0,0.35)',border:'1px solid rgba(74,222,128,0.2)',
                borderRadius:8,padding:'9px 12px 9px 36px',color:'#e8d5b0',fontSize:12,fontFamily:mono,
                outline:'none',boxSizing:'border-box'}}
              onFocus={e=>e.target.style.borderColor='rgba(74,222,128,0.5)'}
              onBlur={e=>e.target.style.borderColor='rgba(74,222,128,0.2)'}/>
            <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'rgba(74,222,128,0.4)',fontSize:14}}>⌕</span>
            {searching&&<span style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',fontFamily:mono,fontSize:9,color:'rgba(232,213,176,0.3)'}}>…</span>}
          </div>
          {results.map(u=>{
            const r=rel(u.username);
            return(
              <div key={u.username} style={{display:'flex',alignItems:'center',gap:10,
                padding:'10px 12px',marginBottom:8,background:'rgba(255,255,255,0.025)',
                border:'1px solid rgba(255,255,255,0.06)',borderRadius:10}}>
                <Avatar name={u.displayName}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:serif,fontSize:12,color:'#e8d5b0',fontWeight:700}}>{u.displayName}</div>
                  <div style={{fontFamily:mono,fontSize:9,color:'rgba(232,213,176,0.35)',marginTop:2}}>@{u.username}</div>
                </div>
                {r==='none'&&<button onClick={()=>add(u.username)} style={{fontFamily:mono,fontSize:8,cursor:'pointer',
                  background:'rgba(74,222,128,0.12)',border:'1px solid rgba(74,222,128,0.35)',
                  borderRadius:4,padding:'5px 10px',color:'#4ade80',whiteSpace:'nowrap'}}>+ ADD</button>}
                {r==='friend'&&<span style={{fontFamily:mono,fontSize:8,color:'#4ade80',letterSpacing:'0.1em'}}>FRIENDS</span>}
                {r==='sent'&&<span style={{fontFamily:mono,fontSize:8,color:'rgba(251,146,60,0.7)',letterSpacing:'0.1em'}}>PENDING</span>}
                {r==='received'&&<button onClick={()=>accept(u.username)} style={{fontFamily:mono,fontSize:8,cursor:'pointer',
                  background:'rgba(74,222,128,0.12)',border:'1px solid rgba(74,222,128,0.35)',
                  borderRadius:4,padding:'5px 10px',color:'#4ade80'}}>ACCEPT</button>}
              </div>
            );
          })}
          {searchQ.length>=2&&!searching&&results.length===0&&(
            <div style={{textAlign:'center',padding:'24px 0',fontFamily:mono,fontSize:9,color:'rgba(232,213,176,0.25)'}}>No scholars found</div>
          )}
          {searchQ.length<2&&<div style={{fontFamily:mono,fontSize:9,color:'rgba(232,213,176,0.2)',textAlign:'center',padding:'24px 0',letterSpacing:'0.1em'}}>TYPE AT LEAST 2 CHARACTERS</div>}
        </>
      )}

      {/* Toast */}
      <AnimatePresence>
        {toast&&(
          <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0}}
            style={{position:'absolute',bottom:16,left:16,right:16,background:'rgba(74,222,128,0.1)',
              border:'1px solid rgba(74,222,128,0.3)',borderRadius:8,padding:'8px 14px',
              fontFamily:mono,fontSize:10,color:'#4ade80',textAlign:'center'}}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </PanelShell>
  );
}

// ─── Create room modal ────────────────────────────────────────────────────────
function CreateModal({onClose}:{onClose:()=>void}){
  const [label,setLabel]=useState('');
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState('');
  async function submit(e:React.FormEvent){
    e.preventDefault();
    if(label.trim().length<2){setErr('Name too short');return;}
    setBusy(true);
    try{
      const name=localStorage.getItem('sl_display')||localStorage.getItem('sl_name')||'Scholar';
      const{roomId}=await createRoom(label.trim(),name);
      localStorage.setItem('sl_roomId',roomId);window.location.href='/game';
    }catch(ex:unknown){setErr(ex instanceof Error?ex.message:'Failed');setBusy(false);}
  }
  return(
    <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:600,backdropFilter:'blur(4px)'}}>
      <motion.div initial={{scale:0.96,opacity:0,y:10}} animate={{scale:1,opacity:1,y:0}} transition={{duration:0.18}}
        style={{background:'linear-gradient(160deg,#16080a,#0e0600)',border:'1px solid rgba(245,200,66,0.2)',borderRadius:14,padding:28,width:380,
          boxShadow:'0 24px 60px rgba(0,0,0,0.7),inset 0 1px 0 rgba(245,200,66,0.08)'}}>
        <div style={{fontFamily:serif,fontSize:18,color:'#f5c842',fontWeight:700,marginBottom:4}}>Open a Study Chamber</div>
        <div style={{fontFamily:mono,fontSize:8,color:'rgba(232,213,176,0.35)',letterSpacing:'0.14em',marginBottom:20}}>CREATE A PRIVATE ROOM FOR YOUR SESSION</div>
        <div style={{height:1,background:'linear-gradient(90deg,rgba(245,200,66,0.25),transparent)',marginBottom:20}}/>
        <form onSubmit={submit}>
          <div style={{fontFamily:mono,fontSize:8,color:'rgba(232,213,176,0.45)',letterSpacing:'0.14em',marginBottom:7}}>CHAMBER NAME</div>
          <input value={label} onChange={e=>{setLabel(e.target.value);setErr('');}} placeholder="e.g. Morning Grind, UPSC Focus…" maxLength={50}
            style={{width:'100%',background:'rgba(0,0,0,0.4)',border:`1px solid ${err?'rgba(248,113,113,0.5)':'rgba(245,200,66,0.2)'}`,borderRadius:8,padding:'10px 12px',color:'#e8d5b0',fontSize:12,fontFamily:mono,outline:'none',boxSizing:'border-box',transition:'border-color 0.15s'}}
            onFocus={e=>{if(!err)e.target.style.borderColor='rgba(245,200,66,0.45)';}}
            onBlur={e=>{if(!err)e.target.style.borderColor='rgba(245,200,66,0.2)';}}/>
          {err&&<div style={{fontFamily:mono,fontSize:9,color:'rgba(248,113,113,0.8)',marginTop:5}}>{err}</div>}
          <div style={{display:'flex',gap:10,marginTop:18}}>
            <button type="submit" disabled={busy} style={{flex:1,padding:'11px 0',background:'linear-gradient(135deg,rgba(245,200,66,0.15),rgba(245,158,11,0.1))',border:'1px solid rgba(245,200,66,0.4)',borderRadius:8,color:'#f5c842',fontFamily:mono,fontSize:10,cursor:'pointer',fontWeight:700,letterSpacing:'0.1em',transition:'all 0.15s'}}>
              {busy?'OPENING…':'OPEN CHAMBER'}
            </button>
            <button type="button" onClick={onClose} style={{padding:'11px 18px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'rgba(232,213,176,0.45)',fontFamily:mono,fontSize:10,cursor:'pointer'}}>CANCEL</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
function fmtHM(s:number){const x=s||0;const h=Math.floor(x/3600),m=Math.floor((x%3600)/60);return h>0?h+'h '+String(m).padStart(2,'0')+'m':m+'m';}

/** ms until next Monday 00:00 IST (weekly leaderboard reset) */
function msToWeeklyReset(){
  const now=Date.now();
  const ist=new Date(now+5.5*3600*1000);            // shift into IST wall-clock
  const dow=ist.getUTCDay();                          // 0=Sun..1=Mon
  const daysToMon=((8-dow)%7)||7;                     // next Monday (never 0)
  const next=Date.UTC(ist.getUTCFullYear(),ist.getUTCMonth(),ist.getUTCDate()+daysToMon,0,0,0)
    -5.5*3600*1000;                                    // back to real epoch
  return Math.max(0,next-now);
}
function fmtCountdown(ms:number){const t=Math.floor(ms/1000);const d=Math.floor(t/86400),h=Math.floor((t%86400)/3600),m=Math.floor((t%3600)/60);return d>0?d+'d '+h+'h':h+'h '+String(m).padStart(2,'0')+'m';}

// ─── My Stats rail (live, always on the front page) ─────────────────────────────
function StatsRail({username,board}:{username:string;board:LeaderboardEntry[]}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const [data,setData]=useState<ProfileData|null>(null);
  useEffect(()=>{
    if(!username)return;
    let live=true;
    const load=()=>fetchProfile(username).then(d=>{if(live)setData(d);}).catch(()=>{});
    load();const iv=setInterval(load,30000);
    return()=>{live=false;clearInterval(iv);};
  },[username]);
  useEffect(()=>{
    if(!canvasRef.current)return;
    const app:CharApp=data?{
      gender:data.gender||'male',skin:data.skinColor||'#f5c5a3',hair:data.hairColor||'#1a0a00',
      shirt:data.shirtColor||'#f59e0b',pants:data.pantsColor||'#1e2a4a',shoes:data.shoesColor||'#1a1008',
    }:{
      gender:localStorage.getItem('sl_gender')||'male',skin:localStorage.getItem('sl_skin')||'#f5c5a3',
      hair:localStorage.getItem('sl_hair')||'#1a0a00',shirt:localStorage.getItem('sl_shirt')||'#f59e0b',
      pants:localStorage.getItem('sl_pants')||'#1e2a4a',shoes:localStorage.getItem('sl_shoes')||'#1a1008',
    };
    drawPreview(canvasRef.current,app);
  },[data]);
  // listen for live wardrobe changes
  useEffect(()=>{
    const h=(e:Event)=>{ if(canvasRef.current) drawPreview(canvasRef.current,(e as CustomEvent).detail as CharApp); };
    window.addEventListener('sl:appChanged',h);
    return()=>window.removeEventListener('sl:appChanged',h);
  },[]);

  const rank=username?(board.findIndex(b=>b.name.toLowerCase()===username.toLowerCase())+1):0;
  const Metric=({label,value,accent}:{label:string;value:string;accent:string})=>(
    <div style={{padding:'10px 12px',background:'rgba(255,255,255,0.025)',border:`1px solid ${accent}22`,borderRadius:9,position:'relative',overflow:'hidden'}}>
      <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${accent},${accent}00)`}}/>
      <div style={{fontFamily:mono,fontSize:8,color:`${accent}aa`,letterSpacing:'0.14em',marginBottom:5}}>{label}</div>
      <div style={{fontFamily:serif,fontSize:19,fontWeight:700,color:accent,lineHeight:1}}>{value}</div>
    </div>
  );

  if(!username) return(
    <div style={{padding:'18px 16px'}}>
      <div style={{fontFamily:serif,fontSize:15,fontWeight:700,color:'#4ade80',letterSpacing:'0.05em',marginBottom:4}}>My Stats</div>
      <div style={{height:1,background:'linear-gradient(90deg,rgba(74,222,128,0.3),transparent)',marginBottom:18}}/>
      <div style={{textAlign:'center',padding:'30px 8px'}}>
        <div style={{fontSize:30,marginBottom:12}}>📊</div>
        <div style={{fontFamily:mono,fontSize:10,color:'rgba(232,213,176,0.45)',lineHeight:1.6,marginBottom:16}}>Sign in to track your study hours, sessions and rank.</div>
        <Link href="/join" style={{display:'inline-block',fontFamily:mono,fontSize:10,color:'#f5c842',textDecoration:'none',padding:'8px 18px',border:'1px solid rgba(245,200,66,0.4)',borderRadius:6,background:'rgba(245,200,66,0.06)',letterSpacing:'0.08em'}}>SIGN IN →</Link>
      </div>
    </div>
  );

  return(
    <div style={{padding:'18px 16px'}}>
      <div style={{fontFamily:serif,fontSize:15,fontWeight:700,color:'#4ade80',letterSpacing:'0.05em',marginBottom:4}}>My Stats</div>
      <div style={{fontFamily:mono,fontSize:9,color:'rgba(232,213,176,0.4)',letterSpacing:'0.1em',marginBottom:12}}>@{username}</div>
      <div style={{display:'flex',gap:12,alignItems:'center',marginBottom:16}}>
        <div style={{background:'rgba(0,0,0,0.35)',borderRadius:10,padding:6,border:'1px solid rgba(245,200,66,0.14)',flexShrink:0}}>
          <canvas ref={canvasRef} width={72} height={100}/>
        </div>
        <div style={{minWidth:0}}>
          <div style={{fontFamily:serif,fontSize:15,fontWeight:700,color:'#f5c842',lineHeight:1.2,overflow:'hidden',textOverflow:'ellipsis'}}>{data?.displayName||username}</div>
          <div style={{marginTop:8,display:'inline-flex',alignItems:'center',gap:6,padding:'4px 10px',background:'rgba(167,139,250,0.1)',border:'1px solid rgba(167,139,250,0.28)',borderRadius:20}}>
            <span style={{fontFamily:mono,fontSize:8,color:'rgba(167,139,250,0.7)',letterSpacing:'0.12em'}}>RANK</span>
            <span style={{fontFamily:serif,fontSize:15,fontWeight:700,color:'#c4b5fd'}}>{rank>0?'#'+rank:'—'}</span>
          </div>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
        <Metric label="THIS WEEK"   value={fmtHM(data?.weekly_secs||0)} accent="#4ade80"/>
        <Metric label="ALL TIME"    value={fmtHM(data?.total_secs||0)}  accent="#f5c842"/>
        <Metric label="SESSIONS"    value={String(data?.session_count||0)} accent="#a78bfa"/>
        <Metric label="AVG SESSION" value={data&&data.session_count?fmtHM(Math.round((data.total_secs||0)/data.session_count)):'—'} accent="#60a5fa"/>
      </div>
      {data?.goal&&(
        <div style={{padding:'10px 12px',background:'rgba(245,200,66,0.05)',border:'1px solid rgba(245,200,66,0.15)',borderRadius:9,marginBottom:12}}>
          <div style={{fontFamily:mono,fontSize:8,color:'rgba(245,200,66,0.5)',letterSpacing:'0.14em',marginBottom:5}}>STUDY GOAL</div>
          <div style={{fontFamily:serif,fontSize:12,color:'#e8d5b0',lineHeight:1.5}}>{data.goal}</div>
        </div>
      )}
      <Link href="/profile" style={{display:'block',padding:'9px 0',textAlign:'center',fontFamily:mono,fontSize:9,color:'#a78bfa',textDecoration:'none',background:'rgba(167,139,250,0.08)',border:'1px solid rgba(167,139,250,0.2)',borderRadius:8,letterSpacing:'0.1em'}}>EDIT PROFILE →</Link>
    </div>
  );
}

// ─── Leaderboard rail (live, always on the front page) ──────────────────────────
function LeaderboardRail({username,board,loading,onOpenFull}:{username:string;board:LeaderboardEntry[];loading:boolean;onOpenFull:()=>void}){
  const [reset,setReset]=useState(0);
  useEffect(()=>{setReset(msToWeeklyReset());const iv=setInterval(()=>setReset(msToWeeklyReset()),60000);return()=>clearInterval(iv);},[]);
  const max=board[0]?.weekly_secs||1;
  const MEDAL=['🥇','🥈','🥉'];const COLORS=['#f5c842','#c0c0c0','#cd7f32'];
  return(
    <div style={{padding:'18px 16px'}}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
        <div>
          <div style={{fontFamily:serif,fontSize:15,fontWeight:700,color:'#a78bfa',letterSpacing:'0.05em'}}>Hall of Scholars</div>
          <div style={{fontFamily:mono,fontSize:8,color:'rgba(232,213,176,0.4)',letterSpacing:'0.12em',marginTop:3}}>THIS WEEK · TOP STUDY TIME</div>
        </div>
        <div style={{textAlign:'right',flexShrink:0}}>
          <div style={{fontFamily:mono,fontSize:7,color:'rgba(251,146,60,0.55)',letterSpacing:'0.12em'}}>RESETS IN</div>
          <div style={{fontFamily:mono,fontSize:11,color:'#fb923c',fontWeight:700,marginTop:2}}>{reset?fmtCountdown(reset):'—'}</div>
        </div>
      </div>
      <div style={{height:1,background:'linear-gradient(90deg,rgba(167,139,250,0.35),transparent)',margin:'12px 0 14px'}}/>
      {loading&&[0,1,2,3,4].map(i=><div key={i} style={{height:54,marginBottom:8,background:'rgba(167,139,250,0.05)',borderRadius:9,border:'1px solid rgba(167,139,250,0.1)',opacity:0.5-i*0.07}}/>)}
      {!loading&&board.length===0&&(
        <div style={{textAlign:'center',padding:'36px 0'}}>
          <div style={{fontSize:28,marginBottom:10}}>🏆</div>
          <div style={{fontFamily:serif,fontSize:13,color:'rgba(232,213,176,0.4)'}}>No scholars yet</div>
          <div style={{fontFamily:mono,fontSize:9,color:'rgba(232,213,176,0.25)',marginTop:6}}>Study to claim the top spot</div>
        </div>
      )}
      {!loading&&board.slice(0,10).map((e,i)=>{
        const pct=Math.round((e.weekly_secs/max)*100);
        const isMe=username&&e.name.toLowerCase()===username.toLowerCase();
        const accent=i<3?COLORS[i]:'#a78bfa';
        return(
          <div key={e.name} style={{marginBottom:8,padding:'9px 11px',borderRadius:9,position:'relative',overflow:'hidden',
            background:isMe?'rgba(167,139,250,0.12)':'rgba(255,255,255,0.025)',
            borderLeft:isMe?'2px solid #a78bfa':'2px solid transparent',
            border:`1px solid ${isMe?'rgba(167,139,250,0.4)':'rgba(255,255,255,0.06)'}`}}>
            {i<3&&<div style={{position:'absolute',top:0,left:0,right:0,height:1,background:`linear-gradient(90deg,${accent}66,${accent}00)`}}/>}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
              <div style={{display:'flex',alignItems:'center',gap:9,minWidth:0}}>
                <span style={{fontFamily:mono,fontSize:i<3?15:10,minWidth:20,textAlign:'center',color:i<3?accent:'rgba(232,213,176,0.5)'}}>{i<3?MEDAL[i]:'#'+(i+1)}</span>
                <span style={{fontFamily:serif,fontSize:12,fontWeight:700,color:isMe?'#c4b5fd':'#e8d5b0',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {e.displayName||e.name}{isMe&&<span style={{fontFamily:mono,fontSize:8,color:'#a78bfa',marginLeft:6}}>(you)</span>}
                </span>
              </div>
              <span style={{fontFamily:mono,fontSize:10,fontWeight:700,color:accent,flexShrink:0}}>{fmtHM(e.weekly_secs)}</span>
            </div>
            <div style={{height:3,background:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden'}}>
              <motion.div initial={{width:0}} animate={{width:pct+'%'}} transition={{duration:0.7,delay:i*0.04,ease:'easeOut'}}
                style={{height:'100%',background:`linear-gradient(90deg,${accent}88,${accent})`,borderRadius:2}}/>
            </div>
          </div>
        );
      })}
      {!loading&&board.length>10&&(
        <button onClick={onOpenFull} style={{width:'100%',marginTop:6,padding:'8px 0',fontFamily:mono,fontSize:9,letterSpacing:'0.1em',cursor:'pointer',color:'#a78bfa',background:'rgba(167,139,250,0.08)',border:'1px solid rgba(167,139,250,0.2)',borderRadius:8}}>VIEW FULL BOARD →</button>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function HomePage(){
  const [activePanel,setPanel]=useState<string|null>(null);
  const [showCreate,setCreate]=useState(false);
  const [username,setUsername]=useState('');
  const [displayName,setDisplay]=useState('');
  const [board,setBoard]=useState<LeaderboardEntry[]>([]);
  const [boardLoading,setBoardLoading]=useState(true);
  const loadedRef=useRef(false);

  useEffect(()=>{
    setUsername(localStorage.getItem('sl_name')||'');
    setDisplay(localStorage.getItem('sl_display')||localStorage.getItem('sl_name')||'');
  },[]);

  // live leaderboard — feeds both the rank in My Stats and the Hall of Scholars
  useEffect(()=>{
    let live=true;
    const load=()=>fetchLeaderboard().then(d=>{if(live){setBoard(d||[]);setBoardLoading(false);}}).catch(()=>{if(live)setBoardLoading(false);});
    load();const iv=setInterval(load,30000);
    return()=>{live=false;clearInterval(iv);};
  },[]);

  useEffect(()=>{
    if(loadedRef.current)return; loadedRef.current=true;
    if((window as any).__homeWorldStarted)return;
    const run=()=>{const s=document.createElement('script');s.textContent=GAME_SCRIPT;document.head.appendChild(s);};
    if((window as any).Phaser){run();}
    else{const ps=document.createElement('script');ps.src='https://cdn.jsdelivr.net/npm/phaser@3.60.0/dist/phaser.min.js';ps.onload=run;document.head.appendChild(ps);}
  },[]);

  useEffect(()=>{
    const h=(e:Event)=>{
      const t=(e as CustomEvent).detail?.type;
      if(t==='notice-board'||t==='reception')openPanel('library-rooms');
      else if(t==='add-friend')gate(()=>openPanel('friends'));
      else openPanel(t);
    };
    window.addEventListener('sl:interact',h);
    return()=>window.removeEventListener('sl:interact',h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  function openPanel(type:string){ setPanel(type); window.dispatchEvent(new CustomEvent('sl:panelOpened')); }
  function closePanel(){ setPanel(null);setCreate(false);window.dispatchEvent(new CustomEvent('sl:panelClosed')); }
  function gate(fn:()=>void){ if(!localStorage.getItem('sl_name')){window.location.href='/join';}else{fn();} }
  function enterRoom(id:string){ gate(()=>{ localStorage.setItem('sl_roomId',id); window.location.href='/game'; }); }
  function enterGlobal(){ gate(()=>{ localStorage.removeItem('sl_roomId'); window.location.href='/game'; }); }

  const DockBtn=({label,accent,fn}:{label:string;accent:string;fn:()=>void})=>(
    <button onClick={fn} style={{padding:'8px 16px',borderRadius:6,cursor:'pointer',whiteSpace:'nowrap',
      background:'rgba(0,0,0,0.4)',border:`1px solid ${accent}30`,color:accent,
      fontFamily:mono,fontSize:10,letterSpacing:'0.08em',transition:'all 0.15s',
      backdropFilter:'blur(8px)',
    }}
      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background=`${accent}15`;(e.currentTarget as HTMLElement).style.borderColor=`${accent}60`;}}
      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='rgba(0,0,0,0.4)';(e.currentTarget as HTMLElement).style.borderColor=`${accent}30`;}}>
      {label}
    </button>
  );

  return(
    <div style={{position:'relative',display:'flex',flexDirection:'column',width:'100vw',height:'100vh',overflow:'hidden',background:'#0b0600'}}>
      {/* ── Top HUD ── */}
      <div style={{flexShrink:0,height:50,zIndex:400,
        background:'rgba(10,4,0,0.92)',borderBottom:'1px solid rgba(124,74,30,0.3)',
        display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 20px'}}>
        <span style={{fontFamily:serif,fontSize:15,fontWeight:700,color:'#f5c842',letterSpacing:'0.12em'}}>
          ◆ FOCUS LIBRARY
        </span>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          {username?(
            <>
              <div style={{display:'flex',alignItems:'center',gap:6,padding:'4px 10px',
                background:'rgba(245,200,66,0.06)',border:'1px solid rgba(245,200,66,0.15)',borderRadius:6}}>
                <span style={{fontFamily:serif,fontSize:12,color:'#f5c842',fontWeight:700}}>{displayName}</span>
                <span style={{fontFamily:mono,fontSize:9,color:'rgba(245,200,66,0.4)'}}>@{username}</span>
              </div>
              <Link href="/profile" style={{fontFamily:mono,fontSize:9,color:'rgba(167,139,250,0.7)',textDecoration:'none',
                padding:'4px 10px',border:'1px solid rgba(167,139,250,0.2)',borderRadius:4,
                transition:'all 0.15s'}}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color='#a78bfa';(e.currentTarget as HTMLElement).style.borderColor='rgba(167,139,250,0.5)';}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color='rgba(167,139,250,0.7)';(e.currentTarget as HTMLElement).style.borderColor='rgba(167,139,250,0.2)';}}>
                PROFILE
              </Link>
            </>
          ):(
            <Link href="/join" style={{fontFamily:mono,fontSize:10,color:'#f5c842',textDecoration:'none',
              padding:'5px 14px',border:'1px solid rgba(245,200,66,0.35)',borderRadius:5,
              background:'rgba(245,200,66,0.06)',letterSpacing:'0.08em'}}>SIGN IN →</Link>
          )}
        </div>
      </div>

      {/* ── Middle row: STATS rail · WORLD · LEADERBOARD rail ── */}
      <div style={{flex:1,display:'flex',minHeight:0}}>
        <aside className="sl-rail" style={{width:300,flexShrink:0,overflowY:'auto',
          background:'linear-gradient(180deg,#150b03,#0c0600)',borderRight:'1px solid rgba(124,74,30,0.3)'}}>
          <StatsRail username={username} board={board}/>
        </aside>

        <main style={{flex:1,position:'relative',minWidth:0,background:'#0b0600'}}>
          <div id="home-world-container" style={{position:'absolute',inset:0}}/>
          <div style={{position:'absolute',bottom:12,left:'50%',transform:'translateX(-50%)',zIndex:5,
            pointerEvents:'none',background:'rgba(8,3,0,0.7)',border:'1px solid rgba(124,74,30,0.4)',
            borderRadius:20,padding:'5px 14px',fontFamily:mono,fontSize:9,color:'rgba(232,213,176,0.6)',
            letterSpacing:'0.1em',backdropFilter:'blur(6px)',whiteSpace:'nowrap'}}>
            WASD · MOVE&nbsp;&nbsp;|&nbsp;&nbsp;E · INTERACT&nbsp;&nbsp;|&nbsp;&nbsp;walk to the door to enter the library
          </div>
        </main>

        <aside className="sl-rail" style={{width:320,flexShrink:0,overflowY:'auto',
          background:'linear-gradient(180deg,#120a16,#0c0600)',borderLeft:'1px solid rgba(124,74,30,0.3)'}}>
          <LeaderboardRail username={username} board={board} loading={boardLoading} onOpenFull={()=>openPanel('ranking-board')}/>
        </aside>
      </div>

      {/* ── Action dock ── */}
      <div style={{flexShrink:0,zIndex:400,
        background:'rgba(8,3,0,0.95)',borderTop:'1px solid rgba(124,74,30,0.25)',
        display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:'9px 20px'}}>
        <DockBtn label="📖  Library"           accent="#f5c842" fn={()=>openPanel('library-rooms')}/>
        <DockBtn label="👥  Friends"           accent="#4ade80" fn={()=>gate(()=>openPanel('friends'))}/>
        <DockBtn label="🏆  Leaderboard"       accent="#a78bfa" fn={()=>openPanel('ranking-board')}/>
        <DockBtn label="👗  Wardrobe"           accent="#f59e0b" fn={()=>openPanel('wardrobe')}/>
        <DockBtn label="📊  My Stats"           accent="#60a5fa" fn={()=>openPanel('my-stats')}/>
      </div>

      {/* ── Panels ── */}
      <AnimatePresence>
        {activePanel==='wardrobe'&&<WardrobePanel key="wardrobe" onClose={closePanel}/>}
        {activePanel==='library-rooms'&&<LibraryPanel key="library" onClose={closePanel} onEnterGlobal={()=>enterGlobal()} onCreate={()=>setCreate(true)}/>}
        {activePanel==='ranking-board'&&<LeaderboardPanel key="lb" onClose={closePanel} username={username}/>}
        {activePanel==='my-stats'&&<StatsPanel key="stats" username={username} onClose={closePanel}/>}
        {activePanel==='friends'&&<FriendsPanel key="friends" username={username} onClose={closePanel}/>}
      </AnimatePresence>

      {showCreate&&<CreateModal onClose={()=>setCreate(false)}/>}
    </div>
  );
}
