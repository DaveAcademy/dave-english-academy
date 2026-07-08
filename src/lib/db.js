// db.js
//
// Every screen in this app talks to the data through the functions in this
// file only. The actual implementation now lives in storageBridge.js and
// talks to Supabase instead of localStorage - see that file for details.

export * from './storageBridge';
