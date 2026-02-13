// ================= CONSTANTS =================

const R = 6371000;
const GRID_STEP = 0.1; // degrees
const MASS = 0.4;
const Cd = 0.9;
const AREA = 0.05;
const BASE_THRUST = 6;
const DT = 1;

let grid = [];
let path = [];
let pigeon = null;

// ================= UTIL =================

const toRad = d=>d*Math.PI/180;
const toDeg = r=>r*180/Math.PI;

function haversine(a,b){
const φ1=toRad(a.lat), φ2=toRad(b.lat);
const dφ=φ2-φ1;
const dλ=toRad(b.lng-a.lng);
const h=Math.sin(dφ/2)**2+
Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2;
return 2*R*Math.asin(Math.sqrt(h));
}

function bearing(a,b){
const φ1=toRad(a.lat);
const φ2=toRad(b.lat);
const dλ=toRad(b.lng-a.lng);
const y=Math.sin(dλ)*Math.cos(φ2);
const x=Math.cos(φ1)*Math.sin(φ2)-
Math.sin(φ1)*Math.cos(φ2)*Math.cos(dλ);
return (toDeg(Math.atan2(y,x))+360)%360;
}

function move(lat,lng,brg,dist){
const δ=dist/R;
const θ=toRad(brg);
const φ1=toRad(lat);
const λ1=toRad(lng);

const φ2=Math.asin(
Math.sin(φ1)*Math.cos(δ)+
Math.cos(φ1)*Math.sin(δ)*Math.cos(θ)
);

const λ2=λ1+Math.atan2(
Math.sin(θ)*Math.sin(δ)*Math.cos(φ1),
Math.cos(δ)-Math.sin(φ1)*Math.sin(φ2)
);

return {lat:toDeg(φ2),lng:toDeg(λ2)};
}

// ================= LOCAL ELEVATION =================

// نموذج ارتفاع صناعي (بدون API)
function getElevation(lat,lng){

// بحر
if(lat<30) return 0;

// جبال صناعية
const mountain =
800*Math.abs(Math.sin(lat*3)+Math.cos(lng*2));

return mountain;
}

// ================= WIND FIELD =================

function windField(lat,lng){

return {
speed: 5 + 3*Math.sin(lat),
deg: 45 + 30*Math.cos(lng)
};

}

// ================= GRID =================

function generateGrid(start,end){

let minLat=Math.min(start.lat,end.lat);
let maxLat=Math.max(start.lat,end.lat);
let minLng=Math.min(start.lng,end.lng);
let maxLng=Math.max(start.lng,end.lng);

grid=[];

for(let lat=minLat;lat<=maxLat;lat+=GRID_STEP){
for(let lng=minLng;lng<=maxLng;lng+=GRID_STEP){

const elev=getElevation(lat,lng);

if(elev>0) // avoid sea
grid.push({lat,lng,elev});
}
}
}

// ================= A* =================

function heuristic(a,b){
return haversine(a,b);
}

function neighbors(node){

return grid.filter(p =>
Math.abs(p.lat-node.lat)<=GRID_STEP &&
Math.abs(p.lng-node.lng)<=GRID_STEP
);
}

function findPath(start,end){

let open=[start];
let came={};
let g={};
g[key(start)]=0;

while(open.length){

open.sort((a,b)=>
(g[key(a)]+heuristic(a,end))-
(g[key(b)]+heuristic(b,end))
);

let current=open.shift();

if(haversine(current,end)<1000){
let total=[current];
while(came[key(current)]){
current=came[key(current)];
total.push(current);
}
return total.reverse();
}

for(let n of neighbors(current)){

if(n.elev>1500) continue; // avoid mountains

let tentative=
g[key(current)] + haversine(current,n);

if(g[key(n)]===undefined ||
tentative<g[key(n)]){

came[key(n)]=current;
g[key(n)]=tentative;

if(!open.find(p=>key(p)==key(n)))
open.push(n);
}
}
}

return [start,end];
}

function key(p){
return p.lat.toFixed(2)+","+p.lng.toFixed(2);
}

// ================= FATIGUE =================

function fatigueFactor(energy){
return 0.5 + energy/200;
}

// ================= PIGEON =================

class Pigeon{

constructor(start,end){

this.pos={...start};
this.end=end;
this.vel=18;
this.energy=100;
}

update(){

if(haversine(this.pos,this.end)<50)
return false;

const brg=bearing(this.pos,this.end);

const elev=getElevation(this.pos.lat,this.pos.lng);

const wind=windField(this.pos.lat,this.pos.lng);

const airDensity=1.225*(1-elev/8000);

const drag=0.5*airDensity*Cd*AREA*(this.vel**2);

const accel=(BASE_THRUST-drag)/MASS;

this.vel+=accel*DT;

const windComp=
wind.speed*Math.cos(toRad(wind.deg-brg));

let groundSpeed=
(this.vel+windComp)*
fatigueFactor(this.energy);

if(groundSpeed<8) groundSpeed=8;

const step=groundSpeed*DT;

this.pos=move(
this.pos.lat,this.pos.lng,
brg,step
);

this.energy-=0.02;

postMessage({
type:"update",
pos:this.pos,
speed:groundSpeed,
energy:this.energy,
elev:elev
});

return true;
}
}

// ================= MAIN =================

onmessage=(e)=>{

if(e.data.type==="init"){

generateGrid(e.data.start,e.data.end);

path=findPath(e.data.start,e.data.end);

postMessage({
type:"path",
path:path
});

pigeon=new Pigeon(e.data.start,e.data.end);

simulate();
}
};

function simulate(){

if(!pigeon.update()) return;

setTimeout(simulate,50);
}
