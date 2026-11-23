// 生成物：node scripts/sync-petcat.mjs 从原站打包页还原并适配。不要手改，改脚本再跑。
import { buildNapFactor, computeView, pointerToStage } from './petcat-core.js';

/**
 * 把整只猫装进一个 Shadow DOM 里跑。
 * env.doc / env.page 是门面：所有 DOM 查询落在 Shadow DOM，事件监听记在 page 上，卸载时统一摘掉。
 * 参数叫 env 而不是 ctx，因为原页面正文里已经有一个 ctx（canvas 2d context）。
 */
export function bootPetcat(env) {
'use strict';
const { directory, doc, page } = env;
let alive = true;
const {CoatSurface}=(()=>{
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const napFactor=buildNapFactor();
const surfaceTile=12;
function alphaCoverage(pixels,width,height){
const cols=Math.ceil(width/surfaceTile),rows=Math.ceil(height/surfaceTile),stride=cols+1;
const visible=new Uint32Array(stride*(rows+1)),translucent=new Uint32Array(visible.length);
for(let row=0;row<rows;row++){
let visibleCount=0,translucentCount=0;
for(let col=0;col<cols;col++){
const left=col*surfaceTile,right=Math.min(left+surfaceTile,width);
const top=row*surfaceTile,bottom=Math.min(top+surfaceTile,height);
let min=255,max=0;
for(let y=top;y<bottom && (min===255 || max<=1);y++){
for(let n=4*(y*width+left)+3,end=4*(y*width+right);n<end;n+=4){
min=Math.min(min,pixels[n]);max=Math.max(max,pixels[n]);
}
}
const i=(row+1)*stride+col+1;
if(max>1)visibleCount++;
if(min<255)translucentCount++;
visible[i]=visible[i-stride]+visibleCount;
translucent[i]=translucent[i-stride]+translucentCount;
}
}
return {visible,translucent,stride,cols,rows};
}
function coverageAt(map,left,top,right,bottom){
const {visible,translucent,stride,cols,rows}=map;
const x=clamp(Math.floor((left-2)/surfaceTile),0,cols),X=clamp(Math.ceil((right+2)/surfaceTile),0,cols);
const y=clamp(Math.floor((top-2)/surfaceTile),0,rows)*stride,Y=clamp(Math.ceil((bottom+2)/surfaceTile),0,rows)*stride;
if(visible[Y+X]-visible[y+X]-visible[Y+x]+visible[y+x]===0)return 0;
return translucent[Y+X]-translucent[y+X]-translucent[Y+x]+translucent[y+x]===0?255:1;
}
function sampleChannel(src,top,bottom,fx,fy){
const a=src[top]+(src[top+4]-src[top])*fx;
const b=src[bottom]+(src[bottom+4]-src[bottom])*fx;
return a+(b-a)*fy;
}
function surfaceGrid(cols,rows) {
const uv=new Float32Array((cols+1)*(rows+1)*2),idx=new Uint16Array(cols*rows*6);
let k=0;
for(let y=0;y<=rows;y++) for(let x=0;x<=cols;x++){
const n=y*(cols+1)+x;uv[n*2]=x/cols;uv[n*2+1]=y/rows;
if(y<rows && x<cols){
idx.set([n,n+1,n+cols+1,n+1,n+cols+2,n+cols+1],k);k+=6;
}
}
return {uv,idx};
}
function lockTexture(data,luma,strand,w,h){
const map=new Uint8Array(w*h*4),weight=new Uint16Array(w*h),underfur=new Uint8Array(w*h);
for(let i=0;i<w*h;i++){
map[i*4]=strand[i];map[i*4+1]=map[i*4+2]=map[i*4+3]=128;
}
let seed=873713;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const scale=w/970,step=12*scale;
for(let row=step;row<h-step;row+=step*.63){
for(let col=step;col<w-step;col+=step){
const x=Math.round(col+(random()-.5)*step),y=Math.round(row+(random()-.5)*step*.7);
if(data[4*(y*w+x)+3]<160)continue;
const side=clamp((y/h-.48)*3.5,-1,1);
const angle=Math.atan2(side,.83),gx=Math.cos(angle),gy=Math.sin(angle);
let xx=0,xy=0,yy=0;
for(let j=-6;j<=6;j+=3)for(let i=-6;i<=6;i+=3){
const n=(y+j)*w+x+i;
if(data[4*n+3]<240)continue;
const dx=luma[n+1]-luma[n-1],dy=luma[n+w]-luma[n-w];
xx+=dx*dx;xy+=dx*dy;yy+=dy*dy;
}
const grain=.5*Math.atan2(2*xy,xx-yy)+Math.PI/2;
const coherence=Math.min(.85,Math.hypot(xx-yy,2*xy)/(xx+yy+75));
let tx=Math.cos(grain),ty=Math.sin(grain);
if(tx*gx+ty*gy<0){tx=-tx;ty=-ty;}
tx=gx*(1-coherence)+tx*coherence;ty=gy*(1-coherence)+ty*coherence;
const norm=Math.hypot(tx,ty);tx/=norm;ty/=norm;
const deep=random()<.17;
const length=(12+15*random()+(deep?15:0))*scale,width=(2.1+4.2*random()+(deep?3:0))*scale;
const lean=(random()-.5)*1.4,travel=.52+.44*random();
const endX=x+length*tx,endY=y+length*ty,pad=Math.ceil(2*width+1);
const top=Math.max(0,Math.floor(Math.min(y,endY))-pad),bottom=Math.min(h-1,Math.ceil(Math.max(y,endY))+pad);
const left=Math.max(0,Math.floor(Math.min(x,endX))-pad),right=Math.min(w-1,Math.ceil(Math.max(x,endX))+pad);
for(let py=top;py<=bottom;py++)for(let px=left;px<=right;px++){
const dx=px-x,dy=py-y,t=(dx*tx+dy*ty)/length;
if(t<=0||t>=1)continue;
const bow=t*(1-t)*4;
const cross=(-dx*ty+dy*tx)/width-lean*bow;
const envelope=clamp(1-Math.abs(cross)/(.45+.69*bow),0,1);
const lift=t*(2-t)*Math.min(1,(1-t)*5)*envelope*envelope*(3-2*envelope);
const n=py*w+px,coverage=Math.round(255*lift*lift);
if(deep && envelope>0){
const fold=t-.46-.15*cross*cross,along=Math.max(0,1-fold*fold/.082);
const edge=cross+(lean<0?-.26:.26),across=Math.max(0,1-edge*edge/.63);
const shade=along*along*across*across;
if(shade)underfur[n]=Math.max(underfur[n],Math.round(109*shade*envelope));
}
if(!coverage)continue;
weight[n]+=coverage;
const mix=coverage/weight[n],k=4*n;
const forward=lift*travel,splay=forward*(lean*1.36+cross*.25);
const ux=128+124*clamp(forward*tx-splay*ty,-1,1),uy=128+124*clamp(forward*ty+splay*tx,-1,1);
map[k+1]=Math.round(map[k+1]+(ux-map[k+1])*mix);
map[k+2]=Math.round(map[k+2]+(uy-map[k+2])*mix);
const ridge=128+90*lift*(.22-1.42*cross);
map[k+3]=Math.round(map[k+3]+(ridge-map[k+3])*mix);
}
}
}
for(let n=0;n<underfur.length;n++)if(underfur[n])map[4*n+3]=Math.max(0,map[4*n+3]-underfur[n]);
return map;
}
function shortCoatTexture(data,luma,strand,w,h){
const map=new Uint8Array(4*w*h);
const radius=Math.max(1,Math.round(w*.003)),border=2*radius+2;
for(let y=0;y<h;y++){
const side=clamp((y/h-.48)*3.5,-1,1),length=Math.hypot(.83,side);
const tx=.83/length,ty=side/length;
const along=Math.round(radius*tx)+w*Math.round(radius*ty);
const cross=Math.round(-radius*ty)+w*Math.round(radius*tx);
for(let x=0;x<w;x++){
const i=y*w+x,k=4*i;
map[k]=strand[i];map[k+1]=map[k+2]=map[k+3]=128;
if(x<border || x>=w-border || y<border || y>=h-border || data[k+3]<240)continue;
if(data[(i+along)*4+3]<240 || data[(i-along)*4+3]<240 ||
data[(i+cross)*4+3]<240 || data[(i-cross)*4+3]<240)continue;
const core=(2*luma[i]+luma[i-along]+luma[i+along])*.25;
const left=(2*luma[i-cross]+luma[i-cross-along]+luma[i-cross+along])*.25;
const right=(2*luma[i+cross]+luma[i+cross-along]+luma[i+cross+along])*.25;
const range=8+.06*core;
const crest=clamp((core-.5*(left+right))/range,-1,1);
const slope=clamp((left-right)/(2*range),-1,1);
const travel=21+11*crest,splay=8*slope;
map[k+1]=Math.round(128+travel*tx-splay*ty);
map[k+2]=Math.round(128+travel*ty+splay*tx);
const shade=38*crest+12*slope-14;
map[k+3]=Math.round(128+shade*(1-.75*clamp((core-110)/95,0,1)));
}
}
return map;
}
function program(gl){
const shaders=[
[gl.VERTEX_SHADER,`attribute vec2 texel;attribute vec2 position;attribute vec2 lighting;attribute float lift;
varying vec2 uv;varying vec2 light;varying float raised;uniform vec4 rectangle;
void main(){uv=texel;light=lighting;raised=lift;gl_Position=vec4((rectangle.xy+position*rectangle.zw)*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);}`],
[gl.FRAGMENT_SHADER,`precision mediump float;varying vec2 uv;varying vec2 light;varying float raised;
uniform sampler2D photo; uniform sampler2D fibres;
void main(){vec4 fur=texture2D(fibres,uv);
vec2 offset=(fur.gb-vec2(128./255.))*vec2(.030,.04868)*raised;
vec4 p=texture2D(photo,uv+offset);float nap=fur.r*2.-1.;
float ridge=(fur.a-128./255.)*.40*raised;
vec3 c=p.rgb*(1.+.92*light.x+ridge)+p.a*vec3(1.,.96,.90)*(.073*light.x-.027*light.y+abs(light.y)*(.012+.032*nap)+.015*max(-light.y,0.)*max(nap,0.));
gl_FragColor=vec4(clamp(c,vec3(0.),vec3(p.a)),p.a);}`]
];
const p=gl.createProgram();
for(const [type,source] of shaders){
const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
gl.attachShader(p,shader);gl.deleteShader(shader);
}
gl.linkProgram(p);
if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
return p;
}
class CoatSurface {
constructor(canvas,cols,rows){
this.canvas=canvas;this.cols=cols;this.rows=rows;this.inverseIterations=3;
Object.assign(this,surfaceGrid(cols,rows));
this.gl=canvas.getContext('webgl',{alpha:true,depth:false,stencil:false,antialias:false,premultipliedAlpha:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
if(this.gl){
this.initGL();
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;});
canvas.addEventListener('webglcontextrestored',()=>{this.lost=false;this.initGL();if(this.img)this.upload();});
}else{
this.ctx=canvas.getContext('2d');
this.output=doc.createElement('canvas');
this.outCtx=this.output.getContext('2d');
}
}
initGL(){
const gl=this.gl,p=program(gl);gl.useProgram(p);
const attr=(name,data,mode,size=2)=>{
const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,data,mode);
const loc=gl.getAttribLocation(p,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0);return buf;
};
attr('texel',this.uv,gl.STATIC_DRAW);
this.xyBuffer=attr('position',this.uv,gl.DYNAMIC_DRAW);this.lightBuffer=attr('lighting',this.uv,gl.DYNAMIC_DRAW);
this.liftBuffer=attr('lift',new Float32Array(this.uv.length/2),gl.DYNAMIC_DRAW,1);
this.liftLoc=gl.getAttribLocation(p,'lift');
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,this.idx,gl.STATIC_DRAW);
this.rectLoc=gl.getUniformLocation(p,'rectangle');
for(const [i,name] of ['photo','fibres'].entries()){
gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());
gl.uniform1i(gl.getUniformLocation(p,name),i);
for(const k of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,k,gl.LINEAR);
for(const k of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,k,gl.CLAMP_TO_EDGE);
}
gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.clearColor(0,0,0,0);
}
setImage(img,rasterWidth,longCoat,shortCoat=false){
this.img=img;this.stillFrame=null;
const imgW=img.naturalWidth || img.width,imgH=img.naturalHeight || img.height;
const w=this.sw=Math.min(imgW,this.gl?970:rasterWidth),h=this.sh=Math.round(w*imgH/imgW);
const canvas=doc.createElement('canvas');canvas.width=w;canvas.height=h;
const cx=canvas.getContext('2d',{willReadFrequently:true});cx.drawImage(img,0,0,w,h);
const data=this.src=cx.getImageData(0,0,w,h).data;
const strand=this.strand=new Uint8Array(w*h),luma=new Uint8Array(w*h);
for(let i=0;i<luma.length;i++){
const byte=i*4;
luma[i]=(2*data[byte]+5*data[byte+1]+data[byte+2])*.125;
}
for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
const i=y*w+x,a=luma[i-w-1],b=luma[i+w+1],c=luma[i];
strand[i]=128+127*clamp((2.1*(c-.5*(a+b))+.65*(b-a))/(13+.095*c),-1,1);
}
if(shortCoat)this.locks=shortCoatTexture(data,luma,strand,w,h);
else this.locks=longCoat?lockTexture(data,luma,strand,w,h):null;
if(this.gl){if(!this.lost)this.upload();}
else{
this.coverage=alphaCoverage(data,w,h);
this.frame=null;
}
}
resizeOutput(displayWidth){
const width=Math.max(1,Math.min(this.sw,Math.ceil(displayWidth)));
const height=Math.max(1,Math.round(width*this.sh/this.sw));
if(this.frame && this.frame.width===width && this.frame.height===height)return;
this.output.width=width;
this.output.height=height;
this.frame=this.outCtx.createImageData(width,height);
this.packed=new Uint32Array(this.frame.data.buffer);
this.outputStep=Math.max(4,Math.round(surfaceTile*width/this.sw));
this.cs=Math.ceil(width/this.outputStep)+1;
this.rs=Math.ceil(height/this.outputStep)+1;
this.field=new Float32Array(this.cs*this.rs*5);
}
upload(){
const gl=this.gl;
gl.activeTexture(gl.TEXTURE0);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.img);
gl.activeTexture(gl.TEXTURE1);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
const format=this.locks?gl.RGBA:gl.LUMINANCE;
gl.texImage2D(gl.TEXTURE_2D,0,format,this.sw,this.sh,0,format,gl.UNSIGNED_BYTE,this.locks||this.strand);
if(this.locks)gl.enableVertexAttribArray(this.liftLoc);
else{gl.disableVertexAttribArray(this.liftLoc);gl.vertexAttrib1f(this.liftLoc,0);}
}
bodyMatches(view,xy,light,lift,hasRaised){
const frame=this.stillFrame??={xy:new Float32Array(xy.length),light:new Float32Array(light.length),lift:new Float32Array(lift.length)};
if(frame.view===view && frame.hasRaised===hasRaised){
const dx=.30/(view.w*view.dpr),dy=.30/(view.h*view.dpr);
let i=0;
for(;i<lift.length;i++){
const j=2*i;
if(Math.abs(xy[j]-frame.xy[j])>dx || Math.abs(xy[j+1]-frame.xy[j+1])>dy ||
Math.abs(light[j]-frame.light[j])>.0015 || Math.abs(light[j+1]-frame.light[j+1])>.003 ||
(hasRaised && Math.abs(lift[i]-frame.lift[i])>.0015))break;
}
if(i===lift.length)return true;
}
frame.view=view;frame.hasRaised=hasRaised;frame.xy.set(xy);frame.light.set(light);frame.lift.set(lift);
return false;
}
draw(view,xy,light,lift,hasRaised=true,tailOnly=false){
if(!this.img || this.lost || !view.width || !view.height)return;
const {width,height,x=0,y=0,w=width,h=height}=view,dpr=view.dpr || 1,canvas=this.canvas;
const tw=Math.max(1,Math.round(width*dpr)),th=Math.max(1,Math.round(height*dpr));
if(canvas.width!==tw || canvas.height!==th){canvas.width=tw;canvas.height=th;}
const gl=this.gl;
if(gl){
gl.viewport(0,0,tw,th);gl.clear(gl.COLOR_BUFFER_BIT);
gl.bindBuffer(gl.ARRAY_BUFFER,this.xyBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,xy);
gl.bindBuffer(gl.ARRAY_BUFFER,this.lightBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,light);
if(this.locks){gl.bindBuffer(gl.ARRAY_BUFFER,this.liftBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,lift);}
gl.uniform4f(this.rectLoc,x/width,y/height,w/width,h/height);
gl.drawElements(gl.TRIANGLES,this.idx.length,gl.UNSIGNED_SHORT,0);
}else{
if(tailOnly){
if(this.bodyMatches(view,xy,light,lift,hasRaised))return;
}else if(this.stillFrame)this.stillFrame.view=null;
this.resizeOutput(w*dpr);
this.warp(xy,light,hasRaised?lift:null);
this.ctx.setTransform(1,0,0,1,0,0);this.ctx.clearRect(0,0,tw,th);
this.ctx.setTransform(dpr,0,0,dpr,0,0);this.ctx.drawImage(this.output,x,y,w,h);
}
}
sample(data,u,v,k,stride=2){
const gx=clamp(u*this.cols,0,this.cols-.00001),gy=clamp(v*this.rows,0,this.rows-.00001);
const x=gx|0,y=gy|0,fx=gx-x,fy=gy-y,a=stride*(y*(this.cols+1)+x)+k,b=a+stride*(this.cols+1);
const t=data[a]+(data[a+stride]-data[a])*fx,bot=data[b]+(data[b+stride]-data[b])*fx;
return t+(bot-t)*fy;
}
warp(xy,light,lift){
const w=this.sw,h=this.sh,step=this.outputStep,cs=this.cs,rs=this.rs,f=this.field;
const width=this.frame.width,height=this.frame.height,locks=lift && this.locks;
for(let row=0;row<rs;row++)for(let col=0;col<cs;col++){
const index=(row*cs+col)*5,U=(col*step+.5)/width,V=(row*step+.5)/height;
let u=U,v=V;
for(let n=0;n<this.inverseIterations;n++){
const px=this.sample(xy,u,v,0),py=this.sample(xy,u,v,1);
u+=U-px;v+=V-py;
if(Math.abs(U-px)+Math.abs(V-py)<.0001)break;
}
f[index]=u*w-.5;f[index+1]=v*h-.5;f[index+2]=this.sample(light,u,v,0);f[index+3]=this.sample(light,u,v,1);f[index+4]=locks?this.sample(lift,u,v,0,1):0;
}
const data=this.frame.data,src=this.src,strand=this.strand;this.packed.fill(0);
for(let j=0;j<rs-1;j++)for(let i=0;i<cs-1;i++){
const a=5*(j*cs+i),b=a+5,c=a+5*cs,d=c+5;
const peakLift=locks?Math.max(f[a+4],f[b+4],f[c+4],f[d+4]):0;
const margin=peakLift*w*.016;
const minX=Math.min(f[a],f[b],f[c],f[d])-margin,minY=Math.min(f[a+1],f[b+1],f[c+1],f[d+1])-margin;
const maxX=Math.max(f[a],f[b],f[c],f[d])+margin,maxY=Math.max(f[a+1],f[b+1],f[c+1],f[d+1])+margin;
const coverage=coverageAt(this.coverage,minX,minY,maxX,maxY);
if(!coverage)continue;
const interior=coverage===255 && minX>0 && minY>0 && maxX<w-1 && maxY<h-1;
const shifted=peakLift>.001;
const hasNap=f[a+3] || f[b+3] || f[c+3] || f[d+3];
const left=i*step,endX=Math.min(left+step,width),top=j*step,endY=Math.min(top+step,height);
for(let y=top;y<endY;y++){
const q=(y-top)/step;
let sx=f[a]+(f[c]-f[a])*q,sy=f[a+1]+(f[c+1]-f[a+1])*q,lit=f[a+2]+(f[c+2]-f[a+2])*q,nap=f[a+3]+(f[c+3]-f[a+3])*q;
const dx=(f[b]+(f[d]-f[b])*q-sx)/step,dy=(f[b+1]+(f[d+1]-f[b+1])*q-sy)/step;
const dl=(f[b+2]+(f[d+2]-f[b+2])*q-lit)/step,dn=(f[b+3]+(f[d+3]-f[b+3])*q-nap)/step;
let raised=f[a+4]+(f[c+4]-f[a+4])*q;
const dr=(f[b+4]+(f[d+4]-f[b+4])*q-raised)/step;
let dest=4*(y*width+left);
for(let x=left;x<endX;x++,dest+=4,sx+=dx,sy+=dy,lit+=dl,nap+=dn,raised+=dr){
if(!interior && (sx<0 || sy<0 || sx>=w-1 || sy>=h-1))continue;
let u=sx,v=sy,ridge=0;
const p=(sy|0)*w+(sx|0);
if(shifted && raised>.001){
const n=4*p,m=n+w*4,fx=sx-(sx|0),fy=sy-(sy|0),gain=raised*w*.030/255;
const a=(1-fx)*(1-fy),b=fx*(1-fy),c=(1-fx)*fy,d=fx*fy;
u+=(locks[n+1]*a+locks[n+5]*b+locks[m+1]*c+locks[m+5]*d-128)*gain;
v+=(locks[n+2]*a+locks[n+6]*b+locks[m+2]*c+locks[m+6]*d-128)*gain;
ridge=(locks[n+3]*a+locks[n+7]*b+locks[m+3]*c+locks[m+7]*d-128)*(.40/255)*raised;
if(!interior && (u<0 || v<0 || u>=w-1 || v>=h-1))continue;
}
const X=u|0,Y=v|0,n=4*(Y*w+X),m=n+4*w,fx=u-X,fy=v-Y;
if(!interior && !(src[n+3]|src[n+7]|src[m+3]|src[m+7]))continue;
const gain=1+.92*lit+ridge,add=18.62*lit+(hasNap?nap*napFactor[strand[p]+(nap<0?256:0)]:0);
data[dest]=sampleChannel(src,n,m,fx,fy)*gain+add;
data[dest+1]=sampleChannel(src,n+1,m+1,fx,fy)*gain+add;
data[dest+2]=sampleChannel(src,n+2,m+2,fx,fy)*gain+add;
data[dest+3]=interior?255:sampleChannel(src,n+3,m+3,fx,fy);
}
}
}
this.outCtx.putImageData(this.frame,0,0);
}
}
return {CoatSurface};})();
const {CoatOutline}=(()=>{
const aspect=935/1517;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
class CoatOutline{
constructor(surface){
const w=280,h=Math.round(w*surface.sh/surface.sw),cn=doc.createElement('canvas');
cn.width=w;cn.height=h;const g=cn.getContext('2d',{willReadFrequently:true});
const alpha=radius=>{
g.clearRect(0,0,w,h);g.filter='blur('+radius+'px)';g.drawImage(surface.img,0,0,w,h);
return g.getImageData(0,0,w,h).data;
};
const edge=alpha(1),wide=alpha(3.1),A=(data,x,y)=>data[(y*w+x)*4+3];
this.maskWidth=w;this.maskHeight=h;
this.padMask=new Uint8Array(w*h);
for(let i=0;i<this.padMask.length;i++)this.padMask[i]=wide[i*4+3];
this.neckColumns=[];
for(let x=Math.ceil(.13*w);x<.42*w;x++){
let top=0,bottom=h-1;
while(top<bottom && A(edge,x,top)<128)top++;
while(bottom>top && A(edge,x,bottom)<128)bottom--;
if(bottom>top)this.neckColumns.push({u:(x+.5)/w,top:(top+.5)/h,bottom:(bottom+.5)/h});
}
this.lines=[];
const point=(x,y)=>{
const i=clamp(Math.round(x),2,w-3),j=clamp(Math.round(y),2,h-3);
const nx=A(wide,i+2,j)-A(wide,i-2,j),ny=A(wide,i,j+2)-A(wide,i,j-2),L=Math.hypot(nx,ny)||1;
return {x:(x+.5)/w,y:(y+.5)/h*aspect,nx:nx/L,ny:ny/L};
};
for(let y=1;y<h-2;y++)for(let x=1;x<w-2;x++){
const a=A(edge,x,y),b=A(edge,x+1,y),c=A(edge,x+1,y+1),d=A(edge,x,y+1);
if(Math.min(a,b,c,d)>=128 || Math.max(a,b,c,d)<128)continue;
const hits=[];
if((a>=128)!==(b>=128))hits.push(point(x+(128-a)/(b-a),y));
if((b>=128)!==(c>=128))hits.push(point(x+1,y+(128-b)/(c-b)));
if((d>=128)!==(c>=128))hits.push(point(x+(128-d)/(c-d),y+1));
if((a>=128)!==(d>=128))hits.push(point(x,y+(128-a)/(d-a)));
for(let i=0;i+1<hits.length;i+=2){
const p=hits[i],q=hits[i+1],dx=q.x-p.x,dy=q.y-p.y,length=Math.hypot(dx,dy);
if(length>1e-8)this.lines.push({p,q,dx,dy,length,den:length*length});
}
}
}
padCoverage(u,v){
const w=this.maskWidth,h=this.maskHeight,x=u*w-.5,y=v*h-.5;
if(x<0||y<0||x>=w-1||y>=h-1)return 0;
const col=Math.floor(x),row=Math.floor(y),i=row*w+col,fx=x-col,fy=y-row,a=this.padMask;
const top=a[i]+(a[i+1]-a[i])*fx,bottom=a[i+w]+(a[i+w+1]-a[i+w])*fx;
return (top+(bottom-top)*fy)/255;
}
fitNeck(cat){
if(!this.neckColumns.length)return;
let top=Infinity,innerTop=-Infinity,bottom=-Infinity,innerBottom=Infinity;
for(const p of this.neckColumns){
const a=cat.restY(p.u,p.top),b=cat.restY(p.u,p.bottom);
top=Math.min(top,a);innerTop=Math.max(innerTop,a);
bottom=Math.max(bottom,b);innerBottom=Math.min(innerBottom,b);
}
this.topNeck={side:1,limit:top,seat:top+.60*(innerTop-top)};
this.bottomNeck={side:-1,limit:bottom,seat:bottom+.45*(innerBottom-bottom)};
}
near(cat,u,v){
const mat=cat.unmap(u,v),U=mat.u,V=mat.v*aspect;
let best=Infinity,closest=null;
for(const line of this.lines){
const {p,dx,dy,den}=line;
const t=clamp(((U-p.x)*dx+(V-p.y)*dy)/den);
const ex=p.x+t*dx-U,ey=p.y+t*dy-V,d=ex*ex+ey*ey;
if(d<best){best=d;closest=line;}
}
if(!closest)return null;
let sum=0,x=0,y=0,nx=0,ny=0;
const sigma=.014,limit=sigma*sigma*8;
for(const l of this.lines){
const p=l.p;
if(Math.abs(p.x-closest.p.x)>.065 || Math.abs(p.y-closest.p.y)>.065)continue;
const k=clamp(((U-p.x)*l.dx+(V-p.y)*l.dy)/l.den),ex=p.x+k*l.dx,ey=p.y+k*l.dy;
const delta=(ex-U)**2+(ey-V)**2-best;
if(delta>limit)continue;
const weight=Math.exp(-delta/(2*sigma*sigma))*l.length;
sum+=weight;x+=ex*weight;y+=ey*weight;
nx+=(p.nx+(l.q.nx-p.nx)*k)*weight;ny+=(p.ny+(l.q.ny-p.ny)*k)*weight;
}
x/=sum;y/=sum*aspect;
const restY=cat.thickness===1?y:cat.restY(x,y);
if(cat.thickness!==1){
const slope=(cat.restY(x+.001,y)-cat.restY(x-.001,y))*aspect/.002;
ny/=cat.widthScale(x);nx-=slope*ny;
}
const norm=Math.hypot(nx,ny)||1;
const X=cat.hasMesh?cat.surface.sample(cat.xy,x,y,0):x;
const Y=cat.hasMesh?cat.surface.sample(cat.xy,x,y,1):restY;
return {u:X,v:Y,nx:nx/norm,ny:ny/norm,distance:Math.hypot(u-X,(v-Y)*aspect),restDistance:Math.hypot(u-x,(v-restY)*aspect),inside:!!mat.zone,zone:x<.282?'head':'back'};
}
}
return {CoatOutline};})();
const {CatTail}=(()=>{
const aspect=935/1517,photoWidth=1517;
const path=[[.749,.453],[.805,.470],[.873,.481],[.921,.514],[.952,.576],[.955,.646],[.944,.708],[.918,.755],[.879,.786],[.857,.794]];
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const approach=(a,b,dt,s)=>a+(b-a)*-Math.expm1(-dt/s);
const count=26,angleLimit=Math.PI/12;
const bell=x=>Math.exp(-x*x);
function turn(n,goal,rate,dt){
const offset=n.angle-goal,speed=n.turnRate+rate*offset,decay=Math.exp(-rate*dt);
n.angle=goal+(offset+speed*dt)*decay;
n.turnRate=(n.turnRate-speed*rate*dt)*decay;
}
function skeleton(){
const arc=[0];
for(let i=1;i<path.length;i++)arc.push(arc[i-1]+Math.hypot(path[i][0]-path[i-1][0],(path[i][1]-path[i-1][1])*aspect));
const nodes=[];let j=1;
for(let i=0;i<count;i++){
const at=arc.at(-1)*i/(count-1);
while(j<path.length-1 && at>arc[j])j++;
const a=path[j-1],b=path[j],f=(at-arc[j-1])/(arc[j]-arc[j-1]);
const x=a[0]+(b[0]-a[0])*f,y=(a[1]+(b[1]-a[1])*f)*aspect,prev=nodes[i-1];
nodes.push({x,y,u:x,v:y,length:0,arc:prev?prev.arc+Math.hypot(x-prev.x,y-prev.y):0,angle:0,rest:0,r:.025,upperFur:.025,
turnRate:0,widthScale:1,furTravel:0});
if(prev){prev.length=Math.hypot(x-prev.x,y-prev.y);prev.angle=prev.rest=Math.atan2(y-prev.y,x-prev.x);}
}
nodes.at(-1).rest=nodes.at(-1).angle=nodes.at(-2).rest;
return nodes;
}
class CatTail{
constructor(){
this.nodes=skeleton();this.length=this.nodes.at(-1).arc;
this.root=this.nodes[0];
for(const n of this.nodes){
const bend=smooth((n.arc/this.length-.065)/.32);
n.upperRest=n.rest*(1-1.96*bend);
}
this.bendWeight=this.nodes.map(n=>smooth(n.arc/.084));
this.reset();
}
reset(){
this.restsAbove=false;
this.centers=null;this.stroke=null;this.amount=0;this.closure=0;this.at=.2;this.slide=0;this.releaseAge=4;this.releaseAngles=null;this.releasePoint=null;this.curlDuration=0;this.curlTime=0;
for(const n of this.nodes){n.u=n.x;n.v=n.y;n.angle=n.rest;n.turnRate=0;n.widthScale=1;n.furTravel=0;}
}
setPhoto(image,maxRadius=.041){
this.image=image;
const c=doc.createElement('canvas');c.width=image.width;c.height=image.height;
const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(image,0,0);
const pixels=g.getImageData(0,0,c.width,c.height),data=pixels.data;
for(const n of this.nodes){
const x=Math.round(20+photoWidth*n.arc);
let top=100,bottom=100;
while(top>0 && data[(top*c.width+x)*4+3]>85)top--;
while(bottom<c.height-1 && data[(bottom*c.width+x)*4+3]>85)bottom++;
n.r=clamp((bottom-top)/(2*photoWidth),.008,maxRadius);
while(top>0 && data[(top*c.width+x)*4+3]>48)top--;
n.upperFur=(100-top)/photoWidth;
}
return pixels;
}
segment(s){
const distance=clamp(s)*this.length;
let i=0;
while(i<count-2 && this.nodes[i+1].arc<distance)i++;
return {i,f:clamp((distance-this.nodes[i].arc)/this.nodes[i].length)};
}
point(s,seated=false){
const {i,f}=this.segment(s),a=this.nodes[i],b=this.nodes[i+1];
const line=seated && this.centers?this.centers:this.nodes;
const p=line[i],q=line[i+1],prev=line[Math.max(0,i-1)],next=line[Math.min(count-1,i+2)];
const ax=q.u-prev.u,ay=q.v-prev.v,bx=next.u-p.u,by=next.v-p.v;
const wa=(1-f)/(Math.hypot(ax,ay)||1),wb=f/(Math.hypot(bx,by)||1);
const dx=ax*wa+bx*wb,dy=ay*wa+by*wb,len=Math.hypot(dx,dy)||1;
return {u:p.u+(q.u-p.u)*f,v:(p.v+(q.v-p.v)*f)/aspect,tx:dx/len,ty:dy/len,at:clamp(s),
ru:a.x+(b.x-a.x)*f,rv:(a.y+(b.y-a.y)*f)/aspect,radius:a.r+(b.r-a.r)*f,
upperFur:(1-f)*a.upperFur*a.widthScale+f*b.upperFur*b.widthScale,
feltRadius:(1-f)*a.r*a.widthScale+f*b.r*b.widthScale};
}
gripPoint(){
if(!this.stroke && this.releasePoint)return this.releasePoint;
const p=this.point(this.at,true);
if(this.at>=.999 && this.stroke){
const t=this.stroke,extra=clamp((t.u-p.u)*p.tx+(t.v-p.v*aspect)*p.ty,0,.024);
p.u+=p.tx*extra;p.v+=p.ty*extra/aspect;
}
return p;
}
closest(u,v,from=0,to=1){
const center=this.centers??this.nodes;
const start=from*this.length,end=to*this.length;
let at=0,distance=Infinity;
for(let i=0;i<count-1;i++){
const {arc,length}=this.nodes[i];
if(arc>end)break;
if(arc+length<start)continue;
const a=center[i],b=center[i+1],dx=b.u-a.u,dy=b.v-a.v,px=u-a.u,py=v*aspect-a.v;
const f=clamp((px*dx+py*dy)/Math.max(1e-12,dx*dx+dy*dy),Math.max(0,(start-arc)/length),Math.min(1,(end-arc)/length));
const d=Math.hypot(px-f*dx,py-f*dy);
if(d<distance){distance=d;at=(arc+length*f)/this.length;}
}
const p=this.point(at,true);
p.distance=distance;p.normal=(u-p.u)*-p.ty+(v-p.v)*aspect*p.tx;
return p;
}
grab(p,hit,fromBody=false){
this.releasePoint=null;this.releaseAngles=null;this.curlDuration=0;
const at=hit.at,grip=this.point(at,true),y=grip.v*aspect;
const dy=(p.v-grip.v)*aspect;
this.stroke={x:p.u,y:p.v*aspect,dx:p.u-grip.u,dy,
keepY:fromBody?dy-clamp(dy,-grip.radius,grip.radius):0,
startX:grip.u,startY:y,startAt:at,farthest:grip.u,farthestAt:at,angles:this.nodes.map(n=>n.angle),
u:grip.u,v:y,handU:grip.u,handY:y,yaw:0,unwind:0,wantedAt:at,pressure:.6,pastTip:false};
this.at=at;this.slide=0;
}
drag(p,pressure=.6){
const s=this.stroke;if(!s)return;
const travel=Math.hypot(p.u-s.x,p.v*aspect-s.y),offset=1-smooth(travel/.042);
const u=p.u-offset*s.dx,v=p.v*aspect-s.keepY-offset*(s.dy-s.keepY);
const dx=u-this.root.x,dy=v-this.root.y;
const yaw=s.yaw=clamp(Math.atan2(dy,Math.max(.001,dx)),-angleLimit,angleLimit);
s.u=u;s.v=v;s.pressure=pressure;
if(u<s.farthest && s.farthest>s.startX+.0001){
const along=(u-s.farthest)/Math.cos(yaw);
s.wantedAt=clamp(s.farthestAt+along/this.length);s.pastTip=false;
return;
}
const pull=u-s.startX,at=s.startAt,active=smooth(pull/(.048+.074*(1-at)));
const start=this.segment(at),nodes=this.nodes;
const openedX=mix=>{
let x=this.root.x;
for(let i=0;i<=start.i;i++){
const yawAt=s.angles[i]+(yaw-s.angles[i])*this.bendWeight[i]*mix;
x+=Math.cos(yawAt)*nodes[i].length*(i===start.i?start.f:1);
}
return x;
};
const extended=openedX(1);
const tipX=extended+(1-at)*this.length*Math.cos(yaw);
s.pastTip=u>tipX+.028;
if(pull<0){
s.wantedAt=clamp(at+pull/this.length);s.unwind=0;
}else{
s.unwind=active;
if(u<extended-.0001 && u<openedX(active)-.0001){
let low=0,high=active;
for(let i=0;i<11;i++){
const mid=(low+high)*.5;
if(openedX(mid)<u)low=mid;else high=mid;
}
s.unwind=(low+high)*.5;
}
const feed=Math.max(0,u-openedX(s.unwind))/(this.length*Math.cos(yaw));
s.wantedAt=clamp(Math.max(s.farthestAt,at+feed));
}
if(s.pastTip){s.wantedAt=1;s.unwind=1;}
if(u>=s.farthest){s.farthest=Math.min(u,tipX);s.farthestAt=s.wantedAt;}
}
release(){
if(!this.stroke)return;
this.releasePoint=this.gripPoint();
this.releaseAngles=this.nodes.map(n=>n.angle);this.releaseAge=0;this.stroke=null;
this.curlDelay=Math.random()<.10?0:1.05+Math.random()*.55;
}
readyToCurl(dt){
return this.releaseAngles && !this.curlDuration && this.releaseAge+dt>=this.curlDelay;
}
beginCurl(duration,restsAbove){
this.restsAbove=restsAbove;
this.curlDuration=duration;this.curlTime=0;
}
moveGrip(dt){
const s=this.stroke,prevAt=this.at;
this.at=approach(prevAt,s.wantedAt,dt,.029+.017*(1-this.amount));
const along=(this.at-prevAt)*this.length/dt;
this.slide=approach(this.slide,clamp(along,-.85,.95),dt,.057);
const x=approach(s.handU,s.u,dt,.061),y=approach(s.handY,s.v,dt,.061);
const vx=clamp((x-s.handU)/dt,-1.5,1.5),vy=clamp((y-s.handY)/dt,-1.5,1.5);
s.handU=x;s.handY=y;
const side=.24*Math.tanh((y-s.startY)/.042)-.048*this.amount;
const slip=Math.tanh(this.slide*4.4);
const grip=this.segment(this.at);
let gripY=this.root.y,mobility=0;
for(let i=0;i<count;i++){
const n=this.nodes[i],k=n.arc/this.length,offset=(k-this.at)*this.length;
const before=bell((offset+.037)/.061),after=bell((offset-.050)/.071);
const free=smooth(offset/.155),cross=vy*Math.cos(n.angle)-vx*Math.sin(n.angle);
const give=this.bendWeight[i]*this.amount*(side*(before-.78*after)-.31*free*Math.tanh(2.7*cross));
const ahead=smooth((k-s.farthestAt)/.44);
const weight=s.unwind*(1-.94*ahead)*this.bendWeight[i];
const curled=s.angles[i]+give,drawn=clamp(s.yaw+give,-angleLimit,angleLimit);
n.goal=curled+(drawn-curled)*weight;
const tx=Math.max(0,Math.cos(n.goal));
n.compliance=(1-weight)*this.bendWeight[i]*tx*tx*(1-smooth(offset/.105));
if(i<=grip.i){
const span=n.length*(i===grip.i?grip.f:1);
gripY+=span*Math.sin(n.goal);
mobility+=span*tx*n.compliance;
}
const pad=bell((offset+.007*slip)/.044);
const edge=bell((Math.abs(offset)-.065)/.025);
const width=1+this.amount*(.065*edge-(.14+.10*s.pressure)*pad);
n.widthScale=approach(n.widthScale,width,dt,width<n.widthScale?.043:.13);
n.furTravel=approach(n.furTravel,.0048*slip*this.amount*(pad+.45*edge),dt,.065);
}
const tilt=.36*Math.tanh((y-gripY)/(.36*(.035+mobility)));
for(const n of this.nodes){
const offset=n.arc-this.at*this.length;
const rate=67-47*smooth((offset+.008)/.20)-17*smooth((-offset-.067)/.16);
turn(n,n.goal+tilt*n.compliance,rate,dt);
}
}
slipped(){
return this.stroke?.pastTip && this.at>.994 && this.nodes.at(-1).u-this.root.x>.91*this.length;
}
update(dt,wave){
const s=this.stroke,root=this.root;
this.closure=approach(this.closure,s?1:0,dt,s?.047:.055);
this.amount=approach(this.amount,this.closure,dt,s?.061:.073);
this.releaseAge+=dt;
if(this.curlDuration)this.curlTime+=dt;
if(s)this.moveGrip(dt);
else{
this.slide=approach(this.slide,0,dt,.14);
for(let i=0;i<count;i++){
const n=this.nodes[i],k=n.arc/this.length;
const target=this.restsAbove?n.upperRest:n.rest;
let base=target;
if(this.releaseAngles){
const start=this.releaseAngles[i];
const progress=this.curlDuration?smooth((this.curlTime/this.curlDuration-.22*(1-k))/.78):0;
base=start+(target-start)*progress;
}
n.angle=this.releaseAngles && !this.curlDuration?base:wave(k,base,n.rest);
n.turnRate=0;
n.widthScale=approach(n.widthScale,1,dt,.106);
n.furTravel=approach(n.furTravel,0,dt,.11);
}
}
if(this.curlDuration && this.curlTime>=this.curlDuration){
this.releaseAngles=null;this.curlDuration=0;
}
let x=root.x,y=root.y;
for(let i=0;i<count;i++){
const n=this.nodes[i];n.u=x;n.v=y;
if(i===count-1){n.angle=this.nodes[i-1].angle;break;}
x+=Math.cos(n.angle)*n.length;y+=Math.sin(n.angle)*n.length;
}
}
}
return {CatTail};})();
const {TailPhoto}=(()=>{
const photoWidth=1517,stripOrigin=20,halfWidth=100,bandHeight=50;
function hasInk(pixels,left,top,right,bottom){
const x0=Math.max(0,Math.floor(left)-3),x1=Math.min(pixels.width,Math.ceil(right)+3);
const y0=Math.max(0,top-3),y1=Math.min(pixels.height,bottom+3);
for(let y=y0;y<y1;y++){
let alpha=(y*pixels.width+x0)*4+3;
for(let x=x0;x<x1;x++,alpha+=4)if(pixels.data[alpha])return true;
}
return false;
}
function texture(pixels){
const {width,height,data}=pixels,stride=width+2;
const texels=new Uint8ClampedArray(4*stride*(height+2));
for(let y=0;y<height+2;y++){
const row=width*Math.max(0,Math.min(height-1,y-1));
for(let x=0;x<stride;x++){
const s=4*(row+Math.max(0,Math.min(width-1,x-1))),d=4*(y*stride+x),a=data[s+3];
texels[d]=data[s]*a/255;texels[d+1]=data[s+1]*a/255;
texels[d+2]=data[s+2]*a/255;texels[d+3]=a;
}
}
return {texels,stride,height};
}
function rasterTriangle(dst,tex,a,b,c,dpr){
const dx=b.x-a.x,dy=b.y-a.y,ex=c.x-a.x,ey=c.y-a.y,det=dx*ey-ex*dy;
if(Math.abs(det)<.00001)return;
const u=b.s-a.s,v=b.t-a.t,p=c.s-a.s,q=c.t-a.t;
const ux=(u*ey-p*dy)/det,uy=(p*dx-u*ex)/det,vx=(v*ey-q*dy)/det,vy=(q*dx-v*ex)/det;
const ab=Math.hypot(dx,dy),ac=Math.hypot(ex,ey),bc=Math.hypot(c.x-b.x,c.y-b.y),per=ab+ac+bc;
const radius=Math.abs(det)/per,cx=(a.x*bc+b.x*ac+c.x*ab)/per,cy=(a.y*bc+b.y*ac+c.y*ab)/per;
const pad=Math.min(1.5*radius,.72*dpr),expand=1+(pad+.65)/radius;
const edgeFor=(x,y)=>({x:cx+(x-cx)*expand,y:cy+(y-cy)*expand});
let lo=edgeFor(a.x,a.y),mid=edgeFor(b.x,b.y),hi=edgeFor(c.x,c.y);
const top=Math.max(0,Math.ceil(Math.min(lo.y,mid.y,hi.y)-.5)),bottom=Math.min(dst.height,Math.ceil(Math.max(lo.y,mid.y,hi.y)-.5));
const flip=Math.sign(det),ax=-dy/ab*flip,ay=dx/ab*flip,bx=-(c.y-b.y)/bc*flip,by=(c.x-b.x)/bc*flip,kx=ey/ac*flip,ky=-ex/ac*flip;
const leftS=Math.max(0,Math.floor(Math.min(a.s,b.s,c.s))-2)+.5,rightS=Math.min(tex.stride-2,Math.ceil(Math.max(a.s,b.s,c.s))+2)+.5;
const topT=Math.max(0,Math.floor(Math.min(a.t,b.t,c.t))-2)+.5,bottomT=Math.min(tex.height,Math.ceil(Math.max(a.t,b.t,c.t))+2)+.5;
if(lo.y>mid.y){[lo,mid]=[mid,lo];}if(mid.y>hi.y){[mid,hi]=[hi,mid];}if(lo.y>mid.y){[lo,mid]=[mid,lo];}
const long=(hi.x-lo.x)/(hi.y-lo.y),first=mid.y===lo.y?0:(mid.x-lo.x)/(mid.y-lo.y),last=hi.y===mid.y?0:(hi.x-mid.x)/(hi.y-mid.y);
const {stride,texels}=tex,srcStride=4*stride,out=dst.data;
for(let y=top;y<bottom;y++){
const cy=y+.5;
const x1=lo.x+(cy-lo.y)*long,x2=cy<mid.y?lo.x+(cy-lo.y)*first:mid.x+(cy-mid.y)*last;
const left=Math.max(0,Math.ceil(Math.min(x1,x2)-.5)),right=Math.min(dst.width,Math.ceil(Math.max(x1,x2)-.5));
let sx=a.s+.5+(left+.5-a.x)*ux+(cy-a.y)*uy,sy=a.t+.5+(left+.5-a.x)*vx+(cy-a.y)*vy;
let f0=(left+.5-a.x)*ax+(cy-a.y)*ay+pad+.5,f1=(left+.5-b.x)*bx+(cy-b.y)*by+pad+.5,f2=(left+.5-c.x)*kx+(cy-c.y)*ky+pad+.5;
for(let x=left,d=4*(y*dst.width+left);x<right;x++,d+=4,sx+=ux,sy+=vx,f0+=ax,f1+=bx,f2+=kx){
if(sx<leftS||sx>=rightS||sy<topT||sy>=bottomT)continue;
const cover=Math.min(1,f0,f1,f2);if(cover<=0)continue;
const ix=sx|0,iy=sy|0,s=4*(iy*stride+ix),h=s+srcStride;
const fx=sx-ix,fy=sy-iy,tl=(1-fx)*(1-fy),tr=fx*(1-fy),bl=(1-fx)*fy,br=fx*fy;
const alpha=cover*(texels[s+3]*tl+texels[s+7]*tr+texels[h+3]*bl+texels[h+7]*br);
if(alpha<.5)continue;
const r=texels[s]*tl+texels[s+4]*tr+texels[h]*bl+texels[h+4]*br;
const g=texels[s+1]*tl+texels[s+5]*tr+texels[h+1]*bl+texels[h+5]*br;
const b=texels[s+2]*tl+texels[s+6]*tr+texels[h+2]*bl+texels[h+6]*br;
if(alpha>=254.5){out[d]=r;out[d+1]=g;out[d+2]=b;out[d+3]=255;continue;}
const under=out[d+3]*(1-alpha/255),combined=alpha+under;
out[d]=(255*r*cover+under*out[d])/combined;out[d+1]=(255*g*cover+under*out[d+1])/combined;
out[d+2]=(255*b*cover+under*out[d+2])/combined;out[d+3]=combined;
}
}
}
function drawTriangle(g,photo,a,b,c){
const u=b.s-a.s,v=b.t-a.t,p=c.s-a.s,q=c.t-a.t,D=u*q-v*p;
const X=b.x-a.x,Y=b.y-a.y,Z=c.x-a.x,W=c.y-a.y;
const m=(X*q-Z*v)/D,n=(Y*q-W*v)/D,h=(Z*u-X*p)/D,k=(W*u-Y*p)/D;
const ab=Math.hypot(X,Y),ac=Math.hypot(Z,W),bc=Math.hypot(X-Z,Y-W),perimeter=ab+ac+bc;
if(perimeter<.0001)return;
const cx=(a.x*bc+b.x*ac+c.x*ab)/perimeter,cy=(a.y*bc+b.y*ac+c.y*ab)/perimeter;
const expand=Math.min(1.5,.72*perimeter/Math.max(.01,Math.abs(X*W-Y*Z)));
g.save();g.beginPath();
for(const pt of [a,b,c]){
const dx=(pt.x-cx)*expand,dy=(pt.y-cy)*expand;
if(pt===a)g.moveTo(pt.x+dx,pt.y+dy);else g.lineTo(pt.x+dx,pt.y+dy);
}
g.closePath();g.clip();g.transform(m,n,h,k,a.x-m*a.s-h*a.t,a.y-n*a.s-k*a.t);
const l=Math.max(0,Math.floor(Math.min(a.s,b.s,c.s))-2),t=Math.max(0,Math.min(a.t,b.t,c.t)-2);
const w=Math.min(photo.width,Math.ceil(Math.max(a.s,b.s,c.s))+2)-l;
const height=Math.min(photo.height,Math.max(a.t,b.t,c.t)+2)-t;
g.drawImage(photo,l,t,w,height,l,t,w,height);g.restore();
}
function drawSections(view,tail,socket,visible,draw){
const nodes=tail.nodes,photo=tail.image;
if(!photo)return;
let previous=null;
for(let j=-1;j<=nodes.length;j++){
const i=Math.max(0,Math.min(nodes.length-1,j)),n=nodes[i];
const a=nodes[Math.max(0,i-1)],b=nodes[Math.min(nodes.length-1,i+1)];
const dx=b.u-a.u,dy=b.v-a.v,length=Math.hypot(dx,dy)||1,tx=dx/length,ty=dy/length;
const S=stripOrigin+n.arc*photoWidth,s=j<0?0:j===nodes.length?photo.width:S;
const ext=(s-S)/photoWidth,x=n.u+ext*tx,y=n.v+ext*ty;
const row=[];
for(let t=0;t<=photo.height;t+=bandHeight){
const across=(t-halfWidth)/photoWidth,d=across*n.widthScale;
const nap=n.furTravel*Math.min(1,Math.abs(across)/n.r);
const px=x-d*ty+nap*tx,py=y+d*tx+nap*ty;
const [u,v]=n.arc<.095?socket.seat(i,across,ext,px,py):[px,py];
row.push({s,t,x:view.x+u*view.w,y:view.y+v*view.w});
}
if(previous)for(let k=0;k<row.length-1;k++){
if(!visible[j][k])continue;
draw(previous[k],row[k],previous[k+1]);
draw(previous[k+1],row[k],row[k+1]);
}
previous=row;
}
}
class TailPhoto{
constructor(){
this.photo=doc.createElement('canvas');this.ink=this.photo.getContext('2d');
this.shape=[];
}
setSections(pixels,nodes){
this.tex=texture(pixels);
const edges=[0,...nodes.map(n=>stripOrigin+n.arc*photoWidth),pixels.width];
this.visible=[];
for(let i=1;i<edges.length;i++){
const bands=[];
for(let top=0;top<pixels.height;top+=bandHeight)
bands.push(hasInk(pixels,edges[i-1],top,edges[i],top+bandHeight));
this.visible.push(bands);
}
}
draw(g,view,tail,socket){
const nodes=tail.nodes,W=view.w,d=view.dpr;
const joint=[];
for(const i of [2,4]){
const n=nodes[i],normal=socket.normals[i];
for(const off of [-.031,.031])
joint.push(...socket.seat(i,off,0,n.u+off*normal.x,n.v+off*normal.y));
}
const moved=!this.lastJoint || joint.some((v,i)=>Math.abs(v-this.lastJoint[i])*W*d>.26);
const changed=moved || this.image!==tail.image || this.w!==W || this.d!==d ||
nodes.some((n,i)=>!this.shape[i] || Math.max(Math.abs(n.u-this.shape[i].u),
Math.abs(n.v-this.shape[i].v),n.r*Math.abs(n.widthScale-this.shape[i].widthScale),
Math.abs(n.furTravel-this.shape[i].furTravel))>.36/(W*d));
if(changed){
this.lastJoint=joint;this.image=tail.image;this.w=W;this.d=d;
this.shape=nodes.map(n=>({u:n.u,v:n.v,widthScale:n.widthScale,furTravel:n.furTravel}));
const margin=W*.084;
this.left=Math.floor((Math.min(...nodes.map(n=>n.u))*W-margin)*d)/d;
this.top=Math.floor((Math.min(...nodes.map(n=>n.v))*W-margin)*d)/d;
const right=Math.max(...nodes.map(n=>n.u))*W+margin,bottom=Math.max(...nodes.map(n=>n.v))*W+margin;
const neededW=Math.ceil((right-this.left)*d),neededH=Math.ceil((bottom-this.top)*d);
if(neededW>this.photo.width || neededH>this.photo.height){
this.photo.width=Math.ceil(Math.max(neededW,this.photo.width)/64)*64;
this.photo.height=Math.ceil(Math.max(neededH,this.photo.height)/64)*64;
}
this.usedW=neededW;this.usedH=neededH;
const c=this.ink;
const region={x:-this.left*d,y:-this.top*d,w:W*d};
if(region.w<=photoWidth){
let buffer=this.buffer;
if(!buffer || neededW>buffer.width || neededH>buffer.height){
const w=Math.ceil(Math.max(neededW,buffer?.width??0)/64)*64;
const h=Math.ceil(Math.max(neededH,buffer?.height??0)/64)*64;
buffer=this.buffer=c.createImageData(w,h);
}
buffer.data.fill(0,0,4*buffer.width*neededH);
drawSections(region,tail,socket,this.visible,(a,b,e)=>rasterTriangle(buffer,this.tex,a,b,e,d));
c.putImageData(buffer,0,0,0,0,neededW,neededH);
}else{
c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,this.photo.width,this.photo.height);
c.setTransform(d,0,0,d,0,0);
drawSections({x:-this.left,y:-this.top,w:W},tail,socket,this.visible,(a,b,e)=>drawTriangle(c,tail.image,a,b,e));
}
}
g.drawImage(this.photo,0,0,this.usedW,this.usedH,view.x+this.left,view.y+this.top,this.usedW/d,this.usedH/d);
}
}
return {TailPhoto};})();
const {TailSocket}=(()=>{
const aspect=935/1517;
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=(lo,hi,x)=>{const k=clamp((x-lo)/(hi-lo));return k*k*(3-2*k);};
function frame(nodes,i,rest,out={}){
const a=nodes[Math.max(0,i-1)],b=nodes[Math.min(nodes.length-1,i+1)];
const x=rest?b.x-a.x:b.u-a.u,y=rest?b.y-a.y:b.v-a.v;
const inv=1/(Math.hypot(x,y)||1);
out.x=-y*inv;out.y=x*inv;return out;
}
function influence(arc,d){
const along=smooth(.013,.092,arc),edge=smooth(.042,.103,Math.abs(d));
return along*(1-(1-along)*edge);
}
class TailSocket{
constructor(tail,vertices){
this.tail=tail;const nodes=tail.nodes;
this.rest=nodes.map((_,i)=>frame(nodes,i,true));
this.normals=nodes.map(()=>({x:0,y:0}));
this.raw=new Float32Array(vertices.length*2);
this.centers=nodes.map(n=>({u:n.u,v:n.v}));
this.wedge=[];
for(let j=0;j<vertices.length;j++){
const {x,y}=vertices[j],Y=y*aspect;
if(x<.746 || x>.836 || y<.275 || y>.68)continue;
let i=0,f=0,d=0,best=Infinity;
for(let k=0;k<8;k++){
const a=nodes[k],b=nodes[k+1],tx=(b.x-a.x)/a.length,ty=(b.y-a.y)/a.length;
const t=clamp(((x-a.x)*tx+(Y-a.y)*ty)/a.length);
const rx=x-a.x-(b.x-a.x)*t,ry=Y-a.y-(b.y-a.y)*t,l=rx*rx+ry*ry;
if(l<best){best=l;i=k;f=t;d=-rx*ty+ry*tx;}
}
const a=nodes[i],b=nodes[i+1],arc=a.arc+f*a.length;
if(a.arc===0 && f===0)continue;
const w=influence(arc,d);
if(w<.00001)continue;
this.wedge.push({j:2*j,i,f,d,w,x,y:Y});
}
}
update(surface,xy,light){
this.surface=surface;this.raw.set(xy);this.bound=xy;
const nodes=this.tail.nodes,R=this.rest,N=this.normals;this.tail.centers=this.centers;
for(let i=0;i<9;i++)frame(nodes,i,false,N[i]);
for(const p of this.wedge){
const {j,i,f,d,w}=p,g=1-f,a=nodes[i],b=nodes[i+1];
const dx=(a.u-a.x)*g+(b.u-b.x)*f+d*((N[i].x-R[i].x)*g+(N[i+1].x-R[i+1].x)*f);
const dy=(a.v-a.y)*g+(b.v-b.y)*f+d*((N[i].y-R[i].y)*g+(N[i+1].y-R[i+1].y)*f);
xy[j]+=w*(p.x+dx-xy[j]);xy[j+1]+=w*((p.y+dy)/aspect-xy[j+1]);
light[j]*=1-w;light[j+1]*=1-w;
}
for(let i=0;i<nodes.length;i++){
const n=nodes[i],p=this.centers[i];
if(n.arc<.095){[p.u,p.v]=this.seat(i,0,0,n.u,n.v);}
else{p.u=n.u;p.v=n.v;}
}
}
seat(i,d,ext,x,y){
const a=this.tail.nodes[i],normal=this.rest[i];
const arc=a.arc+ext,w=influence(arc,d);if(w>=1)return [x,y];
const u=a.x+ext*normal.y+d*normal.x,v=(a.y-ext*normal.x+d*normal.y)/aspect;
const bx=this.surface.sample(this.raw,u,v,0),by=this.surface.sample(this.raw,u,v,1)*aspect;
const tx=bx+(x-bx)*w,ty=by+(y-by)*w;
const away=smooth(.060,.088,arc);
if(away>=1)return [tx,ty];
const mx=this.surface.sample(this.bound,u,v,0),my=this.surface.sample(this.bound,u,v,1)*aspect;
return [mx+(tx-mx)*away,my+(ty-my)*away];
}
}
return {TailSocket};})();
const {OverheadCat}=(()=>{
const clamp=(n,lo=0,hi=1)=>Math.max(lo,Math.min(hi,n));
const smooth=(a,b,x)=>{const f=clamp((x-a)/(b-a));return f*f*(3-2*f);};
const follow=(x,target,dt,tau)=>x+(target-x)*-Math.expm1(-dt/tau);
const bell=(x,y)=>Math.exp(-x*x-y*y);
const skullAt=u=>1-smooth(.238,.353,u);
const skinTravel=skull=>1-.34*skull;
const spine=.48;
function widthWeight(u){
const cheeks=.15*smooth(.11,.18,u);
const neck=.40*smooth(.212,.300,u);
const shoulders=.45*smooth(.270,.440,u);
return (cheeks+neck+shoulders)*(1-smooth(.56,.744,u));
}
const metric=935/1517;
const nx=76,ny=48;
const longCoats=new Set(['ragdoll','siberian','norwegian']);
function guardHairFlow(surface,vertices){
const {src,sw:w,sh:h}=surface,flow=new Float32Array(vertices.length*2);
const step=Math.max(2,Math.round(w*.006));
for(let i=0;i<vertices.length;i++){
const {x:u,y:v,pile}=vertices[i];
if(!pile)continue;
const x=Math.round(u*(w-1)),y=Math.round(v*(h-1));
if(src[4*(y*w+x)+3]<64)continue;
let xx=0,xy=0,yy=0;
for(let j=-2;j<=2;j++)for(let k=-2;k<=2;k++){
const px=x+k*step,py=y+j*step;
if(px<1||py<1||px>=w-1||py>=h-1)continue;
const n=4*(py*w+px);
if(src[n+3]<230)continue;
const dx=src[n+5]-src[n-3],dy=src[n+4*w+1]-src[n-4*w+1];
const weight=6-Math.abs(j)-Math.abs(k);
xx+=dx*dx*weight;xy+=dx*dy*weight;yy+=dy*dy*weight;
}
const side=clamp((v-.48)*2.8,-1,1),angle=.5*Math.atan2(2*xy,xx-yy)+Math.PI/2;
let tx=Math.cos(angle),ty=Math.sin(angle);
if(tx+side*ty<0){tx=-tx;ty=-ty;}
const coherence=.74*Math.hypot(xx-yy,2*xy)/(xx+yy+90);
tx=1+(tx-1)*coherence;ty=side+(ty-side)*coherence;
const len=Math.hypot(tx,ty);tx/=len;ty/=len;
const sweep=Math.sin(11*u+28*v+1.4*Math.sin(9*u-6*v));
const back=-.011+.0025*sweep,cross=.0045*sweep;
flow[2*i]=back*tx-cross*ty;flow[2*i+1]=(back*ty+cross*tx)/metric;
}
return flow;
}
function spring(s,name,vname,target,dt,hz,damp){
const n=Math.max(1,Math.ceil(160*dt)),h=dt/n,w=2*Math.PI*hz;
for(let i=0;i<n;i++){
s[vname]+=(w*w*(target-s[name])-2*w*damp*s[vname])*h;
s[name]+=h*s[vname];
}
}
function neutral(){
return {x:.35,y:.47,load:0,loadV:0,bulk:0,bulkV:0,lift:0,liftV:0,head:0,shearX:0,shearY:0,shearVX:0,shearVY:0,shoulderX:0,shoulderY:0,axisX:.54,axisY:.84,length:.044,width:.06,dirX:1,dirY:0,glide:0,pads:[],held:0,tail:0,active:false};
}
function swishBeats(count){
const beats=[];
let end=0;
for(let i=0;i<count;i++){
const length=(i===0?1.08:.85)+.30*Math.random();
const peak=(i===0?.90:i===1?.76:.52)+.10*Math.random();
beats.push({start:end,length,attack:.40+.14*Math.random(),peak});
end+=length;
}
return beats;
}
function swishAt(beats,time){
for(const beat of beats){
if(time<beat.start)return 0;
const f=(time-beat.start)/beat.length;
if(f<1)return beat.peak*(f<beat.attack?smooth(0,beat.attack,f):1-smooth(beat.attack,1,f));
}
return 0;
}
class OverheadCat {
constructor(canvas){
this.body=doc.createElement('canvas');this.surface=new CoatSurface(this.body,nx,ny);
this.canvas=canvas;this.ink=canvas.getContext('2d');this.tail=new CatTail();this.tailPhoto=new TailPhoto();
this.state=neutral();this.time=0;this.thickness=1;
this.vertices=[];this.xy=new Float32Array(2*(nx+1)*(ny+1));this.light=new Float32Array(this.xy.length);
this.trail=new Float32Array(this.xy.length/2);this.combX=new Float32Array(this.trail.length);this.combY=new Float32Array(this.trail.length);this.out=new Float64Array(4);this.tip={u:.35,v:.47,load:0,lift:0,depth:0};
for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++)this.vertices.push(this.weights(i/nx,j/ny));
this.raised=new Float32Array(this.vertices.length);
this.socket=new TailSocket(this.tail,this.vertices);
this.reset();
}
reset(){
this.state=neutral();this.time=0;this.tip.depth=0;this.hasMesh=false;this.trail.fill(0);this.combX.fill(0);this.combY.fill(0);this.raised.fill(0);
this.tail.reset();
this.gesture={age:0,duration:0,delay:0,turn:0,second:0,beats:null,count:0};
this.tick(1/60,null);this.tailPose(1/60);
}
setCat(body,tailPhoto,key,rasterWidth){
const long=this.longCoat=longCoats.has(key);
const guards=key==='norwegian';
this.surface.setImage(body,rasterWidth,long && !guards,!long);this.reset();
this.combTravel=long?.57:.46;this.combRelax=long?.59:.43;
const {src,sw,sh}=this.surface;
for(const v of this.vertices){
const x=Math.min(sw-1,Math.floor(v.x*sw)),y=Math.min(sh-1,Math.floor(v.y*sh));
const bodyPile=1-smooth(.735,.812,v.x);
v.pile=long?smooth(.15,.29,v.x)*bodyPile:(.17+.83*smooth(.17,.34,v.x))*bodyPile*(1-Math.max(v.ear1,v.ear2));
const green=src[4*(y*sw+x)+1];
v.pale=long?smooth(130,205,green):key==='siam'?smooth(56,172,green):Number(key==='shiro');
}
this.guardFlow=guards?guardHairFlow(this.surface,this.vertices):null;
this.guardBase=guards?new Float32Array(this.xy.length):null;
this.outline=new CoatOutline(this.surface);
this.outline.fitNeck(this);
const tailPixels=this.tail.setPhoto(tailPhoto,long?.064:.041);
this.tailPhoto.setSections(tailPixels,this.tail.nodes);
let lo=0,hi=.5;
for(let i=0;i<12;i++){
const mid=(lo+hi)/2,p=this.tail.point(mid);
if(this.restZone(p.u,p.v))lo=mid;else hi=mid;
}
this.tailBase=this.tail.point((lo+hi)/2);
}
tailBaseX(){
const p=this.tailBase;
return this.hasMesh?this.surface.sample(this.xy,p.u,p.v,0):p.u;
}
setThickness(ratio){
if(!Number.isFinite(ratio))return;
const next=clamp(ratio,.8,1.4),delta=next-this.thickness;
if(!delta)return;
this.thickness=next;
this.outline?.fitNeck(this);
this.surface.inverseIterations=next>1.22?7:3;
if(this.hasMesh)for(let i=0;i<this.vertices.length;i++)this.xy[2*i+1]+=delta*this.vertices[i].spread;
}
widthScale(u){
return 1+(this.thickness-1)*widthWeight(u);
}
neckWeight(u){
return smooth(.115,.165,u)*(1-smooth(.373,.455,u));
}
restY(u,v){
return v+(v-spine)*(this.thickness-1)*widthWeight(u);
}
weights(x,y){
const head=(1-smooth(.21,.365,x))*(1-smooth(.15,.24,Math.abs(y-.49)));
const chest=bell((x-.365)/.167,(y-.48)/.31);
const ear1=bell((x-.132)/.046,(y-.331)/.078),ear2=bell((x-.123)/.051,(y-.608)/.056);
return {x,y,head,chest,ear1,ear2,spread:(y-spine)*widthWeight(x),travel:skinTravel(skullAt(x))};
}
alpha(u,v){
if(u<0 || u>=1 || v<0 || v>=1 || !this.surface.src)return 0;
const {sw,sh,src}=this.surface;return src[4*((u*sw|0)+(v*sh|0)*sw)+3];
}
restZone(u,v){
if(this.alpha(u,v)<48)return null;
return u<.282?'head':'back';
}
unmap(u,v){
const scale=this.thickness===1?1:this.widthScale(u);
let x=u,y=scale===1?v:spine+(v-spine)/scale;
if(!this.hasMesh || u<0 || v<0 || u>1 || v>1)return {u:x,v:y,zone:this.restZone(x,y)};
for(let i=0;i<5;i++){
const dx=u-this.surface.sample(this.xy,x,y,0),dy=v-this.surface.sample(this.xy,x,y,1);
x+=clamp(dx,-.045,.045);y+=clamp(dy/scale,-.07,.07);
if(Math.abs(dx)+Math.abs(dy)<.00015)break;
}
return {u:x,v:y,zone:this.restZone(x,y)};
}
reach(p,margin,upperMargin=margin,bodyOnly=false,upperNeckExtra){
if(!this.outline)return null;
const body=this.unmap(p.u,p.v);
const neck=this.neckWeight(p.u);
if(body.zone && (!neck || Math.abs(body.v-spine)<.07))return {u:p.u,v:p.v,zone:body.zone};
const guide=neck?this.neckContact(p,margin,upperMargin,upperNeckExtra):null;
if(guide && neck===1){
return guide.gap>0?null:{u:p.u,v:guide.v,zone:body.zone??(body.u<.282?'head':'back'),snapped:guide.snapped};
}
if(body.zone)return {u:p.u,v:guide?p.v+neck*(guide.v-p.v):p.v,zone:body.zone,snapped:guide?.snapped};
const tail=bodyOnly?null:this.tail.closest(p.u,p.v),outside=tail?tail.distance-tail.radius:Infinity;
if(tail && outside<=0 && tail.at>.08)return {u:p.u,v:p.v,zone:'tail'};
const rim=this.outline.near(this,p.u,p.v);
if(tail && tail.at>.08 && outside<=margin && (!rim || outside<rim.distance)){
const f=tail.radius*.82/Math.max(.0001,tail.distance);
return {u:tail.u+(p.u-tail.u)*f,v:tail.v+(p.v-tail.v)*f,zone:'tail',snapped:true};
}
if(!rim)return null;
const above=(rim.v-p.v)*metric/Math.max(.0001,rim.distance);
const upper=smooth(.12,.78,above)*smooth(.02,.68,rim.ny);
let gap=Math.min(rim.distance,rim.restDistance)-(margin+(upperMargin-margin)*upper);
let u=rim.u+rim.nx*.0025,v=rim.v+rim.ny*.0025/metric;
if(guide){
gap+=(guide.gap-gap)*neck;
u+=(p.u-u)*neck;v+=(guide.v-v)*neck;
}
return gap>0?null:{u,v,zone:rim.zone,snapped:true};
}
neckContact(p,margin,upperMargin,upperNeckExtra=0){
const upper=p.v<spine,edge=upper?this.outline.topNeck:this.outline.bottomNeck;
if(!edge)return null;
const {side,limit,seat}=edge;
const extra=upper?upperNeckExtra:0;
const reach=(upper?upperMargin:margin)+.55*margin+extra;
const outside=(seat-p.v)*side*metric,d=.0025+outside,band=.008;
const push=d<=-band?0:d>=band?d:(d+band)**2/(4*band);
const glide=extra?Math.min(extra*.16,.007,(seat-limit)*metric)*smooth(0,.045+extra,outside):0;
return {v:p.v+side*(push-glide)/metric,gap:(limit-p.v)*side*metric-reach,snapped:push>0};
}
handEdge(u,v,padU,padV){
const edge=padV<spine?this.outline.topNeck:this.outline.bottomNeck;
const neck=this.neckWeight(padU);
const blend=edge && neck*(1-smooth(.025,.067,(padV-edge.seat)*edge.side*metric));
if(!blend)return this.outline.near(this,u,v);
let distance=(v-edge.seat)*edge.side*metric,angle=0;
if(blend<1){
const rim=this.outline.near(this,u,v);
if(rim){
angle=(1-blend)*Math.atan2(rim.nx,rim.ny*edge.side);
distance+=(1-blend)*((rim.inside?rim.distance:-rim.distance)-distance);
}
}
return {nx:Math.sin(angle),ny:edge.side*Math.cos(angle),distance:Math.abs(distance),inside:distance>=0};
}
upperPadDrop(view,pad,pads){
const top=this.outline.topNeck;
if(!top)return 0;
const neck=this.neckWeight(pad.u)*(1-smooth(0,.045,(pad.v-top.seat)*metric));
if(!neck)return 0;
const {sw,sh,src}=this.surface,stride=4*sw;
const inset=Math.max(1,view.w*.003);
let drop=view.w*.035;
for(let i=0;i<4;i++){
const finger=pads[i];
const hit=this.unmap((finger.x-view.x)/view.w,(finger.y-inset-view.y)/view.h);
if(hit.u<0 || hit.u>=1)continue;
const pxPerRow=view.h*this.widthScale(hit.u)/sh,y=hit.v*sh;
const first=Math.floor(y),inside=Math.ceil(inset/pxPerRow);
const end=Math.min(sh-1-inside,Math.ceil(y+drop/pxPerRow));
const column=4*Math.floor(hit.u*sw)+3;
for(let row=Math.max(0,first);row<=end;row++){
const pixel=row*stride+column;
if(src[pixel]<112 || src[pixel+inside*stride]<112)continue;
if(row===first)return 0;
drop=Math.min(drop,(row+.5-y)*pxPerRow);
break;
}
}
return drop*neck;
}
map(u,v){
this.move(this.weights(u,v),0,this.out);return [this.out[0],this.out[1]];
}
contact(view,pads,pressure,dx,dy,strokeU=(pads[5].x-view.x)/view.w){
const soft=view.kitten?1:this.neckWeight(strokeU);
const points=pads.map(p=>{
const hit=this.unmap((p.x-view.x)/view.w,(p.y-view.y)/view.h);
const center=Number(!!hit.zone);
const coverage=soft?center+soft*(this.outline.padCoverage(hit.u,hit.v)-center):center;
return {...hit,weight:p.weight,coverage};
});
let total=0,u=0,v=0,skull=0;
for(const p of points){
if(!p.coverage)continue;
const load=p.weight*p.coverage;
total+=load;u+=load*p.u;v+=load*p.v;skull+=load*skullAt(p.u);
}
if(total<.04)return null;
const palm=points[5],middle=points[1],ring=points[2];
const ax=palm.u-(middle.u+ring.u)*.5,ay=(palm.v-(middle.v+ring.v)*.5)*metric;
const dist=Math.max(.01,Math.hypot(ax,ay));
const span=Math.hypot(points[3].u-points[0].u,(points[3].v-points[0].v)*metric);
const onFur=points.filter(p=>p.coverage>.001);
const zone=palm.zone??(soft?(u/total<.282?'head':'back'):onFur[0].zone);
return {u:u/total,v:v/total,skull:skull/total,pressure:pressure*Math.sqrt(total),dx,dy,pads:onFur,
zone,axisX:ax/dist,axisY:ay/dist,
length:clamp(dist*.51,.030,.066),width:clamp(span*.43,.035,.079)};
}
tick(dt,input,quiet){
const s=this.state;
const p=input?clamp(input.pressure || 0):0,active=p>.025;
const zone=active?input.zone:null;
const skull=active && zone!=='tail'?(input.skull??skullAt(input.u)):0;
const compliance=1-.34*skull;
const dragTransfer=zone==='tail'?.16:compliance;
let pullX=0,pullY=0;
if(active){
s.held+=dt;s.x=input.u;s.y=input.v;
s.axisX=input.axisX;s.axisY=input.axisY;s.length=input.length;s.width=input.width;s.pads=input.pads;
const vx=clamp(input.dx,-.9,.9),vy=clamp(input.dy*metric,-.9,.9),speed=Math.hypot(vx,vy);
const moving=Math.tanh(6.6*speed);
if(speed>.006){s.dirX=vx/speed;s.dirY=vy/speed;}
s.glide=follow(s.glide,moving,dt,.071);
pullX=.040*moving*s.dirX*p*dragTransfer;pullY=.040*moving*s.dirY*p*dragTransfer/metric;
s.tail=follow(s.tail,zone==='tail'?p:0,dt,.11);
}else{
s.held=0;s.glide=follow(s.glide,0,dt,.13);
s.tail=follow(s.tail,0,dt,.19);
}
spring(s,'shearX','shearVX',pullX,dt,4.9,.81);
spring(s,'shearY','shearVY',pullY,dt,4.9,.81);
const shoulder=zone==='tail'?0:1;
s.shoulderX=follow(s.shoulderX,pullX*.42*shoulder,dt,.19);
s.shoulderY=follow(s.shoulderY,pullY*.38*shoulder,dt,.21);
s.active=active;s.head=follow(s.head,p*skull,dt,active?.17:.43);
const catLoad=zone==='tail'?.38:compliance;
spring(s,'load','loadV',catLoad*(.77*Math.pow(p,.75)+.23*smooth(.56,1,p)),dt,4.35,.83);
spring(s,'bulk','bulkV',catLoad*p,dt,2.65,.9);
spring(s,'lift','liftV',active?catLoad*smooth(.19,.78,s.held)*Math.sqrt(p):0,dt,2.75,.87);
this.time+=dt*(quiet?.45:1);
const t=this.time;
s.breath=Math.sin(t*1.66-.22)+.115*Math.sin(t*3.32-.51);
const flick=Math.max(0,Math.sin(t*1.018-.71))**36;
s.earTurn1=.20*flick+.18*s.head*bell((s.x-.132)/.067,(s.y-.33)/.11);
s.earTurn2=-.15*Math.max(0,Math.sin(t*.94-1.11))**38-.15*s.head*bell((s.x-.123)/.07,(s.y-.61)/.10);
s.headAngle=.044*s.head*clamp((s.y-.486)/.104,-1,1)+s.shoulderY*.67+.004*s.breath;
s.headC=Math.cos(s.headAngle)-1;s.headS=Math.sin(s.headAngle);
const grainY=clamp((s.y-.47)*2.1,-.46,.46);
const withGrain=s.dirX+s.dirY*grainY;
s.nap=s.glide*clamp(withGrain+.67*s.dirY*(1-Math.abs(s.dirX)),-1,1);
}
tailMoving(dt){
const t=this.tail,g=this.gesture;
if(t.releaseAngles)return t.curlDuration>0 || t.readyToCurl(dt);
return g.age<g.duration+g.delay;
}
tailPose(dt,quiet=false){
const tail=this.tail,g=this.gesture;
if(tail.readyToCurl(dt)){
const immediate=tail.curlDelay===0;
g.count++;
g.age=0;
g.beats=null;
if(immediate){
const count=Math.random()<.24?3:2;
g.beats=swishBeats(count);
const last=g.beats.at(-1);
g.duration=last.start+last.length;
g.delay=.12+.07*Math.random();
}else{
const seed=Math.random(),sign=Math.random()<.32?-.43:1;
g.duration=1.44+.88*seed;g.delay=.33;
g.turn=sign*(.19+.1*seed+.17*this.state.load);
g.second=-sign*(.036+.048*seed);
}
tail.beginCurl(immediate?1.30:g.duration,immediate?tail.restsAbove:Math.random()<.5);
}
if(g.age<g.duration+g.delay)g.age+=dt*(quiet && !g.beats ? .45:1);
tail.update(dt,(k,base,rest)=>{
const age=g.age-k*g.delay;
if(age<=0 || age>=g.duration)return base;
if(g.beats){
const lift=swishAt(g.beats,age)*smooth(.025,.34,k);
const opposite=(tail.restsAbove?1:-1)*(.24+(.61+.15*k)*rest);
return base+(opposite-base)*lift;
}
const f=clamp(age/g.duration),wave=Math.sin(f*Math.PI)**2;
const turn=(g.turn+g.second*Math.sin(f*2*Math.PI)+.1*this.state.tail)*wave;
return base+(tail.restsAbove?-turn:turn)*smooth(.015,.945,k);
});
}
move(v,trail,out){
const s=this.state,rx=v.x-.269,ry=(v.y-.484)*metric;
let dx=v.head*(rx*s.headC-ry*s.headS-.0015*s.head);
let dy=v.head*((rx*s.headS+ry*s.headC)/metric-.0014*s.head);
dx+=(v.ear1*(.406-v.y)*s.earTurn1+v.ear2*(.552-v.y)*s.earTurn2)*metric;
dy+=(v.ear1*(v.x-.171)*s.earTurn1+v.ear2*(v.x-.161)*s.earTurn2)/metric;
dy+=(v.y-.48)*v.chest*s.breath*.023;
dx+=(v.x-.44)*v.chest*s.breath*.007;
const tissue=v.chest;
dx+=v.travel*tissue*s.shoulderX*(.42+.58*v.head);
dy+=v.travel*tissue*s.shoulderY*(.47+.53*v.head);
let shade=.018*v.chest*s.breath,nap=trail;
if((s.load>.001 || s.lift>.001) && Math.abs(v.x-s.x)<.30 && Math.abs(v.y-s.y)<.47){
const x=v.x-s.x,y=(v.y-s.y)*metric;
const along=x*s.axisX+y*s.axisY,across=-x*s.axisY+y*s.axisX;
const a=along/(s.length+.045),b=across/(s.width+.018);
const patch=bell(a,b),broad=bell(along/.162,across/.136);
const front=x*s.dirX+y*s.dirY,side=-x*s.dirY+y*s.dirX;
const bank=s.glide*bell((front-.068)/.040,side/(s.width+.020));
let fingers=0;
if(Math.abs(x)<.13 && Math.abs(y)<.12){
for(const p of s.pads){
const fx=v.x-p.u,fy=(v.y-p.v)*metric;
const r=p.weight>.3?.049:.023;
if(Math.abs(fx)>r*2 || Math.abs(fy)>r*2)continue;
fingers=Math.max(fingers,p.coverage*bell(fx/r,fy/r));
}
}
const compression=.65*patch+.35*fingers;
const grip=.80*patch+.24*fingers+.47*bank;
const shoulder=broad*(1-compression);
const pressX=grip*s.shearX+compression*s.load*(-.003-.15*x)+.003*broad*s.lift+shoulder*s.bulk*.11*x;
const pressY=grip*s.shearY+compression*s.load*(.042-.21*y/metric)
+broad*(.009*s.bulk-.014*s.lift)+shoulder*s.bulk*.10*y/metric;
dx+=v.travel*pressX;dy+=v.travel*pressY;
const lightSide=clamp((-.80*x-.60*y)/.078,-1.1,1.1);
shade+=s.load*(patch*(-.15-.29*lightSide)-.072*fingers+shoulder*.105*lightSide+bank*(.23+.16*lightSide));
nap+=patch*s.nap*.34+.15*bank;
}
if(v.pale){
const limit=shade>0?.26/(1+4*shade):.47;
shade*=1+v.pale*(limit-1);
nap*=1-.70*v.pale;
}
out[0]=v.x+dx;out[1]=v.y+(this.thickness-1)*v.spread+dy;out[2]=shade;out[3]=nap;
}
draw(view,input,dt=1/60){
if(!this.surface.img)return this.tip;
dt=clamp(Number.isFinite(dt)?dt:1/60,.0001,.075);
this.tick(dt,input,view.reduced);this.tailPose(dt,view.reduced);
const s=this.state,fade=Math.exp(-dt/.84),relax=Math.exp(-dt/this.combRelax),o=this.out;
const deposit=-Math.expm1(-dt*(13+15*s.glide));
const settling=Math.exp(-dt/(this.longCoat?1.95:.92)),bodyStroke=input && input.zone!=='tail';
const grainY=clamp((s.y-.48)*3.5,-1,1),grainLen=Math.hypot(.83,grainY);
const alongGrain=(.83*s.dirX+grainY*s.dirY)/grainLen;
const crossGrain=(.83*s.dirY-grainY*s.dirX)/grainLen;
const acrossWeight=this.longCoat?.47:.18;
const upset=s.load*s.glide*clamp(-1.36*alongGrain+acrossWeight*Math.abs(crossGrain),0,1);
const grooming=-Math.expm1(-dt*(20+18*Math.max(0,alongGrain))*s.glide);
let hasRaised=this.longCoat;
for(let i=0;i<this.vertices.length;i++){
const v=this.vertices[i],x=v.x-s.x,y=(v.y-s.y)*metric;
let raised=this.raised[i]*settling;
let nap=this.trail[i]*fade,cx=this.combX[i]*relax,cy=this.combY[i]*relax;
if(s.active && s.glide>.035 && Math.abs(x)<.20 && Math.abs(y)<.18){
const a=(x*s.axisX+y*s.axisY)/(s.length+.020),b=(-x*s.axisY+y*s.axisX)/(s.width+.014);
const mark=bell(a,b);
const set=deposit*mark;
if(!this.longCoat && bodyStroke){
raised+=(upset*v.pile-raised)*mark*grooming;
}else if(v.pile && bodyStroke){
let fingers=0;
for(const pad of s.pads){
if(pad.weight>.3)continue;
const px=(v.x-pad.u)/.026,py=(v.y-pad.v)*metric/.026;
if(Math.abs(px)<2 && Math.abs(py)<2)fingers=Math.max(fingers,pad.coverage*bell(px,py));
}
const contact=Math.max(.48*mark,fingers);
raised+=(upset*v.pile-raised)*contact*grooming;
}
nap+=(s.nap*s.load*1.65-nap)*set;
cx+=(s.shearX*this.combTravel-cx)*set;cy+=(s.shearY*this.combTravel-cy)*set;
}
this.raised[i]=raised;
if(raised>.001)hasRaised=true;
this.trail[i]=nap;this.combX[i]=cx;this.combY[i]=cy;
this.move(v,nap,o);const j=i*2;
this.xy[j]=o[0]+v.travel*cx;this.xy[j+1]=o[1]+v.travel*cy;this.light[j]=o[2];this.light[j+1]=o[3];
}
if(this.guardFlow){
this.guardBase.set(this.xy);
for(let i=0;i<this.raised.length;i++){
const amount=this.raised[i];
if(amount<.001)continue;
const j=2*i,v=this.vertices[i],x=v.x+amount*this.guardFlow[j],y=v.y+amount*this.guardFlow[j+1];
this.xy[j]=this.surface.sample(this.guardBase,x,y,0);
this.xy[j+1]=this.surface.sample(this.guardBase,x,y,1);
}
}
this.socket.update(this.surface,this.xy,this.light);
this.hasMesh=true;
this.surface.draw(view,this.xy,this.light,this.raised,hasRaised,!input && this.tailMoving(0));
if(this.canvas.width!==this.body.width || this.canvas.height!==this.body.height){
this.canvas.width=this.body.width;this.canvas.height=this.body.height;
}
const g=this.ink;
g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,this.canvas.width,this.canvas.height);
g.setTransform(view.dpr,0,0,view.dpr,0,0);this.tailPhoto.draw(g,view,this.tail,this.socket);
g.setTransform(1,0,0,1,0,0);g.drawImage(this.body,0,0);
this.move(this.weights(input?.u??s.x,input?.v??s.y),0,o);
const tip=this.tip;
tip.u=o[0];tip.v=o[1];tip.load=clamp(s.load);tip.lift=clamp(s.lift);
tip.depth=skinTravel(skullAt(s.x))*Math.max(0,.042*s.load+.009*s.bulk-.014*s.lift)*(view.h??view.height);
return tip;
}
}
return {OverheadCat};})();
const {sleeveReach,HandLayer}=(()=>{
function sleeveReach(hand,view,left,right){
const a=new Float64Array(2),b=new Float64Array(2);
hand.point(left,1535,a);hand.point(right,1535,b);
if(Math.max(a[0],b[0])<0 || Math.min(a[0],b[0])>view.width)return 0;
let minY=Infinity;
if(a[0]>=0 && a[0]<=view.width)minY=a[1];
if(b[0]>=0 && b[0]<=view.width)minY=Math.min(minY,b[1]);
for(const side of [0,view.width]){
const t=(side-a[0])/(b[0]-a[0]);
if(t>=0 && t<=1)minY=Math.min(minY,a[1]+(b[1]-a[1])*t);
}
return Math.max(0,view.height+3-minY);
}
class HandLayer{
constructor(){
this.skin=doc.createElement('canvas');this.tint=doc.createElement('canvas');
this.ink=this.skin.getContext('2d');this.small=this.tint.getContext('2d');
}
draw(ctx,view,paint,altitude){
const w=view.width,h=view.height,d=view.dpr;
const W=Math.round(w*d),H=Math.round(h*d);
if(this.skin.width!==W || this.skin.height!==H){
this.skin.width=W;this.skin.height=H;
this.tint.width=Math.max(1,Math.round(w*.34));this.tint.height=Math.max(1,Math.round(h*.34));
}
const g=this.ink,q=this.small;
g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,W,H);g.setTransform(d,0,0,d,0,0);
g.save();paint(g);g.restore();
const sw=this.tint.width,sh=this.tint.height;
q.clearRect(0,0,sw,sh);q.filter='blur('+Math.max(.72,w*.0013)+'px)';
q.drawImage(this.skin,0,0,sw,sh);q.filter='none';
q.globalCompositeOperation='source-in';q.fillStyle='#37271d';q.fillRect(0,0,sw,sh);
q.globalCompositeOperation='source-over';
ctx.save();ctx.globalAlpha=.21;
ctx.drawImage(this.tint,w*(.003+.004*altitude),w*(.004+.008*altitude),w,h);
ctx.globalAlpha=.28*(1-altitude);ctx.drawImage(this.tint,w*.0008,w*.00155,w,h);
ctx.restore();ctx.drawImage(this.skin,0,0,w,h);
}
}
return {sleeveReach,HandLayer};})();
const {OverheadHand}=(()=>{
const pad = [169,119];
const wrist = [429,572];
const artWidth = 1024, artHeight = 1536;
const sizeRatio = .5166;
const clamp = (x,lo=0,hi=1) => Math.max(lo,Math.min(hi,x));
const smooth = (a,b,x) => { const t=clamp((x-a)/(b-a)); return t*t*(3-2*t); };
const xs = [0,62,101,146,193,247,317,381,453,538,638,785,916,1024];
const ys = [0,67,91,113,137,169,213,278,351,434,522,618,729,854,1004,1191,1375,1536];
const nx = xs.length, ny = ys.length;
function canvas(w,h) {
const c=doc.createElement('canvas');c.width=w;c.height=h;return c;
}
function shadowMasks(photo) {
const w=300,h=450,margin=15;
const shapes=[];
for(const upper of [false,true]){
const shape=canvas(w,h),s=shape.getContext('2d');
s.drawImage(photo,0,0,w,h);
s.globalCompositeOperation='source-in';
const gradient=s.createLinearGradient(0,0,0,h);
gradient.addColorStop(0,upper?'#39291c':'transparent');
gradient.addColorStop(.36,upper?'#39291c':'transparent');
gradient.addColorStop(.53,upper?'transparent':'#39291c');
gradient.addColorStop(1,upper?'transparent':'#39291c');
s.fillStyle=gradient;s.fillRect(0,0,w,h);
const soft=canvas(w+2*margin,h+2*margin),ctx=soft.getContext('2d');
ctx.filter='blur(2.8px)';ctx.drawImage(shape,margin,margin);
const tight=canvas(w+2*margin,h+2*margin),tc=tight.getContext('2d');
tc.filter='blur(.85px)';tc.drawImage(shape,margin,margin);
shapes.push({soft,tight,upper,margin:margin*artWidth/w});
}
return shapes;
}
const baseDigits=[
{m:[250,310],p:[166,231],tip:[93,162],splay:-.225,curl:.98},
{m:[306,294],p:[217,179],tip:[145,102],splay:-.064,curl:.74},
{m:[359,270],p:[297,160],tip:[217,90],splay:.071,curl:1.02},
{m:[414,267],p:[391,185],tip:[338,122],splay:.232,curl:1.24},
{m:[207,473],p:[140,415],tip:[84,350],splay:-.24,curl:.81}
];
function poseDigits(tips){
return baseDigits.map((f,i)=>{
const tip=tips?.[i]??f.tip,dx=tip[0]-f.m[0],dy=tip[1]-f.m[1],length=Math.hypot(dx,dy);
return {...f,tip,ax:dx/length,ay:dy/length,prox:Math.hypot(f.p[0]-f.m[0],f.p[1]-f.m[1])};
});
}
const smallHand={
size:0.87,anchor:[305,323],tips:[[90,157],[144,97],[217,84],[340,120],[83,350]],
thumb:[[0,320],[148,320],[181,376],[214,437],[232,465],[246,514],[0,514]],
gaps:[
[0,50,123,284],[77,66,163,292],[90,75,176,293],[100,83,185,293],[111,90,195,303],[126,100,210,308],
[141,113,228,318],[150,122,239,328],[160,136,252,340],[175,155,268,352],[185,164,276,356],[198,178,285,363],
[211,196,294,372],[235,214,309,381],[259,231,328,394],[278,245,356,406],[300,275,361,424],[320,292,375,431]
]
};
function separateFingers(photo,fingers,gapRows,thumb){
const palm=canvas(artWidth,artHeight),p=palm.getContext('2d');
p.drawImage(photo,0,0);p.clearRect(0,0,artWidth,270);
p.globalCompositeOperation='destination-out';
const melt=p.createLinearGradient(0,270,0,319);
melt.addColorStop(0,'#000');melt.addColorStop(1,'transparent');
p.fillStyle=melt;p.fillRect(0,270,artWidth,51);
p.fillStyle='#000';
const polygons=fingers.slice(0,4).map((_,i)=>{
const left=gapRows.map(row=>[i===0?0:row[i],row[0]]);
const right=gapRows.map(row=>[i===3?535:row[i+1],row[0]]);
return left.concat(right.reverse());
});
polygons.push(thumb??[[0,320],[150,320],[184,376],[213,437],[227,464],[246,514],[0,514]]);
function path(ctx,pts){
ctx.beginPath();pts.forEach(([x,y],i)=>{if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});ctx.closePath();
}
p.globalCompositeOperation='destination-out';path(p,polygons[4].map(([x,y])=>[Math.max(0,x-2),Math.min(509,y)]));p.fill();
const parts=polygons.map((poly,i)=>{
const left=Math.floor(Math.min(...poly.map(v=>v[0]))), top=Math.floor(Math.min(...poly.map(v=>v[1])));
const right=Math.ceil(Math.max(...poly.map(v=>v[0]))), bottom=Math.ceil(Math.max(...poly.map(v=>v[1])));
const img=canvas(right-left,bottom-top),ctx=img.getContext('2d');
ctx.translate(-left,-top);path(ctx,poly);ctx.clip();ctx.drawImage(photo,0,0);
const pixels=ctx.getImageData(0,0,img.width,img.height).data;
const grid=[],triangles=[];
const cols=Math.ceil(img.width/31),rows=Math.ceil(img.height/29);
for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++)grid.push([left+img.width*x/cols,top+img.height*y/rows]);
for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
let opaque=false;
const x1=Math.min(img.width-1,Math.ceil((x+1)*img.width/cols));
const y1=Math.min(img.height-1,Math.ceil((y+1)*img.height/rows));
for(let iy=Math.floor(y*img.height/rows);iy<=y1&&!opaque;iy+=2)
for(let ix=Math.floor(x*img.width/cols);ix<=x1;ix+=2)
if(pixels[(iy*img.width+ix)*4+3]>1){opaque=true;break}
if(opaque){
const j=y*(cols+1)+x;
triangles.push([j,j+1,j+cols+1],[j+cols+1,j+1,j+cols+2]);
}
}
const f=fingers[i],tones=[img];
for(let n=1;n<=6;n++){
const tint=canvas(img.width,img.height),tc=tint.getContext('2d');
tc.drawImage(img,0,0);tc.globalCompositeOperation='source-atop';
const wash=tc.createLinearGradient(f.tip[0]-left,f.tip[1]-top,f.m[0]-left,f.m[1]-top);
wash.addColorStop(0,'rgba(77,44,34,'+(.18*n/6)+')');wash.addColorStop(.45,'rgba(91,51,39,'+(.08*n/6)+')');
wash.addColorStop(.67,'rgba(255,240,214,'+(.055*n/6)+')');wash.addColorStop(1,'rgba(255,240,214,0)');
tc.fillStyle=wash;tc.fillRect(0,0,img.width,img.height);tones.push(tint);
}
return {tones,left,top,grid,triangles,out:new Float64Array(2*grid.length),digit:i};
});
return {palm,parts};
}
function digitShadow(photo){
const ratio=.36,margin=40,w=Math.ceil((photo.width+2*margin)*ratio),h=Math.ceil((photo.height+2*margin)*ratio);
const mask=canvas(w,h),c=mask.getContext('2d');
c.drawImage(photo,margin*ratio,margin*ratio,photo.width*ratio,photo.height*ratio);
c.globalCompositeOperation='source-in';c.fillStyle='#39291c';c.fillRect(0,0,w,h);
const blurred=radius=>{
const img=canvas(w,h),ctx=img.getContext('2d');
ctx.filter='blur('+radius+'px)';ctx.drawImage(mask,0,0);return img;
};
return {soft:blurred(2.9),tight:blurred(.72),margin,w:w/ratio,h:h/ratio};
}
class OverheadHand {
constructor(){
this.profile=smallHand;
this.fingers=poseDigits(this.profile.tips);
}
load(img) {
this.photo=img;
Object.assign(this,separateFingers(img,this.fingers,this.profile.gaps,this.profile.thumb));
this.shadows=shadowMasks(img);
this.baseShadows=shadowMasks(this.palm);
for(const part of this.parts)part.shadow=digitShadow(part.tones[0]);
const small=canvas(320,480),ctx=small.getContext('2d',{willReadFrequently:true});
ctx.drawImage(img,0,0,small.width,small.height);
const data=ctx.getImageData(0,0,small.width,small.height).data;
const scale=small.width/artWidth;
this.cells=[];
for(let r=0;r<ny-1;r++){
for(let c=0;c<nx-1;c++){
const x0=Math.max(0,Math.floor(xs[c]*scale)-1);
const x1=Math.min(small.width-1,Math.ceil(xs[c+1]*scale)+1);
const y0=Math.max(0,Math.floor(ys[r]*scale)-1);
const y1=Math.min(small.height-1,Math.ceil(ys[r+1]*scale)+1);
let occupied=false;
for(let y=y0;y<=y1 && !occupied;y++){
for(let x=x0;x<=x1;x++)if(data[4*(y*small.width+x)+3]>2){occupied=true;break;}
}
if(occupied)this.cells.push([r,c]);
}
}
this.points=new Float64Array(2*nx*ny);
this.q=new Float64Array(2);
return this;
}
configure(view,p) {
this.transition=null;this.sleeveDrop=0;
this.scale=view.handWidth*sizeRatio*this.profile.size/artWidth*(1+.034*clamp(p.altitude??0));
this.px=p.x;this.py=p.y;
this.load=clamp(p.load??p.pressure??0);
this.altitude=clamp(p.altitude??0);this.lift=clamp(p.lift??0);
this.dx=clamp(p.motionX||0,-1,1);this.dy=clamp(p.motionY||0,-1,1);
const yaw=.013+clamp(p.angle||0,-.48,.48)+.033*this.dx;
this.cs=Math.cos(yaw);this.sn=Math.sin(yaw);
const at=(p.x-(view.x??0))/(view.w??view.width);
const counter=clamp((at-.346)*.87+.16*this.dx,-.32,.46);
const fore=.013+.37*(yaw-.013)+counter+.017*this.lift;
this.ac=Math.cos(fore);this.as=Math.sin(fore);
const ux=wrist[0]-pad[0],uy=wrist[1]-pad[1];
this.wx=this.cs*ux-this.sn*uy;this.wy=this.sn*ux+this.cs*uy;
this.tuck=clamp(p.tuck??0,-1,1);
const pressure=clamp(p.pressure??0), firm=smooth(.50,.98,pressure);
this.articulated=!p.rest || pressure>.18;
if(this.articulated){
const bearing=smooth(.04,.54,pressure)*(1-.89*this.altitude);
const open=bearing*(.78+.16*firm-.50*this.tuck)-.20*this.altitude;
const flex=clamp(.15+.53*Math.max(0,this.tuck)-.15*Math.max(0,-this.tuck)
+.25*firm+.48*this.altitude,0,1);
this.joints=this.fingers.map((f,i)=>{
const side=(i-1.5)*.025*this.dx*bearing;
const angle=f.splay*open+side+.046*(this.dx-.49*this.dy)*bearing;
return {co:Math.cos(angle),si:Math.sin(angle),flex,
first:-.16*flex*f.curl+.023*open,
second:-.60*flex*f.curl+.052*open,wide:.029*bearing,
slipX:-(19+3*i)*this.dx*bearing,slipY:-(15+2*i)*this.dy*bearing};
});
}
if(this.articulated){
this.point(this.profile.anchor[0],this.profile.anchor[1],this.q);
const settling=Math.min(view.h*.013,(p.depth??0)*.36)*(1-this.altitude);
this.px+=p.x-this.q[0];this.py+=p.y-this.q[1]+settling;
if(p.coat)this.seatOnEdge(p,view);else this.seat=null;
}else this.seat=null;
this.sleeveDrop=sleeveReach(this,view,459,922);
}
seatOnEdge(p,view){
const W=view.w;
const reachWidth=view.kitten?(view.baseW??W):W;
const pad=p.pad??{u:(p.x-view.x)/W,v:(p.y-view.y)/view.h};
let {u,v}=pad;
let offsetX=0,offsetY=0;
if(view.kitten){
const f=this.fingers[1];
this.digitPoint(f.tip[0],f.tip[1],1,this.q);this.point(this.q[0],this.q[1],this.q);
const x=p.x+(this.q[0]-p.x)*.72,y=p.y+(this.q[1]-p.y)*.72;
u=(x-view.x)/W;v=(y-view.y)/view.h;
offsetX=p.x-x;offsetY=p.y-y;
}
const edge=p.coat.handEdge(u,v,pad.u,pad.v);
if(!edge){this.seat=null;return;}
const {nx,ny}=edge;
const clearance=Math.max(0,(edge.inside?edge.distance:-edge.distance)*W+offsetX*nx+offsetY*ny);
let dx=0,dy=0;
if(clearance<.14*reachWidth){
const anchor=this.profile.anchor;
this.point(anchor[0],anchor[1],this.q);
const x=this.q[0],y=this.q[1];
let lead=0,side=0,weight=0;
for(let i=0;i<4;i++){
const f=this.fingers[i];
this.digitPoint(f.tip[0],f.tip[1],i,this.q);this.point(this.q[0],this.q[1],this.q);
const ax=this.q[0]-x,ay=this.q[1]-y,out=-nx*ax-ny*ay;
const k=Math.exp(out/(W*.016));
lead=Math.max(lead,out);side+=k*(-ny*ax+nx*ay);weight+=k;
}
if(lead>W*.009){
const shift=Math.max(0,lead-clearance+this.scale*4);
const drift=(side/weight)*smooth(0,1,shift/lead)*.78;
const neck=p.coat.neckWeight(p.pad?.u??(p.x-view.x)/W);
const bearing=1-neck*(1-smooth(.009,.072,lead/W));
dx=bearing*(nx*shift+ny*drift)/W;dy=bearing*(ny*shift-nx*drift)/W;
}
}
const last=this.seat?.kitten===view.kitten?this.seat:null;
const travel=last?Math.hypot(p.x-last.px,p.y-last.py):Infinity;
const reposition=travel/reachWidth>.12;
let f=reposition?1:-Math.expm1(-p.dt/.063);
if(!reposition && view.kitten){
const correction=W*Math.hypot(dx-last.x,dy-last.y);
const allowance=.105*reachWidth*p.dt+.25*travel;
if(correction*f>allowance)f=allowance/correction;
}
const seatX=(last?.x??dx)+(dx-(last?.x??dx))*f;
const seatY=(last?.y??dy)+(dy-(last?.y??dy))*f;
this.seat={x:seatX,y:seatY,px:p.x,py:p.y,kitten:view.kitten};
this.px+=seatX*W;this.py+=seatY*W;
}
contacts(){
const pads=this.fingers.map((f,i)=>{
const x=f.tip[0]+(f.p[0]-f.tip[0])*.24,y=f.tip[1]+(f.p[1]-f.tip[1])*.24;
if(this.articulated){this.digitPoint(x,y,i,this.q);this.point(this.q[0],this.q[1],this.q);}
else this.point(x,y,this.q);
return {x:this.q[0],y:this.q[1],weight:[.14,.19,.18,.10,.065][i]};
});
this.point(this.profile.anchor[0],this.profile.anchor[1],this.q);
pads.push({x:this.q[0],y:this.q[1],weight:.325});
return pads;
}
digitPoint(x,y,id,out){
const f=this.fingers[id],j=this.joints[id];
const dx=x-f.m[0],dy=y-f.m[1],along=f.ax*dx+f.ay*dy;
const gain=smooth(-8,67,along);
const boundary=id===4?1-smooth(462,512,y):1-smooth(274,319,y);
const amt=gain*boundary;
const flex=along*j.first+Math.max(0,along-f.prox)*(j.second-j.first);
const cross=-f.ay*dx+f.ax*dy;
const bx=dx+f.ax*flex-f.ay*cross*j.wide,by=dy+f.ay*flex+f.ax*cross*j.wide;
const friction=amt*clamp(along/(f.prox*1.8));
const bend=j.flex*Math.sin(Math.PI*clamp(along/(f.prox*1.88)))*7*f.curl;
out[0]=x+amt*(j.co*bx-j.si*by-dx+f.ay*bend)+friction*j.slipX;
out[1]=y+amt*(j.si*bx+j.co*by-dy-f.ax*bend)+friction*j.slipY;
}
point(x,y,out,offset=0) {
let u=x-pad[0],v=y-pad[1];
const distal=1-smooth(135,495,y),flex=this.load-.16;
u+=flex*distal*.042*(x-pad[0]);
v+=flex*distal*.048*(y-pad[1]);
const knuckle=smooth(140,350,y)*(1-smooth(400,580,y));
u+=knuckle*(this.dx*11-flex*4.3);
v+=knuckle*(this.dy*9-flex*8.3+this.lift*8);
const hx=this.cs*u-this.sn*v,hy=this.sn*u+this.cs*v;
const wx=x-wrist[0],wy=y-wrist[1];
const sx=this.wx+this.ac*wx-this.as*wy,sy=this.wy+this.as*wx+this.ac*wy;
const blend=smooth(465,785,y+.29*(x-wrist[0]));
out[offset]=this.px+this.scale*(hx+(sx-hx)*blend);
out[offset+1]=this.py+this.scale*(hy+(sy-hy)*blend);
if(this.sleeveDrop && y>680)out[offset+1]+=this.sleeveDrop*smooth(680,1535,y);
if(this.transition)this.transition.project(out,offset);
}
digitShadows(ctx){
const k=this.scale,a=this.altitude;
for(const part of this.parts){
const f=this.fingers[part.digit],root=f.m,tip=f.tip;
const u=tip[0]-root[0],v=tip[1]-root[1],s=-f.ay*40,t=f.ax*40,det=u*t-v*s;
this.digitPoint(root[0],root[1],part.digit,this.q);this.point(this.q[0],this.q[1],this.q);
const x=this.q[0],y=this.q[1];
this.digitPoint(tip[0],tip[1],part.digit,this.q);this.point(this.q[0],this.q[1],this.q);
const X=this.q[0]-x,Y=this.q[1]-y;
this.digitPoint(root[0]+s,root[1]+t,part.digit,this.q);this.point(this.q[0],this.q[1],this.q);
const Z=this.q[0]-x,W=this.q[1]-y;
const m=(X*t-Z*v)/det,n=(Y*t-W*v)/det,o=(Z*u-X*s)/det,d=(W*u-Y*s)/det;
const {soft,tight,margin,w,h}=part.shadow;
const left=part.left-margin,top=part.top-margin,tx=x-m*root[0]-o*root[1],ty=y-n*root[0]-d*root[1];
ctx.save();ctx.globalAlpha=.27-.08*a;ctx.transform(m,n,o,d,tx+k*(8+22*a),ty+k*(13+32*a));
ctx.drawImage(soft,left,top,w,h);ctx.restore();
ctx.save();ctx.globalAlpha=(.31+.18*this.load)*(1-a)*(1-a);
ctx.transform(m,n,o,d,tx+k*2.6,ty+k*4);ctx.drawImage(tight,left,top,w,h);ctx.restore();
}
}
shade(ctx,visibility) {
const a=this.altitude,k=this.scale,level=this.load;
ctx.save();
if(this.articulated)this.digitShadows(ctx);
for(const {soft,tight,upper,margin} of (this.articulated?this.baseShadows:this.shadows)){
const co=upper?this.cs:this.ac,si=upper?this.sn:this.as;
const ax=upper?pad[0]:wrist[0],ay=upper?pad[1]:wrist[1];
const tx=upper?this.px:this.px+k*this.wx,ty=upper?this.py:this.py+k*this.wy;
ctx.save();ctx.translate(tx,ty);ctx.transform(k*co,k*si,-k*si,k*co,0,0);
const w=artWidth+2*margin,h=artHeight+2*margin;
const left=-ax-margin,top=-ay-margin;
const far=upper?1:1.42;
ctx.globalAlpha*=visibility*(upper?.28:.19)*(1-.30*a);
ctx.drawImage(soft,left+(9+18*a)*far,top+(13+29*a)*far,w,h);
ctx.restore();
ctx.save();ctx.translate(tx,ty);ctx.transform(k*co,k*si,-k*si,k*co,0,0);
ctx.globalAlpha*=visibility*(upper?.32+.15*level:.09)*(1-a)*(1-a);
ctx.drawImage(tight,left+2.8,top+4.1,w,h);
ctx.restore();
}
ctx.restore();
}
triangle(ctx,ia,ib,ic,src,texture) {
const q=this.points;
const i=ia*2,j=ib*2,k=ic*2;
const x=xs[ia%nx],y=ys[Math.floor(ia/nx)],u=xs[ib%nx]-x,v=ys[Math.floor(ib/nx)]-y;
const s=xs[ic%nx]-x,t=ys[Math.floor(ic/nx)]-y;
const det=u*t-v*s,X=q[j]-q[i],Y=q[j+1]-q[i+1],Z=q[k]-q[i],W=q[k+1]-q[i+1];
const m=(X*t-Z*v)/det,n=(Y*t-W*v)/det,b=(Z*u-X*s)/det,d=(W*u-Y*s)/det;
const cx=(q[i]+q[j]+q[k])/3,cy=(q[i+1]+q[j+1]+q[k+1])/3;
ctx.save();ctx.beginPath();
for(const h of [i,j,k]){
const ex=q[h]-cx,ey=q[h+1]-cy,over=.68/Math.max(1,Math.hypot(ex,ey));
const px=q[h]+ex*over,py=q[h+1]+ey*over;
if(h===i)ctx.moveTo(px,py);else ctx.lineTo(px,py);
}
ctx.closePath();ctx.clip();ctx.transform(m,n,b,d,q[i]-m*x-b*y,q[i+1]-n*x-d*y);
ctx.drawImage(texture,...src,...src);ctx.restore();
}
drawDigits(ctx){
for(const part of this.parts){
const {left,top,grid,triangles,tones,out,digit}=part;
const img=tones[Math.round(6*this.joints[digit].flex)];
for(let i=0;i<grid.length;i++){
this.digitPoint(grid[i][0],grid[i][1],digit,this.q);
this.point(this.q[0],this.q[1],out,2*i);
}
for(const [ia,ib,ic] of triangles){
const a=ia*2,b=ib*2,c=ic*2;
const p=grid[ia],u=grid[ib][0]-p[0],v=grid[ib][1]-p[1];
const h=grid[ic][0]-p[0],s=grid[ic][1]-p[1];
const det=u*s-v*h,X=out[b]-out[a],Y=out[b+1]-out[a+1],Z=out[c]-out[a],W=out[c+1]-out[a+1];
const m=(X*s-Z*v)/det,n=(Y*s-W*v)/det,o=(Z*u-X*h)/det,d=(W*u-Y*h)/det;
const cx=(out[a]+out[b]+out[c])/3,cy=(out[a+1]+out[b+1]+out[c+1])/3;
ctx.save();ctx.beginPath();
for(const i of [a,b,c]){
const dx=out[i]-cx,dy=out[i+1]-cy,add=.54/Math.max(1,Math.hypot(dx,dy));
if(i===a)ctx.moveTo(out[i]+dx*add,out[i+1]+dy*add);
else ctx.lineTo(out[i]+dx*add,out[i+1]+dy*add);
}
ctx.closePath();ctx.clip();ctx.transform(m,n,o,d,out[a]-m*p[0]-o*p[1],out[a+1]-n*p[0]-d*p[1]);
const x0=Math.min(p[0],grid[ib][0],grid[ic][0]),y0=Math.min(p[1],grid[ib][1],grid[ic][1]);
const lx=Math.max(left,Math.floor(x0)-2),ly=Math.max(top,Math.floor(y0)-2);
const w=Math.min(left+img.width-lx,Math.ceil(Math.max(Math.abs(u),Math.abs(h)))+5);
const hh=Math.min(top+img.height-ly,Math.ceil(Math.max(Math.abs(v),Math.abs(s)))+5);
ctx.drawImage(img,lx-left,ly-top,w,hh,lx,ly,w,hh);ctx.restore();
}
}
}
drawSkin(ctx) {
for(let r=0;r<ny;r++)for(let c=0;c<nx;c++)this.point(xs[c],ys[r],this.points,2*(r*nx+c));
ctx.save();
if(this.articulated)this.drawDigits(ctx);
this.drawPalm(ctx,this.articulated?this.palm:this.photo);
ctx.restore();
}
drawPalm(ctx,texture) {
for(const [r,c] of this.cells){
if(this.articulated && ys[r+1]<318)continue;
const left=Math.max(0,xs[c]-4),top=Math.max(0,ys[r]-4);
const right=Math.min(artWidth,xs[c+1]+4),bottom=Math.min(artHeight,ys[r+1]+4);
const box=[left,top,right-left,bottom-top],i=r*nx+c;
this.triangle(ctx,i,i+1,i+nx,box,texture);this.triangle(ctx,i+nx,i+1,i+nx+1,box,texture);
}
}
draw(ctx){
if(!this.photo)return;
if(!this.transition)this.shade(ctx,1);
this.drawSkin(ctx);
}
}
return {OverheadHand};})();
const {TailHand}=(()=>{
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ease=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
const layout={cx:452,cy:204,size:.87,wrist:[544,623],bottom:[423,828],
tips:[[336,120],[421,98],[519,110],[606,134],[253,188]],
knuckles:[[357,257],[458,239],[551,241],[640,267],[238,278]],
arm:[[472,373],[544,623],[560,703],[608,1050],[629,1460],[296,392],[428,718],[676,679]]
};
function surface(w,h){
const c=doc.createElement('canvas');c.width=w;c.height=h;return c;
}
const xs=[0,176,226,266,311,354,394,439,486,531,576,622,666,718,824,930,1024];
const ys=[0,67,97,126,156,191,230,274,329,401,489,556,624,702,834,1040,1270,1536];
const closedScale=.83;
class TailHand{
constructor(){this.layout=layout;this.angle=0;}
load(photo){
this.photo=photo;
const tiny=surface(128,192),c=tiny.getContext('2d',{willReadFrequently:true});
c.drawImage(photo,0,0,128,192);const pix=c.getImageData(0,0,128,192).data;
this.grid=[];this.spans=[];
for(const y of ys)for(const x of xs)this.grid.push([x,y]);
for(let j=0;j<ys.length-1;j++)for(let i=0;i<xs.length-1;i++){
let occupied=false;
for(let y=Math.max(0,(ys[j]>>3)-1);y<Math.min(192,Math.ceil(ys[j+1]/8)+1)&&!occupied;y++)
for(let x=Math.max(0,(xs[i]>>3)-1);x<Math.min(128,Math.ceil(xs[i+1]/8)+1);x++){
if(pix[(128*y+x)*4+3]>2){occupied=true;break;}
}
if(occupied){
const last=this.spans.at(-1);
if(last && last.row===j && last.end===i)last.end=i+1;
else this.spans.push({row:j,start:i,end:i+1});
}
}
this.xy=new Float64Array(this.grid.length*2);this.q=new Float64Array(2);
return this;
}
configure(view,p,x,y,amount,pressure,slide,dt){
const l=this.layout;this.x=x;this.y=y;this.k=view.handWidth*.5166*l.size*closedScale/1024;
this.transition=null;this.sleeveDrop=0;this.dpr=view.dpr||1;
const target=.24*p.ty+.026*Math.tanh(slide*4),f=1-Math.exp(-dt/.09);
if(amount<.07)this.angle=target;else this.angle+=(target-this.angle)*f;
this.c=Math.cos(this.angle);this.s=Math.sin(this.angle);
const fore=.53*this.angle+ease((p.u-.79)/.20)*.12;
this.ca=Math.cos(fore);this.sa=Math.sin(fore);
const wx=l.wrist[0]-l.cx,wy=l.wrist[1]-l.cy;
this.wx=this.c*wx-this.s*wy;this.wy=this.s*wx+this.c*wy;
const diameter=2*p.feltRadius*view.w/this.k;
this.fold=(1-amount)*-22+amount*(clamp((125-diameter)*.23,-13,20)+pressure*6);
const along=p.tx*this.c+p.ty*this.s,cross=p.ty*this.c-p.tx*this.s;
const edge=p.upperFur*view.w;
const reach=(edge+Math.abs(cross)*130*this.k)/Math.max(.65,along);
const cover=(78-this.fold)*this.k;
const lift=clamp(reach-cover,0,edge*.87)*ease((along-.25)/.55)*ease(amount);
this.x+=this.s*lift;this.y-=this.c*lift;
this.closing=4*amount*(1-amount);
this.slide=clamp(slide*16,-7,7)*amount;
this.sleeveDrop=sleeveReach(this,view,...l.bottom);
}
point(x,y,out,i=0){
const l=this.layout,dx=x-l.cx;
const knuckles=1-ease((y-l.cy+36)/173);
const thumb=1-ease((x-l.cx+180)/87);
const fold=this.fold-this.closing*9*ease((x-366)/225);
const px=dx+knuckles*(thumb*.65*fold-.045*dx*fold/20-this.slide);
const py=y-l.cy+knuckles*fold*(1-.55*thumb);
const hx=this.c*px-this.s*py,hy=this.s*px+this.c*py;
const sx=x-l.wrist[0],sy=y-l.wrist[1],arm=ease((y+.20*sx-553)/240);
out[i]=this.x+this.k*(hx+(this.wx+(this.ca*sx-this.sa*sy)/closedScale-hx)*arm);
out[i+1]=this.y+this.k*(hy+(this.wy+(this.sa*sx+this.ca*sy)/closedScale-hy)*arm);
if(this.sleeveDrop && y>680)out[i+1]+=this.sleeveDrop*ease((y-680)/855);
if(this.transition)this.transition.project(out,i);
}
triangle(ctx,ia,ib,ic){
const [ax,ay]=this.grid[ia],[bx,by]=this.grid[ib],[cx,cy]=this.grid[ic];
const uvx=bx-ax,uvy=by-ay,px=cx-ax,py=cy-ay,det=uvx*py-uvy*px;
const o=this.xy,A=ia*2,B=ib*2,C=ic*2,X=o[B]-o[A],Y=o[B+1]-o[A+1],Z=o[C]-o[A],V=o[C+1]-o[A+1];
const m=(X*py-Z*uvy)/det,n=(Y*py-V*uvy)/det,b=(Z*uvx-X*px)/det,d=(V*uvx-Y*px)/det;
const mx=(o[A]+o[B]+o[C])/3,my=(o[A+1]+o[B+1]+o[C+1])/3;
ctx.save();ctx.beginPath();
for(const h of [A,B,C]){
const vx=o[h]-mx,vy=o[h+1]-my,g=.64/Math.max(1,Math.hypot(vx,vy));
if(h===A)ctx.moveTo(o[h]+vx*g,o[h+1]+vy*g);else ctx.lineTo(o[h]+vx*g,o[h+1]+vy*g);
}
ctx.closePath();ctx.clip();ctx.transform(m,n,b,d,o[A]-m*ax-b*ay,o[A+1]-n*ax-d*ay);
const left=Math.max(0,Math.min(ax,bx,cx)-2),top=Math.max(0,Math.min(ay,by,cy)-2);
const w=Math.min(1024,Math.max(ax,bx,cx)+2)-left,h=Math.min(1536,Math.max(ay,by,cy)+2)-top;
ctx.drawImage(this.photo,left,top,w,h,left,top,w,h);ctx.restore();
}
drawSpan(ctx,row,start,end){
const xy=this.xy,stride=xs.length*2,A=row*stride+2*start,B=row*stride+2*end;
const C=A+stride,D=B+stride,x=xs[start],y=ys[row],w=xs[end]-x,h=ys[row+1]-y;
const m=(xy[B]-xy[A]+xy[D]-xy[C])/(2*w),n=(xy[B+1]-xy[A+1]+xy[D+1]-xy[C+1])/(2*w);
const b=(xy[C]-xy[A]+xy[D]-xy[B])/(2*h),d=(xy[C+1]-xy[A+1]+xy[D+1]-xy[B+1])/(2*h);
const ax=(xy[A]+xy[B]+xy[C]+xy[D])*.25-(m*w+b*h)*.5;
const ay=(xy[A+1]+xy[B+1]+xy[C+1]+xy[D+1])*.25-(n*w+d*h)*.5;
const tolerance=.18/this.dpr;
for(let col=start;col<=end;col++){
const i=A+(col-start)*2,dx=xs[col]-x,px=ax+dx*m,py=ay+dx*n;
if(Math.abs(px-xy[i])>tolerance || Math.abs(py-xy[i+1])>tolerance ||
Math.abs(px+b*h-xy[i+stride])>tolerance || Math.abs(py+d*h-xy[i+stride+1])>tolerance){
if(end>start+1){
const mid=(start+end)>>1;
this.drawSpan(ctx,row,start,mid);this.drawSpan(ctx,row,mid,end);
}else{
const v=A/2;this.triangle(ctx,v,v+1,v+xs.length);this.triangle(ctx,v+xs.length,v+1,v+xs.length+1);
}
return;
}
}
const pad=.65/(this.k*this.dpr);
const left=Math.max(0,x-pad),top=Math.max(0,y-pad);
const width=Math.min(1024,x+w+pad)-left,height=Math.min(1536,y+h+pad)-top;
ctx.save();ctx.transform(m,n,b,d,ax-m*x-b*y,ay-n*x-d*y);
ctx.drawImage(this.photo,left,top,width,height,left,top,width,height);ctx.restore();
}
drawSkin(ctx){
for(let i=0;i<this.grid.length;i++)this.point(this.grid[i][0],this.grid[i][1],this.xy,2*i);
for(const {row,start,end} of this.spans)this.drawSpan(ctx,row,start,end);
}
}
return {TailHand};})();
const {HandChange}=(()=>{
const openArm=[[305,323],[429,572],[506,700],[659,1050],[724,1460],
[207,473],[410,766],[609,666]];
const anchorCount=10+openArm.length;
const clamp=x=>Math.max(0,Math.min(1,x));
function field(){
return {
xy:new Float64Array(anchorCount*2),delta:new Float64Array(anchorCount*2),soft:1,
project(out,k){
const x=out[k],y=out[k+1];let total=0,dx=0,dy=0;
for(let i=0;i<this.xy.length;i+=2){
const a=x-this.xy[i],b=y-this.xy[i+1],d=a*a+b*b+this.soft;
const weight=1/(d*d);
total+=weight;dx+=this.delta[i]*weight;dy+=this.delta[i+1]*weight;
}
out[k]+=dx/total;out[k+1]+=dy/total;
}
};
}
class HandChange{
constructor(){
this.open=field();this.cupped=field();this.q=new Float64Array(2);
this.reset();
}
reset(){
this.held=false;this.amount=0;this.rate=0;this.move=null;
this.view=null;this.x=0;this.y=0;this.vx=0;this.vy=0;
}
place(hand,grip,held,dt,view){
const q=this.q;
hand.point(...openArm[1],q);
const openX=q[0],openY=q[1];
let gripX=openX,gripY=openY;
if(grip){
grip.point(...grip.layout.wrist,q);
gripX=q[0];gripY=q[1];
}
let x=held?gripX:openX,y=held?gripY:openY;
const targetAmount=held?1:0;
if(this.view!==view){
this.view=view;this.x=x;this.y=y;this.vx=this.vy=0;this.move=null;
this.amount=targetAmount;this.rate=0;this.held=held;
}
if(held!==this.held){
this.move={x:this.x,y:this.y,vx:this.vx,vy:this.vy,amount:this.amount,
rate:this.rate,time:0,duration:held?.29:.26};
this.held=held;
}
const m=this.move;
if(m){
const t=clamp((m.time+=dt)/m.duration),f=t*t*(3-2*t);
const carry=m.duration*t*(1-t)*(1-t);
x=m.x+(x-m.x)*f+m.vx*carry;
y=m.y+(y-m.y)*f+m.vy*carry;
this.amount=clamp(m.amount+(targetAmount-m.amount)*f+m.rate*carry);
this.rate=(targetAmount-m.amount)*6*t*(1-t)/m.duration+m.rate*(1-t)*(1-3*t);
if(t===1){this.move=null;this.amount=targetAmount;this.rate=0;}
}
const limit=view.handWidth*1.7;
this.vx=Math.max(-limit,Math.min(limit,(x-this.x)/dt));
this.vy=Math.max(-limit,Math.min(limit,(y-this.y)/dt));
this.x=x;this.y=y;
hand.px+=x-openX;hand.py+=y-openY;
if(grip){
grip.x+=x-gripX;grip.y+=y-gripY;
if(this.amount>0 && this.amount<1)this.fit(hand,grip,this.amount,view.baseW);
if(this.move){
hand.sleeveDrop+=sleeveReach(hand,view,459,922);
grip.sleeveDrop+=sleeveReach(grip,view,...grip.layout.bottom);
}
}
const mix=clamp((this.amount-.28)/.48);
return mix*mix*(3-2*mix);
}
fit(hand,grip,amount,width){
const a=this.open,b=this.cupped,q=this.q;
const {tips,knuckles,arm}=grip.layout;
a.soft=b.soft=(width*.003)**2;
for(let i=0;i<tips.length;i++){
const f=hand.fingers[i];
if(hand.articulated)hand.digitPoint(f.tip[0],f.tip[1],i,q);else q.set(f.tip);
hand.point(q[0],q[1],a.xy,2*i);
grip.point(...tips[i],b.xy,2*i);
const k=2*(i+tips.length),joint=i===4?f.p:f.m;
if(hand.articulated)hand.digitPoint(...joint,i,q);else q.set(joint);
hand.point(q[0],q[1],a.xy,k);
grip.point(...knuckles[i],b.xy,k);
}
for(let i=0;i<openArm.length;i++){
const k=2*(i+tips.length+knuckles.length);
hand.point(openArm[i][0],openArm[i][1],a.xy,k);
grip.point(...arm[i],b.xy,k);
}
for(let i=0;i<a.xy.length;i++){
const distance=b.xy[i]-a.xy[i];
a.delta[i]=distance*amount;b.delta[i]=distance*(amount-1);
}
hand.transition=a;grip.transition=b;
}
}
return {HandChange};})();
const {FurContact}=(()=>{
const smooth = (lo,hi,x) => {
const t=Math.max(0,Math.min(1,(x-lo)/(hi-lo)));
return t*t*(3-2*t);
};
function canvas(w,h){
const c=doc.createElement('canvas');c.width=w;c.height=h;return c;
}
function coatFringe(surface){
const {src,sw,sh}=surface,start=Math.floor(sw*.19),end=Math.ceil(sw*.74);
const outline=new Float32Array(sw),edge=new Float32Array(sw),r=Math.max(4,Math.round(sw*.014));
for(let x=start-r;x<=end+r;x++){
let y=Math.floor(sh*.84);
while(y>sh*.47 && src[4*(y*sw+x)+3]<155)y--;
outline[x]=y;
}
let sum=0;
for(let x=start-r;x<=start+r;x++)sum+=outline[x];
for(let x=start;x<end;x++){
edge[x]=sum/(2*r+1);sum+=outline[x+r+1]-outline[x-r];
}
return {src,sw,edge};
}
function furAlpha(photo,x,y){
const {src,sw}=photo,ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
const i=4*(iy*sw+ix)+3,j=i+sw*4;
return (src[i]+fx*(src[i+4]-src[i]))*(1-fy)+(src[j]+fx*(src[j+4]-src[j]))*fy;
}
function fringeAlpha(photo,u,edge,gap,scale,softness){
const base=1-smooth(-8,-2,gap/softness),limit=1-smooth(3,12,gap/softness);
if(base>=1 || limit<=0)return 255*base;
const hair=furAlpha(photo,u,edge+gap*scale*.90/softness)/255;
const bed=1-smooth(-7,8,gap/softness);
return 255*(base+(limit-base)*(.72*hair+.28*bed));
}
function makeMargin(photo,image,left,top,tipX,tipY,axisX,axisY,digit){
const w=183,h=176,x0=Math.floor(tipX-58),y0=Math.floor(tipY-37);
const sampler=canvas(w,h),sg=sampler.getContext('2d',{willReadFrequently:true});
sg.drawImage(image,left-x0,top-y0);
const skin=sg.getImageData(0,0,w,h).data,scale=photo.sw/1517;
const shapes=[sg.createImageData(w,h),sg.createImageData(w,h)];
const digitScale=[1,.92,.99,.82,.79][digit],submerge=[5,-8,8,-12,-4][digit];
let minX=w,minY=h,maxX=0,maxY=0;
for(let y=1;y<h-1;y++){
let lo=1,hi=w-2;
while(lo<w-1 && skin[4*(w*y+lo)+3]<120)lo++;
while(hi>lo && skin[4*(w*y+hi)+3]<120)hi--;
for(let x=1;x<w-1;x++){
const dx=x+x0-tipX,dy=y+y0-tipY;
const along=dx*axisX+dy*axisY,across=-dx*axisY+dy*axisX;
if(along>51 || along < -37 || Math.abs(across)>35)continue;
const depth=submerge+.28*across+.010*across*across;
const u=photo.sw*(.23+.072*digit)+across*scale;
const ix=Math.floor(u),f=u-ix,baseline=photo.edge[ix]+f*(photo.edge[ix+1]-photo.edge[ix]);
const index=4*(w*y+x)+3;
for(let level=0;level<2;level++){
const end=level?depth:depth*.60-13;
const opacity=fringeAlpha(photo,u,baseline,along-end,scale,1.2)*
(1-smooth(27,35,Math.abs(across)))*smooth(-37,-29,along);
if(opacity<1)continue;
shapes[level].data[index]=opacity;
minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
}
}
if(lo>=hi)continue;
for(const side of [1,-1]){
const root=side>0?lo:hi;
if(root===1 || root===w-2)continue;
const a=skin[4*(w*y+root)+3],prior=skin[4*(w*y+root-side)+3];
const rim=root-side*(a-120)/Math.max(1,a-prior);
const along=(rim+x0-tipX)*axisX+(y+y0-tipY)*axisY;
const proximal=y+y0-tipY;
const upstream=side>0;
const sidePad=smooth(-27,upstream?2:14,along)*(1-smooth(48,112,along))*
smooth(upstream?-25:-9,upstream?9:21,proximal);
if(sidePad<.012)continue;
const strength=digitScale*(upstream?1:.30)*sidePad;
const softness=.38+.62*sidePad;
const donor=photo.sw*(.226+.071*digit+(upstream?0:.026));
const end=Math.min(58,hi-lo+4);
for(let step=-5;step<=end;step++){
const x=root+side*step,depth=(x-rim)*side;
if(x<=0 || x>=w-1)continue;
const u=donor+(y-.36*depth)*scale,ix=Math.floor(u),f=u-ix;
const baseline=photo.edge[ix]+f*(photo.edge[ix+1]-photo.edge[ix]);
const rimOpacity=smooth(-5,-1,depth)*smooth(0,.25,sidePad);
const index=4*(w*y+x)+3;
for(let level=0;level<2;level++){
const reach=(level?20:9)*strength;
const opacity=fringeAlpha(photo,u,baseline,depth-reach,scale,softness)*rimOpacity;
if(opacity<=shapes[level].data[index] || opacity<1)continue;
shapes[level].data[index]=Math.min(opacity,254);
minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
}
}
}
}
const bw=Math.max(1,maxX-minX+1),bh=Math.max(1,maxY-minY+1);
const beds=shapes.map(shape=>{
const bed=canvas(bw,bh);
bed.getContext('2d').putImageData(shape,-minX,-minY,minX,minY,bw,bh);
return bed;
});
return {beds,x0:x0+minX,y0:y0+minY,w:bw,h:bh,digit,tipX,tipY,m:new Float64Array(6)};
}
function restToScreen(hand,digit,x,y,q){
if(hand.articulated){
hand.digitPoint(x,y,digit,q);x=q[0];y=q[1];
}
hand.point(x,y,q);
}
function fitMargin(part,hand,q){
const {tipX:x,tipY:y,m,digit}=part,span=32;
restToScreen(hand,digit,x,y,q);
const ox=q[0],oy=q[1];
restToScreen(hand,digit,x+span,y,q);m[0]=(q[0]-ox)/span;m[1]=(q[1]-oy)/span;
restToScreen(hand,digit,x,y+span,q);m[2]=(q[0]-ox)/span;m[3]=(q[1]-oy)/span;
m[4]=ox+(part.x0-x)*m[0]+(part.y0-y)*m[2];
m[5]=oy+(part.x0-x)*m[1]+(part.y0-y)*m[3];
}
class FurContact {
constructor(){
this.q=new Float64Array(2);this.coats=new WeakMap();
}
draw(ctx,view,layer,cat,hand,input,altitude){
if(!cat.longCoat || !input || input.zone==='tail' || altitude>=.94)return;
const bearing=1-altitude;
const load=smooth(.02,.79,.62*input.pressure+.38*cat.tip.load);
if(bearing*load<.01)return;
if(!this.buffer){
this.buffer=canvas(1,1);this.ink=this.buffer.getContext('2d');
}
let parts=this.coats.get(cat.surface.img);
if(!parts){
const fringe=coatFringe(cat.surface);
parts=hand.fingers.map((f,i)=>{
const part=hand.parts[i];
return makeMargin(fringe,part.tones[0],part.left,part.top,...f.tip,-f.ax,-f.ay,i);
});
this.coats.set(cat.surface.img,parts);
}
const dpr=view.dpr;
let x0=view.width,y0=view.height,x1=0,y1=0;
for(const part of parts){
fitMargin(part,hand,this.q);
const [a,b,c,d,x,y]=part.m,xx=a*part.w,xy=b*part.w,yx=c*part.h,yy=d*part.h;
x0=Math.min(x0,x+Math.min(0,xx)+Math.min(0,yx));x1=Math.max(x1,x+Math.max(0,xx)+Math.max(0,yx));
y0=Math.min(y0,y+Math.min(0,xy)+Math.min(0,yy));y1=Math.max(y1,y+Math.max(0,xy)+Math.max(0,yy));
}
const px=Math.max(0,Math.floor(x0*dpr)-1),py=Math.max(0,Math.floor(y0*dpr)-1);
const w=Math.min(ctx.canvas.width,Math.ceil(x1*dpr)+1)-px;
const h=Math.min(ctx.canvas.height,Math.ceil(y1*dpr)+1)-py;
if(w<1 || h<1)return;
const buffer=this.buffer,g=this.ink;
if(buffer.width<w)buffer.width=Math.ceil(w/32)*32;
if(buffer.height<h)buffer.height=Math.ceil(h/32)*32;
g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='source-over';g.clearRect(0,0,w,h);
const crown=input.skull??0;
const deep=smooth(.16,.94,load)*(1-.68*crown);
for(const part of parts){
const [a,b,c,d,x,y]=part.m;
g.setTransform(a*dpr,b*dpr,c*dpr,d*dpr,x*dpr-px,y*dpr-py);
g.globalAlpha=bearing*load*(1-.19*crown);g.drawImage(part.beds[0],0,0);
const loft=.96+.04*Math.sin((x-view.x)*86/view.w+(y-view.y)*55/view.h+part.tipX*.14);
g.globalAlpha=bearing*deep*loft;g.drawImage(part.beds[1],0,0);
}
g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;g.globalCompositeOperation='source-in';
const sx=layer.width/(view.width*dpr),sy=layer.height/(view.height*dpr);
g.drawImage(layer,px*sx,py*sy,w*sx,h*sy,0,0,w,h);
ctx.drawImage(buffer,0,0,w,h,px/dpr,py/dpr,w/dpr,h/dpr);
}
}
return {FurContact};})();
const {Purr}=(()=>{
class Purr {
enabled=false;
async toggle() {
if (!this.context) {
const Audio = window.AudioContext || window.webkitAudioContext;
if (!Audio) throw Error('audio unavailable');
this.context = new Audio();
const ctx = this.context;
const length = Math.round(ctx.sampleRate * 9);
const clip = ctx.createBuffer(1, length, ctx.sampleRate);
const data = clip.getChannelData(0);
let phase=0,noise=0;
for (let i=0;i<length;i++) {
const t=i/ctx.sampleRate;
const breath=Math.sin(t*Math.PI*2/3);
phase += 2*Math.PI*(25.2 + 1.45*breath + .35*Math.sin(t*2*Math.PI/1.5))/ctx.sampleRate;
noise=.81*noise+.19*(Math.random()*2-1);
const pulse=(.5+.5*Math.sin(phase))**3;
const envelope=.31+.40*Math.abs(breath)+.19*Math.max(0,breath);
const edge = Math.min(1,i/(ctx.sampleRate*.035),(length-1-i)/(ctx.sampleRate*.035));
data[i] = edge*envelope*((.28*Math.sin(phase)+.16*Math.sin(2*phase)+.10*Math.sin(3*phase))*(.6+.4*pulse)+noise*(.20+.74*pulse));
}
const source=ctx.createBufferSource();source.buffer=clip;source.loop=true;
this.gain=ctx.createGain();this.gain.gain.value=0;
const low=ctx.createBiquadFilter();low.type='lowpass';low.frequency.value=590;
source.connect(low).connect(this.gain).connect(ctx.destination);source.start();
}
await this.context.resume();this.enabled=!this.enabled;
this.update(0,true);
return this.enabled;
}
update(value, immediate=false) {
if (!this.context) return;
const target=this.enabled && !doc.hidden ? .05+.58*value : 0;
if (immediate || Math.abs(target-(this.target??-1))>.008) {
this.target=target;
this.gain.gain.setTargetAtTime(target,this.context.currentTime,immediate?.10:.24);
}
}
}
return {Purr};})();
const {silverTabby}=(()=>{
function silverTabby(photo,tail){
const canvas=doc.createElement('canvas');
const w=canvas.width=photo.width,h=canvas.height=photo.height;
const ctx=canvas.getContext('2d',{willReadFrequently:true});
ctx.drawImage(photo,0,0);
const frame=ctx.getImageData(0,0,w,h),pixels=frame.data;
const source=[0,32,52,66,80,94,108,127,150,180,220,255];
const silver=[8,18,31,49,77,112,145,174,200,223,238,248];
const tones=new Uint8ClampedArray(768);
for(let v=0,j=1;v<256;v++){
while(v>source[j])j++;
const l=silver[j-1]+(v-source[j-1])/(source[j]-source[j-1])*(silver[j]-silver[j-1]);
tones[3*v]=l+.6-2.3*l/255;tones[3*v+1]=l+1;tones[3*v+2]=l+.9-.3*l/255;
}
const earA=new Float32Array(w),earB=new Float32Array(w);
if(!tail)for(let i=0;i<w;i++){
const x=(i+.5)*1517/w-.5;
earA[i]=Math.exp(-(((x-214)/48)**2));earB[i]=Math.exp(-(((x-192)/51)**2));
}
for(let j=0,i=0;j<h;j++){
const y=(j+.5)*935/h-.5;
const a=tail?0:Math.exp(-(((y-309)/46)**2)),b=tail?0:Math.exp(-(((y-580)/26)**2));
for(let k=0;k<w;k++,i+=4){
if(!pixels[i+3])continue;
const t=3*((54*pixels[i]+183*pixels[i+1]+19*pixels[i+2]+128)>>8);
const ear=Math.max(earA[k]*a,earB[k]*b);
pixels[i]=tones[t]+18*ear;pixels[i+1]=tones[t+1]-12*ear;pixels[i+2]=tones[t+2]-10*ear;
}
}
ctx.putImageData(frame,0,0);return canvas;
}
return {silverTabby};})();
const {readPhoto}=(()=>{

const originals=new Map();
async function decodePhoto(name){
const [offset,count,x,y,w,h,W,H]=directory[name];
const url=new URL('assets/'+name+'.avif',import.meta.url).href;
const img=new Image();
try{img.src=url;await img.decode();}finally{URL.revokeObjectURL(url);}
if(name==='room')return img;
const body=!name.includes('-');
const c=doc.createElement('canvas'),scale=body?Math.min(1,img.width/w):1;
c.width=Math.round(W*scale);c.height=Math.round(H*scale);
const g=c.getContext('2d');
g.imageSmoothingQuality='high';
g.drawImage(img,x*c.width/W,y*c.height/H,w*c.width/W,h*c.height/H);
return c;
}
function original(name){
if(!originals.has(name))originals.set(name,decodePhoto(name).catch(e=>{originals.delete(name);throw e;}));
return originals.get(name);
}
async function readPhoto(name){
if(directory[name])return original(name);
if(name==='saba'||name==='saba-tail'){
const tail=name.endsWith('-tail');
return silverTabby(await original(tail?'mugi-tail':'mugi'),tail);
}
throw new Error('Unknown coat '+name);
}
return {readPhoto};})();
const {drawMoonlight}=(()=>{
function makeLightField(){
const lamp=doc.createElement('canvas');
lamp.width=320;lamp.height=197;
const g=lamp.getContext('2d',{alpha:false});
const pixels=g.createImageData(lamp.width,lamp.height),rgba=pixels.data;
const soft=(v,a,b)=>{const t=Math.min(1,Math.max(0,(v-a)/(b-a)));return t*t*(3-2*t);};
for(let row=0;row<lamp.height;row++){
const y=row/(lamp.height-1);
const penumbra=.034+.082*y;
for(let col=0;col<lamp.width;col++){
const x=col/(lamp.width-1);
const across=x-.66*y;
const pane=(left,right)=>soft(across,left-penumbra,left+penumbra)*(1-soft(across,right-penumbra,right+penumbra));
const windowLight=Math.exp(-3.7*x*x-5.5*y*y);
const beams=(.78*pane(-.24,-.076)+pane(-.026,.22))*Math.exp(-1.32*y);
const light=Math.min(1,.36*windowLight+.83*beams);
const spill=.04+.07*(1-y)*(1-.65*x);
const i=(row*lamp.width+col)*4;
rgba[i]=255*(.195+.44*light+spill);
rgba[i+1]=255*(.276+.49*light+spill);
rgba[i+2]=255*(.405+.49*light+spill);
rgba[i+3]=255;
}
}
g.putImageData(pixels,0,0);
return lamp;
}
let field;
function drawMoonlight(ctx,view){
field??=makeLightField();
ctx.save();
ctx.globalCompositeOperation='multiply';
ctx.drawImage(field,view.roomX,view.roomY,view.roomW,view.roomH);
ctx.globalCompositeOperation='screen';
ctx.fillStyle='#060a13';ctx.fillRect(0,0,view.width,view.height);
ctx.restore();
}
return {drawMoonlight};})();
const {Proportions}=(()=>{
const storageKey = 'pet-the-cat.proportions.shared';
const legacyKey = 'pet-the-cat.proportions.v1';
function readSettings(key) {
try {
const data = JSON.parse(localStorage.getItem(key));
if (data && typeof data === 'object' && !Array.isArray(data)) return data;
} catch {}
return null;
}
const sizes = [65,72,79,86,93,100,103,106,108,111,114];
const widths = [80,84,88,92,96,100,108,116,124,132,140];
function closestStep(value, stops) {
if (!Number.isFinite(value)) return 5;
return stops.reduce((best, stop, i) =>
Math.abs(stop - value) < Math.abs(stops[best] - value) ? i : best, 0);
}
class Proportions {
constructor(onChange) {
const find = id => doc.getElementById(id);
this.onChange = onChange;
this.dirty = false;
this.toggle = find('proportions-toggle');
this.panel = find('proportions-panel');
this.size = find('cat-size');
this.width = find('cat-width');
this.toggle.addEventListener('click', event => {
this.setOpen(this.panel.hidden);
if (!this.panel.hidden && event.detail === 0) this.size.focus();
});
const closeOutside = event => {
if (!this.panel.hidden && !this.panel.contains(event.target) && !this.toggle.contains(event.target)) this.setOpen(false);
};
doc.addEventListener('pointerdown', closeOutside, true);
doc.addEventListener('focusin', closeOutside);
doc.addEventListener('keydown', event => {
if (event.key !== 'Escape' || this.panel.hidden) return;
event.preventDefault();
event.stopImmediatePropagation();
this.setOpen(false);
this.toggle.focus({preventScroll:true});
}, true);
for (const input of [this.size, this.width]) {
input.addEventListener('input', () => this.update());
input.addEventListener('change', () => this.persist());
}
page.addEventListener('pagehide', () => this.persist());
}
restore(initialCat) {
let saved = readSettings(storageKey);
if (!saved) {
const previous = readSettings(legacyKey);
if (previous) {
const valid = item => item && (Number.isFinite(item.size) || Number.isFinite(item.width));
saved = [previous[initialCat], ...Object.values(previous)].find(valid);
this.dirty = Boolean(saved);
}
}
this.size.value = closestStep(saved?.size, sizes);
this.width.value = closestStep(saved?.width, widths);
if (saved && (saved.size !== sizes[this.size.value] || saved.width !== widths[this.width.value])) this.dirty = true;
this.apply();
this.persist();
}
setOpen(open) {
this.panel.hidden = !open;
this.toggle.setAttribute('aria-expanded', String(open));
if (!open) this.persist();
}
apply() {
const size = sizes[this.size.value];
const width = widths[this.width.value];
this.size.setAttribute('aria-valuetext', size + '%');
this.width.setAttribute('aria-valuetext', width + '%');
this.onChange(size / 100, width / 100);
}
update() {
this.dirty = true;
this.apply();
}
persist() {
if (!this.dirty) return;
try {
localStorage.setItem(storageKey, JSON.stringify({size:sizes[this.size.value], width:widths[this.width.value]}));
} catch {}
this.dirty = false;
}
}
return {Proportions};})();
const stage=doc.querySelector('#stage'), scene=doc.querySelector('#scene');
const viewer=doc.querySelector('#viewer'), retry=doc.querySelector('#retry');
const soundButton=doc.querySelector('#sound'), expand=doc.querySelector('#expand');
const themeButton=doc.querySelector('#theme'),themeRoot=doc.documentElement;
let moonlit=themeRoot.dataset.theme==='dark';
themeButton.setAttribute('aria-checked',String(moonlit));
themeButton.onclick=()=>{
moonlit=!moonlit;
const theme=moonlit?'dark':'light';
themeRoot.dataset.theme=theme;
themeButton.setAttribute('aria-checked',String(moonlit));
page.setThemeColor(moonlit?'#101722':'#fbf5ec');
try{localStorage.setItem('pet-the-cat-theme',theme);}catch{}
if(ready)paint(.001);
};
const choices=[...doc.querySelectorAll('[data-cat]')], notice=doc.querySelector('#notice');
const ctx=scene.getContext('2d',{alpha:false});
const layer=doc.createElement('canvas'), shadow=doc.createElement('canvas');
const shadowCtx=shadow.getContext('2d');
const handChange=new HandChange(),posedHand=new HandLayer(),blendLayer=doc.createElement('canvas');
const blendCtx=blendLayer.getContext('2d',{alpha:false});
const cat=new OverheadCat(layer),purr=new Purr();
const furContact=new FurContact();
let hand,tailHand;
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const touchDisplay=matchMedia('(pointer: coarse), (hover: none) and (any-pointer: coarse)');
const portrait=matchMedia('(orientation: portrait)');
const mobileRoot=viewer.parentElement;
function turned(){return viewer.classList.contains('landscape') && portrait.matches;}
const names=Object.fromEntries(choices.map(b=>[b.dataset.cat,b.getAttribute('aria-label')]));
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const follow=(a,b,dt,seconds)=>a+(b-a)*-Math.expm1(-dt/seconds);
const smooth=t=>t*t*(3-2*t);
const heldPressure=.90;
const home={u:.40,v:.555};
let view,key,room,ready=false,request=0,last=0,keyboard=false,keyTime=0;
let pointer=null,down=false,over=false,force=null;
let mode='rest',age=0,origin={...home},startHeight=0,retreat=0;
let pad={...home},target={...home},altitude=0,pressure=heldPressure,vx=0,vy=0,tuck=0;
const requestedCat=new URLSearchParams(location.search).get('cat');
let lastPointer=null,selected=Object.hasOwn(names,requestedCat)?requestedCat:'kuro';
let passedTip=false,tailAnchor=false,area='back',keyTailStart=null,edgePointer=null,edgeMoved=false;
let operator=null,previousInput=null,returningToBody=false;
let catScale=1;
const proportions=new Proportions((size,width)=>{
catScale=size;
cat.setThickness(width);
layout();
});
function layout(){
const rect=stage.getBoundingClientRect();
const r=turned()?{width:rect.height,height:rect.width}:rect;
if(r.width<1 || r.height<1)return;
const dpr=Math.min(devicePixelRatio||1,1.7,2350/Math.max(r.width,r.height));
const topCrop=Number(getComputedStyle(stage).getPropertyValue('--top-crop'));
view=computeView({width:r.width,height:r.height,dpr,catScale,topCrop});
const sw=Math.round(r.width*dpr),sh=Math.round(r.height*dpr);
if(scene.width!==sw||scene.height!==sh){
scene.width=sw;scene.height=sh;
shadow.width=Math.max(1,Math.round(r.width*.28));shadow.height=Math.max(1,Math.round(r.height*.28));
}
if(ready){
reprojectPointer();paint(.001);
}
}
proportions.restore(selected);
const observer=new ResizeObserver(layout);observer.observe(stage);
function reset(){
handChange.reset();
passedTip=false;tailAnchor=false;returningToBody=false;area='back';keyTailStart=null;edgePointer=null;edgeMoved=false;operator=null;previousInput=null;
pointer=null;down=true;keyboard=false;mode='rest';pad={...home};target={...home};tuck=0;lastPointer=null;
force=null;pressure=heldPressure;altitude=0;vx=0;vy=0;setOver(true);
}
async function choose(id){
selected=id;
const ticket=++request;
try{
const [photo,tailPhoto]=await Promise.all([readPhoto(id),readPhoto(id+'-tail')]);
if(ticket!==request)return;
cat.setCat(photo,tailPhoto,id,Math.max(850,Math.min(1152,Math.round(view.baseW*view.dpr))));key=id;reset();
if(ready)paint(.001);
stage.dataset.selected=id;stage.setAttribute('aria-label',names[id]+'を撫でる');
for(const b of choices)b.setAttribute('aria-pressed',String(b.dataset.cat===id));
notice.textContent=names[id]+'を選択';retry.hidden=true;
}catch{if(ticket===request){retry.hidden=false;notice.textContent='猫を読み込めなかった。';}}
}
async function init(){
retry.hidden=true;
try{
const [background,open,grip]=await Promise.all(['room','hand-slim','grip-slim'].map(readPhoto));
room=background;hand=new OverheadHand().load(open);tailHand=new TailHand().load(grip);
let wanted;
do{wanted=selected;await choose(wanted);}while(wanted!==selected);
if(key!==selected)throw Error();
ready=true;stage.dataset.ready='true';layout();
}catch{retry.hidden=false;notice.textContent='読み込み直すボタンで再試行できる。';}
}
retry.onclick=()=>ready?choose(selected):init();
for(const b of choices)b.onclick=()=>{if(ready)choose(b.dataset.cat);else selected=b.dataset.cat;};
function setOver(value){over=value;stage.dataset.over=String(value);stage.dataset.pressed=String(down && value);}
function point(e){
return pointerToStage({rect:stage.getBoundingClientRect(),rotated:turned(),clientX:e.clientX,clientY:e.clientY,lift:e.pointerType==='touch'?view.touchLift:0,view});
}
function track(p){
const previous=mode;
if(previous!=='stroke'){
pad={...p};previousInput=operator;vx=0;vy=0;tuck=0;
if(previous!=='rest'){altitude=.77;pressure=0;}
}
target=p;mode='stroke';
}
function withdraw(){
if(mode==='away'||mode==='withdraw')return;
mode='withdraw';age=0;origin={...pad};startHeight=altitude;
retreat=(view.height-view.y)/view.h+.36;
}
function reachBody(p,holding){
const w=view.w;
const margin=holding?clamp(w*.087,34,72):clamp(w*.05,21,44);
const upper=holding?clamp(w*.17,58,149):clamp(w*.125,43,112);
return cat.reach(p,margin/w,upper/w,true,view.upperNeckExtra);
}
function tailPickup(p,fromBody){
const tail=cat.tail,w=view.w;
const margin=(fromBody?clamp(w*.087,34,72):clamp(w*.05,21,44))/w;
if(fromBody && p.u<=tail.point(.54,true).u+.018){
const near=tail.closest(p.u,p.v,cat.tailBase.at,.54);
const above=clamp((near.v-p.v)*(935/1517)/Math.max(.001,near.distance));
const upper=Math.min(.17,clamp(w*.17,58,149)/w);
const lower=Math.min(.103,margin*1.20);
if(near.distance<=near.radius+lower+(upper-lower)*smooth(above))return near;
}
const near=tail.closest(p.u,p.v);
const directReach=fromBody?Math.min(.087,margin):Math.min(.05,margin*.70);
if(near.at<=.075 || near.distance>near.radius+directReach)return null;
if(!cat.unmap(p.u,p.v).zone)return near;
if(near.at<.27 && near.distance<near.radius+.002 && cat.outline.near(cat,p.u,p.v).distance<.018)return near;
return null;
}
function route(p){
const fromBody=over && mode==='stroke' && area!=='tail';
edgePointer=null;edgeMoved=true;operator={u:p.u,v:p.v};
const tail=cat.tail;
const baseX=cat.tailBaseX(),leftOfBase=p.u<baseX;
if(leftOfBase && (tail.stroke || tailAnchor || passedTip)){
if(tail.stroke)previousInput=operator;
tail.release();returningToBody=true;passedTip=false;
}
if(passedTip){
const hit=tail.closest(p.u,p.v);
if(!cat.unmap(p.u,p.v).zone && !(tail.releaseAge>.18 && hit.at>.08 && hit.distance<hit.radius)){
setOver(false);if(mode!=='tail-open')withdraw();return;
}
passedTip=false;
}
if(!tail.stroke && p.u>=baseX+(returningToBody?.014:0)){
const near=tailPickup(p,fromBody);
if(near){
tail.grab(p,near,fromBody);tailAnchor=true;returningToBody=false;
if(fromBody)previousInput=tail.gripPoint();
}
}
if(tail.stroke){
tail.drag(p,force??.6);area='tail';setOver(true);track(tail.gripPoint());return;
}
const contact=reachBody(p,over);
if(!contact){setOver(false);withdraw();return;}
area=contact.zone;edgePointer=contact.snapped?p:null;setOver(true);
track(contact);
}
function reprojectPointer(){
if(!lastPointer || keyboard || (!down&&!over))return;
route(point(lastPointer));
if(mode==='stroke')pad={...target};
}
page.addEventListener('scroll',reprojectPointer,{passive:true});
function handle(e){
down=true;
lastPointer={clientX:e.clientX,clientY:e.clientY,pointerType:e.pointerType};
const sensed=e.pressure>0 && (e.pointerType==='pen'||(e.pointerType==='touch' && Math.abs(e.pressure-.5)>.018));
force=sensed?clamp(e.pressure):null;
route(point(lastPointer));
}
function end(){
cat.tail.release();passedTip=false;pointer=null;down=false;keyboard=false;
lastPointer=null;edgePointer=null;setOver(false);withdraw();
}
for(const type of ['pointerenter','pointermove'])stage.addEventListener(type,e=>{
if(!ready||keyboard||e.target.closest('button')||(pointer!==null&&pointer!==e.pointerId))return;
if(e.pointerType!=='touch'||pointer===e.pointerId)handle(e);
});
stage.addEventListener('pointerdown',e=>{
if(!ready||pointer!==null||e.target.closest('button')||e.button!==0)return;
keyboard=false;
if(e.pointerType!=='mouse'){
pointer=e.pointerId;
try{stage.setPointerCapture(pointer);}catch{}
}
handle(e);e.preventDefault();
});
stage.addEventListener('pointerup',e=>{
if(!ready)return;
if(e.pointerType==='mouse'){if(!keyboard&&pointer===null)handle(e);}
else if(e.pointerId===pointer)end();
});
for(const t of ['pointercancel','lostpointercapture'])stage.addEventListener(t,e=>{
if(e.pointerId===pointer||(!keyboard&&e.pointerType==='mouse'&&pointer===null))end();
});
stage.addEventListener('pointerleave',e=>{
if(!keyboard && pointer===null && e.pointerType!=='touch')end();
});
stage.addEventListener('keydown',e=>{
if(!ready||e.target!==stage||!['Enter',' ','t','T'].includes(e.key))return;
e.preventDefault();if(e.repeat||keyboard||pointer!==null)return;
if(down)end();
lastPointer=null;keyboard=e.key.toLowerCase()==='t'?'tail':'back';
down=true;keyTime=0;force=null;passedTip=false;
if(keyboard==='tail'){keyTailStart=cat.tail.point(.185);route(keyTailStart);}
else{setOver(true);operator={u:.235,v:.55};track(operator);}
});
stage.addEventListener('keyup',e=>{if((keyboard==='back'&&['Enter',' '].includes(e.key))||(keyboard==='tail'&&e.key.toLowerCase()==='t')){end();e.preventDefault();}});
stage.addEventListener('blur',()=>{if(keyboard)end();});
page.addEventListener('blur',()=>end());
doc.addEventListener('visibilitychange',()=>{if(doc.hidden){end();last=0;purr.update(0,true);}});
function move(dt){
age+=dt;
if(edgePointer && !edgeMoved && over && (mode==='stroke')){
const contact=reachBody(edgePointer,true);
if(contact){target=contact;area=contact.zone;if(!contact.snapped)edgePointer=null;}
else{edgePointer=null;setOver(false);withdraw();}
}
edgeMoved=false;
if(keyboard){
keyTime+=dt;
if(keyboard==='tail'){
const f=smooth(clamp(keyTime/2.55)),root=cat.tail.root,length=cat.tail.length+.034;
const tipU=root.x+length*.923,tipV=(root.y+length*.385)/(935/1517);
route({u:keyTailStart.u+(tipU-keyTailStart.u)*f,v:keyTailStart.v+(tipV-keyTailStart.v)*f});
if(keyTime>=2.68)end();
}else target={u:.235+.40*(.5-.5*Math.cos(keyTime*1.7)),v:.55+.046*Math.sin(keyTime*1.7)};
}
if(cat.tail.slipped()){
passedTip=true;cat.tail.release();setOver(false);
pad={...cat.tail.releasePoint};target={...pad};mode='tail-open';age=0;
}
const constrained=cat.tail.stroke?cat.tail.gripPoint():null;
const inputPoint=constrained??(keyboard==='back'?target:operator);
let desired=0,height=0;
if(mode==='rest'){desired=heldPressure;}
else if(mode==='stroke'){
pad=constrained??{...target};
desired=force===null?heldPressure:.86+.13*force;
}else if(mode==='tail-open'){
height=.46;if(age>.155)withdraw();
}else if(mode==='withdraw'){
const t=clamp(age/(reduce.matches?.18:.34)),f=smooth(t);
pad.u=origin.u+.026*f;pad.v=origin.v+(retreat-origin.v)*f;
height=startHeight+(1-startHeight)*f;
if(t===1)mode='away';
}else height=1;
pressure=follow(pressure,desired,dt,desired>pressure?.037:.060);
altitude=follow(altitude,height,dt,height>altitude?.076:.055);
const tracking=mode==='stroke';
const moving=tracking && previousInput && inputPoint;
const dx=moving?clamp((inputPoint.u-previousInput.u)/dt,-1.5,1.5):0;
const dy=moving?clamp((inputPoint.v-previousInput.v)/dt,-1.6,1.6):0;
previousInput=tracking?inputPoint:null;
vx=follow(vx,dx,dt,.057);vy=follow(vy,dy,dt,.057);
const pull=Math.tanh(8.3*(vx*.63+vy*.616*.86));
tuck=follow(tuck,mode==='stroke'?pull:0,dt,.089);
}
function poseHands(dt){
const tail=cat.tail,held=!!tail.stroke;
let grip=null;
if(held || handChange.held || handChange.move){
const t=tail.gripPoint();
grip=tailHand;
grip.configure(view,t,view.x+t.u*view.w,view.y+t.v*view.h,tail.amount,pressure,tail.slide,dt);
}
return handChange.place(hand,grip,held,dt,view);
}
function tailContact(t,load){
return {u:t.ru,v:t.rv,zone:'tail',pressure:load*.74,dx:vx,dy:vy,
axisX:t.tx,axisY:t.ty,length:.029,width:t.radius*.76,pads:[]};
}
function paint(dt){
const {width:w,height:h,dpr}=view;
view.reduced=reduce.matches;
const rest=mode==='rest',visible=mode!=='away',touching=rest||mode==='stroke';
const x=view.x+view.w*pad.u,y=view.y+view.h*pad.v;
const edgeYaw=.45*smooth(clamp((x/w-.75)/.19));
const motionX=Math.tanh(4.6*vx),motionY=Math.tanh(3.9*vy);
const tail=cat.tail;
const onBody=touching&&area!=='tail'&&!tail.stroke;
const pose={x,y,pad,coat:onBody?cat:null,dt,pressure,load:cat.state.load,lift:cat.state.lift,depth:onBody?cat.tip.depth:0,altitude,rest,tuck,
angle:edgeYaw+.17*motionX-.058*motionY,motionX,motionY};
let input=null,blend=0;
if(visible){
hand.configure(view,pose);
if(tail.stroke){
input=tailContact(tail.point(tail.at),pressure);
}else{
let pads=null;
if(onBody){
pads=hand.contacts();
if(view.upperNeckExtra){
const drop=cat.upperPadDrop(view,pad,pads);
if(drop>0){
hand.py+=drop;
for(const finger of pads)finger.y+=drop;
}
}
}
const opening=handChange.held || !!handChange.move;
blend=poseHands(dt);
if(pads)input=cat.contact(view,opening?hand.contacts():pads,pressure*(1-altitude),vx,vy,pad.u);
if(!input && onBody && opening && returningToBody && tail.releasePoint){
const q=tailHand.q;
tailHand.point(tailHand.layout.cx,tailHand.layout.cy,q);
const tuft=tail.closest((q[0]-view.x)/view.w,(q[1]-view.y)/view.h);
const support=1-smooth(clamp((tuft.distance-tuft.feltRadius)*view.w/(.035*view.handWidth)));
if(support>0)input=tailContact(tuft,pressure*support);
}
}
}else if(handChange.view)handChange.reset();
cat.draw(view,input,dt);
if(visible && tail.stroke)blend=poseHands(dt);
if(tail.amount<.002&&!tail.stroke){tailAnchor=false;returningToBody=false;}
ctx.setTransform(dpr,0,0,dpr,0,0);
ctx.drawImage(room,view.roomX,view.roomY,view.roomW,view.roomH);
const sw=shadow.width,sh=shadow.height;
shadowCtx.clearRect(0,0,sw,sh);
shadowCtx.filter='blur('+Math.max(.8,view.w*.00135)+'px)';
shadowCtx.drawImage(layer,0,0,sw,sh);shadowCtx.filter='none';
shadowCtx.globalCompositeOperation='source-in';shadowCtx.fillStyle='#382316';shadowCtx.fillRect(0,0,sw,sh);
shadowCtx.globalCompositeOperation='source-over';
ctx.globalAlpha=.29;ctx.drawImage(shadow,view.w*.0018,view.h*.007,w,h);ctx.globalAlpha=1;
ctx.drawImage(layer,0,0,w,h);
if(visible){
const drawGrip=context=>{
posedHand.draw(context,view,g=>tailHand.drawSkin(g),0);
};
if(blend>0 && blend<1){
if(blendLayer.width!==scene.width || blendLayer.height!==scene.height){
blendLayer.width=scene.width;blendLayer.height=scene.height;
}
blendCtx.setTransform(1,0,0,1,0,0);blendCtx.drawImage(scene,0,0);
blendCtx.setTransform(dpr,0,0,dpr,0,0);drawGrip(blendCtx);
}
if(blend<1){
if(hand.transition || hand.sleeveDrop>1)posedHand.draw(ctx,view,g=>hand.drawSkin(g),altitude);
else hand.draw(ctx);
}
if(blend===1)drawGrip(ctx);
else if(blend>0){
ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=blend;
ctx.drawImage(blendLayer,0,0);ctx.restore();
}
}
if(onBody && input && input.zone!=='tail' && blend===0 && cat.longCoat){
furContact.draw(ctx,view,layer,cat,hand,input,altitude);
}
if(moonlit)drawMoonlight(ctx,view);
purr.update(input?.pressure??0);
}
function frame(ms){
if(!alive)return;
requestAnimationFrame(frame);
if(!ready||!view||doc.hidden){last=0;return;}
const elapsed=ms-last;
if(last && elapsed<32 && (mode==='rest'||mode==='away') && !cat.tailMoving(elapsed/1000))return;
const dt=last?clamp(elapsed/1000,.001,.075):1/60;
last=ms;move(dt);paint(dt);
}
soundButton.onclick=async()=>{
if(soundButton.disabled)return;
soundButton.disabled=true;
try{
const on=await purr.toggle();
soundButton.setAttribute('aria-checked',String(on));
}catch{notice.textContent='音を再生できなかった。';}finally{soundButton.disabled=false;}
};
let mobileNative=false;
function syncFull(){
const landscape=viewer.classList.contains('landscape');
const on=landscape || doc.fullscreenElement===viewer || viewer.classList.contains('is-full');
const mobile=landscape || (!on && touchDisplay.matches);
const label=mobile?(on?'横画面を終了':'横画面にする'):(on?'全画面を終了':'全画面にする');
expand.setAttribute('aria-pressed',String(on));expand.setAttribute('aria-label',label);
expand.querySelector('use').setAttribute('href',on?'#exit':mobile?'#rotate':'#full');
page.setFullPage(on);layout();
}
function leaveLandscape(){
viewer.classList.remove('landscape');
if(mobileNative){
mobileNative=false;
try{screen.orientation?.unlock();}catch{}
}
syncFull();
}
expand.onclick=async()=>{
if(viewer.classList.contains('landscape')){
leaveLandscape();
if(doc.fullscreenElement===mobileRoot)await doc.exitFullscreen().catch(()=>{});
}else if(doc.fullscreenElement===viewer)await doc.exitFullscreen();
else if(viewer.classList.contains('is-full'))viewer.classList.remove('is-full');
else if(touchDisplay.matches){
viewer.classList.add('landscape');syncFull();
if(doc.fullscreenEnabled && typeof screen.orientation?.lock==='function'){
try{
await mobileRoot.requestFullscreen();
if(!viewer.classList.contains('landscape')){
if(doc.fullscreenElement===mobileRoot)await doc.exitFullscreen();
return;
}
if(doc.fullscreenElement===mobileRoot){
mobileNative=true;
await screen.orientation.lock('landscape');
}
}catch{/* The responsive landscape view also works without a native lock. */}
}
}else try{await viewer.requestFullscreen();}catch{viewer.classList.add('is-full');}
syncFull();
};
doc.addEventListener('fullscreenchange',()=>{
if(mobileNative && doc.fullscreenElement!==mobileRoot)leaveLandscape();
else syncFull();
});
doc.addEventListener('keydown',e=>{
if(e.key!=='Escape')return;
if(viewer.classList.contains('landscape')){expand.click();return;}
if(viewer.classList.contains('is-full')){viewer.classList.remove('is-full');syncFull();}
});
page.watchQuery(portrait,'change',syncFull);
page.watchQuery(touchDisplay,'change',syncFull);
syncFull();
init();requestAnimationFrame(frame);

function restart() {
  if (ready) choose(selected); else init();
}
function destroy() {
  if (!alive) return;
  alive = false;
  try { observer.disconnect(); } catch { /* 还没开始观察 */ }
  page.setFullPage(false);
  page.release();
  try { if (doc.fullscreenElement) doc.exitFullscreen(); } catch { /* 不在全屏 */ }
  try { purr.dispose?.(); } catch { /* 声音已经关了 */ }
}
return { restart, destroy, get ready() { return ready; }, get coat() { return selected; } };
}
