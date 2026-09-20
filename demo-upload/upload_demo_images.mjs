// Uploads the demo images listed in images_needed.txt to your Supabase Storage bucket "exercise-demos".
// Run this on your own computer (it needs your service role key, so never put it in the app).
//
//   1. git clone https://github.com/yuhonas/free-exercise-db
//   2. npm i @supabase/supabase-js        (in any folder; a scratch folder is fine)
//   3. SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//        node upload_demo_images.mjs ./free-exercise-db/exercises
//      (if that folder doesn't exist, look for the folder that contains e.g. Air_Bike/0.jpg, maybe dist/exercises)
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const folder = process.argv[2];
const listFile = process.argv[3] || 'images_needed.txt'; // optional: another list, e.g. images_needed_routine.txt
if (!folder || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node upload_demo_images.mjs <images-folder> [list-file]');
  process.exit(1);
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const paths = (await readFile(new URL(`./${listFile}`, import.meta.url), 'utf8')).split('\n').filter(Boolean);

let done = 0; const failed = [];
async function upload(p) {
  try {
    const buf = await readFile(path.join(folder, p));
    const { error } = await supabase.storage.from('exercise-demos').upload(p, buf, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' });
    if (error) throw error;
  } catch (e) { failed.push(`${p}: ${e.message}`); }
  if (++done % 25 === 0) console.log(`${done}/${paths.length}`);
}
for (let i = 0; i < paths.length; i += 8) await Promise.all(paths.slice(i, i + 8).map(upload));
console.log(`Done. ${paths.length - failed.length} uploaded, ${failed.length} failed.`);
if (failed.length) console.log(failed.join('\n'));
