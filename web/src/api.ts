export async function api<T>(path:string,method="GET",body?:unknown,key?:string,signal?:AbortSignal):Promise<T>{
 const response=await fetch("/api/"+path,{method,headers:{"Content-Type":"application/json",...(key?{"X-Workspace-Key":key}:{})},body:body===undefined?undefined:JSON.stringify(body),signal});
 if(!response.ok){const json=await response.json().catch(()=>null);throw new Error(typeof json?.detail==="string"?json.detail:response.status===422?"Parametry nie spełniają kontraktu sceny (maks. 250 m² wybranych połaci).":"Błąd połączenia ("+response.status+").");}
 return response.status===204?undefined as T:response.json();
}
export function workspaceKey(){
 let key=localStorage.getItem("bipv.workspace.v1");
 if(!key||!/^[a-f0-9]{64}$/.test(key)){key=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,"0")).join("");localStorage.setItem("bipv.workspace.v1",key);}
 return key;
}
export function download(name:string,content:string,type="application/json"){
 const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
