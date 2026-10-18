function localParts(value,formatter) {
  return Object.fromEntries(formatter.formatToParts(new Date(value)).map(p=>[p.type,p.value]));
}
function day(parts) {return `${parts.year}-${parts.month}-${parts.day}`;}
function localMilliseconds(parts,value) {return Number(parts.hour)*3600000+Number(parts.minute)*60000+Number(parts.second)*1000+((value%1000)+1000)%1000;}
function clockMilliseconds(value) {const [h,m]=String(value || '').split(':').map(Number);return h*3600000+m*60000;}
function offset(parts,value) {
  const date=new Date(0);
  date.setUTCFullYear(Number(parts.year),Number(parts.month)-1,Number(parts.day));
  date.setUTCHours(Number(parts.hour),Number(parts.minute),Number(parts.second),((value%1000)+1000)%1000);
  return date.getTime()-value;
}
function segmentFits(start,end,first,last,venue) {
  for(let date=new Date(`${day(first)}T00:00:00.000Z`);date.toISOString().slice(0,10)<=day(last);date.setUTCDate(date.getUTCDate()+1)) {
    const key=date.toISOString().slice(0,10),weekday=['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][date.getUTCDay()];
    const hours=venue.operatingHours?.find(h=>h.weekday===weekday);
    if (!hours || hours.isClosed) return false;
    // Use the last occupied millisecond, not the local time after a clock jump.
    const from=key===day(first)?localMilliseconds(first,start):0,to=key===day(last)?localMilliseconds(last,end-1)+1:86400000;
    if (!(from>=clockMilliseconds(hours.opensAt) && to<=clockMilliseconds(hours.closesAt))) return false;
  }
  return true;
}
function withinHours(window,venue) {
  try {
    const start=Date.parse(window.startAt),end=Date.parse(window.endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end<=start || end-start>366*86400000) return false;
    const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:venue.timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    // Check monotonic local-clock segments. Endpoint-only comparisons can miss
    // a closed interval inside a repeated hour. Intl also supplies half-hour
    // offset transitions; no daylight-saving date or offset is hard-coded.
    for(let from=start;from<end;) {
      const until=Math.min(end,from+3600000),first=localParts(from,formatter),last=localParts(until-1,formatter),before=offset(first,from);
      if(before!==offset(last,until-1)) {
        let low=from+1,high=until-1;
        while(low<high) {
          const middle=low+Math.floor((high-low)/2);
          if(offset(localParts(middle,formatter),middle)===before)low=middle+1;else high=middle;
        }
        if(!segmentFits(from,low,first,localParts(low-1,formatter),venue))return false;
        from=low;
      } else {
        if(!segmentFits(from,until,first,last,venue))return false;
        from=until;
      }
    }
    return true;
  } catch {return false;}
}
module.exports={withinHours};
