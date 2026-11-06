import {useEffect,useState} from 'react';
import {MapContainer,TileLayer,Polyline,CircleMarker,Tooltip,useMap} from 'react-leaflet';
import type {Vehicle} from '../../../../shared/types.ts';
import {journeyDistanceKm,journeyHistory,type Journey} from '../../../../shared/journeys.ts';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../../components/ui/dialog.tsx';
import {Button} from '../../components/ui/button.tsx';
import {Badge} from '../../components/ui/badge.tsx';
import {Icon} from '../../components/Icon.tsx';
import {formatUtc} from '../../utils/date.ts';
import 'leaflet/dist/leaflet.css';
import './owner-journeys.css';

const date=(at:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric'}).format(new Date(at));
const duration=(j:Journey)=>Math.round((Date.parse(j.endedAt)-Date.parse(j.startedAt))/60000);
const distance=(j:Journey)=>journeyDistanceKm(j.points).toFixed(1);
function RouteBounds({journey,compact}:{journey:Journey;compact:boolean}){
  const map=useMap();useEffect(()=>{
    const frame=requestAnimationFrame(()=>{map.invalidateSize();map.fitBounds(journey.points.map(p=>[p.latitude,p.longitude] as [number,number]),{padding:compact?[20,20]:[42,42],maxZoom:15,animate:false});});
    return()=>cancelAnimationFrame(frame);
  },[map,journey.id,compact]);return null;
}
function JourneyMap({journey,compact=false}:{journey:Journey;compact?:boolean}){
  const [tileError,setTileError]=useState(false),first=journey.points[0],last=journey.points.at(-1)!;
  return <div className={compact?'journey-map-mini':'journey-map-full'}>
    <MapContainer center={[first.latitude,first.longitude]} zoom={13} className="journey-leaflet" scrollWheelZoom={!compact} dragging={!compact} touchZoom={!compact} doubleClickZoom={!compact} keyboard={!compact} zoomControl={!compact} attributionControl={!compact}>
      <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" eventHandlers={{tileerror:()=>setTileError(true)}}/>
      <RouteBounds journey={journey} compact={compact}/>
      <Polyline positions={journey.points.map(p=>[p.latitude,p.longitude] as [number,number])} pathOptions={{color:'#16a398',weight:compact?4:5,opacity:0.95}}/>
      <CircleMarker center={[first.latitude,first.longitude]} radius={compact?5:8} pathOptions={{color:'#fff',weight:2,fillColor:'#16a398',fillOpacity:1}}>{!compact&&<Tooltip>Start · {journey.from}<br/>{formatUtc(journey.startedAt)}</Tooltip>}</CircleMarker>
      <CircleMarker center={[last.latitude,last.longitude]} radius={compact?5:8} pathOptions={{color:'#fff',weight:2,fillColor:'#6d5bca',fillOpacity:1}}>{!compact&&<Tooltip>Finish · {journey.to}<br/>{formatUtc(journey.endedAt)}</Tooltip>}</CircleMarker>
    </MapContainer>
    {tileError&&<span className="journey-tile-note">Street tiles unavailable · illustrative trace retained</span>}
  </div>;
}
export function OwnerJourneys({vehicle,assessmentTime,full=false}:{vehicle:Vehicle;assessmentTime:string;full?:boolean}){
  const journeys=journeyHistory(vehicle.journeys??[],assessmentTime),latest=journeys[0];
  const [open,setOpen]=useState(false),[selectedId,setSelectedId]=useState<string>();
  const selected=journeys.find(j=>j.id===selectedId)??latest;
  return <>
    <section className={`owner-journey-card${full?' journey-records-card':''}`} aria-label="Last recorded journey">
      <div className="journey-card-heading"><div><span className="section-kicker">JOURNEY HISTORY</span><h2>Last journey</h2></div><Badge tone="synthetic">Synthetic</Badge></div>
      {latest?<><div className="journey-preview"><JourneyMap journey={latest} compact/><button type="button" className="journey-preview-open" aria-label="Open journey history" onClick={()=>{setSelectedId(latest.id);setOpen(true);}}><span>View journey <Icon name="arrow" size={15}/></span></button></div>
        <div className="journey-card-route"><strong>{latest.from}<Icon name="next" size={15}/>{latest.to}</strong><small>{date(latest.endedAt)} · {duration(latest)} min · {distance(latest)} km trace</small></div>
        <p className="journey-card-caption">Constructed route · not live GPS. <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a></p>
      </>:<p className="journey-empty">No completed journey is recorded at or before this assessment. No route is assumed.</p>}
    </section>
    <Dialog open={open} onOpenChange={setOpen}>{open&&selected&&<DialogContent className="owner-journey-dialog"><header className="journey-dialog-heading"><div><span className="section-kicker">RECORDED JOURNEYS · {vehicle.registration}</span><DialogTitle>Journey history</DialogTitle><DialogDescription>Constructed history, not live tracking. Distances follow the illustrative trace, not verified road routing.</DialogDescription></div><Button variant="secondary" size="icon" aria-label="Close journey history" onClick={()=>setOpen(false)}><Icon name="close"/></Button></header>
      <div className="journey-dialog-body"><aside className="journey-history-list" aria-label="Recorded journeys">{journeys.map((j,i)=><button key={j.id} type="button" aria-pressed={selected.id===j.id} onClick={()=>setSelectedId(j.id)}><span>{i===0?'Latest journey':date(j.endedAt)}</span><strong>{j.from} → {j.to}</strong><small>{date(j.endedAt)} · {duration(j)} min · {distance(j)} km</small></button>)}</aside>
      <section className="journey-route-detail" aria-label="Selected journey route"><JourneyMap key={selected.id} journey={selected}/><div className="journey-detail-facts"><div><small>Start · UTC</small><strong>{selected.from}</strong><span>{formatUtc(selected.startedAt)}</span></div><div><small>Finish · UTC</small><strong>{selected.to}</strong><span>{formatUtc(selected.endedAt)}</span></div><div><small>Recorded trace</small><strong>{distance(selected)} km · {duration(selected)} min</strong><span>{selected.points.length} timestamped points</span></div></div></section></div>
      <footer className="journey-dialog-footer"><Badge tone="synthetic">Constructed fixture</Badge><p>No acquired GPS, live vehicle movement or confirmed driving record is implied. This history does not change mileage or maintenance assessments.</p></footer>
    </DialogContent>}</Dialog>
  </>;
}
