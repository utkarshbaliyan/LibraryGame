'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Script from 'next/script';
import Link from 'next/link';
import { VALID_DURATIONS, DURATION_LABELS, fmtDuration, fmtHMS, fmtStudyTime } from '@/lib/constants';
import { SERVER_WS } from '@/lib/constants';
import { fetchInvites, type InviteEntry } from '@/lib/api';
import { useRouter } from 'next/navigation';

// ── Types ─────────────────────────────────────────────────────────────────
type PState = 'idle' | 'browsing' | 'studying' | 'paused';

interface PlayerSnapshot {
  name: string;
  sessionSeconds: number;
  pstate: PState;
  isMe: boolean;
}

interface GameState {
  pstate: PState;
  sessionLeft: number;
  sessionSeconds: number;
  seatId: number;
  idleSince: number;
}

interface ChatMessage {
  id: number;
  from: string;
  fromDisplay?: string;
  to: string;
  body: string;
  createdAt: number;
}

interface FriendEntry {
  username: string;
  displayName: string;
  online?: boolean;
  roomId?: string | null;
  roomLabel?: string | null;
}

// ── Phaser game script (runs after CDN scripts load) ──────────────────────
const GAME_SCRIPT = `
(function(){
  if (window.__studyLibraryGameStarted) return;
  window.__studyLibraryGameStarted = true;
  // AMONG US STYLE — bean characters, wall collision, corridors, minimap

  // ── Config ──────────────────────────────────────────────────────────────
  const VIEW_W=800, VIEW_H=600, WORLD_W=1600, WORLD_H=1200;
  const SPEED=160, SEND_MS=66, LERP=0.15, PR=15;

  const MY_USERNAME = localStorage.getItem('sl_name') || 'guest';
  const MY_NAME     = localStorage.getItem('sl_display') || MY_USERNAME;
  function h2i(h){return parseInt((h||'f59e0b').replace('#',''),16);}
  const MY_APP={
    gender:localStorage.getItem('sl_gender')||'male',
    skin:  h2i(localStorage.getItem('sl_skin')  ||'#f5c5a3'),
    hair:  h2i(localStorage.getItem('sl_hair')  ||'#1a0a00'),
    shirt: h2i(localStorage.getItem('sl_shirt') ||'#f59e0b'),
    pants: h2i(localStorage.getItem('sl_pants') ||'#1e2a4a'),
    shoes: h2i(localStorage.getItem('sl_shoes') ||'#1a1008'),
  };

  // ── Wall layout (rooms separated by thick walls with doorway gaps) ───────
  // Zone boundary axes: VX1=296, VX2=1056, HY1=372, HY2=796, thickness=16
  // Doorways: 70px wide, positioned to create natural navigation routes
  const VX1=296, VX2=1056, HY1=372, HY2=796, WT=16;
  const WALLS = [
    // top horizontal (y=HY1): doors at x=130-200, x=610-680, x=1180-1250
    {x:0,       y:HY1,    w:130,           h:WT},
    {x:200,     y:HY1,    w:VX1-200,       h:WT},
    {x:VX1+WT,  y:HY1,    w:610-(VX1+WT),  h:WT},
    {x:680,     y:HY1,    w:VX2-680,       h:WT},
    {x:VX2+WT,  y:HY1,    w:1180-(VX2+WT), h:WT},
    {x:1250,    y:HY1,    w:WORLD_W-1250,  h:WT},
    // bottom horizontal (y=HY2): doors at x=130-200, x=680-750, x=1180-1250
    {x:0,       y:HY2,    w:130,           h:WT},
    {x:200,     y:HY2,    w:VX1-200,       h:WT},
    {x:VX1+WT,  y:HY2,    w:680-(VX1+WT),  h:WT},
    {x:750,     y:HY2,    w:VX2-750,       h:WT},
    {x:VX2+WT,  y:HY2,    w:1180-(VX2+WT), h:WT},
    {x:1250,    y:HY2,    w:WORLD_W-1250,  h:WT},
    // left vertical (x=VX1): doors at y=145-215, y=490-560
    {x:VX1,     y:0,      w:WT,  h:145},
    {x:VX1,     y:215,    w:WT,  h:HY1-215},
    {x:VX1,     y:HY1+WT, w:WT,  h:490-(HY1+WT)},
    {x:VX1,     y:560,    w:WT,  h:HY2-560},
    // right vertical (x=VX2): doors at y=145-215, y=490-560
    {x:VX2,     y:0,      w:WT,  h:145},
    {x:VX2,     y:215,    w:WT,  h:HY1-215},
    {x:VX2,     y:HY1+WT, w:WT,  h:490-(HY1+WT)},
    {x:VX2,     y:560,    w:WT,  h:HY2-560},
  ];

  // Circle-AABB collision check
  function hitsWall(x, y) {
    if(x<PR||x>WORLD_W-PR||y<PR||y>WORLD_H-PR) return true;
    for(const w of WALLS){
      const cx=Math.max(w.x,Math.min(x,w.x+w.w));
      const cy=Math.max(w.y,Math.min(y,w.y+w.h));
      if((x-cx)*(x-cx)+(y-cy)*(y-cy)<PR*PR) return true;
    }
    return false;
  }

  // ── Zone definitions (wall-adjusted coordinates) ─────────────────────────
  const ZONES = [
    {x:0,       y:0,       w:VX1,           h:HY1,           floor:0x1a0f03,bdr:0xd97706,label:'ARCHIVES',          lc:'#d97706'},
    {x:VX1+WT,  y:0,       w:VX2-(VX1+WT),  h:HY1,           floor:0x140e08,bdr:0xb8930f,label:'GRAND READING HALL', lc:'#e5b000'},
    {x:VX2+WT,  y:0,       w:WORLD_W-(VX2+WT),h:HY1,         floor:0x03091a,bdr:0x0891c2,label:'QUIET ZONE',         lc:'#22d3ee'},
    {x:0,       y:HY1+WT,  w:VX1,           h:HY2-(HY1+WT),  floor:0x050f06,bdr:0x15803d,label:'STUDY TABLES',       lc:'#4ade80'},
    {x:VX1+WT,  y:HY1+WT,  w:VX2-(VX1+WT),  h:HY2-(HY1+WT), floor:0x100c06,bdr:0x92400e,label:'MAIN HALL',          lc:'#fbbf24'},
    {x:VX2+WT,  y:HY1+WT,  w:WORLD_W-(VX2+WT),h:HY2-(HY1+WT),floor:0x0d0520,bdr:0x6d28d9,label:'GROUP ROOMS',       lc:'#a78bfa'},
    {x:0,       y:HY2+WT,  w:VX1,           h:WORLD_H-(HY2+WT),floor:0x130704,bdr:0xc2410c,label:'LECTURE HALL',     lc:'#fb923c'},
    {x:VX1+WT,  y:HY2+WT,  w:VX2-(VX1+WT),  h:WORLD_H-(HY2+WT),floor:0x0a0a0c,bdr:0x475569,label:'ENTRANCE',       lc:'#94a3b8'},
    {x:VX2+WT,  y:HY2+WT,  w:WORLD_W-(VX2+WT),h:WORLD_H-(HY2+WT),floor:0x150309,bdr:0xbe185d,label:'RELAX ZONE',   lc:'#f87171'},
  ];

  // ── Seats (must match server exactly) ────────────────────────────────────
  const SEATS = [
    {id:0,x:440,y:140},{id:1,x:580,y:140},{id:2,x:720,y:140},{id:3,x:860,y:140},
    {id:4,x:1120,y:130},{id:5,x:1300,y:130},
    {id:6,x:130,y:490},{id:7,x:130,y:610},
  ];

  // Kiosk: reception counter in Main Hall (near Reading Hall doorway)
  const KIOSK_CX=644, KIOSK_CY=438;
  const SPAWN_X=680, SPAWN_Y=590;
  const INTERACT_R=72;

  // ── Helpers ──────────────────────────────────────────────────────────────
  function emit(t,d){ window.dispatchEvent(new CustomEvent('sl:'+t,{detail:d})); }
  function dist(ax,ay,bx,by){ return Math.sqrt((ax-bx)**2+(ay-by)**2); }
  function lig(c){ return(Math.min(255,(c>>16&0xff)+55)<<16)|(Math.min(255,(c>>8&0xff)+55)<<8)|Math.min(255,(c&0xff)+55); }
  function drk(c){ return(Math.max(0,(c>>16&0xff)-40)<<16)|(Math.max(0,(c>>8&0xff)-40)<<8)|Math.max(0,(c&0xff)-40); }

  // ── Top-down humanoid character (Machiavillain style) ────────────────────
  function drawCharacter(g, app, dir, lp, isMe) {
    g.clear();
    const hl=lig(app.shirt), dk=drk(app.shirt);
    const skinDk=drk(app.skin);
    const sw=Math.sin(lp);

    // Ground shadow
    g.fillStyle(0x000000,0.22);
    g.fillEllipse(0,20,26,8);

    const isFemale=app.gender==='female';

    if(dir==='down'){
      // Legs
      g.fillStyle(app.pants,1);
      g.fillEllipse(-6,13+sw*6,10,14);
      g.fillEllipse( 6,13-sw*6,10,14);
      // Shoes
      g.fillStyle(app.shoes,1);
      g.fillEllipse(-6,20+sw*6,10,6);
      g.fillEllipse( 6,20-sw*6,10,6);
      // Arms
      g.fillStyle(app.shirt,1);
      g.fillEllipse(-14,-1-sw*5,9,16);
      g.fillEllipse( 14,-1+sw*5,9,16);
      // Body torso
      g.fillStyle(app.shirt,1);
      g.fillRoundedRect(-10,-10,20,20,5);
      g.fillStyle(hl,0.2);
      g.fillRoundedRect(-8,-8,8,9,3);
      // Neck
      g.fillStyle(app.skin,1);
      g.fillEllipse(0,-12,8,6);
      // Head
      g.fillStyle(app.skin,1);
      g.fillCircle(0,-22,11);
      // Hair — female: long flowing sides; male: short neat
      g.fillStyle(app.hair,1);
      if(isFemale){
        g.fillEllipse( 0,-30,24,13);
        g.fillEllipse(-12,-22,12,22);
        g.fillEllipse( 12,-22,12,22);
        g.fillEllipse( -8,-12, 8,10);
        g.fillEllipse(  8,-12, 8,10);
      } else {
        g.fillEllipse( 0,-30,20,11);
        g.fillEllipse(-9,-24, 7,12);
        g.fillEllipse( 9,-24, 7,12);
      }
      // Eyes
      g.fillStyle(0x1a0a00,1);
      g.fillCircle(-4,-22,2.2);
      g.fillCircle( 4,-22,2.2);
      g.fillStyle(0xffffff,0.9);
      g.fillCircle(-3,-23,1);
      g.fillCircle( 5,-23,1);

    } else if(dir==='up'){
      // Legs
      g.fillStyle(app.pants,1);
      g.fillEllipse(-6,13+sw*6,10,14);
      g.fillEllipse( 6,13-sw*6,10,14);
      // Shoes
      g.fillStyle(app.shoes,1);
      g.fillEllipse(-6,20+sw*6,10,6);
      g.fillEllipse( 6,20-sw*6,10,6);
      // Arms (darker — back of arm)
      g.fillStyle(dk,1);
      g.fillEllipse(-14,-1-sw*5,9,16);
      g.fillEllipse( 14,-1+sw*5,9,16);
      // Body
      g.fillStyle(app.shirt,1);
      g.fillRoundedRect(-10,-10,20,20,5);
      // Neck + head back
      g.fillStyle(skinDk,1);
      g.fillEllipse(0,-12,8,6);
      g.fillCircle(0,-22,11);
      // Hair
      g.fillStyle(app.hair,1);
      if(isFemale){
        g.fillCircle(0,-24,13);
        g.fillEllipse(-12,-20,12,22);
        g.fillEllipse( 12,-20,12,22);
        g.fillEllipse( -7,-10, 8,12);
        g.fillEllipse(  7,-10, 8,12);
      } else {
        g.fillCircle(0,-24,12);
        g.fillEllipse(-9,-22,8,13);
        g.fillEllipse( 9,-22,8,13);
      }

    } else {
      const f=dir==='right'?1:-1;
      // Far arm behind body
      g.fillStyle(dk,1);
      g.fillEllipse(-f*10,-1+sw*5,8,15);
      // Legs
      g.fillStyle(app.pants,1);
      g.fillEllipse(-5,13+sw*6,10,14);
      g.fillEllipse( 5,13-sw*6,10,14);
      // Shoes
      g.fillStyle(app.shoes,1);
      g.fillEllipse(-5+f*2,20+sw*6,10,6);
      g.fillEllipse( 5+f*2,20-sw*6,10,6);
      // Body oval
      g.fillStyle(app.shirt,1);
      g.fillEllipse(f*1,0,18,22);
      g.fillStyle(hl,0.2);
      g.fillEllipse(-f*3,-4,7,9);
      // Near arm in front
      g.fillStyle(app.shirt,1);
      g.fillEllipse(f*12,-1-sw*5,8,15);
      // Neck + head
      g.fillStyle(app.skin,1);
      g.fillEllipse(f*2,-12,7,6);
      g.fillCircle(f*2,-22,11);
      // Hair
      g.fillStyle(app.hair,1);
      if(isFemale){
        g.fillEllipse(  0,-30,18,12);
        g.fillEllipse( f*9,-23,10,18);
        g.fillEllipse(-f*9,-23, 8,14);
        g.fillEllipse( f*6,-12, 7,12);
      } else {
        g.fillEllipse(  0,-30,16,11);
        g.fillEllipse( f*8,-23, 7,12);
        g.fillEllipse(-f*8,-23, 6,12);
      }
      // One visible eye
      g.fillStyle(0x1a0a00,1);
      g.fillCircle(f*4,-22,2);
      g.fillStyle(0xffffff,0.9);
      g.fillCircle(f*5,-23,1);
    }

    // Gold ring around head for local player
    if(isMe){
      g.lineStyle(2.5,0xf59e0b,0.9);
      g.strokeCircle(0,-22,14);
    }
  }

  function makeChar(scene, x, y, app, name, isMe) {
    const con=scene.add.container(x,y).setDepth(isMe?15:8);

    const g=scene.add.graphics();
    drawCharacter(g,app,'down',0,isMe);
    con.add(g);

    // Name tag — positioned above head (head top ≈ y=-36)
    const nm=isMe?'▸ '+name:name;
    const nw=Math.min(Math.max(nm.length*6+14,50),145);
    const nbg=scene.add.graphics();
    nbg.fillStyle(0x1a1008,0.88); nbg.fillRoundedRect(-nw/2,-64,nw,17,4);
    // Parchment-style border
    nbg.lineStyle(1,0x7c4a1e,0.7); nbg.strokeRoundedRect(-nw/2,-64,nw,17,4);
    con.add(nbg);
    con.add(scene.add.text(0,-55,nm,{
      fontFamily:"'Space Mono',monospace",fontSize:'9px',
      color:isMe?'#f5c842':'#e8d5b0',
    }).setOrigin(0.5,1));

    // Status dot
    const dot=scene.add.graphics();
    dot.fillStyle(0x64748b,0.7); dot.fillCircle(0,-70,4);
    con.add(dot);

    // Timer text (above name tag)
    const timerTxt=scene.add.text(0,-68,'',{
      fontFamily:"'Space Mono',monospace",fontSize:'8px',
      color:'#a78bfa',backgroundColor:'#1a100899',
      padding:{x:4,y:2},
    }).setOrigin(0.5,1).setVisible(false);
    con.add(timerTxt);

    return {con,g,dot,timerTxt,dir:'down',lp:0,app,lastDir:'_'};
  }

  function setDot(dot, ps){
    dot.clear();
    if(ps==='studying'){
      // Purple dot + tiny book lines
      dot.fillStyle(0xa78bfa,0.95); dot.fillCircle(0,-70,5);
      dot.lineStyle(1,0xffffff,0.65);
      dot.strokeRect(-3,-74,6,8);
      dot.lineBetween(0,-74,0,-66);
    } else if(ps==='paused'){
      // Amber dot + pause bars
      dot.fillStyle(0xf59e0b,0.95); dot.fillCircle(0,-70,5);
      dot.fillStyle(0xffffff,0.9);
      dot.fillRect(-3,-73,2,6);
      dot.fillRect(1,-73,2,6);
    } else if(ps==='browsing'){
      dot.fillStyle(0xfb923c,0.95); dot.fillCircle(0,-70,5);
    } else {
      dot.fillStyle(0x64748b,0.7); dot.fillCircle(0,-70,4);
    }
  }

  // ── Map: floors, walls, furniture, labels ─────────────────────────────────
  function buildMap(scene) {
    // Dark background (covers wall areas)
    const bg=scene.add.graphics().setDepth(0);
    bg.fillStyle(0x1c0f04,1); bg.fillRect(0,0,WORLD_W,WORLD_H);

    // Zone floors with subtle tile grid
    const zg=scene.add.graphics().setDepth(1);
    for(const z of ZONES){
      zg.fillStyle(z.floor,1); zg.fillRect(z.x,z.y,z.w,z.h);
      zg.lineStyle(1,0xffffff,0.018);
      for(let gx=z.x;gx<=z.x+z.w;gx+=32) zg.lineBetween(gx,z.y,gx,z.y+z.h);
      for(let gy=z.y;gy<=z.y+z.h;gy+=32) zg.lineBetween(z.x,gy,z.x+z.w,gy);
    }

    // Doorway floor patches (corridor colour)
    const dc=0x150c05;
    const dg=scene.add.graphics().setDepth(1);
    dg.fillStyle(dc,1);
    [[130,HY1,70,WT],[610,HY1,70,WT],[1180,HY1,70,WT],
     [130,HY2,70,WT],[680,HY2,70,WT],[1180,HY2,70,WT],
     [VX1,145,WT,70],[VX1,490,WT,70],
     [VX2,145,WT,70],[VX2,490,WT,70]].forEach(([a,b,c,d])=>dg.fillRect(a,b,c,d));

    // Walls
    const wg=scene.add.graphics().setDepth(2);
    wg.fillStyle(0x1c0f04,1);
    WALLS.forEach(w=>wg.fillRect(w.x,w.y,w.w,w.h));
    // Wall edge highlights (top/left lighter, bottom/right darker)
    wg.lineStyle(1,0x3a1e08,0.6);
    WALLS.forEach(w=>wg.strokeRect(w.x,w.y,w.w,w.h));
    wg.lineStyle(1.5,0x4a2c0e,0.3);
    WALLS.forEach(w=>{ wg.lineBetween(w.x,w.y,w.x+w.w,w.y); wg.lineBetween(w.x,w.y,w.x,w.y+w.h); });

    // Doorway arch markers
    const ag=scene.add.graphics().setDepth(2);
    ag.lineStyle(2,0x8b5a1e,0.45);
    [[130,HY1],[610,HY1],[1180,HY1],[130,HY2],[680,HY2],[1180,HY2]].forEach(([a,b])=>{
      ag.lineBetween(a,b,a,b+WT); ag.lineBetween(a+70,b,a+70,b+WT);
    });
    [[VX1,145],[VX1,490],[VX2,145],[VX2,490]].forEach(([a,b])=>{
      ag.lineBetween(a,b,a+WT,b); ag.lineBetween(a,b+70,a+WT,b+70);
    });

    // Outer border
    const ob=scene.add.graphics().setDepth(2);
    ob.lineStyle(10,0x5a3a10,1); ob.strokeRect(4,4,WORLD_W-8,WORLD_H-8);
    ob.lineStyle(2,0x8b5a1e,0.35); ob.strokeRect(12,12,WORLD_W-24,WORLD_H-24);

    // Furniture
    const fg=scene.add.graphics().setDepth(3);
    buildFurniture(fg);

    // Zone labels
    for(const z of ZONES){
      scene.add.text(z.x+z.w/2,z.y+9,z.label,{
        fontFamily:"'Space Mono',monospace",fontSize:'9px',color:z.lc,letterSpacing:2,
      }).setOrigin(0.5,0).setDepth(4).setAlpha(0.62);
    }

    // Kiosk label (in Main Hall, above counter)
    scene.add.text(KIOSK_CX,KIOSK_CY-30,'SESSION COUNTER',{
      fontFamily:"'Space Mono',monospace",fontSize:'8px',color:'#93c5fd',letterSpacing:2,
    }).setOrigin(0.5,1).setDepth(4);
  }

  function buildFurniture(g) {
    // ── Desks at interactive seat positions ───────────────────────────────
    SEATS.forEach(s=>drawDesk(g,s.x,s.y));

    // Extra reading hall desks (visual fill)
    for(let r=0;r<2;r++) for(let c=0;c<4;c++) drawDesk(g,440+c*140,260+r*80);

    // Extra quiet zone desks
    for(let r=0;r<3;r++){ drawDesk(g,1120,240+r*80); drawDesk(g,1310,240+r*80); drawDesk(g,1495,240+r*80); }

    // Extra study table desks
    drawDesk(g,215,490); drawDesk(g,215,610);

    // ── Kiosk counter (in Main Hall) ──────────────────────────────────────
    drawKiosk(g);

    // ── Bookshelves ───────────────────────────────────────────────────────
    // Left wall of Reading Hall
    for(let i=0;i<5;i++) drawShelf(g,VX1+WT+2,12+i*68);
    // Archives left wall
    for(let i=0;i<4;i++) drawShelf(g,4,12+i*88);
    // Quiet zone right edge
    for(let i=0;i<4;i++) drawShelf(g,WORLD_W-28,12+i*80);

    // ── Group room tables ─────────────────────────────────────────────────
    drawTable(g,1175,490,130,80); drawTable(g,1420,490,130,80);
    drawTable(g,1175,660,130,80); drawTable(g,1420,660,130,80);

    // ── Lecture hall (blackboard + chairs) ────────────────────────────────
    drawLecture(g);

    // ── Relax zone (sofas + table) ────────────────────────────────────────
    drawRelax(g);

    // ── Main hall fountain ────────────────────────────────────────────────
    drawFountain(g,680,610);

    // ── Entrance area ─────────────────────────────────────────────────────
    drawEntrance(g);

    // ── Pillars at zone corners ────────────────────────────────────────────
    [[VX1+WT,HY1+WT],[VX1+WT,HY2],[VX2,HY1+WT],[VX2,HY2]].forEach(([px,py])=>{
      g.fillStyle(0x2d2520,1); g.fillRect(px-12,py-12,24,24);
      g.lineStyle(2,0x92400e,0.5); g.strokeRect(px-12,py-12,24,24);
      g.fillStyle(0xf59e0b,0.1); g.fillRect(px-9,py-9,18,18);
    });

    // ── Corner plants ─────────────────────────────────────────────────────
    [[6,6],[VX1-20,6],[VX2+WT,6],[WORLD_W-22,6],
     [6,HY1+WT],[VX1-20,HY1+WT],[VX2+WT,HY1+WT],[WORLD_W-22,HY1+WT],
     [6,HY2+WT],[WORLD_W-22,HY2+WT]].forEach(([px,py])=>drawPlant(g,px,py));
  }

  function drawDesk(g,sx,sy) {
    g.fillStyle(0x4a2c0a,1); g.fillRect(sx-25,sy-48,50,26);
    g.fillStyle(0x6b3d14,0.85); g.fillRect(sx-24,sy-48,48,6);
    g.fillStyle(0xf0e6c8,0.5); g.fillRect(sx-14,sy-44,20,16);
    g.fillStyle(0x1e40af,0.8); g.fillRect(sx+8,sy-43,2,11);
    g.fillStyle(0x2a1a06,1); g.fillRect(sx-23,sy-22,3,9); g.fillRect(sx+20,sy-22,3,9);
    g.fillStyle(0x3a2208,1); g.fillRect(sx-15,sy-10,30,22);
    g.fillStyle(0x4a3210,0.45); g.fillRect(sx-14,sy-10,28,7);
    g.fillStyle(0x1a0e04,1); g.fillRect(sx-13,sy+10,3,7); g.fillRect(sx+10,sy+10,3,7);
  }

  function drawShelf(g,x,y) {
    g.fillStyle(0x3d2208,1); g.fillRect(x,y,24,66);
    const BC=[0xe74c3c,0x3498db,0x2ecc71,0xf39c12,0x9b59b6,0x1abc9c,0xe67e22,0xec407a];
    const BW=[4,5,4,6,4,5,4,6];
    for(let sh=0;sh<3;sh++){
      g.fillStyle(0x5a3318,1); g.fillRect(x,y+2+sh*22,24,2);
      let bx=x+2,bi=0;
      while(bx<x+21&&bi<8){ g.fillStyle(BC[(sh*3+bi)%BC.length],0.9); g.fillRect(bx,y+5+sh*22,BW[bi],15); bx+=BW[bi]+1; bi++; }
    }
  }

  function drawKiosk(g) {
    const cx=KIOSK_CX, cy=KIOSK_CY;
    g.fillStyle(0x1e3a5f,1); g.fillRect(cx-105,cy-22,210,56);
    g.fillStyle(0x3b82f6,0.9); g.fillRect(cx-105,cy-22,210,6);
    g.fillStyle(0x1d4ed8,0.5); g.fillRect(cx-93,cy-14,32,30); g.fillRect(cx+61,cy-14,32,30);
    g.lineStyle(1.5,0x60a5fa,0.7); g.strokeRect(cx-105,cy-22,210,56);
    // Approach glow strip
    g.fillStyle(0xf59e0b,0.06); g.fillRect(cx-105,cy+34,210,30);
  }

  function drawTable(g,cx,cy,tw,th) {
    g.fillStyle(0x4a2c0a,1); g.fillRect(cx-tw/2,cy-th/2,tw,th);
    g.fillStyle(0x6b3d14,0.6); g.fillRect(cx-tw/2,cy-th/2,tw,5);
    g.lineStyle(1,0x7a4d20,0.35); g.strokeRect(cx-tw/2,cy-th/2,tw,th);
    for(let i=0;i<2;i++){
      g.fillStyle(0x2a1a08,1);
      g.fillRect(cx-tw/2+8+i*(tw/2+2),cy-th/2-14,22,13);
      g.fillRect(cx-tw/2+8+i*(tw/2+2),cy+th/2+1,22,13);
    }
  }

  function drawLecture(g) {
    // Blackboard (in Lecture Hall: x=0-VX1, y=HY2+WT onward)
    const bx=22, by=HY2+WT+12;
    g.fillStyle(0x0f2218,1); g.fillRect(bx,by,160,90);
    g.lineStyle(2,0x4a7c59,0.7); g.strokeRect(bx,by,160,90);
    g.lineStyle(1,0xe2e8f0,0.2);
    g.lineBetween(bx+16,by+22,bx+144,by+22);
    g.lineBetween(bx+16,by+44,bx+120,by+44);
    g.lineBetween(bx+16,by+66,bx+132,by+66);
    // Chair rows
    for(let row=0;row<5;row++) for(let col=0;col<3;col++){
      const cx=bx+16+col*82, cy=by+110+row*48; if(cx+20>VX1) continue;
      g.fillStyle(0x3a2208,1); g.fillRect(cx,cy,22,14);
      g.fillStyle(0x2a1a08,1); g.fillRect(cx,cy+14,22,7);
      g.fillStyle(0x4a3210,0.4); g.fillRect(cx,cy,22,5);
    }
  }

  function drawRelax(g) {
    const rx=VX2+WT, ry=HY2+WT;
    function sofa(x,y,w,h){
      g.fillStyle(0x7c2d3e,1); g.fillRect(x,y,w,h);
      g.fillStyle(0x9d3d52,0.8); g.fillRect(x,y,w,14); g.fillRect(x,y,15,h); g.fillRect(x+w-15,y,15,h);
    }
    sofa(rx+12,ry+28,105,52); sofa(rx+260,ry+28,105,52);
    g.fillStyle(0x3d2208,1); g.fillRect(rx+128,ry+38,120,36);
    g.fillStyle(0x5a3318,0.5); g.fillRect(rx+128,ry+38,120,7);
    sofa(rx+12,ry+140,230,58);
    g.fillStyle(0xf0e6c8,0.4); g.fillRect(rx+148,ry+47,18,14); g.fillRect(rx+200,ry+43,16,16);
  }

  function drawFountain(g,fx,fy) {
    g.fillStyle(0x0c4a6e,0.3); g.fillCircle(fx,fy,75);
    g.lineStyle(2,0x0ea5e9,0.4); g.strokeCircle(fx,fy,75);
    g.fillStyle(0x0369a1,0.5); g.fillCircle(fx,fy,40);
    g.lineStyle(1.5,0x38bdf8,0.4); g.strokeCircle(fx,fy,40);
    g.fillStyle(0x164e63,0.9); g.fillCircle(fx,fy,17);
    g.lineStyle(1,0x7dd3fc,0.4); g.strokeCircle(fx,fy,17);
  }

  function drawEntrance(g) {
    const ex=VX1+WT+(VX2-(VX1+WT))/2, ey=HY2+WT;
    g.fillStyle(0x1e293b,1); g.fillRect(ex-42,ey+80,84,140);
    g.lineStyle(2,0x475569,0.75); g.strokeRect(ex-42,ey+80,84,140);
    g.fillStyle(0xf59e0b,0.9); g.fillCircle(ex-16,ey+150,5);
    g.fillStyle(0x1e1e24,0.8); g.fillRect(ex-56,ey+218,112,16);
  }

  function drawPlant(g,x,y) {
    g.fillStyle(0x0f4d1a,1); g.fillRect(x-5,y,10,8);
    g.fillStyle(0x166534,1); g.fillCircle(x,y-8,11);
    g.fillStyle(0x15803d,0.7); g.fillCircle(x-5,y-13,7); g.fillCircle(x+5,y-13,7);
  }

  // ── Phaser Scene ──────────────────────────────────────────────────────────
  class GameScene extends Phaser.Scene {
    constructor(){
      super({key:'GameScene'});
      this.room=null; this.mySessionId=null;
      this.me=null; this.remotes=new Map();
      this.cursors=null; this.wasd=null; this.eKey=null;
      this.lastSend=0; this.lastSecond=-1;
      this.seatGfx=null; this.nearKiosk=false; this.nearSeatId=-1; this.panelOpen=false;
      this.mmDots=null;
    }

    async create(){
      buildMap(this);
      this.seatGfx=this.add.graphics().setDepth(6);

      // ── Minimap (fixed to camera, top-right) ──────────────────────────
      const MMW=170,MMH=128,MMX=VIEW_W-MMW-8,MMY=8,SX=MMW/WORLD_W,SY=MMH/WORLD_H;
      const mmBg=this.add.graphics().setScrollFactor(0).setDepth(100);
      mmBg.fillStyle(0x080400,0.88); mmBg.fillRect(MMX,MMY,MMW,MMH);
      // Zone colours on minimap
      for(const z of ZONES){
        mmBg.fillStyle(z.floor,0.8);
        mmBg.fillRect(MMX+z.x*SX,MMY+z.y*SY,z.w*SX,z.h*SY);
      }
      // Walls on minimap
      mmBg.fillStyle(0x1c0f04,1);
      WALLS.forEach(w=>mmBg.fillRect(MMX+w.x*SX,MMY+w.y*SY,Math.max(1,w.w*SX),Math.max(1,w.h*SY)));
      mmBg.lineStyle(1.5,0x5a3a10,0.9); mmBg.strokeRect(MMX,MMY,MMW,MMH);
      this.mmDots=this.add.graphics().setScrollFactor(0).setDepth(101);
      this._mmMeta={MMX,MMY,SX,SY};

      this.cameras.main.setBounds(0,0,WORLD_W,WORLD_H);
      this.cameras.main.setBackgroundColor('#1c0f04');

      this.cursors=this.input.keyboard.createCursorKeys();
      this.wasd=this.input.keyboard.addKeys({
        up:Phaser.Input.Keyboard.KeyCodes.W,down:Phaser.Input.Keyboard.KeyCodes.S,
        left:Phaser.Input.Keyboard.KeyCodes.A,right:Phaser.Input.Keyboard.KeyCodes.D,
      });
      this.eKey=this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
      // Don't intercept keys when a browser input/textarea is focused
      this.input.keyboard.disableGlobalCapture();

      window.__gameScene=this;
      window.addEventListener('sl:openPanel',  ()=>this.panelOpen=true);
      window.addEventListener('sl:closePanel', ()=>this.panelOpen=false);
      window.addEventListener('sl:sitDown',  e=>{ if(this.room) this.room.send('sitDown',{seatId:e.detail.seatId}); });
      window.addEventListener('sl:standUp',  ()=>{ if(this.room) this.room.send('standUp'); });
      window.addEventListener('sl:buySession',e=>{ if(this.room) this.room.send('buySession',{minutes:e.detail.minutes}); });

      const roomId=localStorage.getItem('sl_roomId');
      const client=new Colyseus.Client('${SERVER_WS}');
      try{
        const opts={username:MY_USERNAME,displayName:MY_NAME,
          gender:MY_APP.gender,skinColor:MY_APP.skin,hairColor:MY_APP.hair,
          shirtColor:MY_APP.shirt,pantsColor:MY_APP.pants,shoesColor:MY_APP.shoes};
        this.room=roomId?await client.joinById(roomId,opts):await client.joinOrCreate('library',opts);
      }catch{
        emit('connError',{msg:'Connection failed — is the server running?'});
        return;
      }

      this.mySessionId=this.room.sessionId;
      emit('connected',{roomLabel:this.room.name,roomId:this.room.id});

      this.room.onMessage('kicked',    ()=>emit('kicked',{}));
      this.room.onMessage('sessionEnd',d=>emit('sessionEnd',d));
      this.room.onMessage('actionError',d=>emit('actionError',d));

      this.room.state.players.onAdd((player,sid)=>{
        const sx=player.x||SPAWN_X, sy=player.y||SPAWN_Y;
        if(sid===this.mySessionId){
          const ch=makeChar(this,sx,sy,MY_APP,MY_NAME,true);
          this.cameras.main.startFollow(ch.con,true,0.1,0.1);
          this.me={...ch,x:sx,y:sy,moving:false,
            sessionSeconds:0,pstate:'idle',sessionLeft:0,seatId:-1,idleSince:0};
          player.onChange(()=>{
            if(!this.me)return;
            this.me.sessionSeconds=player.sessionSeconds;
            this.me.pstate=player.pstate;
            this.me.sessionLeft=player.sessionLeft;
            this.me.seatId=player.seatId;
            this.me.idleSince=player.idleSince;
            setDot(this.me.dot,player.pstate);
            if(player.pstate==='studying'){
              this.me.x=player.x; this.me.y=player.y;
              this.me.con.setPosition(this.me.x,this.me.y);
            }
            emit('stateChange',{pstate:this.me.pstate,sessionLeft:this.me.sessionLeft,
              sessionSeconds:this.me.sessionSeconds,seatId:this.me.seatId,idleSince:this.me.idleSince});
          });
        } else {
          const rApp={gender:player.gender||'male',skin:player.skin||0xf5c5a3,
            hair:player.hair||0x1a0a00,shirt:player.shirt||0xfb923c,
            pants:player.pants||0x1e2a4a,shoes:player.shoes||0x1a1008};
          const ch=makeChar(this,sx,sy,rApp,player.name||sid.slice(0,8),false);
          const e={...ch,name:player.name||sid.slice(0,8),x:sx,y:sy,
            targetX:sx,targetY:sy,sessionSeconds:player.sessionSeconds,
            sessionLeft:player.sessionLeft,pstate:player.pstate,seatId:player.seatId};
          this.remotes.set(sid,e);
          player.onChange(()=>{
            const r=this.remotes.get(sid); if(!r)return;
            r.targetX=player.x; r.targetY=player.y;
            r.dir=player.dir||'down';
            r.sessionSeconds=player.sessionSeconds; r.sessionLeft=player.sessionLeft;
            r.pstate=player.pstate; r.seatId=player.seatId;
            setDot(r.dot,player.pstate);
            this._emitPlayers();
          });
        }
        this._emitPlayers();
      });

      this.room.state.players.onRemove((_p,sid)=>{
        const r=this.remotes.get(sid);
        if(r){r.con.destroy();this.remotes.delete(sid);}
        this._emitPlayers();
      });

      // Chat relay: server → React
      this.room.onMessage('chatMsg',    data=>emit('chatMsg',    data));
      this.room.onMessage('chatHistory',data=>emit('chatHistory',data));
      this.room.onMessage('invite',     data=>emit('invite',     data));

      // Chat relay: React → server
      window.addEventListener('sl:chatSend',       e=>{ if(this.room) this.room.send('chatSend',{to:e.detail.to,body:e.detail.body}); });
      window.addEventListener('sl:chatHistoryReq', e=>{ if(this.room) this.room.send('chatHistory',{friend:e.detail.friend}); });
      window.addEventListener('sl:pauseSession',   ()=>{ if(this.room) this.room.send('pauseSession'); });
      window.addEventListener('sl:resumeSession',  ()=>{ if(this.room) this.room.send('resumeSession'); });
    }

    _emitPlayers(){
      const list=[];
      if(this.me) list.push({name:MY_NAME,sessionSeconds:this.me.sessionSeconds,pstate:this.me.pstate,isMe:true});
      this.remotes.forEach(r=>list.push({name:r.name,sessionSeconds:r.sessionSeconds,pstate:r.pstate,isMe:false}));
      emit('players',{list});
    }

    update(time,delta){
      if(!this.me||!this.room)return;
      const dt=delta/1000;
      const studying=this.me.pstate==='studying';

      // ── Movement with wall collision + sliding ────────────────────────
      const tag=(document.activeElement?.tagName||'');
      const inputFocused=tag==='INPUT'||tag==='TEXTAREA';
      if(!studying&&!this.panelOpen&&!inputFocused){
        const L=this.cursors.left.isDown||this.wasd.left.isDown;
        const R=this.cursors.right.isDown||this.wasd.right.isDown;
        const U=this.cursors.up.isDown||this.wasd.up.isDown;
        const D=this.cursors.down.isDown||this.wasd.down.isDown;
        let dx=0,dy=0,dir=this.me.dir;
        if(L){dx=-1;dir='left';} if(R){dx=1;dir='right';}
        if(U){dy=-1;dir='up';} if(D){dy=1;dir='down';}
        if(dx&&dy){dx*=0.707;dy*=0.707;}
        const moving=!!(dx||dy);
        if(moving){
          const nx=this.me.x+dx*SPEED*dt, ny=this.me.y+dy*SPEED*dt;
          if(!hitsWall(nx,ny)){ this.me.x=nx; this.me.y=ny; }
          else if(!hitsWall(nx,this.me.y)){ this.me.x=nx; }
          else if(!hitsWall(this.me.x,ny)){ this.me.y=ny; }
        }
        this.me.dir=dir; this.me.moving=moving;

        // Animate bean when moving
        if(moving) this.me.lp+=delta*0.007;
        if(moving||this.me.dir!==this.me.lastDir){
          drawCharacter(this.me.g,this.me.app,this.me.dir,moving?this.me.lp:0,true);
          this.me.lastDir=this.me.dir;
        }
      }

      this.me.con.setPosition(this.me.x,this.me.y);
      this.me.con.setDepth(9+this.me.y*0.0008);

      if(!studying&&time-this.lastSend>=SEND_MS){
        this.room.send('move',{x:this.me.x,y:this.me.y,dir:this.me.dir,moving:this.me.moving});
        this.lastSend=time;
      }

      // ── Remote player lerp + bean animation ──────────────────────────
      for(const[,r] of this.remotes){
        r.x=Phaser.Math.Linear(r.x,r.targetX,LERP);
        r.y=Phaser.Math.Linear(r.y,r.targetY,LERP);
        r.con.setPosition(r.x,r.y);
        r.con.setDepth(8+r.y*0.0008);
        const rMov=dist(r.x,r.y,r.targetX,r.targetY)>1.5;
        if(rMov) r.lp+=delta*0.007;
        if(rMov||r.dir!==r.lastDir){
          drawCharacter(r.g,r.app,r.dir,rMov?r.lp:0,false);
          r.lastDir=r.dir;
        }
      }

      // ── Proximity detection ───────────────────────────────────────────
      if(!studying){
        this.nearKiosk=dist(this.me.x,this.me.y,KIOSK_CX,KIOSK_CY)<INTERACT_R;
        this.nearSeatId=-1;
        if(this.me.pstate==='browsing'){
          let best=INTERACT_R,bestId=-1;
          const occ=new Set();
          this.remotes.forEach(r=>{if(r.pstate==='studying'&&r.seatId>=0)occ.add(r.seatId);});
          for(const s of SEATS){
            if(occ.has(s.id))continue;
            const d=dist(this.me.x,this.me.y,s.x,s.y);
            if(d<best){best=d;bestId=s.id;}
          }
          this.nearSeatId=bestId;
        }
        emit('proximity',{nearKiosk:this.nearKiosk,nearSeatId:this.nearSeatId,pstate:this.me.pstate});
      } else {
        if(this.nearKiosk||this.nearSeatId>=0){
          this.nearKiosk=false;this.nearSeatId=-1;
          emit('proximity',{nearKiosk:false,nearSeatId:-1,pstate:'studying'});
        }
      }

      // ── E key ─────────────────────────────────────────────────────────
      if(Phaser.Input.Keyboard.JustDown(this.eKey)){
        if(this.nearKiosk&&this.me.pstate!=='studying') emit('showPanel',{});
        else if(this.nearSeatId>=0&&this.me.pstate==='browsing')
          window.dispatchEvent(new CustomEvent('sl:sitDown',{detail:{seatId:this.nearSeatId}}));
      }

      // ── Per-second updates ────────────────────────────────────────────
      const sec=Math.floor(time/1000);
      if(sec!==this.lastSecond){
        this.lastSecond=sec;
        this.updateSeatGfx();
        if(this.me)emit('stateChange',{pstate:this.me.pstate,sessionLeft:this.me.sessionLeft,
          sessionSeconds:this.me.sessionSeconds,seatId:this.me.seatId,idleSince:this.me.idleSince});
        this._emitPlayers();

        // Update timer text above characters
        const fmtLeft=(s)=>{const m=Math.floor(s/60),sc=s%60;return m>0?(m+'m '+String(sc).padStart(2,'0')+'s'):(sc+'s');};
        if(this.me?.timerTxt){
          const show=this.me.pstate==='studying'||this.me.pstate==='paused';
          this.me.timerTxt.setVisible(show);
          if(show){
            this.me.timerTxt.setText(fmtLeft(this.me.sessionLeft));
            this.me.timerTxt.setColor(this.me.pstate==='paused'?'#fb923c':this.me.sessionLeft<300?'#ef4444':this.me.sessionLeft<900?'#f59e0b':'#a78bfa');
          }
        }
        this.remotes.forEach(r=>{
          if(!r.timerTxt)return;
          const show=r.pstate==='studying'||r.pstate==='paused';
          r.timerTxt.setVisible(show);
          if(show){
            r.timerTxt.setText(fmtLeft(r.sessionLeft));
            r.timerTxt.setColor(r.pstate==='paused'?'#fb923c':r.sessionLeft<300?'#ef4444':r.sessionLeft<900?'#f59e0b':'#a78bfa');
          }
        });
      }

      // ── Minimap player dots ───────────────────────────────────────────
      if(this.mmDots){
        const {MMX,MMY,SX,SY}=this._mmMeta;
        this.mmDots.clear();
        // other players
        this.remotes.forEach(r=>{
          this.mmDots.fillStyle((r.app&&r.app.shirt)||0xfb923c,0.85);
          this.mmDots.fillCircle(MMX+r.x*SX,MMY+r.y*SY,3);
        });
        // me (on top, larger)
        this.mmDots.fillStyle(MY_APP.shirt,1);
        this.mmDots.fillCircle(MMX+this.me.x*SX,MMY+this.me.y*SY,4.5);
        this.mmDots.lineStyle(1.5,0xffffff,0.7);
        this.mmDots.strokeCircle(MMX+this.me.x*SX,MMY+this.me.y*SY,4.5);
      }
    }

    updateSeatGfx(){
      this.seatGfx.clear();
      const taken=new Map();
      this.remotes.forEach(r=>{if(r.pstate==='studying'&&r.seatId>=0)taken.set(r.seatId,r.name);});
      if(this.me?.pstate==='studying'&&this.me.seatId>=0)taken.set(this.me.seatId,MY_NAME);
      for(const s of SEATS){
        if(taken.has(s.id)){
          this.seatGfx.fillStyle(0xa78bfa,0.9); this.seatGfx.fillCircle(s.x,s.y,6);
          this.seatGfx.lineStyle(1.5,0x7c3aed,0.6); this.seatGfx.strokeCircle(s.x,s.y,11);
        } else {
          this.seatGfx.fillStyle(0xf59e0b,0.28); this.seatGfx.fillCircle(s.x,s.y,5);
        }
      }
    }
  }

  new Phaser.Game({
    type:Phaser.AUTO, width:VIEW_W, height:VIEW_H,
    parent:'phaser-container', backgroundColor:'#1c0f04',
    scene:GameScene,
    scale:{mode:Phaser.Scale.RESIZE,autoCenter:Phaser.Scale.CENTER_BOTH},
  });
})();
`;

// ── React Component ────────────────────────────────────────────────────────
export default function GamePage() {
  const router = useRouter();
  const [scriptsReady, setScriptsReady]     = useState(0); // count loaded
  const [connected, setConnected]           = useState(false);
  const [myRoomId, setMyRoomId]             = useState<string|null>(null);
  const [inviteToast, setInviteToast]       = useState('');
  const [connErr, setConnErr]               = useState('');
  const [gameState, setGameState]           = useState<GameState>({ pstate:'idle', sessionLeft:0, sessionSeconds:0, seatId:-1, idleSince:0 });
  const [proximity, setProximity]           = useState({ nearKiosk:false, nearSeatId:-1, pstate:'idle' });
  const [players, setPlayers]               = useState<PlayerSnapshot[]>([]);
  const [showPanel, setShowPanel]           = useState(false);
  const [showKicked, setShowKicked]         = useState(false);
  const [hudMsg, setHudMsg]                 = useState('');
  const [myUsername, setMyUsername]         = useState('');
  const [myName, setMyName]                 = useState('');
  const [invites, setInvites]               = useState<InviteEntry[]>([]);
  // ── Chat state ──────────────────────────────────────────────────────────
  const [chatTab, setChatTab]               = useState<'board'|'chat'>('board');
  const [chatFriend, setChatFriend]         = useState<string|null>(null);
  const [chatFriendDisplay, setChatFriendDisplay] = useState('');
  const [chatMessages, setChatMessages]     = useState<Map<string, ChatMessage[]>>(new Map());
  const [unread, setUnread]                 = useState<Record<string,number>>({});
  const [friends, setFriends]               = useState<FriendEntry[]>([]);
  const [chatInput, setChatInput]           = useState('');
  const chatBottomRef                       = useRef<HTMLDivElement>(null);
  const gameScriptInjectedRef               = useRef(false);

  useEffect(() => {
    const n = localStorage.getItem('sl_name');
    const d = localStorage.getItem('sl_display');
    if (!n || !d) { window.location.href = '/join'; return; }
    setMyUsername(n);
    setMyName(d);
  }, []);

  // Poll for friend invites
  useEffect(() => {
    if (!myUsername) return;
    const poll = async () => {
      try {
        const data = await fetchInvites(myUsername);
        if (data.length > 0) {
          setInvites(prev => {
            const existing = new Set(prev.map(i => i.from));
            const fresh = data.filter(i => !existing.has(i.from));
            return fresh.length > 0 ? [...prev, ...fresh] : prev;
          });
        }
      } catch { /* server may be unreachable */ }
    };
    poll();
    const iv = setInterval(poll, 10000);
    return () => clearInterval(iv);
  }, [myUsername]);

  // Launch Phaser once both CDN scripts loaded
  useEffect(() => {
    if (scriptsReady < 2 || gameScriptInjectedRef.current) return;
    gameScriptInjectedRef.current = true;
    const el = document.createElement('script');
    el.textContent = GAME_SCRIPT;
    document.body.appendChild(el);
  }, [scriptsReady]);

  // Listen to game CustomEvents
  useEffect(() => {
    const on = (type: string, fn: (e: CustomEvent) => void) => {
      window.addEventListener('sl:' + type, fn as EventListener);
      return () => window.removeEventListener('sl:' + type, fn as EventListener);
    };

    const offs = [
      on('connected',   (e: CustomEvent) => { setConnected(true); setMyRoomId(e.detail.roomId ?? null); }),
      on('connError',   (e: CustomEvent) => setConnErr(e.detail.msg)),
      on('stateChange', (e: CustomEvent) => setGameState(e.detail)),
      on('proximity',   (e: CustomEvent) => setProximity(e.detail)),
      on('players',     (e: CustomEvent) => setPlayers(e.detail.list)),
      on('showPanel',   () => { setShowPanel(true); window.dispatchEvent(new CustomEvent('sl:openPanel')); }),
      on('kicked',      () => setShowKicked(true)),
      on('sessionEnd',  () => { setShowPanel(false); window.dispatchEvent(new CustomEvent('sl:closePanel')); }),
      on('actionError', (e: CustomEvent) => { setHudMsg(e.detail.message); setTimeout(() => setHudMsg(''), 2500); }),
      on('invite', (e: CustomEvent) => {
        const inv = e.detail;
        setInvites(prev => {
          const exists = prev.some(i => i.from === inv.from && i.roomId === inv.roomId);
          return exists ? prev : [...prev, inv];
        });
      }),
    ];

    return () => offs.forEach(f => f());
  }, []);

  // HUD idle countdown
  useEffect(() => {
    const iv = setInterval(() => {
      if (gameState.pstate !== 'studying' && gameState.idleSince > 0) {
        const left = Math.max(0, 60 - (Math.floor(Date.now()/1000) - gameState.idleSince));
        if (left <= 30) setHudMsg('');
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [gameState]);

  // Redirect after kick
  useEffect(() => {
    if (showKicked) {
      const t = setTimeout(() => { window.location.href = '/'; }, 3500);
      return () => clearTimeout(t);
    }
  }, [showKicked]);

  const closePanel = useCallback(() => {
    setShowPanel(false);
    window.dispatchEvent(new CustomEvent('sl:closePanel'));
  }, []);

  const buySession = useCallback((mins: number) => {
    window.dispatchEvent(new CustomEvent('sl:buySession', { detail:{ minutes:mins } }));
    closePanel();
  }, [closePanel]);

  const standUp = useCallback(() => {
    window.dispatchEvent(new CustomEvent('sl:standUp'));
  }, []);

  const pauseSession = useCallback(() => {
    window.dispatchEvent(new CustomEvent('sl:pauseSession'));
  }, []);

  const resumeSession = useCallback(() => {
    window.dispatchEvent(new CustomEvent('sl:resumeSession'));
  }, []);

  // Fetch friend list (with online status) — refresh every 20s
  useEffect(() => {
    if (!myUsername) return;
    const load = () => fetch(`http://localhost:2567/friends/${myUsername}`)
      .then(r => r.json())
      .then(d => setFriends(d.friends ?? []))
      .catch(() => {});
    load();
    const iv = setInterval(load, 20000);
    return () => clearInterval(iv);
  }, [myUsername]);

  const sendInvite = useCallback(async (toUsername: string) => {
    if (!myRoomId || !myUsername) return;
    try {
      const r = await fetch('http://localhost:2567/friends/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: myUsername, to: toUsername, roomId: myRoomId }),
      });
      const d = await r.json();
      if (d.ok) {
        setInviteToast(`Invite sent!`);
      } else {
        setInviteToast(d.error ?? 'Could not send invite');
      }
    } catch {
      setInviteToast('Network error');
    }
    setTimeout(() => setInviteToast(''), 2500);
  }, [myRoomId, myUsername]);

  // Fetch initial unread counts
  useEffect(() => {
    if (!myUsername) return;
    const poll = () => fetch(`http://localhost:2567/chat/unread/${myUsername}`)
      .then(r => r.json())
      .then(d => setUnread(d))
      .catch(() => {});
    poll();
    const iv = setInterval(poll, 15000);
    return () => clearInterval(iv);
  }, [myUsername]);

  // Listen to incoming chat messages from Phaser/Colyseus
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const msg: ChatMessage = e.detail;
      const meL = myUsername.toLowerCase();
      const key = msg.from.toLowerCase() === meL ? msg.to : msg.from;
      setChatMessages(prev => {
        const next = new Map(prev);
        next.set(key, [...(next.get(key) ?? []), msg]);
        return next;
      });
      if (msg.from.toLowerCase() !== meL) {
        setUnread(prev => ({ ...prev, [msg.from]: (prev[msg.from] ?? 0) + 1 }));
      }
    };
    window.addEventListener('sl:chatMsg', handler as EventListener);
    return () => window.removeEventListener('sl:chatMsg', handler as EventListener);
  }, [myUsername]);

  // Listen to history responses
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const { friend, msgs } = e.detail;
      setChatMessages(prev => { const n = new Map(prev); n.set(friend, msgs); return n; });
      setUnread(prev => { const n = { ...prev }; delete n[friend]; return n; });
    };
    window.addEventListener('sl:chatHistory', handler as EventListener);
    return () => window.removeEventListener('sl:chatHistory', handler as EventListener);
  }, []);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatFriend]);

  const openChat = useCallback((username: string, displayName: string) => {
    setChatFriend(username);
    setChatFriendDisplay(displayName);
    setUnread(prev => { const n = { ...prev }; delete n[username]; return n; });
    // Request history via Colyseus if in game, else via HTTP
    if ((window as any).__gameScene?.room) {
      window.dispatchEvent(new CustomEvent('sl:chatHistoryReq', { detail: { friend: username } }));
    } else {
      fetch(`http://localhost:2567/chat/history/${myUsername}/${username}`)
        .then(r => r.json())
        .then(msgs => setChatMessages(prev => { const n = new Map(prev); n.set(username, msgs); return n; }))
        .catch(() => {});
    }
  }, [myUsername]);

  const sendChat = useCallback(() => {
    const body = chatInput.trim();
    if (!body || !chatFriend) return;
    setChatInput('');
    if ((window as any).__gameScene?.room) {
      window.dispatchEvent(new CustomEvent('sl:chatSend', { detail: { to: chatFriend, body } }));
    } else {
      fetch('http://localhost:2567/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: myUsername, to: chatFriend, body }),
      }).then(r => r.json()).then(saved => {
        if (saved.ok) {
          const msg: ChatMessage = { id: saved.id, from: myUsername, to: chatFriend, body, createdAt: saved.createdAt };
          setChatMessages(prev => { const n = new Map(prev); n.set(chatFriend, [...(n.get(chatFriend) ?? []), msg]); return n; });
        }
      }).catch(() => {});
    }
  }, [chatInput, chatFriend, myUsername]);

  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);

  // ── Derived UI state ──────────────────────────────────────────────────
  const { pstate, sessionLeft, sessionSeconds, idleSince } = gameState;
  const nowSec = Math.floor(Date.now() / 1000);
  const idleFor = idleSince > 0 ? Math.max(0, nowSec - idleSince) : 0;
  const timeLeft = Math.max(0, 60 - idleFor);

  const sortedPlayers = [...players].sort((a,b) => b.sessionSeconds - a.sessionSeconds);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden' }}>
      {/* CDN scripts */}
      <Script src="https://cdn.jsdelivr.net/npm/phaser@3.60.0/dist/phaser.min.js" strategy="afterInteractive" onLoad={() => setScriptsReady(p => p+1)} />
      <Script src="https://unpkg.com/colyseus.js@0.15.0/dist/colyseus.js" strategy="afterInteractive" onLoad={() => setScriptsReady(p => p+1)} />

      {/* ── Nav ── */}
      <nav className="game-nav" style={{ position:'sticky', top:0 }}>
        <Link href="/" className="nav-logo">STUDY LIBRARY</Link>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontFamily:"'Space Mono',monospace", fontSize:12, color:'var(--muted)' }}>
            <span style={{ color:'var(--accent)' }}>{myName}</span>
            {myUsername && <span style={{ color:'var(--dim)', marginLeft:4 }}>@{myUsername}</span>}
          </span>
          <Link href="/leaderboard" className="nav-link">RANKINGS</Link>
          <Link href="/profile" className="nav-link">PROFILE</Link>
          <Link href="/" className="nav-link">LEAVE</Link>
          <span style={{
            fontFamily:"'Space Mono',monospace", fontSize:11,
            marginLeft:4,
            color: connected ? 'var(--accent)' : '#ef4444',
          }}>
            <span className={`live-dot${connected ? '' : ' dim'}`} style={{ marginRight:5 }} />
            {connected ? 'Online' : connErr ? 'Error' : 'Connecting…'}
          </span>
        </div>
      </nav>

      {/* ── Studying / Paused bar ── */}
      <AnimatePresence>
        {(pstate === 'studying' || pstate === 'paused') && (
          <motion.div
            initial={{ height:0, opacity:0 }}
            animate={{ height:'auto', opacity:1 }}
            exit={{ height:0, opacity:0 }}
            style={{
              background: pstate === 'paused' ? 'rgba(251,146,60,0.07)' : 'rgba(167,139,250,0.07)',
              borderBottom: pstate === 'paused' ? '1px solid rgba(251,146,60,0.3)' : '1px solid rgba(167,139,250,0.2)',
              overflow:'hidden',
            }}
          >
            <div style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'8px 28px',
              fontFamily:"'Space Mono',monospace",
            }}>
              <div style={{ fontSize:11, letterSpacing:'0.08em',
                color: pstate === 'paused' ? 'var(--amber)' : 'var(--muted)' }}>
                {pstate === 'paused' ? '⏸ PAUSED — CHAT TO REPLY' : 'SESSION IN PROGRESS'}
              </div>
              <div style={{
                fontSize:24, fontWeight:700,
                color: pstate === 'paused' ? 'var(--amber)'
                  : sessionLeft < 300 ? 'var(--red)'
                  : sessionLeft < 900 ? 'var(--amber)' : 'var(--purple)',
                animation: pstate !== 'paused' && sessionLeft < 300 ? 'flash 0.6s ease-in-out infinite alternate' : 'none',
              }}>
                {fmtHMS(sessionLeft)}
              </div>
              <div style={{ display:'flex', gap:8 }}>
                {pstate === 'studying' ? (
                  <button className="btn-ghost" style={{ fontSize:10, color:'var(--amber)' }}
                    onClick={() => { pauseSession(); setChatTab('chat'); }}>
                    ⏸ PAUSE
                  </button>
                ) : (
                  <button className="btn-neon" style={{ fontSize:10 }} onClick={resumeSession}>
                    ▶ RESUME
                  </button>
                )}
                <button className="btn-ghost" style={{ fontSize:10 }} onClick={standUp}>
                  END SESSION
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── HUD ── */}
      <div style={{
        padding:'5px 28px',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        fontFamily:"'Space Mono',monospace", fontSize:11, color:'var(--dim)',
        borderBottom:'1px solid var(--border)',
      }}>
        <span>WASD / Arrow keys to move · E to interact</span>
        <span style={{
          fontSize:13, fontWeight:700,
          color: hudMsg ? 'var(--amber)' : pstate === 'studying' ? 'var(--accent)' : 'var(--dim)',
          flex:1, textAlign:'center',
        }}>
          {hudMsg || (pstate === 'studying'
            ? `STUDYING: ${fmtHMS(sessionSeconds)}`
            : pstate === 'paused'
              ? `PAUSED AT ${fmtHMS(sessionSeconds)} · RESUME TO CONTINUE`
              : timeLeft <= 15 && idleSince > 0
                ? `${pstate === 'browsing' ? 'SIT DOWN' : 'BUY + SIT'}: ${timeLeft}s`
                : pstate === 'browsing'
                  ? 'FIND A DESK & PRESS [E]'
                  : 'HEAD TO THE COUNTER'
          )}
        </span>
        <span style={{
          color: timeLeft <= 15 && pstate !== 'studying' && idleSince > 0 ? 'var(--red)' : 'var(--dim)',
        }}>
          {pstate !== 'studying' && idleSince > 0 && `IDLE: ${timeLeft}s`}
        </span>
      </div>

      {/* ── Interaction hint ── */}
      <div style={{
        height:22, textAlign:'center',
        fontFamily:"'Space Mono',monospace", fontSize:11,
        color:'var(--accent)', letterSpacing:'0.08em',
        opacity: (proximity.nearKiosk && pstate !== 'studying') || proximity.nearSeatId >= 0 ? 1 : 0,
        transition:'opacity 0.2s',
      }}>
        {proximity.nearKiosk && pstate !== 'studying' && '[ E ] — OPEN SESSION COUNTER'}
        {proximity.nearSeatId >= 0 && pstate === 'browsing' && `[ E ] — SIT AT DESK ${proximity.nearSeatId + 1}`}
      </div>

      {/* ── Game row ── */}
      <div style={{
        display:'flex',
        gap:0,
        alignItems:'stretch',
        flex:1,
        minHeight:0,
        overflow:'hidden',
      }}>
        {/* Phaser canvas container */}
        <div id="phaser-container" style={{
          flex:1, minWidth:0,
          overflow:'hidden',
          background:'#1c0f04',
        }} />

        {/* ── Right panel: Board / Chat tabs ── */}
        <motion.div
          initial={{ opacity:0, x:14 }}
          animate={{ opacity:1, x:0 }}
          transition={{ duration:0.3, delay:0.2 }}
          style={{
            width:240, flexShrink:0,
            background:'var(--card)',
            borderLeft:'1px solid var(--border)',
            display:'flex', flexDirection:'column',
            overflow:'hidden',
            position:'relative',
          }}
        >
          {/* Corner brackets */}
          <div style={{ position:'absolute', top:-1, left:-1, width:10, height:10, borderTop:'2px solid var(--accent)', borderLeft:'2px solid var(--accent)' }} />
          <div style={{ position:'absolute', bottom:-1, right:-1, width:10, height:10, borderBottom:'2px solid var(--accent)', borderRight:'2px solid var(--accent)' }} />

          {/* Tab bar */}
          <div style={{
            display:'flex', borderBottom:'1px solid var(--border)', flexShrink:0,
          }}>
            {(['board','chat'] as const).map(tab => (
              <button key={tab} onClick={() => setChatTab(tab)}
                style={{
                  flex:1, padding:'9px 0',
                  background:'none', border:'none', cursor:'pointer',
                  fontFamily:"'Space Mono',monospace", fontSize:9,
                  letterSpacing:'0.1em',
                  color: chatTab === tab ? 'var(--accent)' : 'var(--dim)',
                  borderBottom: chatTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                  transition:'color 0.15s',
                  position:'relative',
                }}>
                {tab === 'board' ? 'BOARD' : 'CHAT'}
                {tab === 'chat' && totalUnread > 0 && (
                  <span style={{
                    position:'absolute', top:5, right:16,
                    background:'var(--red)', color:'#fff',
                    borderRadius:99, fontSize:8, fontWeight:700,
                    padding:'1px 5px', lineHeight:'14px',
                  }}>{totalUnread > 9 ? '9+' : totalUnread}</span>
                )}
              </button>
            ))}
          </div>

          {/* ── BOARD tab ── */}
          {chatTab === 'board' && (<>
            <div style={{ flex:1, overflowY:'auto', padding:'4px 0' }}>
              {sortedPlayers.length === 0 ? (
                <div style={{
                  textAlign:'center', padding:'28px 12px',
                  fontFamily:"'Space Mono',monospace",
                  fontSize:10, letterSpacing:'0.1em',
                  color:'var(--dim)', lineHeight:1.8,
                }}>
                  NO PLAYERS<br />IN THIS LIBRARY
                </div>
              ) : sortedPlayers.map((p, i) => {
                const rank = i + 1;
                const rankColor = rank === 1 ? '#f59e0b' : rank === 2 ? '#94a3b8' : rank === 3 ? '#cd7c3b' : 'var(--dim)';
                return (
                  <div key={p.name} style={{
                    display:'flex', alignItems:'center', gap:7,
                    padding:'7px 12px',
                    background: p.isMe ? 'rgba(245,158,11,0.06)' : 'transparent',
                    borderLeft: p.isMe ? '2px solid var(--accent)' : '2px solid transparent',
                  }}>
                    <span style={{
                      fontFamily:"'Space Mono',monospace",
                      fontSize:10, fontWeight:700,
                      width:22, textAlign:'right', flexShrink:0,
                      color: rankColor,
                    }}>#{rank}</span>
                    <span className={`live-dot${p.pstate === 'studying' || p.pstate === 'paused' ? ' purple' : p.pstate === 'browsing' ? ' amber' : ' dim'}`}
                      style={{ width:7, height:7 }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight:600,
                        color: p.isMe ? 'var(--accent)' : 'var(--text)',
                        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {p.name}
                      </div>
                      <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10,
                        color: rank <= 3 ? rankColor : p.isMe ? 'var(--accent)' : 'var(--dim)', marginTop:1 }}>
                        {fmtStudyTime(p.sessionSeconds)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ padding:'7px 12px', borderTop:'1px solid var(--border)',
              fontFamily:"'Space Mono',monospace", fontSize:9, letterSpacing:'0.1em',
              color:'var(--dim)', textAlign:'center', flexShrink:0 }}>
              STUDY TIME ONLY
            </div>
          </>)}

          {/* ── CHAT tab ── */}
          {chatTab === 'chat' && (<>
            {!chatFriend ? (
              /* Friend list */
              <div style={{ flex:1, overflowY:'auto' }}>
                {friends.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'28px 12px',
                    fontFamily:"'Space Mono',monospace", fontSize:9,
                    color:'var(--dim)', lineHeight:1.8 }}>
                    NO FRIENDS YET<br />
                    <Link href="/friends" style={{ color:'var(--accent)', fontSize:9 }}>ADD FRIENDS →</Link>
                  </div>
                ) : friends.map(f => {
                  const alreadyHere = f.roomId === myRoomId && !!myRoomId;
                  return (
                    <div key={f.username} style={{
                      display:'flex', alignItems:'center', gap:8,
                      padding:'8px 10px',
                      borderBottom:'1px solid rgba(255,255,255,0.04)',
                    }}>
                      {/* Avatar + online dot */}
                      <div style={{ position:'relative', flexShrink:0 }}>
                        <div style={{
                          width:30, height:30, borderRadius:'50%',
                          background:'rgba(245,158,11,0.1)',
                          border:'1px solid rgba(245,158,11,0.18)',
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:13, fontWeight:700, color:'var(--accent)',
                        }}>{f.displayName[0]?.toUpperCase()}</div>
                        {f.online && (
                          <span style={{
                            position:'absolute', bottom:0, right:0,
                            width:8, height:8, borderRadius:'50%',
                            background: alreadyHere ? '#a78bfa' : '#22c55e',
                            border:'1.5px solid var(--card)',
                          }} />
                        )}
                      </div>

                      {/* Name + last msg — clicking opens chat */}
                      <button onClick={() => openChat(f.username, f.displayName)}
                        style={{
                          flex:1, minWidth:0, background:'none', border:'none',
                          cursor:'pointer', textAlign:'left', padding:0,
                        }}>
                        <div style={{ fontSize:11, fontWeight:600, color:'var(--text)',
                          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          {f.displayName}
                        </div>
                        <div style={{ fontSize:9, color: alreadyHere ? '#a78bfa' : f.online ? '#22c55e' : 'var(--dim)',
                          fontFamily:"'Space Mono',monospace", marginTop:1 }}>
                          {alreadyHere ? 'in this room' : f.online ? `in ${f.roomLabel ?? 'library'}` : 'offline'}
                        </div>
                      </button>

                      {/* Unread badge */}
                      {(unread[f.username] ?? 0) > 0 && (
                        <span style={{
                          background:'var(--red)', color:'#fff',
                          borderRadius:99, fontSize:8, fontWeight:700,
                          padding:'1px 5px', flexShrink:0,
                        }}>{unread[f.username]}</span>
                      )}

                      {/* Invite button */}
                      {myRoomId && !alreadyHere && (
                        <button
                          onClick={() => sendInvite(f.username)}
                          title={`Invite ${f.displayName} to this room`}
                          style={{
                            flexShrink:0,
                            background:'rgba(245,158,11,0.12)',
                            border:'1px solid rgba(245,158,11,0.3)',
                            borderRadius:5, cursor:'pointer',
                            padding:'3px 7px',
                            fontFamily:"'Space Mono',monospace",
                            fontSize:8, color:'var(--accent)',
                            letterSpacing:'0.05em',
                            transition:'background 0.15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background='rgba(245,158,11,0.22)'}
                          onMouseLeave={e => e.currentTarget.style.background='rgba(245,158,11,0.12)'}
                        >
                          INVITE
                        </button>
                      )}
                      {alreadyHere && (
                        <span style={{
                          flexShrink:0, fontSize:8,
                          fontFamily:"'Space Mono',monospace",
                          color:'#a78bfa', letterSpacing:'0.05em',
                        }}>HERE</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Message thread */
              <>
                {/* Thread header */}
                <div style={{ padding:'8px 10px', borderBottom:'1px solid var(--border)',
                  display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                  <button onClick={() => setChatFriend(null)}
                    style={{ background:'none', border:'none', cursor:'pointer',
                      color:'var(--muted)', fontSize:14, lineHeight:1, padding:'2px 4px' }}>
                    ←
                  </button>
                  <span style={{ fontSize:12, fontWeight:600, color:'var(--text)',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {chatFriendDisplay}
                  </span>
                </div>

                {/* Messages */}
                <div style={{ flex:1, overflowY:'auto', padding:'8px 10px',
                  display:'flex', flexDirection:'column', gap:6 }}>
                  {(chatMessages.get(chatFriend) ?? []).map(msg => {
                    const isMe = msg.from.toLowerCase() === myUsername.toLowerCase();
                    return (
                      <div key={msg.id} style={{
                        display:'flex', flexDirection:'column',
                        alignItems: isMe ? 'flex-end' : 'flex-start', gap:2,
                      }}>
                        <span style={{
                          fontSize:9, fontWeight:700,
                          color: isMe ? '#a78bfa' : '#fbbf24',
                          fontFamily:"'Space Mono',monospace",
                        }}>
                          {isMe ? 'You' : chatFriendDisplay}
                        </span>
                        <div style={{
                          background: isMe ? 'rgba(167,139,250,0.2)' : 'rgba(245,158,11,0.14)',
                          border: isMe ? '1px solid rgba(167,139,250,0.38)' : '1px solid rgba(245,158,11,0.3)',
                          borderRadius: isMe ? '11px 11px 3px 11px' : '11px 11px 11px 3px',
                          padding:'6px 10px', maxWidth:'85%',
                          fontSize:12,
                          color: isMe ? '#ddd6fe' : '#fde68a',
                          lineHeight:1.5, wordBreak:'break-word',
                        }}>
                          {msg.body}
                        </div>
                        <span style={{ fontSize:9, color:'var(--dim)' }}>
                          {new Date(msg.createdAt * 1000).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}
                        </span>
                      </div>
                    );
                  })}
                  <div ref={chatBottomRef} />
                </div>

                {/* Input */}
                {(pstate === 'studying') ? (
                  <div style={{ padding:'8px 10px', borderTop:'1px solid var(--border)',
                    display:'flex', flexDirection:'column', gap:6, flexShrink:0 }}>
                    <div style={{ fontSize:10, color:'var(--amber)', textAlign:'center',
                      fontFamily:"'Space Mono',monospace", letterSpacing:'0.06em' }}>
                      PAUSE SESSION TO REPLY
                    </div>
                    <button className="btn-ghost" style={{ fontSize:10 }} onClick={() => { pauseSession(); }}>
                      ⏸ PAUSE &amp; REPLY
                    </button>
                  </div>
                ) : (
                  <div style={{ padding:'8px 10px', borderTop:'1px solid var(--border)',
                    display:'flex', gap:6, flexShrink:0 }}>
                    <input
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                      placeholder="Message…"
                      maxLength={500}
                      style={{
                        flex:1, background:'rgba(255,255,255,0.05)',
                        border:'1px solid var(--border)', borderRadius:6,
                        padding:'6px 9px', fontSize:12, color:'var(--text)',
                        outline:'none', fontFamily:'inherit',
                      }}
                    />
                    <button onClick={sendChat} disabled={!chatInput.trim()}
                      style={{
                        background: chatInput.trim() ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                        border:'none', borderRadius:6, padding:'0 10px',
                        color: chatInput.trim() ? '#000' : 'var(--dim)',
                        cursor: chatInput.trim() ? 'pointer' : 'default',
                        fontSize:14, fontWeight:700, flexShrink:0,
                        transition:'background 0.15s',
                      }}>
                      →
                    </button>
                  </div>
                )}
              </>
            )}
          </>)}
        </motion.div>
      </div>

      {/* ── Session purchase panel ── */}
      <AnimatePresence>
        {showPanel && (
          <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) closePanel(); }}>
            <motion.div
              className="modal-panel"
              style={{ maxWidth:520 }}
              initial={{ opacity:0, scale:0.96, y:14 }}
              animate={{ opacity:1, scale:1, y:0 }}
              exit={{ opacity:0, scale:0.96, y:8 }}
              transition={{ duration:0.2 }}
            >
              <div className="label-chip" style={{ marginBottom:10 }}>Session Counter</div>
              <h2 style={{ fontFamily:"'Space Mono',monospace", fontSize:18, fontWeight:700, marginBottom:6 }}>
                Choose your study block
              </h2>
              <p style={{ fontSize:13, color:'var(--muted)', marginBottom:22, lineHeight:1.5 }}>
                Select a duration, then walk to an empty desk and press <kbd style={{
                  fontFamily:"'Space Mono',monospace", fontSize:10,
                  padding:'1px 6px', border:'1px solid var(--border)',
                  borderRadius:3,
                }}>E</kbd> to sit and begin.
              </p>

              {/* Duration grid */}
              <div style={{
                display:'grid', gridTemplateColumns:'repeat(4,1fr)',
                gap:8, marginBottom:20,
              }}>
                {VALID_DURATIONS.map(mins => (
                  <button
                    key={mins}
                    onClick={() => buySession(mins)}
                    style={{
                      padding:'14px 0',
                      background:'var(--surface)',
                      border:'1px solid var(--border)',
                      borderRadius:6,
                      color:'var(--text)',
                      fontFamily:"'Space Mono',monospace",
                      cursor:'pointer',
                      display:'flex', flexDirection:'column',
                      alignItems:'center', gap:3,
                      transition:'border-color 0.15s, background 0.15s, color 0.15s',
                    }}
                    onMouseEnter={e => {
                      const el = e.currentTarget;
                      el.style.borderColor = 'var(--accent)';
                      el.style.color = 'var(--accent)';
                      el.style.background = 'rgba(245,158,11,0.07)';
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget;
                      el.style.borderColor = 'var(--border)';
                      el.style.color = 'var(--text)';
                      el.style.background = 'var(--surface)';
                    }}
                  >
                    <span style={{ fontSize:16, fontWeight:700 }}>{fmtDuration(mins)}</span>
                    <span style={{ fontSize:9, letterSpacing:'0.1em', color:'var(--dim)' }}>
                      {DURATION_LABELS[mins]}
                    </span>
                  </button>
                ))}
              </div>

              {/* Idle warning */}
              <div style={{
                display:'flex', alignItems:'center', justifyContent:'space-between',
                padding:'10px 14px',
                background:'rgba(248,113,113,0.07)',
                border:'1px solid rgba(248,113,113,0.18)',
                borderRadius:6,
              }}>
                <span style={{ fontFamily:"'Space Mono',monospace", fontSize:11, color:'var(--red)' }}>
                  KICKED IF IDLE: {timeLeft}s
                </span>
                <button className="btn-ghost" style={{ fontSize:10, padding:'5px 12px' }} onClick={closePanel}>
                  CLOSE
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Friend invite toasts ── */}
      <div style={{
        position:'fixed', bottom:24, right:24,
        display:'flex', flexDirection:'column', gap:10,
        zIndex:500, pointerEvents:'none',
      }}>
        <AnimatePresence>
          {invites.map(inv => (
            <motion.div
              key={inv.from}
              initial={{ opacity:0, x:40, scale:0.95 }}
              animate={{ opacity:1, x:0, scale:1 }}
              exit={{ opacity:0, x:40, scale:0.95 }}
              transition={{ duration:0.22 }}
              style={{
                pointerEvents:'auto',
                background:'rgba(13,13,26,0.97)',
                border:'1px solid rgba(167,139,250,0.45)',
                borderRadius:10,
                padding:'14px 16px',
                minWidth:280, maxWidth:320,
                boxShadow:'0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(167,139,250,0.1)',
                position:'relative',
              }}
            >
              <div style={{ position:'absolute', top:-1, left:-1, width:8, height:8, borderTop:'2px solid var(--purple)', borderLeft:'2px solid var(--purple)' }} />
              <div style={{ position:'absolute', bottom:-1, right:-1, width:8, height:8, borderBottom:'2px solid var(--purple)', borderRight:'2px solid var(--purple)' }} />
              <div style={{
                fontFamily:"'Space Mono',monospace",
                fontSize:9, letterSpacing:'0.12em',
                color:'var(--purple)', marginBottom:6,
              }}>
                FRIEND INVITE
              </div>
              <div style={{ fontSize:13, color:'var(--text)', marginBottom:4, lineHeight:1.5 }}>
                <strong style={{ color:'var(--accent)' }}>{inv.fromDisplay}</strong>
                {' '}invited you to{' '}
                <strong>{inv.roomLabel}</strong>
              </div>
              <div style={{ display:'flex', gap:8, marginTop:10 }}>
                <button
                  className="btn-neon"
                  style={{ flex:1, justifyContent:'center', fontSize:10, padding:'7px 0' }}
                  onClick={() => {
                    // Leave current Colyseus room cleanly before switching
                    try { (window as any).__gameScene?.room?.leave(); } catch {}
                    localStorage.setItem('sl_roomId', inv.roomId);
                    // Full reload so Phaser + Colyseus reinitialise into the invited room
                    window.location.href = '/game';
                  }}
                >
                  JOIN →
                </button>
                <button
                  className="btn-ghost"
                  style={{ fontSize:10, padding:'7px 14px' }}
                  onClick={() => setInvites(prev => prev.filter(i => i.from !== inv.from))}
                >
                  DISMISS
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Invite toast ── */}
      <AnimatePresence>
        {inviteToast && (
          <motion.div
            initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:12 }}
            style={{
              position:'fixed', bottom:28, left:'50%', transform:'translateX(-50%)',
              background:'rgba(245,158,11,0.12)', border:'1px solid rgba(245,158,11,0.35)',
              borderRadius:8, padding:'10px 22px',
              fontFamily:"'Space Mono',monospace", fontSize:12,
              color:'var(--accent)', letterSpacing:'0.06em', zIndex:400,
              whiteSpace:'nowrap',
              pointerEvents:'none',
            }}
          >
            {inviteToast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Kicked overlay ── */}
      <AnimatePresence>
        {showKicked && (
          <motion.div
            initial={{ opacity:0 }}
            animate={{ opacity:1 }}
            style={{
              position:'fixed', inset:0,
              background:'rgba(3,3,8,0.94)',
              zIndex:999,
              display:'flex', flexDirection:'column',
              alignItems:'center', justifyContent:'center', gap:16,
            }}
          >
            <div style={{
              fontFamily:"'Space Mono',monospace",
              fontSize:72, fontWeight:700,
              color:'var(--red)', opacity:0.3,
              lineHeight:1,
            }}>
              IDLE
            </div>
            <div style={{ fontSize:22, fontWeight:700 }}>
              You were removed from the library
            </div>
            <div style={{ fontSize:14, color:'var(--muted)' }}>
              You didn&apos;t start a session within 1 minute.
            </div>
            <div style={{ width:240, height:3, background:'rgba(255,255,255,0.08)', borderRadius:2, overflow:'hidden', marginTop:8 }}>
              <div style={{ height:'100%', background:'var(--red)', borderRadius:2, animation:'shrink 3.5s linear forwards' }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
