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
 const places=readJourneyPlaces();if(!places.length){alert("Your Food Journey is empty. Mark a restaurant as visited first.");return}
 if(!window.jspdf||!window.jspdf.jsPDF){alert("The PDF generator could not load. Check your internet connection and try again.");return}
 const pdf=new window.jspdf.jsPDF({unit:"mm",format:"a4"}),W=pdf.internal.pageSize.getWidth(),H=pdf.internal.pageSize.getHeight(),m=18;
 const orange=[239,103,55],green=[46,139,87],ink=[42,37,33],muted=[112,104,96];
 const count={Restaurant:0,"Café":0,"Fast food":0};places.forEach(p=>{if(count[p.type]!==undefined)count[p.type]++});
 function page(n){pdf.setFillColor(255,247,238);pdf.rect(0,0,W,H,"F");pdf.setFillColor(...orange);pdf.rect(0,0,W,5,"F");pdf.setFont("helvetica","bold");pdf.setFontSize(10);pdf.setTextColor(...orange);pdf.text("KHABO KI?",m,15);pdf.setFont("helvetica","normal");pdf.setFontSize(8);pdf.setTextColor(...muted);pdf.text("MY FOOD JOURNEY / PERSONAL COLLECTION",W-m,15,{align:"right"});pdf.setDrawColor(232,220,207);pdf.line(m,21,W-m,21);pdf.setFontSize(8);pdf.text("Generated "+new Date().toLocaleDateString("en-BD",{day:"numeric",month:"long",year:"numeric"}),m,H-10);pdf.text("Page "+n,W-m,H-10,{align:"right"})}
 page(1);pdf.setFillColor(255,255,255);pdf.roundedRect(m,31,W-2*m,55,5,5,"F");pdf.setFont("helvetica","bold");pdf.setFontSize(25);pdf.setTextColor(...ink);pdf.text("My Food Journey",m+8,49);pdf.setFont("helvetica","normal");pdf.setFontSize(10);pdf.setTextColor(...muted);pdf.text("A little collection of places, flavours and memories.",m+8,58);pdf.setFillColor(...orange);pdf.roundedRect(m+8,66,48,12,3,3,"F");pdf.setFont("helvetica","bold");pdf.setFontSize(8);pdf.setTextColor(255,255,255);pdf.text(places.length+" PLACES VISITED",m+32,73.5,{align:"center"});
 const statY=96,gap=4,sw=(W-2*m-3*gap)/4;[["TOTAL",places.length,orange],["RESTAURANTS",count.Restaurant,green],["CAFES",count["Café"],[91,130,166]],["FAST FOOD",count["Fast food"],[205,151,56]]].forEach((s,i)=>{const x=m+i*(sw+gap);pdf.setFillColor(255,255,255);pdf.roundedRect(x,statY,sw,25,3,3,"F");pdf.setFillColor(...s[2]);pdf.roundedRect(x,statY,2,25,1,1,"F");pdf.setFont("helvetica","bold");pdf.setFontSize(16);pdf.setTextColor(...ink);pdf.text(String(s[1]),x+6,statY+12);pdf.setFontSize(6.5);pdf.setTextColor(...muted);pdf.text(s[0],x+6,statY+19)});
 let y=135;pdf.setFont("helvetica","bold");pdf.setFontSize(13);pdf.setTextColor(...ink);pdf.text("Your visited places",m,y);y+=9;
 places.forEach((p,i)=>{const lines=pdf.splitTextToSize(p.name,W-2*m-54),h=Math.max(19,9+lines.length*5);if(y+h>H-20){pdf.addPage();page(pdf.internal.getNumberOfPages());y=32}pdf.setFillColor(255,255,255);pdf.roundedRect(m,y,W-2*m,h,2.5,2.5,"F");pdf.setFillColor(...orange);pdf.circle(m+7,y+9,3,"F");pdf.setFont("helvetica","bold");pdf.setFontSize(8);pdf.setTextColor(255,255,255);pdf.text(String(i+1),m+7,y+10,{align:"center"});pdf.setTextColor(...ink);pdf.setFontSize(9);pdf.text(lines,m+14,y+7);pdf.setFont("helvetica","normal");pdf.setFontSize(7);pdf.setTextColor(...muted);pdf.text([p.type,p.category].filter(Boolean).join(" · ")||"Food place",m+14,y+7+lines.length*5);pdf.text(journeyDate(p.visitedAt),W-m-3,y+8,{align:"right"});y+=h+3});
 pdf.setProperties({title:"My Food Journey - Khabo Ki?",subject:"Personal visited restaurant report",author:"Khabo Ki?"});pdf.save("khabo-ki-my-food-journey.pdf")
}
document.addEventListener("DOMContentLoaded",()=>{renderFoodJourney();const b=document.getElementById("download-journey-pdf");if(b)b.addEventListener("click",downloadJourneyReport)});
