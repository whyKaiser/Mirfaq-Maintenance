import app from '../src/app';

// Run with Node --env-file=.env.local from this backend directory.
// Spending remains disabled unless explicitly enabled for the authorized run.
if (process.env.NODE_ENV === 'production' || process.env.MIRFAQ_AGENT_DEMO_ONLY !== '1') throw new Error('demo_environment_required');
const port = Number(process.env.PORT || '5000');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('invalid_demo_port');
app.listen(port, '127.0.0.1', () => console.log(`Local demo API listening on ${port}`));
