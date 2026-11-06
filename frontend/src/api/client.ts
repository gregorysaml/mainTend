import type { AssessmentSettingsInput, CreateActionInput, Dashboard, ImportResult, ImportSchema, Profile, ScenarioConfig, UpdateActionInput } from '../../../shared/types.ts';
import type { EvaluationPlan, EvaluationRun, EvaluationSummary } from '../../../shared/evaluation.ts';
import type { ActionScheduleInput } from '../../../shared/maintenance.ts';
import type { VehicleProfileInput } from '../../../shared/vehicle-profile.ts';
import type { InspectionInput } from '../../../shared/inspection.ts';
import type { CoolingInput, CoolingRun } from '../../../shared/cooling.ts';
import type { LubricationInput, LubricationRun } from '../../../shared/lubrication.ts';
async function request<T>(url:string,options?:RequestInit):Promise<T>{const response=await fetch(url,{headers:{'content-type':'application/json'},...options});const data=await response.json() as T&{error?:string};if(!response.ok)throw new Error(data.error||'Request failed');return data}
export const api={dashboard:(profile:Profile)=>request<Dashboard>(`/api/dashboard?profile=${profile}`),createAction:(input:CreateActionInput)=>request<{id:number}>('/api/actions',{method:'POST',body:JSON.stringify(input)}),updateAction:(id:number,input:UpdateActionInput)=>request<{ok:true}>(`/api/actions/${id}`,{method:'PATCH',body:JSON.stringify(input)}),importSchema:()=>request<ImportSchema>('/api/import/schema'),previewImport:(input:unknown)=>request<ImportResult>('/api/import/preview',{method:'POST',body:JSON.stringify(input)}),importObservations:(input:unknown)=>request<ImportResult>('/api/import',{method:'POST',body:JSON.stringify(input)}),updateSettings:(input:AssessmentSettingsInput)=>request<ScenarioConfig>('/api/config',{method:'PATCH',body:JSON.stringify(input)})};
export const evaluationApi = {
  plan: (profile: Profile) => request<EvaluationPlan>(`/api/evaluations/plan?profile=${profile}`),
  history: (profile: Profile) => request<EvaluationSummary[]>(`/api/evaluations?profile=${profile}`),
  run: (profile: Profile) => request<EvaluationRun>('/api/evaluations', { method: 'POST', body: JSON.stringify({ profile }) }),
  get: (id: string, profile: Profile) => request<EvaluationRun>(`/api/evaluations/${id}?profile=${profile}`),
  note: (id: string, profile: Profile, text: string) => request<EvaluationRun>(`/api/evaluations/${id}/notes?profile=${profile}`, { method: 'POST', body: JSON.stringify({ text }) }),
};
export const maintenanceApi = {
  inspect: (id: number, input: InspectionInput) => request<{ id: number }>(`/api/actions/${id}/inspections`, { method: 'POST', body: JSON.stringify(input) }),
  schedule: (id: number, input: ActionScheduleInput) => request<{ ok: true }>(`/api/actions/${id}/schedule`, { method: 'PATCH', body: JSON.stringify(input) }),
};
export const vehicleApi = { save: (id: string, input: VehicleProfileInput) => request<{ ok: true }>(`/api/vehicles/${id}/profile`, { method: 'PATCH', body: JSON.stringify(input) }) };
export const coolingApi = {
  run: (input: CoolingInput) => request<CoolingRun>('/api/cooling/runs', { method: 'POST', body: JSON.stringify(input) }),
  read: (id: string, profile: Profile) => request<{ ok: true }>(`/api/cooling/runs/${id}/read`, { method: 'POST', body: JSON.stringify({ profile }) }),
};
export const lubricationApi = {
  run: (input: LubricationInput) => request<LubricationRun>('/api/lubrication/runs', { method: 'POST', body: JSON.stringify(input) }),
  read: (id: string, profile: Profile) => request<{ ok: true }>(`/api/lubrication/runs/${id}/read`, { method: 'POST', body: JSON.stringify({ profile }) }),
};
