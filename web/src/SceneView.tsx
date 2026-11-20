import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, Line, Html } from "@react-three/drei";
import * as THREE from "three";
import SunCalc from "suncalc";
import type { Layout, Obstacle, Placement, Scene, Surface, Vec3, Variant } from "./types";

const rp=(p:Vec3)=>new THREE.Vector3(p[0],p[2],-p[1]);
function uv(s:Surface,u:number,v:number,offset=0){return rp(s.origin).addScaledVector(rp(s.u),u).addScaledVector(rp(s.v),v).addScaledVector(rp(s.normal),offset);}
function quad(points:THREE.Vector3[]){const g=new THREE.BufferGeometry().setFromPoints(points);g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();return g;}
function RoofSurface({s,active,wire}:{s:Surface;active:boolean;wire:boolean}){
 const geometry=useMemo(()=>quad([[0,0],[s.width_m,0],[s.width_m,s.height_m],[0,s.height_m]].map(([u,v])=>uv(s,u,v))),[s]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <group><mesh geometry={geometry} receiveShadow castShadow><meshStandardMaterial color={active?"#343d3c":"#606a65"} roughness={0.85} side={THREE.DoubleSide}/></mesh>{wire&&<Line points={[[0,0],[s.width_m,0],[s.width_m,s.height_m],[0,s.height_m],[0,0]].map(([u,v])=>uv(s,u,v,0.015))} color="#b8dac2" lineWidth={1}/>}</group>;
}
function Cells({placements,surfaces,onSelect}:{placements:Placement[];surfaces:Surface[];onSelect:(p:Placement)=>void}){
 const mesh=useRef<THREE.InstancedMesh>(null),invalidate=useThree(s=>s.invalidate);
 const texture=useMemo(()=>{
  const canvas=document.createElement("canvas");canvas.width=256;canvas.height=128;const ctx=canvas.getContext("2d")!;
  ctx.fillStyle="#172b35";ctx.fillRect(0,0,256,128);
  const gradient=ctx.createLinearGradient(0,0,256,128);gradient.addColorStop(0,"#233f4c");gradient.addColorStop(1,"#13242e");ctx.fillStyle=gradient;ctx.fillRect(3,3,250,122);
  ctx.strokeStyle="#48616b";ctx.lineWidth=0.7;for(let x=4;x<256;x+=31)for(let y=4;y<128;y+=30)ctx.strokeRect(x,y,29,28);
  ctx.strokeStyle="#7a8b8d";ctx.lineWidth=1.5;ctx.strokeRect(1,1,254,126);
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;return t;
 },[]);
 useEffect(()=>()=>texture.dispose(),[texture]);
 useLayoutEffect(()=>{
  if(!mesh.current)return;
  const matrix=new THREE.Matrix4(),basis=new THREE.Matrix4(),q=new THREE.Quaternion();
  placements.forEach((p,i)=>{const s=surfaces.find(s=>s.id===p.surface_id)!;basis.makeBasis(rp(s.u),rp(s.v),rp(s.normal));q.setFromRotationMatrix(basis);matrix.compose(uv(s,p.u+p.width_m/2,p.v+p.height_m/2,0.045),q,new THREE.Vector3(p.width_m,p.height_m,0.045));mesh.current!.setMatrixAt(i,matrix);});
  mesh.current.instanceMatrix.needsUpdate=true;mesh.current.computeBoundingSphere();invalidate();
 },[placements,surfaces,invalidate]);
 return <instancedMesh ref={mesh} args={[undefined,undefined,placements.length]} key={placements.length} castShadow receiveShadow onClick={e=>{e.stopPropagation();if(e.instanceId!==undefined)onSelect(placements[e.instanceId]);}}><boxGeometry args={[1,1,1]}/><meshStandardMaterial map={texture} color="#d2e3e7" metalness={0.3} roughness={0.37}/></instancedMesh>;
}
function ObstacleMesh({o,s,selected,onSelect}:{o:Obstacle;s:Surface;selected:boolean;onSelect:()=>void}){
 const g=useMemo(()=>{
  const lower=[[o.u,o.v],[o.u+o.width_m,o.v],[o.u+o.width_m,o.v+o.depth_m],[o.u,o.v+o.depth_m]].map(([u,v])=>uv(s,u,v,0.02));
  const top=lower.map(p=>o.kind==="chimney"?p.clone().add(new THREE.Vector3(0,o.height_m,0)):p.clone().addScaledVector(rp(s.normal),o.height_m));
  const geometry=new THREE.BufferGeometry().setFromPoints([...lower,...top]);geometry.setIndex([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]);geometry.computeVertexNormals();return geometry;
 },[o,s]);useEffect(()=>()=>g.dispose(),[g]);
 return <mesh geometry={g} castShadow receiveShadow onClick={e=>{e.stopPropagation();onSelect();}}><meshStandardMaterial color={selected?"#c3e98b":o.kind==="chimney"?"#bfa58a":"#759baa"} metalness={o.kind==="skylight"?0.65:0.05} roughness={o.kind==="skylight"?0.18:0.85}/></mesh>;
}
function House({scene}:{scene:Scene}){
 const r=scene.roof,peak=r.eaves_m+Math.tan(r.pitch_deg*Math.PI/180)*r.depth_m/2;
 const g=useMemo(()=>{const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute([-r.width_m/2,r.eaves_m,-r.depth_m/2,-r.width_m/2,peak,0,-r.width_m/2,r.eaves_m,r.depth_m/2,r.width_m/2,r.eaves_m,r.depth_m/2,r.width_m/2,peak,0,r.width_m/2,r.eaves_m,-r.depth_m/2],3));geometry.computeVertexNormals();return geometry;},[r.width_m,r.depth_m,r.eaves_m,peak]);useEffect(()=>()=>g.dispose(),[g]);
 return <group rotation={[0,-(r.azimuth_deg-180)*Math.PI/180,0]}><mesh position={[0,r.eaves_m/2,0]} castShadow receiveShadow><boxGeometry args={[r.width_m,r.eaves_m,r.depth_m]}/><meshStandardMaterial color="#e8e3d8" roughness={0.92}/></mesh><mesh geometry={g} castShadow><meshStandardMaterial color="#e8e3d8" side={THREE.DoubleSide}/></mesh><mesh position={[0,0.09,0]} receiveShadow><boxGeometry args={[r.width_m+0.4,0.18,r.depth_m+0.4]}/><meshStandardMaterial color="#c5c8bd"/></mesh>{[-1,1].map(sign=><group key={sign} position={[0,1.55,sign*(r.depth_m/2+0.012)]}>{[-0.3,0.15,0.34].map((f,i)=><mesh key={i} position={[f*r.width_m,0,0]}><boxGeometry args={[i===1?1.4:1.1,i===1?2.3:1.35,0.04]}/><meshStandardMaterial color="#698486" roughness={0.25} metalness={0.3}/></mesh>)}</group>)}</group>;
}
function CameraRig({view}:{view:string}){
 const {camera,invalidate}=useThree(),controls=useRef<any>(null);
 useEffect(()=>{const p:[number,number,number]=view==="top"?[0,36,0.01]:view==="front"?[0,8,26]:[20,17,22];camera.position.set(...p);camera.lookAt(0,3,0);controls.current?.target.set(0,3,0);controls.current?.update();invalidate();},[camera,view,invalidate]);
 return <OrbitControls ref={controls} makeDefault target={[0,3,0]} minDistance={7} maxDistance={65} maxPolarAngle={Math.PI/2-0.015} enableDamping dampingFactor={0.1}/>;
}
export type ViewProps={scene:Scene;result:Layout;variant?:Variant;sunHour:number;sunDate:string;showGrid:boolean;view:string;selected:string|null;onSelect:(id:string)=>void;onPanel:(p:Placement)=>void;sunMode:boolean};
function World(p:ViewProps){
 const {scene,result,variant,sunHour,sunDate,showGrid,view,selected,onSelect,onPanel,sunMode}=p;
 const solar=useMemo(()=>SunCalc.getPosition(new Date(sunDate+"T"+String(Math.floor(sunHour)).padStart(2,"0")+":"+(sunHour%1?"30":"00")+":00+01:00"),53.4285,14.5528),[sunDate,sunHour]);
 const alt=solar.altitude;const sun:Vec3=[-Math.sin(solar.azimuth)*Math.cos(alt)*35,Math.sin(alt)*35,Math.cos(solar.azimuth)*Math.cos(alt)*35];
 return <><color attach="background" args={["#e9ede6"]}/><fog attach="fog" args={["#e9ede6",65,130]}/><ambientLight intensity={sunMode?0.7:1.2}/><hemisphereLight args={["#dceafa","#bfc5af",1.5]}/><directionalLight position={sunMode?sun:[-12,23,17]} intensity={sunMode?(alt>0?2.4:0):2.8} castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-22} shadow-camera-right={22} shadow-camera-top={22} shadow-camera-bottom={-22} shadow-camera-near={1} shadow-camera-far={100} shadow-bias={-0.0002} shadow-normalBias={0.03}/><mesh rotation={[-Math.PI/2,0,0]} position={[0,-0.02,0]} receiveShadow><planeGeometry args={[200,200]}/><meshStandardMaterial color="#e3e8de" roughness={1}/></mesh>{showGrid&&<Grid position={[0,0,0]} args={[80,80]} cellSize={1} sectionSize={5} cellThickness={0.4} sectionThickness={0.6} cellColor="#bcc7b9" sectionColor="#a7b5a4" fadeDistance={45} infiniteGrid/>}<House scene={scene}/>{result.surfaces.map(s=><RoofSurface key={s.id} s={s} active={scene.surfaces.includes(s.id)} wire={showGrid}/>)}{variant&&<Cells placements={variant.placements} surfaces={result.surfaces} onSelect={onPanel}/>} {scene.obstacles.map(o=><ObstacleMesh key={o.id} o={o} s={result.surfaces.find(s=>s.id===o.surface_id)!} selected={selected===o.id} onSelect={()=>onSelect(o.id)}/>)}{showGrid&&result.surfaces.filter(s=>scene.surfaces.includes(s.id)).map(s=><Html key={s.id} position={uv(s,s.width_m/2,-0.55,0.02)} center distanceFactor={24}><div className="measure-tag">{s.width_m.toFixed(1)} m</div></Html>)}<CameraRig view={view}/></>;
}
export default function SceneView(props:ViewProps){return <Canvas frameloop="demand" shadows dpr={[1,1.6]} camera={{position:[20,17,22],fov:38,near:0.1,far:200}} gl={{antialias:true,powerPreference:"low-power"}} onCreated={({gl})=>{gl.toneMapping=THREE.ACESFilmicToneMapping;gl.toneMappingExposure=1.1;}}><Suspense fallback={null}><World {...props}/></Suspense></Canvas>;}
