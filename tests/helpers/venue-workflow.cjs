// Real HTTP service boundaries with isolated in-memory repositories. PostgreSQL
// suites use the same upstream contract fixtures with the booking database.
process.env.DATA_MODE = 'memory';
process.env.NODE_ENV = 'test';
const { start } = require('./service-integration.cjs');
const repository = require('../../services/event-service/src/store');
const venues = require('../../services/venue-service/src/store');
const bookings = require('../../services/booking-service/src/store');
const bookingConfig = require('../../services/booking-service/src/config');
const venueConfig = require('../../services/venue-service/src/config');
const staff = { 'x-test-user-id': 'staff', 'x-test-role': 'VENUE_STAFF' };
const coordinator = { 'x-test-user-id': 'coordinator', 'x-test-role': 'EVENT_COORDINATOR' };
const weekdays = ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'];
const venueInput = (overrides = {}) => ({ name:'Bay Hall',address:'One Bay',capacity:100,venueType:'PHYSICAL',supportedLayouts:['THEATRE'],facilities:['PROJECTOR'],accessibilityTags:['WHEELCHAIR_ACCESS'],timeZone:'Asia/Singapore',isActive:true,managedById:'staff',reason:'Prepare room',setupMinutes:30,turnaroundMinutes:30,operatingHours:weekdays.map(weekday=>({weekday,isClosed:false,opensAt:'00:00',closesAt:'23:59'})),...overrides });
async function eventFixture(overrides = {}) {
  const request = await repository.createRequest({ organiserId:'organiser',organisationId:'organisation',currentCoordinatorId:'coordinator',status:'APPROVED',eventName:'Conference',expectedAttendance:80,minimumCapacity:80,preferredLayout:'THEATRE',venueType:'PHYSICAL',venueRequirements:'PROJECTOR',accessibilityNeeds:['WHEELCHAIR_ACCESS'],equipmentNeeds:[],technicalDetails:'',...overrides });
  // Request approval and Event lifecycle are separate state machines.
  if (overrides.status) await repository.updateRequest(request.id,{status:'APPROVED'},request.version);
  const event = await repository.createEvent({ eventRequestId:request.id,organiserId:'organiser',organisationId:'organisation',title:'Conference',description:'Customer conference',startAt:'2026-12-21T01:00:00.000Z',endAt:'2026-12-21T10:00:00.000Z',timeZone:'Asia/Singapore',status:'ARRANGEMENT_PENDING',...overrides });
  return { event, request };
}
async function stack() {
  const event = await start(require('../../services/event-service/src/app'));
  const venue = await start(require('../../services/venue-service/src/app'));
  const booking = await start(require('../../services/booking-service/src/app'));
  const old = { event:bookingConfig.eventServiceUrl,venue:bookingConfig.venueServiceUrl,booking:venueConfig.bookingServiceUrl };
  bookingConfig.eventServiceUrl=event.base; bookingConfig.venueServiceUrl=venue.base; venueConfig.bookingServiceUrl=booking.base;
  return { event,venue,booking, async close(){ await Promise.all([event.close(),venue.close(),booking.close()]); bookingConfig.eventServiceUrl=old.event;bookingConfig.venueServiceUrl=old.venue;venueConfig.bookingServiceUrl=old.booking; reset(); } };
}
function reset(){repository.reset();venues.reset();bookings.reset();}
module.exports={stack,reset,eventFixture,venueInput,staff,coordinator,repository,venues,bookings};
