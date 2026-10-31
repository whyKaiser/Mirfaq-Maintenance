import { reserveResponse } from '../src/lib/model-spend-journal';
try { reserveResponse(process.argv[2]); process.stdout.write('reserved'); }
catch { process.stdout.write('blocked'); }
