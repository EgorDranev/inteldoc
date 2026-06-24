import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { InteldocState } from './types'
import { SEED } from './seed'

interface InteldocStore extends InteldocState {
  // mutators take a partial patch or a producer function
  set: (patch: Partial<InteldocState> | ((s: InteldocState) => Partial<InteldocState>)) => void
  reset: () => void
}

export const useInteldoc = create<InteldocStore>()(
  persist(
    (set) => ({
      ...SEED,
      set: (patch) =>
        set((s) =>
          typeof patch === 'function' ? { ...s, ...patch(s) } : { ...s, ...patch },
        ),
      reset: () => set({ ...SEED }),
    }),
    {
      name: 'inteldoc-demo-v1',
      storage: createJSONStorage(() => localStorage),
      version: 5,
      migrate: (persisted, version) => {
        // v1 → v2: introduce `webAuth` (mocked doctor+admin login).
        // v2 → v3: doctor cockpit additions — enriched seed (new analyses,
        // documents, complaints, plan items, appointments) plus per-record
        // fields (Patient.prepCompletedAt/prepTimeSpentMin, Complaint.priority,
        // Document.structureStatus, Analysis.ocrFieldMeta). Reset collections
        // so the seed wins on first load after upgrade. Onboarding flag and
        // currentPatientId are preserved so an in-flight patient demo isn't
        // dropped mid-session.
        if (version < 2) {
          return { ...(persisted as Partial<InteldocState>), webAuth: null }
        }
        if (version < 3) {
          const p = persisted as Partial<InteldocState>
          return {
            ...p,
            patients: SEED.patients,
            analyses: SEED.analyses,
            documents: SEED.documents,
            complaints: SEED.complaints,
            planItems: SEED.planItems,
            doctorRequests: SEED.doctorRequests,
            appointments: SEED.appointments,
            accessGrants: SEED.accessGrants,
          }
        }
        if (version < 4) {
          return { ...(persisted as Partial<InteldocState>), lastSavedAt: null }
        }
        if (version < 5) {
          // v4 → v5: Slice 4 (admin trust loop). Seed patient p1 (Мария) into
          // the doctor queue + the 20-grant A02 audit set. Reset patients +
          // accessGrants so the new seed wins; seed audit events too.
          const p = persisted as Partial<InteldocState>
          return {
            ...p,
            patients: SEED.patients,
            accessGrants: SEED.accessGrants,
            auditEvents: SEED.auditEvents,
          }
        }
        return persisted as InteldocState
      },
    },
  ),
)

// Convenience: read state outside React (e.g., from action helpers).
export const getState = () => useInteldoc.getState()
export const setState = useInteldoc.setState
