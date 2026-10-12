function localParts(value,timeZone) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
}
function day(parts) {return `${parts.year}-${parts.month}-${parts.day}`;}
function minute(parts,value) {return Number(parts.hour)*60+Number(parts.minute)+Number(parts.second)/60+(Date.parse(value)%1000)/60000;}
function clockMinutes(value) {const [h,m]=String(value || '').split(':').map(Number);return h*60+m;}
function withinHours(window,venue) {
  try {
    if (Date.parse(window.endAt)-Date.parse(window.startAt)>366*86400000) return false;
    const first=localParts(window.startAt,venue.timeZone),end=localParts(window.endAt,venue.timeZone);
    const last=localParts(new Date(Date.parse(window.endAt)-1).toISOString(),venue.timeZone);
    for(let date=new Date(`${day(first)}T00:00:00.000Z`);date.toISOString().slice(0,10)<=day(last);date.setUTCDate(date.getUTCDate()+1)) {
      const key=date.toISOString().slice(0,10),weekday=['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][date.getUTCDay()];
      const hours=venue.operatingHours?.find(h=>h.weekday===weekday);
      if (!hours || hours.isClosed) return false;
      const start=key===day(first)?minute(first,window.startAt):0,finish=key===day(end)?minute(end,window.endAt):1440;
      if (!(start>=clockMinutes(hours.opensAt) && finish<=clockMinutes(hours.closesAt))) return false;
    }
    return true;
  } catch {return false;}
}
module.exports={withinHours};
