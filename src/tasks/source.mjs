export const TASK_SOURCE = '7dc199bc-755b-47bb-8f71-fe311b1f1ab1';
export function validDate(value) {
 if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
 const time = Date.parse(value+'T12:00:00Z');
 return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value;
}
