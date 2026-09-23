const demoCategories=["Bewirtung / Verpflegung","Requisiten","Bühnenbau / Material","Werbung","Gebühren / Bank","Sonstiges"];
const demoAccounts=["Alle Konten","Girokonto","Sparbuch"];
function fillDemoSelect(id,values){const el=document.getElementById(id);if(el)el.innerHTML=values.map((x,i)=>'<option value="'+i+'">'+x+'</option>').join("");}
["category","incomeCategory"].forEach(id=>fillDemoSelect(id,demoCategories));
["dashboardAccount","auditAccount"].forEach(id=>fillDemoSelect(id,demoAccounts));
["incomeAccount","importAccount"].forEach(id=>fillDemoSelect(id,["Girokonto","Sparbuch"]));
fillDemoSelect("dashboardYear",["2026","2025"]);
fillDemoSelect("auditYear",["2026","2025"]);
const demoFileInput=document.getElementById("receiptFile");
const demoCameraInput=document.getElementById("receiptCameraFile");
if(document.getElementById("takeReceiptPhotoBtn")) document.getElementById("takeReceiptPhotoBtn").onclick=()=>demoCameraInput.click();
if(document.getElementById("chooseReceiptFileBtn")) document.getElementById("chooseReceiptFileBtn").onclick=()=>demoFileInput.click();
function demoPicked(file){if(!file)return;document.getElementById("selectedReceiptFile").textContent="Ausgewählt: "+file.name;document.getElementById("ocrStatus").textContent="Demo-Erkennung abgeschlossen – Beispieldaten wurden eingetragen.";document.getElementById("merchant").value="Demo Händler";document.getElementById("receiptDate").value="2026-09-23";document.getElementById("amount").value="42.50";document.getElementById("invoiceNumber").value="DEMO-2026-1001";}
if(demoFileInput)demoFileInput.onchange=e=>demoPicked(e.target.files[0]);
if(demoCameraInput)demoCameraInput.onchange=e=>demoPicked(e.target.files[0]);
const $=id=>document.getElementById(id);
const euro=v=>new Intl.NumberFormat("de-AT",{style:"currency",currency:"EUR"}).format(v);
const base={
 accounts:[{name:"Girokonto",balance:4850.42},{name:"Sparbuch",balance:12500}],
 receipts:[
  {id:1,no:"#2026-0001",date:"05.09.2026",merchant:"MPreis",purpose:"Getränke Probe",amount:46.80,payment:"Vereinsbankomatkarte",status:"freigegeben"},
  {id:2,no:"#2026-0002",date:"09.09.2026",merchant:"Amazon",purpose:"Requisiten",amount:65.52,payment:"Privat bezahlt",status:"wartet auf Freigabe"},
  {id:3,no:"#2026-0003",date:"12.09.2026",merchant:"Bauhaus",purpose:"Material Bühnenbau",amount:128.40,payment:"Privat bezahlt",status:"freigegeben"},
  {id:4,no:"#2026-0004",date:"15.09.2026",merchant:"Gasthof Gemse",purpose:"Ausschusssitzung",amount:84.60,payment:"Vereinskassa / Bar",status:"ausbezahlt"}
 ],
 tx:[
  ["02.09.2026","Sponsoring Musterfirma",250,"Sponsoring"],
  ["05.09.2026","MPreis",-46.80,"Beleg #2026-0001"],
  ["08.09.2026","Spende Maria Muster",100,"Spende ohne Beleg"],
  ["10.09.2026","Interne Umbuchung Sparbuch",-1000,"Interne Umbuchung"],
  ["10.09.2026","Interne Umbuchung Girokonto",1000,"Interne Umbuchung"],
  ["12.09.2026","Bauhaus",-128.40,"Beleg #2026-0003"],
  ["20.09.2026","Mitgliedsbeiträge",300,"Mitgliedsbeitrag"],
  ["30.09.2026","Kontoführung",-9.90,"Bankspesen"],
  ["30.09.2026","KESt",-2.15,"KESt"]
 ]
};
let data=JSON.parse(localStorage.getItem("vereinskassa-demo")||"null")||structuredClone(base);
function save(){localStorage.setItem("vereinskassa-demo",JSON.stringify(data))}
function nav(){
 const items=[["dashboard","Übersicht"],["submit","Beleg"],["my","Meine Belege"],["income","Geldeingang"],["payouts","Auszahlungen"],["bank","Bank"],["audit","Kassenprüfung"],["members","Mitglieder"]];
 $("nav").innerHTML=items.map(x=>'<button class="btn btn-secondary" data-view="'+x[0]+'">'+x[1]+'</button>').join("");
 document.querySelectorAll("#nav button").forEach(b=>b.onclick=()=>show(b.dataset.view));
}
function show(v){
 document.querySelectorAll(".app-view").forEach(e=>e.classList.add("hidden"));
 $("view-"+v)?.classList.remove("hidden");
 document.querySelectorAll("#nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===v));
 if(v==="dashboard") dashboard(); if(v==="my") receipts(); if(v==="payouts") payouts(); if(v==="bank") bank(); if(v==="audit") audit(); if(v==="members") members(); if(v==="income") income();
}
function dashboard(){
 const real=data.tx.filter(x=>x[3]!=="Interne Umbuchung");
 const inc=real.filter(x=>x[2]>0).reduce((s,x)=>s+x[2],0), exp=-real.filter(x=>x[2]<0).reduce((s,x)=>s+x[2],0);
 $("statBalance").textContent=euro(data.accounts.reduce((s,x)=>s+x.balance,0)); $("statIncome").textContent=euro(inc); $("statExpense").textContent=euro(exp);
 $("statPayout").textContent=euro(data.receipts.filter(x=>x.payment==="Privat bezahlt"&&x.status==="freigegeben").reduce((s,x)=>s+x.amount,0));
 $("monthChart").innerHTML='<div class="audit-summary"><strong>September 2026</strong><span>Einnahmen '+euro(inc)+' · Ausgaben '+euro(exp)+'</span></div>';
 $("transactionSummary").innerHTML='<strong>'+data.tx.length+' Demo-Buchungen</strong>';
 $("transactionDetails").innerHTML=tableTx();
 $("approvalList").innerHTML=data.receipts.filter(x=>x.status==="wartet auf Freigabe").map(r=>rowReceipt(r,true)).join("")||'<p class="hint">Keine offenen Belege.</p>';
 bindApprove();
}
function tableTx(){return '<table><thead><tr><th>Datum</th><th>Buchung</th><th>Status</th><th>Betrag</th></tr></thead><tbody>'+data.tx.map(x=>'<tr><td>'+x[0]+'</td><td>'+x[1]+'</td><td>'+x[3]+'</td><td class="money '+(x[2]>=0?'income-amount':'expense-amount')+'">'+euro(x[2])+'</td></tr>').join("")+'</tbody></table>'}
function rowReceipt(r,approve=false){return '<div class="list-row"><div><strong>'+r.no+' · '+r.merchant+'</strong><div class="hint">'+r.date+' · '+r.purpose+' · '+r.payment+'</div><span class="status '+(r.status==="freigegeben"?"approved":r.status==="ausbezahlt"?"paid":"submitted")+'">'+r.status+'</span></div><div class="list-actions"><strong class="money">'+euro(r.amount)+'</strong>'+(approve?'<button class="btn btn-primary demo-approve" data-id="'+r.id+'">Freigeben</button>':'')+'</div></div>'}
function bindApprove(){document.querySelectorAll(".demo-approve").forEach(b=>b.onclick=()=>{data.receipts.find(x=>x.id==b.dataset.id).status="freigegeben";save();dashboard()})}
function receipts(){$("myReceipts").innerHTML=data.receipts.map(r=>rowReceipt(r)).join("")}
function payouts(){const rs=data.receipts.filter(x=>x.payment==="Privat bezahlt"&&x.status==="freigegeben");$("payoutList").innerHTML=rs.map(r=>'<div class="list-row"><div><strong>Demo-Mitglied</strong><div class="hint">'+r.no+' · '+r.purpose+'</div><div class="payout-details"><div><span>IBAN</span><strong>AT00 0000 0000 0000 0000</strong></div><div><span>Referenz</span><strong>'+r.no+' '+r.purpose+'</strong></div></div></div><strong class="money">'+euro(r.amount)+'</strong></div>').join("")}
function bank(){$("bankAccounts").innerHTML=data.accounts.map(a=>'<div class="list-row"><strong>'+a.name+'</strong><strong class="money">'+euro(a.balance)+'</strong></div>').join("");$("missingReceipts").innerHTML='<div class="list-row"><div><strong>Demo-Ausgabe ohne Zuordnung</strong><div class="hint">18.09.2026 · 32,40 €</div></div><button class="btn btn-secondary">Kein Beleg / Ausnahme</button></div>';$("unmatchedIncomeTransactions").innerHTML='<div class="list-row"><div><strong>Spende Demo-Sponsor</strong><div class="hint">19.09.2026 · 150,00 €</div></div><button class="btn btn-secondary">Zuordnen</button></div>'}
function audit(){$("auditSummary").innerHTML='<strong>'+data.receipts.length+' Belege · '+euro(data.receipts.reduce((s,x)=>s+x.amount,0))+'</strong><span class="hint">Demo-Kassenprüfung</span>';$("auditTable").innerHTML='<table><thead><tr><th>Datum</th><th>Belegnr.</th><th>Zweck</th><th>Betrag</th><th>Status</th></tr></thead><tbody>'+data.receipts.map(r=>'<tr><td>'+r.date+'</td><td>'+r.no+'</td><td>'+r.merchant+' · '+r.purpose+'</td><td>'+euro(r.amount)+'</td><td>'+r.status+'</td></tr>').join("")+'</tbody></table>'}
function members(){$("membersList").innerHTML=["Tobias Demo · Kassier","Josef Demo · Kassierstellvertreter","Michaela Demo · Mitglied","Daniel Demo · Mitglied"].map(x=>'<div class="list-row"><strong>'+x+'</strong></div>').join("")}
function income(){$("incomeList").innerHTML='<div class="list-row"><div><strong>Musterfirma GmbH</strong><div class="hint">Sponsoring · 02.09.2026</div></div><strong class="money">'+euro(250)+'</strong></div><div class="list-row"><div><strong>Maria Muster</strong><div class="hint">Spende · 08.09.2026</div></div><strong class="money">'+euro(100)+'</strong></div>'}
$("helloText").textContent="Demo Kassier";$("roleText").textContent="Kassier · Demo-Modus";$("ibanStatus").textContent="IBAN: AT00 0000 0000 0000 0000";
$("editOwnIbanBtn").onclick=()=>alert("Demo: Hier kann die IBAN bearbeitet werden.");
$("demoResetBtn").onclick=()=>{if(confirm("Demo wirklich auf Ausgangszustand zurücksetzen?")){data=structuredClone(base);save();show("dashboard")}};

$("submitReceiptBtn").onclick=()=>{const n="#2026-"+String(data.receipts.length+1).padStart(4,"0");data.receipts.push({id:Date.now(),no:n,date:"23.09.2026",merchant:$("merchant").value||"Demo Händler",purpose:$("purpose").value||"Demo-Beleg",amount:Number($("amount").value)||42.5,payment:$("paymentMethod").selectedOptions[0].textContent,status:"wartet auf Freigabe"});save();toastDemo("Demo-Beleg wurde eingereicht.");show("my");};
$("saveIncomeBtn").onclick=()=>toastDemo("Demo-Geldeingang wurde gespeichert.");
["auditPrintBtn","auditCsvBtn","receiptSheetBtn"].forEach(id=>$(id).onclick=()=>alert("Demo: Export-Funktion wird hier vorgeführt."));
nav();show("dashboard");

function toastDemo(msg){const el=document.getElementById("toast");el.textContent=msg;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2500);}
if(document.getElementById("incomeChannel"))document.getElementById("incomeChannel").onchange=e=>document.getElementById("incomeAccountWrap").classList.toggle("hidden",e.target.value==="cash");
["auditPrintBtn","auditCsvBtn","receiptSheetBtn"].forEach(id=>{const el=document.getElementById(id);if(el)el.onclick=()=>toastDemo("Demo: Export wurde simuliert.");});
