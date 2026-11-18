import {createHandler} from './handler.mjs';
const url=Deno.env.get('SUPABASE_URL');
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if(!url||!serviceKey)throw new Error('Supabase service environment is required');
Deno.serve(createHandler({url,serviceKey}));
