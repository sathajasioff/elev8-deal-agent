"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, ReferenceLine } from "recharts";

// ─── MARKET DATA ─────────────────────────────────────────────────────────────
const DEFAULT_RENTS = {
  montreal:{studio:1100,"3.5":1400,"4.5":1700,"5.5":2050,"6.5":2400},
  laval:{studio:980,"3.5":1280,"4.5":1550,"5.5":1850,"6.5":2150},
  longueuil:{studio:930,"3.5":1220,"4.5":1480,"5.5":1780,"6.5":2080},
  quebec:{studio:870,"3.5":1120,"4.5":1380,"5.5":1650,"6.5":1950},
  sherbrooke:{studio:760,"3.5":970,"4.5":1180,"5.5":1430,"6.5":1680},
  gatineau:{studio:920,"3.5":1220,"4.5":1480,"5.5":1740,"6.5":2040},
  "saint-jerome":{studio:860,"3.5":1120,"4.5":1330,"5.5":1590,"6.5":1840},
  granby:{studio:720,"3.5":920,"4.5":1120,"5.5":1340,"6.5":1580},
  brossard:{studio:1000,"3.5":1300,"4.5":1580,"5.5":1880,"6.5":2200},
  "saint-hyacinthe":{studio:780,"3.5":980,"4.5":1190,"5.5":1420,"6.5":1680},
  other:{studio:820,"3.5":1040,"4.5":1250,"5.5":1490,"6.5":1750},
};
const PRICE_PER_DOOR={
  montreal:{duplex:400000,triplex:320000,quadruplex:280000},
  laval:{duplex:355000,triplex:285000,quadruplex:250000},
  longueuil:{duplex:320000,triplex:258000,quadruplex:225000},
  quebec:{duplex:230000,triplex:182000,quadruplex:160000},
  sherbrooke:{duplex:180000,triplex:148000,quadruplex:128000},
  gatineau:{duplex:260000,triplex:208000,quadruplex:182000},
  "saint-jerome":{duplex:238000,triplex:190000,quadruplex:165000},
  granby:{duplex:165000,triplex:132000,quadruplex:118000},
  brossard:{duplex:375000,triplex:300000,quadruplex:262000},
  "saint-hyacinthe":{duplex:188000,triplex:150000,quadruplex:130000},
  other:{duplex:205000,triplex:163000,quadruplex:143000},
};
const APPRECIATION={montreal:4.5,laval:4.0,longueuil:3.8,quebec:3.5,sherbrooke:3.2,gatineau:3.6,"saint-jerome":3.4,granby:2.8,brossard:4.2,"saint-hyacinthe":2.9,other:3.0};
const VACANCY_RATE={montreal:2.3,laval:1.8,longueuil:2.0,quebec:2.1,sherbrooke:1.5,gatineau:2.8,"saint-jerome":1.6,granby:1.4,brossard:2.0,"saint-hyacinthe":1.3,other:2.5};
const TAX_BRACKETS=[{max:51780,rate:.274},{max:103545,rate:.374},{max:111733,rate:.434},{max:119910,rate:.454},{max:154906,rate:.484},{max:173205,rate:.514},{max:246752,rate:.524},{max:Infinity,rate:.534}];

const CITIES=["montreal","laval","longueuil","quebec","sherbrooke","gatineau","saint-jerome","granby","brossard","saint-hyacinthe","other"];
const UNIT_TYPES=["studio","3.5","4.5","5.5","6.5"];
const PROPERTY_TYPES=["duplex","triplex","quadruplex"];
const UNIT_COUNTS={duplex:2,triplex:3,quadruplex:4};
const DEAL_STATUSES=["En analyse","Offre faite","Due diligence","Fermé","Passé"];

// ─── UTILS ───────────────────────────────────────────────────────────────────
const safe=(n)=>isFinite(n)&&!isNaN(n)?n:0;
const fmt=(n)=>new Intl.NumberFormat("fr-CA",{style:"currency",currency:"CAD",maximumFractionDigits:0}).format(safe(n));
const fmtN=(n,d=2)=>safe(n).toLocaleString("fr-CA",{minimumFractionDigits:d,maximumFractionDigits:d});
const pct=(n)=>`${safe(n)>=0?"+":""}${safe(n).toFixed(1)}%`;
const parseMoney=(s)=>{const v=parseFloat((s||"").toString().replace(/\s/g,"").replace(/,/g,""));return isFinite(v)?v:0;};
const safeDiv=(a,b)=>b===0||!isFinite(b)?null:safe(a/b);
const getMR=(income)=>{for(const b of TAX_BRACKETS){if(safe(income)<=b.max)return b.rate;}return .534;};

function mp(principal,rate,amort){
  if(principal<=0||rate<=0)return 0;
  const r=rate/100/12,n=amort*12;
  return safe(principal*(r*Math.pow(1+r,n))/(Math.pow(1+r,n)-1));
}
function cmhcPrem(price,dp){
  if(dp>=20)return 0;
  return price*(1-dp/100)*(dp<10?.040:dp<15?.031:.028);
}
function calcIRR(cfs){
  try{
    if(!cfs||cfs.length<2)return null;
    if(!cfs.some(c=>c<0)||!cfs.some(c=>c>0))return null;
    let r=.10;
    for(let i=0;i<300;i++){
      let npv=0,d=0;
      cfs.forEach((c,t)=>{const disc=Math.pow(1+r,t);if(!isFinite(disc)||disc===0)return;npv+=c/disc;d-=(t*c)/((1+r)*disc);});
      if(!isFinite(npv)||d===0||!isFinite(d))return null;
      const nr=r-npv/d;
      if(!isFinite(nr)||nr<-.99||nr>100)return null;
      if(Math.abs(nr-r)<.00001)return isFinite(nr*100)?nr*100:null;
      r=nr;
    }
    return null;
  }catch{return null;}
}

// ─── CORE ANALYSIS ────────────────────────────────────────────────────────────
function buildAnalysis(cfg,rents=DEFAULT_RENTS){
  const{city,propertyType,askingPrice,municipalEval,expenses,units,downPct,rate,amort,rentGrowth,appreciationOverride,projectionYears,personalIncome,negotiatedPrice}=cfg;
  const numUnits=UNIT_COUNTS[propertyType]||3;
  const r=rents[city]||rents.other;
  const doors=PRICE_PER_DOOR[city]||PRICE_PER_DOOR.other;
  const expRatio=Math.min(Math.max((parseFloat(expenses)||30)/100,0),.9);
  const askP=parseMoney(askingPrice);
  const price=negotiatedPrice>0?negotiatedPrice:askP;
  const munEval=parseMoney(municipalEval);
  const vacRate=(VACANCY_RATE[city]||2.5)/100;
  const appRate=((parseFloat(appreciationOverride)||APPRECIATION[city]||3.5))/100;
  const rgRate=(parseFloat(rentGrowth)||2.5)/100;
  const years=Math.min(parseInt(projectionYears)||10,10);
  const dPct=parseFloat(downPct)||20;
  const iRate=parseFloat(rate)||5.5;
  const aYears=parseInt(amort)||25;

  const unitResults=(units||[]).map(u=>({...u,marketRent:safe(r[u.type]||1200),current:safe(parseFloat(u.currentRent)||0),gap:safe((r[u.type]||1200)-(parseFloat(u.currentRent)||0))}));
  const currentGRI=safe(unitResults.reduce((s,u)=>s+u.current*12,0));
  const optimizedGRI=safe(unitResults.reduce((s,u)=>s+u.marketRent*12,0));
  const vacancyLoss=safe(optimizedGRI*vacRate);
  const effectiveGRI=safe(optimizedGRI-vacancyLoss);
  const currentNOI=safe(currentGRI*(1-expRatio));
  const optimizedNOI=safe(effectiveGRI*(1-expRatio));
  const mktVPD=safe(doors[propertyType]||200000);
  const compValue=safe(mktVPD*numUnits);
  const ppd=price>0?safe(price/numUnits):0;
  const ppdDelta=price>0?safeDiv((ppd-mktVPD)*100,mktVPD):null;
  const evalRatio=munEval>0&&price>0?safeDiv(price,munEval):null;
  const capRate=price>0?safeDiv(currentNOI*100,price):null;
  const optCapRate=price>0?safeDiv(optimizedNOI*100,price):null;
  const rentUpside=safe(optimizedGRI-currentGRI);
  const totalUnderRent=unitResults.filter(u=>u.gap>0).length;

  const mort=calcMort(price,dPct,iRate,aYears);
  const cmhc=safe(cmhcPrem(price,dPct));
  const annualDebt=safe(mort.payment*12);
  const monthlyCF=price>0?safeDiv(currentNOI-annualDebt,12):null;
  const optMonthlyCF=price>0?safeDiv(optimizedNOI-annualDebt,12):null;
  const dscr=annualDebt>0?safeDiv(currentNOI,annualDebt):null;
  const totalInv=price>0?safe(mort.down+cmhc+price*.015):0;
  const coc=totalInv>0&&monthlyCF!==null?safeDiv(monthlyCF*12*100,totalInv):null;

  // Projection
  const projection=[];let cumCF=0;const cashflows=totalInv>0?[-totalInv]:[];
  for(let y=1;y<=years;y++){
    const gri=safe(effectiveGRI*Math.pow(1+rgRate,y));const noi=safe(gri*(1-expRatio));
    const cf=safeDiv(noi-annualDebt,12)||0;cumCF=safe(cumCF+cf*12);
    const pv=safe(price*Math.pow(1+appRate,y));const mb=safe(mort.balance[y]?.balance||0);const eq=safe(pv-mb);
    if(totalInv>0)cashflows.push(safe(cf*12));
    projection.push({year:y,gri:Math.round(gri),noi:Math.round(noi),cashflowMonthly:Math.round(cf),cashflowAnnual:Math.round(cf*12),cumulativeCashflow:Math.round(cumCF),propValue:Math.round(pv),mortgageBalance:Math.round(mb),equity:Math.round(eq),totalReturn:Math.round(eq-totalInv+cumCF)});
  }
  let irr=null;
  if(cashflows.length>=2&&totalInv>0){const last=projection[projection.length-1];if(last){const fc=[...cashflows];fc[fc.length-1]=safe(fc[fc.length-1]+(last.propValue*.96)-last.mortgageBalance);irr=calcIRR(fc);}}

  // Stress
  const base=monthlyCF||0;
  const stressTests=[
    {label:"Taux +2%",desc:`${(iRate+2).toFixed(1)}%`,fn:()=>safeDiv(currentNOI-calcMort(price,dPct,iRate+2,aYears).payment*12,12)},
    {label:"Taux +3%",desc:`${(iRate+3).toFixed(1)}%`,fn:()=>safeDiv(currentNOI-calcMort(price,dPct,iRate+3,aYears).payment*12,12)},
    {label:"Vacance 10%",desc:"2 mois/unité",fn:()=>safeDiv((currentGRI*.90)*(1-expRatio)-annualDebt,12)},
    {label:"Loyers -10%",desc:"Correction marché",fn:()=>safeDiv((currentGRI*.90)*(1-expRatio)-annualDebt,12)},
    {label:"Dépenses +5%",desc:"Hausse entretien",fn:()=>safeDiv(currentGRI*(1-Math.min(expRatio+.05,.95))-annualDebt,12)},
    {label:"Pire cas",desc:"Tous les facteurs",fn:()=>safeDiv((currentGRI*.90)*(1-Math.min(expRatio+.05,.95))-calcMort(price,dPct,iRate+2,aYears).payment*12,12)},
  ].map(s=>{try{const cf=s.fn();if(cf===null)return null;return{label:s.label,desc:s.desc,cashflow:Math.round(cf),delta:Math.round(cf-base),safe:cf>=0};}catch{return null;}}).filter(Boolean);

  // BRRRR
  const bY=3;const bVal=safe(price*Math.pow(1+appRate,bY));const bMB=safe(mort.balance[bY]?.balance||mort.principal);
  const bMax=safe(bVal*.80);const bCO=safe(Math.max(bMax-bMB,0));
  const bPay=safe(mp(bMax,iRate+.5,Math.max(aYears-bY,5)));
  const bCF=safeDiv(optimizedNOI-bPay*12,12)||0;
  const bROC=totalInv>0?safeDiv(bCO*100,totalInv)||0:0;

  // Tax
  const marginalRate=getMR(parseMoney(personalIncome)||80000);
  const buildingVal=price*.70;const ccaY1=buildingVal*.04*.50;const ccaY2=buildingVal*.04;
  const taxSavingY1=safe(currentNOI*marginalRate-(Math.max(0,currentNOI-ccaY1))*marginalRate);
  const taxSavingY2=safe(ccaY2*marginalRate);
  const taxAnalysis={buildingValue:safe(buildingVal),landValue:safe(price*.30),ccaYear1:safe(ccaY1),ccaYear2Plus:safe(ccaY2),marginalRate,ccaTaxSavingY1:taxSavingY1,ccaTaxSavingY2:taxSavingY2,annualInterest:safe(mort.payment*12*.85),interestDeduction:safe(mort.payment*12*.85*marginalRate),corpTaxY1:safe(Math.max(0,(currentNOI-ccaY1)*.122)),personalTaxY1:safe(Math.max(0,(currentNOI-ccaY1)*marginalRate)),salePrice:safe(price*Math.pow(1+appRate,years)),capitalGain:safe(price*Math.pow(1+appRate,years)-price),inclusionRate:.50};

  // Score
  let score=0;
  if(ppdDelta!==null&&ppdDelta<-5)score+=2;else if(ppdDelta!==null&&ppdDelta<5)score+=1;
  if(capRate!==null&&capRate>=5)score+=2;else if(capRate!==null&&capRate>=3.5)score+=1;
  if(rentUpside>6000)score+=2;else if(rentUpside>2000)score+=1;
  if(monthlyCF!==null&&monthlyCF>300)score+=2;else if(monthlyCF!==null&&monthlyCF>0)score+=1;
  if(irr!==null&&irr>12)score+=2;else if(irr!==null&&irr>8)score+=1;

  let verdict;
  if(!price||price===0)verdict={label:"—",color:"#6B6B8A",sub:"Entrer le prix"};
  else if(score>=8)verdict={label:"FORT ACHAT",color:"#10B981",sub:"Rendement institutionnel"};
  else if(score>=6)verdict={label:"BON DEAL",color:"#34D399",sub:"Métriques solides"};
  else if(score>=4)verdict={label:"POTENTIEL",color:"#6366F1",sub:"Upside présent, négocier"};
  else if(score>=2)verdict={label:"NEUTRE",color:"#F59E0B",sub:"Surveiller ou passer"};
  else verdict={label:"ÉVITER",color:"#EF4444",sub:"Rendement insuffisant"};

  return {unitResults,currentGRI,optimizedGRI,effectiveGRI,vacancyLoss,currentNOI,optimizedNOI,comparativeValue:compValue,marketValuePerDoor:mktVPD,pricePerDoor:ppd,ppdDelta,evalRatio,currentCapRate:capRate,optimizedCapRate:optCapRate,rentUpside,totalUnderRent,numUnits,verdict,score,price,askP,munEval,mortgage:mort,cmhc,annualDebt,monthlyCashflow:monthlyCF,optimizedMonthlyCashflow:optMonthlyCF,dscr,cashOnCash:coc,totalInvestment:totalInv,vacRate,city,propertyType,expRatio,projection,irr,stressTests,brrrr:{brrrrY:bY,brrrrVal:bVal,brrrrMortBal:bMB,brrrrMaxRefi:bMax,brrrrCashOut:bCO,brrrrNewPayment:bPay,brrrrNewCashflow:bCF,brrrrROC:bROC,equityLeft:safe(bVal-bMax)},appRate,rentGrowthRate:rgRate,years,taxAnalysis,marginalRate};
}

function calcMort(price,downPct,rate,amort){
  const down=price*(downPct/100),principal=price-down;
  if(principal<=0||rate<=0)return{payment:0,principal:safe(principal),down,balance:[]};
  const r=rate/100/12,n=amort*12;
  const payment=mp(principal,rate,amort);
  if(!isFinite(payment))return{payment:0,principal,down,balance:[]};
  let bal=principal,totP=0;
  const balance=[{year:0,balance:bal,equity:down}];
  for(let y=1;y<=Math.min(amort,10);y++){
    let yp=0;for(let m=0;m<12;m++){const i=bal*r;const pp=payment-i;yp+=pp;bal=Math.max(bal-pp,0);}
    totP+=yp;balance.push({year:y,balance:safe(bal),equity:safe(down+totP)});
  }
  return{payment:safe(payment),principal:safe(principal),down:safe(down),balance};
}

// ─── STORAGE ──────────────────────────────────────────────────────────────────
const store={
  get:(k,def)=>{try{const v=localStorage.getItem(k);return v!==null?JSON.parse(v):def;}catch{return def;}},
  set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}},
};

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

// Access Gate — codes validated client-side for artifact, server-side in Next.js version
const VALID_CODES=["ELEV8","BATISSEUR","DEALAGENT","SERUJAN2025","PLEX2025"];
function AccessGate({onUnlock}){
  const[code,setCode]=useState("");const[err,setErr]=useState(false);const[shake,setShake]=useState(false);
  const attempt=()=>{
    if(VALID_CODES.includes(code.toUpperCase().trim())){store.set("ea_access","1");onUnlock();}
    else{setErr(true);setShake(true);setTimeout(()=>setShake(false),400);}
  };
  return(
    <div style={{minHeight:"100vh",background:"#06060F",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'DM Sans',system-ui,sans-serif"}}>
      <div style={{width:"100%",maxWidth:360,textAlign:"center"}}>
        <div style={{width:56,height:56,background:"linear-gradient(135deg,#6366F1,#8B5CF6)",borderRadius:16,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,margin:"0 auto 20px"}}>◈</div>
        <div style={{fontSize:22,fontWeight:800,color:"#D0D0F0",marginBottom:6,letterSpacing:"-0.02em"}}>Elev8 Deal Agent</div>
        <div style={{fontSize:13,color:"#44446A",marginBottom:28,lineHeight:1.6}}>Accès réservé aux étudiants Elev8.<br/>Entre ton code d'accès pour continuer.</div>
        <div style={{transform:shake?"translateX(-5px)":"none",transition:"transform .1s"}}>
          <input value={code} onChange={e=>{setCode(e.target.value);setErr(false);}} onKeyDown={e=>e.key==="Enter"&&attempt()} placeholder="Code d'accès" style={{width:"100%",background:"#0C0C1A",border:`1.5px solid ${err?"#EF4444":"#1E1E35"}`,color:"#D0D0F0",borderRadius:12,padding:"14px 16px",fontSize:16,outline:"none",marginBottom:10,textAlign:"center",letterSpacing:"0.15em",textTransform:"uppercase",fontFamily:"inherit"}}/>
          {err&&<div style={{fontSize:12,color:"#EF4444",marginBottom:10}}>Code invalide — contacte ton formateur.</div>}
          <button onClick={attempt} style={{width:"100%",background:"#6366F1",color:"white",border:"none",borderRadius:12,padding:"14px",fontSize:14,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>ACCÉDER</button>
        </div>
        <div style={{marginTop:24,fontSize:12,color:"#22224A"}}>Pas encore étudiant? <a href="https://elev8.ca" target="_blank" rel="noreferrer" style={{color:"#6366F1",textDecoration:"none"}}>elev8.ca →</a></div>
      </div>
    </div>
  );
}

// Reusable stat card
function Stat({label,value,sub,color,size=20}){
  return(
    <div style={{background:"#0C0C1A",borderRadius:12,padding:"14px 16px",border:`1px solid ${color||"#1A1A28"}18`}}>
      <div style={{fontSize:10,color:"#33335A",fontWeight:700,letterSpacing:".1em",marginBottom:5,textTransform:"uppercase"}}>{label}</div>
      <div style={{fontSize:size,fontWeight:800,color:color||"#D0D0F0",lineHeight:1}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:"#44446A",marginTop:4}}>{sub}</div>}
    </div>
  );
}

function ScoreBar({score,max=10}){
  const c=score>=8?"#10B981":score>=6?"#34D399":score>=4?"#6366F1":score>=2?"#F59E0B":"#EF4444";
  return<div style={{display:"flex",gap:3,alignItems:"center"}}>{[...Array(max)].map((_,i)=><div key={i} style={{width:6,height:13,borderRadius:3,background:i<score?c:"#181828"}}/>)}<span style={{fontSize:10,color:"#33335A",marginLeft:6,fontFamily:"monospace"}}>{score}/{max}</span></div>;
}

const CT=({active,payload,label})=>{
  if(!active||!payload?.length)return null;
  return<div style={{background:"#0E0E1E",border:"1px solid #252540",borderRadius:8,padding:"9px 12px",fontSize:11}}><div style={{color:"#5050A0",marginBottom:5,fontWeight:700}}>Année {label}</div>{payload.map((p,i)=><div key={i} style={{color:p.color,marginBottom:2}}>{p.name}: {Math.abs(p.value||0)>1000?fmt(p.value):`${p.value}`}</div>)}</div>;
};

// ─── PORTFOLIO DASHBOARD ──────────────────────────────────────────────────────
function PortfolioDashboard({deals,onLoad,onDelete,onStatusChange,onNew,onClose}){
  const totalCF=deals.reduce((s,d)=>s+(d.snapshot?.cf||0),0);
  const totalValue=deals.reduce((s,d)=>s+(d.snapshot?.price||0),0);
  const avgScore=deals.length?deals.reduce((s,d)=>s+(d.snapshot?.score||0),0)/deals.length:0;
  const statColors={green:"#10B981",red:"#EF4444",purple:"#6366F1",amber:"#F59E0B"};
  const statusColors={"En analyse":"#6366F1","Offre faite":"#F59E0B","Due diligence":"#8B5CF6","Fermé":"#10B981","Passé":"#44446A"};
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",zIndex:200,display:"flex",flexDirection:"column",fontFamily:"'DM Sans',system-ui,sans-serif"}}>
      <div style={{background:"#08080F",borderBottom:"1px solid #101020",padding:"14px 18px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
        <div style={{fontSize:15,fontWeight:800,color:"#D0D0F0",flex:1}}>Portfolio — Mes deals</div>
        <button onClick={onNew} style={{background:"#6366F1",color:"white",border:"none",borderRadius:8,padding:"8px 16px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>+ Nouveau deal</button>
        <button onClick={onClose} style={{background:"none",border:"none",color:"#44446A",fontSize:20,cursor:"pointer",lineHeight:1}}>×</button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"16px"}}>
        {/* Summary */}
        {deals.length>0&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:20}}>
            <Stat label="Deals actifs" value={deals.filter(d=>d.status!=="Passé").length} color="#6366F1" size={24}/>
            <Stat label="CF total/mois" value={fmt(totalCF)} color={totalCF>=0?"#10B981":"#EF4444"} size={18}/>
            <Stat label="Valeur totale" value={fmt(totalValue)} color="#8B5CF6" size={18}/>
            <Stat label="Score moyen" value={`${avgScore.toFixed(1)}/10`} color="#F59E0B" size={24}/>
          </div>
        )}
        {deals.length===0&&(
          <div style={{textAlign:"center",color:"#33335A",fontSize:14,padding:"60px 20px"}}>
            <div style={{fontSize:32,marginBottom:12}}>◈</div>
            Aucun deal sauvegardé.<br/>Analyse un deal et clique sur Sauvegarder.
          </div>
        )}
        {deals.map((d,i)=>{
          const vc=d.snapshot?.verdictColor||"#6B6B8A";
          const sc=statusColors[d.status||"En analyse"]||"#6366F1";
          return(
            <div key={d.id} style={{background:"#0C0C1A",border:"1px solid #181828",borderRadius:14,padding:"16px",marginBottom:12}}>
              <div style={{display:"flex",gap:12,alignItems:"flex-start",flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:180}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
                    <div style={{fontSize:14,fontWeight:700}}>{d.label||`Deal ${i+1}`}</div>
                    <span style={{fontSize:10,fontWeight:700,color:sc,background:sc+"18",padding:"2px 9px",borderRadius:20}}>{d.status||"En analyse"}</span>
                  </div>
                  <div style={{fontSize:11,color:"#44446A",marginBottom:8}}>{d.form?.propertyType} · {d.form?.city} · {d.form?.askingPrice?parseMoney(d.form.askingPrice).toLocaleString("fr-CA")+"$":""}</div>
                  <div style={{fontSize:11,color:"#33335A"}}>{new Date(d.savedAt).toLocaleDateString("fr-CA")}</div>
                  {d.snapshot&&(
                    <div style={{display:"flex",gap:14,marginTop:10,flexWrap:"wrap"}}>
                      <span style={{fontSize:12,fontWeight:700,color:d.snapshot.cf>=0?"#10B981":"#EF4444"}}>CF: {fmt(d.snapshot.cf)}/mois</span>
                      <span style={{fontSize:12,fontWeight:700,color:"#6366F1"}}>Cap: {d.snapshot.capRate?d.snapshot.capRate.toFixed(1)+"%":"—"}</span>
                      <span style={{fontSize:12,fontWeight:700,color:vc}}>{d.snapshot.verdict}</span>
                      <span style={{fontSize:12,color:"#44446A"}}>Score: {d.snapshot.score}/10</span>
                    </div>
                  )}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
                  <select value={d.status||"En analyse"} onChange={e=>onStatusChange(d.id,e.target.value)} style={{background:"#09091A",border:"1px solid #1A1A28",color:"#9090B0",borderRadius:8,padding:"6px 10px",fontSize:11,fontFamily:"inherit",cursor:"pointer"}}>
                    {DEAL_STATUSES.map(s=><option key={s}>{s}</option>)}
                  </select>
                  <button onClick={()=>{onLoad(d);onClose();}} style={{background:"#6366F1",color:"white",border:"none",borderRadius:8,padding:"8px 14px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Charger</button>
                  <button onClick={()=>onDelete(d.id)} style={{background:"#14141E",color:"#EF4444",border:"1px solid #EF444425",borderRadius:8,padding:"8px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Supprimer</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── NEGOTIATION SLIDER ───────────────────────────────────────────────────────
function NegotiationSimulator({result,form,rents}){
  const ask=result.askP||result.price||0;
  const [negPrice,setNegPrice]=useState(ask);
  const min=Math.round(ask*.75/1000)*1000;
  const max=Math.round(ask*1.10/1000)*1000;
  const neg=buildAnalysis({...form,negotiatedPrice:negPrice},rents);
  const saving=ask-negPrice;
  const cfDiff=neg.monthlyCashflow!==null&&result.monthlyCashflow!==null?neg.monthlyCashflow-result.monthlyCashflow:0;
  return(
    <div className="si">
      <div style={{background:"#09091A",borderRadius:12,padding:"16px",marginBottom:14,border:"1px solid #1A1A28"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:8}}>
          <div style={{fontSize:11,fontWeight:700,color:"#44446A",letterSpacing:".08em",textTransform:"uppercase"}}>Prix négocié</div>
          <div style={{fontSize:20,fontWeight:800,color:"#6366F1"}}>{fmt(negPrice)}</div>
        </div>
        <input type="range" min={min} max={max} step={5000} value={negPrice} onChange={e=>setNegPrice(parseInt(e.target.value))} style={{width:"100%",marginBottom:6}}/>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#33335A"}}>
          <span>{fmt(min)} (-25%)</span><span>Prix demandé: {fmt(ask)}</span><span>{fmt(max)} (+10%)</span>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        <Stat label="Économie sur le prix" value={fmt(saving)} color={saving>0?"#10B981":"#44446A"}/>
        <Stat label="Gain cashflow/mois" value={`${cfDiff>=0?"+":""}${fmt(cfDiff)}`} color={cfDiff>0?"#10B981":cfDiff<0?"#EF4444":"#44446A"}/>
        <Stat label="Nouveau cap rate" value={neg.currentCapRate!==null?`${neg.currentCapRate.toFixed(2)}%`:"—"} color={neg.currentCapRate>=5?"#10B981":neg.currentCapRate>=3.5?"#F59E0B":"#EF4444"}/>
        <Stat label="Nouveau cashflow" value={neg.monthlyCashflow!==null?fmt(neg.monthlyCashflow):"—"} color={neg.monthlyCashflow>=300?"#10B981":neg.monthlyCashflow>=0?"#F59E0B":"#EF4444"}/>
      </div>
      <div style={{background:"#0C0C1A",border:"1px solid #181828",borderRadius:12,padding:"14px",marginBottom:14}}>
        <div style={{fontSize:10,fontWeight:700,color:"#33335A",letterSpacing:".1em",textTransform:"uppercase",marginBottom:10}}>Comparaison directe</div>
        {[
          ["Prix","Prix demandé",fmt(ask),"Prix négocié",fmt(negPrice)],
          ["Cashflow/mois","Actuel",fmt(result.monthlyCashflow||0),"Négocié",fmt(neg.monthlyCashflow||0)],
          ["Cap rate","Actuel",result.currentCapRate?`${result.currentCapRate.toFixed(2)}%`:"—","Négocié",neg.currentCapRate?`${neg.currentCapRate.toFixed(2)}%`:"—"],
          ["DSCR","Actuel",result.dscr?fmtN(result.dscr):"—","Négocié",neg.dscr?fmtN(neg.dscr):"—"],
          ["Cash-on-cash","Actuel",result.cashOnCash?`${result.cashOnCash.toFixed(1)}%`:"—","Négocié",neg.cashOnCash?`${neg.cashOnCash.toFixed(1)}%`:"—"],
          ["Score","Actuel",`${result.score}/10`,"Négocié",`${neg.score}/10`],
        ].map(([label,l1,v1,l2,v2],i)=>(
          <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,padding:"7px 0",borderBottom:i<5?"1px solid #101020":"none",fontSize:12}}>
            <span style={{color:"#44446A"}}>{label}</span>
            <div style={{textAlign:"right"}}><span style={{fontSize:9,color:"#33335A",display:"block"}}>{l1}</span><span style={{fontWeight:600}}>{v1}</span></div>
            <div style={{textAlign:"right"}}><span style={{fontSize:9,color:"#6366F1",display:"block"}}>{l2}</span><span style={{fontWeight:600,color:neg.score>result.score?"#10B981":neg.score<result.score?"#EF4444":"inherit"}}>{v2}</span></div>
          </div>
        ))}
      </div>
      <div style={{background:"#080E14",border:"1px solid #10B98120",borderRadius:12,padding:"14px"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#10B981",letterSpacing:".08em",textTransform:"uppercase",marginBottom:8}}>Argument de négociation</div>
        <div style={{fontSize:13,color:"#7070A0",lineHeight:1.7}}>
          {saving>0?`En négociant ${fmt(ask)} à ${fmt(negPrice)}, tu récupères ${fmt(saving)} sur le prix d'achat. Ton cashflow mensuel passe de ${fmt(result.monthlyCashflow||0)} à ${fmt(neg.monthlyCashflow||0)} — une amélioration de ${fmt(cfDiff)}/mois soit ${fmt(cfDiff*12)}/an.`:"Glisse le curseur vers la gauche pour simuler une négociation à la baisse."}
        </div>
      </div>
    </div>
  );
}

// ─── RENOVATION SIMULATOR ─────────────────────────────────────────────────────
function RenoSimulator({result,form,rents}){
  const[renoCost,setRenoCost]=useState(50000);
  const[rentIncrease,setRentIncrease]=useState(150);
  const[valueIncrease,setValueIncrease]=useState(0);
  const numUnits=result.numUnits||3;
  const annualRentGain=rentIncrease*12*numUnits;
  const newNOI=safe(result.currentNOI+annualRentGain*(1-result.expRatio));
  const newPrice=result.price>0?result.price+valueIncrease:0;
  const newCapRate=newPrice>0?safeDiv(newNOI*100,newPrice):null;
  const newPayment=calcMort(newPrice>0?newPrice:result.price,parseFloat(form.downPct)||20,parseFloat(form.rate)||5.5,parseInt(form.amort)||25).payment;
  const newCF=safeDiv(newNOI-newPayment*12,12);
  const cfGain=newCF!==null&&result.monthlyCashflow!==null?newCF-result.monthlyCashflow:0;
  const roi=renoCost>0?safeDiv(annualRentGain*100,renoCost):null;
  const payback=annualRentGain>0?safeDiv(renoCost,annualRentGain):null;
  return(
    <div className="si">
      <div style={{background:"#09091A",borderRadius:12,padding:"16px",marginBottom:14,border:"1px solid #1A1A28"}}>
        <div style={{fontSize:10,fontWeight:700,color:"#33335A",letterSpacing:".1em",textTransform:"uppercase",marginBottom:12}}>Paramètres de rénovation</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div>
            <div style={{fontSize:11,color:"#44446A",marginBottom:4}}>Coût de rénovation ($)</div>
            <input type="range" min={5000} max={200000} step={5000} value={renoCost} onChange={e=>setRenoCost(parseInt(e.target.value))} style={{width:"100%",marginBottom:4}}/>
            <div style={{fontSize:14,fontWeight:700,color:"#6366F1",textAlign:"center"}}>{fmt(renoCost)}</div>
          </div>
          <div>
            <div style={{fontSize:11,color:"#44446A",marginBottom:4}}>Hausse loyer/unité ($/mois)</div>
            <input type="range" min={0} max={600} step={25} value={rentIncrease} onChange={e=>setRentIncrease(parseInt(e.target.value))} style={{width:"100%",marginBottom:4}}/>
            <div style={{fontSize:14,fontWeight:700,color:"#10B981",textAlign:"center"}}>+{fmt(rentIncrease)}/mois</div>
          </div>
          <div>
            <div style={{fontSize:11,color:"#44446A",marginBottom:4}}>Plus-value créée ($)</div>
            <input type="range" min={0} max={200000} step={5000} value={valueIncrease} onChange={e=>setValueIncrease(parseInt(e.target.value))} style={{width:"100%",marginBottom:4}}/>
            <div style={{fontSize:14,fontWeight:700,color:"#8B5CF6",textAlign:"center"}}>{fmt(valueIncrease)}</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",background:"#0C0C1A",borderRadius:10,padding:"12px"}}>
            <div style={{fontSize:10,color:"#33335A",marginBottom:4}}>ROI rénovation</div>
            <div style={{fontSize:20,fontWeight:800,color:roi&&roi>=15?"#10B981":roi&&roi>=8?"#F59E0B":"#EF4444"}}>{roi?`${roi.toFixed(1)}%`:"—"}</div>
            <div style={{fontSize:10,color:"#33335A",marginTop:4}}>Récup. en {payback?`${payback.toFixed(1)} ans`:"—"}</div>
          </div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        <Stat label="Gain loyers/an" value={fmt(annualRentGain)} color="#10B981"/>
        <Stat label="Gain cashflow/mois" value={`${cfGain>=0?"+":""}${fmt(cfGain)}`} color={cfGain>0?"#10B981":cfGain<0?"#EF4444":"#44446A"}/>
        <Stat label="NOI post-réno" value={fmt(newNOI)} color="#6366F1"/>
        <Stat label="Cap rate post-réno" value={newCapRate?`${newCapRate.toFixed(2)}%`:"—"} color={newCapRate>=5?"#10B981":newCapRate>=3.5?"#F59E0B":"#EF4444"}/>
      </div>
      <div style={{background:"#0C0C1A",border:"1px solid #181828",borderRadius:12,padding:"14px"}}>
        <div style={{fontSize:10,fontWeight:700,color:"#33335A",letterSpacing:".1em",textTransform:"uppercase",marginBottom:10}}>Avant vs Après réno</div>
        {[
          ["Revenus bruts/an",fmt(result.currentGRI),fmt(safe(result.currentGRI+annualRentGain))],
          ["NOI annuel",fmt(result.currentNOI),fmt(newNOI)],
          ["Cashflow mensuel",fmt(result.monthlyCashflow||0),fmt(newCF||0)],
          ["Cap rate",result.currentCapRate?`${result.currentCapRate.toFixed(2)}%`:"—",newCapRate?`${newCapRate.toFixed(2)}%`:"—"],
          ["Valeur propriété",fmt(result.price),fmt(newPrice>0?newPrice:result.price)],
        ].map(([l,v1,v2],i)=>(
          <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,padding:"7px 0",borderBottom:i<4?"1px solid #101020":"none",fontSize:12}}>
            <span style={{color:"#44446A"}}>{l}</span>
            <span style={{textAlign:"right",fontWeight:600}}>{v1}</span>
            <span style={{textAlign:"right",fontWeight:600,color:"#10B981"}}>{v2}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── DEAL SUBMISSION ──────────────────────────────────────────────────────────
function DealSubmission({result,form,onClose}){
  const[name,setName]=useState("");const[phone,setPhone]=useState("");const[notes,setNotes]=useState("");const[sent,setSent]=useState(false);const[sending,setSending]=useState(false);
  const submit=async()=>{
    setSending(true);
    const body=`NOUVEAU DEAL — Elev8 Deal Agent\n\nNom: ${name}\nTéléphone: ${phone}\n\nDEAL:\n${form.propertyType} · ${form.city}\nPrix demandé: ${fmt(result.price)}\nNOI: ${fmt(result.currentNOI)}/an\nCashflow: ${fmt(result.monthlyCashflow)}/mois\nCap rate: ${result.currentCapRate?.toFixed(2)||"N/A"}%\nScore: ${result.score}/10\nVerdict: ${result.verdict.label}\n\nNotes:\n${notes}`;
    try{
      await fetch("/api/submit-deal",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,phone,notes,dealSummary:body})});
    }catch{}
    setSent(true);setSending(false);
  };
  if(sent)return(
    <div style={{background:"#081812",border:"1px solid #10B98130",borderRadius:14,padding:"24px",textAlign:"center"}}>
      <div style={{fontSize:28,marginBottom:12}}>✓</div>
      <div style={{fontSize:15,fontWeight:800,color:"#10B981",marginBottom:8}}>Deal soumis à Serujan</div>
      <div style={{fontSize:13,color:"#447744",lineHeight:1.7}}>Tu recevras un retour dans les 24h ouvrables. Serujan a reçu tous les détails de ton analyse.</div>
      <button onClick={onClose} style={{marginTop:16,background:"#10B981",color:"white",border:"none",borderRadius:8,padding:"10px 24px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Fermer</button>
    </div>
  );
  return(
    <div style={{background:"#09091A",border:"1px solid #6366F125",borderRadius:14,padding:"20px"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <div style={{width:38,height:38,background:"linear-gradient(135deg,#6366F1,#8B5CF6)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>◈</div>
        <div>
          <div style={{fontSize:14,fontWeight:800,color:"#D0D0F0"}}>Soumettre ce deal à Serujan</div>
          <div style={{fontSize:11,color:"#44446A"}}>Analyse personnalisée · Retour en 24h · Courtier spécialisé plex QC</div>
        </div>
      </div>
      <div style={{background:"#0C0C1A",borderRadius:10,padding:"12px 14px",marginBottom:14,fontSize:12,color:"#6060A0"}}>
        <div style={{fontWeight:700,marginBottom:6,color:"#8080A0"}}>Deal qui sera soumis:</div>
        {form.propertyType} · {form.city} · {fmt(result.price)} · Score {result.score}/10 · Verdict: {result.verdict.label}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <div><div style={{fontSize:11,color:"#44446A",marginBottom:5}}>Ton nom</div><input value={name} onChange={e=>setName(e.target.value)} placeholder="Prénom Nom" style={{background:"#0C0C1A",border:"1px solid #1E1E35",color:"#D0D0F0",borderRadius:8,padding:"9px 12px",fontSize:13,width:"100%",outline:"none",fontFamily:"inherit"}}/></div>
        <div><div style={{fontSize:11,color:"#44446A",marginBottom:5}}>Téléphone</div><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="514-XXX-XXXX" style={{background:"#0C0C1A",border:"1px solid #1E1E35",color:"#D0D0F0",borderRadius:8,padding:"9px 12px",fontSize:13,width:"100%",outline:"none",fontFamily:"inherit"}}/></div>
      </div>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,color:"#44446A",marginBottom:5}}>Notes ou questions (optionnel)</div>
        <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Ex: J'ai visité la propriété, les locataires sont en place..." rows={3} style={{background:"#0C0C1A",border:"1px solid #1E1E35",color:"#D0D0F0",borderRadius:8,padding:"9px 12px",fontSize:13,width:"100%",outline:"none",fontFamily:"inherit",resize:"vertical"}}/>
      </div>
      <button onClick={submit} disabled={!name||!phone||sending} style={{width:"100%",background:(!name||!phone)?"#14141E":"#6366F1",color:(!name||!phone)?"#2A2A55":"white",border:"none",borderRadius:10,padding:"13px",fontSize:14,fontWeight:800,cursor:(!name||!phone)?"not-allowed":"pointer",fontFamily:"inherit"}}>
        {sending?<span style={{animation:"pulse 1.4s infinite"}}>Envoi en cours...</span>:"ENVOYER À SERUJAN →"}
      </button>
    </div>
  );
}

// ─── ADDRESS SEARCH ───────────────────────────────────────────────────────────
function AddressSearch({onDataFound}){
  const[address,setAddress]=useState("");const[status,setStatus]=useState("idle");const[log,setLog]=useState([]);const[found,setFound]=useState(null);
  const LC={start:"#6366F1",info:"#44446A",search:"#F59E0B",success:"#10B981",warn:"#F59E0B",error:"#EF4444"};
  const addLog=(msg,type="info")=>setLog(p=>[...p,{msg,type}]);
  const search=async()=>{
    if(!address.trim())return;setStatus("searching");setLog([]);setFound(null);
    addLog(`Recherche: "${address}"`,"start");addLog("Centris · Registre foncier · JLR...","info");
    try{
      const resp=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,tools:[{type:"web_search_20250305",name:"web_search"}],messages:[{role:"user",content:`Recherche immobilière Québec pour: "${address}". JSON uniquement:\n{"found":true,"address":"","city":"montreal|laval|longueuil|quebec|sherbrooke|gatineau|saint-jerome|granby|brossard|saint-hyacinthe|other","propertyType":"duplex|triplex|quadruplex","askingPrice":0,"municipalEval":0,"yearBuilt":0,"units":[{"type":"4.5","currentRent":0}],"recentSales":[{"date":"","price":0,"description":""}],"confidence":"high|medium|low","notes":"","sources":[]}`}]})});
      const data=await resp.json();
      (data.content||[]).filter(b=>b.type==="tool_use").forEach(t=>addLog(`⌕ ${t.input?.query||""}`,"search"));
      const txt=(data.content||[]).find(b=>b.type==="text")?.text||"";
      let parsed=null;try{const m=txt.match(/\{[\s\S]*\}/);if(m)parsed=JSON.parse(m[0]);}catch{}
      if(parsed){addLog(`Confiance: ${parsed.confidence||"medium"}`,"success");setFound(parsed);setStatus("found");}
      else{addLog("Données partielles — remplissage manuel requis","warn");setStatus("error");}
    }catch(e){addLog(`Erreur: ${e.message}`,"error");setStatus("error");}
  };
  return(
    <div style={{background:"#0A0A16",border:"1px solid #1A1A30",borderRadius:12,overflow:"hidden",marginBottom:12}}>
      <div style={{padding:"12px 14px",background:"#0C0C1A",borderBottom:"1px solid #1A1A30"}}>
        <div style={{display:"flex",gap:8}}>
          <input value={address} onChange={e=>setAddress(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()} placeholder="Adresse · Ex: 1234 rue Masson, Montréal" style={{flex:1,background:"#07071A",border:"1px solid #1E1E38",borderRadius:9,padding:"9px 12px",fontSize:13,color:"#D0D0F0",outline:"none",fontFamily:"inherit"}}/>
          <button onClick={search} disabled={status==="searching"||!address.trim()} style={{background:status==="searching"?"#14142A":"#6366F1",color:status==="searching"?"#33336A":"white",border:"none",borderRadius:9,padding:"9px 16px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
            {status==="searching"?<span style={{animation:"pulse 1.4s infinite"}}>...</span>:"⌕ Chercher"}
          </button>
        </div>
      </div>
      {log.length>0&&<div style={{background:"#050510",padding:"8px 12px",maxHeight:90,overflowY:"auto",borderBottom:found?"1px solid #1A1A30":"none"}}>{log.map((l,i)=><div key={i} style={{fontSize:10,color:LC[l.type]||"#44446A",fontFamily:"monospace",marginBottom:2}}>{l.msg}</div>)}</div>}
      {found&&<div style={{padding:"10px 14px"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:6,marginBottom:10}}>
          {[["Type",found.propertyType||"—"],["Prix",found.askingPrice>0?fmt(found.askingPrice):"N/D"],["Éval.",found.municipalEval>0?fmt(found.municipalEval):"—"],["Année",found.yearBuilt||"—"]].map(([l,v],i)=><div key={i} style={{background:"#0A0A18",border:"1px solid #181830",borderRadius:7,padding:"7px 10px"}}><div style={{fontSize:9,color:"#33335A",fontWeight:700,marginBottom:2}}>{l}</div><div style={{fontSize:12,fontWeight:700,color:"#B0B0D8"}}>{v}</div></div>)}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>onDataFound(found)} style={{flex:1,background:"#10B981",color:"white",border:"none",borderRadius:8,padding:"9px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>Appliquer au formulaire</button>
          <button onClick={()=>{setStatus("idle");setLog([]);setFound(null);}} style={{background:"#0E0E1A",color:"#44446A",border:"1px solid #1A1A2E",borderRadius:8,padding:"9px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>×</button>
        </div>
      </div>}
    </div>
  );
}

// ─── BEGINNER VIEW ────────────────────────────────────────────────────────────
function BeginnerView({result,form}){
  if(!result)return null;
  const{verdict,currentCapRate,monthlyCashflow,rentUpside,price,comparativeValue,ppdDelta,totalUnderRent,numUnits}=result;
  const vc=verdict.color;
  const tips={"#10B981":"Bonnes métriques. Si le secteur est solide et l'état correct, ça mérite une offre.","#34D399":"Deal intéressant. Vérifie l'état et négocie si possible.","#6366F1":"Du potentiel — négocie le prix ou optimise les loyers.","#F59E0B":"Chiffres serrés. Vérifie si les loyers peuvent augmenter.","#EF4444":"Deal ne passe pas les chiffres. Négocie fort ou passe.","#6B6B8A":"Entre un prix demandé pour obtenir le verdict."};
  return(
    <div className="si">
      <div style={{background:`rgba(${{"#10B981":"16,185,129","#34D399":"52,211,153","#6366F1":"99,102,241","#F59E0B":"245,158,11","#EF4444":"239,68,68","#6B6B8A":"107,107,138"}[vc]||"99,102,241"},.07)`,border:`1px solid ${vc}30`,borderRadius:14,padding:"20px",marginBottom:14,textAlign:"center"}}>
      <div style={{fontSize:10,fontWeight:700,color:"#6366F1",letterSpacing:".1em",marginBottom:6}}>VERDICT</div>
      <div style={{fontSize:32,fontWeight:900,color:vc,letterSpacing:"-0.03em",marginBottom:6}}>{verdict.label}</div>
      <div style={{fontSize:13,color:"#7070A0",maxWidth:340,margin:"0 auto",lineHeight:1.6}}>{tips[vc]}</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
        <Stat label="💰 Cashflow/mois" value={monthlyCashflow!==null?`${monthlyCashflow>=0?"+":""}${Math.round(monthlyCashflow)}$`:"—"} color={monthlyCashflow>=300?"#10B981":monthlyCashflow>=0?"#F59E0B":"#EF4444"} sub="Après hypothèque" size={16}/>
        <Stat label="📊 Cap rate" value={currentCapRate!==null?`${currentCapRate.toFixed(1)}%`:"—"} color={currentCapRate>=5?"#10B981":currentCapRate>=3.5?"#F59E0B":"#EF4444"} sub="4.5%+ = correct QC" size={16}/>
        <Stat label="📈 Upside loyers" value={`+${Math.round(rentUpside/12)}$/mois`} color="#6366F1" sub={`${totalUnderRent}/${numUnits} logements`} size={16}/>
      </div>
      <div style={{background:"#0C0C1A",borderRadius:12,padding:"14px",marginBottom:14,border:"1px solid #181828"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#33335A",letterSpacing:".08em",textTransform:"uppercase",marginBottom:10}}>Le prix est-il justifié?</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          <div><div style={{fontSize:10,color:"#44446A",marginBottom:3}}>Prix demandé</div><div style={{fontSize:15,fontWeight:700}}>{price>0?fmt(price):"—"}</div></div>
          <div><div style={{fontSize:10,color:"#44446A",marginBottom:3}}>Valeur marché</div><div style={{fontSize:15,fontWeight:700,color:"#6366F1"}}>{fmt(comparativeValue)}</div></div>
          <div><div style={{fontSize:10,color:"#44446A",marginBottom:3}}>Écart</div><div style={{fontSize:15,fontWeight:700,color:ppdDelta!==null?(ppdDelta<-3?"#10B981":ppdDelta>8?"#EF4444":"#F59E0B"):"#44446A"}}>{ppdDelta!==null?`${ppdDelta>=0?"+":""}${ppdDelta.toFixed(1)}%`:"—"}</div></div>
        </div>
      </div>
      <div style={{background:"#07070F",border:"1px solid #6366F115",borderRadius:12,padding:"14px"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#6366F1",letterSpacing:".08em",textTransform:"uppercase",marginBottom:10}}>Tes prochaines étapes</div>
        {[price<=0?"1. Entre le prix demandé":"1. ✓ Prix entré",totalUnderRent>0?`2. ${totalUnderRent} logement(s) sous le marché — planifie les augmentations`:"2. ✓ Loyers au marché",monthlyCashflow!==null&&monthlyCashflow<0?"3. Cashflow négatif — négocie le prix ou trouve un partenaire":"3. ✓ Cashflow positif","4. Consulte un courtier hypothécaire pour confirmer ta qualification","5. Fais inspecter le bâtiment avant de signer"].map((s,i)=><div key={i} style={{fontSize:12,color:"#5060A0",marginBottom:7,lineHeight:1.5}}>{s}</div>)}
      </div>
    </div>
  );
}

// ─── DEFAULT FORM ─────────────────────────────────────────────────────────────
const defaultForm=()=>({city:"montreal",propertyType:"triplex",askingPrice:"",municipalEval:"",expenses:"30",downPct:"20",rate:"5.50",amort:"25",rentGrowth:"2.5",appreciationOverride:"",projectionYears:"10",personalIncome:"120000",structure:"personal",addressNotes:"",negotiatedPrice:0,units:[{id:0,type:"4.5",currentRent:""},{id:1,type:"4.5",currentRent:""},{id:2,type:"4.5",currentRent:""}]});

const MAIN_TABS=[{id:"overview",l:"Résumé"},{id:"projection",l:"Projection"},{id:"stress",l:"Stress"},{id:"brrrr",l:"BRRRR"},{id:"fiscal",l:"Fiscal"},{id:"nego",l:"Négociation"},{id:"reno",l:"Rénovation"},{id:"units",l:"Unités"}];

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function DealAgent(){
  const[unlocked,setUnlocked]=useState(()=>store.get("ea_access",null)==="1");
  const[form,setForm]=useState(()=>{try{const p=new URLSearchParams(window.location.search).get("d");if(p)return{...defaultForm(),...JSON.parse(atob(p))};}catch{}return defaultForm();});
  const[result,setResult]=useState(null);
  const[aiInsight,setAiInsight]=useState(null);
  const[loading,setLoading]=useState(false);
  const[activeTab,setActiveTab]=useState("overview");
  const[searchApplied,setSearchApplied]=useState(null);
  const[error,setError]=useState(null);
  const[mode,setMode]=useState("advanced");
  const[savedDeals,setSavedDeals]=useState(()=>store.get("ea_saved",[]));
  const[showPortfolio,setShowPortfolio]=useState(false);
  const[dealLabel,setDealLabel]=useState("");
  const[customRents,setCustomRents]=useState(()=>store.get("ea_rents",null));
  const[shareUrl,setShareUrl]=useState(null);
  const[showCTA,setShowCTA]=useState(false);
  const[showSubmit,setShowSubmit]=useState(false);

  const activeRents=customRents||DEFAULT_RENTS;
  const sf=(f,v)=>setForm(p=>({...p,[f]:v}));
  const handlePT=(pt)=>{setForm(p=>({...p,propertyType:pt,units:Array.from({length:UNIT_COUNTS[pt]},(_,i)=>({id:i,type:"4.5",currentRent:""}))}));setResult(null);};
  const uu=(id,f,v)=>setForm(p=>({...p,units:p.units.map(u=>u.id===id?{...u,[f]:v}:u)}));

  const handleAddr=useCallback((data)=>{
    if(!data)return;
    const city=CITIES.includes(data.city)?data.city:"other";
    const pt=PROPERTY_TYPES.includes(data.propertyType)?data.propertyType:"triplex";
    const units=Array.from({length:UNIT_COUNTS[pt]},(_,i)=>({id:i,type:UNIT_TYPES.includes(data.units?.[i]?.type)?data.units[i].type:"4.5",currentRent:data.units?.[i]?.currentRent>0?String(data.units[i].currentRent):""}));
    setForm(p=>({...p,city,propertyType:pt,askingPrice:data.askingPrice>0?String(data.askingPrice):p.askingPrice,municipalEval:data.municipalEval>0?String(data.municipalEval):p.municipalEval,units,addressNotes:data.address||""}));
    setSearchApplied(data);setResult(null);
  },[]);

  const analyze=async()=>{
    setLoading(true);setResult(null);setAiInsight(null);setError(null);setShareUrl(null);setShowSubmit(false);
    try{
      const r=buildAnalysis(form,activeRents);setResult(r);
      const count=(store.get("ea_count",0)+1);store.set("ea_count",count);
      if(count%3===0||r.score>=6)setShowCTA(true);
      const prompt=`Analyste immobilier senior Québec.${form.addressNotes?` Propriété: ${form.addressNotes}`:""}\n${form.propertyType}·${form.city}·${r.numUnits} logements\nPrix:${fmt(r.price)}|Cap:${r.currentCapRate?.toFixed(2)||"N/A"}%|NOI:${fmt(r.currentNOI)}\nCF:${r.monthlyCashflow!==null?fmt(r.monthlyCashflow):""}/mois|DSCR:${r.dscr!==null?fmtN(r.dscr):"N/A"}|IRR:${r.irr?r.irr.toFixed(1)+"%":"N/A"}\nUpside:${fmt(r.rentUpside)}/an|CoC:${r.cashOnCash?.toFixed(1)||"N/A"}%\nScore:${r.score}/10|${r.verdict.label}\n\n4 points directs:\n1.[DEAL]\n2.[UPSIDE]\n3.[RISQUE]\n4.[ACTION]\nFrancophone direct.`;
      try{const resp=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:700,messages:[{role:"user",content:prompt}]})});const data=await resp.json();setAiInsight(data.content?.find(b=>b.type==="text")?.text||null);}catch{}
    }catch(e){setError(e.message||"Erreur");}
    setLoading(false);
  };

  const saveDeal=()=>{
    if(!result)return;
    const label=dealLabel||`${form.propertyType}·${form.city}·${new Date().toLocaleDateString("fr-CA")}`;
    const d={id:Date.now(),label,form:{...form},savedAt:Date.now(),status:"En analyse",snapshot:{cf:result.monthlyCashflow,capRate:result.currentCapRate,score:result.score,verdict:result.verdict.label,verdictColor:result.verdict.color,price:result.price}};
    const updated=[d,...savedDeals.slice(0,19)];setSavedDeals(updated);store.set("ea_saved",updated);setDealLabel("");
  };
  const deleteDeal=(id)=>{const updated=savedDeals.filter(d=>d.id!==id);setSavedDeals(updated);store.set("ea_saved",updated);};
  const updateDealStatus=(id,status)=>{const updated=savedDeals.map(d=>d.id===id?{...d,status}:d);setSavedDeals(updated);store.set("ea_saved",updated);};
  const loadDeal=(d)=>{setForm(d.form);setResult(null);setAiInsight(null);};
  const generateShareUrl=()=>{try{const enc=btoa(JSON.stringify({city:form.city,propertyType:form.propertyType,askingPrice:form.askingPrice,municipalEval:form.municipalEval,expenses:form.expenses,downPct:form.downPct,rate:form.rate,amort:form.amort,units:form.units}));const url=`${window.location.origin}${window.location.pathname}?d=${enc}`;setShareUrl(url);try{navigator.clipboard.writeText(url);}catch{}}catch(e){setShareUrl("Erreur");}};

  const A="#6366F1";
  const vc=result?.verdict?.color||A;
  const rgbM={"#10B981":"16,185,129","#34D399":"52,211,153","#6366F1":"99,102,241","#F59E0B":"245,158,11","#EF4444":"239,68,68","#6B6B8A":"107,107,138"};
  const vrgb=rgbM[vc]||"99,102,241";

  if(!unlocked)return<AccessGate onUnlock={()=>setUnlocked(true)}/>;

  return(
    <div style={{minHeight:"100vh",background:"#06060F",color:"#DCDCF0",fontFamily:"'DM Sans',system-ui,sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        input,select,textarea{background:#0C0C1A;border:1px solid #1E1E35;color:#D0D0F0;border-radius:8px;padding:9px 12px;font-size:13px;font-family:inherit;width:100%;outline:none;transition:border .15s,box-shadow .15s;}
        input:focus,select:focus,textarea:focus{border-color:#6366F1;box-shadow:0 0 0 3px rgba(99,102,241,.10);}
        select option{background:#0E0E1E;}
        .card{background:#0C0C1A;border:1px solid #181828;border-radius:14px;padding:16px;}
        .lbl{font-size:10px;font-weight:700;letter-spacing:.1em;color:#33335A;text-transform:uppercase;margin-bottom:6px;display:block;}
        .g2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
        .g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;}
        .g4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;}
        .mtab{background:none;border:none;color:#33335A;font-size:11px;font-weight:700;padding:6px 10px;cursor:pointer;border-radius:8px;letter-spacing:.04em;font-family:inherit;transition:all .15s;white-space:nowrap;}
        .mtab.on{background:#141426;color:#A0A0D0;}
        .btn{background:#6366F1;color:white;border:none;border-radius:10px;padding:13px 22px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;transition:all .15s;}
        .btn:hover{background:#5052cc;}
        .btn:disabled{background:#141426;color:#2A2A55;cursor:not-allowed;}
        .row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #101020;font-size:13px;}
        .row:last-child{border-bottom:none;}
        .si{animation:si .3s ease;}
        @keyframes si{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
        ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-thumb{background:#1E1E35;border-radius:4px;}
        /* MOBILE */
        @media(max-width:640px){
          .g3,.g4{grid-template-columns:1fr 1fr!important;}
          .g2{grid-template-columns:1fr 1fr;}
          .hide-mobile{display:none!important;}
          .nav-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;}
        }
      `}</style>

      {/* PORTFOLIO MODAL */}
      {showPortfolio&&<PortfolioDashboard deals={savedDeals} onLoad={loadDeal} onDelete={deleteDeal} onStatusChange={updateDealStatus} onNew={()=>{setShowPortfolio(false);setForm(defaultForm());setResult(null);}} onClose={()=>setShowPortfolio(false)}/>}

      {/* NAV */}
      <nav style={{background:"#08080F",borderBottom:"1px solid #101020",padding:"0 14px",height:50,display:"flex",alignItems:"center",gap:10,position:"sticky",top:0,zIndex:50}}>
        <div style={{width:28,height:28,background:"linear-gradient(135deg,#6366F1,#8B5CF6)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:900,color:"white",flexShrink:0}}>◈</div>
        <div style={{flexShrink:0}}>
          <div style={{fontSize:13,fontWeight:800,letterSpacing:"-0.02em",lineHeight:1}}>DEAL AGENT</div>
          <div style={{fontSize:8,color:"#22224A",fontWeight:700,letterSpacing:".1em"}}>ELEV8 · v8</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center"}}>
          {/* Mode toggle */}
          <div style={{display:"flex",background:"#0A0A1A",border:"1px solid #141428",borderRadius:8,padding:2,gap:1,flexShrink:0}}>
            {[{id:"beginner",l:"Débutant"},{id:"advanced",l:"Expert"}].map(m=>(
              <button key={m.id} onClick={()=>setMode(m.id)} style={{background:mode===m.id?"#1A1A2E":"none",color:mode===m.id?"#D0D0F0":"#33335A",border:"none",borderRadius:6,padding:"4px 8px",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{m.l}</button>
            ))}
          </div>
          <button onClick={()=>setShowPortfolio(true)} style={{background:"#0A0A1A",color:"#6060A0",border:"1px solid #141428",borderRadius:8,padding:"5px 10px",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",position:"relative",flexShrink:0}}>
            ☰{savedDeals.length>0&&<span style={{background:"#6366F1",color:"white",borderRadius:"50%",width:14,height:14,fontSize:9,display:"inline-flex",alignItems:"center",justifyContent:"center",marginLeft:3,verticalAlign:"middle"}}>{savedDeals.length}</span>}
          </button>
        </div>
      </nav>

      <div style={{maxWidth:820,margin:"0 auto",padding:"14px 12px"}}>
        <AddressSearch onDataFound={handleAddr}/>

        {searchApplied&&(
          <div style={{display:"flex",alignItems:"center",gap:8,background:"#081812",border:"1px solid #10B98125",borderRadius:10,padding:"8px 12px",marginBottom:12}}>
            <div style={{width:14,height:14,background:"#10B981",borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"white",fontWeight:900,flexShrink:0}}>✓</div>
            <div style={{fontSize:10,fontWeight:700,color:"#10B981",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{searchApplied.address}</div>
            <button onClick={()=>setSearchApplied(null)} style={{background:"none",border:"none",color:"#1A4A2A",cursor:"pointer",fontSize:14,flexShrink:0}}>×</button>
          </div>
        )}

        {/* FORM */}
        <div className="card" style={{marginBottom:12}}>
          <div style={{fontSize:10,fontWeight:800,color:"#22224A",letterSpacing:".12em",marginBottom:12}}>PARAMÈTRES DU DEAL</div>
          <div className="g2" style={{marginBottom:10}}>
            <div><label className="lbl">Ville</label>
              <select value={form.city} onChange={e=>sf("city",e.target.value)}>
                {CITIES.map(c=><option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1).replace(/-/g," ")}</option>)}
              </select>
            </div>
            <div><label className="lbl">Type</label>
              <select value={form.propertyType} onChange={e=>handlePT(e.target.value)}>
                {PROPERTY_TYPES.map(p=><option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div className="g2" style={{marginBottom:10}}>
            <div><label className="lbl">Prix demandé ($)</label><input value={form.askingPrice} onChange={e=>sf("askingPrice",e.target.value)} placeholder="850 000" inputMode="numeric"/></div>
            <div><label className="lbl">Éval. municipale ($)</label><input value={form.municipalEval} onChange={e=>sf("municipalEval",e.target.value)} placeholder="Optionnel" inputMode="numeric"/></div>
          </div>
          <div style={{background:"#09091A",borderRadius:10,padding:"10px 12px",marginBottom:10,border:"1px solid #141428"}}>
            <label className="lbl">Financement</label>
            <div className="g3">
              <div><label className="lbl">Mise (%)</label><input type="number" value={form.downPct} onChange={e=>sf("downPct",e.target.value)} min="5" max="50" inputMode="decimal"/></div>
              <div><label className="lbl">Taux (%)</label><input type="number" value={form.rate} onChange={e=>sf("rate",e.target.value)} step=".05" inputMode="decimal"/></div>
              <div><label className="lbl">Amort.</label><input type="number" value={form.amort} onChange={e=>sf("amort",e.target.value)} min="10" max="30" inputMode="numeric"/></div>
            </div>
          </div>
          {mode==="advanced"&&(
            <div style={{background:"#09091A",borderRadius:10,padding:"10px 12px",marginBottom:10,border:"1px solid #141428"}}>
              <label className="lbl">Projection & Fiscal</label>
              <div className="g3">
                <div><label className="lbl">Croiss. loyers %</label><input type="number" value={form.rentGrowth} onChange={e=>sf("rentGrowth",e.target.value)} step=".5" placeholder="2.5" inputMode="decimal"/></div>
                <div><label className="lbl">Revenu perso ($)</label><input type="text" value={form.personalIncome} onChange={e=>sf("personalIncome",e.target.value)} placeholder="120 000" inputMode="numeric"/></div>
                <div><label className="lbl">Horizon</label>
                  <select value={form.projectionYears} onChange={e=>sf("projectionYears",e.target.value)}>
                    {[5,7,10].map(y=><option key={y} value={y}>{y} ans</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}
          <label className="lbl" style={{marginBottom:8}}>Logements · {UNIT_COUNTS[form.propertyType]}</label>
          {form.units.map((u,i)=>(
            <div key={u.id} style={{display:"flex",gap:8,marginBottom:7,alignItems:"center"}}>
              <div style={{width:22,height:22,background:"#12122A",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:A,flexShrink:0}}>{i+1}</div>
              <select value={u.type} onChange={e=>uu(u.id,"type",e.target.value)} style={{flex:1}}>{UNIT_TYPES.map(t=><option key={t} value={t}>{t==="studio"?"Studio":`${t}p.`}</option>)}</select>
              <input type="number" value={u.currentRent} onChange={e=>uu(u.id,"currentRent",e.target.value)} placeholder="$/mois" style={{flex:1}} inputMode="numeric"/>
            </div>
          ))}
          <div className="g2" style={{marginTop:10}}>
            <div><label className="lbl">Dépenses (%)</label><input type="number" value={form.expenses} onChange={e=>sf("expenses",e.target.value)} min="0" max="60" inputMode="decimal"/></div>
            <div style={{display:"flex",alignItems:"flex-end"}}>
              <button className="btn" onClick={analyze} disabled={loading} style={{width:"100%",marginTop:0,padding:"12px"}}>
                {loading?<span style={{animation:"pulse 1.4s infinite"}}>Analyse...</span>:"ANALYSER"}
              </button>
            </div>
          </div>
          {error&&<div style={{marginTop:10,background:"#1A0808",border:"1px solid #EF444428",borderRadius:8,padding:"9px 12px",fontSize:12,color:"#EF4444"}}>Erreur: {error}</div>}
        </div>

        {/* RESULTS */}
        {result&&(
          <div className="si">
            {/* SAVE / SHARE BAR */}
            <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
              <input value={dealLabel} onChange={e=>setDealLabel(e.target.value)} placeholder="Nom du deal (optionnel)" style={{flex:1,minWidth:130,padding:"8px 12px",fontSize:12,background:"#0C0C1A",border:"1px solid #1E1E35",color:"#D0D0F0",borderRadius:8,outline:"none",fontFamily:"inherit"}}/>
              <button onClick={saveDeal} style={{background:"#10B981",color:"white",border:"none",borderRadius:8,padding:"8px 12px",fontSize:11,fontWeight:800,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>💾 Sauver</button>
              <button onClick={generateShareUrl} style={{background:"#14141E",color:"#8080B0",border:"1px solid #252540",borderRadius:8,padding:"8px 10px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>🔗</button>
            </div>
            {shareUrl&&(
              <div style={{background:"#080E18",border:"1px solid #6366F125",borderRadius:10,padding:"9px 12px",marginBottom:12,display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:10,color:"#6366F1",fontFamily:"monospace",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{shareUrl}</span>
                <button onClick={()=>setShareUrl(null)} style={{background:"none",border:"none",color:"#33335A",cursor:"pointer",fontSize:14}}>×</button>
              </div>
            )}

            {/* BEGINNER */}
            {mode==="beginner"&&<BeginnerView result={result} form={form}/>}

            {/* EXPERT */}
            {mode==="advanced"&&(<>

            {/* VERDICT */}
            <div style={{background:`rgba(${vrgb},.06)`,border:`1px solid rgba(${vrgb},.22)`,borderRadius:14,padding:"16px",marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
                <div>
                  <div style={{fontSize:9,fontWeight:800,color:A,letterSpacing:".12em",marginBottom:3}}>VERDICT · ELEV8</div>
                  <div style={{fontSize:26,fontWeight:900,color:vc,letterSpacing:"-0.03em",lineHeight:1}}>{result.verdict.label}</div>
                  <div style={{fontSize:11,color:"#5050A0",marginTop:3}}>{result.verdict.sub}</div>
                  <div style={{marginTop:8}}><ScoreBar score={result.score}/></div>
                </div>
                <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                  {[{l:"Cap rate",v:result.currentCapRate!=null?`${result.currentCapRate.toFixed(2)}%`:"—",c:result.currentCapRate>=5?"#10B981":result.currentCapRate>=3.5?"#F59E0B":"#EF4444"},
                    {l:"CF/mois",v:result.monthlyCashflow!=null?fmt(result.monthlyCashflow):"—",c:result.monthlyCashflow>=300?"#10B981":result.monthlyCashflow>=0?"#F59E0B":"#EF4444"},
                    {l:`IRR(${result.years}a)`,v:result.irr!=null?`${result.irr.toFixed(1)}%`:"—",c:result.irr>=12?"#10B981":result.irr>=8?"#F59E0B":"#EF4444"},
                    {l:"DSCR",v:result.dscr!=null?fmtN(result.dscr):"—",c:result.dscr>=1.25?"#10B981":result.dscr>=1?"#F59E0B":"#EF4444"},
                  ].map((m,i)=>(
                    <div key={i} style={{textAlign:"right"}}>
                      <div style={{fontSize:9,color:"#33335A",fontWeight:700,letterSpacing:".06em",marginBottom:2,textTransform:"uppercase"}}>{m.l}</div>
                      <div style={{fontSize:18,fontWeight:800,color:m.c}}>{m.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* TABS — scrollable on mobile */}
            <div className="nav-scroll" style={{marginBottom:12}}>
              <div style={{display:"flex",gap:2,background:"#08080F",padding:4,borderRadius:10,border:"1px solid #101020",width:"max-content",minWidth:"100%"}}>
                {MAIN_TABS.map(t=><button key={t.id} className={`mtab ${activeTab===t.id?"on":""}`} onClick={()=>setActiveTab(t.id)}>{t.l}</button>)}
              </div>
            </div>

            {/* OVERVIEW */}
            {activeTab==="overview"&&(
              <div className="si">
                <div className="g4" style={{marginBottom:12}}>
                  <Stat label="NOI actuel/an" value={fmt(result.currentNOI)} color="#6366F1"/>
                  <Stat label="NOI optimisé" value={fmt(result.optimizedNOI)} color="#10B981"/>
                  <Stat label="Upside/an" value={fmt(result.rentUpside)} color="#F59E0B"/>
                  <Stat label="Cash-on-cash" value={result.cashOnCash!=null?`${result.cashOnCash.toFixed(1)}%`:"—"} color={result.cashOnCash>=7?"#10B981":result.cashOnCash>=4?"#F59E0B":"#EF4444"}/>
                </div>
                <div className="card">
                  {[["Prix demandé",result.price>0?fmt(result.price):"—"],["Valeur comparative marché",fmt(result.comparativeValue)],["Prix/porte demandé",result.pricePerDoor>0?fmt(result.pricePerDoor):"—"],["Prix/porte marché",fmt(result.marketValuePerDoor)],["Éval. municipale",result.munEval>0?fmt(result.munEval):"—"],["Ratio prix/éval.",result.evalRatio!=null?`${result.evalRatio.toFixed(2)}x`:"—"],["Revenus bruts actuels/an",fmt(result.currentGRI)],["Revenus bruts marché/an",fmt(result.optimizedGRI)],["Versement mensuel",fmt(result.mortgage.payment)],["DSCR",result.dscr!=null?fmtN(result.dscr):"—"],["Investissement total",fmt(result.totalInvestment)],["Prime CMHC",result.cmhc>0?fmt(result.cmhc):"Aucune (≥20%)"]].map(([l,v],i)=>(
                    <div key={i} className="row"><span style={{color:"#4A4A80"}}>{l}</span><span style={{fontWeight:600}}>{v}</span></div>
                  ))}
                </div>
              </div>
            )}

            {/* PROJECTION */}
            {activeTab==="projection"&&(
              <div className="si">
                <div className="g3" style={{marginBottom:12}}>
                  {result.projection.length>0&&[
                    {l:`Valeur an ${result.years}`,v:fmt(result.projection[result.projection.length-1]?.propValue||0),c:"#6366F1"},
                    {l:`Equity an ${result.years}`,v:fmt(result.projection[result.projection.length-1]?.equity||0),c:"#10B981"},
                    {l:`IRR (${result.years}a)`,v:result.irr!=null?`${result.irr.toFixed(1)}%`:"N/A",c:result.irr>=12?"#10B981":result.irr>=8?"#F59E0B":"#EF4444"},
                  ].map((s,i)=><Stat key={i} label={s.l} value={s.v} color={s.c}/>)}
                </div>
                <div className="card" style={{marginBottom:12}}>
                  <div style={{fontSize:10,fontWeight:800,color:"#33335A",letterSpacing:".1em",marginBottom:12}}>VALEUR · EQUITY · HYPOTHÈQUE</div>
                  <ResponsiveContainer width="100%" height={190}>
                    <LineChart data={result.projection} margin={{top:5,right:5,left:0,bottom:5}}>
                      <XAxis dataKey="year" tick={{fill:"#33335A",fontSize:10}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fill:"#33335A",fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000000?`${(v/1000000).toFixed(1)}M`:`${Math.round(v/1000)}k`}/>
                      <Tooltip content={<CT/>}/>
                      <Line type="monotone" dataKey="propValue" name="Valeur" stroke="#6366F1" strokeWidth={2} dot={false}/>
                      <Line type="monotone" dataKey="equity" name="Equity" stroke="#10B981" strokeWidth={2} dot={false}/>
                      <Line type="monotone" dataKey="mortgageBalance" name="Solde hyp." stroke="#EF4444" strokeWidth={1.5} strokeDasharray="4 3" dot={false}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="card">
                  <div style={{fontSize:10,fontWeight:800,color:"#33335A",letterSpacing:".1em",marginBottom:12}}>CASHFLOW MENSUEL PROJETÉ</div>
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={result.projection} margin={{top:5,right:5,left:0,bottom:5}}>
                      <XAxis dataKey="year" tick={{fill:"#33335A",fontSize:10}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fill:"#33335A",fontSize:9}} axisLine={false} tickLine={false}/>
                      <Tooltip content={<CT/>}/>
                      <ReferenceLine y={0} stroke="#252540" strokeDasharray="3 3"/>
                      <Bar dataKey="cashflowMonthly" name="CF mensuel" fill="#6366F1" radius={[4,4,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* STRESS */}
            {activeTab==="stress"&&(
              <div className="si">
                <div style={{background:"#0E0A0A",border:"1px solid #EF444420",borderRadius:12,padding:"12px 14px",marginBottom:12}}>
                  <div style={{fontSize:9,fontWeight:800,color:"#EF4444",letterSpacing:".1em",marginBottom:3}}>BASE · CASHFLOW ACTUEL</div>
                  <div style={{fontSize:20,fontWeight:900}}>{fmt(result.monthlyCashflow||0)}<span style={{fontSize:11,color:"#44446A"}}>/mois</span></div>
                </div>
                {result.stressTests.map((s,i)=>{
                  const c=s.safe?"#10B981":"#EF4444";
                  const bbase=Math.max(Math.abs(result.monthlyCashflow||1),Math.abs(s.cashflow),1);
                  return(
                    <div key={i} style={{background:"#0C0C1A",border:`1px solid ${c}20`,borderRadius:12,padding:"12px 14px",marginBottom:9}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                        <div><div style={{fontSize:12,fontWeight:700,color:"#C0C0E0",marginBottom:2}}>{s.label}</div><div style={{fontSize:10,color:"#33335A"}}>{s.desc}</div></div>
                        <div style={{textAlign:"right",flexShrink:0,marginLeft:10}}>
                          <div style={{fontSize:16,fontWeight:800,color:c}}>{fmt(s.cashflow)}<span style={{fontSize:10,color:"#44446A"}}>/mois</span></div>
                          <div style={{fontSize:10,color:s.delta<=0?"#EF4444":"#10B981",fontWeight:600}}>{s.delta>0?"+":""}{fmt(s.delta)}</div>
                        </div>
                      </div>
                      <div style={{height:3,background:"#141428",borderRadius:3,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${(Math.abs(s.cashflow)/bbase)*100}%`,background:c,borderRadius:3}}/>
                      </div>
                      <span style={{marginTop:5,display:"inline-block",padding:"2px 8px",borderRadius:20,background:`${c}14`,fontSize:9,fontWeight:800,color:c}}>{s.safe?"POSITIF":"NÉGATIF"}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* BRRRR */}
            {activeTab==="brrrr"&&(
              <div className="si">
                <div style={{background:"#080E14",border:"1px solid #6366F125",borderRadius:12,padding:"14px",marginBottom:12}}>
                  <div style={{fontSize:9,fontWeight:800,color:A,letterSpacing:".1em",marginBottom:8}}>BRRRR · REFI AN {result.brrrr.brrrrY}</div>
                  <div className="g3">
                    <Stat label={`Valeur an ${result.brrrr.brrrrY}`} value={fmt(result.brrrr.brrrrVal)} color="#6366F1" size={15}/>
                    <Stat label="Refi max 80%" value={fmt(result.brrrr.brrrrMaxRefi)} color="#8B5CF6" size={15}/>
                    <Stat label="Cash-out" value={fmt(result.brrrr.brrrrCashOut)} color="#10B981" size={15}/>
                  </div>
                </div>
                <div className="card">
                  {[["Investissement initial",fmt(result.totalInvestment)],[`Solde hyp. an ${result.brrrr.brrrrY}`,fmt(result.brrrr.brrrrMortBal)],[`Valeur an ${result.brrrr.brrrrY}`,fmt(result.brrrr.brrrrVal)],["Nouveau prêt (80% LTV)",fmt(result.brrrr.brrrrMaxRefi)],["Capital récupérable",fmt(result.brrrr.brrrrCashOut)],["Equity conservée",fmt(result.brrrr.equityLeft)],["Nouveau versement/mois",fmt(result.brrrr.brrrrNewPayment)],["Cashflow post-refi",fmt(result.brrrr.brrrrNewCashflow)],["% capital récupéré",`${safe(result.brrrr.brrrrROC).toFixed(1)}%`]].map(([l,v],i)=>(
                    <div key={i} className="row"><span style={{color:"#4A4A80"}}>{l}</span><span style={{fontWeight:600}}>{v}</span></div>
                  ))}
                </div>
              </div>
            )}

            {/* FISCAL */}
            {activeTab==="fiscal"&&result.taxAnalysis&&(()=>{
              const ta=result.taxAnalysis;
              return(
                <div className="si">
                  <div className="g2" style={{marginBottom:12}}>
                    <Stat label="Taux marginal" value={`${(ta.marginalRate*100).toFixed(0)}%`} color="#F59E0B"/>
                    <Stat label="Économie CCA an 1" value={fmt(ta.ccaTaxSavingY1)} color="#10B981"/>
                  </div>
                  <div className="card" style={{marginBottom:12}}>
                    <div style={{fontSize:10,fontWeight:800,color:"#33335A",letterSpacing:".1em",marginBottom:10}}>DPA / CCA</div>
                    {[["Valeur bâtiment (70%)",fmt(ta.buildingValue)],["CCA an 1 (règle 50%)",fmt(ta.ccaYear1)],["CCA an 2+",fmt(ta.ccaYear2Plus)],["Économie fiscale an 1",fmt(ta.ccaTaxSavingY1)],["Économie fiscale an 2+",fmt(ta.ccaTaxSavingY2)],["Intérêts déductibles",fmt(ta.annualInterest)],["Économie intérêts",fmt(ta.interestDeduction)]].map(([l,v],i)=>(
                      <div key={i} className="row"><span style={{color:"#4A4A80"}}>{l}</span><span style={{fontWeight:600}}>{v}</span></div>
                    ))}
                  </div>
                  <div className="card">
                    <div style={{fontSize:10,fontWeight:800,color:"#33335A",letterSpacing:".1em",marginBottom:10}}>GAIN EN CAPITAL · VENTE AN {result.years}</div>
                    {[["Valeur de vente estimée",fmt(ta.salePrice),null],["Gain brut",fmt(ta.capitalGain),null],[`Taux d'inclusion (${(ta.inclusionRate*100).toFixed(0)}%)`,fmt(ta.capitalGain*ta.inclusionRate),null],["Impôt estimé",fmt(ta.capitalGain*ta.inclusionRate*ta.marginalRate),"#EF4444"],["Produit net",fmt(ta.salePrice-ta.capitalGain*ta.inclusionRate*ta.marginalRate-ta.salePrice*.04),"#10B981"]].map(([l,v,c],i)=>(
                      <div key={i} className="row"><span style={{color:"#4A4A80"}}>{l}</span><span style={{fontWeight:600,color:c||"inherit"}}>{v}</span></div>
                    ))}
                    <div style={{marginTop:10,fontSize:10,color:"#33335A",fontStyle:"italic"}}>Estimation éducative. Consulter un CPA. Taux QC+fédéral 2024.</div>
                  </div>
                </div>
              );
            })()}

            {/* NÉGOCIATION */}
            {activeTab==="nego"&&<NegotiationSimulator result={result} form={form} rents={activeRents}/>}

            {/* RÉNOVATION */}
            {activeTab==="reno"&&<RenoSimulator result={result} form={form} rents={activeRents}/>}

            {/* UNITS */}
            {activeTab==="units"&&(
              <div className="si">
                {result.unitResults.map((u,i)=>(
                  <div key={i} style={{background:"#0C0C1A",border:"1px solid #141428",borderRadius:12,padding:"12px 14px",marginBottom:9}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:22,height:22,background:"#141428",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:A}}>{i+1}</div>
                        <span style={{fontSize:12,fontWeight:700}}>{u.type==="studio"?"Studio":`${u.type}p.`}</span>
                      </div>
                      <div style={{display:"flex",gap:12}}>
                        <div style={{textAlign:"right"}}><div style={{fontSize:9,color:"#33335A",marginBottom:2}}>Actuel</div><div style={{fontSize:13,fontWeight:700}}>{u.current>0?fmt(u.current):"Vacant"}</div></div>
                        <div style={{textAlign:"right"}}><div style={{fontSize:9,color:"#33335A",marginBottom:2}}>Marché</div><div style={{fontSize:13,fontWeight:700,color:A}}>{fmt(u.marketRent)}</div></div>
                        {u.gap>0&&<div style={{textAlign:"right"}}><div style={{fontSize:9,color:"#33335A",marginBottom:2}}>Écart</div><div style={{fontSize:13,fontWeight:700,color:"#10B981"}}>+{fmt(u.gap)}</div></div>}
                      </div>
                    </div>
                    {u.current>0&&(
                      <>
                        <div style={{height:3,background:"#141428",borderRadius:3,overflow:"hidden",marginTop:8}}>
                          <div style={{height:"100%",width:`${Math.min((u.current/Math.max(u.marketRent,1))*100,100)}%`,background:u.current/u.marketRent>.9?"#10B981":u.current/u.marketRent>.75?"#F59E0B":"#EF4444",borderRadius:3}}/>
                        </div>
                        <div style={{fontSize:10,color:"#2A2A50",marginTop:3}}>{((u.current/Math.max(u.marketRent,1))*100).toFixed(0)}% du marché · +{fmt(u.gap*12)}/an</div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* AI INSIGHT */}
            {aiInsight&&(
              <div className="card si" style={{marginTop:12,borderColor:"#1A1A35",background:"#08080E"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <div style={{width:20,height:20,background:A,borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10}}>◈</div>
                  <div style={{fontSize:10,fontWeight:800,color:A,letterSpacing:".08em"}}>ANALYSE AGENT</div>
                </div>
                <div style={{fontSize:13,lineHeight:1.85,color:"#6868A0",whiteSpace:"pre-wrap"}}>{aiInsight}</div>
              </div>
            )}

            </>)} {/* end expert mode */}

            {/* DEAL SUBMISSION */}
            <div style={{marginTop:14}}>
              {!showSubmit?(
                <button onClick={()=>setShowSubmit(true)} style={{width:"100%",background:"#09091A",border:"1px solid #6366F130",borderRadius:12,padding:"14px",fontSize:13,fontWeight:700,color:"#8080C0",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                  <span style={{fontSize:20}}>◈</span> Soumettre ce deal à Serujan pour analyse personnalisée →
                </button>
              ):(
                <DealSubmission result={result} form={form} onClose={()=>setShowSubmit(false)}/>
              )}
            </div>

          </div>
        )}

        <div style={{textAlign:"center",marginTop:32,fontSize:9,color:"#0E0E28",letterSpacing:".1em",fontFamily:"monospace"}}>
          ELEV8 DEAL AGENT v8 · DONNÉES ESTIMATIVES · VALIDER AVEC COURTIER AUTORISÉ
        </div>
      </div>
    </div>
  );
}
