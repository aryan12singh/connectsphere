import {describe,expect,it} from 'vitest'
import {mountSuspended} from '@nuxt/test-utils/runtime'
import SafetyReworkPanel from '../../frontend/app/components/safety/SafetyReworkPanel.vue'
import {reworkProps} from '../helpers/safety-fixtures'
describe('CS-95 independent rework presentation and validation',()=>{
  it('TC-CS95-26 stale proof never labels an affected arrangement rework approved',async()=>{
    const p=reworkProps(),w=await mountSuspended(SafetyReworkPanel,{props:{...p,canResubmit:true,readinessRequirementsRevision:'old-revision',arrangements:p.arrangements.map(a=>({...a,ready:true}))} as any})
    const venue=w.get('[data-rework-area="VENUE"]')
    expect(venue.text()).not.toContain('Rework approved');expect(venue.text()).toContain('Readiness not verified')
    expect(w.get('button').attributes('disabled')).toBeDefined();w.unmount()
  })
  it('TC-CS95-27 repeated identical resubmit errors permit retry without duplicate success intents',async()=>{
    const p=reworkProps(),w=await mountSuspended(SafetyReworkPanel,{props:{...p,canResubmit:true,arrangements:p.arrangements.map(a=>({...a,ready:true}))} as any})
    for(let attempt=1;attempt<=2;attempt++){
      await w.get('button').trigger('click');expect(w.emitted('resubmit')).toHaveLength(attempt)
      await w.setProps({pending:true});await w.setProps({pending:false,requestError:'Service unavailable'})
      expect(w.get('button').attributes('disabled')).toBeUndefined()
    }
    await w.get('button').trigger('click');expect(w.emitted('resubmit')).toHaveLength(3)
    await w.setProps({pending:true,requestError:''});await w.setProps({pending:false})
    await w.get('button').trigger('click');expect(w.emitted('resubmit')).toHaveLength(3);w.unmount()
  })
  it('TC-CS95-25 missing feedback or malformed round proof cannot enable rework',async()=>{
    const p=reworkProps()
    const absent=await mountSuspended(SafetyReworkPanel,{props:{...p,feedback:null,canResubmit:true} as any})
    expect(absent.find('button').exists()).toBe(false);absent.unmount()
    const malformed=await mountSuspended(SafetyReworkPanel,{props:{...p,feedback:{...p.feedback,roundId:42},canResubmit:true,arrangements:p.arrangements.map(a=>({...a,ready:true}))} as any})
    expect(malformed.get('button').attributes('disabled')).toBeDefined();malformed.unmount()
  })
  it('TC-CS95-20 marks only the affected area and retains unaffected approvals',async()=>{
    const w=await mountSuspended(SafetyReworkPanel,{props:reworkProps() as any})
    expect(w.text()).toContain('The exit is obstructed');expect(w.get('[data-rework-area="VENUE"]').text()).toContain('Needs rework')
    expect(w.get('[data-rework-area="TECHNICAL"]').text()).toContain('Approval retained');expect(w.get('[data-rework-area="EVENT_DETAILS"]').text()).toContain('Approval retained');w.unmount()
  })
  it('TC-CS95-21 does not render private Safety feedback without explicit visibility',async()=>{
    const w=await mountSuspended(SafetyReworkPanel,{props:{...reworkProps(),canViewFeedback:false} as any})
    expect(w.text()).not.toContain('The exit is obstructed');expect(w.find('[data-rework-area]').exists()).toBe(false)
    expect(w.find('button').exists()).toBe(false);w.unmount()
  })
  it('TC-CS95-22 requires explicit readiness for every affected area',async()=>{
    const p=reworkProps();p.canResubmit=true;p.feedback.affectedAreas=['VENUE','TECHNICAL']
    const w=await mountSuspended(SafetyReworkPanel,{props:p as any})
    expect(w.get('button').attributes('disabled')).toBeDefined()
    await w.setProps({arrangements:p.arrangements.map(a=>({...a,ready:true}))});expect(w.get('button').attributes('disabled')).toBeUndefined();w.unmount()
  })
  it('TC-CS95-23 refuses outdated or unknown readiness proof',async()=>{
    for(const override of [{readinessRequirementsRevision:'old-revision'},{feedback:{...reworkProps().feedback,affectedAreas:['UNREVIEWED_AREA']}}]){
      const p=reworkProps(),w=await mountSuspended(SafetyReworkPanel,{props:{...p,canResubmit:true,arrangements:p.arrangements.map(a=>({...a,ready:true})),...override} as any})
      expect(w.get('button').attributes('disabled')).toBeDefined();await w.get('button').trigger('click');expect(w.emitted('resubmit')).toBeUndefined();w.unmount()
    }
  })
  it('TC-CS95-24 emits one current resubmission intent without mutating the previous review',async()=>{
    const p=reworkProps(),original=JSON.parse(JSON.stringify(p.feedback))
    const w=await mountSuspended(SafetyReworkPanel,{props:{...p,canResubmit:true,arrangements:p.arrangements.map(a=>({...a,ready:true}))} as any})
    await w.get('button').trigger('click');await w.get('button').trigger('click')
    expect(w.emitted('resubmit')).toHaveLength(1);expect(w.emitted('resubmit')?.[0]?.[0]).toEqual({previousRoundId:'round-1',previousRound:1,requirementsRevision:'requirements-5'})
    expect(p.feedback).toEqual(original);expect(w.text()).not.toContain('Resubmitted successfully');w.unmount()
  })
})
