import { useState, useEffect, useMemo, useRef } from "react";
import { 
  Users, Home, Calendar, BookOpen, FileText, Settings, 
  Search, Plus, Download, Upload, LogOut, ChevronRight,
  TrendingUp, AlertCircle, CheckCircle2, MapPin, Briefcase,
  Smartphone, UserPlus, RefreshCw, Database
} from "lucide-react";
import { PublicClientApplication, InteractionRequiredAuthError } from "@azure/msal-browser";

// 1. Define the interface
interface Employee {
  id: string | number;
  name: string;
  designation: string;
  outlet: string;
  nationality: string;
  passType: string;
  workType: string;
  ftHours: string;
  ptHours: string;
  joinDate: string;
  lastDay: string;
  training: Record<string, {result?: string; date?: string}>;
  linkedUserId?: string;
  pfile?: {
    docs: any[];
    notes: string;
    probationEnd: string;
    contractEnd: string;
    remarks: string;
    photo: string;
    transfers: any[];
  };
}

// 2. Define EMPTY_EMP
const EMPTY_EMP: any = {
  id: '',
  name: '',
  designation: '',
  outlet: '',
  nationality: '',
  passType: '',
  workType: 'ft',
  ftHours: '48hrs',
  ptHours: '',
  joinDate: new Date().toISOString().split('T')[0],
  lastDay: '',
  training: {}
};

// 3. Define your colors
const HOURS_COLORS: Record<string, string> = {
  "48hrs": "#10b981",
  "54hrs": "#f59e0b",
  "62hrs": "#6366f1",
  "Full Shift": "#8b5cf6",
  "Part Time": "#ec4899",
  "Default": "#64748b"
};


// ── OneDrive / MSAL Configuration ────────────────────────────────────
const msalConfig = {
  auth: {
    clientId: "9982e25d-66bc-41fa-b62b-2e73f6a96ea0",
    authority: "https://login.microsoftonline.com/fcd6a9af-1cde-4b3b-84bc-2eb80e1a40d9",
    redirectUri: "https://bch-hr.vercel.app/",
    navigateToLoginRequestUrl: false,
  },
  cache: { cacheLocation: "localStorage", storeAuthStateInCookie: true }
};
const msalInstance = new PublicClientApplication(msalConfig);
const GRAPH_SCOPES = ["Files.ReadWrite", "User.Read"];
const OD_FILE = "BCH_HR_Data.json"; // one shared file in OneDrive root

async function getToken(): Promise<string> {
  await msalInstance.initialize();
  const accounts = msalInstance.getAllAccounts();
  if (!accounts.length) throw new Error("NOT_SIGNED_IN");
  try {
    const r = await msalInstance.acquireTokenSilent({ scopes: GRAPH_SCOPES, account: accounts[0] });
    return r.accessToken;
  } catch {
    const r = await msalInstance.acquireTokenPopup({ scopes: GRAPH_SCOPES });
    return r.accessToken;
  }
}

async function odLoad(): Promise<any | null> {
  const token = await getToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${OD_FILE}:/content`,
    { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Load failed ${res.status}`);
  return res.json();
}

async function odSave(data: any): Promise<void> {
  const token = await getToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${OD_FILE}:/content`,
    { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(data) });
  if (!res.ok) throw new Error(`Save failed ${res.status}`);
}
// ─────────────────────────────────────────────────────────────────────

// --- Helper Functions & Keys ---
const K = { 
  emp: "hr_emp_v4", 
  outlets: "hr_outl_v4", 
  users: "hr_user_v4", 
  transfers: "hr_trans_v4" 
};

const hashPwd = (p) => {
  let h = 0;
  for (let i = 0; i < p.length; i++) h = (h << 5) - h + p.charCodeAt(i);
  return h.toString();
};

const today = () => new Date().toISOString().split("T")[0];

const thisMonth = () => new Date().toISOString().slice(0, 7);

const calcService = (start, end) => {
  if (!start) return "-";
  const s = new Date(start), e = end ? new Date(end) : new Date();
  let yrs = e.getFullYear() - s.getFullYear();
  let mos = e.getMonth() - s.getMonth();
  if (mos < 0) { yrs--; mos += 12; }
  return yrs > 0 ? `${yrs}y ${mos}m` : `${mos}m`;
};
// --------------------------------
const OUTLETS_DEFAULT = ["AM","BD","BM","BP","BV","CC","CM","CP","CW","GL","GW","HF","HM","J8","JE","JM","JP","L1","NP","NX","PG","PQ","PW","RC","SA","SR","TA","TB","TC","TM","TP","T1E","T2L","T2N","T4","T4L","VH","WL","WM","WP","WS"];
const DESIGNATIONS = ["DGM","RM","SAS","AS","AAS","SOS","OS","AOS","MT","SA","PIC SA","SA/PT","PIC SA SA/PT","BA","PIC BA","BA/PT","PDT","Head Chef","Sous Chef","Server/PT","Jnr Sous Chef","Server"];
const PASS_TYPES = ["SG","SG PR","LTVP","DP","SP","WP","WP PRC","STU Pass","WP NTS"];
const NATIONALITIES = ["SGP","MY","CN","VN","PH","IN","ID","THAI","MM","Others"];
const FT_HOURS = ["48hrs","54hrs","62hrs","Full Shift"];

const TRAINING_MODULES = [
  "Orientation","Food Safety","Customer Service","SOP Training",
  "Fire Safety","First Aid","POS System","Product Knowledge",
  "Cash Handling","Opening & Closing"
];

const PFILE_DOC_TYPES = [
  "IC / Passport","Employment Pass","Work Permit","Offer Letter",
  "Contract","Appraisal","Warning Letter","Medical Certificate","Other"
];

const ROLES: Record<string,string> = {
  superadmin: "Super Admin",
  hrmanager: "HR Manager",
  hradmin: "HR Admin",
  supervisor: "Supervisor",
  staff: "Staff"
};

const validatePwd = (p: string) =>
  p.length >= 10 &&
  /[A-Z]/.test(p) &&
  /[a-z]/.test(p) &&
  /[0-9]/.test(p) &&
  /[^A-Za-z0-9]/.test(p);

// Returns appraisal alert object if employee is within 30 days of or past 3-month mark
const appraisalStatus = (joinDate: string, lastDay?: string) => {
  if (!joinDate || lastDay) return null;
  const daysIn = Math.floor((new Date().getTime() - new Date(joinDate).getTime()) / 86400000);
  if (daysIn >= 60 && daysIn <= 120) {
    if (daysIn >= 90) return { label: "Overdue", color: "#ef4444" };
    return { label: "Due Soon", color: "#f59e0b" };
  }
  return null;
};

const hoursLabel = (e: any) => {
  if (e.workType === "ft") return e.ftHours || "FT";
  return e.ptHours ? `${e.ptHours}h PT` : "PT";
};

const hoursColor = (e: any) => {
  if (e.workType === "pt") return "#ec4899";
  const map: Record<string,string> = {
    "48hrs": "#10b981",
    "54hrs": "#f59e0b",
    "62hrs": "#6366f1",
    "Full Shift": "#8b5cf6"
  };
  return map[e.ftHours] || "#64748b";
};

// Weekly hours index for FT employees
const hoursIdx = (e: any) => {
  if (e.workType === "pt") return e.ptHours ? `${e.ptHours}` : "-";
  const map: Record<string,string> = {
    "48hrs": "48",
    "54hrs": "54",
    "62hrs": "62",
    "Full Shift": "FS"
  };
  return map[e.ftHours] || "-";
};

const trainingPct = (e: any) => {
  if (!TRAINING_MODULES.length) return 0;
  const passed = TRAINING_MODULES.filter(m => e.training && e.training[m] && e.training[m].result === "Pass").length;
  return Math.round((passed / TRAINING_MODULES.length) * 100);
};

const DEFAULT_USERS = [
  {id:"u1",username:"superadmin",pwdHash:hashPwd("Admin@12345!"),role:"superadmin",name:"Super Admin",outlet:""},
  {id:"u2",username:"hrmanager",pwdHash:hashPwd("HRmgr@2025!"),role:"hrmanager",name:"HR Manager",outlet:""},
  {id:"u3",username:"hradmin",pwdHash:hashPwd("HRadm@2025!"),role:"hradmin",name:"HR Admin",outlet:""},
];

const S = {
  app:{fontFamily:"Inter,sans-serif",background:"#0f0f1a",minHeight:"100vh",color:"#e2e8f0",fontSize:13},
  card:{background:"#1e1e2e",borderRadius:10,padding:16,border:"1px solid #2d2d4e"},
  inp:(w)=>({background:"#2d2d4e",border:"1px solid #3d3d5e",borderRadius:6,padding:"6px 10px",color:"#e2e8f0",fontSize:12,width:w||"100%",boxSizing:"border-box"}),
  btn:(c,p)=>({background:c||"#6366f1",color:"#fff",border:"none",borderRadius:6,padding:p||"6px 12px",cursor:"pointer",fontSize:12,fontWeight:600}),
  th:{background:"#2d2d4e",padding:"7px 9px",textAlign:"left",fontSize:11,color:"#94a3b8",whiteSpace:"nowrap"},
  td:{padding:"7px 9px",fontSize:11,borderBottom:"1px solid #2d2d4e",whiteSpace:"nowrap"},
  badge:(c)=>({background:c+"33",color:c,border:`1px solid ${c}55`,borderRadius:4,padding:"2px 6px",fontSize:10,fontWeight:700,display:"inline-block"}),
  lbl:{fontSize:11,color:"#94a3b8",marginBottom:3,display:"block"},
  navBtn:(a)=>({padding:"6px 14px",borderRadius:6,border:"none",cursor:"pointer",fontWeight:600,fontSize:12,background:a?"#6366f1":"#2d2d4e",color:a?"#fff":"#aaa"}),
};

function PieChart({data,size=130}){
  const total=data.reduce((s,d)=>s+d.value,0);
  if(!total) return <div style={{width:size,height:size,display:"flex",alignItems:"center",justifyContent:"center",color:"#555",fontSize:11}}>No data</div>;
  let cum=0;
  const slices=data.map(d=>{const st=cum;cum+=d.value/total;return{...d,start:st,pct:d.value/total};});
  const r=size/2-4,cx=size/2,cy=size/2;
  function arc(s,e){const a1=s*2*Math.PI-Math.PI/2,a2=e*2*Math.PI-Math.PI/2;return `M${cx},${cy} L${cx+r*Math.cos(a1)},${cy+r*Math.sin(a1)} A${r},${r} 0 ${e-s>0.5?1:0},1 ${cx+r*Math.cos(a2)},${cy+r*Math.sin(a2)} Z`;}
  return <svg width={size} height={size}>{slices.map((s,i)=><path key={i} d={arc(s.start,s.start+s.pct)} fill={s.color} stroke="#1e1e2e" strokeWidth={1}><title>{s.label}: {s.value} ({(s.pct*100).toFixed(1)}%)</title></path>)}</svg>;
}
function BarChart({data,height=110}){
  const max=Math.max(...data.map(d=>d.value),1);
  return <div style={{display:"flex",alignItems:"flex-end",gap:3,height:height+30,paddingBottom:24}}>{data.map((d,i)=><div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",flex:1,minWidth:20}}><div style={{fontSize:9,color:"#ccc",marginBottom:2}}>{d.value}</div><div style={{width:"100%",height:Math.max(4,d.value/max*height),background:d.color,borderRadius:3}} title={d.label+": "+d.value}/><div style={{fontSize:8,color:"#aaa",marginTop:3,textAlign:"center",lineHeight:1.1,overflow:"hidden",maxWidth:40}}>{d.label}</div></div>)}</div>;
}

export default function App() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [outlets, setOutlets]     = useState<string[]>(OUTLETS_DEFAULT);
  const [users, setUsers]         = useState<any[]>(DEFAULT_USERS);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginErr, setLoginErr]   = useState("");
  const [tab, setTab]             = useState("dashboard");
  const [odConnected, setOdConnected] = useState(false);
  const [syncStatus, setSyncStatus]   = useState<"idle"|"loading"|"saving"|"ok"|"error">("idle");
  const [syncing, setSyncing]         = useState(false);
  const saveTimer = useRef<any>(null);

  // ── Init: check if already signed into OneDrive, load data ──────────
  useEffect(() => {
    (async () => {
      try {
        await msalInstance.initialize();
        await msalInstance.handleRedirectPromise();
        const accounts = msalInstance.getAllAccounts();
        if (accounts.length > 0) {
          setOdConnected(true);
          await pullOD();
        } else {
          localLoad();
        }
      } catch {
        localLoad();
      }
    })();
  }, []);

  // ── localStorage helpers (fallback / cache) ──────────────────────────
  function localLoad() {
    try {
      const e = localStorage.getItem(K.emp);      if (e) setEmployees(JSON.parse(e));
      const o = localStorage.getItem(K.outlets);  if (o) setOutlets(JSON.parse(o));
      const u = localStorage.getItem(K.users);    if (u) setUsers(JSON.parse(u));
      const t = localStorage.getItem(K.transfers);if (t) setTransfers(JSON.parse(t));
    } catch {}
  }
  function localSave(emp=employees,out=outlets,usr=users,tr=transfers) {
    localStorage.setItem(K.emp,       JSON.stringify(emp));
    localStorage.setItem(K.outlets,   JSON.stringify(out));
    localStorage.setItem(K.users,     JSON.stringify(usr));
    localStorage.setItem(K.transfers, JSON.stringify(tr));
  }

  // ── Pull latest from OneDrive ────────────────────────────────────────
  async function pullOD() {
    setSyncStatus("loading");
    try {
      const data = await odLoad();
      if (data) {
        if (data.employees) setEmployees(data.employees);
        if (data.outlets)   setOutlets(data.outlets);
        if (data.users)     setUsers(data.users);
        if (data.transfers) setTransfers(data.transfers);
        localSave(data.employees||[], data.outlets||OUTLETS_DEFAULT, data.users||DEFAULT_USERS, data.transfers||[]);
      }
      setSyncStatus("ok");
    } catch (err) {
      console.error("Pull error:", err);
      setSyncStatus("error");
      localLoad();
    }
  }

  // ── Auto-save to OneDrive 2s after any change ────────────────────────
  function scheduleSave(emp=employees,out=outlets,usr=users,tr=transfers) {
    localSave(emp, out, usr, tr);
    if (!odConnected) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSyncStatus("saving");
      try {
        await odSave({ employees:emp, outlets:out, users:usr, transfers:tr, savedAt:new Date().toISOString() });
        setSyncStatus("ok");
      } catch { setSyncStatus("error"); }
    }, 2000);
  }

  // Wrapped setters — every change triggers auto-save
  function setEmp(v:any){ const d=typeof v==="function"?v(employees):v; setEmployees(d); scheduleSave(d,outlets,users,transfers); }
  function setOut(v:any){ const d=typeof v==="function"?v(outlets):v;   setOutlets(d);   scheduleSave(employees,d,users,transfers); }
  function setUsr(v:any){ const d=typeof v==="function"?v(users):v;     setUsers(d);     scheduleSave(employees,outlets,d,transfers); }
  function setTr(v:any){  const d=typeof v==="function"?v(transfers):v; setTransfers(d); scheduleSave(employees,outlets,users,d); }

  // ── Connect OneDrive button ──────────────────────────────────────────
  async function connectOD() {
    setSyncing(true);
    try {
      await msalInstance.initialize();
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length > 0) {
        setOdConnected(true);
        await pullOD();
      } else {
        await msalInstance.loginRedirect({ scopes: GRAPH_SCOPES, prompt: "select_account" });
      }
    } catch (err:any) {
      alert("OneDrive connection failed: " + err.message);
    } finally { setSyncing(false); }
  }

  // ── Login ────────────────────────────────────────────────────────────
  function doLogin() {
    const u = users.find((u:any) => u.username === loginForm.username.trim());
    if (!u || u.pwdHash !== hashPwd(loginForm.password)) {
      setLoginErr("Invalid username or password."); return;
    }
    setCurrentUser(u); setLoginErr("");
    setTab(["superadmin","hrmanager","hradmin"].includes(u.role) ? "dashboard" : "myprofile");
  }

  // ── Sync status badge ────────────────────────────────────────────────
  const syncBadge = () => {
    if (!odConnected)          return <span style={{...S.badge("#64748b"),fontSize:9}}>💾 Local only</span>;
    if (syncStatus==="loading") return <span style={{...S.badge("#6366f1"),fontSize:9}}>⬇ Loading…</span>;
    if (syncStatus==="saving")  return <span style={{...S.badge("#f59e0b"),fontSize:9}}>⬆ Saving…</span>;
    if (syncStatus==="ok")      return <span style={{...S.badge("#10b981"),fontSize:9}}>☁ Synced</span>;
    if (syncStatus==="error")   return <span style={{...S.badge("#ef4444"),fontSize:9}}>⚠ Sync error</span>;
    return null;
  };

  // ── Login screen ─────────────────────────────────────────────────────
  if (!currentUser) return (
    <div style={{ ...S.app, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ ...S.card, width:340, padding:32 }}>
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <Database size={40} color="#6366f1" style={{marginBottom:10}}/>
          <div style={{ fontWeight:800, fontSize:18, color:"#6366f1" }}>BCH HR SYSTEM</div>
          <div style={{ fontSize:11, color:"#64748b", marginTop:4 }}>Retail Operations Portal</div>
          <div style={{marginTop:8}}>{syncBadge()}</div>
        </div>
        <div style={{marginBottom:12}}>
          <label style={S.lbl}>Username</label>
          <input style={S.inp()} value={loginForm.username} onChange={e=>setLoginForm(f=>({...f,username:e.target.value}))}/>
        </div>
        <div style={{marginBottom:16}}>
          <label style={S.lbl}>Password</label>
          <input type="password" style={S.inp()} value={loginForm.password}
            onChange={e=>setLoginForm(f=>({...f,password:e.target.value}))}
            onKeyDown={e=>e.key==="Enter"&&doLogin()}/>
        </div>
        {loginErr&&<div style={{color:"#ef4444",fontSize:11,marginBottom:10}}>{loginErr}</div>}
        <button style={{...S.btn(),width:"100%",padding:"10px"}} onClick={doLogin}>Login</button>
        {!odConnected
          ? <button onClick={connectOD} disabled={syncing}
              style={{...S.btn("#0078d4"),width:"100%",marginTop:12,display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:syncing?0.7:1}}>
              <RefreshCw size={14}/>{syncing?"Connecting…":"🔗 Connect OneDrive"}
            </button>
          : <button onClick={pullOD}
              style={{...S.btn("#10b981"),width:"100%",marginTop:12,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <RefreshCw size={14}/>Refresh Data
            </button>
        }
        <div style={{fontSize:10,color:"#64748b",marginTop:10,textAlign:"center"}}>
          {odConnected
            ? "☁ OneDrive connected — all devices share the same data"
            : "Connect OneDrive so all colleagues see the same data"}
        </div>
      </div>
    </div>
  );

  const isHR = ["superadmin","hrmanager","hradmin"].includes(currentUser.role);
  if (isHR) return (
    <HRView
      currentUser={currentUser}
      employees={employees}   setEmployees={setEmp}
      outlets={outlets}       setOutlets={setOut}
      users={users}           setUsers={setUsr}
      transfers={transfers}   setTransfers={setTr}
      onLogout={()=>setCurrentUser(null)}
      tab={tab} setTab={setTab}
      onSync={pullOD}
      syncBadge={syncBadge}
    />
  );
  return <StaffView currentUser={currentUser} employees={employees} outlets={outlets}
    onLogout={()=>setCurrentUser(null)} isSupervisor={currentUser.role==="supervisor"}/>;
}
function StaffView({currentUser,employees,outlets,onLogout,isSupervisor}){
  const [tab,setTab]=useState("mycerts");
  const me=employees.find(e=>e.linkedUserId===currentUser.id||e.name===currentUser.name);
  const tabs=isSupervisor?[["mycerts","My Certifications"],["outletcerts","Outlet Certifications"]]:[["mycerts","My Certifications"]];
  return(
    <div style={S.app}>
      <div style={{background:"#13131f",padding:"10px 16px",borderBottom:"1px solid #2d2d4e",display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontWeight:800,fontSize:15,color:"#6366f1"}}>🏢 HR System</span>
        <span style={{fontSize:11,color:"#94a3b8"}}>{currentUser.name}</span>
        <span style={S.badge("#6366f1")}>{ROLES[currentUser.role]}</span>
        <div style={{flex:1}}/>
        <button style={S.btn("#64748b","5px 12px")} onClick={onLogout}>Logout</button>
      </div>
      <div style={{display:"flex",gap:4,padding:"10px 16px",background:"#1a1a2e",borderBottom:"1px solid #2d2d4e"}}>
        {tabs.map(([t,l])=><button key={t} style={S.navBtn(tab===t)} onClick={()=>setTab(t)}>{l}</button>)}
      </div>
      <div style={{padding:16}}>
        {tab==="mycerts"&&<MyCerts me={me}/>}
        {tab==="outletcerts"&&isSupervisor&&<OutletCerts currentUser={currentUser} employees={employees}/>}
      </div>
    </div>
  );
}

function MyCerts({me}){
  if(!me) return <div style={{...S.card,padding:24,color:"#64748b",textAlign:"center"}}>No employee record linked to your account. Please contact HR.</div>;
  const tr=me.training||{};
  return(
    <div>
      <div style={{...S.card,marginBottom:12,display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{fontSize:28}}>👤</div>
        <div>
          <div style={{fontWeight:800,fontSize:15}}>{me.name}</div>
          <div style={{fontSize:11,color:"#94a3b8"}}>{me.designation} · {me.outlet}</div>
          <div style={{fontSize:11,color:"#94a3b8"}}>Joined: {me.joinDate} · Service: {calcService(me.joinDate,me.lastDay)}</div>
        </div>
        <div style={{marginLeft:"auto",textAlign:"right"}}>
          <div style={{fontSize:22,fontWeight:800,color:"#10b981"}}>{trainingPct(me)}%</div>
          <div style={{fontSize:11,color:"#94a3b8"}}>{TRAINING_MODULES.filter(m=>tr[m]&&tr[m].result==="Pass").length}/{TRAINING_MODULES.length} passed</div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:8}}>
        {TRAINING_MODULES.map(m=>{
          const r=tr[m]&&tr[m].result, d=tr[m]&&tr[m].date;
          const c=r==="Pass"?"#10b981":r==="Fail"?"#ef4444":"#64748b";
          return <div key={m} style={{...S.card,padding:"10px 12px",borderLeft:`3px solid ${c}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{fontSize:11,fontWeight:600}}>{m}</div>{d&&<div style={{fontSize:10,color:"#64748b"}}>{d}</div>}</div>
            <span style={S.badge(c)}>{r||"Pending"}</span>
          </div>;
        })}
      </div>
    </div>
  );
}

function OutletCerts({currentUser,employees}){
  const outletStaff=employees.filter(e=>e.outlet===currentUser.outlet&&!e.lastDay);
  return(
    <div>
      <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>{currentUser.outlet} — Team Certifications</div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
          <thead><tr>
            <th style={{...S.th,minWidth:130}}>Name</th>
            <th style={{...S.th,minWidth:50}}>%</th>
            {TRAINING_MODULES.map(m=><th key={m} style={{...S.th,minWidth:60,writingMode:"vertical-lr",transform:"rotate(180deg)",height:80,fontSize:9,padding:"4px 2px"}}>{m}</th>)}
          </tr></thead>
          <tbody>{outletStaff.map(e=>{
            const tr=e.training||{};
            return <tr key={e.id}>
              <td style={{...S.td,fontWeight:600}}>{e.name}</td>
              <td style={S.td}><span style={{color:trainingPct(e)===100?"#10b981":trainingPct(e)>50?"#f59e0b":"#ef4444",fontWeight:700}}>{trainingPct(e)}%</span></td>
              {TRAINING_MODULES.map(m=>{const r=tr[m]&&tr[m].result;return <td key={m} style={{...S.td,textAlign:"center",background:r==="Pass"?"#10b98122":r==="Fail"?"#ef444422":"transparent"}}>{r==="Pass"?"✓":r==="Fail"?"✗":"·"}</td>;})}
            </tr>;
          })}</tbody>
        </table>
      </div>
    </div>
  );
}

function HRView({currentUser,employees,setEmployees,outlets,setOutlets,users,setUsers,transfers,setTransfers,onLogout,tab,setTab,onSync,syncBadge}:any){
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState(EMPTY_EMP);
  const [editId,setEditId]=useState(null);
  const [search,setSearch]=useState("");
  const [filterOutlet,setFilterOutlet]=useState("");
  const [filterStatus,setFilterStatus]=useState("");
  const [appraisalFilter,setAppraisalFilter]=useState(false);
  const [sortCol,setSortCol]=useState("name");
  const [sortDir,setSortDir]=useState("asc");
  const [profileEmp,setProfileEmp]=useState(null);
  const [profileTab,setProfileTab]=useState("info");
  const [newOutlet,setNewOutlet]=useState("");
  const [transferModal,setTransferModal]=useState(null);
  const [pwdModal,setPwdModal]=useState(null);
  const [userModal,setUserModal]=useState(false);
  const [trDateFrom,setTrDateFrom]=useState("");
  const [trDateTo,setTrDateTo]=useState("");
  const fileRef=useRef();
  const photoRef=useRef();

  const isSA=currentUser.role==="superadmin";
  const active=employees.filter(e=>!e.lastDay);
  const appraisalAlerts=active.filter(e=>appraisalStatus(e.joinDate,e.lastDay));
  const newThisMonth=employees.filter(e=>e.joinDate&&e.joinDate.slice(0,7)===thisMonth()&&!e.lastDay);
  const resignedThisMonth=employees.filter(e=>e.lastDay&&e.lastDay.slice(0,7)===thisMonth());
  const sgCount=active.filter(e=>e.passType==="SG"||e.passType==="SG PR").length;
  const foreignCount=active.length-sgCount;
  const ftCount=active.filter(e=>e.workType==="ft").length;
  const ptCount=active.filter(e=>e.workType==="pt").length;
  const natData=NATIONALITIES.map((n,i)=>({label:n,value:active.filter(e=>e.nationality===n).length,color:`hsl(${i*36},60%,55%)`})).filter(d=>d.value>0);
  const passData=PASS_TYPES.map((p,i)=>({label:p,value:active.filter(e=>e.passType===p).length,color:`hsl(${i*40},65%,55%)`})).filter(d=>d.value>0);
  const hoursBreakdown=[...FT_HOURS.map(h=>({label:h,value:active.filter(e=>e.workType==="ft"&&e.ftHours===h).length,color:HOURS_COLORS[h]})),{label:"Part Time",value:ptCount,color:HOURS_COLORS["Part Time"]}].filter(d=>d.value>0);

  const hrTabs=[["dashboard","📊 Dashboard"],["employees","👥 Employees"],["outlets","🏬 Outlets"],["training","📚 Training"],["transfers","🔄 Transfers"],["appraisals","⚠️ Appraisals"]];
  if(isSA) hrTabs.push(["users","🔑 Users"]);

  function saveEmployee(){
    if(!form.name.trim()||!form.outlet||!form.joinDate){alert("Name, Outlet and Join Date required.");return;}
    if(editId!==null){setEmployees(p=>p.map(e=>e.id===editId?{...form,id:editId}:e));}
    else{setEmployees(p=>[...p,{...EMPTY_EMP,...form,id:Date.now()}]);}
    setForm(EMPTY_EMP);setEditId(null);setShowForm(false);
  }

  function openProfile(emp){
    const pfile={docs:[],notes:"",probationEnd:"",contractEnd:"",remarks:"",photo:"",transfers:[],...(emp.pfile||{})};
    setProfileEmp({...EMPTY_EMP,...emp,training:emp.training||{},pfile});
    setProfileTab("info");
  }
  function saveProfile(){setEmployees(p=>p.map(e=>e.id===profileEmp.id?{...profileEmp}:e));setProfileEmp(null);}
  function updateTraining(mod,field,val){setProfileEmp(p=>({...p,training:{...p.training,[mod]:{...(p.training[mod]||{}),[field]:val}}}));}
  function updatePfile(field,val){setProfileEmp(p=>({...p,pfile:{...p.pfile,[field]:val}}));}

  function addDoc(e){
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>{const doc={name:file.name,type:file.type,size:file.size,data:ev.target.result,docType:"Other",date:today(),id:Date.now()};setProfileEmp(p=>({...p,pfile:{...p.pfile,docs:[...(p.pfile.docs||[]),doc]}}));};
    reader.readAsDataURL(file);e.target.value="";
  }
  function addPhoto(e){
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>updatePfile("photo",ev.target.result);
    reader.readAsDataURL(file);e.target.value="";
  }
  function removeDoc(id){setProfileEmp(p=>({...p,pfile:{...p.pfile,docs:p.pfile.docs.filter(d=>d.id!==id)}}));}

  function doTransfer(){
    if(!transferModal.toOutlet||!transferModal.date){alert("Select destination outlet and date.");return;}
    const log={id:Date.now(),empId:transferModal.emp.id,empName:transferModal.emp.name,from:transferModal.emp.outlet,to:transferModal.toOutlet,date:transferModal.date,reason:transferModal.reason||""};
    setTransfers(p=>[...p,log]);
    setEmployees(p=>p.map(e=>{
      if(e.id!==transferModal.emp.id) return e;
      const pfile={...(e.pfile||{}),transfers:[...((e.pfile&&e.pfile.transfers)||[]),{id:log.id,from:log.from,to:log.to,date:log.date,reason:log.reason}]};
      return {...e,outlet:transferModal.toOutlet,pfile};
    }));
    if(profileEmp&&profileEmp.id===transferModal.emp.id){
      setProfileEmp(p=>({...p,outlet:transferModal.toOutlet,pfile:{...p.pfile,transfers:[...(p.pfile.transfers||[]),{id:log.id,from:log.from,to:log.to,date:log.date,reason:log.reason}]}}));
    }
    setTransferModal(null);
  }

  function exportTransfers(){
    const rows=filteredTransfers.map(t=>[t.date,t.empName,t.from,t.to,t.reason||""]);
    const csv=[["Date","Employee","From","To","Reason"],...rows].map(r=>r.map(c=>'"'+c+'"').join(",")).join("\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="transfers.csv";a.click();
  }
  function exportEmployees(){
    const h=["Name","Outlet","Designation","Nationality","Pass Type","Work Type","Hours","Index","Join Date","Last Day","Service",...TRAINING_MODULES];
    const rows=employees.map(e=>{const tr=e.training||{};return[e.name,e.outlet,e.designation,e.nationality,e.passType,e.workType==="ft"?"FT":"PT",e.workType==="ft"?e.ftHours:(e.ptHours+"h"),hoursIdx(e),e.joinDate,e.lastDay||"",calcService(e.joinDate,e.lastDay),...TRAINING_MODULES.map(m=>tr[m]&&tr[m].result?(tr[m].result+" ("+(tr[m].date||"")+")"):"-")];});
    const csv=[h,...rows].map(r=>r.map(c=>'"'+c+'"').join(",")).join("\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="employees.csv";a.click();
  }

  const filteredTransfers=useMemo(()=>transfers.filter(t=>{
    if(trDateFrom&&t.date<trDateFrom) return false;
    if(trDateTo&&t.date>trDateTo) return false;
    return true;
  }).sort((a,b)=>b.date.localeCompare(a.date)),[transfers,trDateFrom,trDateTo]);

  const filtered=useMemo(()=>{
    let list=employees.filter(e=>{
      const q=search.toLowerCase();
      if(q&&!(e.name||"").toLowerCase().includes(q)&&!(e.designation||"").toLowerCase().includes(q)&&!(e.outlet||"").toLowerCase().includes(q)) return false;
      if(filterOutlet&&e.outlet!==filterOutlet) return false;
      if(filterStatus==="active"&&e.lastDay) return false;
      if(filterStatus==="resigned"&&!e.lastDay) return false;
      if(appraisalFilter&&!appraisalStatus(e.joinDate,e.lastDay)) return false;
      return true;
    });
    return [...list].sort((a,b)=>{let va=a[sortCol]||"",vb=b[sortCol]||"";if(sortCol==="service"){va=a.joinDate||"";vb=b.joinDate||"";}return sortDir==="asc"?va.localeCompare(vb):vb.localeCompare(va);});
  },[employees,search,filterOutlet,filterStatus,appraisalFilter,sortCol,sortDir]);

  function toggleSort(col){if(sortCol===col)setSortDir(d=>d==="asc"?"desc":"asc");else{setSortCol(col);setSortDir("asc");}}

  function addOutlet(){const o=newOutlet.trim().toUpperCase();if(!o||outlets.includes(o))return;setOutlets(p=>[...p,o].sort());setNewOutlet("");}

  return(
    <div style={S.app}>
      {/* Transfer Modal */}
      {transferModal&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{...S.card,width:360,padding:24}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:14}}>🔄 Transfer: {transferModal.emp.name}</div>
            <div style={{marginBottom:10}}><label style={S.lbl}>Current Outlet</label><span style={S.badge("#6366f1")}>{transferModal.emp.outlet}</span></div>
            <div style={{marginBottom:10}}><label style={S.lbl}>Transfer To</label>
              <select style={S.inp()} value={transferModal.toOutlet||""} onChange={e=>setTransferModal(p=>({...p,toOutlet:e.target.value}))}>
                <option value="">Select outlet…</option>
                {outlets.filter(o=>o!==transferModal.emp.outlet).map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
            <div style={{marginBottom:10}}><label style={S.lbl}>Transfer Date</label><input type="date" style={S.inp()} value={transferModal.date||""} onChange={e=>setTransferModal(p=>({...p,date:e.target.value}))}/></div>
            <div style={{marginBottom:14}}><label style={S.lbl}>Reason (optional)</label><input style={S.inp()} value={transferModal.reason||""} onChange={e=>setTransferModal(p=>({...p,reason:e.target.value}))}/></div>
            <div style={{display:"flex",gap:8}}><button style={S.btn()} onClick={doTransfer}>Confirm</button><button style={S.btn("#64748b")} onClick={()=>setTransferModal(null)}>Cancel</button></div>
          </div>
        </div>
      )}

      {/* Password Modal */}
      {pwdModal&&<PwdModal pwdModal={pwdModal} setPwdModal={setPwdModal} users={users} setUsers={setUsers}/>}

      {/* User Modal */}
      {userModal&&isSA&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:150,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"20px 10px",overflowY:"auto"}}>
          <div style={{background:"#1e1e2e",borderRadius:12,width:"100%",maxWidth:700,border:"1px solid #3d3d5e"}}>
            <div style={{padding:"14px 18px",borderBottom:"1px solid #2d2d4e",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontWeight:800,fontSize:15}}>🔑 User Management</span>
              <button style={S.btn("#64748b")} onClick={()=>setUserModal(false)}>✕ Close</button>
            </div>
            <div style={{padding:16}}><UserTab users={users} setUsers={setUsers} outlets={outlets} setPwdModal={setPwdModal}/></div>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {profileEmp&&(
        <div style={{position:"fixed",inset:0,background:"#000a",zIndex:100,display:"flex",alignItems:"flex-start",justifyContent:"center",overflowY:"auto",padding:"20px 10px"}}>
          <div style={{background:"#1e1e2e",borderRadius:12,width:"100%",maxWidth:780,border:"1px solid #3d3d5e"}}>
            <div style={{padding:"14px 18px",borderBottom:"1px solid #2d2d4e",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                {profileEmp.pfile.photo
                  ?<img src={profileEmp.pfile.photo} style={{width:44,height:44,borderRadius:"50%",objectFit:"cover",border:"2px solid #6366f1"}}/>
                  :<div style={{width:44,height:44,borderRadius:"50%",background:"#2d2d4e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>👤</div>}
                <div>
                  <div style={{fontWeight:800,fontSize:15}}>{profileEmp.name}</div>
                  <div style={{fontSize:11,color:"#94a3b8"}}>{profileEmp.designation} · {profileEmp.outlet} · Joined {profileEmp.joinDate}</div>
                </div>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <button style={S.btn("#8b5cf6","5px 10px")} onClick={()=>setTransferModal({emp:profileEmp,toOutlet:"",date:today(),reason:""})}>🔄 Transfer</button>
                <button style={S.btn()} onClick={saveProfile}>💾 Save</button>
                <button style={S.btn("#64748b")} onClick={()=>setProfileEmp(null)}>✕</button>
              </div>
            </div>
            <div style={{display:"flex",gap:4,padding:"10px 14px",borderBottom:"1px solid #2d2d4e",flexWrap:"wrap"}}>
              {["info","training","pfile","transfers"].map(t=><button key={t} style={S.navBtn(profileTab===t)} onClick={()=>setProfileTab(t)}>{t==="info"?"👤 Info":t==="training"?"📚 Training":t==="pfile"?"📁 P-File":"🔄 Transfers"}</button>)}
            </div>
            <div style={{padding:16}}>
              {profileTab==="info"&&(
                <div>
                  <div style={{marginBottom:14,display:"flex",alignItems:"center",gap:12}}>
                    {profileEmp.pfile.photo
                      ?<img src={profileEmp.pfile.photo} style={{width:64,height:64,borderRadius:"50%",objectFit:"cover",border:"2px solid #6366f1"}}/>
                      :<div style={{width:64,height:64,borderRadius:"50%",background:"#2d2d4e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>👤</div>}
                    <div>
                      <button style={S.btn("#6366f1","5px 10px")} onClick={()=>photoRef.current.click()}>📷 Upload Photo</button>
                      <div style={{fontSize:10,color:"#64748b",marginTop:4}}>JPG/PNG recommended</div>
                    </div>
                    <input ref={photoRef} type="file" accept="image/*" style={{display:"none"}} onChange={addPhoto}/>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10}}>
                    {[["Full Name","name","text"],["Join Date","joinDate","date"],["Last Day","lastDay","date"]].map(([l,k,t])=>(
                      <div key={k}><label style={S.lbl}>{l}</label><input type={t} style={S.inp()} value={profileEmp[k]||""} onChange={e=>setProfileEmp(p=>({...p,[k]:e.target.value}))}/></div>
                    ))}
                    {[["Outlet","outlet",outlets],["Designation","designation",DESIGNATIONS],["Nationality","nationality",NATIONALITIES],["Pass Type","passType",PASS_TYPES]].map(([l,k,opts])=>(
                      <div key={k}><label style={S.lbl}>{l}</label><select style={S.inp()} value={profileEmp[k]||""} onChange={e=>setProfileEmp(p=>({...p,[k]:e.target.value}))}><option value="">Select…</option>{opts.map(o=><option key={o}>{o}</option>)}</select></div>
                    ))}
                    <div><label style={S.lbl}>Work Type</label><select style={S.inp()} value={profileEmp.workType} onChange={e=>setProfileEmp(p=>({...p,workType:e.target.value}))}><option value="ft">Full Time</option><option value="pt">Part Time</option></select></div>
                    {profileEmp.workType==="ft"
                      ?<div><label style={S.lbl}>FT Hours</label><select style={S.inp()} value={profileEmp.ftHours} onChange={e=>setProfileEmp(p=>({...p,ftHours:e.target.value}))}>{FT_HOURS.map(h=><option key={h}>{h}</option>)}</select></div>
                      :<div><label style={S.lbl}>PT hrs/week</label><input type="number" style={S.inp()} value={profileEmp.ptHours||""} onChange={e=>setProfileEmp(p=>({...p,ptHours:e.target.value}))}/></div>}
                  </div>
                </div>
              )}
              {profileTab==="training"&&(
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                    <div style={{flex:1,background:"#2d2d4e",borderRadius:6,height:8}}><div style={{height:"100%",background:"#10b981",width:trainingPct(profileEmp)+"%",borderRadius:6}}/></div>
                    <span style={{color:"#10b981",fontWeight:700,fontSize:12}}>{trainingPct(profileEmp)}%</span>
                    <span style={{color:"#64748b",fontSize:11}}>{TRAINING_MODULES.filter(m=>profileEmp.training[m]&&profileEmp.training[m].result==="Pass").length}/{TRAINING_MODULES.length} passed</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:8}}>
                    {TRAINING_MODULES.map(mod=>{
                      const tr=profileEmp.training[mod]||{};
                      const c=tr.result==="Pass"?"#10b981":tr.result==="Fail"?"#ef4444":"#64748b";
                      return <div key={mod} style={{background:"#2d2d4e",borderRadius:8,padding:"10px 12px",borderLeft:"3px solid "+c}}>
                        <div style={{fontSize:11,fontWeight:600,marginBottom:6}}>{mod}</div>
                        <div style={{display:"flex",gap:6}}>
                          <select style={{...S.inp("100px"),fontSize:11}} value={tr.result||""} onChange={e=>updateTraining(mod,"result",e.target.value)}><option value="">Not Done</option><option value="Pass">✅ Pass</option><option value="Fail">❌ Fail</option></select>
                          <input type="date" style={{...S.inp("130px"),fontSize:11}} value={tr.date||""} onChange={e=>updateTraining(mod,"date",e.target.value)}/>
                        </div>
                      </div>;
                    })}
                  </div>
                </div>
              )}
              {profileTab==="pfile"&&(
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <div style={S.card}>
                    <div style={{fontWeight:700,marginBottom:10,fontSize:12}}>📅 Key Dates & Notes</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:10}}>
                      <div><label style={S.lbl}>Probation End</label><input type="date" style={S.inp()} value={profileEmp.pfile.probationEnd||""} onChange={e=>updatePfile("probationEnd",e.target.value)}/></div>
                      <div><label style={S.lbl}>Contract End</label><input type="date" style={S.inp()} value={profileEmp.pfile.contractEnd||""} onChange={e=>updatePfile("contractEnd",e.target.value)}/></div>
                    </div>
                    <div style={{marginBottom:8}}><label style={S.lbl}>Notes</label><textarea rows={2} style={{...S.inp(),resize:"vertical"}} value={profileEmp.pfile.notes||""} onChange={e=>updatePfile("notes",e.target.value)}/></div>
                    <div><label style={S.lbl}>Remarks</label><textarea rows={2} style={{...S.inp(),resize:"vertical"}} value={profileEmp.pfile.remarks||""} onChange={e=>updatePfile("remarks",e.target.value)}/></div>
                  </div>
                  <div style={S.card}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                      <div style={{fontWeight:700,fontSize:12}}>📎 Documents ({(profileEmp.pfile.docs||[]).length})</div>
                      <button style={S.btn("#6366f1","5px 10px")} onClick={()=>fileRef.current.click()}>+ Upload</button>
                    </div>
                    <input ref={fileRef} type="file" style={{display:"none"}} onChange={addDoc}/>
                    {(profileEmp.pfile.docs||[]).length===0
                      ?<div style={{color:"#64748b",fontSize:11,textAlign:"center",padding:12}}>No documents yet</div>
                      :<div style={{display:"flex",flexDirection:"column",gap:6}}>
                        {(profileEmp.pfile.docs||[]).map(doc=>(
                          <div key={doc.id} style={{background:"#2d2d4e",borderRadius:6,padding:"8px 10px",display:"flex",alignItems:"center",gap:8}}>
                            <span>{doc.type&&doc.type.includes("pdf")?"📄":doc.type&&doc.type.includes("image")?"🖼️":"📎"}</span>
                            <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{doc.name}</div><div style={{fontSize:10,color:"#94a3b8"}}>{doc.date} · {(doc.size/1024).toFixed(1)} KB</div></div>
                            <select style={{...S.inp("110px"),fontSize:10}} value={doc.docType||"Other"} onChange={e=>{const docs=(profileEmp.pfile.docs||[]).map(d=>d.id===doc.id?{...d,docType:e.target.value}:d);updatePfile("docs",docs);}}>
                              {PFILE_DOC_TYPES.map(t=><option key={t}>{t}</option>)}
                            </select>
                            <a href={doc.data} download={doc.name} style={{...S.btn("#10b981","4px 8px"),textDecoration:"none",fontSize:10}}>⬇</a>
                            <button style={S.btn("#ef4444","4px 8px")} onClick={()=>removeDoc(doc.id)}>✕</button>
                          </div>
                        ))}
                      </div>}
                  </div>
                </div>
              )}
              {profileTab==="transfers"&&(
                <div>
                  <div style={{fontWeight:700,fontSize:12,marginBottom:10}}>🔄 Transfer History</div>
                  {(profileEmp.pfile&&profileEmp.pfile.transfers&&profileEmp.pfile.transfers.length>0)
                    ?<table style={{width:"100%",borderCollapse:"collapse"}}>
                      <thead><tr>{["Date","From","To","Reason"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                      <tbody>{[...profileEmp.pfile.transfers].sort((a,b)=>b.date.localeCompare(a.date)).map(t=><tr key={t.id}><td style={S.td}>{t.date}</td><td style={S.td}><span style={S.badge("#ef4444")}>{t.from}</span></td><td style={S.td}><span style={S.badge("#10b981")}>{t.to}</span></td><td style={S.td}>{t.reason||"—"}</td></tr>)}</tbody>
                    </table>
                    :<div style={{color:"#64748b",fontSize:11,textAlign:"center",padding:20}}>No transfers recorded</div>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div style={{background:"#13131f",padding:"10px 16px",borderBottom:"1px solid #2d2d4e",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <span style={{fontWeight:800,fontSize:15,color:"#6366f1"}}>🏢 HR System</span>
        <span style={{fontSize:11,color:"#94a3b8"}}>{currentUser.name}</span>
        <span style={S.badge("#6366f1")}>{ROLES[currentUser.role]}</span>
        {appraisalAlerts.length>0&&<span style={S.badge("#ef4444")}>⚠ {appraisalAlerts.length} appraisal{appraisalAlerts.length>1?"s":""} due</span>}
        {syncBadge&&syncBadge()}
        <div style={{flex:1}}/>
        {isSA&&<button style={S.btn("#8b5cf6","5px 12px")} onClick={()=>setUserModal(true)}>🔑 Manage Users</button>}
        <button style={{...S.btn("#0078d4","5px 12px"),display:"flex",alignItems:"center",gap:4}} onClick={onSync}><RefreshCw size={12}/>Sync</button>
        <button style={S.btn("#64748b","5px 12px")} onClick={onLogout}>Logout</button>
      </div>
      <div style={{display:"flex",gap:4,padding:"10px 16px",background:"#1a1a2e",borderBottom:"1px solid #2d2d4e",flexWrap:"wrap"}}>
        {hrTabs.map(([t,l])=><button key={t} style={S.navBtn(tab===t)} onClick={()=>setTab(t)}>{l}{t==="appraisals"&&appraisalAlerts.length>0?" ("+appraisalAlerts.length+")":""}</button>)}
      </div>

      {/* DASHBOARD */}
      {tab==="dashboard"&&(
        <div style={{padding:16}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12,marginBottom:16}}>
            {[["Total Active",active.length,"#6366f1"],["New This Month",newThisMonth.length,"#10b981"],["Resigned This Month",resignedThisMonth.length,"#ef4444"],["Appraisals Due",appraisalAlerts.length,"#f59e0b"],["Outlets",outlets.length,"#8b5cf6"]].map(([l,v,c])=>(
              <div key={l} style={{...S.card,borderLeft:"3px solid "+c}}><div style={{fontSize:22,fontWeight:800,color:c}}>{v}</div><div style={{fontSize:11,color:"#94a3b8"}}>{l}</div></div>
            ))}
          </div>
          {newThisMonth.length>0&&<div style={{...S.card,marginBottom:12,borderLeft:"3px solid #10b981"}}>
            <div style={{fontWeight:700,fontSize:12,marginBottom:8,color:"#10b981"}}>🆕 New Hires This Month</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{newThisMonth.map(e=><div key={e.id} style={{background:"#10b98122",border:"1px solid #10b98144",borderRadius:6,padding:"4px 10px",fontSize:11}}><b>{e.name}</b> · {e.outlet} · {e.joinDate}</div>)}</div>
          </div>}
          {resignedThisMonth.length>0&&<div style={{...S.card,marginBottom:12,borderLeft:"3px solid #ef4444"}}>
            <div style={{fontWeight:700,fontSize:12,marginBottom:8,color:"#ef4444"}}>👋 Resigned This Month</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{resignedThisMonth.map(e=><div key={e.id} style={{background:"#ef444422",border:"1px solid #ef444444",borderRadius:6,padding:"4px 10px",fontSize:11}}><b>{e.name}</b> · {e.outlet} · {e.lastDay}</div>)}</div>
          </div>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12}}>
            <div style={S.card}><div style={{fontWeight:700,marginBottom:10,fontSize:12}}>🌏 SG vs Foreigners</div><div style={{display:"flex",alignItems:"center",gap:10}}><PieChart data={[{label:"SG/PR",value:sgCount,color:"#6366f1"},{label:"Foreigners",value:foreignCount,color:"#f59e0b"}]}/><div>{[["SG/PR",sgCount,"#6366f1"],["Foreigners",foreignCount,"#f59e0b"]].map(([l,v,c])=><div key={l} style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}><div style={{width:10,height:10,borderRadius:2,background:c}}/><span style={{fontSize:11}}>{l}: <b>{v}</b> ({active.length?(v/active.length*100).toFixed(0):0}%)</span></div>)}</div></div></div>
            <div style={S.card}><div style={{fontWeight:700,marginBottom:10,fontSize:12}}>⏱ FT vs PT</div><div style={{display:"flex",alignItems:"center",gap:10}}><PieChart data={[{label:"FT",value:ftCount,color:"#10b981"},{label:"PT",value:ptCount,color:"#ec4899"}]}/><div>{[["Full Time",ftCount,"#10b981"],["Part Time",ptCount,"#ec4899"]].map(([l,v,c])=><div key={l} style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}><div style={{width:10,height:10,borderRadius:2,background:c}}/><span style={{fontSize:11}}>{l}: <b>{v}</b></span></div>)}</div></div></div>
            <div style={S.card}><div style={{fontWeight:700,marginBottom:8,fontSize:12}}>📊 Hours</div><BarChart data={hoursBreakdown}/></div>
            <div style={S.card}><div style={{fontWeight:700,marginBottom:8,fontSize:12}}>🌍 Nationality</div><BarChart data={natData} height={100}/></div>
            <div style={S.card}><div style={{fontWeight:700,marginBottom:8,fontSize:12}}>🪪 Pass Type</div><BarChart data={passData} height={100}/></div>
          </div>
        </div>
      )}

      {/* EMPLOYEES */}
      {tab==="employees"&&(
        <div style={{padding:16,overflowX:"auto"}}>
          <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
            <input style={S.inp("180px")} placeholder="🔍 Search…" value={search} onChange={e=>setSearch(e.target.value)}/>
            <select style={S.inp("100px")} value={filterOutlet} onChange={e=>setFilterOutlet(e.target.value)}><option value="">All Outlets</option>{outlets.map(o=><option key={o}>{o}</option>)}</select>
            <select style={S.inp("110px")} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}><option value="">All Status</option><option value="active">Active</option><option value="resigned">Resigned</option></select>
            <label style={{display:"flex",alignItems:"center",gap:4,fontSize:11,cursor:"pointer",color:"#f59e0b"}}><input type="checkbox" checked={appraisalFilter} onChange={e=>setAppraisalFilter(e.target.checked)}/>Appraisal Due</label>
            <div style={{flex:1}}/>
            <button style={S.btn()} onClick={()=>{setForm(EMPTY_EMP);setEditId(null);setShowForm(!showForm);}}>+ Add</button>
            <button style={S.btn("#10b981")} onClick={exportEmployees}>⬇ Export CSV</button>
          </div>
          {showForm&&(
            <div style={{...S.card,marginBottom:14}}>
              <div style={{fontWeight:700,marginBottom:12,fontSize:13}}>{editId?"✏️ Edit":"➕ Add"} Employee</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:10}}>
                {[["Full Name","name","text"],["Join Date","joinDate","date"],["Last Day","lastDay","date"]].map(([l,k,t])=><div key={k}><label style={S.lbl}>{l}</label><input type={t} style={S.inp()} value={form[k]||""} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}/></div>)}
                {[["Outlet","outlet",outlets],["Designation","designation",DESIGNATIONS],["Nationality","nationality",NATIONALITIES],["Pass Type","passType",PASS_TYPES]].map(([l,k,opts])=><div key={k}><label style={S.lbl}>{l}</label><select style={S.inp()} value={form[k]||""} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}><option value="">Select…</option>{opts.map(o=><option key={o}>{o}</option>)}</select></div>)}
                <div><label style={S.lbl}>Work Type</label><select style={S.inp()} value={form.workType} onChange={e=>setForm(f=>({...f,workType:e.target.value}))}><option value="ft">Full Time</option><option value="pt">Part Time</option></select></div>
                {form.workType==="ft"?<div><label style={S.lbl}>FT Hours</label><select style={S.inp()} value={form.ftHours} onChange={e=>setForm(f=>({...f,ftHours:e.target.value}))}>{FT_HOURS.map(h=><option key={h}>{h}</option>)}</select></div>:<div><label style={S.lbl}>PT hrs/week</label><input type="number" style={S.inp()} value={form.ptHours||""} onChange={e=>setForm(f=>({...f,ptHours:e.target.value}))}/></div>}
              </div>
              <div style={{display:"flex",gap:8,marginTop:12}}>
                <button style={S.btn()} onClick={saveEmployee}>{editId?"Save":"Add"}</button>
                <button style={S.btn("#64748b")} onClick={()=>{setShowForm(false);setEditId(null);setForm(EMPTY_EMP);}}>Cancel</button>
              </div>
            </div>
          )}
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>
                {[["name","Name"],["outlet","Outlet"],["designation","Role"],["nationality","Nat."],["passType","Pass"],["hours","Hours"],["index","Idx"],["joinDate","Join Date"],["service","Service"],["training","Training"],["status","Status"],["actions",""]].map(([col,label])=>(
                  <th key={col} style={{...S.th,cursor:"pointer"}} onClick={()=>!["actions","status","hours","index","training"].includes(col)&&toggleSort(col)}>{label}{sortCol===col?(sortDir==="asc"?" ↑":" ↓"):""}</th>
                ))}
              </tr></thead>
              <tbody>
                {filtered.length===0&&<tr><td colSpan={12} style={{...S.td,textAlign:"center",color:"#64748b",padding:24}}>No employees found</td></tr>}
                {filtered.map(e=>{
                  const ap=appraisalStatus(e.joinDate,e.lastDay);
                  const pct=trainingPct(e);
                  return <tr key={e.id} style={{background:e.lastDay?"#1a1020":"#1e1e2e"}}>
                    <td style={S.td}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        {e.pfile&&e.pfile.photo?<img src={e.pfile.photo} style={{width:24,height:24,borderRadius:"50%",objectFit:"cover"}}/>:<div style={{width:24,height:24,borderRadius:"50%",background:"#2d2d4e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10}}>👤</div>}
                        <div><div style={{fontWeight:600}}>{e.name}</div>{ap&&<div style={{...S.badge(ap.color),marginTop:2}}>{ap.label}</div>}</div>
                      </div>
                    </td>
                    <td style={S.td}><span style={S.badge("#6366f1")}>{e.outlet}</span></td>
                    <td style={S.td}>{e.designation}</td>
                    <td style={S.td}>{e.nationality}</td>
                    <td style={S.td}>{e.passType}</td>
                    <td style={S.td}><span style={S.badge(hoursColor(e))}>{hoursLabel(e)}</span></td>
                    <td style={S.td}>{hoursIdx(e)}</td>
                    <td style={S.td}>{e.joinDate}</td>
                    <td style={S.td}>{calcService(e.joinDate,e.lastDay)}</td>
                    <td style={S.td}><div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:50,background:"#2d2d4e",borderRadius:3,height:6}}><div style={{width:pct+"%",background:"#10b981",height:"100%",borderRadius:3}}/></div><span style={{fontSize:10,color:"#94a3b8"}}>{pct}%</span></div></td>
                    <td style={S.td}>{e.lastDay?<span style={S.badge("#ef4444")}>Resigned</span>:<span style={S.badge("#10b981")}>Active</span>}</td>
                    <td style={S.td}><div style={{display:"flex",gap:3}}>
                      <button style={S.btn("#6366f1","3px 7px")} onClick={()=>openProfile(e)}>👤</button>
                      <button style={S.btn("#f59e0b","3px 7px")} onClick={()=>setTransferModal({emp:e,toOutlet:"",date:today(),reason:""})}>🔄</button>
                      <button style={S.btn("#8b5cf6","3px 7px")} onClick={()=>{setForm({...EMPTY_EMP,...e});setEditId(e.id);setShowForm(true);}}>✏</button>
                      <button style={S.btn("#ef4444","3px 7px")} onClick={()=>{if(window.confirm("Delete?"))setEmployees(p=>p.filter(x=>x.id!==e.id));}}>🗑</button>
                    </div></td>
                  </tr>;
                })}
              </tbody>
            </table>
            <div style={{color:"#64748b",fontSize:11,marginTop:8}}>Showing {filtered.length} of {employees.length}</div>
          </div>
        </div>
      )}

      {/* OUTLETS */}
      {tab==="outlets"&&(
        <div style={{padding:16}}>
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            <input style={S.inp("150px")} placeholder="New outlet code" value={newOutlet} onChange={e=>setNewOutlet(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&addOutlet()}/>
            <button style={S.btn()} onClick={addOutlet}>+ Add Outlet</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))",gap:10}}>
            {outlets.map(o=>{
              const staff=active.filter(e=>e.outlet===o);
              const res=employees.filter(e=>e.outlet===o&&e.lastDay);
              return <div key={o} style={{...S.card,borderTop:"3px solid #6366f1"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontWeight:800,fontSize:14,color:"#6366f1"}}>{o}</span>
                  <div style={{display:"flex",gap:4,alignItems:"center"}}><span style={{fontSize:10,color:"#94a3b8"}}>{staff.length} active</span>
                    <button style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer"}} onClick={()=>{if(employees.some(e=>e.outlet===o)){alert("Cannot remove outlet with staff.");return;}setOutlets(p=>p.filter(x=>x!==o));}}>✕</button>
                  </div>
                </div>
                {staff.length===0?<div style={{color:"#64748b",fontSize:11}}>No active staff</div>:(
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    {staff.map(e=>(
                      <div key={e.id} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",padding:"3px 4px",borderRadius:4}} onClick={()=>openProfile(e)}>
                        {e.pfile&&e.pfile.photo?<img src={e.pfile.photo} style={{width:20,height:20,borderRadius:"50%",objectFit:"cover"}}/>:<div style={{width:20,height:20,borderRadius:"50%",background:hoursColor(e)+"55",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9}}>👤</div>}
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:11,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.name}</div>
                          <div style={{fontSize:9,color:"#94a3b8"}}>{e.designation}</div>
                        </div>
                        <span style={{...S.badge(hoursColor(e)),fontSize:9}}>{hoursLabel(e)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {res.length>0&&<div style={{fontSize:10,color:"#64748b",marginTop:6}}>{res.length} resigned</div>}
              </div>;
            })}
          </div>
          <div style={{...S.card,marginTop:12}}><div style={{fontWeight:600,marginBottom:8,fontSize:12}}>🎨 Hours Color Legend</div><div style={{display:"flex",flexWrap:"wrap",gap:8}}>{Object.entries(HOURS_COLORS).map(([k,c])=><div key={k} style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:12,height:12,borderRadius:2,background:c}}/><span style={{fontSize:11}}>{k}</span></div>)}</div></div>
        </div>
      )}

      {/* TRAINING */}
      {tab==="training"&&(
        <div style={{padding:16,overflowX:"auto"}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>📚 Training Matrix</div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
              <thead><tr>
                <th style={{...S.th,position:"sticky",left:0,zIndex:2,minWidth:130}}>Name</th>
                <th style={{...S.th,position:"sticky",left:130,zIndex:2,minWidth:55}}>Outlet</th>
                <th style={{...S.th,minWidth:46}}>%</th>
                {TRAINING_MODULES.map(m=><th key={m} style={{...S.th,minWidth:60,writingMode:"vertical-lr",transform:"rotate(180deg)",height:88,fontSize:9,padding:"4px 2px"}}>{m}</th>)}
              </tr></thead>
              <tbody>{active.map(e=>{
                const tr=e.training||{};const pct=trainingPct(e);
                return <tr key={e.id}>
                  <td style={{...S.td,position:"sticky",left:0,background:"#1e1e2e",fontWeight:600,zIndex:1}}>{e.name}</td>
                  <td style={{...S.td,position:"sticky",left:130,background:"#1e1e2e",zIndex:1}}><span style={S.badge("#6366f1")}>{e.outlet}</span></td>
                  <td style={S.td}><span style={{color:pct===100?"#10b981":pct>50?"#f59e0b":"#ef4444",fontWeight:700}}>{pct}%</span></td>
                  {TRAINING_MODULES.map(m=>{const r=tr[m]&&tr[m].result;return <td key={m} style={{...S.td,textAlign:"center",background:r==="Pass"?"#10b98122":r==="Fail"?"#ef444422":"transparent"}}>{r==="Pass"?<span style={{color:"#10b981"}}>✓</span>:r==="Fail"?<span style={{color:"#ef4444"}}>✗</span>:<span style={{color:"#3d3d5e"}}>·</span>}</td>;})}
                </tr>;
              })}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* TRANSFERS */}
      {tab==="transfers"&&(
        <div style={{padding:16}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>🔄 Transfer Log</div>
          <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"flex-end"}}>
            <div><label style={S.lbl}>From Date</label><input type="date" style={S.inp("140px")} value={trDateFrom} onChange={e=>setTrDateFrom(e.target.value)}/></div>
            <div><label style={S.lbl}>To Date</label><input type="date" style={S.inp("140px")} value={trDateTo} onChange={e=>setTrDateTo(e.target.value)}/></div>
            <button style={S.btn("#10b981")} onClick={exportTransfers}>⬇ Export CSV</button>
            <span style={{color:"#64748b",fontSize:11}}>{filteredTransfers.length} record{filteredTransfers.length!==1?"s":""}</span>
          </div>
          {filteredTransfers.length===0?<div style={{...S.card,textAlign:"center",padding:24,color:"#64748b"}}>No transfers found</div>:(
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["Date","Employee","From","To","Reason"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>{filteredTransfers.map(t=><tr key={t.id} style={{background:"#1e1e2e"}}>
                <td style={S.td}>{t.date}</td>
                <td style={S.td}><b>{t.empName}</b></td>
                <td style={S.td}><span style={S.badge("#ef4444")}>{t.from}</span></td>
                <td style={S.td}><span style={S.badge("#10b981")}>{t.to}</span></td>
                <td style={S.td}>{t.reason||"—"}</td>
              </tr>)}</tbody>
            </table>
          )}
        </div>
      )}

      {/* APPRAISALS */}
      {tab==="appraisals"&&(
        <div style={{padding:16}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:8}}>⚠️ 3-Month Appraisal Tracker</div>
          {appraisalAlerts.length===0?<div style={{...S.card,textAlign:"center",padding:32,color:"#64748b"}}>✅ No appraisals due</div>:(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10}}>
              {appraisalAlerts.map(e=>{
                const ap=appraisalStatus(e.joinDate,e.lastDay);
                const daysIn=Math.floor((new Date()-new Date(e.joinDate))/86400000);
                const daysTo=90-daysIn;
                return <div key={e.id} style={{...S.card,borderLeft:"3px solid "+ap.color}}>
                  <div style={{display:"flex",justifyContent:"space-between"}}><div><div style={{fontWeight:700}}>{e.name}</div><div style={{fontSize:11,color:"#94a3b8"}}>{e.designation} · {e.outlet}</div></div><span style={S.badge(ap.color)}>{ap.label}</span></div>
                  <div style={{fontSize:11,color:"#94a3b8",marginTop:8}}>Joined: <b style={{color:"#e2e8f0"}}>{e.joinDate}</b> · {daysIn}d in</div>
                  <div style={{fontSize:11,color:ap.color,marginTop:3}}>{daysTo>0?"3M in "+daysTo+"d":Math.abs(daysTo)+"d past 3M"}</div>
                  <button style={{...S.btn(),marginTop:10,fontSize:11,padding:"4px 10px"}} onClick={()=>openProfile(e)}>👤 Open Profile</button>
                </div>;
              })}
            </div>
          )}
        </div>
      )}

      {/* USERS */}
      {tab==="users"&&isSA&&<UserTab users={users} setUsers={setUsers} outlets={outlets} setPwdModal={setPwdModal}/>}
    </div>
  );
}

function PwdModal({pwdModal,setPwdModal,users,setUsers}){
  const [pwd,setPwd]=useState("");
  const [conf,setConf]=useState("");
  const [err,setErr]=useState("");
  const checks=[["10+ characters",pwd.length>=10],["Uppercase letter",/[A-Z]/.test(pwd)],["Lowercase letter",/[a-z]/.test(pwd)],["Number",/[0-9]/.test(pwd)],["Special character",/[^A-Za-z0-9]/.test(pwd)]];
  function save(){
    if(!validatePwd(pwd)){setErr("Password does not meet all requirements.");return;}
    if(pwd!==conf){setErr("Passwords do not match.");return;}
    setUsers(p=>p.map(u=>u.id===pwdModal.userId?{...u,pwdHash:hashPwd(pwd)}:u));
    setPwdModal(null);
  }
  return(
    <div style={{position:"fixed",inset:0,background:"#000b",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{...S.card,width:360,padding:28}}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>🔑 Set Password</div>
        <div style={{fontSize:11,color:"#94a3b8",marginBottom:14}}>For: <b>{pwdModal.name}</b></div>
        <div style={{marginBottom:10}}><label style={S.lbl}>New Password</label><input type="password" style={S.inp()} value={pwd} onChange={e=>{setPwd(e.target.value);setErr("");}}/></div>
        {pwd&&<div style={{marginBottom:10,display:"flex",flexWrap:"wrap",gap:4}}>{checks.map(([l,ok])=><span key={l} style={{fontSize:10,color:ok?"#10b981":"#ef4444",background:ok?"#10b98122":"#ef444422",borderRadius:4,padding:"2px 6px"}}>{ok?"✓":"✗"} {l}</span>)}</div>}
        <div style={{marginBottom:12}}><label style={S.lbl}>Confirm Password</label><input type="password" style={S.inp()} value={conf} onChange={e=>{setConf(e.target.value);setErr("");}}/></div>
        {err&&<div style={{color:"#ef4444",fontSize:11,background:"#ef444422",padding:"6px 10px",borderRadius:6,marginBottom:10}}>{err}</div>}
        <div style={{display:"flex",gap:8}}><button style={S.btn()} onClick={save}>Set Password</button><button style={S.btn("#64748b")} onClick={()=>setPwdModal(null)}>Cancel</button></div>
      </div>
    </div>
  );
}

function UserTab({users,setUsers,outlets,setPwdModal}){
  const [form,setForm]=useState({username:"",name:"",role:"staff",outlet:""});
  const [err,setErr]=useState("");
  function addUser(){
    if(!form.username.trim()||!form.name.trim()){setErr("Username and name required.");return;}
    if(users.find(u=>u.username===form.username.trim())){setErr("Username already exists.");return;}
    setUsers(p=>[...p,{id:"u"+Date.now(),username:form.username.trim(),pwdHash:hashPwd("Change@Me1!"),name:form.name.trim(),role:form.role,outlet:form.outlet}]);
    setForm({username:"",name:"",role:"staff",outlet:""});setErr("");
  }
  function deleteUser(id){if(id==="u1"){alert("Cannot delete super admin.");return;}if(window.confirm("Delete user?"))setUsers(p=>p.filter(u=>u.id!==id));}
  return(
    <div style={{padding:16}}>
      <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>🔑 User Management</div>
      <div style={{...S.card,marginBottom:14}}>
        <div style={{fontWeight:600,marginBottom:10,fontSize:12}}>Add New User</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,marginBottom:10}}>
          <div><label style={S.lbl}>Username</label><input style={S.inp()} value={form.username} onChange={e=>setForm(f=>({...f,username:e.target.value}))}/></div>
          <div><label style={S.lbl}>Full Name</label><input style={S.inp()} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
          <div><label style={S.lbl}>Role</label><select style={S.inp()} value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))}>{Object.entries(ROLES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
          {(form.role==="supervisor"||form.role==="staff")&&<div><label style={S.lbl}>Outlet</label><select style={S.inp()} value={form.outlet} onChange={e=>setForm(f=>({...f,outlet:e.target.value}))}><option value="">Select…</option>{outlets.map(o=><option key={o}>{o}</option>)}</select></div>}
        </div>
        {err&&<div style={{color:"#ef4444",fontSize:11,marginBottom:8}}>{err}</div>}
        <div style={{fontSize:10,color:"#64748b",marginBottom:8}}>New users get default password: <code>Change@Me1!</code> — set a proper password immediately.</div>
        <button style={S.btn()} onClick={addUser}>+ Add User</button>
      </div>
      <table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead><tr>{["Username","Name","Role","Outlet","Actions"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
        <tbody>{users.map(u=>(
          <tr key={u.id} style={{background:"#1e1e2e"}}>
            <td style={S.td}><code style={{background:"#2d2d4e",padding:"2px 6px",borderRadius:4,fontSize:11}}>{u.username}</code></td>
            <td style={S.td}>{u.name}</td>
            <td style={S.td}><span style={S.badge(u.role==="superadmin"?"#ef4444":u.role==="hrmanager"?"#6366f1":u.role==="hradmin"?"#8b5cf6":u.role==="supervisor"?"#f59e0b":"#10b981")}>{ROLES[u.role]}</span></td>
            <td style={S.td}>{u.outlet||"—"}</td>
            <td style={S.td}><div style={{display:"flex",gap:4}}>
              <button style={S.btn("#f59e0b","3px 8px")} onClick={()=>setPwdModal({userId:u.id,name:u.name})}>🔑 Set Pwd</button>
              {u.id!=="u1"&&<button style={S.btn("#ef4444","3px 8px")} onClick={()=>deleteUser(u.id)}>🗑</button>}
            </div></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
