/* My Food Journey: browser-local visited places and PDF export. */
const JOURNEY_KEY="khaboKiVisitedPlaces";
function readJourneyPlaces(){try{const v=JSON.parse(localStorage.getItem(JOURNEY_KEY)||"[]");return Array.isArray(v)?v.filter(p=>p&&typeof p.key==="string"&&typeof p.name==="string"):[]}catch(e){return[]}}
function saveJourneyPlaces(v){try{localStorage.setItem(JOURNEY_KEY,JSON.stringify(v));return true}catch(e){console.warn("Journey storage unavailable",e);return false}}
function isPlaceVisited(key){return readJourneyPlaces().some(p=>p.key===key)}
function toggleVisitedPlace(place){const v=readJourneyPlaces(),i=v.findIndex(p=>p.key===place.key);if(i>=0)v.splice(i,1);else v.unshift({key:place.key,name:place.displayName||place.name||"Unnamed food place",type:place.categoryLabel||"Food place",category:place.cuisine||"",latitude:Number(place.lat),longitude:Number(place.lon),visitedAt:new Date().toISOString()});saveJourneyPlaces(v);return i<0}
function journeyDate(value){const d=new Date(value);return Number.isNaN(d.getTime())?"Date not recorded":d.toLocaleDateString("en-BD",{day:"numeric",month:"short",year:"numeric"})}
function renderFoodJourney(){
 const list=document.getElementById("journey-list");if(!list)return;const places=readJourneyPlaces();
 const counts={total:places.length,restaurants:0,cafes:0,fastfood:0};
 places.forEach(p=>{if(p.type==="Restaurant")counts.restaurants++;if(p.type==="Café")counts.cafes++;if(p.type==="Fast food")counts.fastfood++});
 Object.keys(counts).forEach(k=>document.getElementById("journey-"+k).textContent=counts[k]);
 document.getElementById("journey-empty").hidden=places.length>0;document.getElementById("journey-content").hidden=places.length===0;list.replaceChildren();
 places.forEach(p=>{
  const card=document.createElement("article");card.className="journey-place-card";
  const icon=document.createElement("span");icon.className="journey-place-icon";icon.textContent=p.type==="Café"?"☕":p.type==="Fast food"?"🍔":"🍽️";
  const info=document.createElement("div");info.className="journey-place-details";
  const title=document.createElement("h3");title.textContent=p.name;
  const meta=document.createElement("p");meta.textContent=[p.type,p.category,"Visited "+journeyDate(p.visitedAt)].filter(Boolean).join(" · ");info.append(title,meta);
  const actions=document.createElement("div");actions.className="journey-place-actions";
  const map=document.createElement("a");map.href="https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(p.name+", Bangladesh");map.target="_blank";map.rel="noopener noreferrer";map.textContent="Open map";
  const remove=document.createElement("button");remove.type="button";remove.className="journey-remove";remove.textContent="Remove";remove.addEventListener("click",()=>{saveJourneyPlaces(readJourneyPlaces().filter(x=>x.key!==p.key));renderFoodJourney()});
  actions.append(map,remove);card.append(icon,info,actions);list.append(card);
 });
}
function downloadJourneyReport(){
 const places=readJourneyPlaces();
 if(!places.length){alert("Your Food Journey is empty. Mark a restaurant as visited first.");return}
 const JsPDF=window.jspdf&&window.jspdf.jsPDF;
 if(typeof JsPDF!=="function"){
  alert("The PDF tool is unavailable. Check your internet connection, reload this page, and try again.");
  return;
 }
 try{
  const pdf=new JsPDF({unit:"mm",format:"a4",compress:true});
  const W=pdf.internal.pageSize.getWidth(),H=pdf.internal.pageSize.getHeight(),m=16;
  const orange=[239,103,55],green=[46,139,87],ink=[42,37,33],muted=[112,104,96];
  const count={Restaurant:0,"Café":0,"Fast food":0};
  places.forEach(p=>{if(count[p.type]!==undefined)count[p.type]++});
  function drawPage(n){
   pdf.setFillColor(255,247,238);pdf.rect(0,0,W,H,"F");
   pdf.setFillColor(...orange);pdf.rect(0,0,W,5,"F");
   pdf.setFont("helvetica","bold");pdf.setFontSize(10);pdf.setTextColor(...orange);pdf.text("KHABO KI?",m,15);
   pdf.setFont("helvetica","normal");pdf.setFontSize(7);pdf.setTextColor(...muted);pdf.text("MY FOOD JOURNEY / PERSONAL COLLECTION",W-m,15,{align:"right"});
   pdf.setDrawColor(232,220,207);pdf.line(m,21,W-m,21);
   pdf.setFontSize(7);pdf.text("Generated "+new Date().toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}),m,H-9);
   pdf.text("Page "+n,W-m,H-9,{align:"right"});
  }
  drawPage(1);
  pdf.setFillColor(255,255,255);pdf.roundedRect(m,29,W-2*m,54,4,4,"F");
  pdf.setFont("helvetica","bold");pdf.setFontSize(23);pdf.setTextColor(...ink);pdf.text("My Food Journey",m+7,47);
  pdf.setFont("helvetica","normal");pdf.setFontSize(9);pdf.setTextColor(...muted);pdf.text("A collection of places, flavours and memories.",m+7,56);
  pdf.setFillColor(...orange);pdf.roundedRect(m+7,64,48,11,3,3,"F");
  pdf.setFont("helvetica","bold");pdf.setFontSize(7);pdf.setTextColor(255,255,255);pdf.text(places.length+" PLACES VISITED",m+31,71,{align:"center"});
  const statY=91,gap=3,sw=(W-2*m-3*gap)/4;
  [["TOTAL",places.length,orange],["RESTAURANTS",count.Restaurant,green],["CAFES",count["Café"],[91,130,166]],["FAST FOOD",count["Fast food"],[205,151,56]]].forEach((s,i)=>{
   const x=m+i*(sw+gap);pdf.setFillColor(255,255,255);pdf.roundedRect(x,statY,sw,24,2,2,"F");
   pdf.setFillColor(...s[2]);pdf.roundedRect(x,statY,1.8,24,1,1,"F");
   pdf.setFont("helvetica","bold");pdf.setFontSize(15);pdf.setTextColor(...ink);pdf.text(String(s[1]),x+5,statY+11);
   pdf.setFontSize(5.5);pdf.setTextColor(...muted);pdf.text(s[0],x+5,statY+18);
  });
  let y=128;
  pdf.setFont("helvetica","bold");pdf.setFontSize(12);pdf.setTextColor(...ink);pdf.text("Your visited places",m,y);y+=8;
  places.forEach((p,i)=>{
   const name=String(p.name||"Unnamed food place");
   const date=journeyDate(p.visitedAt);
   const meta=[p.type,p.category].filter(Boolean).join(" · ")||"Food place";
   const nameLines=pdf.splitTextToSize(name,W-2*m-38);
   const metaLines=pdf.splitTextToSize(meta,W-2*m-38);
   const h=Math.max(18,7+nameLines.length*4.2+metaLines.length*3.5);
   if(y+h>H-17){pdf.addPage();drawPage(pdf.internal.getNumberOfPages());y=29}
   pdf.setFillColor(255,255,255);pdf.roundedRect(m,y,W-2*m,h,2,2,"F");
   pdf.setFillColor(...orange);pdf.circle(m+6,y+8,2.7,"F");
   pdf.setFont("helvetica","bold");pdf.setFontSize(7);pdf.setTextColor(255,255,255);pdf.text(String(i+1),m+6,y+9.2,{align:"center"});
   pdf.setFont("helvetica","bold");pdf.setFontSize(8.5);pdf.setTextColor(...ink);pdf.text(nameLines,m+12,y+6);
   const metaY=y+6+nameLines.length*4.2;
   pdf.setFont("helvetica","normal");pdf.setFontSize(6.5);pdf.setTextColor(...muted);pdf.text(metaLines,m+12,metaY);
   pdf.setFontSize(6);pdf.text(date,W-m-2,y+6,{align:"right"});
   y+=h+2.5;
  });
  pdf.setProperties({title:"My Food Journey - Khabo Ki?",subject:"Personal visited food places report",author:"Khabo Ki?"});
  pdf.save("khabo-ki-my-food-journey.pdf");
 }catch(error){
  console.error("Food Journey PDF export failed:",error);
  alert("The PDF could not be created. Please reload the page and try again.");
 }
}
document.addEventListener("DOMContentLoaded",()=>{renderFoodJourney();const b=document.getElementById("download-journey-pdf");if(b)b.addEventListener("click",downloadJourneyReport)});
