import {describe,expect,it} from 'vitest'
import {mountSuspended} from '@nuxt/test-utils/runtime'
import SafetyReviewDetails from '../../frontend/app/components/safety/SafetyReviewDetails.vue'
import SafetyDecisionForm from '../../frontend/app/components/safety/SafetyDecisionForm.vue'
import {reviewRound,safetySnapshot} from '../helpers/safety-fixtures'
import {validateSafetyDecision,safetyFactors} from '../../frontend/app/components/safety/safety-review-state'
const props=()=>({round:reviewRound(),currentRequirementsRevision:'requirements-4',canDecide:true,venues:[{bookingId:'room-a',venueName:'Main hall'}]})
const completeChecklist=async(w:any)=>{for(const input of w.findAll('[data-safety-factor] input'))await input.setValue(true)}
const checklist=()=>Object.fromEntries(Object.keys(safetyFactors).map(key=>[key,true]))
describe('CS-94 independent Safety review display and validation',()=>{
  it('TC-CS94-30 a decision requires a completed structured checklist and keeps internal notes separate',async()=>{
    const w=await mountSuspended(SafetyDecisionForm,{props:props()})
    await w.get('select').setValue('APPROVE');await w.get('form').trigger('submit')
    expect(w.emitted('decision')).toBeUndefined()
    expect(w.findAll('[data-safety-factor]')).toHaveLength(7)
    for(const input of w.findAll('[data-safety-factor] input'))await input.setValue(true)
    await w.get('textarea[aria-label="Actionable comments"]').setValue('Use the east entrance')
    await w.get('textarea[aria-label="Private internal notes"]').setValue('Internal coordination detail')
    await w.get('form').trigger('submit')
    expect(w.emitted('decision')?.[0]?.[0]).toMatchObject({reason:'Use the east entrance',privateNotes:'Internal coordination detail',checklist:expect.any(Object)})
    w.unmount()
  })
  it('TC-CS94-29 repeated identical save failures permit retry while success and duplicate clicks stay guarded',async()=>{
    const w=await mountSuspended(SafetyDecisionForm,{props:props()});await completeChecklist(w)
    await w.get('select').setValue('REJECT');await w.get('input[value="room-a"]').setValue(true);await w.get('textarea').setValue('Exit is unsafe')
    for(let attempt=1;attempt<=2;attempt++){
      await w.get('form').trigger('submit');expect(w.emitted('decision')).toHaveLength(attempt)
      await w.setProps({pending:true});await w.setProps({pending:false,requestError:'Service unavailable'})
      expect(w.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
    }
    await w.get('form').trigger('submit');expect(w.emitted('decision')).toHaveLength(3)
    await w.setProps({pending:true,requestError:''});await w.setProps({pending:false})
    await w.get('form').trigger('submit');expect(w.emitted('decision')).toHaveLength(3);w.unmount()
  })
  it('TC-CS94-27 refuses a non-string decision instead of converting it to an approved intent',()=>{
    for(const decision of [{toString:()=> 'APPROVE'},{toString:()=>{throw new Error('Untrusted conversion')}}]){
      const value=validateSafetyDecision({decision,reason:'',areas:[]},reviewRound(),'requirements-4')
      expect(value.value).toBeNull();expect(value.errors.decision).toBeTruthy()
    }
  })
  it('TC-CS94-28 a missing or malformed review round remains safely non-actionable',async()=>{
    for(const round of [null,{...reviewRound(),id:42}]){
      const w=await mountSuspended(SafetyDecisionForm,{props:{round,currentRequirementsRevision:'requirements-4',canDecide:true} as any})
      expect(w.get('button[type="submit"]').attributes('disabled')).toBeDefined()
      await w.get('form').trigger('submit');expect(w.emitted('decision')).toBeUndefined();w.unmount()
    }
  })
  it('TC-CS94-20 renders seven factors per room and highlights only the exceeded capacity',async()=>{
    const w=await mountSuspended(SafetyReviewDetails,{props:{snapshot:safetySnapshot() as any}})
    const rooms=w.findAll('[data-safety-booking]');expect(rooms).toHaveLength(2)
    for(const room of rooms)for(const label of ['Attendance and capacity','Layout','Emergency access','Accessibility requirements','Equipment placement','Crowd movement','Venue restrictions'])expect(room.text()).toContain(label)
    expect(rooms[0]!.text()).toContain('80 / 80');expect(rooms[0]!.find('[role="alert"]').exists()).toBe(false)
    expect(rooms[1]!.text()).toContain('41 / 40');expect(rooms[1]!.find('[role="alert"]').text()).toContain('Attendance exceeds capacity')
    expect(w.text()).toContain('Equipment approval has not been verified');expect(w.text()).toContain('Not recorded')
    expect(w.text()).not.toContain('No equipment required');w.unmount()
    for(const [attendance,over] of [[299,false],[300,false],[301,true]] as const){
      const snapshot=safetySnapshot();snapshot.venues=[{...snapshot.venues[0]!,capacity:300,expectedAttendance:attendance}]
      const boundary=await mountSuspended(SafetyReviewDetails,{props:{snapshot:snapshot as any}})
      expect(boundary.get('[data-safety-booking]').find('[role="alert"]').exists()).toBe(over);boundary.unmount()
    }
  })
  it('TC-CS94-21 rejects a blank rejection reason',async()=>{
    const w=await mountSuspended(SafetyDecisionForm,{props:props()});await completeChecklist(w)
    await w.get('select').setValue('REJECT');await w.get('input[value="room-a"]').setValue(true);await w.get('textarea').setValue('   ');await w.get('form').trigger('submit')
    expect(w.get('[role="alert"]').text()).toContain('Give a reason');expect(w.emitted('decision')).toBeUndefined();w.unmount()
  })
  it('TC-CS94-22 requires a reason and affected areas for Request Changes',async()=>{
    const w=await mountSuspended(SafetyDecisionForm,{props:props()});await completeChecklist(w)
    await w.get('select').setValue('REQUEST_CHANGES');await w.get('form').trigger('submit')
    expect(w.get('[role="alert"]').text()).toContain('Give a reason')
    await w.get('textarea').setValue(' Exit is obstructed ');await w.get('form').trigger('submit')
    expect(w.get('[role="alert"]').text()).toContain('Select at least one affected area')
    await w.get('input[value="VENUE"]').setValue(true);await w.get('form').trigger('submit')
    expect(w.emitted('decision')?.[0]?.[0]).toEqual({roundId:'round-1',round:1,requirementsRevision:'requirements-4',decision:'REQUEST_CHANGES',reason:'Exit is obstructed',areas:['VENUE'],checklist:checklist(),privateNotes:'',rejectedBookingIds:[]});w.unmount()
  })
  it('TC-CS94-23 approval emits a versioned intent without stale affected areas',async()=>{
    const w=await mountSuspended(SafetyDecisionForm,{props:props()});await completeChecklist(w)
    await w.get('select').setValue('REQUEST_CHANGES');await w.get('input[value="VENUE"]').setValue(true)
    await w.get('select').setValue('APPROVE');await w.get('textarea').setValue(' Reviewed ');await w.get('form').trigger('submit')
    expect(w.emitted('decision')?.[0]?.[0]).toEqual({roundId:'round-1',round:1,requirementsRevision:'requirements-4',decision:'APPROVE',reason:'Reviewed',areas:[],checklist:checklist(),privateNotes:'',rejectedBookingIds:[]});w.unmount()
  })
  it('TC-CS94-24 fails closed for missing permission, stale requirements and invalid rounds',async()=>{
    for(const override of [{canDecide:false},{currentRequirementsRevision:'requirements-5'},{round:{...reviewRound(),number:0}},{round:{...reviewRound(),id:''}}]){
      const w=await mountSuspended(SafetyDecisionForm,{props:{...props(),...override}})
      expect(w.get('button[type="submit"]').attributes('disabled')).toBeDefined();await w.get('form').trigger('submit');expect(w.emitted('decision')).toBeUndefined();w.unmount()
    }
  })
  it('TC-CS94-25 new review rounds clear the previous draft',async()=>{
    const w=await mountSuspended(SafetyDecisionForm,{props:props()});await completeChecklist(w)
    await w.get('select').setValue('REQUEST_CHANGES');await w.get('textarea').setValue('Old explanation');await w.get('input[value="VENUE"]').setValue(true)
    await w.setProps({round:{id:'round-2',number:2,requirementsRevision:'requirements-5'},currentRequirementsRevision:'requirements-5'})
    expect((w.get('textarea').element as HTMLTextAreaElement).value).toBe('');expect((w.get('select').element as HTMLSelectElement).value).toBe('')
    await completeChecklist(w);await w.get('select').setValue('APPROVE');await w.get('form').trigger('submit')
    expect(w.emitted('decision')?.[0]?.[0]).toMatchObject({roundId:'round-2',round:2,requirementsRevision:'requirements-5',areas:[]});w.unmount()
  })
  it('TC-CS94-26 emits once and never claims a persisted decision',async()=>{
    const w=await mountSuspended(SafetyDecisionForm,{props:props()});await completeChecklist(w)
    await completeChecklist(w);await w.get('select').setValue('APPROVE');await w.get('form').trigger('submit');await w.get('form').trigger('submit')
    expect(w.emitted('decision')).toHaveLength(1);expect(w.text()).not.toContain('Decision saved');w.unmount()
  })
})

it('TC-CS94-41 Venue Staff persist the operational Safety facts used by the Officer review',async()=>{
  const {createRequire}=await import('node:module'),require=createRequire(import.meta.url),f=require('../helpers/venue-workflow.cjs')
  const stack=await f.stack();f.reset()
  try{
    const body=f.venueInput({emergencyAccess:'Two marked exits and a clear emergency lane',crowdMovement:'One-way foyer entry and side exit',restrictions:'No open flames'})
    const saved=await stack.venue.http('/venues',{method:'POST',headers:f.staff,body})
    expect(saved.status).toBe(201)
    expect(saved.body).toMatchObject({emergencyAccess:body.emergencyAccess,crowdMovement:body.crowdMovement,restrictions:body.restrictions})
  }finally{await stack.close()}
})

it('TC-CS94-42 the real decision button stays disabled until every required checklist, reason and affected area is complete',async()=>{
 const w=await mountSuspended(SafetyDecisionForm,{props:props()});await completeChecklist(w)
 await w.get('select').setValue('REQUEST_CHANGES');await w.get('textarea[aria-label="Actionable comments"]').setValue('Clear the access lane')
 expect(w.get('button[type="submit"]').attributes('disabled')).toBeDefined()
 await w.get('input[value="VENUE"]').setValue(true)
 expect(w.get('button[type="submit"]').attributes('disabled')).toBeUndefined();w.unmount()
})
