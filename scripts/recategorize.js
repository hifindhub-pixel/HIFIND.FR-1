// Classification revision: 2026-10-02 (Montessori and sports audio).
// Reclassify existing offers without changing prices, URLs or price observation dates.
// Writes a reversible change manifest before any UPDATE, then commits atomically.
import pg from 'pg';
import { writeFile, mkdir } from 'node:fs/promises';
import { reconcileCategories } from './lib/category-consensus.js';
import { categorize } from './lib/categorize.js';
const client = new pg.Client({connectionString:process.env.NEON_URL,connectionTimeoutMillis:15000});
await mkdir('category-report',{recursive:true});
let transaction = false;
try {
  await client.connect();
  const {rows} = await client.query('SELECT id,title,description,category,ean,brand FROM products ORDER BY id');
  const changes=[], unresolved=[], transitions={};
  const decisions=reconcileCategories(rows, rows.map(categorize));
  for(const [i,p] of rows.entries()){
    const result=decisions[i];
    if(result.category==='autres'){unresolved.push({id:p.id,title:p.title,category:p.category});continue;}
    if(result.category===p.category)continue;
    changes.push({id:p.id,title:p.title,previous:p.category,category:result.category,source:result.source});
    const key=`${p.category} -> ${result.category}`;transitions[key]=(transitions[key]||0)+1;
  }
  await writeFile('category-report/changes.json',JSON.stringify(changes));
  await writeFile('category-report/unresolved.json',JSON.stringify(unresolved));
  console.log(JSON.stringify({scanned:rows.length,changes:changes.length,unresolved:unresolved.length,transitions},null,2));
  for(const key of Object.keys(transitions)) console.log('EXAMPLES '+key+': '+JSON.stringify(changes.filter(c=>`${c.previous} -> ${c.category}`===key).slice(0,4)));
  if(process.argv.includes('--apply')){
    await client.query('BEGIN');transaction=true;
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    let updated=0;
    for(let i=0;i<changes.length;i+=200){
      const batch=changes.slice(i,i+200);
      const r=await client.query(`UPDATE products p SET category=v.category
        FROM jsonb_to_recordset($1::jsonb) AS v(id text, previous text, category text)
        WHERE p.id=v.id AND p.category IS NOT DISTINCT FROM v.previous`,[JSON.stringify(batch)]);
      updated+=r.rowCount;
    }
    await client.query('COMMIT');transaction=false;
    console.log('COMMITTED '+updated+' category corrections; price timestamps unchanged.');
  }
}catch(e){
  if(transaction)await client.query('ROLLBACK');
  console.error('Reclassification failed; transaction rolled back:',e.message);process.exitCode=1;
}finally{await client.end();}
