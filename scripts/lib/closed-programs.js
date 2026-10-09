// Closure confirmed in the user's Awin account screenshot (9 October 2026).
// Scope is this Awin programme only, not Rakuten on other networks.
export const CLOSED_PROGRAMS = Object.freeze({
  awin_rakuten: Object.freeze({
    advertiser_id:'55615', name:'Rakuten FR', network:'Awin', closed_at:'2026-10-06',
  }),
});
export const isClosedProgram = programId => Object.hasOwn(CLOSED_PROGRAMS, programId);
