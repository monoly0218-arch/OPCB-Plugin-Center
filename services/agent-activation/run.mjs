import { createActivationServer } from './server.mjs';

const { OPCB_ACTIVATION_URL, OPCB_ACTIVATION_OWNER, OPCB_ACTIVATION_KEY, OPCB_ACTIVATION_DB, PORT } = process.env;
if (!OPCB_ACTIVATION_URL || !OPCB_ACTIVATION_DB || !/^[a-f0-9]{64}$/.test(OPCB_ACTIVATION_KEY ?? ''))
  throw new Error('Configure OPCB_ACTIVATION_URL, OPCB_ACTIVATION_OWNER, OPCB_ACTIVATION_KEY and OPCB_ACTIVATION_DB');

const server = createActivationServer({
  publicBase: OPCB_ACTIVATION_URL,
  owner: OPCB_ACTIVATION_OWNER,
  encryptionKey: Buffer.from(OPCB_ACTIVATION_KEY, 'hex'),
  database: OPCB_ACTIVATION_DB,
});
server.listen(Number(PORT ?? '4861'), '127.0.0.1');
