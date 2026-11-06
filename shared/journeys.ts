export interface JourneyPoint {latitude:number;longitude:number;recordedAt:string}
export interface Journey {
  id:string;vehicleId:string;startedAt:string;endedAt:string;from:string;to:string;
  points:JourneyPoint[];dataOrigin:'constructed fixture';source:string;
}
export function journeyDistanceKm(points:JourneyPoint[]):number{
  const radians=(n:number)=>n*Math.PI/180;let distance=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],lat=radians(b.latitude-a.latitude),lon=radians(b.longitude-a.longitude);
    const h=Math.sin(lat/2)**2+Math.cos(radians(a.latitude))*Math.cos(radians(b.latitude))*Math.sin(lon/2)**2;
    distance+=6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
  }
  return distance;
}
export function journeyHistory(journeys:Journey[],assessmentTime:string):Journey[]{
  const cutoff=Date.parse(assessmentTime);
  return journeys.filter(j=>Date.parse(j.endedAt)<=cutoff&&Date.parse(j.startedAt)<=Date.parse(j.endedAt)&&j.points.length>=2).sort((a,b)=>Date.parse(b.endedAt)-Date.parse(a.endedAt)||a.id.localeCompare(b.id));
}
export function journeyPreviewPath(points:JourneyPoint[],width=320,height=120):string{
  if(points.length<2)return '';
  const xs=points.map(p=>p.longitude),ys=points.map(p=>p.latitude),minX=Math.min(...xs),maxY=Math.max(...ys),rangeX=Math.max(...xs)-minX,rangeY=maxY-Math.min(...ys);
  const scale=Math.min((width-40)/(rangeX||0.001),(height-30)/(rangeY||0.001));
  const offsetX=(width-rangeX*scale)/2,offsetY=(height-rangeY*scale)/2;
  return points.map((p,i)=>`${i?'L':'M'}${(offsetX+(p.longitude-minX)*scale).toFixed(2)},${(offsetY+(maxY-p.latitude)*scale).toFixed(2)}`).join(' ');
}
